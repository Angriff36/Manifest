/**
 * Automatic wiring consumer inspection orchestrator.
 *
 * Primary coverage truth comes from source inspection.
 * Explicit registries are overrides/fallbacks (backend-only, deferred, accepted ambiguous).
 *
 * Manifest does not design the interface — it proves whether application code
 * correctly consumes declared capabilities.
 */

import type { WiringConsumersRegistry, WiringContract, WiringConsumerEntry } from '../types.js';
import { parseConsumersRegistry } from '../coverage.js';
import { ConsumerTracer } from './consumer-tracer.js';
import { analyzeContractMismatches } from './mismatch-analyzer.js';
import { ProductSurfaceClassifier } from './surface-classifier.js';
import { loadApplicationSources, fileMapFromRecord } from './source-loader.js';
import type {
  InspectCoverageFinding,
  InspectCoverageStatus,
  ProductRealityBucket,
  WiringInspectConfig,
  WiringInspectReport,
} from './types.js';
import { WIRING_INSPECT_REPORT_SCHEMA } from './types.js';

export { fileMapFromRecord, loadApplicationSources };

export interface InspectWiringOptions extends WiringInspectConfig {
  contract: WiringContract;
  /** Preloaded sources (tests). When omitted, roots are scanned from disk. */
  fileContents?: Map<string, string>;
  cwd?: string;
}

export async function inspectWiringConsumers(
  options: InspectWiringOptions,
): Promise<WiringInspectReport> {
  let fileContents =
    options.fileContents ??
    (await loadApplicationSources(options.roots, options.cwd ?? process.cwd()));

  // Apply include filters early so large monorepos stay tractable.
  if (options.include && options.include.length > 0) {
    const includes = options.include.map((p) => p.toLowerCase());
    fileContents = new Map(
      [...fileContents.entries()].filter(([file]) =>
        includes.some((p) => file.toLowerCase().includes(p)),
      ),
    );
  }

  const overrides = options.overrides ? normalizeOverrides(options.overrides) : undefined;

  return inspectWiringConsumersSync({
    contract: options.contract,
    fileContents,
    config: options,
    overrides,
  });
}

export function inspectWiringConsumersSync(args: {
  contract: WiringContract;
  fileContents: Map<string, string>;
  config: WiringInspectConfig;
  overrides?: WiringConsumersRegistry;
}): WiringInspectReport {
  const { contract, fileContents, config } = args;
  const overrides = args.overrides ?? config.overrides;
  const capabilityIds = new Set(contract.capabilities.map((c) => c.capabilityId));
  const overrideById = new Map<string, WiringConsumerEntry>();
  if (overrides) {
    for (const c of overrides.consumers) overrideById.set(c.capabilityId, c);
  }

  const surface = new ProductSurfaceClassifier(config);
  const tracer = new ConsumerTracer(fileContents, surface);
  const trace = tracer.trace(capabilityIds);

  const mismatches = analyzeContractMismatches(contract, [
    ...trace.invocations,
    ...trace.staleReferences.map((s) => ({
      entity: s.entity,
      command: s.command,
      intent: s.capabilityId,
      bodyFields: [] as string[],
      index: 0,
      payloadSource: '',
      file: s.source.file,
      reachable: true as const,
    })),
  ]);

  // Trusted-context valid binding: if server params are NOT in payload, no spoofing — already handled.

  const findings: InspectCoverageFinding[] = [];
  const overridesApplied: WiringInspectReport['overridesApplied'] = [];

  for (const cap of contract.capabilities) {
    const evidence = trace.proven.get(cap.capabilityId) ?? [];
    const override = overrideById.get(cap.capabilityId);
    const capMismatches = mismatches.filter((m) => m.capabilityId === cap.capabilityId && m.defect);

    if (override) {
      overridesApplied.push({
        capabilityId: override.capabilityId,
        disposition: override.disposition,
        ...(override.note ? { note: override.note } : {}),
      });
    }

    let status: InspectCoverageStatus;
    let defect = false;
    let message: string;
    let productReality: ProductRealityBucket;

    if (evidence.length > 0) {
      status = 'consumed';
      defect = capMismatches.length > 0;
      message =
        capMismatches.length > 0
          ? `Capability '${cap.capabilityId}' is consumed but has contract mismatch(es)`
          : `Capability '${cap.capabilityId}' has proven application consumer(s)`;
      productReality = capMismatches.length > 0 ? 'FEATURE_THEATRE' : 'WORKING';
    } else if (override?.disposition === 'backend-only') {
      status = 'backend-only';
      defect = false;
      message = `Capability '${cap.capabilityId}' is explicitly backend-only`;
      productReality = 'WORKING';
    } else if (override?.disposition === 'deferred') {
      status = 'deferred';
      defect = false;
      message = `Capability '${cap.capabilityId}' is explicitly deferred`;
      productReality = 'BUILT_BUT_UNWIRED';
    } else if (override?.disposition === 'consumed') {
      // Explicit consumed without proof → ambiguous acceptance
      status = 'ambiguous';
      defect = false;
      message = `Capability '${cap.capabilityId}' declared consumed by override but not statically proven`;
      productReality = 'BROKEN_UNPROVEN';
    } else {
      status = 'unwired';
      defect = config.strictCoverage === true;
      message = `Capability '${cap.capabilityId}' has no proven consumer and no override`;
      productReality = 'BUILT_BUT_UNWIRED';
    }

    findings.push({
      capabilityId: cap.capabilityId,
      status,
      defect,
      message,
      evidence,
      productReality,
    });
  }

  // Stale consumers: proven references to nonexistent capabilities
  const staleSeen = new Set<string>();
  for (const stale of trace.staleReferences) {
    if (capabilityIds.has(stale.capabilityId)) continue;
    if (staleSeen.has(stale.capabilityId)) continue;
    staleSeen.add(stale.capabilityId);
    findings.push({
      capabilityId: stale.capabilityId,
      status: 'stale-consumer',
      defect: true,
      message: `Application references nonexistent capability '${stale.capabilityId}'`,
      evidence: [stale],
      productReality: 'BROKEN_UNPROVEN',
    });
  }

  // Override entries pointing at nonexistent capabilities
  if (overrides) {
    for (const entry of overrides.consumers) {
      if (capabilityIds.has(entry.capabilityId)) continue;
      if (staleSeen.has(entry.capabilityId)) continue;
      findings.push({
        capabilityId: entry.capabilityId,
        status: 'stale-consumer',
        defect: true,
        message: `Override refers to nonexistent capability '${entry.capabilityId}'`,
        evidence: [],
        productReality: 'BROKEN_UNPROVEN',
      });
    }
  }

  findings.sort(
    (a, b) => a.capabilityId.localeCompare(b.capabilityId) || a.status.localeCompare(b.status),
  );

  const unresolved = trace.ambiguous.map((a) => ({
    message: `Ambiguous/unresolved reference '${a.consumerSymbol ?? a.capabilityId}'`,
    source: a.source,
  }));

  const summary = {
    totalCapabilities: contract.capabilities.length,
    consumed: findings.filter((f) => f.status === 'consumed').length,
    unwired: findings.filter((f) => f.status === 'unwired').length,
    backendOnly: findings.filter((f) => f.status === 'backend-only').length,
    deferred: findings.filter((f) => f.status === 'deferred').length,
    staleConsumers: findings.filter((f) => f.status === 'stale-consumer').length,
    ambiguous: findings.filter((f) => f.status === 'ambiguous').length + unresolved.length,
    mismatches: mismatches.length,
    mismatchDefects: mismatches.filter((m) => m.defect).length,
  };

  const failOn = new Set(config.failOn ?? ['stale-consumer', 'contract-mismatch']);
  if (config.strictCoverage) failOn.add('unwired');

  let ok = true;
  if (failOn.has('stale-consumer') && summary.staleConsumers > 0) ok = false;
  if (failOn.has('contract-mismatch') && summary.mismatchDefects > 0) ok = false;
  if (failOn.has('unwired') && summary.unwired > 0) ok = false;
  // Ambiguous never fails by default

  return {
    $schema: WIRING_INSPECT_REPORT_SCHEMA,
    ok,
    summary,
    findings,
    mismatches,
    unresolved,
    overridesApplied,
  };
}

function normalizeOverrides(raw: WiringConsumersRegistry | unknown): WiringConsumersRegistry {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as WiringConsumersRegistry).$schema === 'manifest-wiring-consumers/v1'
  ) {
    return parseConsumersRegistry(raw);
  }
  return parseConsumersRegistry(raw);
}

/** Compact human-readable report. */
export function formatInspectReportText(report: WiringInspectReport): string {
  const lines: string[] = [
    'Manifest wiring inspect',
    `  capabilities=${report.summary.totalCapabilities} consumed=${report.summary.consumed} unwired=${report.summary.unwired} backend-only=${report.summary.backendOnly} deferred=${report.summary.deferred} stale=${report.summary.staleConsumers} ambiguous=${report.summary.ambiguous} mismatches=${report.summary.mismatchDefects}`,
    '',
    ...formatInspectBuckets(report),
    ...formatInspectMismatches(report),
  ];
  lines.push(report.ok ? '✓ inspect ok' : '✗ inspect failed gate');
  return lines.join('\n');
}

function formatInspectBuckets(report: WiringInspectReport): string[] {
  const buckets: ProductRealityBucket[] = [
    'WORKING',
    'FEATURE_THEATRE',
    'BUILT_BUT_UNWIRED',
    'BROKEN_UNPROVEN',
    'DUPLICATE_PARALLEL_MODEL',
  ];
  const lines: string[] = [];
  for (const bucket of buckets) {
    const items = report.findings.filter((f) => f.productReality === bucket);
    if (items.length === 0) continue;
    lines.push(`${bucket} (${items.length})`);
    for (const f of items.slice(0, 40)) {
      lines.push(`  ${f.defect ? '✗' : '·'} [${f.status}] ${f.capabilityId}`);
      if (f.evidence[0]) {
        lines.push(`      ${f.evidence[0].trace.map((h) => h.label).join(' → ')}`);
      }
    }
    if (items.length > 40) lines.push(`  … +${items.length - 40} more`);
    lines.push('');
  }
  return lines;
}

function formatInspectMismatches(report: WiringInspectReport): string[] {
  const defects = report.mismatches.filter((m) => m.defect);
  if (defects.length === 0) return [];
  const lines = ['CONTRACT MISMATCHES'];
  for (const m of defects) {
    lines.push(`  ✗ [${m.kind}] ${m.message}`);
    lines.push(`      ${m.source.file}${m.source.line ? `:${m.source.line}` : ''}`);
  }
  lines.push('');
  return lines;
}
