/**
 * Apply naming.normalization policy to a parsed ManifestProgram.
 * Mutates the AST in place when mismatch=fix; otherwise diagnoses only.
 * No-op when policy.normalization is false (backward-compatible default).
 */

import type {
  ManifestProgram,
  ModuleNode,
  EntityNode,
  ExpressionNode,
  CommandNode,
  RelationshipNode,
} from './types.js';
import {
  CanonicalNameRegistry,
  isMechanicalIdAlias,
  isReservedIdentifier,
  isAmbiguousFlatSpelling,
  relationshipIdField,
  nameKey,
} from './canonical-names.js';
import type { ResolvedNamingConfig, NamingRuleSeverity } from './naming-config.js';

export type CanonicalizeDiagnostic = {
  severity: 'error' | 'warning';
  message: string;
};

function decideName(
  original: string,
  canonical: string,
  mismatch: NamingRuleSeverity,
  ruleLabel: string,
  diagnostics: CanonicalizeDiagnostic[],
): string {
  if (original === canonical || mismatch === 'off') return original;
  const msg =
    `Naming mismatch under ${ruleLabel}: '${original}' → canonical '${canonical}' ` +
    `(mismatch=${mismatch}).`;
  if (mismatch === 'warn') {
    diagnostics.push({ severity: 'warning', message: `${msg} Source spelling preserved.` });
    return original;
  }
  if (mismatch === 'error') {
    diagnostics.push({
      severity: 'error',
      message: `${msg} Fix the spelling, add an alias, or set mismatch: fix.`,
    });
    return original;
  }
  diagnostics.push({
    severity: 'warning',
    message: `${msg} Normalized in generated output (source files unchanged).`,
  });
  return canonical;
}

export function collectCanonicalDeclarations(
  programs: ManifestProgram[],
  registry: CanonicalNameRegistry = new CanonicalNameRegistry(),
): CanonicalNameRegistry {
  for (const program of programs) seedProgram(program, registry);
  return registry;
}

function seedProgram(program: ManifestProgram, registry: CanonicalNameRegistry): void {
  for (const e of program.entities) registry.addEntity(e.name);
  for (const en of program.enums) registry.addEnum(en.name);
  for (const v of program.values) registry.addValue(v.name);
  for (const ev of program.events) registry.addEvent(ev.name);
  for (const mod of program.modules) {
    for (const e of mod.entities) registry.addEntity(e.name);
    for (const en of mod.enums) registry.addEnum(en.name);
    for (const ev of mod.events) registry.addEvent(ev.name);
  }
}

export function canonicalizeProgramNames(
  program: ManifestProgram,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  diagnostics: CanonicalizeDiagnostic[] = [],
): CanonicalizeDiagnostic[] {
  if (!policy.normalization) return diagnostics;
  registry.setPolicy(policy);
  const seen = new Set<string>();
  const buf: CanonicalizeDiagnostic[] = [];
  const track = (d: CanonicalizeDiagnostic) => {
    if (seen.has(d.message)) return;
    seen.add(d.message);
    buf.push(d);
  };

  for (const e of program.entities) {
    if (isAmbiguousFlatSpelling(e.name) && policy.ambiguousWordBoundaries !== 'off') {
      const sev = policy.ambiguousWordBoundaries === 'error' ? 'error' : 'warning';
      if (policy.ambiguousWordBoundaries === 'error' || policy.ambiguousWordBoundaries === 'warn') {
        track({
          severity: sev,
          message:
            `Ambiguous word boundaries for entity '${e.name}': no camelCase/separator split ` +
            `proven in the project. Prefer EventDate / event_date, or set naming.ambiguousWordBoundaries.`,
        });
      }
    }
  }

  walkProgram(program, registry, policy, track);
  for (const mod of program.modules) walkModule(mod, registry, policy, track);
  diagnostics.push(...buf);
  return diagnostics;
}

type Track = (d: CanonicalizeDiagnostic) => void;

function walkProgram(
  program: ManifestProgram,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  track: Track,
): void {
  const diags: CanonicalizeDiagnostic[] = [];
  const push = (d: CanonicalizeDiagnostic) => {
    diags.push(d);
    track(d);
  };
  for (const e of program.entities) walkEntity(e, registry, policy, push);
  for (const en of program.enums) {
    en.name = decideName(
      en.name,
      registry.enum(en.name),
      policy.entities.mismatch,
      'naming.entities',
      diags,
    );
    for (const v of en.values) {
      v.name = decideName(
        v.name,
        registry.field(v.name),
        policy.fields.mismatch,
        'naming.fields',
        diags,
      );
    }
  }
  for (const v of program.values) {
    v.name = decideName(
      v.name,
      registry.value(v.name),
      policy.entities.mismatch,
      'naming.entities',
      diags,
    );
    for (const p of v.properties) {
      p.name = decideName(
        p.name,
        registry.field(p.name),
        policy.fields.mismatch,
        'naming.fields',
        diags,
      );
    }
  }
  for (const c of program.commands) walkCommand(c, registry, policy, push);
  for (const s of program.stores) {
    s.entity = decideName(
      s.entity,
      registry.entity(s.entity),
      policy.entities.mismatch,
      'naming.entities',
      diags,
    );
  }
  for (const e of program.events) {
    e.name = decideName(
      e.name,
      registry.event(e.name),
      policy.events.mismatch,
      'naming.events',
      diags,
    );
  }
  for (const r of program.reactions) {
    r.event = decideName(
      r.event,
      registry.event(r.event),
      policy.events.mismatch,
      'naming.events',
      diags,
    );
    r.targetEntity = decideName(
      r.targetEntity,
      registry.entity(r.targetEntity),
      policy.entities.mismatch,
      'naming.entities',
      diags,
    );
    r.targetCommand = decideName(
      r.targetCommand,
      registry.command(r.targetCommand),
      policy.commands.mismatch,
      'naming.commands',
      diags,
    );
  }
  if (program.tenant) {
    program.tenant.property = decideName(
      program.tenant.property,
      registry.field(program.tenant.property),
      policy.fields.mismatch,
      'naming.fields',
      diags,
    );
  }
}

function walkModule(
  mod: ModuleNode,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  track: Track,
): void {
  const fake = {
    entities: mod.entities,
    enums: mod.enums,
    values: [],
    commands: mod.commands,
    stores: mod.stores,
    events: mod.events,
    reactions: mod.reactions,
    modules: [],
    policies: mod.policies,
    sagas: mod.sagas,
    roles: mod.roles,
    webhooks: mod.webhooks,
    schedules: mod.schedules,
    uses: [],
    flows: [],
    effects: [],
    exposures: [],
    compositions: [],
  } as ManifestProgram;
  walkProgram(fake, registry, policy, track);
}

function walkEntity(
  entity: EntityNode,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  push: Track,
): void {
  const diags: CanonicalizeDiagnostic[] = [];
  const note = (d: CanonicalizeDiagnostic) => {
    diags.push(d);
    push(d);
  };
  entity.name = decideName(
    entity.name,
    registry.entity(entity.name),
    policy.entities.mismatch,
    'naming.entities',
    diags,
  );
  if (entity.parent) {
    entity.parent = decideName(
      entity.parent,
      registry.entity(entity.parent),
      policy.entities.mismatch,
      'naming.entities',
      diags,
    );
  }
  if (entity.mixins) {
    entity.mixins = entity.mixins.map((m) =>
      decideName(m, registry.entity(m), policy.entities.mismatch, 'naming.entities', diags),
    );
  }
  for (const p of entity.properties) {
    p.name = decideName(
      p.name,
      registry.field(p.name),
      policy.fields.mismatch,
      'naming.fields',
      diags,
    );
  }
  for (const cp of entity.computedProperties) {
    cp.name = decideName(
      cp.name,
      registry.field(cp.name),
      policy.fields.mismatch,
      'naming.fields',
      diags,
    );
    rewriteExpr(cp.expression, registry, policy, note);
  }
  for (const r of entity.relationships) walkRelationship(entity.name, r, registry, policy, note);
  for (const c of entity.commands) walkCommand(c, registry, policy, note);
  for (const d of diags) push(d);
}

function walkRelationship(
  entityName: string,
  r: RelationshipNode,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  push: Track,
): void {
  const diags: CanonicalizeDiagnostic[] = [];
  r.name = decideName(
    r.name,
    registry.relationship(r.name),
    policy.relationships.mismatch,
    'naming.relationships',
    diags,
  );
  r.target = decideName(
    r.target,
    registry.entity(r.target),
    policy.entities.mismatch,
    'naming.entities',
    diags,
  );
  const expectedFk = relationshipIdField(r.name, policy);
  if (r.fields) {
    r.fields = r.fields.map((field) => {
      if (nameKey(field) === 'tenantid') {
        return decideName(
          field,
          registry.field(field),
          policy.fields.mismatch,
          'naming.fields',
          diags,
        );
      }
      if (isMechanicalIdAlias(r.name, field, policy)) {
        return decideName(
          field,
          expectedFk,
          policy.relationships.mismatch,
          'naming.relationships.id',
          diags,
        );
      }
      if (/id$/i.test(nameKey(field))) {
        const d: CanonicalizeDiagnostic = {
          severity: 'error',
          message:
            `Relationship '${entityName}.${r.name}' foreign-key field '${field}' is not a spelling of ` +
            `'${expectedFk}'. Add naming.aliases (e.g. writer: author) if intentional, or rename.`,
        };
        diags.push(d);
        push(d);
        return decideName(
          field,
          registry.field(field),
          policy.fields.mismatch,
          'naming.fields',
          diags,
        );
      }
      return decideName(
        field,
        registry.field(field),
        policy.fields.mismatch,
        'naming.fields',
        diags,
      );
    });
  }
  for (const d of diags) push(d);
}

function walkCommand(
  c: CommandNode,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  push: Track,
): void {
  const diags: CanonicalizeDiagnostic[] = [];
  c.name = decideName(
    c.name,
    registry.command(c.name),
    policy.commands.mismatch,
    'naming.commands',
    diags,
  );
  for (const p of c.parameters) {
    p.name = decideName(
      p.name,
      registry.field(p.name),
      policy.fields.mismatch,
      'naming.fields',
      diags,
    );
  }
  for (const g of c.guards ?? []) rewriteExpr(g, registry, policy, push);
  for (const a of c.actions) {
    if (a.target) {
      a.target = decideName(
        a.target,
        registry.field(a.target),
        policy.fields.mismatch,
        'naming.fields',
        diags,
      );
    }
    rewriteExpr(a.expression, registry, policy, push);
  }
  if (c.emits) {
    c.emits = c.emits.map((e) =>
      decideName(e, registry.event(e), policy.events.mismatch, 'naming.events', diags),
    );
  }
  for (const d of diags) push(d);
}

function rewriteExpr(
  expr: ExpressionNode,
  registry: CanonicalNameRegistry,
  policy: ResolvedNamingConfig,
  push: Track,
): void {
  const diags: CanonicalizeDiagnostic[] = [];
  if (expr.type === 'Identifier') {
    const id = expr as { name: string };
    if (!isReservedIdentifier(id.name)) {
      id.name = decideName(
        id.name,
        registry.identifier(id.name),
        policy.fields.mismatch,
        'naming.fields',
        diags,
      );
    }
  } else if (expr.type === 'MemberAccess') {
    const ma = expr as { object: ExpressionNode; property: string };
    rewriteExpr(ma.object, registry, policy, push);
    ma.property = decideName(
      ma.property,
      registry.field(ma.property),
      policy.fields.mismatch,
      'naming.fields',
      diags,
    );
  } else if (expr.type === 'BinaryOp') {
    const bo = expr as { left: ExpressionNode; right: ExpressionNode };
    rewriteExpr(bo.left, registry, policy, push);
    rewriteExpr(bo.right, registry, policy, push);
  } else if (expr.type === 'Call') {
    const call = expr as { callee: ExpressionNode; arguments: ExpressionNode[] };
    rewriteExpr(call.callee, registry, policy, push);
    for (const a of call.arguments) rewriteExpr(a, registry, policy, push);
  }
  for (const d of diags) push(d);
}
