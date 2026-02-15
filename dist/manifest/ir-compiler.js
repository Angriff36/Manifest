import { Parser } from './parser.js';
import { globalIRCache } from './ir-cache.js';
import { COMPILER_VERSION, SCHEMA_VERSION } from './version.js';
/**
 * Compute SHA-256 hash of the source manifest
 */
async function computeContentHash(source) {
    const encoder = new TextEncoder();
    const data = encoder.encode(source);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
/**
 * Create provenance metadata for the IR
 */
async function createProvenance(source, irHash) {
    return {
        contentHash: await computeContentHash(source),
        irHash,
        compilerVersion: COMPILER_VERSION,
        schemaVersion: SCHEMA_VERSION,
        compiledAt: new Date().toISOString(),
    };
}
/**
 * Compute SHA-256 hash of the IR for runtime integrity verification
 * This creates a canonical representation by sorting keys and excluding the irHash itself
 */
async function computeIRHash(ir) {
    // Create a copy of the IR without the irHash for hashing
    const { provenance, ...irWithoutProvenance } = ir;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { irHash: _irHash, ...provenanceWithoutIrHash } = provenance;
    const canonical = {
        ...irWithoutProvenance,
        provenance: provenanceWithoutIrHash,
    };
    // Use deterministic JSON serialization
    const json = JSON.stringify(canonical, Object.keys(canonical).sort());
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
export class IRCompiler {
    diagnostics = [];
    cache;
    constructor(cache) {
        this.cache = cache ?? globalIRCache;
    }
    /**
     * Emit a semantic diagnostic during IR compilation.
     * This is the compiler's mechanism for reporting semantic errors
     * beyond what the parser catches (e.g., duplicate constraint codes).
     */
    emitDiagnostic(severity, message, line, column) {
        this.diagnostics.push({ severity, message, line, column });
    }
    async compileToIR(source, options) {
        this.diagnostics = [];
        // vNext: Check cache before compilation
        const useCache = options?.useCache ?? true;
        if (useCache) {
            const contentHash = await computeContentHash(source);
            const cached = this.cache.get(contentHash);
            if (cached) {
                return { ir: cached, diagnostics: [] };
            }
        }
        const parser = new Parser();
        const { program, errors } = parser.parse(source);
        for (const err of errors) {
            this.diagnostics.push({
                severity: err.severity,
                message: err.message,
                line: err.position?.line,
                column: err.position?.column,
            });
        }
        if (errors.some(e => e.severity === 'error')) {
            return { ir: null, diagnostics: this.diagnostics };
        }
        const ir = await this.transformProgram(program, source);
        // Check for semantic errors emitted during transformation (e.g., duplicate constraint codes)
        if (this.diagnostics.some(d => d.severity === 'error')) {
            return { ir: null, diagnostics: this.diagnostics };
        }
        // vNext: Cache the compiled IR
        if (useCache && ir) {
            const contentHash = await computeContentHash(source);
            this.cache.set(contentHash, ir);
        }
        return { ir, diagnostics: this.diagnostics };
    }
    async transformProgram(program, source) {
        const modules = program.modules.map(m => this.transformModule(m));
        const entities = [
            ...program.entities.map(e => this.transformEntity(e)),
            ...program.modules.flatMap(m => m.entities.map(e => this.transformEntity(e, m.name))),
        ];
        // Collect entity-scoped stores (defined as "store in <target>" inside entity)
        const entityScopedStores = [
            ...program.entities.filter(e => e.store).map(e => ({
                entity: e.name,
                target: e.store === 'filesystem' ? 'localStorage' : e.store,
                config: {},
            })),
            ...program.modules.flatMap(m => m.entities.filter(e => e.store).map(e => ({
                entity: e.name,
                target: e.store === 'filesystem' ? 'localStorage' : e.store,
                config: {},
            }))),
        ];
        const stores = [
            ...program.stores.map(s => this.transformStore(s)),
            ...program.modules.flatMap(m => m.stores.map(s => this.transformStore(s))),
            ...entityScopedStores,
        ];
        const events = [
            ...program.events.map(e => this.transformEvent(e)),
            ...program.modules.flatMap(m => m.events.map(e => this.transformEvent(e))),
        ];
        const commands = [
            ...program.commands.map(c => this.transformCommand(c)),
            ...program.modules.flatMap(m => m.commands.map(c => this.transformCommand(c, m.name))),
            ...program.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, undefined, e.name))),
            ...program.modules.flatMap(m => m.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, m.name, e.name)))),
        ];
        const policies = [
            ...program.policies.map(p => this.transformPolicy(p)),
            ...program.modules.flatMap(m => m.policies.map(p => this.transformPolicy(p, m.name))),
            // Extract entity-scoped policies with entity name
            ...program.entities.flatMap(e => e.policies.map(p => this.transformPolicy(p, undefined, e.name))),
            ...program.modules.flatMap(m => m.entities.flatMap(e => e.policies.map(p => this.transformPolicy(p, m.name, e.name)))),
        ];
        // Create IR without irHash first, then compute hash and add to provenance
        const irWithoutHash = {
            version: '1.0',
            provenance: await createProvenance(source),
            modules,
            entities,
            stores,
            events,
            commands,
            policies,
        };
        // Compute the IR hash and create final IR with hash in provenance
        const irHash = await computeIRHash(irWithoutHash);
        return {
            ...irWithoutHash,
            provenance: await createProvenance(source, irHash),
        };
    }
    transformModule(m) {
        return {
            name: m.name,
            entities: m.entities.map(e => e.name),
            commands: [
                ...m.commands.map(c => c.name),
                ...m.entities.flatMap(e => e.commands.map(c => c.name)),
            ],
            stores: m.stores.map(s => s.entity),
            events: m.events.map(e => e.name), // Entity-scoped events not supported in current syntax
            policies: [
                ...m.policies.map(p => p.name),
                ...m.entities.flatMap(e => e.policies.map(p => p.name)),
            ],
        };
    }
    transformEntity(e, moduleName) {
        const constraints = e.constraints.map(c => this.transformConstraint(c));
        this.validateConstraintCodeUniqueness(constraints, e.constraints, `entity '${e.name}'`);
        return {
            name: e.name,
            module: moduleName,
            properties: e.properties.map(p => this.transformProperty(p)),
            computedProperties: e.computedProperties.map(cp => this.transformComputedProperty(cp)),
            relationships: e.relationships.map(r => this.transformRelationship(r)),
            commands: e.commands.map(c => c.name),
            constraints,
            policies: e.policies.map(p => p.name),
            versionProperty: e.versionProperty,
            versionAtProperty: e.versionAtProperty,
            ...(e.transitions.length > 0 ? { transitions: e.transitions.map(t => this.transformTransition(t)) } : {}),
        };
    }
    transformTransition(t) {
        return {
            property: t.property,
            from: t.from,
            to: t.to,
        };
    }
    transformProperty(p) {
        return {
            name: p.name,
            type: this.transformType(p.dataType),
            defaultValue: p.defaultValue ? this.transformExprToValue(p.defaultValue) : undefined,
            modifiers: p.modifiers,
        };
    }
    transformComputedProperty(cp) {
        return {
            name: cp.name,
            type: this.transformType(cp.dataType),
            expression: this.transformExpression(cp.expression),
            dependencies: cp.dependencies,
        };
    }
    transformRelationship(r) {
        return {
            name: r.name,
            kind: r.kind,
            target: r.target,
            foreignKey: r.foreignKey,
            through: r.through,
        };
    }
    transformConstraint(c) {
        return {
            name: c.name,
            code: c.code || c.name, // Default to name if code not specified
            expression: this.transformExpression(c.expression),
            severity: c.severity || 'block', // Default to block
            message: c.message,
            messageTemplate: c.messageTemplate,
            detailsMapping: c.detailsMapping
                ? Object.fromEntries(Object.entries(c.detailsMapping).map(([k, v]) => [k, this.transformExpression(v)]))
                : undefined,
            overrideable: c.overrideable,
            overridePolicyRef: c.overridePolicyRef,
        };
    }
    /**
     * Validate that constraint codes are unique within a scope (entity or command).
     * Per spec (manifest-vnext.md, Constraint Blocks): "Within a single entity,
     * code values MUST be unique. Within a single command's constraints array,
     * code values MUST be unique. Compiler MUST emit diagnostic error on duplicates."
     *
     * Uses the AST nodes for source location (line/column) and IR constraints
     * for the resolved code values (which default to name if not explicit).
     */
    validateConstraintCodeUniqueness(irConstraints, astConstraints, scope) {
        const seen = new Map(); // code → first occurrence index
        for (let i = 0; i < irConstraints.length; i++) {
            const code = irConstraints[i].code;
            const firstIdx = seen.get(code);
            if (firstIdx !== undefined) {
                // Duplicate found — emit error at the duplicate's location
                const astNode = astConstraints[i];
                this.emitDiagnostic('error', `Duplicate constraint code '${code}' in ${scope}. First defined at constraint '${irConstraints[firstIdx].name}'.`, astNode.position?.line, astNode.position?.column);
            }
            else {
                seen.set(code, i);
            }
        }
    }
    transformStore(s) {
        const config = {};
        if (s.config) {
            for (const [k, v] of Object.entries(s.config)) {
                const val = this.transformExprToValue(v);
                if (val)
                    config[k] = val;
            }
        }
        return {
            entity: s.entity,
            target: s.target,
            config,
        };
    }
    transformEvent(e) {
        if ('fields' in e.payload) {
            return {
                name: e.name,
                channel: e.channel,
                payload: e.payload.fields.map(f => ({
                    name: f.name,
                    type: this.transformType(f.dataType),
                    required: f.required,
                })),
            };
        }
        return {
            name: e.name,
            channel: e.channel,
            payload: this.transformType(e.payload),
        };
    }
    transformCommand(c, moduleName, entityName) {
        const constraints = (c.constraints || []).map(con => this.transformConstraint(con));
        if (c.constraints && c.constraints.length > 0) {
            const scope = entityName ? `command '${entityName}.${c.name}'` : `command '${c.name}'`;
            this.validateConstraintCodeUniqueness(constraints, c.constraints, scope);
        }
        return {
            name: c.name,
            module: moduleName,
            entity: entityName,
            parameters: c.parameters.map(p => this.transformParameter(p)),
            guards: (c.guards || []).map(g => this.transformExpression(g)),
            constraints,
            actions: c.actions.map(a => this.transformAction(a)),
            emits: c.emits || [],
            returns: c.returns ? this.transformType(c.returns) : undefined,
        };
    }
    transformParameter(p) {
        return {
            name: p.name,
            type: this.transformType(p.dataType),
            required: p.required,
            defaultValue: p.defaultValue ? this.transformExprToValue(p.defaultValue) : undefined,
        };
    }
    transformAction(a) {
        return {
            kind: a.kind,
            target: a.target,
            expression: this.transformExpression(a.expression),
        };
    }
    transformPolicy(p, moduleName, entityName) {
        return {
            name: p.name,
            module: moduleName,
            entity: entityName,
            action: p.action,
            expression: this.transformExpression(p.expression),
            message: p.message,
        };
    }
    transformType(t) {
        return {
            name: t.name,
            generic: t.generic ? this.transformType(t.generic) : undefined,
            nullable: t.nullable,
        };
    }
    transformExpression(expr) {
        switch (expr.type) {
            case 'Literal': {
                const lit = expr;
                return {
                    kind: 'literal',
                    value: this.literalToValue(lit.value, lit.dataType),
                };
            }
            case 'Identifier': {
                return { kind: 'identifier', name: expr.name };
            }
            case 'MemberAccess': {
                const ma = expr;
                return {
                    kind: 'member',
                    object: this.transformExpression(ma.object),
                    property: ma.property,
                };
            }
            case 'BinaryOp': {
                const bo = expr;
                return {
                    kind: 'binary',
                    operator: bo.operator,
                    left: this.transformExpression(bo.left),
                    right: this.transformExpression(bo.right),
                };
            }
            case 'UnaryOp': {
                const uo = expr;
                return {
                    kind: 'unary',
                    operator: uo.operator,
                    operand: this.transformExpression(uo.operand),
                };
            }
            case 'Call': {
                const call = expr;
                return {
                    kind: 'call',
                    callee: this.transformExpression(call.callee),
                    args: call.arguments.map(a => this.transformExpression(a)),
                };
            }
            case 'Conditional': {
                const cond = expr;
                return {
                    kind: 'conditional',
                    condition: this.transformExpression(cond.condition),
                    consequent: this.transformExpression(cond.consequent),
                    alternate: this.transformExpression(cond.alternate),
                };
            }
            case 'Array': {
                const arr = expr;
                return {
                    kind: 'array',
                    elements: arr.elements.map(e => this.transformExpression(e)),
                };
            }
            case 'Object': {
                const obj = expr;
                return {
                    kind: 'object',
                    properties: obj.properties.map(p => ({
                        key: p.key,
                        value: this.transformExpression(p.value),
                    })),
                };
            }
            case 'Lambda': {
                const lam = expr;
                return {
                    kind: 'lambda',
                    params: lam.parameters,
                    body: this.transformExpression(lam.body),
                };
            }
            default:
                return { kind: 'literal', value: { kind: 'null' } };
        }
    }
    transformExprToValue(expr) {
        if (expr.type === 'Literal') {
            const lit = expr;
            return this.literalToValue(lit.value, lit.dataType);
        }
        if (expr.type === 'Array') {
            const arr = expr;
            const elements = arr.elements.map(e => this.transformExprToValue(e)).filter((v) => v !== undefined);
            return { kind: 'array', elements };
        }
        if (expr.type === 'Object') {
            const obj = expr;
            const properties = {};
            for (const p of obj.properties) {
                const v = this.transformExprToValue(p.value);
                if (v)
                    properties[p.key] = v;
            }
            return { kind: 'object', properties };
        }
        return undefined;
    }
    literalToValue(value, dataType) {
        if (dataType === 'string')
            return { kind: 'string', value: value };
        if (dataType === 'number')
            return { kind: 'number', value: value };
        if (dataType === 'boolean')
            return { kind: 'boolean', value: value };
        return { kind: 'null' };
    }
}
export async function compileToIR(source) {
    const compiler = new IRCompiler();
    return compiler.compileToIR(source);
}
//# sourceMappingURL=ir-compiler.js.map