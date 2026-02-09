export interface TraceResult {
  observedPaths: string[];
}

export function createTracedProxy<T extends object>(target: T): { proxy: T; getResult: () => TraceResult } {
  const observedPaths = new Set<string>();

  function wrap(obj: unknown, parentPath: string): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    return new Proxy(obj as object, {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }

        const currentPath = parentPath ? `${parentPath}.${prop}` : prop;
        const value = Reflect.get(target, prop, receiver);

        if (isArrayIndex(prop) && Array.isArray(target)) {
          observedPaths.add(currentPath);
          if (value !== null && typeof value === 'object') {
            return wrap(value, currentPath);
          }
          return value;
        }

        if (isInternalArrayProp(prop, target)) {
          return value;
        }

        observedPaths.add(currentPath);

        if (value !== null && typeof value === 'object') {
          return wrap(value, currentPath);
        }

        return value;
      },
    });
  }

  const proxy = wrap(target, '') as T;

  return {
    proxy,
    getResult(): TraceResult {
      return {
        observedPaths: Array.from(observedPaths).sort(),
      };
    },
  };
}

function isArrayIndex(prop: string): boolean {
  return /^\d+$/.test(prop);
}

function isInternalArrayProp(prop: string, target: object): boolean {
  return Array.isArray(target) && (prop === 'length' || prop === 'forEach' || prop === 'map'
    || prop === 'filter' || prop === 'find' || prop === 'some' || prop === 'every'
    || prop === 'reduce' || prop === 'indexOf' || prop === 'includes'
    || prop === 'slice' || prop === 'concat' || prop === 'join'
    || prop === 'keys' || prop === 'values' || prop === 'entries'
    || prop === 'flatMap' || prop === 'flat' || prop === 'at'
    || typeof (target as unknown as Record<string, unknown>)[prop] === 'function');
}
