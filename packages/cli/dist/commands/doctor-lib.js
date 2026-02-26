import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
function uniqueSorted(values) {
    return Array.from(new Set(Array.from(values).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
function diffSets(sourceValues, irValues) {
    const sourceSet = new Set(sourceValues);
    const irSet = new Set(irValues);
    return {
        missingInIR: uniqueSorted(sourceValues.filter((v) => !irSet.has(v))),
        extraInIR: uniqueSorted(irValues.filter((v) => !sourceSet.has(v))),
    };
}
export function diffEntitySurface(input) {
    const entityMissingInSource = !input.source.exists;
    const entityMissingInIR = !input.ir.exists;
    const commands = diffSets(input.source.commands, input.ir.commands);
    const properties = diffSets(input.source.properties, input.ir.properties);
    const emits = diffSets(input.source.emits, input.ir.emits);
    const hasDrift = entityMissingInSource ||
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
function findEntityBlock(source, entityName) {
    const entityRegex = new RegExp(`\\bentity\\s+${entityName}\\b`);
    const match = entityRegex.exec(source);
    if (!match)
        return null;
    const start = match.index;
    const openBrace = source.indexOf('{', start);
    if (openBrace < 0)
        return null;
    let depth = 0;
    for (let i = openBrace; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{')
            depth++;
        if (ch === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }
    return source.slice(start);
}
export function detectEntitySourceParseHeuristics(input) {
    const findings = [];
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
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function pickString(obj, keys) {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim())
            return value;
    }
    return null;
}
function collectCandidateArrays(report) {
    const candidates = [];
    const root = asRecord(report);
    if (!root)
        return candidates;
    const queue = [root];
    const visited = new Set();
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current))
            continue;
        visited.add(current);
        if (Array.isArray(current)) {
            const allRecords = current.every((v) => asRecord(v));
            if (allRecords) {
                for (const item of current) {
                    candidates.push(item);
                }
            }
            continue;
        }
        const rec = asRecord(current);
        if (!rec)
            continue;
        for (const value of Object.values(rec)) {
            if (Array.isArray(value) || asRecord(value)) {
                queue.push(value);
            }
        }
    }
    return candidates;
}
function classifyDuplicate(raw) {
    const status = pickString(raw, ['classification', 'status', 'disposition', 'action', 'kind'])?.toLowerCase() ?? '';
    const reason = pickString(raw, ['reason', 'note', 'explanation'])?.toLowerCase() ?? '';
    if (status.includes('known') ||
        status.includes('allow') ||
        status.includes('merged') ||
        status.includes('drop') ||
        reason.includes('known') ||
        reason.includes('duplicate')) {
        return 'known';
    }
    return 'suspicious';
}
export function normalizeMergeReportEntries(report, sourceReport) {
    const entries = [];
    for (const item of collectCandidateArrays(report)) {
        const type = pickString(item, ['type', 'duplicateType', 'entryType']) ?? '';
        const key = pickString(item, ['key', 'duplicateKey', 'name', 'id']) ?? '';
        const keptFrom = pickString(item, ['keptFrom', 'kept', 'winner', 'sourceKept']);
        const droppedFrom = pickString(item, ['droppedFrom', 'dropped', 'loser', 'sourceDropped']);
        // Only keep rows that look like duplicate report items.
        if (!type && !key && !keptFrom && !droppedFrom)
            continue;
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
export async function findManifestSourceFiles(cwd, srcPattern = '**/*.manifest') {
    const files = await glob(srcPattern, {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    });
    return uniqueSorted(files);
}
async function loadParserClass() {
    const mod = await import('../../../../dist/manifest/parser.js');
    return mod.Parser;
}
function flattenProgramEntities(program) {
    const top = Array.isArray(program.entities) ? program.entities : [];
    const modules = Array.isArray(program.modules) ? program.modules : [];
    const nested = modules.flatMap((m) => Array.isArray(m.entities) ? m.entities : []);
    return [...top, ...nested];
}
function sourceFileLevelPoliciesForEntity(program, entityName) {
    const collect = (arr) => arr
        .filter((p) => asRecord(p)?.entity === entityName || asRecord(p)?.name)
        .map((p) => pickString(p, ['name']))
        .filter((v) => !!v);
    const topPolicies = Array.isArray(program.policies) ? collect(program.policies) : [];
    const modulePolicies = Array.isArray(program.modules)
        ? program.modules.flatMap((m) => {
            const rec = asRecord(m);
            return rec && Array.isArray(rec.policies) ? collect(rec.policies) : [];
        })
        : [];
    return uniqueSorted([...topPolicies, ...modulePolicies]);
}
function fileLevelEventNames(program) {
    const collectEvents = (arr) => arr
        .map((e) => pickString(e || {}, ['name']))
        .filter((v) => !!v);
    const topEvents = Array.isArray(program.events) ? collectEvents(program.events) : [];
    const moduleEvents = Array.isArray(program.modules)
        ? program.modules.flatMap((m) => {
            const rec = asRecord(m);
            return rec && Array.isArray(rec.events) ? collectEvents(rec.events) : [];
        })
        : [];
    return uniqueSorted([...topEvents, ...moduleEvents]);
}
function extractSourceEntityDefinition(input) {
    const entityName = pickString(input.entityNode, ['name']);
    if (!entityName)
        return null;
    const properties = Array.isArray(input.entityNode.properties)
        ? input.entityNode.properties
            .map((p) => pickString(p || {}, ['name']))
            .filter((v) => !!v)
        : [];
    const commands = Array.isArray(input.entityNode.commands)
        ? input.entityNode.commands
            .map((c) => pickString(c || {}, ['name']))
            .filter((v) => !!v)
        : [];
    const policies = Array.isArray(input.entityNode.policies)
        ? input.entityNode.policies
            .map((p) => pickString(p || {}, ['name']))
            .filter((v) => !!v)
        : [];
    const emits = Array.isArray(input.entityNode.commands)
        ? input.entityNode.commands.flatMap((cmd) => {
            const rec = asRecord(cmd);
            return rec && Array.isArray(rec.emits)
                ? rec.emits.filter((e) => typeof e === 'string')
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
        line: asRecord(input.entityNode.position)?.line ?? undefined,
        properties: uniqueSorted(properties),
        commands: uniqueSorted(commands),
        policies: uniqueSorted([...policies, ...sourceFileLevelPoliciesForEntity(input.program, entityName)]),
        emits: uniqueSorted(emits),
        parserHeuristics,
        parserErrors: fileParserErrors,
    };
}
export async function inspectSourceEntities(options = {}) {
    const cwd = options.cwd || process.cwd();
    const files = await findManifestSourceFiles(cwd, options.srcPattern || '**/*.manifest');
    const Parser = await loadParserClass();
    const entities = new Map();
    let filesWithParseErrors = 0;
    for (const file of files) {
        const source = await fs.readFile(file, 'utf-8');
        const parser = new Parser();
        const { program, errors } = parser.parse(source);
        if ((errors || []).some((e) => e.severity === 'error'))
            filesWithParseErrors++;
        const programRecord = program;
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
            if (!definition)
                continue;
            // File-level event declarations are not entity-scoped in the AST; include as context.
            definition.emits = uniqueSorted([...definition.emits, ...eventNames]);
            const list = entities.get(definition.entityName) || [];
            list.push(definition);
            entities.set(definition.entityName, list);
        }
    }
    return { entities, filesScanned: files.length, filesWithParseErrors };
}
export async function discoverIRFiles(options = {}) {
    const cwd = options.cwd || process.cwd();
    const roots = uniqueSorted((options.irRoots && options.irRoots.length > 0
        ? options.irRoots
        : ['packages/manifest-ir/ir', 'ir'])
        .map((r) => path.resolve(cwd, r)));
    const files = new Set();
    for (const root of roots) {
        try {
            const matches = await glob('**/*.ir.json', {
                cwd: root,
                absolute: true,
                ignore: ['**/node_modules/**'],
            });
            for (const f of matches)
                files.add(path.resolve(f));
        }
        catch {
            // Optional roots.
        }
    }
    return uniqueSorted(files);
}
export async function inspectCompiledIR(options = {}) {
    const files = await discoverIRFiles(options);
    const entities = new Map();
    for (const file of files) {
        let parsed;
        try {
            parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
        }
        catch {
            continue;
        }
        const irEntities = Array.isArray(parsed?.entities) ? parsed.entities : [];
        const irCommands = Array.isArray(parsed?.commands) ? parsed.commands : [];
        const irEvents = Array.isArray(parsed?.events) ? parsed.events : [];
        const irPolicies = Array.isArray(parsed?.policies) ? parsed.policies : [];
        for (const entity of irEntities) {
            const entityName = typeof entity?.name === 'string' ? entity.name : null;
            if (!entityName)
                continue;
            const commands = irCommands
                .filter((c) => c?.entity === entityName && typeof c?.name === 'string')
                .map((c) => c.name);
            const emits = irCommands
                .filter((c) => c?.entity === entityName && Array.isArray(c?.emits))
                .flatMap((c) => c.emits.filter((e) => typeof e === 'string'));
            const properties = Array.isArray(entity?.properties)
                ? entity.properties
                    .map((p) => (typeof p?.name === 'string' ? p.name : null))
                    .filter((v) => !!v)
                : [];
            const policies = Array.isArray(entity?.policies)
                ? entity.policies.filter((p) => typeof p === 'string')
                : [];
            const events = irEvents
                .map((e) => (typeof e?.name === 'string' ? e.name : null))
                .filter((v) => !!v);
            const list = entities.get(entityName) || [];
            list.push({
                entityName,
                irFile: file,
                properties: uniqueSorted(properties),
                commands: uniqueSorted(commands),
                policies: uniqueSorted([
                    ...policies,
                    ...irPolicies
                        .filter((p) => p?.entity === entityName && typeof p?.name === 'string')
                        .map((p) => p.name),
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
export function mergeSourceEntityDefinitions(defs) {
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
export function mergeIREntityDefinitions(defs) {
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
export async function findRoutesManifestFiles(cwd = process.cwd()) {
    const files = await glob('**/routes.manifest.json', {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**/.vite/**'],
    });
    return uniqueSorted(files);
}
export async function inspectRouteSurfaceForCommand(options) {
    const files = await findRoutesManifestFiles(options.cwd || process.cwd());
    const matches = [];
    for (const file of files) {
        let json;
        try {
            json = JSON.parse(await fs.readFile(file, 'utf-8'));
        }
        catch {
            continue;
        }
        const routes = Array.isArray(json?.routes) ? json.routes : [];
        for (const route of routes) {
            const source = route?.source;
            const sameCommand = source?.kind === 'command' &&
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
export async function readMergeReports(options = {}) {
    const cwd = options.cwd || process.cwd();
    const pattern = options.pattern || '**/*.merge-report.json';
    const files = await glob(pattern, {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**'],
    });
    const results = [];
    for (const file of uniqueSorted(files)) {
        try {
            const parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
            results.push({
                file,
                entries: normalizeMergeReportEntries(parsed, file),
            });
        }
        catch (error) {
            results.push({
                file,
                entries: [],
                parseError: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return results;
}
export function formatRelative(cwd, filePath) {
    return path.relative(cwd, filePath) || filePath;
}
//# sourceMappingURL=doctor-lib.js.map