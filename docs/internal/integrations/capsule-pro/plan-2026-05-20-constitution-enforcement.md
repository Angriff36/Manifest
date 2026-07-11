# Capsule-Pro Constitution Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Manifest the structural primitives needed to mechanically enforce the Capsule-Pro Constitution (`C:/projects/capsule-pro/constitution.md`): typed runtime context, a canonical Next.js dispatcher, IR-derived machine-readable registries, a bypass registry with validator, and a constitution audit suite. Durable audit/outbox contracts are sketched but deferred until phases 1-5 are stable.

**Architecture:** Five sequenced phases, each one independently shippable. Each phase is gated by `npm test` staying green (630/630 baseline) plus phase-specific evidence. Spec-first: every behavior change updates `docs/spec/**` before touching code, then conformance fixtures, then implementation. The dispatcher and registries are emitted by existing projection/CLI surfaces — no new top-level subsystem.

**Tech Stack:** TypeScript (CommonJS for `src/manifest`, ESM for UI), Vitest, Next.js App Router projection target, project-references tsconfig, pnpm workspaces.

**Reference docs that govern this work:**

- `C:/projects/capsule-pro/constitution.md` — the contract this plan delivers against
- `C:/projects/manifest/CLAUDE.md` — house rules (IR-first, deterministic, no auto-repair)
- `C:/projects/manifest/docs/spec/ir/ir-v1.schema.json` — IR shape
- `C:/projects/manifest/docs/spec/semantics.md` — runtime meaning
- `C:/projects/manifest/AGENTS.md` — loop discipline

**Windows platform note:** Never use `2>&1` in commands. Use forward slashes in paths. Use `npx kill-port` (never `taskkill //IM node.exe`).

---

## Cross-cutting Conventions

**Validation commands** (run after every step that could affect them):

```bash
npm test                # Must stay green — 630 baseline, grows as we add tests
npm run typecheck       # No TS errors
npm run lint            # ESLint clean
```

**Commit cadence:** One committable unit per task. If a task takes longer than ~15 min, scope is too big — split it.

**Commit format:** `[type] short imperative — why`. Types: `feat`, `fix`, `refactor`, `spec`, `test`, `chore`, `docs`.

**Test framework:** Vitest. Co-locate tests as `*.test.ts` next to source.

**No emojis** in code, docs, or commits. House style is plain text.

---

## Phase 0 — Spec Alignment (Prerequisites)

The constitution is binding once acknowledged. Before any code changes, register the boundary in `docs/spec/` so all later phases reference normative text rather than inventing it.

### Task 0.1 — Add capsule-pro constitution reference into spec index

**Files:**

- Modify: `C:/projects/manifest/docs/spec/semantics.md` — add §"Capsule-Pro Constitution Reference" section near the top, linking to `docs/capsule-pro/constitution.md` (mirror copy) and the upstream `C:/projects/capsule-pro/constitution.md`.
- Create: `C:/projects/manifest/docs/capsule-pro/constitution.md` — verbatim mirror of the upstream constitution (so Manifest spec consumers don't need to traverse repos).

- [ ] **Step 1:** Copy `C:/projects/capsule-pro/constitution.md` into `docs/capsule-pro/constitution.md`. Add a header banner: `> Mirror of capsule-pro/constitution.md. Authoritative copy lives in capsule-pro. Do not edit here.`

- [ ] **Step 2:** Add a short section in `docs/spec/semantics.md` (under the existing intro) titled "Capsule-Pro Constitution Reference" stating: (a) Manifest provides the primitives; (b) Capsule-Pro applies them through binding contracts; (c) any Manifest behavior change that touches the constitution requires both spec and constitution sign-off.

- [ ] **Step 3:** Run `npm run typecheck && npm test`. Expected: green (no behavior changed).

- [ ] **Step 4:** Commit.

```bash
git add docs/capsule-pro/constitution.md docs/spec/semantics.md
git commit -m "docs(spec): mirror capsule-pro constitution and add reference to semantics"
```

### Task 0.2 — Carve a "constitution gap matrix" tracker

**Files:**

- Create: `C:/projects/manifest/docs/capsule-pro/gap-matrix.md`

- [ ] **Step 1:** Create the gap matrix with one row per constitution clause and columns `clause | status (✅/◐/✗) | evidence | phase`. Pre-populate from the analysis already captured in this plan's intro. Mark phases 1-5 as the closure path.

- [ ] **Step 2:** Commit.

```bash
git add docs/capsule-pro/gap-matrix.md
git commit -m "docs(capsule-pro): add constitution gap matrix tracker"
```

---

## Phase 1 — Typed Runtime Context

**Goal:** Replace the loose `RuntimeContext = { user?, [key: string]: unknown }` with a typed contract that carries `tenantId`, `orgId`, `actorId`, `requestId`, `source`, and a `deterministic` flag. Existing tests stay green by widening, not breaking.

**Why:** Constitution §3, §15, §19. Every governed mutation needs validated tenant/actor context. Today the runtime accepts whatever the caller hands it; nothing checks the shape.

**Design notes (read before coding):**

- Backwards compatibility: the existing `[key: string]: unknown` index signature stays for now so existing callers (especially conformance fixtures) keep working. New typed fields are optional at the type level but their absence is loggable.
- `deterministic` flag is moved into context but `RuntimeOptions.deterministicMode` remains as a fallback. If both are set, options wins (explicit caller override).
- Context becomes available to guard expressions via the existing `context.*` binding — adding fields does not require IR changes.

### Task 1.1 — Spec: document typed context

**Files:**

- Modify: `C:/projects/manifest/docs/spec/semantics.md` — add §"Runtime Context Schema" near §"Command Execution"
- Modify: `C:/projects/manifest/docs/spec/builtins.md` — document `context.tenantId`, `context.actorId`, `context.requestId`, `context.source` as spec-guaranteed bindings

- [ ] **Step 1:** Write the spec section. Define each field, allowed values, fail-closed semantics when missing on a tenant-scoped command. Include this normative line: "If a tenant-scoped command is invoked without `context.tenantId`, the runtime MUST fail closed with diagnostic code `MISSING_TENANT_CONTEXT`."

- [ ] **Step 2:** `npm run typecheck && npm test` — green.

- [ ] **Step 3:** Commit.

```bash
git add docs/spec/semantics.md docs/spec/builtins.md
git commit -m "spec: document typed runtime context schema (tenantId/actorId/requestId/source)"
```

### Task 1.2 — Add typed RuntimeContext interface

**Files:**

- Modify: `C:/projects/manifest/src/manifest/runtime-engine.ts:35-38`

- [ ] **Step 1: Write the failing test**

Create `C:/projects/manifest/src/manifest/runtime-context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { RuntimeContext } from './runtime-engine';

describe('RuntimeContext typed fields', () => {
  it('accepts the documented typed fields', () => {
    const ctx: RuntimeContext = {
      tenantId: 'tenant_1',
      orgId: 'org_1',
      actorId: 'user_1',
      requestId: 'req_1',
      source: 'route',
      deterministic: false,
    };
    expect(ctx.tenantId).toBe('tenant_1');
  });

  it('still permits ad-hoc keys for backwards compatibility', () => {
    const ctx: RuntimeContext = { tenantId: 't', anything: 1 };
    expect(ctx.anything).toBe(1);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/manifest/runtime-context.test.ts`. Expected: typecheck fails because the fields are not yet on `RuntimeContext`.

- [ ] **Step 3: Implement** — edit `runtime-engine.ts:35-38` to:

```typescript
/**
 * Spec-guaranteed runtime context bindings. Every field is optional at the
 * type level; per spec, tenant-scoped commands fail closed with
 * MISSING_TENANT_CONTEXT when `tenantId` is absent.
 */
export interface RuntimeContext {
  /** Active tenant identifier. Required for tenant-scoped commands. */
  tenantId?: string;
  /** Active organization identifier (e.g. Clerk orgId). */
  orgId?: string;
  /** Acting user identifier. */
  actorId?: string;
  /** Caller-supplied request id; surfaces in diagnostics and emitted events. */
  requestId?: string;
  /** Origin surface: 'route' | 'job' | 'cli' | 'test' | 'ui' | 'workflow'. */
  source?: 'route' | 'job' | 'cli' | 'test' | 'ui' | 'workflow' | string;
  /** If true, adapter actions throw ManifestEffectBoundaryError. */
  deterministic?: boolean;
  /** Legacy actor shorthand. Prefer `actorId`. */
  user?: { id: string; role?: string; [key: string]: unknown };
  /** Open extension surface; legacy callers still rely on free keys. */
  [key: string]: unknown;
}
```

- [ ] **Step 4: Run** the new test plus the full suite: `npm test`. Expected: 632 passing (630 baseline + 2 new).

- [ ] **Step 5: Commit.**

```bash
git add src/manifest/runtime-engine.ts src/manifest/runtime-context.test.ts
git commit -m "feat(runtime): add typed RuntimeContext fields (tenantId, orgId, actorId, requestId, source, deterministic)"
```

### Task 1.3 — Wire `context.deterministic` into runtime execution

**Files:**

- Modify: `C:/projects/manifest/src/manifest/runtime-engine.ts` — inside `runCommand`, near the existing `deterministicMode` read, prefer `options.deterministicMode ?? context.deterministic ?? false`.

- [ ] **Step 1: Write the failing test** at `src/manifest/runtime-deterministic-context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RuntimeEngine, ManifestEffectBoundaryError } from './runtime-engine';
import { compileToIR } from './ir-compiler';
import { parse } from './parser';
import { tokenize } from './lexer';

const src = `
entity Foo {
  property name: string
  command tag {
    action persist
  }
}
`;

describe('context.deterministic', () => {
  it('forces effect boundary errors when set on context', async () => {
    const ir = compileToIR(parse(tokenize(src)));
    const rt = new RuntimeEngine(ir, { tenantId: 't', deterministic: true });
    await expect(rt.runCommand('tag', { name: 'x' }, { entityName: 'Foo' })).rejects.toBeInstanceOf(
      ManifestEffectBoundaryError,
    );
  });
});
```

- [ ] **Step 2: Run** the test. Expected: FAIL — currently the persist action does not throw because options.deterministicMode is unset.

- [ ] **Step 3: Implement** — at every site in `runtime-engine.ts` that reads `this.options.deterministicMode`, change to: `const deterministic = this.options.deterministicMode ?? (this.context as RuntimeContext).deterministic ?? false;`. Confirm no behavior change for callers who pass via options.

- [ ] **Step 4: Run** `npm test`. Expected: all green, including the new test.

- [ ] **Step 5: Commit.**

```bash
git add src/manifest/runtime-engine.ts src/manifest/runtime-deterministic-context.test.ts
git commit -m "feat(runtime): honor context.deterministic in addition to options.deterministicMode"
```

### Task 1.4 — Fail closed on missing tenant for tenant-scoped commands

**Design constraint:** "Tenant-scoped" is currently implicit. We add an opt-in marker via IR command metadata. Skip changing IR shape — instead, add a runtime-side helper that consults a soon-to-exist registry (see Phase 3). For now, gate behavior behind an explicit `RuntimeOptions.requireTenantContext = true` flag so existing tests don't break.

**Files:**

- Modify: `C:/projects/manifest/src/manifest/runtime-engine.ts` — `RuntimeOptions` adds `requireTenantContext?: boolean`; `runCommand` returns a `MISSING_TENANT_CONTEXT` failure when set and `context.tenantId` absent.

- [ ] **Step 1: Write the failing test** at `src/manifest/runtime-tenant-required.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RuntimeEngine } from './runtime-engine';
import { compileToIR } from './ir-compiler';
import { parse } from './parser';
import { tokenize } from './lexer';

const src = `entity Foo { command bar { } }`;

describe('requireTenantContext', () => {
  it('fails closed with MISSING_TENANT_CONTEXT when tenantId absent', async () => {
    const ir = compileToIR(parse(tokenize(src)));
    const rt = new RuntimeEngine(ir, {}, { requireTenantContext: true });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('MISSING_TENANT_CONTEXT');
  });

  it('passes when tenantId is present', async () => {
    const ir = compileToIR(parse(tokenize(src)));
    const rt = new RuntimeEngine(ir, { tenantId: 't' }, { requireTenantContext: true });
    const result = await rt.runCommand('bar', {}, { entityName: 'Foo' });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run** the test. Expected: FAIL.

- [ ] **Step 3: Implement** — at the top of `runCommand`, after existing IR-hash verification:

```typescript
if (this.options.requireTenantContext && !(this.context as RuntimeContext).tenantId) {
  return {
    success: false,
    error: 'MISSING_TENANT_CONTEXT: tenant-scoped command invoked without context.tenantId',
    emittedEvents: [],
  };
}
```

Also add the field to `RuntimeOptions`.

- [ ] **Step 4: Run** `npm test`. Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add src/manifest/runtime-engine.ts src/manifest/runtime-tenant-required.test.ts
git commit -m "feat(runtime): add requireTenantContext option, fail closed with MISSING_TENANT_CONTEXT"
```

### Task 1.5 — Phase 1 closing verification

- [ ] **Step 1:** `npm test` — green, expect ≥634 passing.
- [ ] **Step 2:** `npm run typecheck` — clean.
- [ ] **Step 3:** `npm run lint` — clean.
- [ ] **Step 4:** Update `docs/capsule-pro/gap-matrix.md` — mark §3, §19 as enforced where applicable.
- [ ] **Step 5:** Commit gap-matrix update.

```bash
git add docs/capsule-pro/gap-matrix.md
git commit -m "docs(capsule-pro): mark §3/§19 partial — typed context shipped"
```

---

## Phase 2 — `nextjs.dispatcher` Projection

**Goal:** Emit a single canonical dynamic route file at `app/api/manifest/[entity]/commands/[command]/route.ts`. The route resolves entity+command against the compiled IR registry and invokes `RuntimeEngine.runCommand` with translated Clerk context.

**Why:** Constitution §6 makes this the canonical write path. The existing `nextjs.command` surface generates per-command concrete routes, exactly what §6 says are "not authoritative."

**Design notes:**

- Keep `nextjs.command` available but mark its emitted file with a `// DEPRECATED ALIAS` header pointing at the dispatcher.
- Dispatcher imports the compiled IR via a configurable path (default `@/lib/manifest-ir`).
- Auth provider config (Clerk/NextAuth/custom) reuses existing helpers in `generator.ts`.

### Task 2.1 — Spec: add §"Canonical Dispatcher" section

**Files:**

- Modify: `C:/projects/manifest/docs/spec/adapters.md` — new section explaining that any Next.js consumer SHOULD use the dispatcher and that direct per-command routes are alias-only.

- [ ] **Step 1:** Author the section. Quote constitution §6 verbatim.
- [ ] **Step 2:** Validate: `npm run typecheck && npm test`. Green.
- [ ] **Step 3:** Commit.

```bash
git add docs/spec/adapters.md
git commit -m "spec(adapters): document canonical /api/manifest/[entity]/commands/[command] dispatcher"
```

### Task 2.2 — Register `nextjs.dispatcher` surface

**Files:**

- Modify: `C:/projects/manifest/src/manifest/projections/nextjs/generator.ts:285` — extend `surfaces` to include `'nextjs.dispatcher'`.
- Modify: same file — add a `case 'nextjs.dispatcher':` branch in `generate()`.

- [ ] **Step 1: Write the failing test** at `src/manifest/projections/nextjs/dispatcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NextJsProjection } from './generator';
import { compileToIR } from '../../ir-compiler';
import { parse } from '../../parser';
import { tokenize } from '../../lexer';

const src = `
entity Recipe {
  property title: string
  command create { action persist }
  command publish { action persist }
}
`;

describe('nextjs.dispatcher surface', () => {
  const ir = compileToIR(parse(tokenize(src)));
  const target = new NextJsProjection();

  it('declares nextjs.dispatcher as a supported surface', () => {
    expect(target.surfaces).toContain('nextjs.dispatcher');
  });

  it('emits exactly one artifact at the canonical pathHint', () => {
    const result = target.generate(ir, { surface: 'nextjs.dispatcher' });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].pathHint).toBe(
      'apps/api/app/api/manifest/[entity]/commands/[command]/route.ts',
    );
  });

  it('generated code references runCommand and resolves params.entity/params.command', () => {
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;
    expect(code).toMatch(/runCommand/);
    expect(code).toMatch(/params\.entity/);
    expect(code).toMatch(/params\.command/);
    expect(code).toMatch(/POST/);
  });
});
```

- [ ] **Step 2: Run** the test. Expected: FAIL with `UNKNOWN_SURFACE` diagnostic.

- [ ] **Step 3: Implement** the surface. Add a private method `_dispatcher(ir, options)` that returns this template (sketch — finalize during implementation):

```typescript
// generated dispatcher (sketch)
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '<authImportPath>';
import { getRuntime } from '<runtimeImportPath>';

export async function POST(
  req: NextRequest,
  { params }: { params: { entity: string; command: string } },
) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const runtime = await getRuntime();
  const ctx = {
    tenantId: orgId ?? undefined,
    orgId: orgId ?? undefined,
    actorId: userId,
    requestId: req.headers.get('x-request-id') ?? undefined,
    source: 'route' as const,
  };

  const result = await runtime.runCommand(params.command, body, {
    entityName: params.entity,
    context: ctx,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
```

The branch in `generate()`:

```typescript
case 'nextjs.dispatcher': {
  const result = this._dispatcher(ir, options);
  if (result.diagnostics.some(d => d.severity === 'error')) {
    return { artifacts: [], diagnostics: result.diagnostics };
  }
  const opts = normalizeOptions(options);
  return {
    artifacts: [{
      id: 'nextjs.dispatcher',
      pathHint: `${opts.appDir}/manifest/[entity]/commands/[command]/route.ts`,
      contentType: 'typescript',
      code: result.code,
    }],
    diagnostics: result.diagnostics,
  };
}
```

- [ ] **Step 4: Run** `npm test`. Expected: dispatcher test passes; all 634+ pass.

- [ ] **Step 5: Commit.**

```bash
git add src/manifest/projections/nextjs/generator.ts src/manifest/projections/nextjs/dispatcher.test.ts
git commit -m "feat(projections/nextjs): add nextjs.dispatcher surface emitting canonical /api/manifest/[entity]/commands/[command]"
```

### Task 2.3 — Mark `nextjs.command` output as a deprecated alias

**Files:**

- Modify: `C:/projects/manifest/src/manifest/projections/nextjs/generator.ts` — in `_command`, prepend the emitted code with a deprecation banner pointing at the dispatcher path.

- [ ] **Step 1: Write the failing test** — add to `dispatcher.test.ts`:

```typescript
it('marks legacy per-command routes as deprecated aliases', () => {
  const result = target.generate(ir, {
    surface: 'nextjs.command',
    entity: 'Recipe',
    command: 'create',
  });
  expect(result.artifacts[0].code).toMatch(
    /DEPRECATED ALIAS.*\/api\/manifest\/\[entity\]\/commands\/\[command\]/,
  );
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** — prepend the deprecation banner.

- [ ] **Step 4: Run** `npm test`. Green.

- [ ] **Step 5: Commit.**

```bash
git add src/manifest/projections/nextjs/generator.ts src/manifest/projections/nextjs/dispatcher.test.ts
git commit -m "feat(projections/nextjs): mark per-command routes as deprecated aliases of the dispatcher"
```

### Task 2.4 — Phase 2 closing verification

- [ ] `npm test`, `typecheck`, `lint` — all green.
- [ ] Update `docs/capsule-pro/gap-matrix.md` — §6 enforced.
- [ ] Commit gap-matrix update.

---

## Phase 3 — Machine-Readable Registries from IR

**Goal:** Compile-time emit two JSON artifacts:

1. `manifest.commands.json` — full command registry (entity, command, commandId, policies summary, guards summary, emits, effects, description, sourceFile/line if available).
2. `manifest.entities.json` — governed-entity registry (entity, classification, tenantScoped, commands, propertyNames, sourceFile).

**Why:** Constitution §17 lists these as required artifacts. The audit suite (Phase 5) needs them as ground truth.

**Design notes:**

- Add a new CLI command `manifest emit registries [--out dir]` rather than embedding in `compile` (keeps responsibilities clean).
- Schemas live at `docs/spec/registry/commands.schema.json` and `docs/spec/registry/entities.schema.json` and are validated by an in-process Ajv check (already a dep — verify).
- Default classification for any tenant-scoped entity is `governed`. We infer `tenantScoped: true` if entity has a property named `tenantId` (matching the audit-routes default). Classification can be overridden by an explicit `// @manifest:classification ...` annotation in source — design that in but ship the default-only path first.

### Task 3.1 — Spec: registry shape

**Files:**

- Create: `C:/projects/manifest/docs/spec/registry/README.md`
- Create: `C:/projects/manifest/docs/spec/registry/commands.schema.json`
- Create: `C:/projects/manifest/docs/spec/registry/entities.schema.json`

- [ ] **Step 1:** Author the README explaining the contract and stability guarantees.
- [ ] **Step 2:** Author both JSON Schemas. Use `draft-07`. Top-level shapes:

```json
// commands.schema.json (sketch)
{
  "type": "object",
  "required": ["irHash", "compilerVersion", "commands"],
  "properties": {
    "irHash": { "type": "string" },
    "compilerVersion": { "type": "string" },
    "commands": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entity", "command", "commandId"],
        "properties": {
          "entity": { "type": "string" },
          "command": { "type": "string" },
          "commandId": { "type": "string" },
          "policies": { "type": "array", "items": { "type": "string" } },
          "guards": { "type": "array", "items": { "type": "string" } },
          "emits": { "type": "array", "items": { "type": "string" } },
          "effects": { "type": "array", "items": { "type": "string" } },
          "description": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 3:** Validate schemas parse: `node -e "JSON.parse(require('fs').readFileSync('docs/spec/registry/commands.schema.json','utf8'))"`.
- [ ] **Step 4:** Commit.

```bash
git add docs/spec/registry
git commit -m "spec(registry): add command and governed-entity registry schemas"
```

### Task 3.2 — Registry emitter

**Files:**

- Create: `C:/projects/manifest/src/manifest/registry/emit.ts`
- Create: `C:/projects/manifest/src/manifest/registry/emit.test.ts`

- [ ] **Step 1: Write the failing test:**

```typescript
import { describe, it, expect } from 'vitest';
import { emitRegistries } from './emit';
import { compileToIR } from '../ir-compiler';
import { parse } from '../parser';
import { tokenize } from '../lexer';

const src = `
entity Recipe {
  property tenantId: string
  property title: string
  command create { action persist }
}
entity SystemLog {
  property message: string
}
`;

describe('emitRegistries', () => {
  const ir = compileToIR(parse(tokenize(src)));

  it('emits one commands entry per entity-command pair', () => {
    const { commands } = emitRegistries(ir);
    const found = commands.commands.find((c) => c.entity === 'Recipe' && c.command === 'create');
    expect(found).toBeDefined();
    expect(found!.commandId).toMatch(/Recipe\.create/);
  });

  it('classifies tenantId-bearing entities as governed', () => {
    const { entities } = emitRegistries(ir);
    const recipe = entities.entities.find((e) => e.name === 'Recipe');
    expect(recipe?.classification).toBe('governed');
    expect(recipe?.tenantScoped).toBe(true);
  });

  it('classifies non-tenant entities as unknown_nonconforming by default', () => {
    const { entities } = emitRegistries(ir);
    const sys = entities.entities.find((e) => e.name === 'SystemLog');
    expect(sys?.classification).toBe('unknown_nonconforming');
  });

  it('includes irHash for drift detection', () => {
    const { commands, entities } = emitRegistries(ir);
    expect(commands.irHash).toMatch(/^[a-f0-9]+$/);
    expect(commands.irHash).toBe(entities.irHash);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement** `emit.ts`:

```typescript
import type { IR } from '../ir';

export interface CommandRegistryEntry {
  entity: string;
  command: string;
  commandId: string;
  policies: string[];
  guards: string[];
  emits: string[];
  effects: string[];
  description?: string;
}

export interface EntityRegistryEntry {
  name: string;
  classification:
    | 'governed'
    | 'read_only_projection'
    | 'infrastructure'
    | 'bypass_allowed'
    | 'unknown_nonconforming';
  tenantScoped: boolean;
  commands: string[];
  properties: string[];
}

export interface CommandRegistry {
  irHash: string;
  compilerVersion: string;
  commands: CommandRegistryEntry[];
}

export interface EntityRegistry {
  irHash: string;
  compilerVersion: string;
  entities: EntityRegistryEntry[];
}

export function emitRegistries(ir: IR): { commands: CommandRegistry; entities: EntityRegistry } {
  const irHash = ir.provenance?.contentHash ?? '';
  const compilerVersion = ir.provenance?.compilerVersion ?? '';

  const commands: CommandRegistryEntry[] = [];
  const entities: EntityRegistryEntry[] = [];

  for (const entity of ir.entities) {
    const tenantScoped = entity.properties?.some((p) => p.name === 'tenantId') ?? false;
    const commandNames = (entity.commands ?? []).map((c) => c.name);

    entities.push({
      name: entity.name,
      classification: tenantScoped ? 'governed' : 'unknown_nonconforming',
      tenantScoped,
      commands: commandNames,
      properties: (entity.properties ?? []).map((p) => p.name),
    });

    for (const cmd of entity.commands ?? []) {
      commands.push({
        entity: entity.name,
        command: cmd.name,
        commandId: `${entity.name}.${cmd.name}`,
        policies: (cmd.policies ?? []).map((p) => p.name),
        guards: (cmd.guards ?? []).map((_, i) => `guard[${i}]`),
        emits: (cmd.emits ?? []).map((e) => e.name),
        effects: (cmd.actions ?? []).map((a) => a.kind),
        description: cmd.description,
      });
    }
  }

  return {
    commands: { irHash, compilerVersion, commands },
    entities: { irHash, compilerVersion, entities },
  };
}
```

Note: field names like `entity.commands`, `cmd.guards`, `cmd.policies`, `cmd.emits`, `cmd.actions` must match the actual IR. Adjust during implementation by reading `src/manifest/ir.ts`. Do not guess.

- [ ] **Step 4: Run** `npm test`. Expected: green.

- [ ] **Step 5: Commit.**

```bash
git add src/manifest/registry/emit.ts src/manifest/registry/emit.test.ts
git commit -m "feat(registry): emit machine-readable command and governed-entity registries from IR"
```

### Task 3.3 — Schema validation step in emitter

**Files:**

- Modify: `C:/projects/manifest/src/manifest/registry/emit.ts` — at the end of `emitRegistries`, run Ajv validation against the schemas and throw on failure.
- Add test asserting that a deliberately broken IR (mock) fails validation.

- [ ] **Step 1: Test.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify.**
- [ ] **Step 4: Commit.**

```bash
git commit -m "feat(registry): validate emitted registries against JSON schemas"
```

### Task 3.4 — CLI: `manifest emit registries`

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/commands/emit-registries.ts`
- Create: `C:/projects/manifest/packages/cli/src/commands/emit-registries.test.ts`
- Modify: `C:/projects/manifest/packages/cli/src/index.ts` — register the subcommand.

- [ ] **Step 1: Test** the CLI by importing the action and invoking against a tmpdir.
- [ ] **Step 2: Implement** — accepts `--ir <path>` (defaults to running `compile` if a .manifest source is given) and `--out <dir>` (defaults to `./manifest-registry`). Writes `commands.json` and `entities.json`.
- [ ] **Step 3: Verify** end-to-end: `npx manifest emit registries --ir test-fixtures/sample.ir.json --out tmp/`.
- [ ] **Step 4: Commit.**

```bash
git commit -m "feat(cli): add `manifest emit registries` to write commands.json and entities.json"
```

### Task 3.5 — Phase 3 closing verification

- [ ] `npm test`, `typecheck`, `lint`.
- [ ] Update gap matrix: §8, §17 partially enforced.
- [ ] Commit.

---

## Phase 4 — Bypass Registry Schema + Validator

**Goal:** Define the data shape and CLI validator for the constitution's §8/§17 bypass registry.

### Task 4.1 — Schema

**Files:**

- Create: `C:/projects/manifest/docs/spec/registry/bypasses.schema.json`

Fields per constitution §8:

- `entity` (string)
- `path` (string, relative to repo root)
- `reason` (string)
- `whyRuntimeNotRequired` (string)
- `tenantBoundary` (string)
- `owner` (string)
- `approvedAt` (string, ISO date)
- `reviewBy` (string, ISO date)

- [ ] **Step 1:** Author schema. Required: all of the above.
- [ ] **Step 2:** Validate parse.
- [ ] **Step 3:** Commit.

```bash
git commit -m "spec(registry): add bypass registry JSON schema"
```

### Task 4.2 — Validator + CLI command

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/commands/audit-bypasses.ts`
- Create: `C:/projects/manifest/packages/cli/src/commands/audit-bypasses.test.ts`

- [ ] **Step 1: Tests:**
  - Valid registry → exits 0.
  - Missing required field → reports error, exits non-zero under `--strict`.
  - Expired `reviewBy` → reports warning by default, error under `--strict-expiry`.
  - File path that doesn't exist → reports `BYPASS_PATH_MISSING`.

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Wire into CLI index.**
- [ ] **Step 4: Commit.**

```bash
git commit -m "feat(cli): add `manifest audit bypasses` validator"
```

### Task 4.3 — Phase 4 closing

- [ ] Tests + lint + typecheck.
- [ ] Gap matrix update.
- [ ] Commit.

---

## Phase 5 — Constitution Audit Suite

**Goal:** Expand `audit-routes` (or wrap it) into a multi-detector constitution audit. Single command `manifest audit constitution` runs everything; under `--strict` any failure is exit-non-zero.

**Detectors to add:**

| Detector           | What it catches                                                                    | Constitution clause |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------- |
| `directWrites`     | `prisma.X.create/update/delete/upsert/*Many` in non-bypass routes                  | §9                  |
| `eventFabrication` | `emit(` / `eventBus.publish` / fabricated semantic events outside runtime adapters | §11                 |
| `routeDrift`       | Per-command routes that don't immediately delegate to the canonical dispatcher     | §6                  |
| `missingTests`     | Governed commands in `manifest.commands.json` with no conformance fixture          | §13                 |
| `bypassViolations` | Direct writes whose path is not in the bypass registry                             | §9, §17             |

### Task 5.1 — Audit umbrella command

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/commands/audit-constitution.ts`
- Create: `C:/projects/manifest/packages/cli/src/commands/audit-constitution.test.ts`

- [ ] **Step 1:** Stub the command with the existing `audit-routes` integrated as the `directWrites` detector. Tests assert detectors can be opted in/out via `--only directWrites,eventFabrication`.
- [ ] **Step 2:** Implement skeleton + integration with existing audit-routes.
- [ ] **Step 3:** Verify the skeleton passes existing audit-routes tests.
- [ ] **Step 4:** Commit.

```bash
git commit -m "feat(cli): scaffold `manifest audit constitution` umbrella with directWrites detector"
```

### Task 5.2 — Event fabrication detector

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/audit/event-fabrication.ts` + test.

Detector logic:

- Scan route patterns (reuse `ROUTE_PATTERNS` from audit-routes).
- Match `eventBus.publish(`, `emit(`, `new ManifestEvent(`, `'semantic:'` literal channels.
- Allowlist files under `src/manifest/runtime/adapters/**`.

- [ ] **Step 1: Test fixtures:** add a route under tmp test workspace that calls `eventBus.publish('Recipe.published', ...)`. Detector must flag it.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Wire into umbrella.**
- [ ] **Step 4: Commit.**

```bash
git commit -m "feat(audit): detect semantic event fabrication outside runtime adapters"
```

### Task 5.3 — Route drift detector

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/audit/route-drift.ts` + test.

Detector logic:

- For every file matching `app/api/**/[command]/route.ts` that is NOT the dispatcher path, verify the route body contains an immediate delegation to the canonical path (regex on `fetch('/api/manifest/.../commands/...')` or `dispatchCommand(`).
- Otherwise emit `ROUTE_DRIFT` finding.

- [ ] **Step 1: Test.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit.**

```bash
git commit -m "feat(audit): detect concrete command routes that drift from canonical dispatcher"
```

### Task 5.4 — Missing-tests detector

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/audit/missing-tests.ts` + test.

Detector logic:

- Load `manifest.commands.json` (Phase 3).
- For every command, search `**/*.{test,conformance}.{ts,json}` for a reference to `commandId`.
- Anything unreferenced → `MISSING_CONFORMANCE_TEST` finding.

- [ ] **Step 1: Test.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit.**

```bash
git commit -m "feat(audit): detect governed commands without conformance evidence"
```

### Task 5.5 — Bypass violations detector

**Files:**

- Create: `C:/projects/manifest/packages/cli/src/audit/bypass-violations.ts` + test.

Detector logic:

- Run `directWrites` detector.
- Load bypass registry (path provided via `--bypass`).
- Any direct-write finding whose route file is NOT listed in the bypass registry → upgrade severity to error and emit `BYPASS_VIOLATION`.
- Any bypass-registry entry whose path no longer contains a direct write → emit `STALE_BYPASS` warning.

- [ ] **Step 1: Test.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Wire into umbrella.**
- [ ] **Step 4: Commit.**

```bash
git commit -m "feat(audit): cross-check direct writes against bypass registry"
```

### Task 5.6 — End-to-end smoke

- [ ] **Step 1:** Compose a fixture workspace under `packages/cli/test-fixtures/constitution/` containing: passing routes, drifted routes, fabricated events, missing tests, valid + invalid bypass registry.
- [ ] **Step 2:** Add a single integration test that runs the full `manifest audit constitution --strict` against the fixture and asserts the expected findings JSON.
- [ ] **Step 3:** Commit.

```bash
git commit -m "test(audit): end-to-end constitution audit fixture and assertion"
```

### Task 5.7 — Phase 5 closing

- [ ] Tests, lint, typecheck — green.
- [ ] Gap matrix update — §6/§9/§11/§13/§17 enforceable.
- [ ] Commit.

---

## Phase 6 — Durable Audit + Outbox Contracts (SKETCH — DEFERRED)

This phase is intentionally not detailed at task-level. The user's goal text gates it on Phases 1–5 stabilizing. The skeleton below exists so that when Phase 6 begins, design starts from the contract, not from a blank page.

### Sketch

**Audit contract** (`src/manifest/audit/audit-emitter.ts`):

```typescript
export interface AuditRecord {
  recordId: string;
  occurredAt: number;
  tenantId?: string;
  actorId?: string;
  requestId?: string;
  source?: string;
  entity: string;
  command: string;
  commandId: string;
  outcome: 'success' | 'guard_denied' | 'policy_denied' | 'constraint_failed' | 'error';
  diagnostics?: unknown;
  emittedEventIds?: string[];
  irHash?: string;
}

export interface AuditSink {
  emit(record: AuditRecord): Promise<void>;
}
```

`RuntimeEngine` accepts `RuntimeOptions.auditSink`. Every `runCommand` invocation produces exactly one record after policy/guard/action resolution.

**Outbox contract** (`src/manifest/outbox/outbox-store.ts`):

```typescript
export interface OutboxEntry {
  entryId: string;
  enqueuedAt: number;
  event: EmittedEvent;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
}

export interface OutboxStore {
  enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void>;
  claim(batchSize: number): Promise<OutboxEntry[]>;
  markDelivered(entryIds: string[]): Promise<void>;
  markFailed(entryIds: string[], error: string): Promise<void>;
}
```

When an `OutboxStore` is provided, runtime persists emitted events in the same transaction as the entity mutation. Per constitution §11 this is the only way event emission becomes durable.

**Adapters to build (Phase 6):**

- `PostgresAuditSink`, `PostgresOutboxStore` in `stores.node.ts`.
- `MemoryAuditSink`, `MemoryOutboxStore` for tests.

**CI gates added in Phase 6:**

- `audit-routes` extension: flag commands that emit events without an outbox configured (warn-by-default, error-by-strict).

Phase 6 detailed task list to be written when Phases 1–5 close.

---

## Out of Scope (Explicit Non-Goals)

- Inventing semantics not in the constitution (e.g. multi-tenant routing).
- Changing IR shape (`docs/spec/ir/ir-v1.schema.json`).
- Touching existing conformance fixtures (we may add new ones; we don't modify existing).
- UI changes in `src/artifacts` — the constitution is enforced upstream of UI.
- Re-implementing capsule-pro's `audit-routes` consumer; we ship the primitives, they wire them.

---

## Risks and Rollback

| Risk                                                                         | Mitigation                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Phase 1 widening of `RuntimeContext` breaks downstream consumers             | Type is purely additive; index signature preserved.                                                             |
| Phase 2 dispatcher generates code that breaks existing per-command consumers | Mark legacy as deprecated; do NOT remove until capsule-pro side migrates.                                       |
| Phase 3 registry shape changes after capsule-pro adopts                      | JSON schemas under `docs/spec/registry/` are versioned via `compilerVersion`. Bump only with reason.            |
| Phase 4 bypass schema is too strict for real-world legacy                    | `--strict-expiry` is opt-in. Default mode warns on missing fields.                                              |
| Phase 5 false positives flood CI                                             | Each detector emits a stable `code`; capsule-pro can exempt by code per file via `audit-routes` exemption JSON. |

**Rollback:** Each phase is one or more commits. Reverting any phase removes its files cleanly because phases are additive (no modification of pre-existing semantics).

---

## Done When

- All 5 active phases land on `main` with `npm test` green.
- `docs/capsule-pro/gap-matrix.md` shows ✅ for §3, §6, §8, §9, §11, §13, §17, §19 (partial allowed only with explicit owner + reason).
- A capsule-pro repo can `npx manifest audit constitution --strict` against its tree and the command terminates with a meaningful exit code.
- Phase 6 plan written (detail-level) and ready to execute.
