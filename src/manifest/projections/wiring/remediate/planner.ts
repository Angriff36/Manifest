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
  RepairEditSpec,
} from './types.js';
import { WIRING_REPAIR_PLAN_SCHEMA } from './types.js';
import { PatternAdapter } from './pattern-adapter.js';
import { readObjectPropertyExpression } from './ast-utils.js';
import {
  planMissingRequired,
  planInvalidLiteral,
  planEmptyDate,
} from './planner-payload.js';
import { tryPlanExpandPartialToFullBody } from './planner-expand-partial.js';
import {
  classify,
  basePlan,
  findingIdOf,
  priorityFor,
  precondition,
  escapeRe,
} from './planner-shared.js';

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

  const expandPlanned = new Set<string>();
  for (const mismatch of options.report.mismatches) {
    if (options.capabilityId && mismatch.capabilityId !== options.capabilityId) continue;
    const cap = byId.get(mismatch.capabilityId);
    if (!cap && mismatch.kind !== 'stale_capability') continue;

    const evidence = evidenceFor(options.report, mismatch.capabilityId);

    if (mismatch.kind === 'missing_required_input' && cap) {
      const expandKey = `expand-partial:${cap.capabilityId}:${normalizePath(mismatch.source.file)}`;
      if (expandPlanned.has(expandKey)) continue;

      const content =
        options.fileContents.get(mismatch.source.file) ??
        options.fileContents.get(normalizePath(mismatch.source.file));
      if (content) {
        const expand = tryPlanExpandPartialToFullBody(
          mismatch,
          cap,
          evidence,
          content,
          mismatch.source.file,
          options.fileContents,
        );
        if (expand) {
          expandPlanned.add(expandKey);
          if (options.findingId && expand.findingId !== options.findingId) continue;
          plans.push(expand);
          continue;
        }
      }
    }

    const plan = planFromMismatch(mismatch, cap, evidence, options.fileContents, adapter);
    if (!plan) continue;
    if (options.findingId && plan.findingId !== options.findingId) continue;
    plans.push(plan);
  }

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
    const plan = planWireExistingControl(cap, surface);
    if (options.findingId && plan.findingId !== options.findingId) continue;
    plans.push(plan);
  }

  // Unwired wire-existing-control without semantic proof must never outrank
  // proven contract repairs in one-defect selection (priority already higher).

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
      // Expand-partial is attempted once per capability+file in planWiringRepairs.
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
  surface: {
    file: string;
    controlSymbol: string;
    bindingCallee: string;
    ensureImport?: { module: string; names: string[] };
    identityExpression?: string;
    matchReasons?: string[];
    handlerSnippet?: string;
    labelText?: string;
    controlSource?: string;
  },
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
        identityExpression: surface.identityExpression,
        handlerSnippet: surface.handlerSnippet,
        controlSource: surface.controlSource,
      },
    },
  ];
  const reasons = surface.matchReasons?.join(', ') ?? 'action-intent match';
  return {
    findingId,
    entity: cap.entity,
    command: cap.command,
    capabilityId: cap.capabilityId,
    repairKind: 'wire-existing-control',
    decision: 'repairable-with-existing-pattern',
    confidence: 'high',
    automaticApplicationAllowed: true,
    rationale:
      `Exact action-intent control for ${cap.capabilityId} (${reasons}` +
      (surface.identityExpression ? `; identity=${surface.identityExpression}` : '') +
      `); attach generated binding`,
    evidence: [],
    sourceFiles: [surface.file],
    consumerTrace: [{ file: surface.file }],
    preconditions: surface.handlerSnippet
      ? [precondition(surface.file, surface.handlerSnippet, surface.handlerSnippet)]
      : [],
    postconditions: [
      {
        id: 'consumed-with-action-intent',
        description: `${cap.capabilityId} consumed on an action-intent matched control`,
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

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
