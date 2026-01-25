export type Subscriber<T> = (value: T) => void;
export type User = { id: string; role?: string; [key: string]: unknown };
export type Context = { user?: User; [key: string]: unknown };

let _context: Context = {};
export const setContext = (ctx: Context) => { _context = ctx; };
export const getContext = () => _context;

export class Observable<T> {
  private subs: Set<Subscriber<T>> = new Set();
  private _v: T;
  constructor(v: T) { this._v = v; }
  get value(): T { return this._v; }
  set(v: T) { this._v = v; this.subs.forEach(fn => fn(v)); }
  subscribe(fn: Subscriber<T>) { this.subs.add(fn); fn(this._v); return () => this.subs.delete(fn); }
}

export class EventEmitter<T extends Record<string, unknown>> {
  private listeners: Map<keyof T, Set<(d: unknown) => void>> = new Map();
  on<K extends keyof T>(e: K, fn: (d: T[K]) => void) {
    if (!this.listeners.has(e)) this.listeners.set(e, new Set());
    this.listeners.get(e)!.add(fn as (d: unknown) => void);
    return () => this.listeners.get(e)?.delete(fn as (d: unknown) => void);
  }
  emit<K extends keyof T>(e: K, d: T[K]) {
    this.listeners.get(e)?.forEach(fn => fn(d));
  }
}

export class EventBus {
  private static channels: Map<string, Set<(d: unknown) => void>> = new Map();
  static publish(channel: string, data: unknown) {
    this.channels.get(channel)?.forEach(fn => fn(data));
  }
  static subscribe(channel: string, fn: (d: unknown) => void) {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(fn);
    return () => this.channels.get(channel)?.delete(fn);
  }
}

export interface Store<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: Partial<T>): Promise<T>;
  update(id: string, item: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  query(filter: (item: T) => boolean): Promise<T[]>;
  onChange(fn: (items: T[]) => void): () => void;
}

export class MemoryStore<T extends { id: string }> implements Store<T> {
  private data: Map<string, T> = new Map();
  private listeners: Set<(items: T[]) => void> = new Set();

  private notify() {
    const items = Array.from(this.data.values());
    this.listeners.forEach(fn => fn(items));
  }

  async getAll() { return Array.from(this.data.values()); }
  async getById(id: string) { return this.data.get(id) || null; }
  async create(item: Partial<T>) {
    const id = (item as { id?: string }).id || crypto.randomUUID();
    const full = { ...item, id } as T;
    this.data.set(id, full);
    this.notify();
    return full;
  }
  async update(id: string, item: Partial<T>) {
    const existing = this.data.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...item };
    this.data.set(id, updated);
    this.notify();
    return updated;
  }
  async delete(id: string) {
    const result = this.data.delete(id);
    this.notify();
    return result;
  }
  async query(filter: (item: T) => boolean) {
    return Array.from(this.data.values()).filter(filter);
  }
  onChange(fn: (items: T[]) => void) {
    this.listeners.add(fn);
    fn(Array.from(this.data.values()));
    return () => this.listeners.delete(fn);
  }
}

export class LocalStorageStore<T extends { id: string }> implements Store<T> {
  private listeners: Set<(items: T[]) => void> = new Set();
  constructor(private key: string) {}

  private load(): T[] {
    try {
      const d = localStorage.getItem(this.key);
      return d ? JSON.parse(d) : [];
    } catch { return []; }
  }
  private save(data: T[]) {
    localStorage.setItem(this.key, JSON.stringify(data));
    this.listeners.forEach(fn => fn(data));
  }

  async getAll() { return this.load(); }
  async getById(id: string) { return this.load().find(x => x.id === id) || null; }
  async create(item: Partial<T>) {
    const data = this.load();
    const id = (item as { id?: string }).id || crypto.randomUUID();
    const full = { ...item, id } as T;
    data.push(full);
    this.save(data);
    return full;
  }
  async update(id: string, item: Partial<T>) {
    const data = this.load();
    const idx = data.findIndex(x => x.id === id);
    if (idx < 0) throw new Error("Not found");
    data[idx] = { ...data[idx], ...item };
    this.save(data);
    return data[idx];
  }
  async delete(id: string) {
    const data = this.load();
    const idx = data.findIndex(x => x.id === id);
    if (idx < 0) return false;
    data.splice(idx, 1);
    this.save(data);
    return true;
  }
  async query(filter: (item: T) => boolean) { return this.load().filter(filter); }
  onChange(fn: (items: T[]) => void) {
    this.listeners.add(fn);
    fn(this.load());
    return () => this.listeners.delete(fn);
  }
}
