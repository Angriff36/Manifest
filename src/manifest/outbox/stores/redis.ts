/**
 * RedisOutboxStore — Redis Streams implementation of the OutboxStore contract.
 *
 * Uses Redis Streams (XADD, XREADGROUP, XACK) for durable event queuing with
 * consumer group support. Streams provide built-in persistence, delivery tracking,
 * and consumer group semantics similar to Kafka.
 *
 * 'ioredis' is an optional peer dependency. It is loaded via dynamic import
 * at construction time. If the package is not installed, a clear error is
 * thrown.
 *
 * Transaction support: the `tx` parameter in `enqueue` accepts a Redis
 * pipeline for transactional outbox pattern — state mutation and event
 * persistence can be batched together.
 *
 * Stream naming: Entries are stored in a stream keyed by the entity name
 * prefixed with the configured key prefix (default: 'manifest:outbox:').
 *
 * Consumer groups: Creates a consumer group named 'manifest-dispatcher' on
 * first use. Multiple dispatcher workers can join this group for parallel
 * delivery with automatic load balancing.
 */

import type { OutboxEntry, OutboxStore } from '../outbox-store';

export interface RedisOutboxStoreConfig {
  /** Redis connection URL (redis://user:pass@host:port/db or rediss:// for TLS) */
  url?: string;
  /** Redis host (alternative to url) */
  host?: string;
  /** Redis port (alternative to url) */
  port?: number;
  /** Redis database number (0-15) */
  db?: number;
  /** Redis password */
  password?: string;
  /** Stream key prefix (default: 'manifest:outbox:') */
  keyPrefix?: string;
  /** Consumer group name (default: 'manifest-dispatcher') */
  consumerGroup?: string;
  /** Consumer name for this instance (default: 'dispatcher-{random}') */
  consumerName?: string;
  /** Connection timeout in milliseconds (default: 10000) */
  connectTimeout?: number;
}

export interface RedisOutboxStoreOptions {
  /** Provide a stable id generator for entries that arrive without one. */
  generateId?: () => string;
  /** Wall-clock function for timestamps. Defaults to Date.now. */
  now?: () => number;
}

export class RedisOutboxStore implements OutboxStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client!: any;
  private keyPrefix: string;
  private consumerGroup: string;
  private consumerName: string;
  private generateId: () => string;
  private now: () => number;
  private ready: Promise<void>;
  private streamKey: string;

  constructor(config: RedisOutboxStoreConfig = {}, opts: RedisOutboxStoreOptions = {}) {
    this.keyPrefix = config.keyPrefix ?? 'manifest:outbox:';
    this.consumerGroup = config.consumerGroup ?? 'manifest-dispatcher';
    this.consumerName = config.consumerName ?? `dispatcher-${Math.random().toString(36).slice(2)}`;
    this.generateId = opts.generateId ?? (() => crypto.randomUUID());
    this.now = opts.now ?? (() => Date.now());
    this.streamKey = `${this.keyPrefix}entries`;
    this.ready = this.init(config);
  }

  private async init(config: RedisOutboxStoreConfig): Promise<void> {
    let Redis: unknown;
    try {
      // @ts-ignore -- 'ioredis' is an optional peer dependency, resolved at runtime via dynamic import; its absence is handled by the catch below.
      const mod = await import('ioredis');
      Redis = mod.Redis;
    } catch {
      throw new Error(
        `RedisOutboxStore requires 'ioredis' to be installed.\n` +
        `Run: npm install ioredis`
      );
    }

    const options: Record<string, unknown> = {
      connectTimeout: config.connectTimeout ?? 10000,
      db: config.db ?? 0,
    };

    if (config.password) {
      options.password = config.password;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new (Redis as any)(config.url ?? {
      host: config.host ?? 'localhost',
      port: config.port ?? 6379,
      ...options,
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', resolve);
      this.client.once('error', reject);
    });

    // Create consumer group if it doesn't exist
    try {
      await this.client.xgroup_create(
        this.streamKey,
        this.consumerGroup,
        '0',
        { MKSTREAM: true }
      );
    } catch (err: unknown) {
      // Ignore BUSYGROUP error — group already exists
      const redisErr = err as { message?: string };
      if (redisErr.message && !redisErr.message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  async enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void> {
    await this.ensureReady();
    if (entries.length === 0) return;

    const pipeline = tx ?? this.client;

    for (const entry of entries) {
      const entryId = entry.entryId ?? this.generateId();
      const enqueuedAt = entry.enqueuedAt ?? this.now();
      const status = entry.status ?? 'pending';
      const attempts = entry.attempts ?? 0;

      // Add entry to stream as a field-value map
      const fields: Record<string, string> = {
        entryId,
        enqueuedAt: enqueuedAt.toString(),
        event: JSON.stringify(entry.event),
        status,
        attempts: attempts.toString(),
      };

      if (entry.lastError) {
        fields.lastError = entry.lastError;
      }

      // XADD returns the new entry ID (stream-specific, not our entryId)
      await pipeline.xadd(this.streamKey, '*', fields);
    }

    // If we're using a pipeline (not a transaction), flush it
    if (!tx && pipeline !== this.client && typeof pipeline.exec === 'function') {
      await pipeline.exec();
    }
  }

  async claim(batchSize: number): Promise<OutboxEntry[]> {
    await this.ensureReady();
    if (batchSize <= 0) return [];

    const now = this.now();
    const out: OutboxEntry[] = [];

    // Use XREADGROUP to claim entries for this consumer
    // BLOCK 0 for non-blocking read, COUNT for batch size
    const results = await this.client.xreadgroup(
      'GROUP',
      this.consumerGroup,
      this.consumerName,
      'COUNT',
      batchSize,
      'BLOCK',
      0,
      'STREAMS',
      this.streamKey,
      '>' // '>' means new entries not yet delivered to other consumers
    );

    if (!results || results.length === 0) return [];

    // Parse results: XREADGROUP returns [[streamName, [[entryId, fields...]]]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const result of results) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [streamId, entries] of result) {
        if (streamId === this.streamKey) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const [id, fields] of entries) {
            out.push(this.streamFieldsToEntry(id, fields as Record<string, string>));
          }
        }
      }
    }

    // Update claimed status atomically
    for (const entry of out) {
      // Store the stream entry ID for ACK
      (entry as any)._streamId = entry.entryId;
      // In our implementation, we update the attempts field on claim
      // The stream is immutable, so we use a separate hash for mutable state
      await this.client.hset(
        `${this.keyPrefix}state:${entry.entryId}`,
        'claimedAt',
        now.toString(),
        'attempts',
        (entry.attempts + 1).toString()
      );
    }

    return out;
  }

  async markDelivered(entryIds: string[]): Promise<void> {
    await this.ensureReady();
    if (entryIds.length === 0) return;

    // Get stream IDs from state hash
    const streamIds: string[] = [];
    for (const entryId of entryIds) {
      const state = await this.client.hgetall(`${this.keyPrefix}state:${entryId}`);
      if (state._streamId) {
        streamIds.push(state._streamId);
      }
      // Clean up state hash
      await this.client.del(`${this.keyPrefix}state:${entryId}`);
    }

    // ACK entries in the stream
    if (streamIds.length > 0) {
      await this.client.xack(this.streamKey, this.consumerGroup, ...streamIds);
    }
  }

  async markFailed(entryIds: string[], error: string): Promise<void> {
    await this.ensureReady();
    if (entryIds.length === 0) return;

    // Update state hash with error info
    for (const entryId of entryIds) {
      await this.client.hset(
        `${this.keyPrefix}state:${entryId}`,
        'status',
        'failed',
        'lastError',
        error
      );
    }
  }

  /**
   * Release stale claims for entries that were claimed but never marked
   * delivered/failed (e.g., dispatcher crash). This allows other consumers
   * to re-claim them.
   */
  async releaseStaleClaims(entryIds: string[]): Promise<void> {
    await this.ensureReady();
    if (entryIds.length === 0) return;

    for (const entryId of entryIds) {
      await this.client.hdel(`${this.keyPrefix}state:${entryId}`, 'claimedAt');
    }
  }

  /**
   * Get the current length of the outbox stream.
   * Useful for monitoring and backlog tracking.
   */
  async getLength(): Promise<number> {
    await this.ensureReady();
    return await this.client.xlen(this.streamKey);
  }

  /**
   * Get pending entries info for the consumer group.
   * Returns the number of entries pending delivery per consumer.
   */
  async getPendingInfo(): Promise<Record<string, number>> {
    await this.ensureReady();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info: any = await this.client.xinfo('CONSUMERS', this.streamKey, this.consumerGroup);
    const result: Record<string, number> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const consumer of info) {
      const name = consumer.name as string;
      const pending = consumer.pending as number;
      result[name] = pending;
    }

    return result;
  }

  /**
   * Trim the stream to keep only the last N entries.
   * Use for storage management — old delivered entries can be trimmed.
   */
  async trim(maxLength: number): Promise<number> {
    await this.ensureReady();
    return await this.client.xtrim(this.streamKey, 'MAXLEN', '~', maxLength);
  }

  async close(): Promise<void> {
    await this.ready;
    await this.client.quit();
  }

  private streamFieldsToEntry(
    streamId: string,
    fields: Record<string, string>
  ): OutboxEntry {
    const entry: OutboxEntry = {
      entryId: fields.entryId,
      enqueuedAt: Number(fields.enqueuedAt),
      event: JSON.parse(fields.event) as OutboxEntry['event'],
      status: fields.status as OutboxEntry['status'],
      attempts: Number(fields.attempts),
    };
    if (fields.lastError) {
      entry.lastError = fields.lastError;
    }
    // Store stream ID for later ACK
    (entry as any)._streamId = streamId;
    return entry;
  }

  /**
   * Get the underlying Redis client for advanced operations.
   * Use with caution — direct manipulation bypasses the OutboxStore abstraction.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRawClient(): any {
    return this.client;
  }
}
