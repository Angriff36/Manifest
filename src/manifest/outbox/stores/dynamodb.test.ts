/**
 * Mock-based unit tests for DynamoDBOutboxStore.
 * Injects a fake DocumentClient — no live AWS required.
 */

import { describe, it, expect } from 'vitest';
import { DynamoDBOutboxStore } from './dynamodb';
import type { OutboxEntry } from '../outbox-store';
import type { EmittedEvent } from '../../runtime-engine';

function event(name: string): EmittedEvent {
  return { name, channel: name.toLowerCase(), payload: {}, timestamp: 0 };
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    entryId: 'e1',
    enqueuedAt: 100,
    event: event('Default'),
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

type Sent = { name: string; input: Record<string, unknown> };

function makeFakeClient(scanItems: Record<string, unknown>[] = []) {
  const sent: Sent[] = [];

  class TransactWriteCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class ScanCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class UpdateCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  const client = {
    TransactWriteCommand,
    ScanCommand,
    UpdateCommand,
    async send(cmd: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = cmd.constructor.name;
      sent.push({ name, input: cmd.input });
      if (name === 'ScanCommand') {
        return { Items: scanItems };
      }
      if (name === 'UpdateCommand') {
        const item = scanItems[0];
        return {
          Attributes: {
            ...item,
            attempts: Number(item?.attempts ?? 0) + 1,
            claimed_at: 1,
          },
        };
      }
      return {};
    },
  };

  return { client, sent };
}

describe('DynamoDBOutboxStore — injected client', () => {
  it('enqueues via TransactWrite Put with idempotency condition', async () => {
    const { client, sent } = makeFakeClient();
    const store = new DynamoDBOutboxStore({ client });
    await store.enqueue([entry({ entryId: 'a', event: event('Created') })]);

    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe('TransactWriteCommand');
    const items = sent[0].input.TransactItems as { Put: Record<string, unknown> }[];
    expect(items[0].Put.TableName).toBe('manifest_outbox_table');
    expect(items[0].Put.ConditionExpression).toBe('attribute_not_exists(#pk)');
    expect((items[0].Put.Item as { entry_id: string }).entry_id).toBe('a');
  });

  it('is a no-op for empty enqueue', async () => {
    const { client, sent } = makeFakeClient();
    const store = new DynamoDBOutboxStore({ client });
    await store.enqueue([]);
    expect(sent).toHaveLength(0);
  });

  it('claims with Scan + conditional Update', async () => {
    const scanItems = [
      {
        entry_id: 'a',
        enqueued_at: 100,
        event: event('A'),
        status: 'pending',
        attempts: 0,
        last_error: null,
      },
    ];
    const { client, sent } = makeFakeClient(scanItems);
    const store = new DynamoDBOutboxStore({ client });
    const claimed = await store.claim(1);

    expect(claimed[0].entryId).toBe('a');
    expect(claimed[0].attempts).toBe(1);
    expect(sent.map((s) => s.name)).toEqual(['ScanCommand', 'UpdateCommand']);
    expect(sent[0].input.FilterExpression).toBe('#st = :pending');
  });

  it('markDelivered / markFailed issue TransactWrite updates', async () => {
    const { client, sent } = makeFakeClient();
    const store = new DynamoDBOutboxStore({ client });
    await store.markDelivered(['a']);
    await store.markFailed(['b'], 'boom');

    expect(sent).toHaveLength(2);
    const delivered = sent[0].input.TransactItems as { Update: { UpdateExpression: string } }[];
    const failed = sent[1].input.TransactItems as { Update: { UpdateExpression: string } }[];
    expect(delivered[0].Update.UpdateExpression).toContain(':delivered');
    expect(failed[0].Update.UpdateExpression).toContain(':failed');
  });
});
