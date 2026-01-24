/* eslint-disable */
type Subscriber<T> = (value: T) => void;

class Observable<T> {
  private observers = new Set<Subscriber<T>>();
  private _value: T;

  constructor(value: T) {
    this._value = value;
  }

  get value() {
    return this._value;
  }

  set value(next: T) {
    this._value = next;
    this.observers.forEach((fn) => fn(next));
  }

  subscribe(fn: Subscriber<T>) {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }
}

type EventPayloads = {
  'kitchen.task.claimed': { taskId: string; userId: string; priority: number };
};

class SimpleEventBus {
  private listeners = new Map<keyof EventPayloads, Set<Subscriber<EventPayloads[keyof EventPayloads]>>>();

  subscribe<E extends keyof EventPayloads>(event: E, fn: (payload: EventPayloads[E]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    const wrapped = ((payload: EventPayloads[keyof EventPayloads]) => fn(payload as EventPayloads[E])) as Subscriber<EventPayloads[keyof EventPayloads]>;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  emit<E extends keyof EventPayloads>(event: E, payload: EventPayloads[E]) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
}

const globalEventBus = new SimpleEventBus();

export const EventBus = {
  subscribe: globalEventBus.subscribe.bind(globalEventBus),
  emit: globalEventBus.emit.bind(globalEventBus),
};

let context: { user: { id: string; role: string } } | null = null;

export function setContext(ctx: { user: { id: string; role: string } }) {
  context = ctx;
}

export interface PrepTaskInit {
  id: string;
  name: string;
  priority: number;
}

export class PrepTask {
  public readonly id: string;
  public readonly name: string;
  public readonly priority: number;
  public readonly assignedTo = new Observable<string | null>(null);
  public readonly status = new Observable<'pending' | 'in_progress' | 'done'>('pending');
  public readonly isUrgent: Observable<boolean>;

  constructor(init: PrepTaskInit) {
    this.id = init.id;
    this.name = init.name;
    this.priority = init.priority;
    this.isUrgent = new Observable(init.priority >= 4);
  }

  claim(userId: string) {
    this.assignedTo.value = userId;
    this.status.value = 'in_progress';
    EventBus.emit('kitchen.task.claimed', {
      taskId: this.id,
      userId,
      priority: this.priority,
    });
  }
}
