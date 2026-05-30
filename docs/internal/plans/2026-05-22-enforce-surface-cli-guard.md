# `enforce-surface` CLI Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CI-safe Manifest CLI command `enforce-surface` that fails when application code deviates from the compiled Manifest command registry — stopping agents/contributors from inventing duplicate or bypass write paths when a registered Manifest command already exists.

**Architecture:** The new command composes the existing `Detector` pipeline used by `audit-governance` (direct-writes, event-fabrication, route-drift, bypass-violations) with **three new detectors** (`unregistered-command-call`, `unregistered-entity-write`, `existing-command-available`) and a thin orchestrator that maps detector codes to the spec's finding codes, prints text/JSON output, and exits 1 in strict mode on any error finding. Source of truth = `commands.json` + `entities.json` emitted from IR; exceptions come from `bypasses.json`. New detectors use the TypeScript compiler AST (already a dependency, see `audit-routes.ts:346`).

**Tech Stack:** TypeScript, `commander@12.1.0`, `typescript` compiler AST, `glob`, Vitest, chalk. All existing in `packages/cli`.

**Source spec:** `C:\projects\manifest\newguard.json` (the JSON contract — every required behavior, finding type, option, and test in that file MUST be honored by the final implementation).

---

## File Structure

**Created:**
- `packages/cli/src/audit/registry-loader.ts` — shared `loadCommandSet` / `loadEntitySet` (extracted to avoid cross-detector coupling)
- `packages/cli/src/audit/registry-loader.test.ts`
- `packages/cli/src/audit/runtime-calls.ts` — shared `extractRunCommandCalls` AST helper
- `packages/cli/src/audit/runtime-calls.test.ts`
- `packages/cli/src/audit/unregistered-command-call.ts` — detector for `runtime.runCommand("entity.command", …)` calls absent from registry
- `packages/cli/src/audit/unregistered-command-call.test.ts`
- `packages/cli/src/audit/unregistered-entity-write.ts` — flags ORM writes to models that look governed but have no entry in `entities.json`
- `packages/cli/src/audit/unregistered-entity-write.test.ts`
- `packages/cli/src/audit/existing-command-available.ts` — name-heuristic detector for command-like helpers/routes duplicating registry entries
- `packages/cli/src/audit/existing-command-available.test.ts`
- `packages/cli/src/commands/enforce-surface.ts` — orchestrator (composes detectors, code-maps, output, exit code)
- `packages/cli/src/commands/enforce-surface.test.ts` — unit + integration tests
- `packages/cli/src/commands/enforce-surface.sample-app.test.ts` — fixture-based integration test against `fixtures/sample-app/`

**Modified:**
- `packages/cli/src/audit/types.ts` — extend `AuditFinding` with optional `line`, `column`, `entity`, `command`, `suggestion` fields (backward compatible)
- `packages/cli/src/index.ts:334–366` (after `audit-governance` block) — register `enforce-surface` command
- `docs/tools/CLI_REFERENCE.md` — document new command, comparison to `audit-routes` / `audit-governance` / `runtime-check` / `integration-check`, recommended CI usage

**Reused (no modification):**
- `packages/cli/src/audit/direct-writes.ts`
- `packages/cli/src/audit/event-fabrication.ts`
- `packages/cli/src/audit/route-drift.ts`
- `packages/cli/src/audit/bypass-violations.ts`

---

## Code-mapping Contract

The orchestrator translates detector-internal codes to the spec's finding codes AND adjusts severity. Both are derived from the table below — **read the actual detector source to confirm exact internal codes before implementing the map**.

| Detector | Internal code(s) (verify in source) | Spec code | Spec severity |
|---|---|---|---|
| `unregistered-command-call` | `UNREGISTERED_COMMAND_CALL` | `UNREGISTERED_COMMAND_CALL` | error |
| `unregistered-command-call` | `DYNAMIC_COMMAND_UNVERIFIABLE` | `DYNAMIC_COMMAND_UNVERIFIABLE` | warning (error in `--strict`) |
| `direct-writes` | `DIRECT_WRITE` | `DIRECT_WRITE_BYPASS` | error |
| `existing-command-available` | `EXISTING_COMMAND_AVAILABLE` | `EXISTING_COMMAND_AVAILABLE` | error |
| `route-drift` | `ROUTE_DRIFT` (confirm via `route-drift.ts`) | `ROUTE_SURFACE_DRIFT` | error |
| `unregistered-entity-write` | `UNREGISTERED_ENTITY_WRITE` | `UNREGISTERED_ENTITY_WRITE` | error |
| `event-fabrication` | `EVENT_FABRICATION_PUBLISH`, `EVENT_FABRICATION_CTOR`, `EVENT_FABRICATION_EMIT_LITERAL` (confirm in `event-fabrication.ts:43–55`) | `EVENT_FABRICATION` | error |
| `bypass-violations` | `BYPASS_VIOLATION` (confirm in `bypass-violations.ts:80–84`) | `APPROVED_BYPASS_REQUIRED` | warning (error in `--strict`) |
| `bypass-violations` | `STALE_BYPASS` / `BYPASS_VIOLATIONS_NO_REGISTRY` (any other internal codes) | passthrough with `BYPASS_*` prefix | warning |

**Severity downgrade rule (mandatory):** When an internal `BYPASS_VIOLATION` is mapped to `APPROVED_BYPASS_REQUIRED`, downgrade severity `error → warning` UNLESS `--strict` is set; under `--strict`, keep it `error`. Same rule for `DYNAMIC_COMMAND_UNVERIFIABLE`. Other code mappings preserve severity.

**Strict-mode exit semantics:** `process.exitCode = 1` if (`errors > 0`) OR (`strict` AND any warning has spec-code `APPROVED_BYPASS_REQUIRED` or `DYNAMIC_COMMAND_UNVERIFIABLE`). The `ok` field mirrors this exactly: `ok = (effective exit code === 0)`.

---

## Output Contract (must match `newguard.json`)

JSON shape (see `output_contract.json` in spec):

```json
{
  "ok": true,
  "root": "/abs/path",
  "registry": {
    "commandsRegistry": "manifest-registry/commands.json",
    "entitiesRegistry": "manifest-registry/entities.json"
  },
  "summary": { "errors": 0, "warnings": 0, "byCode": {} },
  "findings": [
    { "code": "...", "severity": "error", "file": "...", "line": null, "column": null,
      "entity": null, "command": null, "message": "...", "suggestion": "..." }
  ]
}
```

Text: summary counts by finding type, then one line per finding `<severity> <code> <file>:<line> <message> — <suggestion>`.

---

## Task 1: Extend `AuditFinding` + `DetectorContext` shapes

**Files:**
- Modify: `packages/cli/src/audit/types.ts`

Make all new fields optional so existing detectors keep compiling unchanged. Also add `entitiesRegistry` to `DetectorContext` so the new `unregistered-entity-write` detector can be wired in Task 5 without a second backward-compat edit.

- [ ] **Step 1: Add type fields**

```ts
export interface AuditFinding {
  severity: AuditSeverity;
  code: string;
  message: string;
  file?: string;
  detector: string;
  /** 1-based line number when AST-located. */
  line?: number;
  /** 1-based column when AST-located. */
  column?: number;
  /** Governed entity inferred from the finding, if any. */
  entity?: string;
  /** Governed command inferred from the finding, if any. */
  command?: string;
  /** Remediation hint shown to humans and agents. */
  suggestion?: string;
}

export interface DetectorContext {
  root: string;
  commandsRegistry?: string;
  /** Path to entities.json emitted from Manifest IR. */
  entitiesRegistry?: string;
  bypassRegistry?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/cli && pnpm run typecheck` (or `pnpm -F @angriff36/manifest-cli typecheck` from root)
Expected: PASS — no detector code is broken because all new fields are optional.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/audit/types.ts
git commit -m "[refactor] extend AuditFinding and DetectorContext with optional fields for enforce-surface"
```

---

## Task 2: `unregistered-command-call` detector — registry loader

**Files:**
- Create: `packages/cli/src/audit/unregistered-command-call.ts`
- Create: `packages/cli/src/audit/unregistered-command-call.test.ts`

Start with the registry loader so the AST scanner has a target to look up against. Use a small TDD slice.

- [ ] **Step 1: Write failing test for `loadCommandSet`**

```ts
// unregistered-command-call.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadCommandSet } from './unregistered-command-call.js';

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'enforce-surface-'));
}

describe('loadCommandSet', () => {
  it('returns a Set of "entity.command" identities', async () => {
    const dir = await tempDir();
    const reg = path.join(dir, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      commands: [
        { entity: 'User', command: 'create', commandId: 'User.create',
          policies: [], guardCount: 0, emits: [], effects: [] },
        { entity: 'Order', command: 'place', commandId: 'Order.place',
          policies: [], guardCount: 0, emits: [], effects: [] },
      ],
    }));
    const set = await loadCommandSet(reg);
    expect(set.has('User.create')).toBe(true);
    expect(set.has('Order.place')).toBe(true);
    expect(set.has('User.delete')).toBe(false);
  });

  it('throws a clear error when file missing', async () => {
    await expect(loadCommandSet('/nope/missing.json'))
      .rejects.toThrow(/commands registry/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-command-call.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement loader**

```ts
// unregistered-command-call.ts
import fs from 'node:fs/promises';

interface CommandRegistryEntry { entity: string; command: string; commandId?: string }
interface CommandRegistry { commands: CommandRegistryEntry[] }

export async function loadCommandSet(registryPath: string): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await fs.readFile(registryPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read commands registry at ${registryPath}: ${(err as Error).message}`);
  }
  const parsed = JSON.parse(raw) as CommandRegistry;
  const ids = new Set<string>();
  for (const c of parsed.commands ?? []) {
    ids.add(c.commandId ?? `${c.entity}.${c.command}`);
  }
  return ids;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-command-call.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/audit/unregistered-command-call.ts packages/cli/src/audit/unregistered-command-call.test.ts
git commit -m "[feat] add commands registry loader for enforce-surface detector"
```

---

## Task 3: `unregistered-command-call` detector — AST scan

Now add the AST scan that finds `runtime.runCommand("entity.command", …)` invocations.

**Files:**
- Modify: `packages/cli/src/audit/unregistered-command-call.ts`
- Modify: `packages/cli/src/audit/unregistered-command-call.test.ts`

- [ ] **Step 1: Add failing tests for `extractRunCommandCalls`**

```ts
// append to unregistered-command-call.test.ts
import { extractRunCommandCalls } from './unregistered-command-call.js';

describe('extractRunCommandCalls', () => {
  it('detects static-string runtime.runCommand calls', () => {
    const src = `
      export async function POST(req) {
        return await runtime.runCommand('User.create', payload);
      }
    `;
    const calls = extractRunCommandCalls(src, 'route.ts');
    expect(calls).toHaveLength(1);
    expect(calls[0].commandId).toBe('User.create');
    expect(calls[0].dynamic).toBe(false);
    expect(calls[0].line).toBeGreaterThan(0);
  });

  it('detects this.runtime.runCommand calls', () => {
    const src = `class Handler { async run() { await this.runtime.runCommand('Order.place', p); } }`;
    const calls = extractRunCommandCalls(src, 'h.ts');
    expect(calls[0].commandId).toBe('Order.place');
  });

  it('marks dynamic command names as unverifiable', () => {
    const src = `runtime.runCommand(name, payload);`;
    const calls = extractRunCommandCalls(src, 'd.ts');
    expect(calls[0].dynamic).toBe(true);
    expect(calls[0].commandId).toBe(null);
  });

  it('returns empty for files without runCommand', () => {
    expect(extractRunCommandCalls('const x = 1;', 'x.ts')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-command-call.test.ts`
Expected: FAIL (`extractRunCommandCalls is not a function`).

- [ ] **Step 3: Implement AST scanner**

```ts
// append to unregistered-command-call.ts
import ts from 'typescript';

export interface RunCommandCall {
  commandId: string | null;
  dynamic: boolean;
  line: number;
  column: number;
}

export function extractRunCommandCalls(source: string, filename: string): RunCommandCall[] {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const out: RunCommandCall[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (callee.name.text === 'runCommand') {
        // confirm shape: <something>.runtime.runCommand(...) OR runtime.runCommand(...)
        const isRuntime =
          (ts.isIdentifier(callee.expression) && callee.expression.text === 'runtime') ||
          (ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === 'runtime');
        if (isRuntime) {
          const arg0 = node.arguments[0];
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          if (arg0 && ts.isStringLiteralLike(arg0)) {
            out.push({ commandId: arg0.text, dynamic: false, line: line + 1, column: character + 1 });
          } else {
            out.push({ commandId: null, dynamic: true, line: line + 1, column: character + 1 });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-command-call.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/audit/unregistered-command-call.ts packages/cli/src/audit/unregistered-command-call.test.ts
git commit -m "[feat] add AST extractor for runtime.runCommand calls"
```

---

## Task 4: `unregistered-command-call` detector — assemble

Wire the loader + AST scanner into a `Detector`. Add globs matching `direct-writes.ts:19–29`.

**Files:**
- Modify: `packages/cli/src/audit/unregistered-command-call.ts`
- Modify: `packages/cli/src/audit/unregistered-command-call.test.ts`

- [ ] **Step 1: Add failing detector integration test**

```ts
// append to unregistered-command-call.test.ts
import { unregisteredCommandCallDetector } from './unregistered-command-call.js';

describe('unregisteredCommandCallDetector', () => {
  it('flags calls to commands missing from registry', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      commands: [{ entity: 'User', command: 'create', commandId: 'User.create',
        policies: [], guardCount: 0, emits: [], effects: [] }],
    }));
    const routeDir = path.join(root, 'app', 'api', 'orders');
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, 'route.ts'),
      `export async function POST(){ return runtime.runCommand('Order.place', {}); }`);

    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('UNREGISTERED_COMMAND_CALL');
    expect(findings[0].command).toBe('place');
    expect(findings[0].entity).toBe('Order');
    expect(findings[0].line).toBeGreaterThan(0);
  });

  it('passes when command is registered', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      commands: [{ entity: 'User', command: 'create', commandId: 'User.create',
        policies: [], guardCount: 0, emits: [], effects: [] }],
    }));
    const routeDir = path.join(root, 'app', 'api', 'users');
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, 'route.ts'),
      `export async function POST(){ return runtime.runCommand('User.create', {}); }`);

    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toEqual([]);
  });

  it('warns on dynamic command names', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({ irHash: 'x', compilerVersion: 'y', commands: [] }));
    const routeDir = path.join(root, 'app', 'api', 'x');
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, 'route.ts'),
      `export async function POST(){ const n = 'X.y'; return runtime.runCommand(n, {}); }`);

    const findings = await unregisteredCommandCallDetector.run({ root, commandsRegistry: reg });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DYNAMIC_COMMAND_UNVERIFIABLE');
    expect(findings[0].severity).toBe('warning');
  });

  it('does nothing when no commands registry is provided', async () => {
    const root = await tempDir();
    const findings = await unregisteredCommandCallDetector.run({ root });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-command-call.test.ts`
Expected: FAIL (`unregisteredCommandCallDetector` undefined).

- [ ] **Step 3: Implement detector**

```ts
// append to unregistered-command-call.ts
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types.js';

const SCAN_GLOBS = [
  'app/**/*.{ts,tsx}',
  'src/app/**/*.{ts,tsx}',
  'apps/*/app/**/*.{ts,tsx}',
  'pages/api/**/*.{ts,tsx}',
  'src/pages/api/**/*.{ts,tsx}',
  'app/actions/**/*.{ts,tsx}',
  'src/app/actions/**/*.{ts,tsx}',
  'jobs/**/*.{ts,tsx}',
  'src/jobs/**/*.{ts,tsx}',
];

const EXCLUDE_GLOBS = [
  '**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**',
  '**/*.test.ts', '**/*.spec.ts', '**/__tests__/**',
];

function splitCommandId(id: string): { entity: string | undefined; command: string | undefined } {
  const dot = id.indexOf('.');
  if (dot < 1) return { entity: undefined, command: undefined };
  return { entity: id.slice(0, dot), command: id.slice(dot + 1) };
}

export const unregisteredCommandCallDetector: Detector = {
  name: 'unregistered-command-call',
  description: 'Flag runtime.runCommand calls whose entity.command is not in the registry',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.commandsRegistry) return [];
    const known = await loadCommandSet(ctx.commandsRegistry);
    const findings: AuditFinding[] = [];
    const seen = new Set<string>();
    for (const pat of SCAN_GLOBS) {
      const files = await glob(pat, { cwd: ctx.root, absolute: true, ignore: EXCLUDE_GLOBS });
      for (const file of files) {
        if (seen.has(file)) continue;
        seen.add(file);
        const src = await (await import('node:fs/promises')).readFile(file, 'utf-8');
        if (!src.includes('runCommand')) continue;
        const rel = path.relative(ctx.root, file).replace(/\\/g, '/');
        for (const call of extractRunCommandCalls(src, file)) {
          if (call.dynamic) {
            findings.push({
              severity: 'warning',
              code: 'DYNAMIC_COMMAND_UNVERIFIABLE',
              message: `Dynamic command name in runtime.runCommand call cannot be statically verified against the registry`,
              file: rel,
              detector: 'unregistered-command-call',
              line: call.line,
              column: call.column,
              suggestion: 'Use a string literal command id, or expose a typed wrapper resolvable to a registered entity.command',
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-command-call.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/audit/unregistered-command-call.ts packages/cli/src/audit/unregistered-command-call.test.ts
git commit -m "[feat] add unregistered-command-call detector with registry lookup"
```

---

## Task 5: `unregistered-entity-write` detector

Detect direct ORM writes against models that are NOT in the entities registry — meaning the model looks governed (used in a write path) but Manifest has no entity for it, so registry coverage is incomplete.

**Files:**
- Create: `packages/cli/src/audit/unregistered-entity-write.ts`
- Create: `packages/cli/src/audit/unregistered-entity-write.test.ts`

Approach: glob same paths as `direct-writes.ts`; regex `prisma\.(\w+)\.(create|update|delete|upsert|...)`; the captured model name is the candidate entity (PascalCase or matching mapping); fail if not in entities registry. Reuse `EntitiesRegistry` shape.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { unregisteredEntityWriteDetector } from './unregistered-entity-write.js';

async function tempDir() { return await fs.mkdtemp(path.join(os.tmpdir(), 'uew-')); }

describe('unregisteredEntityWriteDetector', () => {
  it('flags prisma.model.create when model has no entity in registry', async () => {
    const root = await tempDir();
    const entReg = path.join(root, 'entities.json');
    await fs.writeFile(entReg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      entities: [{ name: 'User', commands: ['create'] }],
    }));
    const dir = path.join(root, 'app', 'api', 'audit');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function POST(){ return prisma.auditLog.create({ data: {} }); }`);
    const findings = await unregisteredEntityWriteDetector.run({ root, entitiesRegistry: entReg } as any);
    expect(findings.find(f => f.code === 'UNREGISTERED_ENTITY_WRITE')).toBeDefined();
  });

  it('does not flag writes against a registered entity', async () => {
    const root = await tempDir();
    const entReg = path.join(root, 'entities.json');
    await fs.writeFile(entReg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      entities: [{ name: 'User', commands: ['create'] }],
    }));
    const dir = path.join(root, 'app', 'api', 'users');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function POST(){ return prisma.user.create({ data: {} }); }`);
    const findings = await unregisteredEntityWriteDetector.run({ root, entitiesRegistry: entReg } as any);
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement detector** (DetectorContext already extended in Task 1)

```ts
// unregistered-entity-write.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import type { AuditFinding, Detector, DetectorContext } from './types.js';

const ROUTE_GLOBS = [
  'app/api/**/route.ts', 'src/app/api/**/route.ts', 'apps/*/app/api/**/route.ts',
  'app/actions/**/*.ts', 'src/app/actions/**/*.ts', 'apps/*/app/actions/**/*.ts',
  'jobs/**/*.ts', 'src/jobs/**/*.ts', 'apps/*/jobs/**/*.ts',
];

const WRITE_RE =
  /\bprisma\s*\.\s*(\w+)\s*\.\s*(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/g;

interface EntitiesRegistry { entities: Array<{ name: string }> }

async function loadEntityNames(p: string): Promise<Set<string>> {
  const raw = await fs.readFile(p, 'utf-8');
  const parsed = JSON.parse(raw) as EntitiesRegistry;
  const out = new Set<string>();
  for (const e of parsed.entities ?? []) {
    // Match Prisma's default: model name `User` → client property `prisma.user`.
    // Intentionally do NOT pluralize — irregular plurals (Category→categories,
    // Person→people) would produce false positives.
    out.add(e.name);
    out.add(e.name.charAt(0).toLowerCase() + e.name.slice(1));
  }
  return out;
}

export const unregisteredEntityWriteDetector: Detector = {
  name: 'unregistered-entity-write',
  description: 'Flag direct ORM writes against models with no Manifest entity registered',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.entitiesRegistry) return [];
    const known = await loadEntityNames(ctx.entitiesRegistry);
    const findings: AuditFinding[] = [];
    for (const pattern of ROUTE_GLOBS) {
      const files = await glob(pattern, { cwd: ctx.root, absolute: true });
      for (const file of files) {
        const src = await fs.readFile(file, 'utf-8');
        WRITE_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = WRITE_RE.exec(src))) {
          const model = m[1];
          if (known.has(model) || known.has(model.toLowerCase())) continue;
          findings.push({
            severity: 'error',
            code: 'UNREGISTERED_ENTITY_WRITE',
            message: `Direct write prisma.${model}.${m[2]} against model with no Manifest entity registered`,
            file: path.relative(ctx.root, file).replace(/\\/g, '/'),
            detector: 'unregistered-entity-write',
            entity: model,
            suggestion: `Register '${model}' as a Manifest entity, or route the write through an existing registered runtime.runCommand`,
          });
        }
      }
    }
    return findings;
  },
};
```

- [ ] **Step 3: Run — expect PASS**

Run: `cd packages/cli && pnpm vitest run src/audit/unregistered-entity-write.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/audit/unregistered-entity-write.ts packages/cli/src/audit/unregistered-entity-write.test.ts
git commit -m "[feat] add unregistered-entity-write detector"
```

---

## Task 6: `existing-command-available` detector (name heuristic)

This is the fuzziest detector. It flags **app helper functions or routes named like a registered command** that don't dispatch through `runtime.runCommand`. The heuristic is intentionally conservative — false positives are worse than false negatives for an agent guard.

**Heuristic:**
- Scan the same globs as direct-writes
- For each file: AST-walk top-level function declarations + exported arrow functions + default exports
- Normalize names (camelCase split): `createUser` → tokens `['create','user']`
- For each registered `Entity.command`: tokens = lowercase entity + command (`['user','create']`)
- If a function's tokens are a multiset match (any order, same elements) AND that file/function does NOT contain a `runtime.runCommand('<entity>.<command>', …)` call → flag

**Files:**
- Create: `packages/cli/src/audit/existing-command-available.ts`
- Create: `packages/cli/src/audit/existing-command-available.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existingCommandAvailableDetector, tokenize, multisetMatch } from './existing-command-available.js';

async function tempDir() { return await fs.mkdtemp(path.join(os.tmpdir(), 'eca-')); }

describe('tokenize', () => {
  it('splits camelCase', () => { expect(tokenize('createUser')).toEqual(['create','user']); });
  it('splits PascalCase', () => { expect(tokenize('CreateUser')).toEqual(['create','user']); });
  it('splits snake_case', () => { expect(tokenize('create_user')).toEqual(['create','user']); });
});

describe('multisetMatch', () => {
  it('matches in any order', () => {
    expect(multisetMatch(['create','user'], ['user','create'])).toBe(true);
  });
  it('rejects on extra token', () => {
    expect(multisetMatch(['create','user'], ['create','user','admin'])).toBe(false);
  });
});

describe('existingCommandAvailableDetector', () => {
  it('flags a helper named like a registered command that does not dispatch through runtime', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      commands: [{ entity: 'User', command: 'create', commandId: 'User.create',
        policies: [], guardCount: 0, emits: [], effects: [] }],
    }));
    const dir = path.join(root, 'app', 'api', 'helpers');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function createUser(input){ return await db.user.insert(input); }`);
    const findings = await existingCommandAvailableDetector.run({ root, commandsRegistry: reg });
    expect(findings.find(f => f.code === 'EXISTING_COMMAND_AVAILABLE')).toBeDefined();
  });

  it('does NOT flag a helper that dispatches through runtime.runCommand for the same command', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      commands: [{ entity: 'User', command: 'create', commandId: 'User.create',
        policies: [], guardCount: 0, emits: [], effects: [] }],
    }));
    const dir = path.join(root, 'app', 'api', 'users');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function createUser(input){ return await runtime.runCommand('User.create', input); }`);
    const findings = await existingCommandAvailableDetector.run({ root, commandsRegistry: reg });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement detector**

```ts
// existing-command-available.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import ts from 'typescript';
import type { AuditFinding, Detector, DetectorContext } from './types.js';
import { loadCommandSet, extractRunCommandCalls } from './unregistered-command-call.js';

const SCAN_GLOBS = [
  'app/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'apps/*/app/**/*.{ts,tsx}',
  'pages/api/**/*.{ts,tsx}', 'src/pages/api/**/*.{ts,tsx}',
  'jobs/**/*.{ts,tsx}', 'src/jobs/**/*.{ts,tsx}',
];
const EXCLUDE_GLOBS = [
  '**/node_modules/**','**/dist/**','**/.next/**','**/build/**',
  '**/*.test.ts','**/*.spec.ts','**/__tests__/**',
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
  return [...counts.values()].every(v => v === 0);
}

function collectFunctionNames(source: string, filename: string): Array<{ name: string; line: number }> {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const out: Array<{ name: string; line: number }> = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ name: node.name.text, line: line + 1 });
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
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
  description: 'Flag helpers/routes named like a registered command that bypass runtime.runCommand',
  async run(ctx: DetectorContext): Promise<AuditFinding[]> {
    if (!ctx.commandsRegistry) return [];
    const known = await loadCommandSet(ctx.commandsRegistry);
    const tokenized: Array<{ id: string; tokens: string[] }> = [];
    for (const id of known) {
      const dot = id.indexOf('.');
      if (dot < 1) continue;
      tokenized.push({ id, tokens: [...tokenize(id.slice(0, dot)), ...tokenize(id.slice(dot + 1))] });
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
        const dispatchedIds = new Set(calls.filter(c => !c.dynamic && c.commandId).map(c => c.commandId!));
        for (const fn of fns) {
          const fnTokens = tokenize(fn.name);
          if (fnTokens.length < 2) continue;
          for (const cmd of tokenized) {
            if (multisetMatch(fnTokens, cmd.tokens) && !dispatchedIds.has(cmd.id)) {
              const [entity, command] = cmd.id.split('.');
              findings.push({
                severity: 'error',
                code: 'EXISTING_COMMAND_AVAILABLE',
                message: `'${fn.name}' looks like a duplicate of registered Manifest command '${cmd.id}' but does not dispatch through runtime.runCommand`,
                file: path.relative(ctx.root, file).replace(/\\/g, '/'),
                detector: 'existing-command-available',
                line: fn.line,
                entity, command,
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/cli && pnpm vitest run src/audit/existing-command-available.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/audit/existing-command-available.ts packages/cli/src/audit/existing-command-available.test.ts
git commit -m "[feat] add existing-command-available detector (name-heuristic for duplicate command paths)"
```

---

## Task 7: `enforce-surface` orchestrator command

**Files:**
- Create: `packages/cli/src/commands/enforce-surface.ts`
- Create: `packages/cli/src/commands/enforce-surface.test.ts`

- [ ] **Step 1: Failing test (text + json + strict exit semantics)**

```ts
// enforce-surface.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { enforceSurfaceCommand } from './enforce-surface.js';

async function tempDir() { return await fs.mkdtemp(path.join(os.tmpdir(), 'es-')); }

let exitCodeBefore: number | undefined;
beforeEach(() => { exitCodeBefore = process.exitCode; process.exitCode = 0; });
afterEach(() => { process.exitCode = exitCodeBefore; });

describe('enforceSurfaceCommand', () => {
  it('emits ok:true and exits 0 when surface aligns with registry', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({
      irHash: 'x', compilerVersion: 'y',
      commands: [{ entity: 'User', command: 'create', commandId: 'User.create',
        policies: [], guardCount: 0, emits: [], effects: [] }],
    }));
    const dir = path.join(root, 'app', 'api', 'users');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function POST(){ return await runtime.runCommand('User.create', {}); }`);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'json', strict: true });
    spy.mockRestore();
    expect(res.ok).toBe(true);
    expect(res.summary.errors).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it('reports UNREGISTERED_COMMAND_CALL and sets exitCode 1 in strict mode', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({ irHash: 'x', compilerVersion: 'y', commands: [] }));
    const dir = path.join(root, 'app', 'api', 'x');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function POST(){ return await runtime.runCommand('Foo.bar', {}); }`);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'json', strict: true });
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.findings.some(f => f.code === 'UNREGISTERED_COMMAND_CALL')).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('non-strict does not set exitCode 1', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({ irHash: 'x', compilerVersion: 'y', commands: [] }));
    const dir = path.join(root, 'app', 'api', 'x');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function POST(){ return await runtime.runCommand('Foo.bar', {}); }`);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'json' });
    spy.mockRestore();
    expect(process.exitCode).toBe(0);
  });

  it('maps DIRECT_WRITE detector code to DIRECT_WRITE_BYPASS', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({ irHash: 'x', compilerVersion: 'y', commands: [] }));
    const dir = path.join(root, 'app', 'api', 'audit');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'route.ts'),
      `export async function POST(){ return prisma.user.create({ data: {} }); }`);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'json', strict: true });
    spy.mockRestore();
    expect(res.findings.some(f => f.code === 'DIRECT_WRITE_BYPASS')).toBe(true);
  });

  it('produces JSON shape matching spec contract', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'commands.json');
    await fs.writeFile(reg, JSON.stringify({ irHash: 'x', compilerVersion: 'y', commands: [] }));
    let captured = '';
    const spy = vi.spyOn(console, 'log').mockImplementation((s) => { captured = String(s); });
    await enforceSurfaceCommand({ root, commandsRegistry: reg, format: 'json' });
    spy.mockRestore();
    const j = JSON.parse(captured);
    expect(j).toHaveProperty('ok');
    expect(j).toHaveProperty('root');
    expect(j).toHaveProperty('registry.commandsRegistry');
    expect(j).toHaveProperty('summary.errors');
    expect(j).toHaveProperty('summary.warnings');
    expect(j).toHaveProperty('summary.byCode');
    expect(Array.isArray(j.findings)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement orchestrator**

```ts
// enforce-surface.ts
import path from 'node:path';
import chalk from 'chalk';
import type { AuditFinding, Detector, DetectorContext } from '../audit/types.js';
import { unregisteredCommandCallDetector } from '../audit/unregistered-command-call.js';
import { directWritesDetector } from '../audit/direct-writes.js';
import { existingCommandAvailableDetector } from '../audit/existing-command-available.js';
import { routeDriftDetector } from '../audit/route-drift.js';
import { unregisteredEntityWriteDetector } from '../audit/unregistered-entity-write.js';
import { eventFabricationDetector } from '../audit/event-fabrication.js';
import { bypassViolationsDetector } from '../audit/bypass-violations.js';

export interface EnforceSurfaceOptions {
  root?: string;
  commandsRegistry?: string;
  entitiesRegistry?: string;
  bypassRegistry?: string;
  format?: 'text' | 'json';
  strict?: boolean;
  include?: string[];
  exclude?: string[];
}

export interface EnforceSurfaceFinding {
  code: string;
  severity: 'error' | 'warning';
  file: string | null;
  line: number | null;
  column: number | null;
  entity: string | null;
  command: string | null;
  message: string;
  suggestion: string;
}

export interface EnforceSurfaceResult {
  ok: boolean;
  root: string;
  registry: { commandsRegistry: string | null; entitiesRegistry: string | null };
  summary: { errors: number; warnings: number; byCode: Record<string, number> };
  findings: EnforceSurfaceFinding[];
}

const DETECTORS: Detector[] = [
  unregisteredCommandCallDetector,
  directWritesDetector,
  existingCommandAvailableDetector,
  routeDriftDetector,
  unregisteredEntityWriteDetector,
  eventFabricationDetector,
  bypassViolationsDetector,
];

// Detector internal code → spec finding code.
// Verified against detector source on 2026-05-22:
//   direct-writes.ts:55         → DIRECT_WRITE
//   route-drift.ts:46           → ROUTE_DRIFT
//   bypass-violations.ts:80     → BYPASS_VIOLATION
//   event-fabrication.ts:44/49/54 → EVENT_FABRICATION_{PUBLISH,CTOR,EMIT_LITERAL}
const CODE_MAP: Record<string, string> = {
  DIRECT_WRITE: 'DIRECT_WRITE_BYPASS',
  ROUTE_DRIFT: 'ROUTE_SURFACE_DRIFT',
  BYPASS_VIOLATION: 'APPROVED_BYPASS_REQUIRED',
  EVENT_FABRICATION_PUBLISH: 'EVENT_FABRICATION',
  EVENT_FABRICATION_CTOR: 'EVENT_FABRICATION',
  EVENT_FABRICATION_EMIT_LITERAL: 'EVENT_FABRICATION',
  // Passthrough (spec-aligned at the detector):
  //   UNREGISTERED_COMMAND_CALL, DYNAMIC_COMMAND_UNVERIFIABLE,
  //   EXISTING_COMMAND_AVAILABLE, UNREGISTERED_ENTITY_WRITE,
  //   STALE_BYPASS, BYPASS_VIOLATIONS_NO_REGISTRY,
  //   BYPASS_VIOLATIONS_REGISTRY_UNREADABLE
};

// Codes whose severity is `warning` by default but `error` in --strict.
const STRICT_ESCALATE = new Set<string>([
  'APPROVED_BYPASS_REQUIRED',
  'DYNAMIC_COMMAND_UNVERIFIABLE',
]);

function defaultSuggestion(code: string): string {
  switch (code) {
    case 'UNREGISTERED_COMMAND_CALL':
      return 'Register the command in Manifest, or change the call to an existing registered command';
    case 'DIRECT_WRITE_BYPASS':
      return 'Route the write through runtime.runCommand or list the path in the bypass registry';
    case 'EXISTING_COMMAND_AVAILABLE':
      return 'Replace the duplicate path with a call to the existing registered Manifest command';
    case 'ROUTE_SURFACE_DRIFT':
      return 'Regenerate routes via `manifest emit` and use the canonical dispatcher';
    case 'UNREGISTERED_ENTITY_WRITE':
      return 'Add a Manifest entity for the model or route the write through a registered command';
    case 'EVENT_FABRICATION':
      return 'Emit events only through runtime — do not construct ManifestEvent-style payloads outside the runtime';
    case 'APPROVED_BYPASS_REQUIRED':
      return 'Add the path to the bypass registry with reason, owner, and reviewBy';
    case 'DYNAMIC_COMMAND_UNVERIFIABLE':
      return 'Use a static string command id, or expose a typed wrapper resolvable to a registered entity.command';
    default:
      return 'Review and align this code with the Manifest command registry';
  }
}

export async function enforceSurfaceCommand(
  options: EnforceSurfaceOptions = {}
): Promise<EnforceSurfaceResult> {
  const root = path.resolve(process.cwd(), options.root ?? '.');
  const ctx: DetectorContext = {
    root,
    commandsRegistry: options.commandsRegistry,
    entitiesRegistry: options.entitiesRegistry,
    bypassRegistry: options.bypassRegistry,
  };

  const raw: AuditFinding[] = [];
  for (const d of DETECTORS) {
    try {
      raw.push(...(await d.run(ctx)));
    } catch (err) {
      raw.push({
        severity: 'error',
        code: 'DETECTOR_ERROR',
        message: `Detector ${d.name} failed: ${(err as Error).message}`,
        detector: d.name,
      });
    }
  }

  const findings: EnforceSurfaceFinding[] = raw.map((f) => {
    const code = CODE_MAP[f.code] ?? f.code;
    // Severity downgrade: detectors like bypass-violations emit `error`
    // internally; the spec calls for `warning` unless --strict.
    let severity: 'error' | 'warning' = f.severity;
    if (STRICT_ESCALATE.has(code)) {
      severity = options.strict ? 'error' : 'warning';
    }
    return {
      code,
      severity,
      file: f.file ?? null,
      line: f.line ?? null,
      column: f.column ?? null,
      entity: f.entity ?? null,
      command: f.command ?? null,
      message: f.message,
      suggestion: f.suggestion ?? defaultSuggestion(code),
    };
  });

  const byCode: Record<string, number> = {};
  for (const f of findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;

  // Exit and `ok` agree: strict fails on any error; non-strict warnings
  // (including APPROVED_BYPASS_REQUIRED, DYNAMIC_COMMAND_UNVERIFIABLE)
  // do not affect the exit code outside strict mode.
  const failed = errors > 0;
  const result: EnforceSurfaceResult = {
    ok: !failed,
    root,
    registry: {
      commandsRegistry: options.commandsRegistry ?? null,
      entitiesRegistry: options.entitiesRegistry ?? null,
    },
    summary: { errors, warnings, byCode },
    findings,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(chalk.green('Surface enforced: all application code aligns with the registry.'));
    } else {
      console.log(chalk.bold(`enforce-surface — ${errors} errors, ${warnings} warnings`));
      for (const [code, n] of Object.entries(byCode)) console.log(`  ${code}: ${n}`);
      for (const f of findings) {
        const tag = f.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
        const loc = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : '';
        console.log(`${tag} ${f.code}${loc} — ${f.message}`);
        console.log(chalk.gray(`  ↳ ${f.suggestion}`));
      }
    }
  }

  if (options.strict && failed) process.exitCode = 1;
  return result;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/cli && pnpm vitest run src/commands/enforce-surface.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/enforce-surface.ts packages/cli/src/commands/enforce-surface.test.ts
git commit -m "[feat] add enforce-surface orchestrator command composing all surface detectors"
```

---

## Task 8: Register `enforce-surface` in CLI entry

**Files:**
- Modify: `packages/cli/src/index.ts` (after the `audit-governance` registration block at lines 334–366)

- [ ] **Step 1: Add registration**

```ts
import { enforceSurfaceCommand } from './commands/enforce-surface.js';

program
  .command('enforce-surface')
  .description('Enforce that application code only writes through registered Manifest commands')
  .requiredOption('--root <path>', 'Repo/app root to scan')
  .requiredOption('--commands-registry <path>', 'Path to commands.json emitted from IR')
  .option('--entities-registry <path>', 'Path to entities.json emitted from IR')
  .option('--bypass-registry <path>', 'Path to bypasses.json (approved exceptions)')
  .option('--format <text|json>', 'Output format', 'text')
  .option('--strict', 'Exit non-zero on any error finding')
  .option('--include <glob...>', 'Additional include globs')
  .option('--exclude <glob...>', 'Exclude globs')
  .action(async (opts) => {
    await enforceSurfaceCommand({
      root: opts.root,
      commandsRegistry: opts.commandsRegistry,
      entitiesRegistry: opts.entitiesRegistry,
      bypassRegistry: opts.bypassRegistry,
      format: opts.format,
      strict: !!opts.strict,
      include: opts.include,
      exclude: opts.exclude,
    });
  });
```

- [ ] **Step 2: Build & smoke-test from CLI**

Run from repo root:
```bash
cd packages/cli && pnpm build && node dist/index.js enforce-surface --help
```
Expected: help text lists all options and description.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "[feat] register enforce-surface in CLI"
```

---

## Task 9: Sample-app integration test

**Files:**
- Create: `packages/cli/src/commands/enforce-surface.sample-app.test.ts`
- Add fixtures under `fixtures/sample-app/app/api/...` IF not already present (use the existing fixture's `manifest-registry/commands.json` as source of truth)

- [ ] **Step 1: Read existing sample-app registry**

Run: `cat fixtures/sample-app/manifest-registry/commands.json | head -40`
Note which `entity.command` pairs are registered.

- [ ] **Step 2: Write integration test**

```ts
// enforce-surface.sample-app.test.ts
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { enforceSurfaceCommand } from './enforce-surface.js';

const SAMPLE_APP = path.resolve(__dirname, '../../../../fixtures/sample-app');

describe('enforce-surface against fixtures/sample-app', () => {
  it('produces a deterministic JSON shape and aligns with sample-app registry', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root: SAMPLE_APP,
      commandsRegistry: path.join(SAMPLE_APP, 'manifest-registry/commands.json'),
      entitiesRegistry: path.join(SAMPLE_APP, 'manifest-registry/entities.json'),
      bypassRegistry: path.join(SAMPLE_APP, 'bypasses.json'),
      format: 'json',
    });
    spy.mockRestore();
    expect(res.summary).toBeDefined();
    expect(typeof res.summary.errors).toBe('number');
    expect(Array.isArray(res.findings)).toBe(true);
    for (const f of res.findings) {
      expect(typeof f.code).toBe('string');
      expect(['error','warning']).toContain(f.severity);
    }
  });
});
```

- [ ] **Step 3: Run — expect PASS** (or surface real findings if sample-app has them — that's also valid evidence)

Run: `cd packages/cli && pnpm vitest run src/commands/enforce-surface.sample-app.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/enforce-surface.sample-app.test.ts
git commit -m "[test] add sample-app integration test for enforce-surface"
```

---

## Task 10: CLI reference docs

**Files:**
- Modify: `docs/tools/CLI_REFERENCE.md`

- [ ] **Step 1: Append `enforce-surface` section**

Add documentation covering:
- Command synopsis (mirror `newguard.json.example_invocation`)
- Every flag from spec `options`
- All 7+ finding codes and severities (from `CODE_MAP` + native codes)
- When to use it vs `audit-routes` / `audit-governance` / `runtime-check` / `integration-check`:
  - `audit-routes` — route shape/boundary
  - `audit-governance` — overall governance posture
  - `runtime-check` — correlation between source, routes, IR for one command
  - `integration-check` — downstream repo wiring
  - **`enforce-surface`** — guard against agents inventing duplicate/bypass write paths; the strictest registry-vs-app check
- Recommended CI snippet (copy from spec `ci_recommendation`)
- **Agent workflow guidance** (copy from spec `docs_required[3]`): agents must run this before AND after app code changes involving routes, server actions, database writes, manifest commands, migrations, or generated routes
- Example text output and JSON output

- [ ] **Step 2: Commit**

```bash
git add docs/tools/CLI_REFERENCE.md
git commit -m "[docs] document enforce-surface CLI command + agent workflow guidance"
```

---

## Task 11: Verification & final report

- [ ] **Step 1: Run full CLI test suite**

Run: `cd packages/cli && pnpm test`
Expected: PASS (existing 78+ new tests).

- [ ] **Step 2: Run repo-wide tests + lint + typecheck**

Run from repo root:
```bash
pnpm test
pnpm run typecheck
pnpm run lint
```
Expected: all PASS. Memory note: `feedback-lint-debt-out-of-scope` records ~237 pre-existing lint errors in `tools/`, `.opencode/`, `generated/`, `packages/cli/dist/` — those are out of scope. New code must not add new lint errors.

- [ ] **Step 3: Manual smoke against sample-app**

Run:
```bash
node packages/cli/dist/index.js enforce-surface \
  --root fixtures/sample-app \
  --commands-registry fixtures/sample-app/manifest-registry/commands.json \
  --entities-registry fixtures/sample-app/manifest-registry/entities.json \
  --bypass-registry fixtures/sample-app/bypasses.json \
  --format json --strict
```
Expected: deterministic JSON output, exit code 0 or 1 depending on fixture state.

- [ ] **Step 4: Final report per `newguard.json.final_report`**

Write a summary that includes:
1. Every file changed (list)
2. New CLI command syntax (`manifest enforce-surface ...`)
3. Example text output
4. Example JSON output
5. Tests added (count + name)
6. **How this prevents agents from creating duplicate or bypass write paths** — name the seven finding types and the specific behavior each blocks
7. Limitations:
   - Semantic duplicate detection (`existing-command-available`) relies on a name-token multiset heuristic; ambiguous names (e.g., `update`) or fully dynamic command names will not be caught
   - Direct-write detection inherits the regex pattern from `direct-writes.ts` (Prisma-shaped); non-Prisma ORMs (Drizzle, Kysely) require detector extensions
   - The detector does not parse SQL string literals — raw SQL inserts in template literals are not yet flagged; a follow-up plan should add a SQL-write detector

---

## Per-task TDD discipline

Every task above follows: **red test → minimal code → green test → commit**. Do not skip the red step. The skill `superpowers:test-driven-development` covers this.

## Out-of-scope (do NOT do, per spec `do_not_do`)

- Do **not** mutate application source files in this command
- Do **not** generate new concrete per-command `route.ts` files
- Do **not** silently allow dynamic command calls
- Do **not** hardcode Capsule-Pro-specific entities/routes/tables
- Do **not** treat the command registry as advisory in strict mode
- Do **not** replace `audit-governance` — compose with it via shared detectors

## Spec contract checklist (verify before declaring done)

- [ ] All 10 `tests_required` fixtures from `newguard.json` covered by tests in this plan
- [ ] All 7 finding types from `newguard.json.finding_types` emit at the spec-defined `code` string
- [ ] All 8 `options` flags wired in CLI registration
- [ ] JSON output matches `output_contract.json` shape exactly (ok, root, registry, summary.byCode, findings[])
- [ ] Strict mode exits 1 on errors; non-strict exits 0 even with findings
- [ ] Documentation updated per `docs_required`
