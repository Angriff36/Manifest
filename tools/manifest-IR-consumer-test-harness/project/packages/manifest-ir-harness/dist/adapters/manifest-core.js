function resolvePath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        if (typeof current === 'object' && current !== null) {
            current = current[part];
        }
        else {
            return undefined;
        }
    }
    return current;
}
function evaluateOperator(actual, operator, expected) {
    switch (operator) {
        case 'eq':
            return actual === expected;
        case 'neq':
            return actual !== expected;
        case 'gt':
            return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
        case 'gte':
            return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
        case 'lt':
            return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
        case 'lte':
            return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
        default:
            return false;
    }
}
class StubRuntimeEngine {
    entities;
    ir;
    constructor(ir) {
        this.ir = ir;
        this.entities = new Map();
    }
    seedEntity(entity, id, properties) {
        if (!this.entities.has(entity)) {
            this.entities.set(entity, new Map());
        }
        const entityMap = this.entities.get(entity);
        if (entityMap) {
            entityMap.set(id, { id, ...structuredClone(properties) });
        }
    }
    executeCommand(entity, id, command, _params, _context) {
        const entityDef = this.ir.entities[entity];
        if (!entityDef) {
            return {
                success: false,
                entityStateAfter: null,
                emittedEvents: [],
                guardFailures: null,
                constraintWarnings: [],
                error: { type: 'constraint', message: `Entity "${entity}" not found in IR` },
            };
        }
        const commandDef = entityDef.commands[command];
        if (!commandDef) {
            return {
                success: false,
                entityStateAfter: null,
                emittedEvents: [],
                guardFailures: null,
                constraintWarnings: [],
                error: { type: 'constraint', message: `Command "${command}" not found on entity "${entity}"` },
            };
        }
        const entityMap = this.entities.get(entity);
        const state = entityMap?.get(id);
        if (!state) {
            return {
                success: false,
                entityStateAfter: null,
                emittedEvents: [],
                guardFailures: null,
                constraintWarnings: [],
                error: { type: 'constraint', message: `Entity instance "${entity}:${id}" not found` },
            };
        }
        const guardFailures = [];
        for (let i = 0; i < commandDef.guards.length; i++) {
            const guard = commandDef.guards[i];
            if (!guard)
                continue;
            const actualValue = resolvePath(state, guard.check.path);
            const passed = evaluateOperator(actualValue, guard.check.operator, guard.check.value);
            if (!passed) {
                guardFailures.push({
                    guardIndex: i,
                    expression: guard.expression,
                    resolvedValues: { [`self.${guard.check.path}`]: actualValue },
                    evaluatedTo: false,
                });
            }
        }
        if (guardFailures.length > 0) {
            return {
                success: false,
                entityStateAfter: structuredClone(state),
                emittedEvents: [],
                guardFailures,
                constraintWarnings: [],
                error: {
                    type: 'guard',
                    message: guardFailures.map((f) => f.expression).join('; '),
                    guardIndex: guardFailures[0]?.guardIndex,
                },
            };
        }
        for (const [prop, value] of Object.entries(commandDef.transitions)) {
            state[prop] = value;
        }
        const emittedEvents = commandDef.events.map((name) => ({
            name,
            data: {},
        }));
        return {
            success: true,
            entityStateAfter: structuredClone(state),
            emittedEvents,
            guardFailures: null,
            constraintWarnings: [],
        };
    }
    getEntityState(entity, id) {
        const entityMap = this.entities.get(entity);
        const state = entityMap?.get(id);
        return state ? structuredClone(state) : null;
    }
}
export const adapter = {
    async compile(source) {
        try {
            const parsed = JSON.parse(source);
            return { ir: parsed, diagnostics: [] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown parse error';
            return {
                ir: null,
                diagnostics: [{ severity: 'error', message: `Failed to parse manifest source: ${message}` }],
            };
        }
    },
    createRuntime(ir) {
        return new StubRuntimeEngine(ir);
    },
};
//# sourceMappingURL=manifest-core.js.map