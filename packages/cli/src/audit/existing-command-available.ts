/**
 * existing-command-available detector.
 *
 * Conservative name-heuristic guard: when an application file declares a
 * helper or route handler whose name tokens (camelCase / PascalCase /
 * snake_case / kebab-case) form the same multiset as a registered
 * Manifest entity.command, AND the file does NOT contain a
 * runtime.runCommand dispatch to that exact command, flag the file as
 * potentially duplicating a registered command surface.
 *
 * False positives are tolerable for an agent guard so long as the
 * heuristic is opt-in (gated on a commands registry being supplied) and
 * single-token names are skipped to avoid noise from generic helpers
 * like `create`, `update`, etc.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import ts from 'typescript';
import type { AuditFinding, Detector, DetectorContext } from './types.js';
import { loadCommandSet, extractRunCommandCalls } from './unregistered-command-call.js';

const SCAN_GLOBS = [
  'app/**/*.{ts,tsx}',
  'src/app/**/*.{ts,tsx}',
  'apps/*/app/**/*.{ts,tsx}',
  'pages/api/**/*.{ts,tsx}',
  'src/pages/api/**/*.{ts,tsx}',
  'jobs/**/*.{ts,tsx}',
  'src/jobs/**/*.{ts,tsx}',
];

const EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/generated/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/__tests__/**',
];

export function tokenize(name: string): string[] {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function multisetMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const t of b) {
    const c = counts.get(t);
    if (!c) return false;
    counts.set(t, c - 1);
  }
  for (const v of counts.values()) if (v !== 0) return false;
  return true;
}

interface NamedFn {
  name: string;
  line: number;
}

function collectFunctionNames(source: string, filename: string): NamedFn[] {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const out: NamedFn[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ name: node.name.text, line: line + 1 });
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          const { line } = sf.getLineAndCharacterOfPosition(decl.getStart(sf));
          out.push({ name: decl.name.text, line: line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

export const existingCommandAvailableDetector: Detector = {
  name: 'existing-command-available',
  description:
    'Flag helpers or routes whose name duplicates a registered Manifest command without dispatching through runtime',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.commandsRegistry) return [];
    const known = await loadCommandSet(ctx.commandsRegistry);
    const tokenized: Array<{ id: string; tokens: string[] }> = [];
    for (const id of known) {
      const dot = id.indexOf('.');
      if (dot < 1) continue;
      tokenized.push({
        id,
        tokens: [...tokenize(id.slice(0, dot)), ...tokenize(id.slice(dot + 1))],
      });
    }
    const findings: AuditFinding[] = [];
    const seen = new Set<string>();
    for (const pat of SCAN_GLOBS) {
      const files = await glob(pat, { cwd: ctx.root, absolute: true, ignore: EXCLUDE_GLOBS });
      for (const file of files) {
        if (seen.has(file)) continue;
        seen.add(file);
        const src = await fs.readFile(file, 'utf-8');
        const fns = collectFunctionNames(src, file);
        if (fns.length === 0) continue;
        const calls = extractRunCommandCalls(src, file);
        const dispatched = new Set(
          calls.filter((c) => !c.dynamic && c.commandId).map((c) => c.commandId!)
        );
        for (const fn of fns) {
          const fnTokens = tokenize(fn.name);
          if (fnTokens.length < 2) continue;
          for (const cmd of tokenized) {
            if (multisetMatch(fnTokens, cmd.tokens) && !dispatched.has(cmd.id)) {
              const dot = cmd.id.indexOf('.');
              const entity = cmd.id.slice(0, dot);
              const command = cmd.id.slice(dot + 1);
              findings.push({
                severity: 'error',
                code: 'EXISTING_COMMAND_AVAILABLE',
                message: `'${fn.name}' looks like a duplicate of registered Manifest command '${cmd.id}' but does not dispatch through runtime.runCommand`,
                file: path.relative(ctx.root, file).replace(/\\/g, '/'),
                detector: 'existing-command-available',
                line: fn.line,
                entity,
                command,
                suggestion: `Replace this implementation with a call to runtime.runCommand('${cmd.id}', payload)`,
              });
              break;
            }
          }
        }
      }
    }
    return findings;
  },
};
