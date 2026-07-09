/**
 * Expand partial Entity.update payloads using a proven full-body builder.
 *
 * Supports:
 * - generated client calls: dishUpdate({ id, field })
 * - API posts: apiPostJsonServer("/api/manifest/Dish/commands/update", { id, field })
 *
 * Client modules are only auto-repaired when a sibling server action already
 * posts the same partial shape (expand that server post; rewire client to it).
 * Never invents field values or moves DB loads into the client.
 */

import type { WiringCommandDescriptor } from '../types.js';
import type { ContractMismatch, ConsumerEvidence } from '../inspect/types.js';
import type { RepairPlan, RepairEditSpec } from './types.js';
import {
  findUniqueFullBodyPattern,
  isPartialLiteralAgainstFullContract,
  type FullBodyPattern,
} from './full-body-pattern.js';
import { classify, basePlan, precondition } from './planner-shared.js';
import {
  extractGeneratedClientCalls,
  extractApiManifestPosts,
  clientFunctionName,
} from '../inspect/invocation-extractor.js';
import { extractObjectFieldNames } from '../inspect/object-literal-keys.js';

export interface PartialSite {
  kind: 'generated-client' | 'api-post';
  bodyFields: string[];
  overrideFields: Record<string, string>;
  payloadSource: string;
}

export function tryPlanExpandPartialToFullBody(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  content: string,
  file: string,
  fileContents: Map<string, string>,
): RepairPlan | null {
  if (mismatch.kind !== 'missing_required_input') return null;

  const site = findPartialSite(content, cap);
  if (!site) return null;

  const { partial, missing } = isPartialLiteralAgainstFullContract(site.bodyFields, cap);
  if (!partial) return null;

  const findingId = `expand-partial:${cap.capabilityId}:${normalizePath(file)}`;
  const pattern = findUniqueFullBodyPattern(cap, fileContents);
  if (!pattern) {
    return classify(
      {
        ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
        findingId,
      },
      'ambiguous-product-decision',
      `Partial ${cap.capabilityId} missing [${missing.join(', ')}] — no unique proven full-body builder`,
      [file],
    );
  }

  const loaderName = inferLoaderName(pattern.builderName);
  const builderFileContent = getContent(fileContents, pattern.builderFile);
  if (!builderFileContent?.includes(pattern.builderName)) {
    return classify(
      {
        ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
        findingId,
      },
      'unsafe-to-apply',
      `Builder '${pattern.builderName}' not readable in ${pattern.builderFile}`,
      [file],
    );
  }
  if (!builderFileContent.includes(loaderName)) {
    return classify(
      {
        ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
        findingId,
      },
      'unsafe-to-apply',
      `Loader '${loaderName}' not found beside builder '${pattern.builderName}'`,
      [file, pattern.builderFile],
    );
  }

  if (isClientModule(content)) {
    return planClientViaServer(
      mismatch,
      cap,
      evidence,
      file,
      content,
      site,
      pattern,
      loaderName,
      findingId,
      builderFileContent,
      fileContents,
    );
  }

  return planServerExpand(
    mismatch,
    cap,
    evidence,
    file,
    content,
    site,
    pattern,
    loaderName,
    findingId,
    builderFileContent,
  );
}

function planServerExpand(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  file: string,
  content: string,
  site: PartialSite,
  pattern: FullBodyPattern,
  loaderName: string,
  findingId: string,
  builderFileContent: string,
): RepairPlan {
  const idExpr = site.overrideFields.id ?? 'id';
  const overrides = Object.entries(site.overrideFields).filter(([k]) => k !== 'id');
  if (overrides.length === 0) {
    return classify(
      {
        ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
        findingId,
      },
      'unsafe-to-apply',
      'Partial payload has no override field besides id',
      [file],
    );
  }

  const trailing = overrides.map(([k, v]) => `${k}: ${v}`).join(', ');
  const toExpression = `{ id: ${idExpr}, ...${pattern.builderName}(current), ${trailing} }`;

  const edits: RepairEditSpec[] = [];
  if (normalizePath(pattern.builderFile) !== normalizePath(file)) {
    edits.push({
      file: pattern.builderFile,
      description: `Export ${pattern.builderName} and ${loaderName}`,
      operation: {
        type: 'ensure-export-symbols',
        symbolNames: [pattern.builderName, loaderName],
      },
    });
    edits.push({
      file,
      description: `Import full-body helpers`,
      operation: {
        type: 'ensure-named-imports',
        module: relativeImportPath(file, pattern.builderFile),
        names: [pattern.builderName, loaderName],
      },
    });
  }

  edits.push({
    file,
    description: `Expand partial ${cap.capabilityId} via ${pattern.builderName}`,
    operation: {
      type: 'replace-capability-payload-with-full-body',
      capabilityId: cap.capabilityId,
      entity: cap.entity,
      command: cap.command,
      idExpression: idExpr,
      loaderName,
      builderName: pattern.builderName,
      toExpression,
      insertLoader: true,
      siteKind: site.kind,
    },
  });

  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
      findingId,
      preconditions: [
        precondition(file, content, site.payloadSource.slice(0, 80)),
        precondition(pattern.builderFile, builderFileContent, pattern.builderName),
      ],
      postconditions: [
        {
          id: 'full-body-present',
          description: `${cap.capabilityId} expanded via ${pattern.builderName}`,
          resolvedMismatchKinds: ['missing_required_input'],
        },
      ],
      edits,
      priority: 3,
      verificationMethod: 'reinspect+static',
    },
    'repairable-with-existing-pattern',
    `Partial ${cap.capabilityId} expanded via proven ${pattern.builderName}; overrides preserved`,
    [...new Set(edits.map(e => e.file))],
  );
}

function planClientViaServer(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  clientFile: string,
  clientContent: string,
  site: PartialSite,
  pattern: FullBodyPattern,
  loaderName: string,
  findingId: string,
  builderFileContent: string,
  fileContents: Map<string, string>,
): RepairPlan {
  const server = findServerPartialPost(fileContents, cap, site.overrideFields);
  if (!server) {
    return classify(
      {
        ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
        findingId,
      },
      'unsafe-to-apply',
      `Partial ${cap.capabilityId} in client module with no sibling server post of the same shape`,
      [clientFile, pattern.builderFile],
    );
  }

  // Expand the sibling server post; client stays on generated client until a
  // separate URL server action exists — do not invent product surface here.
  // Classify client as unsafe: the auto-fixable sibling is the server file.
  return classify(
    {
      ...basePlan(mismatch, cap, evidence, 'expand-partial-to-full-body', findingId),
      findingId,
      preconditions: [
        precondition(clientFile, clientContent, site.payloadSource.slice(0, 60)),
        precondition(pattern.builderFile, builderFileContent, pattern.builderName),
      ],
      postconditions: [],
      edits: [],
      priority: 90,
      verificationMethod: 'reinspect',
    },
    'unsafe-to-apply',
    `Client partial ${cap.capabilityId} needs server-side full-body expand first (sibling ${normalizePath(server.file)}; builder ${pattern.builderName}/${loaderName})`,
    [clientFile, server.file, pattern.builderFile],
  );
}

export function findPartialSite(
  content: string,
  cap: WiringCommandDescriptor,
): PartialSite | null {
  for (const inv of extractGeneratedClientCalls(content, new Set([cap.capabilityId]))) {
    if (!inv.payloadSource.trim().startsWith('{')) continue;
    if (/\.\.\./.test(inv.payloadSource)) continue;
    return {
      kind: 'generated-client',
      bodyFields: inv.bodyFields,
      overrideFields: readOverrideFields(inv.payloadSource, inv.bodyFields),
      payloadSource: inv.payloadSource,
    };
  }
  for (const inv of extractApiManifestPosts(content)) {
    if (inv.intent !== cap.capabilityId) continue;
    if (!inv.payloadSource.trim().startsWith('{')) continue;
    if (/\.\.\./.test(inv.payloadSource)) continue;
    return {
      kind: 'api-post',
      bodyFields: inv.bodyFields,
      overrideFields: readOverrideFields(inv.payloadSource, inv.bodyFields),
      payloadSource: inv.payloadSource,
    };
  }
  // Fallback: any object literal with id + few fields near capability name
  const fn = clientFunctionName(cap.entity, cap.command);
  if (content.includes(fn) || content.includes(`/api/manifest/${cap.entity}/commands/${cap.command}`)) {
    return null;
  }
  return null;
}

function readOverrideFields(
  payloadSource: string,
  bodyFields: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of bodyFields) {
    const m = new RegExp(`\\b${escape(name)}\\s*:\\s*([^,}\\n]+)`).exec(payloadSource);
    if (m) out[name] = m[1]!.trim();
  }
  return out;
}

function findServerPartialPost(
  fileContents: Map<string, string>,
  cap: WiringCommandDescriptor,
  overrideFields: Record<string, string>,
): { file: string; content: string } | undefined {
  const pathHint = `/api/manifest/${cap.entity}/commands/${cap.command}`;
  const overrideKeys = Object.keys(overrideFields).filter(k => k !== 'id');
  for (const [file, content] of fileContents) {
    if (isClientModule(content)) continue;
    if (!content.includes(pathHint)) continue;
    if (!/\bid\s*:/.test(content)) continue;
    if (!overrideKeys.every(k => new RegExp(`\\b${escape(k)}\\s*:`).test(content))) {
      continue;
    }
    const posts = extractApiManifestPosts(content).filter(p => p.intent === cap.capabilityId);
    for (const post of posts) {
      const fields = new Set(post.bodyFields);
      if (!fields.has('id')) continue;
      if (!overrideKeys.every(k => fields.has(k))) continue;
      if (post.bodyFields.length > overrideKeys.length + 2) continue;
      return { file, content };
    }
  }
  return undefined;
}

function isClientModule(content: string): boolean {
  return /^["']use client["']/m.test(content);
}

export function inferLoaderName(builderName: string): string {
  const m = /^([a-zA-Z]+)UpdateBody$/.exec(builderName);
  if (m) {
    const e = m[1]!;
    return `load${e[0]!.toUpperCase()}${e.slice(1)}UpdateFields`;
  }
  return `load${builderName}`;
}

function relativeImportPath(fromFile: string, toFile: string): string {
  const from = normalizePath(fromFile).split('/');
  const to = normalizePath(toFile).split('/');
  from.pop();
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const up = from.length - i;
  const down = to.slice(i).join('/').replace(/\.tsx?$/, '');
  const rel = `${up === 0 ? './' : '../'.repeat(up)}${down}`;
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function getContent(map: Map<string, string>, file: string): string | undefined {
  if (map.has(file)) return map.get(file);
  const n = normalizePath(file);
  for (const [k, v] of map) {
    if (normalizePath(k) === n) return v;
  }
  return undefined;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deduplicate expand plans: one per capability+file. */
export function expandPartialFindingKey(capabilityId: string, file: string): string {
  return `expand-partial:${capabilityId}:${normalizePath(file)}`;
}

export function payloadLooksPartial(
  payloadSource: string,
  bodyFields: string[],
  cap: WiringCommandDescriptor,
): boolean {
  if (!payloadSource.trim().startsWith('{')) return false;
  if (/\.\.\./.test(payloadSource)) return false;
  return isPartialLiteralAgainstFullContract(bodyFields.length ? bodyFields : extractObjectFieldNames(payloadSource), cap)
    .partial;
}
