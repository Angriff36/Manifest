import {
  IR,
  IREntity,
  IRCommand,
  IRPolicy,
  IRExpression,
  IRValue,
  IRAction,
  IRType,
} from './ir';

export interface RuntimeContext {
  user?: { id: string; role?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  result?: unknown;
  error?: string;
  deniedBy?: string;
  emittedEvents: EmittedEvent[];
}

export interface EmittedEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
}

export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): T[];
  getById(id: string): T | undefined;
  create(data: Partial<T>): T;
  update(id: string, data: Partial<T>): T | undefined;
  delete(id: string): boolean;
  clear(): void;
}

class MemoryStore<T extends EntityInstance> implements Store<T> {
  private items: Map<string, T> = new Map();

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  getById(id: string): T | undefined {
    return this.items.get(id);
  }

  create(data: Partial<T>): T {
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    this.items.set(id, item);
    return item;
  }

  update(id: string, data: Partial<T>): T | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }
}

class LocalStorageStore<T extends EntityInstance> implements Store<T> {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  private load(): T[] {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private save(items: T[]): void {
    localStorage.setItem(this.key, JSON.stringify(items));
  }

  getAll(): T[] {
    return this.load();
  }

  getById(id: string): T | undefined {
    return this.load().find(item => item.id === id);
  }

  create(data: Partial<T>): T {
    const items = this.load();
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    items.push(item);
    this.save(items);
    return item;
  }

  update(id: string, data: Partial<T>): T | undefined {
    const items = this.load();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return undefined;
    const updated = { ...items[idx], ...data, id };
    items[idx] = updated;
    this.save(items);
    return updated;
  }

  delete(id: string): boolean {
    const items = this.load();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.save(items);
    return true;
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}

type EventListener = (event: EmittedEvent) => void;

export class RuntimeEngine {
  private ir: IR;
  private context: RuntimeContext;
  private stores: Map<string, Store> = new Map();
  private eventListeners: EventListener[] = [];
  private eventLog: EmittedEvent[] = [];

  constructor(ir: IR, context: RuntimeContext = {}) {
    this.ir = ir;
    this.context = context;
    this.initializeStores();
  }

  private initializeStores(): void {
    for (const entity of this.ir.entities) {
      const storeConfig = this.ir.stores.find(s => s.entity === entity.name);
      let store: Store;

      if (storeConfig) {
        switch (storeConfig.target) {
          case 'localStorage': {
            const key = storeConfig.config.key?.kind === 'string'
              ? storeConfig.config.key.value
              : `${entity.name.toLowerCase()}s`;
            store = new LocalStorageStore(key);
            break;
          }
          case 'memory':
          default:
            store = new MemoryStore();
        }
      } else {
        store = new MemoryStore();
      }

      this.stores.set(entity.name, store);
    }
  }

  getIR(): IR {
    return this.ir;
  }

  getContext(): RuntimeContext {
    return this.context;
  }

  setContext(ctx: Partial<RuntimeContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  getEntities(): IREntity[] {
    return this.ir.entities;
  }

  getEntity(name: string): IREntity | undefined {
    return this.ir.entities.find(e => e.name === name);
  }

  getCommands(): IRCommand[] {
    const moduleCommands = this.ir.commands;
    const entityCommands = this.ir.entities.flatMap(e =>
      e.commands.map(c => ({ ...c, entity: e.name }))
    );
    return [...moduleCommands, ...entityCommands];
  }

  getCommand(name: string, entityName?: string): IRCommand | undefined {
    if (entityName) {
      const entity = this.getEntity(entityName);
      return entity?.commands.find(c => c.name === name);
    }
    return this.ir.commands.find(c => c.name === name);
  }

  getPolicies(): IRPolicy[] {
    return this.ir.policies;
  }

  getStore(entityName: string): Store | undefined {
    return this.stores.get(entityName);
  }

  getAllInstances(entityName: string): EntityInstance[] {
    const store = this.stores.get(entityName);
    return store ? store.getAll() : [];
  }

  getInstance(entityName: string, id: string): EntityInstance | undefined {
    const store = this.stores.get(entityName);
    return store?.getById(id);
  }

  createInstance(entityName: string, data: Partial<EntityInstance>): EntityInstance | undefined {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const defaults: Record<string, unknown> = {};
    for (const prop of entity.properties) {
      if (prop.defaultValue) {
        defaults[prop.name] = this.irValueToJs(prop.defaultValue);
      } else {
        defaults[prop.name] = this.getDefaultForType(prop.type);
      }
    }

    const store = this.stores.get(entityName);
    if (!store) return undefined;

    return store.create({ ...defaults, ...data });
  }

  updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): EntityInstance | undefined {
    const store = this.stores.get(entityName);
    return store?.update(id, data);
  }

  deleteInstance(entityName: string, id: string): boolean {
    const store = this.stores.get(entityName);
    return store?.delete(id) ?? false;
  }

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string } = {}
  ): Promise<CommandResult> {
    const command = this.getCommand(commandName, options.entityName);
    if (!command) {
      return {
        success: false,
        error: `Command '${commandName}' not found`,
        emittedEvents: [],
      };
    }

    const instance = options.instanceId && options.entityName
      ? this.getInstance(options.entityName, options.instanceId)
      : undefined;

    const evalContext = this.buildEvalContext(input, instance);

    const policyResult = this.checkPolicies(command, evalContext);
    if (!policyResult.allowed) {
      return {
        success: false,
        error: policyResult.message,
        deniedBy: policyResult.policyName,
        emittedEvents: [],
      };
    }

    for (const guard of command.guards) {
      const result = this.evaluateExpression(guard, evalContext);
      if (!result) {
        return {
          success: false,
          error: `Guard condition failed for command '${commandName}'`,
          emittedEvents: [],
        };
      }
    }

    const emittedEvents: EmittedEvent[] = [];
    let result: unknown;

    for (const action of command.actions) {
      const actionResult = this.executeAction(action, evalContext, options);
      if (action.kind === 'mutate' && options.instanceId && options.entityName) {
        const currentInstance = this.getInstance(options.entityName, options.instanceId);
        evalContext.self = currentInstance;
        evalContext.this = currentInstance;
      }
      result = actionResult;
    }

    for (const eventName of command.emits) {
      const event = this.ir.events.find(e => e.name === eventName);
      const emitted: EmittedEvent = {
        name: eventName,
        channel: event?.channel || eventName,
        payload: { ...input, result },
        timestamp: Date.now(),
      };
      emittedEvents.push(emitted);
      this.eventLog.push(emitted);
      this.notifyListeners(emitted);
    }

    return {
      success: true,
      result,
      emittedEvents,
    };
  }

  private buildEvalContext(
    input: Record<string, unknown>,
    instance?: EntityInstance
  ): Record<string, unknown> {
    return {
      ...input,
      self: instance,
      this: instance,
      user: this.context.user,
      context: this.context,
    };
  }

  private checkPolicies(
    command: IRCommand,
    evalContext: Record<string, unknown>
  ): { allowed: boolean; policyName?: string; message?: string } {
    const relevantPolicies = this.ir.policies.filter(p => {
      if (p.entity && command.entity && p.entity !== command.entity) return false;
      if (p.action !== 'all' && p.action !== 'execute') return false;
      return true;
    });

    for (const policy of relevantPolicies) {
      const result = this.evaluateExpression(policy.expression, evalContext);
      if (!result) {
        return {
          allowed: false,
          policyName: policy.name,
          message: policy.message || `Denied by policy '${policy.name}'`,
        };
      }
    }

    return { allowed: true };
  }

  private executeAction(
    action: IRAction,
    evalContext: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string }
  ): unknown {
    const value = this.evaluateExpression(action.expression, evalContext);

    switch (action.kind) {
      case 'mutate':
        if (action.target && options.instanceId && options.entityName) {
          this.updateInstance(options.entityName, options.instanceId, {
            [action.target]: value,
          });
        }
        return value;

      case 'emit':
      case 'publish': {
        const event: EmittedEvent = {
          name: 'action_event',
          channel: 'default',
          payload: value,
          timestamp: Date.now(),
        };
        this.eventLog.push(event);
        this.notifyListeners(event);
        return value;
      }

      case 'persist':
        return value;

      case 'compute':
      case 'effect':
      default:
        return value;
    }
  }

  evaluateExpression(expr: IRExpression, context: Record<string, unknown>): unknown {
    switch (expr.kind) {
      case 'literal':
        return this.irValueToJs(expr.value);

      case 'identifier': {
        const name = expr.name;
        if (name in context) return context[name];
        if (name === 'true') return true;
        if (name === 'false') return false;
        if (name === 'null') return null;
        return undefined;
      }

      case 'member': {
        const obj = this.evaluateExpression(expr.object, context);
        if (obj && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[expr.property];
        }
        return undefined;
      }

      case 'binary': {
        const left = this.evaluateExpression(expr.left, context);
        const right = this.evaluateExpression(expr.right, context);
        return this.evaluateBinaryOp(expr.operator, left, right);
      }

      case 'unary': {
        const operand = this.evaluateExpression(expr.operand, context);
        return this.evaluateUnaryOp(expr.operator, operand);
      }

      case 'call': {
        const callee = this.evaluateExpression(expr.callee, context);
        const args = expr.args.map(a => this.evaluateExpression(a, context));
        if (typeof callee === 'function') {
          return callee(...args);
        }
        return undefined;
      }

      case 'conditional': {
        const condition = this.evaluateExpression(expr.condition, context);
        return condition
          ? this.evaluateExpression(expr.consequent, context)
          : this.evaluateExpression(expr.alternate, context);
      }

      case 'array':
        return expr.elements.map(e => this.evaluateExpression(e, context));

      case 'object': {
        const result: Record<string, unknown> = {};
        for (const prop of expr.properties) {
          result[prop.key] = this.evaluateExpression(prop.value, context);
        }
        return result;
      }

      case 'lambda': {
        return (...args: unknown[]) => {
          const localContext = { ...context };
          expr.params.forEach((p, i) => {
            localContext[p] = args[i];
          });
          return this.evaluateExpression(expr.body, localContext);
        };
      }

      default:
        return undefined;
    }
  }

  private evaluateBinaryOp(op: string, left: unknown, right: unknown): unknown {
    switch (op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right);
        }
        return (left as number) + (right as number);
      case '-': return (left as number) - (right as number);
      case '*': return (left as number) * (right as number);
      case '/': return (left as number) / (right as number);
      case '%': return (left as number) % (right as number);
      case '==':
      case 'is': return left === right;
      case '!=': return left !== right;
      case '<': return (left as number) < (right as number);
      case '>': return (left as number) > (right as number);
      case '<=': return (left as number) <= (right as number);
      case '>=': return (left as number) >= (right as number);
      case '&&':
      case 'and': return Boolean(left) && Boolean(right);
      case '||':
      case 'or': return Boolean(left) || Boolean(right);
      case 'in':
        if (Array.isArray(right)) return right.includes(left);
        if (typeof right === 'string') return (right as string).includes(String(left));
        return false;
      case 'contains':
        if (Array.isArray(left)) return left.includes(right);
        if (typeof left === 'string') return left.includes(String(right));
        return false;
      default:
        return undefined;
    }
  }

  private evaluateUnaryOp(op: string, operand: unknown): unknown {
    switch (op) {
      case '!':
      case 'not': return !operand;
      case '-': return -(operand as number);
      default: return operand;
    }
  }

  private irValueToJs(value: IRValue): unknown {
    switch (value.kind) {
      case 'string': return value.value;
      case 'number': return value.value;
      case 'boolean': return value.value;
      case 'null': return null;
      case 'array': return value.elements.map(e => this.irValueToJs(e));
      case 'object': {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value.properties)) {
          result[k] = this.irValueToJs(v);
        }
        return result;
      }
    }
  }

  private getDefaultForType(type: IRType): unknown {
    if (type.nullable) return null;
    switch (type.name) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'list': return [];
      case 'map': return {};
      default: return null;
    }
  }

  evaluateComputed(entityName: string, instanceId: string, propertyName: string): unknown {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const computed = entity.computedProperties.find(c => c.name === propertyName);
    if (!computed) return undefined;

    const instance = this.getInstance(entityName, instanceId);
    if (!instance) return undefined;

    const context = {
      self: instance,
      this: instance,
      ...instance,
      user: this.context.user,
      context: this.context,
    };

    return this.evaluateExpression(computed.expression, context);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    };
  }

  private notifyListeners(event: EmittedEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
      }
    }
  }

  getEventLog(): EmittedEvent[] {
    return [...this.eventLog];
  }

  clearEventLog(): void {
    this.eventLog = [];
  }

  serialize(): { ir: IR; context: RuntimeContext; stores: Record<string, EntityInstance[]> } {
    const storeData: Record<string, EntityInstance[]> = {};
    for (const [name, store] of this.stores) {
      storeData[name] = store.getAll();
    }
    return {
      ir: this.ir,
      context: this.context,
      stores: storeData,
    };
  }

  restore(data: { stores: Record<string, EntityInstance[]> }): void {
    for (const [name, instances] of Object.entries(data.stores)) {
      const store = this.stores.get(name);
      if (store) {
        store.clear();
        for (const instance of instances) {
          store.create(instance);
        }
      }
    }
  }
}
