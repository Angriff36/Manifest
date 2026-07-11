/**
 * Payload repair planners: missing required input, invalid literal, empty date.
 */

import type { WiringCommandDescriptor } from '../types.js';
import type { ContractMismatch, ConsumerEvidence } from '../inspect/types.js';
import type { RepairPlan, RepairDecisionClass, RepairEditSpec } from './types.js';
import type { PatternAdapter } from './pattern-adapter.js';
import { readObjectPropertyExpression } from './ast-utils.js';
import {
  resolveRequiredInputSource,
  missingRequiredClientParams,
} from './required-input-source.js';
import {
  classify,
  basePlan,
  findingIdOf,
  priorityFor,
  precondition,
  findNearbyAllowedLiteral,
} from './planner-shared.js';

export function planMissingRequired(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
  _adapter: PatternAdapter,
): RepairPlan {
  const paramName = mismatch.parameter!;
  const findingId = findingIdOf(mismatch);
  const param = cap.parameters.find((p) => p.name === paramName);
  if (!param) {
    return classify(
      basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      'unsafe-to-apply',
      `Parameter '${paramName}' not found on capability ${cap.capabilityId}`,
      [],
    );
  }

  const stillMissing = missingRequiredClientParams(content, file, cap);
  const otherMissing = stillMissing.filter((p) => p.name !== paramName);
  if (otherMissing.length > 0) {
    return classify(
      basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      'ambiguous-product-decision',
      `Cannot auto-apply '${paramName}': other required inputs still unresolved (${otherMissing.map((p) => p.name).join(', ')})`,
      [],
    );
  }

  const proof = resolveRequiredInputSource({
    content,
    fileName: file,
    capabilityId: cap.capabilityId,
    param,
    cap,
  });

  if (proof.status === 'missing' || proof.status === 'ambiguous') {
    return classify(
      basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      'ambiguous-product-decision',
      proof.rationale,
      [],
    );
  }
  if (proof.status === 'unsafe' || !proof.source) {
    return classify(
      basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      'unsafe-to-apply',
      proof.rationale,
      [],
    );
  }

  const proven = proof.source;
  const edits: RepairEditSpec[] = [];
  if (proof.guard && !proof.guard.alreadyPresent) {
    edits.push({
      file,
      description: `Insert proven falsy guard for ${proven.expression}`,
      operation: {
        type: 'insert-early-return-guard',
        capabilityId: cap.capabilityId,
        sourceExpression: proof.guard.sourceExpression,
        statement: proof.guard.statement,
      },
    });
  }
  edits.push({
    file,
    description: `Add required ${paramName} from proven ${proven.kind} source ${proven.expression}`,
    operation: {
      type: 'add-object-property',
      parameter: paramName,
      expression: proven.expression,
      capabilityId: cap.capabilityId,
      provenSource: proven.expression,
    },
  });

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'add-required-input', findingId),
      preconditions: [
        precondition(file, content, proven.expression),
        ...(proof.guard && !proof.guard.alreadyPresent
          ? [precondition(file, content, proof.guard.sourceExpression)]
          : []),
      ],
      postconditions: [
        {
          id: 'required-present',
          description: `Required ${paramName} present in payload`,
          resolvedMismatchKinds: ['missing_required_input'],
        },
      ],
      edits,
      priority: priorityFor('add-required-input', cap),
      verificationMethod: 'reinspect+static',
    },
    'auto-fixable',
    proof.rationale,
    edits.map((e) => e.file),
  );
}

export function planInvalidLiteral(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
): RepairPlan {
  const param = mismatch.parameter!;
  const findingId = findingIdOf(mismatch);
  const p = cap.parameters.find((x) => x.name === param);
  const fromExpr = readObjectPropertyExpression(content, param, cap.capabilityId);
  if (!fromExpr || !p) {
    return classify(
      basePlan(mismatch, cap, evidence, 'remove-invalid-literal', findingId),
      'low-confidence' as RepairDecisionClass,
      'Could not locate invalid literal expression',
      [],
    );
  }

  const allowed = p.constraints.enumValues;
  const min = p.constraints.min;
  const max = p.constraints.max;

  let toExpr: string | undefined;
  if (allowed && allowed.length === 1) {
    toExpr = JSON.stringify(allowed[0]);
  } else if (typeof min === 'number' && typeof max === 'number' && min === max) {
    toExpr = String(min);
  } else {
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
    edits.map((e) => e.file),
  );
}

export function planEmptyDate(
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
  const paramDesc = cap.parameters.find((p) => p.name === param);
  const preferIsoString =
    paramDesc?.constraints.dateLike === true ||
    paramDesc?.irTypeName === 'datetime' ||
    paramDesc?.irTypeName === 'date';
  const proven = adapter.findLocalValueSource(content, param, file, {
    preferDate: true,
    preferIsoString,
  });

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
    edits.map((e) => e.file),
  );
}
