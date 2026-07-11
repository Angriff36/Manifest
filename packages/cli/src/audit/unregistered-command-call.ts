/**
 * unregistered-command-call detector.
 *
 * Scans application TS/JS files for `runtime.runCommand("entity.command", …)`
 * invocations and reports findings when the called command is absent from
 * the supplied commands registry, or when the command name is dynamic and
 * cannot be statically resolved against the registry.
 *
 * This detector is one of the building blocks of the `enforce-surface` CLI
 * command, which guards against agents inventing duplicate or bypass write
 * paths when a registered Manifest command already exists.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import ts from 'typescript';
import type { AuditFinding, Detector, DetectorContext } from './types.js';

interface CommandRegistryEntry {
  entity: string;
  command: string;
  commandId?: string;
}

interface WrappedCommandRegistry {
  commands: CommandRegistryEntry[];
}

// Real downstream consumers emit either of two shapes:
//   1. Wrapped:   { irHash, compilerVersion, commands: [ ... ] }
//   2. Flat:      [ { entity, command, commandId }, ... ]
// Tolerate both so the loader works against the canonical Manifest emit
// pipeline AND against repos that produce per-domain flat registries.
type CommandRegistryShape = WrappedCommandRegistry | CommandRegistryEntry[];

export async function loadCommandSet(registryPath: string): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await fs.readFile(registryPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Failed to read commands registry at ${registryPath}: ${(err as Error).message}`,
    );
  }
  const parsed = JSON.parse(raw) as CommandRegistryShape;
  const entries: CommandRegistryEntry[] = Array.isArray(parsed) ? parsed : (parsed.commands ?? []);
  const ids = new Set<string>();
  for (const c of entries) {
    if (c?.commandId) ids.add(c.commandId);
    else if (c?.entity && c?.command) ids.add(`${c.entity}.${c.command}`);
  }
  return ids;
}

export interface RunCommandCall {
  /** Static command id when the first argument is a string literal, else null. */
  commandId: string | null;
  /** True when the first argument is not a static string literal. */
  dynamic: boolean;
  line: number;
  column: number;
}

/**
 * Walk a TS/JS source file's AST and return every call to `runtime.runCommand`
 * or `<expr>.runtime.runCommand`. Static-string first arguments are extracted;
 * dynamic forms are reported with `commandId: null` and `dynamic: true`.
 */
/**
 * Resolve `entityName` from an options-object argument like
 * `{ entityName: 'ScheduleShift', ... }`. Returns null if the argument is
 * not an object literal or the property isn't a static string.
 */
function readEntityNameFromOptions(node: ts.Expression | undefined): string | null {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  for (const prop of node.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === 'entityName') ||
        (ts.isStringLiteralLike(prop.name) && prop.name.text === 'entityName'))
    ) {
      const v = prop.initializer;
      if (ts.isStringLiteralLike(v)) return v.text;
      return null;
    }
  }
  return null;
}

export function extractRunCommandCalls(source: string, filename: string): RunCommandCall[] {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const out: RunCommandCall[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'runCommand'
    ) {
      const left = node.expression.expression;
      const isRuntime =
        (ts.isIdentifier(left) && left.text === 'runtime') ||
        (ts.isPropertyAccessExpression(left) && left.name.text === 'runtime');
      if (isRuntime) {
        const start = node.getStart(sf);
        const { line, character } = sf.getLineAndCharacterOfPosition(start);
        const arg0 = node.arguments[0];
        const arg2 = node.arguments[2];
        const optsEntity = readEntityNameFromOptions(arg2);

        if (arg0 && ts.isStringLiteralLike(arg0)) {
          let commandId = arg0.text;
          // Support runCommand(command, payload, { entityName: 'X' }) by
          // composing `entityName.command` when the first arg is a bare
          // command name (no dot).
          if (optsEntity && !commandId.includes('.')) {
            commandId = `${optsEntity}.${commandId}`;
          }
          out.push({
            commandId,
            dynamic: false,
            line: line + 1,
            column: character + 1,
          });
        } else {
          out.push({
            commandId: null,
            dynamic: true,
            line: line + 1,
            column: character + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return out;
}

const SCAN_GLOBS = [
  'app/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'src/app/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'apps/*/app/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'pages/api/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'src/pages/api/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'app/actions/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'src/app/actions/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'jobs/**/*.{ts,tsx,js,jsx,mjs,cjs}',
  'src/jobs/**/*.{ts,tsx,js,jsx,mjs,cjs}',
];

const EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/generated/**',
  '**/*.test.{ts,tsx,js,jsx,mjs,cjs}',
  '**/*.spec.{ts,tsx,js,jsx,mjs,cjs}',
  '**/__tests__/**',
];

function splitCommandId(id: string): { entity?: string; command?: string } {
  const dot = id.indexOf('.');
  if (dot < 1) return {};
  return { entity: id.slice(0, dot), command: id.slice(dot + 1) };
}

export const unregisteredCommandCallDetector: Detector = {
  name: 'unregistered-command-call',
  description:
    'Flag runtime.runCommand calls whose entity.command is not present in the command registry',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.commandsRegistry) return [];
    const known = await loadCommandSet(ctx.commandsRegistry);
    const findings: AuditFinding[] = [];
    const seen = new Set<string>();
    const scanPatterns = [...SCAN_GLOBS, ...(ctx.includeGlobs ?? [])];
    const ignorePatterns = [...EXCLUDE_GLOBS, ...(ctx.excludeGlobs ?? [])];
    for (const pat of scanPatterns) {
      const files = await glob(pat, {
        cwd: ctx.root,
        absolute: true,
        ignore: ignorePatterns,
      });
      for (const file of files) {
        if (seen.has(file)) continue;
        seen.add(file);
        const src = await fs.readFile(file, 'utf-8');
        if (!src.includes('runCommand')) continue;
        const rel = path.relative(ctx.root, file).replace(/\\/g, '/');
        for (const call of extractRunCommandCalls(src, file)) {
          if (call.dynamic) {
            findings.push({
              severity: 'warning',
              code: 'DYNAMIC_COMMAND_UNVERIFIABLE',
              message:
                'Dynamic command name in runtime.runCommand cannot be statically verified against the registry',
              file: rel,
              detector: 'unregistered-command-call',
              line: call.line,
              column: call.column,
              suggestion:
                'Use a static string command id, or expose a typed wrapper that resolves to a registered entity.command',
            });
            continue;
          }
          if (!known.has(call.commandId!)) {
            const { entity, command } = splitCommandId(call.commandId!);
            findings.push({
              severity: 'error',
              code: 'UNREGISTERED_COMMAND_CALL',
              message: `runtime.runCommand('${call.commandId}') is not present in the command registry`,
              file: rel,
              detector: 'unregistered-command-call',
              line: call.line,
              column: call.column,
              entity,
              command,
              suggestion: `Register '${call.commandId}' as a Manifest command, or change the call to an existing registered command`,
            });
          }
        }
      }
    }
    return findings;
  },
};
