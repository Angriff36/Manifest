/**
 * MongoDBOutboxStore — MongoDB implementation of the OutboxStore contract.
 *
 * Uses MongoDB's `findOneAndUpdate` with atomic filter conditions to simulate
 * the `SELECT … FOR UPDATE SKIP LOCKED` semantics used by the PostgreSQL
 * adapter. Change streams on the outbox collection enable reactive dispatch.
 *
 * 'mongodb' is an optional peer dependency. It is loaded via dynamic import
 * at construction time. If the package is not installed, a clear error is
 * thrown.
 *
 * Transaction support: the `tx` parameter in `enqueue` accepts a MongoDB
 * `ClientSession` for transactional outbox pattern — state mutation and
 * event persistence share the same session/transaction boundary.
 */

import type { OutboxEntry, OutboxStore } from '../outbox-store';

export interface MongoDBOutboxStoreConfig {
  /** Required unless `collection` is injected. */
  connectionString?: string;
  databaseName?: string;
  collectionName?: string;
  /**
   * Pre-initialized collection handle. When set, skips `mongodb` import and
   * connect — used by unit tests and hosts that own the client lifecycle.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection?: any;
}

export interface MongoDBOutboxStoreOptions {
  /** Provide a stable id generator for entries that arrive without one. */
  generateId?: () => string;
  /** Wall-clock function for timestamps. Defaults to Date.now. */
  now?: () => number;
}

export class MongoDBOutboxStore implements OutboxStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private collection!: any;
  private collectionName: string;
  private databaseName: string;
  private generateId: () => string;
  private now: () => number;
  private ready: Promise<void> | undefined;
  private readonly initConfig: MongoDBOutboxStoreConfig;

  constructor(config: MongoDBOutboxStoreConfig, opts: MongoDBOutboxStoreOptions = {}) {
    this.collectionName = config.collectionName || '_manifest_outbox';
    this.databaseName = config.databaseName || 'manifest';
    this.generateId = opts.generateId ?? (() => crypto.randomUUID());
    this.now = opts.now ?? (() => Date.now());
    this.initConfig = config;
    // Defer async mongodb load until first use (Sonar S7059).
  }

  private async init(config: MongoDBOutboxStoreConfig): Promise<void> {
    if (config.collection) {
      this.collection = config.collection;
      return;
    }

    if (!config.connectionString) {
      throw new Error('MongoDBOutboxStore requires connectionString or an injected collection.');
    }

    let MongoClient: unknown;
    try {
      // 'mongodb' is an optional peer dependency, resolved at runtime via dynamic import; its absence is handled by the catch below.
      const mod = await import('mongodb');
      MongoClient = mod.MongoClient;
    } catch {
      throw new Error(
        `MongoDBOutboxStore requires 'mongodb' to be installed.\n` + `Run: npm install mongodb`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new (MongoClient as any)(config.connectionString);
    await this.client.connect();
    const db = this.client.db(this.databaseName);
    this.collection = db.collection(this.collectionName);

    // Ensure indexes for efficient claim queries
    await this.collection.createIndex({ entryId: 1 }, { unique: true });
    await this.collection.createIndex({ status: 1, claimed: 1 });
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.init(this.initConfig);
    }
    return this.ready;
  }

  async enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void> {
    await this.ensureReady();
    if (entries.length === 0) return;

    const docs = entries.map((entry) => ({
      entryId: entry.entryId ?? this.generateId(),
      enqueuedAt: entry.enqueuedAt ?? this.now(),
      event: entry.event,
      status: entry.status ?? 'pending',
      attempts: entry.attempts ?? 0,
      claimed: false,
      lastError: entry.lastError,
    }));

    // Use session for transactional outbox if provided
    const options: Record<string, unknown> = { ordered: false };
    if (tx) {
      options.session = tx;
    }

    try {
      await this.collection.insertMany(docs, options);
    } catch (err: unknown) {
      // Ignore duplicate key errors (idempotent enqueue)
      const mongoErr = err as { code?: number };
      if (mongoErr.code !== 11000) throw err;
    }
  }

  async claim(batchSize: number): Promise<OutboxEntry[]> {
    await this.ensureReady();
    if (batchSize <= 0) return [];

    const claimedAt = this.now();
    const out: OutboxEntry[] = [];

    // Atomically claim entries one at a time using findOneAndUpdate.
    // This is analogous to PostgreSQL's SELECT … FOR UPDATE SKIP LOCKED.
    for (let i = 0; i < batchSize; i++) {
      const result = await this.collection.findOneAndUpdate(
        { status: 'pending', claimed: false },
        {
          $set: { claimed: true, claimedAt },
          $inc: { attempts: 1 },
        },
        { returnDocument: 'after' },
      );

      if (!result) break;
      out.push(this.docToEntry(result));
    }

    return out;
  }

  async markDelivered(entryIds: string[]): Promise<void> {
    await this.ensureReady();
    if (entryIds.length === 0) return;

    const deliveredAt = this.now();
    await this.collection.updateMany(
      { entryId: { $in: entryIds } },
      { $set: { status: 'delivered', claimed: false, deliveredAt } },
    );
  }

  async markFailed(entryIds: string[], error: string): Promise<void> {
    await this.ensureReady();
    if (entryIds.length === 0) return;

    const failedAt = this.now();
    await this.collection.updateMany(
      { entryId: { $in: entryIds } },
      { $set: { status: 'failed', claimed: false, lastError: error, failedAt } },
    );
  }

  /**
   * Start watching the outbox collection for new entries via MongoDB change
   * streams. Returns a change stream that emits 'insert' events for reactive
   * dispatch.
   *
   * This is NOT part of the OutboxStore contract — it's a MongoDB-specific
   * utility for consumers that want push-based event dispatch instead of
   * polling with `claim()`.
   *
   * Requires a MongoDB replica set or sharded cluster.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async watch(): Promise<any> {
    await this.ensureReady();
    return this.collection.watch([{ $match: { operationType: 'insert' } }], {
      fullDocument: 'updateLookup',
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  private docToEntry(doc: Record<string, unknown>): OutboxEntry {
    const entry: OutboxEntry = {
      entryId: doc.entryId as string,
      enqueuedAt: doc.enqueuedAt as number,
      event: doc.event as OutboxEntry['event'],
      status: doc.status as OutboxEntry['status'],
      attempts: doc.attempts as number,
    };
    if (doc.lastError !== undefined) entry.lastError = doc.lastError as string;
    return entry;
  }
}
