/**
 * HTTP partner deliverer for outbox entries.
 *
 * Binding: outbound event → `POST` URL is **not** a Manifest `webhook` decl
 * (webhooks are inbound only). Hosts wire this into `runOutboxWorker` /
 * `drainOutboxOnce` with a per-event URL map.
 *
 * Delivery is at-least-once; partners MUST dedupe on `entryId`.
 */

import { createHmac } from 'node:crypto';
import type { OutboxEntry } from './outbox-store';
import type { OutboxDeliver } from './worker';

/** Wildcard route key used when no event-specific URL is configured. */
export const HTTP_PARTNER_DEFAULT_ROUTE = '*';

export interface HttpPartnerDelivererOptions {
  /**
   * Event name → absolute HTTPS/HTTP URL.
   * Optional `*` key is the fallback when the event name is unmapped.
   */
  routes: Record<string, string>;
  /** Extra request headers (merged under Content-Type / Manifest headers). */
  headers?: Record<string, string>;
  /**
   * When set, sends `X-Manifest-Signature: sha256=<hex>` over the raw body
   * (HMAC-SHA256). Partners verify with the same secret.
   */
  hmacSecret?: string;
  /** Injected fetch (tests). Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Abort slow partner calls (ms). Default: 30_000. */
  timeoutMs?: number;
}

export interface HttpPartnerRequestBody {
  entryId: string;
  enqueuedAt: number;
  event: OutboxEntry['event'];
}

/**
 * Resolves partner URLs and POSTs outbox payloads.
 * Use {@link HttpPartnerDeliverer.asDeliver} with the outbox worker.
 */
export class HttpPartnerDeliverer {
  private readonly routes: Record<string, string>;
  private readonly headers: Record<string, string>;
  private readonly hmacSecret: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpPartnerDelivererOptions) {
    if (!options.routes || Object.keys(options.routes).length === 0) {
      throw new Error('HttpPartnerDeliverer requires at least one route');
    }
    this.routes = { ...options.routes };
    this.headers = { ...(options.headers ?? {}) };
    this.hmacSecret = options.hmacSecret;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** Bound {@link OutboxDeliver} for `runOutboxWorker` / `drainOutboxOnce`. */
  asDeliver(): OutboxDeliver {
    return (entry) => this.deliver(entry);
  }

  resolveUrl(eventName: string): string {
    const exact = this.routes[eventName];
    if (exact) return exact;
    const fallback = this.routes[HTTP_PARTNER_DEFAULT_ROUTE];
    if (fallback) return fallback;
    throw new Error(`NO_PARTNER_ROUTE: ${eventName}`);
  }

  async deliver(entry: OutboxEntry): Promise<void> {
    const url = this.resolveUrl(entry.event.name);
    const body: HttpPartnerRequestBody = {
      entryId: entry.entryId,
      enqueuedAt: entry.enqueuedAt,
      event: entry.event,
    };
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-manifest-entry-id': entry.entryId,
      'x-manifest-event': entry.event.name,
      ...this.headers,
    };
    if (this.hmacSecret) {
      const digest = createHmac('sha256', this.hmacSecret).update(raw).digest('hex');
      headers['x-manifest-signature'] = `sha256=${digest}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers,
        body: raw,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await safeResponseText(response);
        throw new Error(
          `PARTNER_HTTP_${response.status}: ${entry.event.name}${detail ? ` ${detail}` : ''}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Factory returning an {@link OutboxDeliver} callback. */
export function createHttpPartnerDeliverer(options: HttpPartnerDelivererOptions): OutboxDeliver {
  return new HttpPartnerDeliverer(options).asDeliver();
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}
