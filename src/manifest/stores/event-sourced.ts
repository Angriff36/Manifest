/**
 * EventSourcedStore — in-memory Store that appends create/update/delete
 * operations to a per-aggregate event log and maintains a projected state.
 *
 * Config (from IR store block, via EventSourcedStoreOptions):
 *   - snapshotInterval: take a snapshot every N events (default 100)
 *   - exposeEventLog: when true, getEventLog(id) returns the append-only log
 *
 * Wired by RuntimeEngine for `store Entity in eventSourced { … }`.
 * Kept free of imports from runtime-engine to avoid a circular dependency.
 */

export interface EventSourcedEntity {
  id: string;
  [key: string]: unknown;
}

export interface EventSourcedEvent {
  sequence: number;
  kind: 'create' | 'update' | 'delete';
  at: number;
  payload?: Record<string, unknown>;
}

export interface EventSourcedSnapshot<T extends EventSourcedEntity = EventSourcedEntity> {
  sequence: number;
  state: T;
}

export interface EventSourcedStoreOptions {
  snapshotInterval?: number;
  exposeEventLog?: boolean;
  generateId?: () => string;
  now?: () => number;
}

export class EventSourcedStore<T extends EventSourcedEntity = EventSourcedEntity> {
  private readonly projected = new Map<string, T>();
  private readonly logs = new Map<string, EventSourcedEvent[]>();
  private readonly snapshots = new Map<string, EventSourcedSnapshot<T>>();
  private readonly snapshotInterval: number;
  private readonly exposeEventLog: boolean;
  private readonly generateId: () => string;
  private readonly now: () => number;

  constructor(opts: EventSourcedStoreOptions = {}) {
    this.snapshotInterval = opts.snapshotInterval ?? 100;
    this.exposeEventLog = opts.exposeEventLog ?? false;
    this.generateId = opts.generateId ?? (() => crypto.randomUUID());
    this.now = opts.now ?? (() => Date.now());
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.projected.values());
  }

  async getById(id: string): Promise<T | undefined> {
    return this.projected.get(id);
  }

  async create(data: Partial<T>): Promise<T> {
    const id = (data.id as string | undefined) || this.generateId();
    const item = { ...data, id } as T;
    this.append(id, 'create', item as unknown as Record<string, unknown>);
    this.projected.set(id, item);
    this.maybeSnapshot(id);
    return item;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const existing = this.projected.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    this.append(id, 'update', data as unknown as Record<string, unknown>);
    this.projected.set(id, updated);
    this.maybeSnapshot(id);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.projected.has(id)) return false;
    this.append(id, 'delete');
    this.projected.delete(id);
    this.maybeSnapshot(id);
    return true;
  }

  async clear(): Promise<void> {
    this.projected.clear();
    this.logs.clear();
    this.snapshots.clear();
  }

  getEventLog(id: string): EventSourcedEvent[] | undefined {
    if (!this.exposeEventLog) return undefined;
    const log = this.logs.get(id);
    return log ? log.map((e) => ({ ...e, payload: e.payload ? { ...e.payload } : undefined })) : [];
  }

  getSnapshot(id: string): EventSourcedSnapshot<T> | undefined {
    const snap = this.snapshots.get(id);
    return snap ? { sequence: snap.sequence, state: { ...snap.state } } : undefined;
  }

  private append(
    id: string,
    kind: EventSourcedEvent['kind'],
    payload?: Record<string, unknown>,
  ): void {
    const log = this.logs.get(id) ?? [];
    const sequence = (log[log.length - 1]?.sequence ?? 0) + 1;
    log.push({ sequence, kind, at: this.now(), payload });
    this.logs.set(id, log);
  }

  private maybeSnapshot(id: string): void {
    const log = this.logs.get(id);
    if (!log || log.length === 0) return;
    if (log.length % this.snapshotInterval !== 0) return;
    const state = this.projected.get(id);
    if (!state) return;
    this.snapshots.set(id, {
      sequence: log[log.length - 1].sequence,
      state: { ...state },
    });
  }
}

/** Parse IR store config values into EventSourcedStoreOptions. */
export function eventSourcedOptionsFromConfig(
  config: Record<string, { kind?: string; value?: unknown } | undefined>,
  generateId?: () => string,
): EventSourcedStoreOptions {
  const interval = config.snapshotInterval;
  const expose = config.exposeEventLog;
  return {
    snapshotInterval:
      interval?.kind === 'number' && typeof interval.value === 'number'
        ? interval.value
        : undefined,
    exposeEventLog:
      expose?.kind === 'boolean' && typeof expose.value === 'boolean'
        ? expose.value
        : undefined,
    generateId,
  };
}
