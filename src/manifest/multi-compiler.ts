import { Parser } from './parser.js';
import { IRCompiler, computeIRHash } from './ir-compiler.js';
import { resolveModuleGraph, ResolverHost } from './module-resolver.js';
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

export interface CompileProjectOptions {
  /** Absolute paths of entry .manifest files */
  entries: string[];
  /** Filesystem abstraction (defaults to node fs host) */
  host: ResolverHost;
  /** Whether to use the IR cache for individual file compilation */
  useCache?: boolean;
  /** Base path for computing relative source paths in provenance */
  basePath?: string;
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
export async function compileProjectToIR(options: CompileProjectOptions): Promise<MultiCompileResult> {
  const { entries, host, useCache = true, basePath = '' } = options;
  const diagnostics: IRDiagnostic[] = [];
  const sources: Array<{ absPath: string; contentHash: string }> = [];

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

  if (resolution.diagnostics.some(d => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  // Phase 2: Compile each file in topological order
  const compiledIRs: Array<{ ir: IR; absPath: string }> = [];
  const compiler = new IRCompiler();

  for (const file of resolution.order) {
    const result = await compiler.compileToIR(file.source, {
      useCache,
      sourcePath: file.absPath,
    });

    for (const d of result.diagnostics) {
      diagnostics.push({
        ...d,
        message: `[${file.absPath}] ${d.message}`,
      });
    }

    if (!result.ir) {
      return { ir: null, diagnostics, sources };
    }

    compiledIRs.push({ ir: result.ir, absPath: file.absPath });
    sources.push({
      absPath: file.absPath,
      contentHash: result.ir.provenance.contentHash,
    });
  }

  // Phase 3: Cross-file validation
  const entityNames = new Map<string, string>(); // name → sourceFile
  const enumNames = new Map<string, string>();
  const commandKeys = new Map<string, string>(); // "entity.command" or "command" → sourceFile
  let tenantFile: string | undefined;

  for (const { ir, absPath } of compiledIRs) {
    // Check entity name uniqueness
    for (const entity of ir.entities) {
      const existing = entityNames.get(entity.name);
      if (existing) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate entity '${entity.name}' declared in '${absPath}' and '${existing}'`,
        });
      } else {
        entityNames.set(entity.name, absPath);
      }
    }

    // Check enum name uniqueness
    for (const en of ir.enums) {
      const existing = enumNames.get(en.name);
      if (existing) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate enum '${en.name}' declared in '${absPath}' and '${existing}'`,
        });
      } else {
        enumNames.set(en.name, absPath);
      }
    }

    // Check command uniqueness (entity-scoped)
    for (const cmd of ir.commands) {
      const key = cmd.entity ? `${cmd.entity}.${cmd.name}` : cmd.name;
      const existing = commandKeys.get(key);
      if (existing) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate command '${key}' declared in '${absPath}' and '${existing}'`,
        });
      } else {
        commandKeys.set(key, absPath);
      }
    }

    // Check tenant uniqueness
    if (ir.tenant) {
      if (tenantFile) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate tenant declaration in '${absPath}' and '${tenantFile}'`,
        });
      } else {
        tenantFile = absPath;
      }
    }
  }

  if (diagnostics.some(d => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  // Cross-file relationship target validation
  for (const { ir, absPath } of compiledIRs) {
    for (const entity of ir.entities) {
      for (const rel of entity.relationships) {
        if (!entityNames.has(rel.target)) {
          diagnostics.push({
            severity: 'error',
            message: `[${absPath}] Entity '${entity.name}' has relationship '${rel.name}' targeting unknown entity '${rel.target}'`,
          });
        }
        if (rel.through && !entityNames.has(rel.through)) {
          diagnostics.push({
            severity: 'error',
            message: `[${absPath}] Entity '${entity.name}' has relationship '${rel.name}' with unknown through entity '${rel.through}'`,
          });
        }
      }
    }

    // Validate store entity references
    for (const store of ir.stores) {
      if (!entityNames.has(store.entity)) {
        diagnostics.push({
          severity: 'error',
          message: `[${absPath}] Store references unknown entity '${store.entity}'`,
        });
      }
    }
  }

  if (diagnostics.some(d => d.severity === 'error')) {
    return { ir: null, diagnostics, sources };
  }

  // Phase 4: Merge IRs into single output
  const mergedIR = mergeIRs(compiledIRs.map(c => c.ir), sources, basePath);

  // Compute IR hash for the merged result
  const irHash = await computeIRHash(mergedIR);
  mergedIR.provenance.irHash = irHash;

  return { ir: mergedIR, diagnostics, sources };
}

/**
 * Merge multiple IR outputs into a single deterministic IR.
 * Arrays are concatenated and sorted by name for determinism.
 * Modules with the same name are merged (union of members).
 */
function mergeIRs(
  irs: IR[],
  sources: Array<{ absPath: string; contentHash: string }>,
  basePath: string,
): IR {
  const entities: IREntity[] = [];
  const enums: IREnum[] = [];
  const stores: IRStore[] = [];
  const events: IREvent[] = [];
  const commands: IRCommand[] = [];
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
        existing.entities = [...new Set([...existing.entities, ...mod.entities])].sort();
        existing.enums = [...new Set([...existing.enums, ...mod.enums])].sort();
        existing.commands = [...new Set([...existing.commands, ...mod.commands])].sort();
        existing.stores = [...new Set([...existing.stores, ...mod.stores])].sort();
        existing.events = [...new Set([...existing.events, ...mod.events])].sort();
        existing.policies = [...new Set([...existing.policies, ...mod.policies])].sort();
        if (mod.reactions) {
          existing.reactions = [...new Set([...(existing.reactions ?? []), ...mod.reactions])].sort();
        }
        if (mod.roles) {
          existing.roles = [...new Set([...(existing.roles ?? []), ...mod.roles])].sort();
        }
        if (mod.sagas) {
          existing.sagas = [...new Set([...(existing.sagas ?? []), ...mod.sagas])].sort();
        }
        if (mod.schedules) {
          existing.schedules = [...new Set([...(existing.schedules ?? []), ...mod.schedules])].sort();
        }
        if (mod.webhooks) {
          existing.webhooks = [...new Set([...(existing.webhooks ?? []), ...mod.webhooks])].sort();
        }
      } else {
        moduleMap.set(mod.name, { ...mod });
      }
    }
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
  reactions.sort((a, b) => `${a.event}.${a.targetEntity}`.localeCompare(`${b.event}.${b.targetEntity}`));
  roles.sort((a, b) => a.name.localeCompare(b.name));
  sagas.sort((a, b) => a.name.localeCompare(b.name));
  webhooks.sort((a, b) => a.name.localeCompare(b.name));
  schedules.sort((a, b) => a.name.localeCompare(b.name));

  const modules = [...moduleMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Create merged provenance
  const sortedHashes = sources.map(s => s.contentHash).sort();
  const mergedContentHash = sortedHashes.join(':');

  const provenanceSources: IRProvenanceSource[] = sources
    .map(s => ({
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
