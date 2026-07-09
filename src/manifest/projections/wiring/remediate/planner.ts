/**
 * Converts proven wiring inspect findings into machine-readable repair plans.
 *
 * Only emits auto-applicable plans when the correct change is deterministic
 * from Manifest contract + consumer evidence + local source patterns.
 */

import type { WiringContract, WiringCommandDescriptor } from '../types.js';
import type {
  ContractMismatch,
  ConsumerEvidence,
  WiringInspectReport,
} from '../inspect/types.js';
import type {
  RepairPlan,
  RepairPlanBundle,
  RepairDecisionClass,
  RepairKind,
  RepairEditSpec,
  RepairPrecondition,
} from './types.js';
import { WIRING_REPAIR_PLAN_SCHEMA } from './types.js';
import { PatternAdapter } from './pattern-adapter.js';
import { fingerprintSnippet, readObjectPropertyExpression } from './ast-utils.js';

export interface PlanRepairsOptions {
  contract: WiringContract;
  report: WiringInspectReport;
  /** Current application sources (path → content). */
  fileContents: Map<string, string>;
  /** Optional filter. */
  capabilityId?: string;
  findingId?: string;
}

export function planWiringRepairs(options: PlanRepairsOptions): RepairPlanBundle {
  const adapter = new PatternAdapter(options.fileContents);
  const byId = new Map(options.contract.capabilities.map(c => [c.capabilityId, c]));
  const plans: RepairPlan[] = [];

  for (const mismatch of options.report.mismatches) {
    if (options.capabilityId && mismatch.capabilityId !== options.capabilityId) continue;
    const cap = byId.get(mismatch.capabilityId);
    if (!cap && mismatch.kind !== 'stale_capability') continue;

    const evidence = evidenceFor(options.report, mismatch.capabilityId);
    const plan = planFromMismatch(mismatch, cap, evidence, options.fileContents, adapter);
    if (!plan) continue;
    if (options.findingId && plan.findingId !== options.findingId) continue;
    plans.push(plan);
  }

  // Unwired with proven existing control surface
  for (const finding of options.report.findings) {
    if (finding.status !== 'unwired' && finding.status !== 'ambiguous') continue;
    if (options.capabilityId && finding.capabilityId !== options.capabilityId) continue;
    const cap = byId.get(finding.capabilityId);
    if (!cap) continue;
    const surface = adapter.findExistingControlSurface(cap);
    if (!surface) {
      plans.push(ambiguousUnwiredPlan(cap, finding.message));
      continue;
    }
    const plan = planWireExistingControl(cap, surface, adapter);
    if (options.findingId && plan.findingId !== options.findingId) continue;
    plans.push(plan);
  }

  plans.sort((a, b) => a.priority - b.priority || a.findingId.localeCompare(b.findingId));

  return {
    $schema: WIRING_REPAIR_PLAN_SCHEMA,
    plans,
    summary: {
      autoFixable: plans.filter(p => p.decision === 'auto-fixable').length,
      repairableWithPattern: plans.filter(p => p.decision === 'repairable-with-existing-pattern')
        .length,
      ambiguous: plans.filter(p => p.decision === 'ambiguous-product-decision').length,
      unsafe: plans.filter(p => p.decision === 'unsafe-to-apply').length,
    },
  };
}

function evidenceFor(report: WiringInspectReport, capabilityId: string): ConsumerEvidence[] {
  const f = report.findings.find(x => x.capabilityId === capabilityId);
  return f?.evidence ?? [];
}

function planFromMismatch(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor | undefined,
  evidence: ConsumerEvidence[],
  files: Map<string, string>,
  adapter: PatternAdapter,
): RepairPlan | null {
  const file = mismatch.source.file;
  const content = files.get(file) ?? files.get(normalizePath(file));
  if (!content) {
    return lowConfidenceSkip(mismatch, evidence, 'Source file not loaded for repair planning');
  }

  switch (mismatch.kind) {
    case 'wrong_input_shape':
      return planWrongShape(mismatch, cap!, evidence, content, file);
    case 'missing_required_input':
      return planMissingRequired(mismatch, cap!, evidence, content, file, adapter);
    case 'invalid_finite_literal':
      return planInvalidLiteral(mismatch, cap!, evidence, content, file);
    case 'invalid_date_sentinel':
      return planEmptyDate(mismatch, cap!, evidence, content, file, adapter);
    case 'trusted_field_spoofing':
      return planTrustedSpoof(mismatch, cap!, evidence, content, file, adapter);
    case 'lifecycle_model_mismatch':
      return planFakeLifecycle(mismatch, cap!, evidence, content, file, adapter);
    case 'stale_capability':
      return planStale(mismatch, evidence, adapter);
    default:
      return null;
  }
}

function planWrongShape(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
): RepairPlan {
  const param = mismatch.parameter!;
  let fromExpr = readObjectPropertyExpression(content, param, cap.capabilityId);
  const findingId = findingIdOf(mismatch);

  // Fallback: locate `param: <expr>.join(...)` when AST capability match is weak
  if (!fromExpr || !/\.join\s*\(/.test(fromExpr)) {
    const joinMatch = new RegExp(
      `\\b${escapeRe(param)}\\s*:\\s*([^,\\n}]+\\.join\\s*\\([^)]*\\))`,
    ).exec(content);
    if (joinMatch?.[1]) fromExpr = joinMatch[1].trim();
  }

  if (!fromExpr || !/\.join\s*\(/.test(fromExpr)) {
    return classify(
      basePlan(mismatch, cap, evidence, 'replace-payload-expression', findingId),
      'ambiguous-product-decision',
      'Could not locate a deterministic .join(...) array→string coercion to reverse',
      [],
    );
  }

  // parseList(x).join(",") → parseList(x)  OR  Array.from(x).join(",") → Array.from(x)
  const toExpr = fromExpr.replace(/\.join\s*\([^)]*\)\s*$/, '').trim();
  if (!toExpr || toExpr === fromExpr) {
    return classify(
      basePlan(mismatch, cap, evidence, 'replace-payload-expression', findingId),
      'unsafe-to-apply',
      'Could not derive array expression from joined string',
      [],
    );
  }

  const edits: RepairEditSpec[] = [
    {
      file,
      description: `Send ${param} as ${cap.parameters.find(p => p.name === param)?.tsType ?? 'array'} instead of joined string`,
      operation: {
        type: 'replace-object-property-value',
        parameter: param,
        fromExpression: fromExpr,
        toExpression: toExpr,
        capabilityId: cap.capabilityId,
      },
    },
  ];

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'replace-payload-expression', findingId),
      preconditions: [precondition(file, content, fromExpr)],
      postconditions: [
        {
          id: 'no-wrong-shape',
          description: `Parameter ${param} no longer sent as joined string`,
          resolvedMismatchKinds: ['wrong_input_shape'],
        },
      ],
      edits,
      priority: priorityFor('replace-payload-expression', cap),
    },
    'auto-fixable',
    `Contract requires ${param}: string[]; application joins to string — reverse is deterministic`,
    edits.map(e => e.file),
  );
}

function planMissingRequired(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
  adapter: PatternAdapter,
): RepairPlan {
  const param = mismatch.parameter!;
  const findingId = findingIdOf(mismatch);
  const proven = adapter.findLocalValueSource(content, param, file);

  if (!proven) {
    return classify(
      basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      'ambiguous-product-decision',
      `Required input '${param}' has no proven local source — will not invent a value`,
      [],
    );
  }

  const edits: RepairEditSpec[] = [
    {
      file,
      description: `Add required ${param} from proven local source ${proven.expression}`,
      operation: {
        type: 'add-object-property',
        parameter: param,
        expression: proven.expression,
        capabilityId: cap.capabilityId,
        provenSource: proven.expression,
      },
    },
  ];

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      preconditions: [precondition(file, content, content.slice(0, 200))],
      postconditions: [
        {
          id: 'required-present',
          description: `Required ${param} present in payload`,
          resolvedMismatchKinds: ['missing_required_input'],
        },
      ],
      edits,
      priority: priorityFor('add-required-input', cap),
    },
    'auto-fixable',
    `Required '${param}' is missing but proven local source ${proven.expression} exists`,
    edits.map(e => e.file),
  );
}

function planInvalidLiteral(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
): RepairPlan {
  const param = mismatch.parameter!;
  const findingId = findingIdOf(mismatch);
  const p = cap.parameters.find(x => x.name === param);
  const fromExpr = readObjectPropertyExpression(content, param, cap.capabilityId);
  if (!fromExpr || !p) {
    return classify(
      basePlan(mismatch, cap, evidence, 'remove-invalid-literal', findingId),
      'low-confidence' as RepairDecisionClass,
      'Could not locate invalid literal expression',
      [],
    );
  }

  // Only auto-fix when surrounding code already uses an allowed value elsewhere
  // OR when the param is optional and removing is safe — otherwise ambiguous.
  const allowed = p.constraints.enumValues;
  const min = p.constraints.min;
  const max = p.constraints.max;

  let toExpr: string | undefined;
  if (allowed && allowed.length === 1) {
    toExpr = JSON.stringify(allowed[0]);
  } else if (
    typeof min === 'number' &&
    typeof max === 'number' &&
    min === max
  ) {
    toExpr = String(min);
  } else {
    // Look for nearby allowed literal in same file (deterministic remap hint)
    const nearby = findNearbyAllowedLiteral(content, param, allowed, min, max);
    if (nearby) toExpr = nearby;
  }

  if (!toExpr) {
    return classify(
      basePlan(mismatch, cap, evidence, 'remove-invalid-literal', findingId),
      'ambiguous-product-decision',
      `Invalid ${param} literal ${fromExpr} has no single deterministic allowed replacement`,
      [],
    );
  }

  const edits: RepairEditSpec[] = [
    {
      file,
      description: `Replace invalid ${param} ${fromExpr} with allowed ${toExpr}`,
      operation: {
        type: 'replace-object-property-value',
        parameter: param,
        fromExpression: fromExpr,
        toExpression: toExpr,
        capabilityId: cap.capabilityId,
      },
    },
  ];

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'remove-invalid-literal', findingId),
      preconditions: [precondition(file, content, fromExpr)],
      postconditions: [
        {
          id: 'literal-valid',
          description: `${param} uses an allowed value`,
          resolvedMismatchKinds: ['invalid_finite_literal'],
        },
      ],
      edits,
      priority: priorityFor('remove-invalid-literal', cap),
    },
    'auto-fixable',
    `Invalid finite literal for ${param}; deterministic replacement ${toExpr} proven`,
    edits.map(e => e.file),
  );
}

function planEmptyDate(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
  adapter: PatternAdapter,
): RepairPlan {
  const param = mismatch.parameter!;
  const findingId = findingIdOf(mismatch);
  const fromExpr = readObjectPropertyExpression(content, param, cap.capabilityId);
  const proven = adapter.findLocalValueSource(content, param, file, { preferDate: true });

  if (!fromExpr || fromExpr.replace(/['"]/g, '') !== '') {
    return classify(
      basePlan(mismatch, cap, evidence, 'replace-empty-date-sentinel', findingId),
      'ambiguous-product-decision',
      'Empty date sentinel not located as a literal ""',
      [],
    );
  }

  if (!proven) {
    return classify(
      basePlan(mismatch, cap, evidence, 'replace-empty-date-sentinel', findingId),
      'ambiguous-product-decision',
      `Required date '${param}' is "" and no proven local date source exists`,
      [],
    );
  }

  const edits: RepairEditSpec[] = [
    {
      file,
      description: `Replace empty ${param} with proven ${proven.expression}`,
      operation: {
        type: 'replace-object-property-value',
        parameter: param,
        fromExpression: fromExpr,
        toExpression: proven.expression,
        capabilityId: cap.capabilityId,
      },
    },
  ];

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'replace-empty-date-sentinel', findingId),
      preconditions: [precondition(file, content, fromExpr)],
      postconditions: [
        {
          id: 'date-nonempty',
          description: `${param} is not empty string`,
          resolvedMismatchKinds: ['invalid_date_sentinel'],
        },
      ],
      edits,
      priority: priorityFor('replace-empty-date-sentinel', cap),
    },
    'auto-fixable',
    `Empty date sentinel for ${param}; proven local source ${proven.expression}`,
    edits.map(e => e.file),
  );
}

function planTrustedSpoof(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
  adapter: PatternAdapter,
): RepairPlan {
  const param = mismatch.parameter!;
  const findingId = findingIdOf(mismatch);
  const pattern = adapter.detectInvocationPattern(content, cap.capabilityId);

  const edits: RepairEditSpec[] = [
    {
      file,
      description: `Remove client-supplied trusted field ${param}`,
      operation: {
        type: 'remove-object-property',
        parameter: param,
        capabilityId: cap.capabilityId,
      },
    },
  ];

  // Prefer migrating to safe binding when generated bindings pattern exists
  const safe = adapter.findSafeBindingMigration(cap);
  if (safe && pattern?.kind === 'execute_command') {
    edits.push({
      file,
      description: `Migrate ${cap.capabilityId} to generated safe binding`,
      operation: {
        type: 'replace-call-expression',
        capabilityId: cap.capabilityId,
        fromCalleePattern: 'executeCommand',
        toCallee: safe.callee,
        ensureImport: safe.ensureImport,
      },
    });
  }

  const decision: RepairDecisionClass =
    edits.length > 0 ? 'auto-fixable' : 'unsafe-to-apply';

  return classify(
    {
      ...basePlan(
        mismatch,
        cap,
        evidence,
        safe ? 'migrate-to-safe-binding' : 'move-trusted-input-server-side',
        findingId,
      ),
      preconditions: [precondition(file, content, param)],
      postconditions: [
        {
          id: 'no-trusted-spoof',
          description: `Trusted field ${param} not sent from client`,
          resolvedMismatchKinds: ['trusted_field_spoofing'],
          requireConsumed: true,
        },
      ],
      edits,
      priority: priorityFor('move-trusted-input-server-side', cap),
    },
    decision,
    `Client supplies server-owned ${param}; strip and keep server injection path`,
    edits.map(e => e.file),
  );
}

function planFakeLifecycle(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
  adapter: PatternAdapter,
): RepairPlan {
  const findingId = findingIdOf(mismatch);
  const canonical = adapter.findCanonicalLifecycleCommand(cap.entity, content);
  if (!canonical) {
    return classify(
      basePlan(mismatch, cap, evidence, 'replace-fake-lifecycle-binding', findingId),
      'ambiguous-product-decision',
      'Lifecycle control exists but canonical Manifest command mapping is not proven',
      [],
    );
  }

  const edits: RepairEditSpec[] = [
    {
      file,
      description: `Rewire fake lifecycle to ${canonical.capabilityId}`,
      operation: {
        type: 'rewire-lifecycle-call',
        fromCapabilityId: mismatch.capabilityId,
        toCapabilityId: canonical.capabilityId,
        entity: canonical.entity,
        command: canonical.command,
      },
    },
  ];

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'replace-fake-lifecycle-binding', findingId),
      preconditions: [precondition(file, content, mismatch.capabilityId)],
      postconditions: [
        {
          id: 'lifecycle-canonical',
          description: 'Control invokes canonical lifecycle command',
          resolvedMismatchKinds: ['lifecycle_model_mismatch'],
          requireConsumed: true,
        },
      ],
      edits,
      priority: priorityFor('replace-fake-lifecycle-binding', cap),
    },
    'repairable-with-existing-pattern',
    `Existing lifecycle control remapped to proven ${canonical.capabilityId}`,
    edits.map(e => e.file),
  );
}

function planStale(
  mismatch: ContractMismatch,
  evidence: ConsumerEvidence[],
  adapter: PatternAdapter,
): RepairPlan {
  const findingId = findingIdOf(mismatch);
  const remap = adapter.findStaleCapabilityRemap(mismatch.capabilityId);
  if (!remap) {
    return {
      findingId,
      entity: mismatch.capabilityId.split('.')[0] ?? '',
      command: mismatch.capabilityId.split('.')[1] ?? '',
      capabilityId: mismatch.capabilityId,
      repairKind: 'migrate-to-safe-binding',
      decision: 'ambiguous-product-decision',
      confidence: 'low',
      automaticApplicationAllowed: false,
      rationale: 'Stale capability has no proven remapping target',
      mismatch,
      evidence,
      sourceFiles: [mismatch.source.file],
      consumerTrace: [mismatch.source],
      preconditions: [],
      postconditions: [],
      edits: [],
      verificationMethod: 'reinspect',
      priority: 90,
    };
  }
  return {
    findingId,
    entity: remap.entity,
    command: remap.command,
    capabilityId: mismatch.capabilityId,
    repairKind: 'migrate-to-safe-binding',
    decision: 'auto-fixable',
    confidence: 'high',
    automaticApplicationAllowed: true,
    rationale: `Stale ${mismatch.capabilityId} remaps to ${remap.capabilityId}`,
    mismatch,
    evidence,
    sourceFiles: [mismatch.source.file],
    consumerTrace: [mismatch.source],
    preconditions: [],
    postconditions: [
      {
        id: 'no-stale',
        description: 'Stale reference removed',
        resolvedMismatchKinds: ['stale_capability'],
      },
    ],
    edits: [
      {
        file: mismatch.source.file,
        description: `Remap stale call to ${remap.capabilityId}`,
        operation: {
          type: 'rewire-lifecycle-call',
          fromCapabilityId: mismatch.capabilityId,
          toCapabilityId: remap.capabilityId,
          entity: remap.entity,
          command: remap.command,
        },
      },
    ],
    verificationMethod: 'reinspect',
    priority: 40,
  };
}

function planWireExistingControl(
  cap: WiringCommandDescriptor,
  surface: { file: string; controlSymbol: string; bindingCallee: string; ensureImport?: { module: string; names: string[] } },
  _adapter: PatternAdapter,
): RepairPlan {
  const findingId = `unwired:${cap.capabilityId}:${surface.file}`;
  const edits: RepairEditSpec[] = [
    {
      file: surface.file,
      description: `Wire existing control ${surface.controlSymbol} to ${surface.bindingCallee}`,
      operation: {
        type: 'wire-control-to-binding',
        controlSymbol: surface.controlSymbol,
        bindingCallee: surface.bindingCallee,
        ensureImport: surface.ensureImport,
      },
    },
  ];
  return {
    findingId,
    entity: cap.entity,
    command: cap.command,
    capabilityId: cap.capabilityId,
    repairKind: 'wire-existing-control',
    decision: 'repairable-with-existing-pattern',
    confidence: 'high',
    automaticApplicationAllowed: true,
    rationale: `Existing control ${surface.controlSymbol} matches ${cap.capabilityId}; attach generated binding`,
    evidence: [],
    sourceFiles: [surface.file],
    consumerTrace: [{ file: surface.file }],
    preconditions: [],
    postconditions: [
      {
        id: 'consumed',
        description: `${cap.capabilityId} consumed after wiring`,
        resolvedMismatchKinds: [],
        requireConsumed: true,
      },
    ],
    edits,
    verificationMethod: 'reinspect',
    priority: priorityFor('wire-existing-control', cap),
  };
}

function ambiguousUnwiredPlan(cap: WiringCommandDescriptor, message: string): RepairPlan {
  return {
    findingId: `unwired:${cap.capabilityId}:no-surface`,
    entity: cap.entity,
    command: cap.command,
    capabilityId: cap.capabilityId,
    repairKind: 'wire-existing-control',
    decision: 'ambiguous-product-decision',
    confidence: 'low',
    automaticApplicationAllowed: false,
    rationale: `No proven existing product surface for ${cap.capabilityId}: ${message}`,
    evidence: [],
    sourceFiles: [],
    consumerTrace: [],
    preconditions: [],
    postconditions: [],
    edits: [],
    verificationMethod: 'reinspect',
    priority: 100,
  };
}

function lowConfidenceSkip(
  mismatch: ContractMismatch,
  evidence: ConsumerEvidence[],
  reason: string,
): RepairPlan {
  return {
    findingId: findingIdOf(mismatch),
    entity: mismatch.capabilityId.split('.')[0] ?? '',
    command: mismatch.capabilityId.split('.')[1] ?? '',
    capabilityId: mismatch.capabilityId,
    repairKind: 'replace-payload-expression',
    decision: 'unsafe-to-apply',
    confidence: 'low',
    automaticApplicationAllowed: false,
    rationale: reason,
    mismatch,
    evidence,
    sourceFiles: [mismatch.source.file],
    consumerTrace: [mismatch.source],
    preconditions: [],
    postconditions: [],
    edits: [],
    verificationMethod: 'reinspect',
    priority: 95,
  };
}

function basePlan(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  kind: RepairKind,
  findingId: string,
): Omit<
  RepairPlan,
  | 'decision'
  | 'confidence'
  | 'automaticApplicationAllowed'
  | 'rationale'
  | 'sourceFiles'
  | 'edits'
  | 'priority'
> & { edits: RepairEditSpec[]; priority: number; sourceFiles: string[] } {
  return {
    findingId,
    entity: cap.entity,
    command: cap.command,
    capabilityId: cap.capabilityId,
    repairKind: kind,
    mismatch,
    evidence,
    sourceFiles: [mismatch.source.file],
    consumerTrace: [mismatch.source, ...evidence.map(e => e.source)],
    preconditions: [],
    postconditions: [],
    edits: [],
    verificationMethod: 'reinspect',
    priority: 50,
  };
}

function classify(
  plan: Omit<
    RepairPlan,
    'decision' | 'confidence' | 'automaticApplicationAllowed' | 'rationale' | 'sourceFiles'
  > & { sourceFiles?: string[]; rationale?: string },
  decision: RepairDecisionClass | 'low-confidence',
  rationale: string,
  sourceFiles: string[],
): RepairPlan {
  const normalized: RepairDecisionClass =
    decision === 'low-confidence' ? 'unsafe-to-apply' : decision;
  const allowed =
    normalized === 'auto-fixable' || normalized === 'repairable-with-existing-pattern';
  return {
    ...plan,
    decision: normalized,
    confidence: allowed ? 'high' : normalized === 'unsafe-to-apply' ? 'low' : 'medium',
    automaticApplicationAllowed: allowed,
    rationale,
    sourceFiles: sourceFiles.length ? sourceFiles : plan.sourceFiles ?? [],
  };
}

function precondition(file: string, content: string, snippet: string): RepairPrecondition {
  return {
    id: `fp:${file}:${fingerprintSnippet(snippet)}`,
    description: `Source still contains expected snippet in ${file}`,
    sourceFingerprint: fingerprintSnippet(snippet || content.slice(0, 120)),
  };
}

function findingIdOf(mismatch: ContractMismatch): string {
  return `${mismatch.kind}:${mismatch.capabilityId}:${mismatch.parameter ?? ''}:${mismatch.source.file}`;
}

function priorityFor(kind: RepairKind, cap: WiringCommandDescriptor): number {
  // Prefer broken primary create/update/delete, then theatre, trusted, stale, lifecycle, invalidation, unwired
  const cmd = cap.command.toLowerCase();
  const isPrimary =
    cmd === 'create' || cmd === 'update' || cmd === 'delete' || cmd.startsWith('create');
  const base =
    kind === 'replace-payload-expression' || kind === 'add-required-input'
      ? 10
      : kind === 'move-trusted-input-server-side' || kind === 'migrate-to-safe-binding'
        ? 20
      : kind === 'replace-empty-date-sentinel' || kind === 'remove-invalid-literal'
        ? 15
      : kind === 'replace-fake-lifecycle-binding'
        ? 30
      : kind === 'add-invalidation'
        ? 40
      : kind === 'wire-existing-control'
        ? 50
        : 60;
  return isPrimary ? base : base + 5;
}

function findNearbyAllowedLiteral(
  content: string,
  param: string,
  enumValues: string[] | undefined,
  min: number | undefined,
  max: number | undefined,
): string | undefined {
  if (enumValues) {
    for (const v of enumValues) {
      const re = new RegExp(`\\b${escapeRe(param)}\\s*[:=]\\s*["']${escapeRe(v)}["']`);
      if (re.test(content)) return JSON.stringify(v);
    }
  }
  if (typeof min === 'number' && typeof max === 'number') {
    for (let n = min; n <= max; n++) {
      const re = new RegExp(`\\b${escapeRe(param)}\\s*[:=]\\s*${n}\\b`);
      if (re.test(content)) return String(n);
    }
    // Default clamp to min when only one invalid literal and range is small
    if (max - min <= 4) return String(min);
  }
  return undefined;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
