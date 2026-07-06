---
title: "Getting Started"
description: "Learn what Manifest does, why it exists, and how to run your first Manifest program."
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.


Manifest is a TypeScript-first domain modeling language and runtime that compiles declarative business rules into a stable IR and executes them deterministically.

## The Problem

- Business rules usually get split across request handlers, ORM hooks, validation helpers, and event code, so the real execution order becomes implicit.
- Generated routes and handwritten endpoints often drift away from the rules they were supposed to enforce.
- Durable concerns like audit logs, outbox delivery, and tenant context are easy to bolt on inconsistently.
- Teams need one contract that compiler tooling, runtime execution, governance checks, and projections can all share.

## The Solution

Manifest turns domain logic into a compiled contract. The compiler in `src/manifest/ir-compiler.ts` produces a canonical IR, and the runtime in `src/manifest/runtime-engine.ts` executes commands in a fixed order: tenant gate, idempotency, rate-limit, policies, constraints, guards, actions, emits, then adapter hooks such as audit and outbox.

```ts
import { RuntimeEngine } from '@angriff36/manifest';
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const source = `
entity Task {
  property required id: string
  property status: string = "pending"

  command complete() {
    guard self.status == "pending"
    mutate status = "done"
    emit taskCompleted
  }
}

store Task in memory

event taskCompleted: "task.completed" {
  id: string
}
`;

const { ir, diagnostics } = await compileToIR(source);
if (!ir || diagnostics.some((d) => d.severity === 'error')) {
  throw new Error('Manifest source did not compile');
}

const runtime = new RuntimeEngine(ir, {
  actorId: 'operator-1',
  user: { id: 'operator-1', role: 'operator' },
});

const task = await runtime.createInstance('Task', {});
const result = await runtime.runCommand('complete', {}, {
  entityName: 'Task',
  instanceId: task!.id,
});

console.log(result.success, (await runtime.getInstance('Task', task!.id))?.status);
```

## Installation

<Tabs items={["npm", "pnpm", "yarn", "bun"]}>
<Tab value="npm">

```bash
npm install @angriff36/manifest
```

</Tab>
<Tab value="pnpm">

```bash
pnpm add @angriff36/manifest
```

</Tab>
<Tab value="yarn">

```bash
yarn add @angriff36/manifest
```

</Tab>
<Tab value="bun">

```bash
bun add @angriff36/manifest
```

</Tab>
</Tabs>

If you want the companion CLI, install `@manifest/cli` as a development dependency and use it to compile `.manifest` files or generate projection artifacts.

## Quick Start

This is the minimum end-to-end loop using the public package APIs exported from `@angriff36/manifest` and `@angriff36/manifest/ir-compiler`.

```ts
import { RuntimeEngine } from '@angriff36/manifest';
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const source = `
entity Counter {
  property required id: string
  property value: number = 0

  command increment(amount: number) {
    guard amount > 0
    mutate value = self.value + amount
    emit incremented
  }
}

store Counter in memory

event incremented: "counter.incremented" {
  amount: number
}
`;

const { ir, diagnostics } = await compileToIR(source);
if (!ir || diagnostics.some((d) => d.severity === 'error')) {
  console.error(diagnostics);
  process.exit(1);
}

const runtime = new RuntimeEngine(ir, {
  actorId: 'demo-user',
  user: { id: 'demo-user', role: 'member' },
}, {
  generateId: () => 'counter-1',
  now: () => 1700000000000,
});

await runtime.createInstance('Counter', {});

const result = await runtime.runCommand('increment', { amount: 2 }, {
  entityName: 'Counter',
  instanceId: 'counter-1',
});

const counter = await runtime.getInstance('Counter', 'counter-1');

console.log({
  success: result.success,
  value: counter?.value,
  events: result.emittedEvents.map((event) => event.name),
});
```

Expected output:

```ts
{
  success: true,
  value: 2,
  events: ['incremented']
}
```

## Key Features

- Deterministic runtime execution with policy, constraint, guard, action, and emit ordering enforced in `src/manifest/runtime-engine.ts`.
- A canonical IR contract defined in `src/manifest/ir.ts`, produced by the compiler in `src/manifest/ir-compiler.ts`.
- Browser-safe default runtime stores plus Node-only `PostgresStore` and `SupabaseStore` adapters in `src/manifest/stores.node.ts`.
- First-party audit and outbox adapter contracts with memory and PostgreSQL implementations.
- Projection support for Next.js route generation and canonical route manifests from the same IR.
- A companion CLI in `packages/cli` for compile, generate, build, validate, route inventory, and governance audits.

<Cards>
  <Card title="Architecture" href="/docs/architecture">See how the compiler, IR, runtime, adapters, and projections fit together.</Card>
  <Card title="Core Concepts" href="/docs/runtime-engine-concepts">Understand the execution model, IR pipeline, adapters, and projections.</Card>
  <Card title="API Reference" href="/docs/api-reference/runtime-engine">Jump to constructor options, signatures, import paths, and module-level APIs.</Card>
</Cards>
