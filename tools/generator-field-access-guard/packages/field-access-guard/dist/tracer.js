export function createTracedProxy(target) {
    const observedPaths = new Set();
    function wrap(obj, parentPath) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        return new Proxy(obj, {
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
    const proxy = wrap(target, '');
    return {
        proxy,
        getResult() {
            return {
                observedPaths: Array.from(observedPaths).sort(),
            };
        },
    };
}
function isArrayIndex(prop) {
    return /^\d+$/.test(prop);
}
function isInternalArrayProp(prop, target) {
    return Array.isArray(target) && (prop === 'length' || prop === 'forEach' || prop === 'map'
        || prop === 'filter' || prop === 'find' || prop === 'some' || prop === 'every'
        || prop === 'reduce' || prop === 'indexOf' || prop === 'includes'
        || prop === 'slice' || prop === 'concat' || prop === 'join'
        || prop === 'keys' || prop === 'values' || prop === 'entries'
        || prop === 'flatMap' || prop === 'flat' || prop === 'at'
        || typeof target[prop] === 'function');
}
