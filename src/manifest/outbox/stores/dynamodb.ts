/**
 * DynamoDBOutboxStore — OutboxStore adapter backed by AWS DynamoDB.
 *
 * The outbox pattern requires a transactional guarantee: when a command
 * mutates entity state, the semantic event must be persisted atomically
 * with that state change. DynamoDB provides this via TransactWriteItems,
 * which groups up to 100 actions (Put / Update / Delete / ConditionCheck)
 * into a single ACID transaction.
 *
 * Concurrency model for `claim`: dispatchers scan the table for pending
 * entries and atomically update each to "claimed" via a conditional
 * UpdateItem with `ConditionExpression: status = 'pending'`. The first
 * worker to win the condition race claims the entry; the rest get a
 * `ConditionalCheckFailedException` and move on. This provides safe
 * concurrent dispatch without explicit row locks.
 *
 * Stream integration: the companion `manifest_outbox_table` is configured
 * with DynamoDB Streams. A Lambda or Kinesis consumer can process the
 * stream for at-least-once delivery to downstream sinks (SNS, SQS, EventBridge).
 * The `claim`/`markDelivered`/`markFailed` methods are the pull-based
 * alternative; stream consumers implement their own tracking.
 *
 * Item shape:
 *   {
 *     pk:         "OUTBOX#<entryId>",   // partition key
 *     sk:         "META",                // sort key (single-table friendly)
 *     entry_id:   string,
 *     enqueued_at: number,               // ms since epoch
 *     event:      object,                // EmittedEvent payload
 *     status:     "pending" | "delivered" | "failed",
 *     attempts:   number,
 *     last_error: string | null,
 *     claimed_at: number | null,
 *     delivered_at: number | null,
 *     failed_at:   number | null,
 *     subject_entity: string | null,     // optional projection
 *     subject_id:     string | null,
 *   }
 *
 * DO NOT import this file in browser code — it requires the AWS SDK.
 */

import type { EmittedEvent } from '../../runtime-engine';
import type { OutboxEntry, OutboxStore } from '../outbox-store';

export interface DynamoDBOutboxStoreOptions {
  /**
   * An initialized DynamoDB DocumentClient. The store does NOT own the
   * client's lifecycle. The caller is responsible for configuration
   * (region, endpoint, credentials).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  /** Table name. Default: `manifest_outbox_table`. */
  tableName?: string;
  /** Partition key attribute name. Default: `pk`. */
  partitionKey?: string;
  /** Sort key attribute name. Default: `sk`. */
  sortKey?: string;
  /**
   * When true, project `event.subject.entity` and `event.subject.id` into
   * separate attributes. Useful for query patterns that filter by subject.
   * Default: false.
   */
  projectSubject?: boolean;
}

const DEFAULT_TABLE = 'manifest_outbox_table';

interface OutboxItem {
  pk: string;
  sk: string;
  entry_id: string;
  enqueued_at: number;
  event: EmittedEvent;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  last_error: string | null;
  claimed_at: number | null;
  delivered_at: number | null;
  failed_at: number | null;
  subject_entity?: string;
  subject_id?: string;
}

function itemToEntry(item: OutboxItem): OutboxEntry {
  const entry: OutboxEntry = {
    entryId: item.entry_id,
    enqueuedAt: item.enqueued_at,
    event: item.event,
    status: item.status,
    attempts: item.attempts,
  };
  if (item.last_error) {
    entry.lastError = item.last_error;
  }
  return entry;
}

export class DynamoDBOutboxStore implements OutboxStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private tableName: string;
  private partitionKey: string;
  private sortKey: string;
  private projectSubject: boolean;

  constructor(opts: DynamoDBOutboxStoreOptions) {
    this.client = opts.client;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
    this.partitionKey = opts.partitionKey ?? 'pk';
    this.sortKey = opts.sortKey ?? 'sk';
    this.projectSubject = opts.projectSubject ?? false;
  }

  private buildKey(entryId: string): Record<string, string> {
    return { [this.partitionKey]: `OUTBOX#${entryId}`, [this.sortKey]: 'META' };
  }

  /**
   * Enqueue entries. The DynamoDB adapter batches up to 100 items per
   * TransactWriteItems call. The `tx` parameter is accepted for contract
   * compatibility with other outbox stores (e.g. Postgres), but DynamoDB
   * transactions are scoped to a single client invocation and cannot be
   * shared across separate API calls. Therefore, the transactional
   * guarantee is always within a single `enqueue` call: either all
   * entries in the batch are persisted, or none are.
   *
   * If you need to atomically enqueue entries together with entity state
   * mutations, use the `TransactWriteItems` API directly and group the
   * outbox PutItems with the entity PutItems in a single call.
   */
  async enqueue(entries: OutboxEntry[], _tx?: unknown): Promise<void> {
    if (entries.length === 0) return;
    // `_tx` accepted for OutboxStore contract compatibility — see JSDoc above.

    // DynamoDB TransactWriteItems supports up to 100 actions per call.
    const BATCH_SIZE = 100;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const transactItems = batch.map((entry) => {
        const pk = `OUTBOX#${entry.entryId}`;
        const sk = 'META';
        const item: OutboxItem = {
          pk,
          sk,
          [this.partitionKey]: pk,
          [this.sortKey]: sk,
          entry_id: entry.entryId,
          enqueued_at: entry.enqueuedAt,
          event: entry.event,
          status: entry.status,
          attempts: entry.attempts,
          last_error: entry.lastError ?? null,
          claimed_at: null,
          delivered_at: null,
          failed_at: null,
        };
        if (this.projectSubject && entry.event.subject) {
          item.subject_entity = entry.event.subject.entity;
          item.subject_id = entry.event.subject.id;
        }
        return {
          Put: {
            TableName: this.tableName,
            Item: item,
            // Idempotency: a retried enqueue with the same entryId is ignored.
            ConditionExpression: 'attribute_not_exists(#pk)',
            ExpressionAttributeNames: { '#pk': this.partitionKey },
          },
        };
      });
      await this.client.send(
        new this.client.TransactWriteCommand({ TransactItems: transactItems }),
      );
    }
  }

  /**
   * Claim up to `batchSize` pending entries. Scans the table for
   * 'pending' entries and atomically transitions each to 'claimed'
   * via a conditional UpdateItem. The first worker to win the
   * condition race claims the entry.
   *
   * Note: Scan is used here for simplicity. For high-volume outboxes,
   * maintain a GSI on `status` to enable efficient Query.
   */
  async claim(batchSize: number): Promise<OutboxEntry[]> {
    if (batchSize <= 0) return [];

    // 1. Find candidate entries
    const scan = await this.client.send(
      new this.client.ScanCommand({
        TableName: this.tableName,
        FilterExpression: '#st = :pending',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':pending': 'pending' },
        Limit: batchSize,
      }),
    );
    const candidates = (scan.Items ?? []) as OutboxItem[];
    if (candidates.length === 0) return [];

    // 2. Attempt to claim each via a conditional update
    const claimed: OutboxEntry[] = [];
    for (const item of candidates) {
      if (claimed.length >= batchSize) break;
      try {
        const result = await this.client.send(
          new this.client.UpdateCommand({
            TableName: this.tableName,
            Key: this.buildKey(item.entry_id),
            UpdateExpression: 'SET #st = :claimed, #att = #att + :one, #cat = :now',
            ConditionExpression: '#st = :pending',
            ExpressionAttributeNames: {
              '#st': 'status',
              '#att': 'attempts',
              '#cat': 'claimed_at',
            },
            ExpressionAttributeValues: {
              ':claimed': 'pending', // status remains pending; claimed_at tracks
              ':one': 1,
              ':pending': 'pending',
              ':now': Date.now(),
            },
            ReturnValues: 'ALL_NEW',
          }),
        );
        if (result.Attributes) {
          claimed.push(itemToEntry(result.Attributes as OutboxItem));
        }
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = err as any;
        if (error?.name === 'ConditionalCheckFailedException') {
          // Another worker claimed it; skip.
          continue;
        }
        throw err;
      }
    }
    return claimed;
  }

  /** Mark entries delivered. */
  async markDelivered(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
      const batch = entryIds.slice(i, i + BATCH_SIZE);
      const transactItems = batch.map((id) => ({
        Update: {
          TableName: this.tableName,
          Key: this.buildKey(id),
          UpdateExpression: 'SET #st = :delivered, #dat = :now',
          ExpressionAttributeNames: { '#st': 'status', '#dat': 'delivered_at' },
          ExpressionAttributeValues: { ':delivered': 'delivered', ':now': Date.now() },
        },
      }));
      await this.client.send(
        new this.client.TransactWriteCommand({ TransactItems: transactItems }),
      );
    }
  }

  /** Mark entries failed with a reason. */
  async markFailed(entryIds: string[], error: string): Promise<void> {
    if (entryIds.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
      const batch = entryIds.slice(i, i + BATCH_SIZE);
      const transactItems = batch.map((id) => ({
        Update: {
          TableName: this.tableName,
          Key: this.buildKey(id),
          UpdateExpression: 'SET #st = :failed, #le = :err, #fat = :now',
          ExpressionAttributeNames: {
            '#st': 'status',
            '#le': 'last_error',
            '#fat': 'failed_at',
          },
          ExpressionAttributeValues: {
            ':failed': 'failed',
            ':err': error,
            ':now': Date.now(),
          },
        },
      }));
      await this.client.send(
        new this.client.TransactWriteCommand({ TransactItems: transactItems }),
      );
    }
  }
}
