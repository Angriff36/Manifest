import { collectCanonicalDeclarations, canonicalizeProgramNames } from './canonicalize-program.js';
import { CanonicalNameRegistry } from './canonical-names.js';
import {
  resolveNamingConfig,
  type ManifestNamingInput,
  type ResolvedNamingConfig,
} from './naming-config.js';
import {
  dedupeLastByKey,
  resolveMergeIntegrity,
  type ManifestMergeIntegrityConfig,
  type ResolvedMergeIntegrity,
} from './merge-integrity.js';
import {
  collectCrossFileNameUniqueness,
  validateCrossFileReferences,
} from './merge-integrity-checks.js';
import type { EntityIndex } from './entity-composition.js';
import {
  IR,
  IRModule,
  IREntity,
  IREnum,
  IRStore,
  IREvent,
  IRCommand,
  IRPolicy,
  IRDiagnostic,
  IRProvenance,
  IRProvenanceSource,
  IRValueObject,
  IRTenant,
  IRReactionRule,
  IRRole,
  IRSaga,
  IRWebhook,
  IRSchedule,
} from './ir';
import { COMPILER_VERSION, SCHEMA_VERSION } from './version.js';
import { Parser } from './parser.js';
import { IRCompiler, computeIRHash } from './ir-compiler.js';
import { resolveModuleGraph, ResolverHost } from './module-resolver.js';
import { attachInitializationPlans } from './initialization-plan.js';
import { checkReactionCompleteness } from './reaction-completeness.js';

export interface CompileProjectOptions {
  /** Absolute paths of entry .manifest files */
  entries: string[];
  /** Filesystem abstraction (defaults to node fs host) */
  host: ResolverHost;
  /** Whether to use the IR cache for individual file compilation */
  useCache?: boolean;
  /** Base path for computing relative source paths in provenance */
  basePath?: string;
  /** Naming policy (raw or resolved). Default: normalization off. */
  naming?: ManifestNamingInput | ResolvedNamingConfig;
  /** Config G3 — cross-file name collision / merge policy. Default: error. */
  mergeIntegrity?: ManifestMergeIntegrityConfig | ResolvedMergeIntegrity;
}

export interface MultiCompileResult {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
  sources: Array<{ absPath: string; contentHash: string }>;
}

/**
 * Compile multiple .manifest files into a single merged IR.
 *
 * Pipeline:
 * 1. Resolve dependency graph (topological sort, cycle detection)
 * 2. Compile each file in dependency order via IRCompiler
 * 3. Validate cross-file references (entity names, relationships)
 * 4. Merge all IRs into single output with multi-source provenance
 */
export async function compileProjectToIR(
  options: CompileProjectOptions,
): Promise<MultiCompileResult> {
  const { entries, host, useCache = true, basePath = '' } = options;
  const diagnostics: IRDiagnostic[] = [];
  const sources: Array<{ absPath: string; contentHash: string }> = [];

  let integrity: ResolvedMergeIntegrity;
  try {
    integrity = resolveMergeIntegrity(
      options.mergeIntegrity as ManifestMergeIntegrityConfig | undefined,
    );
  } catch (error: unknown) {
    diagnostics.push({
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return { ir: null, diagnostics, sources };
  }

  // Phase 1: Resolve module graph
  const parser = new Parser();
  const parseFn = (source: string) => parser.parse(source);

  const resolution = await resolveModuleGraph(entries, host, parseFn);

  // Convert resolution diagnostics to IR diagnostics
  for (const d of resolution.diagnostics) {
    diagnostics.push({
      severity: d.severity,
      message: d.file ? `[${d.file}] ${d.message}` : d.message,
    });
  }

  if (resolution.diagnostics.some((d) => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  // Phase 1.5: Build a project-wide composition index so that an entity can
  // `extends` or `mixin` a base declared in a different file. When naming
  // normalization is enabled, fold spellings first so cross-file aliases match.
  const namingPolicy =
    options.naming && typeof options.naming === 'object' && 'entities' in options.naming
      ? (options.naming as ResolvedNamingConfig)
      : resolveNamingConfig(options.naming as ManifestNamingInput | undefined);

  const parsedPrograms: Array<{
    absPath: string;
    program: ReturnType<Parser['parse']>['program'];
  }> = [];
  for (const file of resolution.order) {
    const { program } = parser.parse(file.source);
    parsedPrograms.push({ absPath: file.absPath, program });
  }

  const nameRegistry = namingPolicy.normalization
    ? collectCanonicalDeclarations(
        parsedPrograms.map((p) => p.program),
        new CanonicalNameRegistry(namingPolicy),
      )
    : undefined;
  const compositionContext: EntityIndex = {};
  for (const { program } of parsedPrograms) {
    if (nameRegistry) {
      canonicalizeProgramNames(program, nameRegistry, namingPolicy);
    }
    for (const entity of program.entities) {
      if (integrity.onDuplicateEntity === 'lastWins' || !compositionContext[entity.name]) {
        compositionContext[entity.name] = entity;
      }
    }
    for (const mod of program.modules) {
      for (const entity of mod.entities) {
        if (integrity.onDuplicateEntity === 'lastWins' || !compositionContext[entity.name]) {
          compositionContext[entity.name] = entity;
        }
      }
    }
  }

  // Phase 2: Compile each file in topological order.
  //
  // A file whose own compile errors (parse error, or a semantic/domain error
  // that nulls its IR) must NOT abort the whole batch — otherwise the first
  // erroring file (topologically) hides every later file's errors, turning a
  // single `compile --all` into fix-one-rerun-see-the-next whack-a-mole. Each
  // file is compiled independently (cross-file symbols already resolved via the
  // Phase 1.5 compositionContext), so we collect every file's diagnostics in
  // one pass and fail once at the end if any file errored.
  const compiledIRs: Array<{ ir: IR; absPath: string }> = [];
  const compiler = new IRCompiler();
  let anyFileFailed = false;

  for (const file of resolution.order) {
    const result = await compiler.compileToIR(file.source, {
      useCache,
      sourcePath: file.absPath,
      compositionContext,
      nameRegistry,
      naming: namingPolicy,
      // Reaction completeness is whole-program (a reaction can listen for an
      // event emitted by a command in another file). Defer it to the merged-IR
      // pass below so cross-file reactions aren't falsely flagged.
      skipReactionCompleteness: true,
    });

    for (const d of result.diagnostics) {
      diagnostics.push({
        ...d,
        message: `[${file.absPath}] ${d.message}`,
      });
    }

    if (!result.ir) {
      anyFileFailed = true;
      continue; // keep compiling so every file's errors surface together
    }

    compiledIRs.push({ ir: result.ir, absPath: file.absPath });
    sources.push({
      absPath: file.absPath,
      contentHash: result.ir.provenance.contentHash,
    });
  }

  // Any single-file compile error makes the merged IR unsound — stop before the
  // cross-file phases, but only after collecting all per-file diagnostics above.
  if (anyFileFailed) {
    return { ir: null, diagnostics, sources };
  }

  // Phase 3: Cross-file validation
  const { entityNames, diagnostics: uniquenessDiagnostics } = collectCrossFileNameUniqueness(
    compiledIRs,
    integrity,
  );
  diagnostics.push(...uniquenessDiagnostics);

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  diagnostics.push(...validateCrossFileReferences(compiledIRs, entityNames, integrity));

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  // Phase 4: Merge IRs into single output
  const mergedIR = mergeIRs(
    compiledIRs.map((c) => c.ir),
    sources,
    basePath,
    integrity,
  );

  // Phase 4.25: Re-derive initialization plans against the merged program.
  // Per-file compile only sees `tenant` when that file declares it; mixin-
  // expanded ownership properties alone do not populate
  // authenticatedOwnershipFields. After merge the singular tenant (and full
  // entity shapes) are available — re-attach so multi-file `use` matches
  // single-file ownership semantics.
  attachInitializationPlans(mergedIR.entities, mergedIR.commands, mergedIR.tenant);

  // Phase 4.5: Whole-program reaction completeness. Deferred from the per-file
  // compiles (skipReactionCompleteness) because a reaction can listen for an
  // event emitted by a command in another file — only the merged IR has the full
  // command/event/reaction set, so this is where "no command emits that event"
  // can be judged without cross-file false positives.
  checkReactionCompleteness(
    mergedIR.entities,
    mergedIR.commands,
    mergedIR.reactions ?? [],
    (severity, message) => {
      if (severity === 'info') return;
      diagnostics.push({ severity, message });
    },
    mergedIR.events ?? [],
  );
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  // Compute IR hash for the merged result
  const irHash = await computeIRHash(mergedIR);
  mergedIR.provenance.irHash = irHash;

  return { ir: mergedIR, diagnostics, sources };
}

/**
 * Merge multiple already-compiled IRs into a single deterministic IR (public API).
 *
 * Thin wrapper over the internal multi-file merge for callers that already hold
 * compiled IRs (e.g. composing IRs from separately-compiled sources). Provenance
 * sources are derived from each input IR's provenance. The result's irHash is NOT
 * recomputed — call computeIRHash(result) if a content hash is required.
 */
export function mergeIR(irs: IR[]): IR {
  const sources = irs.flatMap((ir) =>
    ir.provenance.sources && ir.provenance.sources.length > 0
      ? ir.provenance.sources.map((s) => ({ absPath: s.path, contentHash: s.contentHash }))
      : [{ absPath: ir.provenance.contentHash, contentHash: ir.provenance.contentHash }],
  );
  const merged = mergeIRs(irs, sources, '', resolveMergeIntegrity(undefined));
  attachInitializationPlans(merged.entities, merged.commands, merged.tenant);
  return merged;
}

/**
 * Merge multiple IR outputs into a single deterministic IR.
 * Arrays are concatenated and sorted by name for determinism.
 * Modules with the same name are merged (union of members).
 * Config G3 `lastWins` dedupes entities/commands before sort.
 */
function mergeIRs(
  irs: IR[],
  sources: Array<{ absPath: string; contentHash: string }>,
  basePath: string,
  integrity: ResolvedMergeIntegrity,
): IR {
  let entities: IREntity[] = [];
  const enums: IREnum[] = [];
  const stores: IRStore[] = [];
  const events: IREvent[] = [];
  let commands: IRCommand[] = [];
  const policies: IRPolicy[] = [];
  const values: IRValueObject[] = [];
  const reactions: IRReactionRule[] = [];
  const roles: IRRole[] = [];
  const sagas: IRSaga[] = [];
  const webhooks: IRWebhook[] = [];
  const schedules: IRSchedule[] = [];
  const moduleMap = new Map<string, IRModule>();
  let tenant: IRTenant | undefined;

  for (const ir of irs) {
    entities.push(...ir.entities);
    enums.push(...ir.enums);
    stores.push(...ir.stores);
    events.push(...ir.events);
    commands.push(...ir.commands);
    policies.push(...ir.policies);
    values.push(...ir.values);
    if (ir.reactions) reactions.push(...ir.reactions);
    if (ir.roles) roles.push(...ir.roles);
    if (ir.sagas) sagas.push(...ir.sagas);
    if (ir.webhooks) webhooks.push(...ir.webhooks);
    if (ir.schedules) schedules.push(...ir.schedules);

    if (ir.tenant && !tenant) {
      tenant = ir.tenant;
    }

    // Merge modules by name
    for (const mod of ir.modules) {
      const existing = moduleMap.get(mod.name);
      if (existing) {
        existing.entities = [...new Set([...existing.entities, ...mod.entities])].sort((a, b) =>
          a.localeCompare(b),
        );
        existing.enums = [...new Set([...existing.enums, ...mod.enums])].sort((a, b) =>
          a.localeCompare(b),
        );
        existing.commands = [...new Set([...existing.commands, ...mod.commands])].sort((a, b) =>
          a.localeCompare(b),
        );
        existing.stores = [...new Set([...existing.stores, ...mod.stores])].sort((a, b) =>
          a.localeCompare(b),
        );
        existing.events = [...new Set([...existing.events, ...mod.events])].sort((a, b) =>
          a.localeCompare(b),
        );
        existing.policies = [...new Set([...existing.policies, ...mod.policies])].sort((a, b) =>
          a.localeCompare(b),
        );
        if (mod.reactions) {
          existing.reactions = [...new Set([...(existing.reactions ?? []), ...mod.reactions])].sort(
            (a, b) => a.localeCompare(b),
          );
        }
        if (mod.roles) {
          existing.roles = [...new Set([...(existing.roles ?? []), ...mod.roles])].sort((a, b) =>
            a.localeCompare(b),
          );
        }
        if (mod.sagas) {
          existing.sagas = [...new Set([...(existing.sagas ?? []), ...mod.sagas])].sort((a, b) =>
            a.localeCompare(b),
          );
        }
        if (mod.schedules) {
          existing.schedules = [...new Set([...(existing.schedules ?? []), ...mod.schedules])].sort(
            (a, b) => a.localeCompare(b),
          );
        }
        if (mod.webhooks) {
          existing.webhooks = [...new Set([...(existing.webhooks ?? []), ...mod.webhooks])].sort(
            (a, b) => a.localeCompare(b),
          );
        }
      } else {
        moduleMap.set(mod.name, { ...mod });
      }
    }
  }

  if (integrity.onDuplicateEntity === 'lastWins') {
    entities = dedupeLastByKey(entities, (e) => e.name);
  }
  if (integrity.onDuplicateCommand === 'lastWins') {
    commands = dedupeLastByKey(commands, (c) => (c.entity ? `${c.entity}.${c.name}` : c.name));
  }

  // Sort all arrays by name for determinism
  entities.sort((a, b) => a.name.localeCompare(b.name));
  enums.sort((a, b) => a.name.localeCompare(b.name));
  stores.sort((a, b) => a.entity.localeCompare(b.entity));
  events.sort((a, b) => a.name.localeCompare(b.name));
  commands.sort((a, b) => {
    const aKey = a.entity ? `${a.entity}.${a.name}` : a.name;
    const bKey = b.entity ? `${b.entity}.${b.name}` : b.name;
    return aKey.localeCompare(bKey);
  });
  policies.sort((a, b) => a.name.localeCompare(b.name));
  values.sort((a, b) => a.name.localeCompare(b.name));
  reactions.sort((a, b) =>
    `${a.event}.${a.targetEntity}`.localeCompare(`${b.event}.${b.targetEntity}`),
  );
  roles.sort((a, b) => a.name.localeCompare(b.name));
  sagas.sort((a, b) => a.name.localeCompare(b.name));
  webhooks.sort((a, b) => a.name.localeCompare(b.name));
  schedules.sort((a, b) => a.name.localeCompare(b.name));

  const modules = [...moduleMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Create merged provenance
  const sortedHashes = sources.map((s) => s.contentHash).sort((a, b) => a.localeCompare(b));
  const mergedContentHash = sortedHashes.join(':');

  const provenanceSources: IRProvenanceSource[] = sources
    .map((s) => ({
      path: basePath ? s.absPath.replace(basePath, '').replace(/^[/\\]/, '') : s.absPath,
      contentHash: s.contentHash,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const provenance: IRProvenance = {
    contentHash: mergedContentHash,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    compiledAt: new Date().toISOString(),
    sources: provenanceSources,
  };

  const ir: IR = {
    version: '1.0',
    provenance,
    modules,
    values,
    entities,
    enums,
    stores,
    events,
    commands,
    policies,
  };

  if (tenant) ir.tenant = tenant;
  if (reactions.length > 0) ir.reactions = reactions;
  if (roles.length > 0) ir.roles = roles;
  if (sagas.length > 0) ir.sagas = sagas;
  if (webhooks.length > 0) ir.webhooks = webhooks;
  if (schedules.length > 0) ir.schedules = schedules;

  return ir;
}
