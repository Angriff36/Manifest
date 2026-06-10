import { Parser } from './parser.js';
import {
  ManifestProgram,
  EntityNode,
  PropertyNode,
  ComputedPropertyNode,
  RelationshipNode,
  CommandNode,
  ParameterNode,
  PolicyNode,
  StoreNode,
  OutboxEventNode,
  ConstraintNode,
  ActionNode,
  ExpressionNode,
  TypeNode,
  TransitionNode,
  EnumNode,
  ValueObjectNode,
  TenantNode,
  ReactionNode,
  ApprovalNode,
  ApprovalStageNode,
  RoleNode,
  SagaNode,
  WebhookNode,
} from './types';
import {
  IR,
  IRModule,
  IREntity,
  IRProperty,
  IRComputedProperty,
  IRRelationship,
  IRConstraint,
  IRStore,
  IREvent,
  IRCommand,
  IRParameter,
  IRAction,
  IRPolicy,
  IRType,
  IRValue,
  IRExpression,
  IRDiagnostic,
  CompileToIRResult,
  PropertyModifier,
  IRMaskStrategy,
  MaskStrategyType,
  IRProvenance,
  IRTransition,
  IRForeignKey,
  IREnum,
  IRValueObject,
  IRTenant,
  IRReactionRule,
  IRReactionParam,
  IRApproval,
  IRApprovalStage,
  IRRole,
  IRRolePermission,
  IRSaga,
  IRSagaStep,
  IRWebhook,
  IRWebhookSignature,
  IRWebhookParam,
} from './ir';
import { globalIRCache, type IRCache } from './ir-cache.js';
import { COMPILER_VERSION, SCHEMA_VERSION } from './version.js';

/**
 * Compute SHA-256 hash of the source manifest
 */
async function computeContentHash(source: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(source);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create provenance metadata for the IR
 */
async function createProvenance(source: string, irHash?: string): Promise<IRProvenance> {
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
export async function computeIRHash(ir: IR): Promise<string> {
  // Create a copy of the IR without the irHash for hashing
  const { provenance, ...irWithoutProvenance } = ir as IR & { provenance: IRProvenance };
  const { irHash: _irHash, ...provenanceWithoutIrHash } = provenance;

  const canonical = {
    ...irWithoutProvenance,
    provenance: provenanceWithoutIrHash,
  };

  // Use deterministic JSON serialization with recursive key sorting.
  // A replacer function sorts object keys at every nesting level to ensure
  // identical IR always produces the same hash regardless of property insertion order.
  // NOTE: An array replacer (Object.keys().sort()) would only whitelist those key
  // names at ALL levels, silently dropping nested properties — a subtle JSON.stringify
  // pitfall that would make the hash blind to content changes within entities/commands.
  const json = JSON.stringify(canonical, (_key: string, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface CommandIntentRegistryEntry {
  entity?: string;
  command: string;
  sourcePath?: string;
  line?: number;
  column?: number;
}

const COMMAND_INTENT_VERBS: Record<string, string> = {
  create: 'create',
  add: 'create',
  new: 'create',
  update: 'update',
  edit: 'update',
  modify: 'update',
  delete: 'delete',
  remove: 'delete',
  deactivate: 'delete',
  archive: 'delete',
};

function normalizeIntentToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripEntityAffixes(command: string, entity?: string): string {
  const entityToken = entity ? normalizeIntentToken(entity) : '';
  let normalized = normalizeIntentToken(command);

  if (!entityToken) return normalized;

  let changed = true;
  while (changed && normalized.length > entityToken.length) {
    changed = false;
    if (normalized.startsWith(entityToken)) {
      normalized = normalized.slice(entityToken.length);
      changed = true;
    }
    if (normalized.endsWith(entityToken) && normalized.length > entityToken.length) {
      normalized = normalized.slice(0, -entityToken.length);
      changed = true;
    }
  }

  return normalized;
}

function normalizeCommandIntent(command: string, entity?: string): string {
  const stripped = stripEntityAffixes(command, entity);
  for (const verb of Object.keys(COMMAND_INTENT_VERBS).sort((a, b) => b.length - a.length)) {
    if (stripped === verb || stripped.startsWith(verb)) {
      const rest = stripped.slice(verb.length);
      return `${COMMAND_INTENT_VERBS[verb]}:${rest}`;
    }
  }
  return `custom:${stripped}`;
}

function commandDisplay(entry: CommandIntentRegistryEntry): string {
  return entry.entity ? `${entry.entity}.${entry.command}` : entry.command;
}

function sourceDisplay(entry: CommandIntentRegistryEntry): string | undefined {
  if (!entry.sourcePath) return undefined;
  const position = entry.line !== undefined
    ? `:${entry.line}${entry.column !== undefined ? `:${entry.column}` : ''}`
    : '';
  return `${entry.sourcePath}${position}`;
}

function duplicateCommandIntentDiagnostic(
  duplicate: CommandIntentRegistryEntry,
  existing: CommandIntentRegistryEntry,
): IRDiagnostic {
  const duplicateSource = sourceDisplay(duplicate);
  const existingSource = sourceDisplay(existing);
  const locations = [
    duplicateSource ? `duplicate source: ${duplicateSource}` : undefined,
    existingSource ? `existing source: ${existingSource}` : undefined,
  ].filter(Boolean).join('; ');

  return {
    severity: 'error',
    message: `Duplicate command intent for ${commandDisplay(duplicate)} conflicts with existing command ${commandDisplay(existing)}${locations ? ` (${locations})` : ''}; use or extend the existing command.`,
    line: duplicate.line,
    column: duplicate.column,
  };
}

export function validateCommandIntentRegistry(entries: CommandIntentRegistryEntry[]): IRDiagnostic[] {
  const diagnostics: IRDiagnostic[] = [];
  const exact = new Map<string, CommandIntentRegistryEntry>();
  const canonical = new Map<string, CommandIntentRegistryEntry>();

  for (const entry of entries) {
    const entityKey = entry.entity ?? '__global__';
    const exactKey = `${entityKey}\u0000${entry.command}`;
    const exactExisting = exact.get(exactKey);
    if (exactExisting) {
      diagnostics.push(duplicateCommandIntentDiagnostic(entry, exactExisting));
      continue;
    }
    exact.set(exactKey, entry);

    const canonicalKey = `${entityKey}\u0000${normalizeCommandIntent(entry.command, entry.entity)}`;
    const canonicalExisting = canonical.get(canonicalKey);
    if (canonicalExisting) {
      diagnostics.push(duplicateCommandIntentDiagnostic(entry, canonicalExisting));
      continue;
    }
    canonical.set(canonicalKey, entry);
  }

  return diagnostics;
}

function collectCommandIntentEntries(program: ManifestProgram, sourcePath?: string): CommandIntentRegistryEntry[] {
  return [
    ...program.commands.map(command => ({
      command: command.name,
      sourcePath,
      line: command.position?.line,
      column: command.position?.column,
    })),
    ...program.modules.flatMap(module => module.commands.map(command => ({
      command: command.name,
      sourcePath,
      line: command.position?.line,
      column: command.position?.column,
    }))),
    ...program.entities.flatMap(entity => entity.commands.map(command => ({
      entity: entity.name,
      command: command.name,
      sourcePath,
      line: command.position?.line,
      column: command.position?.column,
    }))),
    ...program.modules.flatMap(module => module.entities.flatMap(entity => entity.commands.map(command => ({
      entity: entity.name,
      command: command.name,
      sourcePath,
      line: command.position?.line,
      column: command.position?.column,
    })))),
  ];
}

export class IRCompiler {
  private diagnostics: IRDiagnostic[] = [];
  private cache: IRCache;

  constructor(cache?: IRCache) {
    this.cache = cache ?? globalIRCache;
  }

  /**
   * Emit a semantic diagnostic during IR compilation.
   * This is the compiler's mechanism for reporting semantic errors
   * beyond what the parser catches (e.g., duplicate constraint codes).
   */
  private emitDiagnostic(
    severity: 'error' | 'warning',
    message: string,
    line?: number,
    column?: number,
  ): void {
    this.diagnostics.push({ severity, message, line, column });
  }

  async compileToIR(source: string, options?: { useCache?: boolean; sourcePath?: string }): Promise<CompileToIRResult> {
    this.diagnostics = [];

    // vNext: Check cache before compilation
    const useCache = options?.useCache ?? true;
    if (useCache) {
      const contentHash = await computeContentHash(source);
      const cached = this.cache.get(contentHash);
      if (cached) {
        return { ir: cached as IR, diagnostics: [] };
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

    const ir = await this.transformProgram(program, source, options?.sourcePath);

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

  private async transformProgram(program: ManifestProgram, source: string, sourcePath?: string): Promise<IR> {
    const modules: IRModule[] = program.modules.map(m => this.transformModule(m));
    const values: IRValueObject[] = program.values.map(v => this.transformValueObject(v));
    const entities: IREntity[] = [
      ...program.entities.map(e => this.transformEntity(e)),
      ...program.modules.flatMap(m => m.entities.map(e => this.transformEntity(e, m.name))),
    ];

    const enums: IREnum[] = [
      ...program.enums.map(e => this.transformEnum(e)),
      ...program.modules.flatMap(m => m.enums.map(e => this.transformEnum(e, m.name))),
    ];

    // Collect entity-scoped stores (defined as "store in <target>" inside entity)
    // Target can be a built-in name or a custom adapter scheme registered via plugin API.
    const entityScopedStores: IRStore[] = [
      ...program.entities.filter(e => e.store).map(e => ({
        entity: e.name,
        target: e.store === 'filesystem' ? 'localStorage' as const : e.store!,
        config: {},
      })),
      ...program.modules.flatMap(m =>
        m.entities.filter(e => e.store).map(e => ({
          entity: e.name,
          target: e.store === 'filesystem' ? 'localStorage' as const : e.store!,
          config: {},
        }))
      ),
    ];

    const stores: IRStore[] = [
      ...program.stores.map(s => this.transformStore(s)),
      ...program.modules.flatMap(m => m.stores.map(s => this.transformStore(s))),
      ...entityScopedStores,
    ];
    const events: IREvent[] = [
      ...program.events.map(e => this.transformEvent(e)),
      ...program.modules.flatMap(m => m.events.map(e => this.transformEvent(e))),
    ];
    const commands: IRCommand[] = [
      ...program.commands.map(c => this.transformCommand(c)),
      ...program.modules.flatMap(m => m.commands.map(c => this.transformCommand(c, m.name))),
      ...program.entities.flatMap(e => {
        // Get default policies from entity for expansion
        const defaultPolicies = e.policies.filter(p => p.isDefault).map(p => p.name);
        return e.commands.map(c => this.transformCommand(c, undefined, e.name, defaultPolicies));
      }),
      ...program.modules.flatMap(m => m.entities.flatMap(e => {
        // Get default policies from entity for expansion
        const defaultPolicies = e.policies.filter(p => p.isDefault).map(p => p.name);
        return e.commands.map(c => this.transformCommand(c, m.name, e.name, defaultPolicies));
      })),
    ];

    // Synthesize completion/failure events for async commands.
    // Synthesized events are appended after user-declared events, sorted
    // among themselves by name for deterministic output.
    const userEventNames = new Set(events.map(e => e.name));
    const synthesizedEvents: IREvent[] = [];
    for (const cmd of commands) {
      if (cmd.async && cmd.completionEvent && cmd.failureEvent) {
        // Check for user-declared event name collisions
        if (userEventNames.has(cmd.completionEvent)) {
          this.emitDiagnostic(
            'error',
            `Async command '${cmd.name}' auto-generates event '${cmd.completionEvent}' which collides with a user-declared event of the same name.`,
          );
        }
        if (userEventNames.has(cmd.failureEvent)) {
          this.emitDiagnostic(
            'error',
            `Async command '${cmd.name}' auto-generates event '${cmd.failureEvent}' which collides with a user-declared event of the same name.`,
          );
        }

        // Synthesize completion event
        synthesizedEvents.push({
          name: cmd.completionEvent,
          channel: `jobs.${cmd.name}`,
          payload: [
            { name: 'jobId', type: { name: 'string', nullable: false }, required: true },
            { name: 'result', type: { name: 'any', nullable: true }, required: false },
            { name: 'completedAt', type: { name: 'number', nullable: false }, required: true },
          ],
        });

        // Synthesize failure event
        synthesizedEvents.push({
          name: cmd.failureEvent,
          channel: `jobs.${cmd.name}`,
          payload: [
            { name: 'jobId', type: { name: 'string', nullable: false }, required: true },
            { name: 'error', type: { name: 'string', nullable: false }, required: true },
            { name: 'failedAt', type: { name: 'number', nullable: false }, required: true },
          ],
        });
      }
    }
    // Sort synthesized events by name for deterministic output, then append
    synthesizedEvents.sort((a, b) => a.name.localeCompare(b.name));
    events.push(...synthesizedEvents);

    this.diagnostics.push(...validateCommandIntentRegistry(
      collectCommandIntentEntries(program, sourcePath),
    ));

    const policies: IRPolicy[] = [
      ...program.policies.map(p => this.transformPolicy(p)),
      ...program.modules.flatMap(m => m.policies.map(p => this.transformPolicy(p, m.name))),
      // Extract entity-scoped policies with entity name
      ...program.entities.flatMap(e => e.policies.map(p => this.transformPolicy(p, undefined, e.name))),
      ...program.modules.flatMap(m => m.entities.flatMap(e => e.policies.map(p => this.transformPolicy(p, m.name, e.name)))),
    ];

    const reactions: IRReactionRule[] = [
      ...(program.reactions || []).map(r => this.transformReaction(r)),
      ...program.modules.flatMap(m => (m.reactions || []).map(r => this.transformReaction(r, m.name))),
      ...program.entities.flatMap(e => (e.reactions || []).map(r => this.transformReaction(r, undefined, e.name))),
      ...program.modules.flatMap(m => m.entities.flatMap(e => (e.reactions || []).map(r => this.transformReaction(r, m.name, e.name)))),
    ];

    const sagas: IRSaga[] = [
      ...(program.sagas || []).map(s => this.transformSaga(s)),
      ...program.modules.flatMap(m => (m.sagas || []).map(s => this.transformSaga(s, m.name))),
    ];

    // Collect and resolve role hierarchy
    const rawRoles: IRRole[] = [
      ...program.roles.map(r => this.transformRole(r)),
      ...program.modules.flatMap(m => m.roles.map(r => this.transformRole(r, m.name))),
    ];
    const roles = this.resolveRoleGraph(rawRoles);

    const webhooks: IRWebhook[] = [
      ...(program.webhooks || []).map(w => this.transformWebhook(w)),
      ...program.modules.flatMap(m => (m.webhooks || []).map(w => this.transformWebhook(w, m.name))),
    ];

    // Create provenance once (single timestamp) then compute hash and stamp irHash.
    // Provenance is created WITHOUT irHash first so the hash covers the entire IR
    // except the irHash field itself. We reuse the same provenance object (same
    // compiledAt) to ensure the runtime can reproduce the hash exactly.
    const tenant: IRTenant | undefined = program.tenant
      ? this.transformTenant(program.tenant)
      : undefined;

    const provenance = await createProvenance(source);
    const irWithoutHash: IR = {
      version: '1.0',
      provenance,
      ...(tenant ? { tenant } : {}),
      modules,
      values,
      entities,
      enums,
      stores,
      events,
      commands,
      policies,
      reactions,
      ...(sagas.length > 0 ? { sagas } : {}),
      ...(roles.length > 0 ? { roles } : {}),
      ...(webhooks.length > 0 ? { webhooks } : {}),
    };

    // Compute the IR hash and add it to the existing provenance
    const irHash = await computeIRHash(irWithoutHash);
    return {
      ...irWithoutHash,
      provenance: { ...provenance, irHash },
    };
  }

  private transformModule(m: { name: string; entities: EntityNode[]; enums: EnumNode[]; commands: CommandNode[]; stores: StoreNode[]; events: OutboxEventNode[]; policies: PolicyNode[]; reactions?: ReactionNode[]; sagas?: SagaNode[]; roles?: RoleNode[]; webhooks?: WebhookNode[] }): IRModule {
    return {
      name: m.name,
      entities: m.entities.map(e => e.name),
      enums: m.enums.map(e => e.name),
      commands: [
        ...m.commands.map(c => c.name),
        ...m.entities.flatMap(e => e.commands.map(c => c.name)),
      ],
      stores: m.stores.map(s => s.entity),
      events: m.events.map(e => e.name), // Entity-scoped events emit parser warning
      policies: [
        ...m.policies.map(p => p.name),
        ...m.entities.flatMap(e => e.policies.map(p => p.name)),
      ],
      ...((m.reactions && m.reactions.length > 0) ? { reactions: m.reactions.map(r => `${r.event}→${r.targetEntity}.${r.targetCommand}`) } : {}),
      ...((m.sagas && m.sagas.length > 0) ? { sagas: m.sagas.map(s => s.name) } : {}),
      ...((m.roles && m.roles.length > 0) ? { roles: m.roles.map(r => r.name) } : {}),
      ...((m.webhooks && m.webhooks.length > 0) ? { webhooks: m.webhooks.map(w => w.name) } : {}),
    };
  }

  private transformValueObject(v: ValueObjectNode): IRValueObject {
    return {
      name: v.name,
      properties: v.properties.map(p => this.transformProperty(p)),
    };
  }

  private transformTenant(t: TenantNode): IRTenant {
    return {
      property: t.property,
      type: this.transformType(t.dataType),
      contextPath: t.contextPath,
    };
  }

  private transformEntity(e: EntityNode, moduleName?: string): IREntity {
    const constraints = e.constraints.map(c => this.transformConstraint(c));
    this.validateConstraintCodeUniqueness(constraints, e.constraints, `entity '${e.name}'`);

    // Separate default policies from regular policies
    const defaultPolicies = e.policies.filter(p => p.isDefault).map(p => p.name);
    const regularPolicies = e.policies.filter(p => !p.isDefault).map(p => p.name);

    const properties = e.properties.map(p => this.transformProperty(p));

    // Validate searchable modifier: only valid on string properties
    for (const p of e.properties) {
      if (p.modifiers.includes('searchable') && p.dataType.name !== 'string') {
        this.emitDiagnostic('error', `Property '${p.name}' on entity '${e.name}': 'searchable' modifier is only valid on string properties (got '${p.dataType.name}').`);
      }
    }

    if (e.timestamps) {
      const hasCreatedAt = properties.some(p => p.name === 'createdAt');
      const hasUpdatedAt = properties.some(p => p.name === 'updatedAt');
      if (!hasCreatedAt) {
        properties.push({ name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['readonly'] });
      }
      if (!hasUpdatedAt) {
        properties.push({ name: 'updatedAt', type: { name: 'datetime', nullable: false }, modifiers: ['readonly'] });
      }
    }

    return {
      name: e.name,
      module: moduleName,
      properties,
      computedProperties: e.computedProperties.map(cp => this.transformComputedProperty(cp)),
      relationships: e.relationships.map(r => this.transformRelationship(r)),
      commands: e.commands.map(c => c.name),
      constraints,
      policies: regularPolicies,
      ...(defaultPolicies.length > 0 ? { defaultPolicies } : {}),
      ...(e.key ? { key: e.key } : {}),
      ...(e.alternateKeys && e.alternateKeys.length > 0 ? { alternateKeys: e.alternateKeys } : {}),
      versionProperty: e.versionProperty,
      versionAtProperty: e.versionAtProperty,
      ...(e.timestamps ? { timestamps: true } : {}),
      ...(e.realtime ? { realtime: true } : {}),
      ...(e.transitions.length > 0 ? { transitions: e.transitions.map(t => this.transformTransition(t)) } : {}),
      ...(e.approvals.length > 0 ? { approvals: e.approvals.map(a => this.transformApproval(a, e)) } : {}),
    };
  }

  private transformTransition(t: TransitionNode): IRTransition {
    return {
      property: t.property,
      from: t.from,
      to: t.to,
    };
  }

  private transformApproval(a: ApprovalNode, entity: EntityNode): IRApproval {
    // Validate: command must reference an existing command on this entity
    const commandNames = entity.commands.map(c => c.name);
    if (!commandNames.includes(a.command)) {
      this.emitDiagnostic(
        'error',
        `Approval '${a.name}' references command '${a.command}' which does not exist on entity '${entity.name}'. Available commands: ${commandNames.join(', ') || '(none)'}`,
        a.position?.line,
        a.position?.column,
      );
    }

    // Validate: at least one stage required
    if (a.stages.length === 0) {
      this.emitDiagnostic(
        'error',
        `Approval '${a.name}' must declare at least one stage`,
        a.position?.line,
        a.position?.column,
      );
    }

    // Validate: stage names unique within this approval
    const stageNames = new Set<string>();
    for (const s of a.stages) {
      if (stageNames.has(s.name)) {
        this.emitDiagnostic(
          'error',
          `Duplicate stage name '${s.name}' in approval '${a.name}'`,
          s.position?.line,
          s.position?.column,
        );
      }
      stageNames.add(s.name);
    }

    const node: IRApproval = {
      name: a.name,
      command: a.command,
      stages: a.stages.map(s => this.transformApprovalStage(s)),
      emits: a.emits,
    };
    if (a.timeout !== undefined) node.timeout = a.timeout;
    if (a.onTimeout !== undefined) node.onTimeout = a.onTimeout;
    return node;
  }

  private transformApprovalStage(s: ApprovalStageNode): IRApprovalStage {
    const node: IRApprovalStage = {
      name: s.name,
      policy: this.transformExpression(s.policy),
      required: s.required,
    };
    if (s.when) node.when = this.transformExpression(s.when);
    return node;
  }

  private transformEnum(e: EnumNode, moduleName?: string): IREnum {
    return {
      name: e.name,
      module: moduleName,
      values: e.values.map(v => ({
        name: v.name,
        ...(v.label ? { label: v.label } : {}),
        ...(v.ordinal !== undefined ? { ordinal: v.ordinal } : {}),
      })),
    };
  }

  private transformProperty(p: PropertyNode): IRProperty {
    const prop: IRProperty = {
      name: p.name,
      type: this.transformType(p.dataType),
      defaultValue: p.defaultValue ? this.transformExprToValue(p.defaultValue) : undefined,
      modifiers: p.modifiers as PropertyModifier[],
    };
    // Invariant: 'masked' ∈ modifiers ⇔ maskStrategy present (bare masked ⇒ redact)
    if (p.modifiers.includes('masked')) {
      prop.maskStrategy = this.transformMaskStrategy(p);
    }
    return prop;
  }

  private static readonly MASK_STRATEGY_ARITY: Record<MaskStrategyType, number> = {
    redact: 0,
    partial: 2,
    email: 0,
    phone: 0,
    last4: 0,
  };

  private transformMaskStrategy(p: PropertyNode): IRMaskStrategy {
    const declared = p.maskStrategy ?? { type: 'redact' };
    const known = Object.keys(IRCompiler.MASK_STRATEGY_ARITY);
    if (!known.includes(declared.type)) {
      this.emitDiagnostic(
        'error',
        `Property '${p.name}': Unknown masking strategy '${declared.type}'. Known strategies: ${known.join(', ')}.`
      );
      return { type: 'redact', ...(p.unmaskWhen ? { unmaskWhen: this.transformExpression(p.unmaskWhen) } : {}) };
    }
    const type = declared.type as MaskStrategyType;
    const params = declared.params ?? [];
    const arity = IRCompiler.MASK_STRATEGY_ARITY[type];
    if (params.length !== arity) {
      if (arity === 0) {
        this.emitDiagnostic(
          'error',
          `Property '${p.name}': masking strategy '${type}' takes no parameters (got ${params.length}).`
        );
      } else {
        this.emitDiagnostic(
          'error',
          `Property '${p.name}': masking strategy '${type}' requires exactly ${arity} parameters (got ${params.length}).`
        );
      }
    } else if (params.some(n => !Number.isInteger(n) || n < 0)) {
      this.emitDiagnostic(
        'error',
        `Property '${p.name}': masking strategy '${type}' parameters must be non-negative integers (got ${params.join(', ')}).`
      );
    }
    return {
      type,
      ...(params.length > 0 ? { params } : {}),
      ...(p.unmaskWhen ? { unmaskWhen: this.transformExpression(p.unmaskWhen) } : {}),
    };
  }

  private transformComputedProperty(cp: ComputedPropertyNode): IRComputedProperty {
    const result: IRComputedProperty = {
      name: cp.name,
      type: this.transformType(cp.dataType),
      expression: this.transformExpression(cp.expression),
      dependencies: cp.dependencies,
    };
    if (cp.cache) {
      result.cache = { strategy: cp.cache.strategy };
      if (cp.cache.ttlSeconds !== undefined) {
        result.cache.ttlSeconds = cp.cache.ttlSeconds;
      }
    }
    return result;
  }

  private transformRelationship(r: RelationshipNode): IRRelationship {
    let foreignKey: IRForeignKey | undefined;
    if (r.fields) {
      foreignKey = { fields: r.fields };
      if (r.references) foreignKey.references = r.references;
    }
    return {
      name: r.name,
      kind: r.kind,
      target: r.target,
      ...(foreignKey ? { foreignKey } : {}),
      ...(r.through ? { through: r.through } : {}),
      ...(r.onDelete ? { onDelete: r.onDelete } : {}),
      ...(r.onUpdate ? { onUpdate: r.onUpdate } : {}),
    };
  }

  private transformConstraint(c: ConstraintNode): IRConstraint {
    return {
      name: c.name,
      code: c.code || c.name, // Default to name if code not specified
      expression: this.transformExpression(c.expression),
      severity: c.severity || 'block', // Default to block
      message: c.message,
      messageTemplate: c.messageTemplate,
      detailsMapping: c.detailsMapping
        ? Object.fromEntries(
            Object.entries(c.detailsMapping).map(([k, v]) => [k, this.transformExpression(v)])
          )
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
  private validateConstraintCodeUniqueness(
    irConstraints: IRConstraint[],
    astConstraints: ConstraintNode[],
    scope: string,
  ): void {
    const seen = new Map<string, number>(); // code → first occurrence index
    for (let i = 0; i < irConstraints.length; i++) {
      const code = irConstraints[i].code;
      const firstIdx = seen.get(code);
      if (firstIdx !== undefined) {
        // Duplicate found — emit error at the duplicate's location
        const astNode = astConstraints[i];
        this.emitDiagnostic(
          'error',
          `Duplicate constraint code '${code}' in ${scope}. First defined at constraint '${irConstraints[firstIdx].name}'.`,
          astNode.position?.line,
          astNode.position?.column,
        );
      } else {
        seen.set(code, i);
      }
    }
  }

  private transformStore(s: StoreNode): IRStore {
    const config: Record<string, IRValue> = {};
    if (s.config) {
      for (const [k, v] of Object.entries(s.config)) {
        const val = this.transformExprToValue(v);
        if (val) config[k] = val;
      }
    }
    return {
      entity: s.entity,
      target: s.target,
      config,
    };
  }

  private transformEvent(e: OutboxEventNode): IREvent {
    if ('fields' in e.payload) {
      return {
        name: e.name,
        channel: e.channel,
        payload: (e.payload.fields as ParameterNode[]).map(f => ({
          name: f.name,
          type: this.transformType(f.dataType),
          required: f.required,
        })),
      };
    }
    return {
      name: e.name,
      channel: e.channel,
      payload: this.transformType(e.payload as TypeNode),
    };
  }

  private transformReaction(r: ReactionNode, moduleName?: string, entityName?: string): IRReactionRule {
    const params: IRReactionParam[] | undefined = r.params?.map(p => ({
      name: p.name,
      expression: this.transformExpression(p.expression),
    }));
    return {
      event: r.event,
      targetEntity: r.targetEntity,
      targetCommand: r.targetCommand,
      resolve: this.transformExpression(r.resolve),
      ...(params && params.length > 0 ? { params } : {}),
      ...(moduleName ? { module: moduleName } : {}),
      ...(entityName ? { entity: entityName } : {}),
    };
  }

  private transformSaga(s: SagaNode, moduleName?: string): IRSaga {
    const steps: IRSagaStep[] = s.steps.map(step => ({
      name: step.name,
      commandEntity: step.commandEntity,
      command: step.command,
      ...(step.compensate
        ? { compensateEntity: step.compensateEntity ?? step.commandEntity, compensate: step.compensate }
        : {}),
    }));
    return {
      name: s.name,
      ...(moduleName ? { module: moduleName } : {}),
      steps,
      onFailure: s.onFailure,
      emits: s.emits,
    };
  }

  private transformWebhook(w: WebhookNode, moduleName?: string): IRWebhook {
    const transform: IRWebhookParam[] | undefined = w.transform?.map(p => ({
      name: p.name,
      expression: this.transformExpression(p.expression),
    }));

    let signature: IRWebhookSignature | undefined;
    if (w.signature) {
      signature = {
        algorithm: w.signature.algorithm,
        header: w.signature.header,
        secret: w.signature.secret,
      };
    }

    return {
      name: w.name,
      ...(moduleName ? { module: moduleName } : {}),
      path: w.path,
      ...(w.method ? { method: w.method } : {}),
      command: w.command,
      ...(w.entity ? { entity: w.entity } : {}),
      ...(signature ? { signature } : {}),
      ...(w.idempotencyHeader ? { idempotencyHeader: w.idempotencyHeader } : {}),
      ...(transform && transform.length > 0 ? { transform } : {}),
    };
  }

  private transformCommand(c: CommandNode, moduleName?: string, entityName?: string, entityDefaultPolicies?: string[]): IRCommand {
    const constraints = (c.constraints || []).map(con => this.transformConstraint(con));
    if (c.constraints && c.constraints.length > 0) {
      const scope = entityName ? `command '${entityName}.${c.name}'` : `command '${c.name}'`;
      this.validateConstraintCodeUniqueness(constraints, c.constraints, scope);
    }

    // Expand entity default policies into command policies
    // Per spec: commands without explicit policies inherit entity defaults
    const commandPolicies = entityDefaultPolicies && entityDefaultPolicies.length > 0
      ? [...entityDefaultPolicies]
      : undefined;

    const cmd: IRCommand = {
      name: c.name,
      module: moduleName,
      entity: entityName,
      parameters: c.parameters.map(p => this.transformParameter(p)),
      guards: (c.guards || []).map(g => this.transformExpression(g)),
      constraints,
      ...(commandPolicies ? { policies: commandPolicies } : {}),
      actions: c.actions.map(a => this.transformAction(a)),
      emits: c.emits || [],
      returns: c.returns ? this.transformType(c.returns) : undefined,
    };

    if (c.async) {
      cmd.async = true;
      cmd.completionEvent = `${c.name}Completed`;
      cmd.failureEvent = `${c.name}Failed`;
    }

    return cmd;
  }

  private transformParameter(p: ParameterNode): IRParameter {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      required: p.required,
      defaultValue: p.defaultValue ? this.transformExprToValue(p.defaultValue) : undefined,
    };
  }

  private transformAction(a: ActionNode): IRAction {
    return {
      kind: a.kind,
      target: a.target,
      expression: this.transformExpression(a.expression),
    };
  }

  private transformPolicy(p: PolicyNode, moduleName?: string, entityName?: string): IRPolicy {
    return {
      name: p.name,
      module: moduleName,
      entity: entityName,
      action: p.action,
      expression: this.transformExpression(p.expression),
      message: p.message,
    };
  }

  private transformRole(r: RoleNode, moduleName?: string): IRRole {
    const sortPerm = (a: IRRolePermission, b: IRRolePermission) => {
      const ac = a.action.localeCompare(b.action);
      if (ac !== 0) return ac;
      return (a.target ?? '').localeCompare(b.target ?? '');
    };
    const allow: IRRolePermission[] = r.permissions
      .filter(p => p.kind === 'allow')
      .map(p => ({ action: p.action, ...(p.target ? { target: p.target } : {}) }))
      .sort(sortPerm);
    const deny: IRRolePermission[] = r.permissions
      .filter(p => p.kind === 'deny')
      .map(p => ({ action: p.action, ...(p.target ? { target: p.target } : {}) }))
      .sort(sortPerm);
    return {
      name: r.name,
      ...(moduleName ? { module: moduleName } : {}),
      ...(r.parent ? { parent: r.parent } : {}),
      allow,
      deny,
      effectivePermissions: [], // filled in by resolveRoleGraph
    };
  }

  /**
   * Resolve the role inheritance graph:
   * 1. Validate: no duplicate names, no unknown parents, no cycles
   * 2. Flatten inheritance: root-first union of allows
   * 3. Apply deny: any (action, target) that appears in ANY level's deny is removed
   * 4. Sort roles by name for deterministic output
   */
  private resolveRoleGraph(roles: IRRole[]): IRRole[] {
    if (roles.length === 0) return [];

    const byName = new Map<string, IRRole>();
    for (const role of roles) {
      if (byName.has(role.name)) {
        this.emitDiagnostic('error', `Duplicate role declaration '${role.name}'`);
        continue;
      }
      byName.set(role.name, role);
    }

    // Validate parents exist
    for (const role of roles) {
      if (role.parent && !byName.has(role.parent)) {
        this.emitDiagnostic('error', `Role '${role.name}' extends unknown role '${role.parent}'`);
      }
    }

    // Cycle detection via DFS coloring
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const name of byName.keys()) color.set(name, WHITE);

    const hasCycle = (name: string, path: string[]): boolean => {
      color.set(name, GRAY);
      path.push(name);
      const role = byName.get(name);
      if (role?.parent) {
        const parentColor = color.get(role.parent);
        if (parentColor === GRAY) {
          this.emitDiagnostic('error', `Role cycle detected: ${[...path, role.parent].join(' -> ')}`);
          return true;
        }
        if (parentColor === WHITE && hasCycle(role.parent, path)) {
          return true;
        }
      }
      color.set(name, BLACK);
      path.pop();
      return false;
    };

    for (const name of byName.keys()) {
      if (color.get(name) === WHITE) {
        if (hasCycle(name, [])) break;
      }
    }

    // Compute effective permissions for each role
    const computeEffective = (roleName: string, visited: Set<string>): IRRolePermission[] => {
      if (visited.has(roleName)) return []; // cycle guard
      visited.add(roleName);
      const role = byName.get(roleName);
      if (!role) return [];

      // Start with parent's effective permissions (root-first)
      let effective: IRRolePermission[] = [];
      if (role.parent) {
        effective = [...computeEffective(role.parent, visited)];
      }

      // Union with this role's allows
      for (const a of role.allow) {
        const exists = effective.some(e => e.action === a.action && (e.target ?? '') === (a.target ?? ''));
        if (!exists) effective.push({ ...a });
      }

      // Collect all deny entries from the full chain
      const allDenies: IRRolePermission[] = [...role.deny];
      if (role.parent) {
        const collectDenies = (name: string, seen: Set<string>): IRRolePermission[] => {
          if (seen.has(name)) return [];
          seen.add(name);
          const r = byName.get(name);
          if (!r) return [];
          const parentDenies = r.parent ? collectDenies(r.parent, seen) : [];
          return [...parentDenies, ...r.deny];
        };
        allDenies.push(...collectDenies(role.parent, new Set()));
      }

      // Apply deny: remove any permission matching a deny entry
      // 'all' action in deny removes all permissions for that target scope
      effective = effective.filter(perm => {
        return !allDenies.some(d => {
          const actionMatch = d.action === 'all' || d.action === perm.action;
          const targetMatch = d.target === undefined || d.target === perm.target;
          return actionMatch && targetMatch;
        });
      });

      // Expand 'all' action in allows: if effective has an 'all' permission,
      // it means any action check should match (handled at runtime)
      // Keep 'all' as-is in effectivePermissions — runtime handles matching

      const sortPerm = (a: IRRolePermission, b: IRRolePermission) => {
        const ac = a.action.localeCompare(b.action);
        if (ac !== 0) return ac;
        return (a.target ?? '').localeCompare(b.target ?? '');
      };

      return effective.sort(sortPerm);
    };

    for (const role of byName.values()) {
      role.effectivePermissions = computeEffective(role.name, new Set());
    }

    // Sort roles by name for deterministic output
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private transformType(t: TypeNode): IRType {
    return {
      name: t.name,
      generic: t.generic ? this.transformType(t.generic) : undefined,
      nullable: t.nullable,
      ...(t.params ? { params: t.params } : {}),
    };
  }

  private transformExpression(expr: ExpressionNode): IRExpression {
    switch (expr.type) {
      case 'Literal': {
        const lit = expr as { value: string | number | boolean | null; dataType: string };
        return {
          kind: 'literal',
          value: this.literalToValue(lit.value, lit.dataType),
        };
      }
      case 'Identifier': {
        return { kind: 'identifier', name: (expr as { name: string }).name };
      }
      case 'MemberAccess': {
        const ma = expr as { object: ExpressionNode; property: string };
        return {
          kind: 'member',
          object: this.transformExpression(ma.object),
          property: ma.property,
        };
      }
      case 'BinaryOp': {
        const bo = expr as { operator: string; left: ExpressionNode; right: ExpressionNode };
        return {
          kind: 'binary',
          operator: bo.operator,
          left: this.transformExpression(bo.left),
          right: this.transformExpression(bo.right),
        };
      }
      case 'UnaryOp': {
        const uo = expr as { operator: string; operand: ExpressionNode };
        return {
          kind: 'unary',
          operator: uo.operator,
          operand: this.transformExpression(uo.operand),
        };
      }
      case 'Call': {
        const call = expr as { callee: ExpressionNode; arguments: ExpressionNode[]; position?: { line?: number; column?: number } };
        const irCall: IRExpression = {
          kind: 'call',
          callee: this.transformExpression(call.callee),
          args: call.arguments.map(a => this.transformExpression(a)),
        };
        // Compile-time regex validation for matches(value, pattern)
        if (irCall.kind === 'call' &&
            irCall.callee.kind === 'identifier' &&
            irCall.callee.name === 'matches' &&
            irCall.args.length >= 2) {
          const patternArg = irCall.args[1];
          if (patternArg.kind === 'literal' && patternArg.value?.kind === 'string') {
            try {
              new RegExp(patternArg.value.value);
            } catch {
              this.emitDiagnostic(
                'error',
                `Invalid regex pattern in matches(): "${patternArg.value.value}"`,
                call.position?.line,
                call.position?.column,
              );
            }
          }
        }
        return irCall;
      }
      case 'Conditional': {
        const cond = expr as { condition: ExpressionNode; consequent: ExpressionNode; alternate: ExpressionNode };
        return {
          kind: 'conditional',
          condition: this.transformExpression(cond.condition),
          consequent: this.transformExpression(cond.consequent),
          alternate: this.transformExpression(cond.alternate),
        };
      }
      case 'Array': {
        const arr = expr as { elements: ExpressionNode[] };
        return {
          kind: 'array',
          elements: arr.elements.map(e => this.transformExpression(e)),
        };
      }
      case 'Object': {
        const obj = expr as { properties: { key: string; value: ExpressionNode }[] };
        return {
          kind: 'object',
          properties: obj.properties.map(p => ({
            key: p.key,
            value: this.transformExpression(p.value),
          })),
        };
      }
      case 'Lambda': {
        const lam = expr as { parameters: string[]; body: ExpressionNode };
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

  private transformExprToValue(expr: ExpressionNode): IRValue | undefined {
    if (expr.type === 'Identifier') {
      // Enum member defaults (e.g. `property status: Status = draft`) lower to string IRValues.
      return { kind: 'string', value: (expr as { name: string }).name };
    }
    if (expr.type === 'Literal') {
      const lit = expr as { value: string | number | boolean | null; dataType: string };
      return this.literalToValue(lit.value, lit.dataType);
    }
    if (expr.type === 'Array') {
      const arr = expr as { elements: ExpressionNode[] };
      const elements = arr.elements.map(e => this.transformExprToValue(e)).filter((v): v is IRValue => v !== undefined);
      return { kind: 'array', elements };
    }
    if (expr.type === 'Object') {
      const obj = expr as { properties: { key: string; value: ExpressionNode }[] };
      const properties: Record<string, IRValue> = {};
      for (const p of obj.properties) {
        const v = this.transformExprToValue(p.value);
        if (v) properties[p.key] = v;
      }
      return { kind: 'object', properties };
    }
    return undefined;
  }

  private literalToValue(value: string | number | boolean | null, dataType: string): IRValue {
    if (dataType === 'string') return { kind: 'string', value: value as string };
    if (dataType === 'number') return { kind: 'number', value: value as number };
    if (dataType === 'boolean') return { kind: 'boolean', value: value as boolean };
    return { kind: 'null' };
  }
}

export async function compileToIR(source: string, options?: { useCache?: boolean; sourcePath?: string }): Promise<CompileToIRResult> {
  const compiler = new IRCompiler();
  return compiler.compileToIR(source, options);
}
