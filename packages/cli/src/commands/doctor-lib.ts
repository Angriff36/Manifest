import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticFinding {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
  line?: number;
  details?: Record<string, unknown>;
  suggestion?: string;
}

export interface EntitySurfaceShape {
  exists: boolean;
  commands: string[];
  properties: string[];
  emits: string[];
}

export interface EntitySurfaceDiff {
  entityName: string;
  hasDrift: boolean;
  entityMissingInSource: boolean;
  entityMissingInIR: boolean;
  commands: { missingInIR: string[]; extraInIR: string[] };
  properties: { missingInIR: string[]; extraInIR: string[] };
  emits: { missingInIR: string[]; extraInIR: string[] };
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function diffSets(sourceValues: string[], irValues: string[]) {
  const sourceSet = new Set(sourceValues);
  const irSet = new Set(irValues);
  return {
    missingInIR: uniqueSorted(sourceValues.filter((v) => !irSet.has(v))),
    extraInIR: uniqueSorted(irValues.filter((v) => !sourceSet.has(v))),
  };
}

export function diffEntitySurface(input: {
  entityName: string;
  source: EntitySurfaceShape;
  ir: EntitySurfaceShape;
}): EntitySurfaceDiff {
  const entityMissingInSource = !input.source.exists;
  const entityMissingInIR = !input.ir.exists;

  const commands = diffSets(input.source.commands, input.ir.commands);
  const properties = diffSets(input.source.properties, input.ir.properties);
  const emits = diffSets(input.source.emits, input.ir.emits);

  const hasDrift =
    entityMissingInSource ||
    entityMissingInIR ||
    commands.missingInIR.length > 0 ||
    commands.extraInIR.length > 0 ||
    properties.missingInIR.length > 0 ||
    properties.extraInIR.length > 0 ||
    emits.missingInIR.length > 0 ||
    emits.extraInIR.length > 0;

  return {
    entityName: input.entityName,
    hasDrift,
    entityMissingInSource,
    entityMissingInIR,
    commands,
    properties,
    emits,
  };
}

function findEntityBlock(source: string, entityName: string): string | null {
  const entityRegex = new RegExp(`\\bentity\\s+${entityName}\\b`);
  const match = entityRegex.exec(source);
  if (!match) return null;

  const start = match.index;
  const openBrace = source.indexOf('{', start);
  if (openBrace < 0) return null;

  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return source.slice(start);
}

export function detectEntitySourceParseHeuristics(input: {
  entityName: string;
  source: string;
  parsedCommandCount: number;
}): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const block = findEntityBlock(input.source, input.entityName);
  if (!block) {
    return findings;
  }

  const rawCommandTokenCount = (block.match(/\bcommand\b/g) || []).length;
  if (rawCommandTokenCount > 0 && input.parsedCommandCount === 0) {
    findings.push({
      severity: 'error',
      code: 'SOURCE_ENTITY_RAW_COMMAND_TOKENS_UNPARSED',
      message: `Entity '${input.entityName}' contains raw 'command' tokens in source, but parsed command count is 0.`,
      details: {
        entityName: input.entityName,
        rawCommandTokenCount,
        parsedCommandCount: input.parsedCommandCount,
      },
      suggestion: 'Likely parser/scanner mismatch or parse failure inside the entity block. Re-run compile diagnostics and inspect unsupported syntax in this entity.',
    });
  }

  return findings;
}

export interface DuplicateReportEntry {
  type: string;
  key: string;
  keptFrom: string | null;
  droppedFrom: string | null;
  classification: 'known' | 'suspicious';
  sourceReport: string;
  raw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function collectCandidateArrays(report: unknown): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const root = asRecord(report);
  if (!root) return candidates;

  const queue: unknown[] = [root];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      const allRecords = current.every((v) => asRecord(v));
      if (allRecords) {
        for (const item of current) {
          candidates.push(item as Record<string, unknown>);
        }
      }
      continue;
    }

    const rec = asRecord(current);
    if (!rec) continue;
    for (const value of Object.values(rec)) {
      if (Array.isArray(value) || asRecord(value)) {
        queue.push(value);
      }
    }
  }

  return candidates;
}

function classifyDuplicate(raw: Record<string, unknown>): 'known' | 'suspicious' {
  const status = pickString(raw, ['classification', 'status', 'disposition', 'action', 'kind'])?.toLowerCase() ?? '';
  const reason = pickString(raw, ['reason', 'note', 'explanation'])?.toLowerCase() ?? '';
  if (
    status.includes('known') ||
    status.includes('allow') ||
    status.includes('merged') ||
    status.includes('drop') ||
    reason.includes('known') ||
    reason.includes('duplicate')
  ) {
    return 'known';
  }
  return 'suspicious';
}

export function normalizeMergeReportEntries(report: unknown, sourceReport: string): DuplicateReportEntry[] {
  const entries: DuplicateReportEntry[] = [];
  for (const item of collectCandidateArrays(report)) {
    const type = pickString(item, ['type', 'duplicateType', 'entryType']) ?? '';
    const key = pickString(item, ['key', 'duplicateKey', 'name', 'id']) ?? '';
    const keptFrom = pickString(item, ['keptFrom', 'kept', 'winner', 'sourceKept']);
    const droppedFrom = pickString(item, ['droppedFrom', 'dropped', 'loser', 'sourceDropped']);

    // Only keep rows that look like duplicate report items.
    if (!type && !key && !keptFrom && !droppedFrom) continue;

    entries.push({
      type: type || 'unknown',
      key: key || '(unknown)',
      keptFrom,
      droppedFrom,
      classification: classifyDuplicate(item),
      sourceReport,
      raw: item,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Repo file discovery + IR/source inspection helpers used by CLI commands
// ---------------------------------------------------------------------------

export interface SourceEntityDefinition {
  entityName: string;
  file: string;
  line?: number;
  properties: string[];
  commands: string[];
  policies: string[];
  emits: string[];
  parserHeuristics: DiagnosticFinding[];
  parserErrors: Array<{ message: string; line?: number; column?: number; severity?: string }>;
}

export interface SourceInspectionResult {
  entities: Map<string, SourceEntityDefinition[]>;
  filesScanned: number;
  filesWithParseErrors: number;
}

export interface IREntityDefinition {
  entityName: string;
  irFile: string;
  properties: string[];
  commands: string[];
  policies: string[];
  emits: string[];
  events: string[];
  provenance?: Record<string, unknown>;
}

export interface IRInspectionResult {
  entities: Map<string, IREntityDefinition[]>;
  filesScanned: number;
}

export async function findManifestSourceFiles(cwd: string, srcPattern = '**/*.manifest'): Promise<string[]> {
  const files = await glob(srcPattern, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });
  return uniqueSorted(files);
}

async function loadParserClass() {
  const mod = await import('../../../../dist/manifest/parser.js');
  return mod.Parser as unknown as new () => {
    parse(source: string): {
      program: Record<string, unknown>;
      errors: Array<{ message: string; severity?: string; position?: { line?: number; column?: number } }>;
    };
  };
}

function flattenProgramEntities(program: Record<string, unknown>): Array<Record<string, unknown>> {
  const top = Array.isArray(program.entities) ? (program.entities as Array<Record<string, unknown>>) : [];
  const modules = Array.isArray(program.modules) ? (program.modules as Array<Record<string, unknown>>) : [];
  const nested = modules.flatMap((m) => Array.isArray(m.entities) ? (m.entities as Array<Record<string, unknown>>) : []);
  return [...top, ...nested];
}

function sourceFileLevelPoliciesForEntity(program: Record<string, unknown>, entityName: string): string[] {
  const collect = (arr: unknown[]) =>
    arr
      .filter((p) => asRecord(p)?.entity === entityName || asRecord(p)?.name)
      .map((p) => pickString(p as Record<string, unknown>, ['name']))
      .filter((v): v is string => !!v);

  const topPolicies = Array.isArray(program.policies) ? collect(program.policies) : [];
  const modulePolicies = Array.isArray(program.modules)
    ? (program.modules as unknown[]).flatMap((m) => {
        const rec = asRecord(m);
        return rec && Array.isArray(rec.policies) ? collect(rec.policies) : [];
      })
    : [];
  return uniqueSorted([...topPolicies, ...modulePolicies]);
}

function fileLevelEventNames(program: Record<string, unknown>): string[] {
  const collectEvents = (arr: unknown[]) =>
    arr
      .map((e) => pickString((e as Record<string, unknown>) || {}, ['name']))
      .filter((v): v is string => !!v);

  const topEvents = Array.isArray(program.events) ? collectEvents(program.events) : [];
  const moduleEvents = Array.isArray(program.modules)
    ? (program.modules as unknown[]).flatMap((m) => {
        const rec = asRecord(m);
        return rec && Array.isArray(rec.events) ? collectEvents(rec.events) : [];
      })
    : [];
  return uniqueSorted([...topEvents, ...moduleEvents]);
}

function extractSourceEntityDefinition(input: {
  entityNode: Record<string, unknown>;
  source: string;
  file: string;
  program: Record<string, unknown>;
  parserErrors: Array<{ message: string; severity?: string; position?: { line?: number; column?: number } }>;
}): SourceEntityDefinition | null {
  const entityName = pickString(input.entityNode, ['name']);
  if (!entityName) return null;

  const properties = Array.isArray(input.entityNode.properties)
    ? (input.entityNode.properties as unknown[])
        .map((p) => pickString((p as Record<string, unknown>) || {}, ['name']))
        .filter((v): v is string => !!v)
    : [];
  const commands = Array.isArray(input.entityNode.commands)
    ? (input.entityNode.commands as unknown[])
        .map((c) => pickString((c as Record<string, unknown>) || {}, ['name']))
        .filter((v): v is string => !!v)
    : [];
  const policies = Array.isArray(input.entityNode.policies)
    ? (input.entityNode.policies as unknown[])
        .map((p) => pickString((p as Record<string, unknown>) || {}, ['name']))
        .filter((v): v is string => !!v)
    : [];

  const emits = Array.isArray(input.entityNode.commands)
    ? (input.entityNode.commands as unknown[]).flatMap((cmd) => {
        const rec = asRecord(cmd);
        return rec && Array.isArray(rec.emits)
          ? rec.emits.filter((e): e is string => typeof e === 'string')
          : [];
      })
    : [];

  const parserHeuristics = detectEntitySourceParseHeuristics({
    entityName,
    source: input.source,
    parsedCommandCount: commands.length,
  });

  const fileParserErrors = input.parserErrors.map((e) => ({
    message: e.message,
    line: e.position?.line,
    column: e.position?.column,
    severity: e.severity,
  }));

  return {
    entityName,
    file: input.file,
    line: (asRecord(input.entityNode.position)?.line as number | undefined) ?? undefined,
    properties: uniqueSorted(properties),
    commands: uniqueSorted(commands),
    policies: uniqueSorted([...policies, ...sourceFileLevelPoliciesForEntity(input.program, entityName)]),
    emits: uniqueSorted(emits),
    parserHeuristics,
    parserErrors: fileParserErrors,
  };
}

export async function inspectSourceEntities(options: {
  cwd?: string;
  srcPattern?: string;
} = {}): Promise<SourceInspectionResult> {
  const cwd = options.cwd || process.cwd();
  const files = await findManifestSourceFiles(cwd, options.srcPattern || '**/*.manifest');
  const Parser = await loadParserClass();
  const entities = new Map<string, SourceEntityDefinition[]>();
  let filesWithParseErrors = 0;

  for (const file of files) {
    const source = await fs.readFile(file, 'utf-8');
    const parser = new Parser();
    const { program, errors } = parser.parse(source);
    if ((errors || []).some((e) => e.severity === 'error')) filesWithParseErrors++;
    const programRecord = program as unknown as Record<string, unknown>;
    const eventNames = fileLevelEventNames(programRecord);
    const entityNodes = flattenProgramEntities(programRecord);

    for (const entityNode of entityNodes) {
      const definition = extractSourceEntityDefinition({
        entityNode,
        source,
        file,
        program: programRecord,
        parserErrors: errors || [],
      });
      if (!definition) continue;
      // File-level event declarations are not entity-scoped in the AST; include as context.
      definition.emits = uniqueSorted([...definition.emits, ...eventNames]);
      const list = entities.get(definition.entityName) || [];
      list.push(definition);
      entities.set(definition.entityName, list);
    }
  }

  return { entities, filesScanned: files.length, filesWithParseErrors };
}

export async function discoverIRFiles(options: {
  cwd?: string;
  irRoots?: string[];
} = {}): Promise<string[]> {
  const cwd = options.cwd || process.cwd();
  const roots = uniqueSorted(
    (options.irRoots && options.irRoots.length > 0
      ? options.irRoots
      : ['packages/manifest-ir/ir', 'ir'])
      .map((r) => path.resolve(cwd, r))
  );

  const files = new Set<string>();
  for (const root of roots) {
    try {
      const matches = await glob('**/*.ir.json', {
        cwd: root,
        absolute: true,
        ignore: ['**/node_modules/**'],
      });
      for (const f of matches) files.add(path.resolve(f));
    } catch {
      // Optional roots.
    }
  }
  return uniqueSorted(files);
}

export async function inspectCompiledIR(options: {
  cwd?: string;
  irRoots?: string[];
} = {}): Promise<IRInspectionResult> {
  const files = await discoverIRFiles(options);
  const entities = new Map<string, IREntityDefinition[]>();

  for (const file of files) {
    let parsed: any;
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
    } catch {
      continue;
    }

    const irEntities = Array.isArray(parsed?.entities) ? parsed.entities : [];
    const irCommands = Array.isArray(parsed?.commands) ? parsed.commands : [];
    const irEvents = Array.isArray(parsed?.events) ? parsed.events : [];
    const irPolicies = Array.isArray(parsed?.policies) ? parsed.policies : [];

    for (const entity of irEntities) {
      const entityName = typeof entity?.name === 'string' ? entity.name : null;
      if (!entityName) continue;

      const commands = irCommands
        .filter((c: any) => c?.entity === entityName && typeof c?.name === 'string')
        .map((c: any) => c.name);
      const emits = irCommands
        .filter((c: any) => c?.entity === entityName && Array.isArray(c?.emits))
        .flatMap((c: any) => c.emits.filter((e: unknown) => typeof e === 'string'));
      const properties = Array.isArray(entity?.properties)
        ? entity.properties
            .map((p: any) => (typeof p?.name === 'string' ? p.name : null))
            .filter((v: string | null): v is string => !!v)
        : [];
      const policies = Array.isArray(entity?.policies)
        ? entity.policies.filter((p: unknown) => typeof p === 'string')
        : [];
      const events = irEvents
        .map((e: any) => (typeof e?.name === 'string' ? e.name : null))
        .filter((v: string | null): v is string => !!v);

      const list = entities.get(entityName) || [];
      list.push({
        entityName,
        irFile: file,
        properties: uniqueSorted(properties),
        commands: uniqueSorted(commands),
        policies: uniqueSorted([
          ...policies,
          ...irPolicies
            .filter((p: any) => p?.entity === entityName && typeof p?.name === 'string')
            .map((p: any) => p.name),
        ]),
        emits: uniqueSorted(emits),
        events: uniqueSorted(events),
        provenance: asRecord(parsed?.provenance) || undefined,
      });
      entities.set(entityName, list);
    }
  }

  return { entities, filesScanned: files.length };
}

export function mergeSourceEntityDefinitions(defs: SourceEntityDefinition[] | undefined): EntitySurfaceShape & {
  files: Array<{ file: string; line?: number }>;
  parserFindings: DiagnosticFinding[];
  parserErrors: SourceEntityDefinition['parserErrors'];
  policies: string[];
} {
  if (!defs || defs.length === 0) {
    return {
      exists: false,
      commands: [],
      properties: [],
      emits: [],
      files: [],
      parserFindings: [],
      parserErrors: [],
      policies: [],
    };
  }
  return {
    exists: true,
    commands: uniqueSorted(defs.flatMap((d) => d.commands)),
    properties: uniqueSorted(defs.flatMap((d) => d.properties)),
    emits: uniqueSorted(defs.flatMap((d) => d.emits)),
    files: defs.map((d) => ({ file: d.file, line: d.line })),
    parserFindings: defs.flatMap((d) => d.parserHeuristics),
    parserErrors: defs.flatMap((d) => d.parserErrors),
    policies: uniqueSorted(defs.flatMap((d) => d.policies)),
  };
}

export function mergeIREntityDefinitions(defs: IREntityDefinition[] | undefined): EntitySurfaceShape & {
  files: Array<{ file: string; provenance?: Record<string, unknown> }>;
  policies: string[];
  events: string[];
} {
  if (!defs || defs.length === 0) {
    return {
      exists: false,
      commands: [],
      properties: [],
      emits: [],
      files: [],
      policies: [],
      events: [],
    };
  }
  return {
    exists: true,
    commands: uniqueSorted(defs.flatMap((d) => d.commands)),
    properties: uniqueSorted(defs.flatMap((d) => d.properties)),
    emits: uniqueSorted(defs.flatMap((d) => d.emits)),
    files: defs.map((d) => ({ file: d.irFile, provenance: d.provenance })),
    policies: uniqueSorted(defs.flatMap((d) => d.policies)),
    events: uniqueSorted(defs.flatMap((d) => d.events)),
  };
}

export interface RouteManifestCommandHit {
  routePath: string;
  method: string;
  sourceKind: string;
  sourceEntity: string;
  sourceCommand: string;
  manifestFile: string;
}

export async function findRoutesManifestFiles(cwd: string = process.cwd()): Promise<string[]> {
  const files = await glob('**/routes.manifest.json', {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**/.vite/**'],
  });
  return uniqueSorted(files);
}

export async function inspectRouteSurfaceForCommand(options: {
  entityName: string;
  commandName: string;
  routePath?: string;
  cwd?: string;
}): Promise<{ routeExists: boolean; matches: RouteManifestCommandHit[] }> {
  const files = await findRoutesManifestFiles(options.cwd || process.cwd());
  const matches: RouteManifestCommandHit[] = [];
  for (const file of files) {
    let json: any;
    try {
      json = JSON.parse(await fs.readFile(file, 'utf-8'));
    } catch {
      continue;
    }
    const routes = Array.isArray(json?.routes) ? json.routes : [];
    for (const route of routes) {
      const source = route?.source;
      const sameCommand =
        source?.kind === 'command' &&
        source?.entity === options.entityName &&
        source?.command === options.commandName;
      const samePath = options.routePath ? route?.path === options.routePath : true;
      if (sameCommand && samePath) {
        matches.push({
          routePath: route.path,
          method: route.method,
          sourceKind: source.kind,
          sourceEntity: source.entity,
          sourceCommand: source.command,
          manifestFile: file,
        });
      }
    }
  }
  return { routeExists: matches.length > 0, matches };
}

export async function readMergeReports(options: {
  cwd?: string;
  pattern?: string;
} = {}): Promise<Array<{ file: string; entries: DuplicateReportEntry[]; parseError?: string }>> {
  const cwd = options.cwd || process.cwd();
  const pattern = options.pattern || '**/*.merge-report.json';
  const files = await glob(pattern, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });

  const results: Array<{ file: string; entries: DuplicateReportEntry[]; parseError?: string }> = [];
  for (const file of uniqueSorted(files)) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
      results.push({
        file,
        entries: normalizeMergeReportEntries(parsed, file),
      });
    } catch (error) {
      results.push({
        file,
        entries: [],
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function formatRelative(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || filePath;
}
