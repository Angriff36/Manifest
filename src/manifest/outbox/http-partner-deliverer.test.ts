/**
 * Unit tests for HttpPartnerDeliverer — outbound event → POST URL adapter.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  HttpPartnerDeliverer,
  createHttpPartnerDeliverer,
  HTTP_PARTNER_DEFAULT_ROUTE,
} from './http-partner-deliverer';
import type { OutboxEntry } from './outbox-store';
import type { EmittedEvent } from '../runtime-engine';
import { drainOutboxOnce } from './worker';
import { MemoryOutboxStore } from './stores/memory';

function makeEvent(name: string): EmittedEvent {
  return {
    name,
    channel: name.toLowerCase(),
    payload: { ok: true },
    timestamp: 1_700_000_000_000,
  };
}

function makeEntry(id: string, eventName: string): OutboxEntry {
  return {
    entryId: id,
    enqueuedAt: 10,
    event: makeEvent(eventName),
    status: 'pending',
    attempts: 0,
  };
}

function mockResponse(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

describe('HttpPartnerDeliverer', () => {
  it('POSTs JSON body with Manifest headers to the event route', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return mockResponse(204);
    });

    const deliverer = new HttpPartnerDeliverer({
      routes: { OrderPlaced: 'https://partner.example/hooks/orders' },
      fetchFn: fetchFn as typeof fetch,
      headers: { authorization: 'Bearer tok' },
    });

    await deliverer.deliver(makeEntry('e1', 'OrderPlaced'));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://partner.example/hooks/orders');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-manifest-entry-id']).toBe('e1');
    expect(headers['x-manifest-event']).toBe('OrderPlaced');
    expect(headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      entryId: 'e1',
      enqueuedAt: 10,
      event: makeEvent('OrderPlaced'),
    });
  });

  it('falls back to the * route when event is unmapped', async () => {
    const fetchFn = vi.fn(async () => mockResponse(200));
    const deliverer = new HttpPartnerDeliverer({
      routes: { [HTTP_PARTNER_DEFAULT_ROUTE]: 'https://partner.example/hooks/all' },
      fetchFn: fetchFn as typeof fetch,
    });
    await deliverer.deliver(makeEntry('e2', 'Anything'));
    expect(fetchFn).toHaveBeenCalledWith(
      'https://partner.example/hooks/all',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws NO_PARTNER_ROUTE when no route matches', async () => {
    const deliverer = new HttpPartnerDeliverer({
      routes: { OrderPlaced: 'https://partner.example/hooks/orders' },
      fetchFn: vi.fn() as unknown as typeof fetch,
    });
    await expect(deliverer.deliver(makeEntry('e3', 'Other'))).rejects.toThrow(
      'NO_PARTNER_ROUTE: Other',
    );
  });

  it('rejects constructor with empty routes', () => {
    expect(() => new HttpPartnerDeliverer({ routes: {} })).toThrow(
      'HttpPartnerDeliverer requires at least one route',
    );
  });

  it('signs the body when hmacSecret is set', async () => {
    const secret = 'partner-secret';
    let raw = '';
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      raw = String(init?.body ?? '');
      return mockResponse(200);
    });
    const deliverer = new HttpPartnerDeliverer({
      routes: { Ping: 'https://partner.example/ping' },
      hmacSecret: secret,
      fetchFn: fetchFn as typeof fetch,
    });
    await deliverer.deliver(makeEntry('sig1', 'Ping'));
    const headers = (fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    expect(headers['x-manifest-signature']).toBe(`sha256=${expected}`);
  });

  it('throws PARTNER_HTTP_<status> on non-2xx', async () => {
    const deliverer = new HttpPartnerDeliverer({
      routes: { Boom: 'https://partner.example/boom' },
      fetchFn: vi.fn(async () => mockResponse(502, 'nope')) as typeof fetch,
    });
    await expect(deliverer.deliver(makeEntry('e4', 'Boom'))).rejects.toThrow(
      'PARTNER_HTTP_502: Boom',
    );
  });

  it('createHttpPartnerDeliverer wires into drainOutboxOnce', async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue([makeEntry('w1', 'OrderPlaced')]);
    const fetchFn = vi.fn(async () => mockResponse(204));
    const deliver = createHttpPartnerDeliverer({
      routes: { OrderPlaced: 'https://partner.example/orders' },
      fetchFn: fetchFn as typeof fetch,
    });
    const result = await drainOutboxOnce(store, deliver);
    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
