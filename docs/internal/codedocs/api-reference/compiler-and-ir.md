---
title: "Compiler and IR API"
description: "Public APIs for ManifestCompiler, IRCompiler, compileToIR, and the IR contract types."
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../../../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../../../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../../../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.


## Import Paths

```ts
import { ManifestCompiler } from '@angriff36/manifest/compiler';
import type {
  ManifestProgram,
  CompilationResult,
  CompilationError,
  EntityNode,
  CommandNode,
} from '@angriff36/manifest/compiler';

import { IRCompiler, compileToIR } from '@angriff36/manifest/ir-compiler';
import type {
  IR,
  IREntity,
  IRCommand,
  IRPolicy,
  IRConstraint,
  CompileToIRResult,
} from '@angriff36/manifest/ir';
```

Source files: `src/manifest/compiler.ts`, `src/manifest/ir-compiler.ts`, `src/manifest/ir.ts`, `src/manifest/types.ts`

## `ManifestCompiler`

```ts
class ManifestCompiler {
  compile(source: string): CompilationResult
  parse(source: string): { program: ManifestProgram; errors: unknown[] }
}
```

`ManifestCompiler` is the older AST-and-code-generation oriented entry point. It delegates parsing to `Parser` and generation to `CodeGenerator` in `src/manifest/generator.ts`.

Example:

```ts
const compiler = new ManifestCompiler();
const result = compiler.compile(source);

if (!result.success) {
  console.error(result.errors);
} else {
  console.log(result.ast?.entities.length);
}
```

## `IRCompiler`

```ts
class IRCompiler {
  constructor(cache?: IRCache)
  compileToIR(source: string, options?: { useCache?: boolean }): Promise<CompileToIRResult>
}
```

`IRCompiler` is the primary compiler surface for the current package. It parses source, lowers AST to IR, carries diagnostics forward, and stamps provenance hashes onto the result.

Example:

```ts
const compiler = new IRCompiler();
const result = await compiler.compileToIR(source, { useCache: true });

console.log(result.ir?.provenance);
```

## `compileToIR`

```ts
function compileToIR(source: string): Promise<CompileToIRResult>
```

This helper is the simplest public entry point when you do not need compiler object reuse.

Example:

```ts
const { ir, diagnostics } = await compileToIR(source);
```

## AST Types from `@angriff36/manifest/compiler`

The compiler module re-exports the AST node types defined in `src/manifest/types.ts`. The most important public types are:

```ts
interface ManifestProgram {
  modules: ModuleNode[];
  entities: EntityNode[];
  commands: CommandNode[];
  flows: FlowNode[];
  effects: EffectNode[];
  exposures: ExposeNode[];
  compositions: CompositionNode[];
  policies: PolicyNode[];
  stores: StoreNode[];
  events: OutboxEventNode[];
}

interface CompilationResult {
  success: boolean;
  code?: string;
  serverCode?: string;
  testCode?: string;
  errors?: CompilationError[];
  ast?: ManifestProgram;
}

interface CompilationError {
  message: string;
  position?: Position;
  severity: 'error' | 'warning';
}
```

Other exported AST types include `ModuleNode`, `EntityNode`, `PropertyNode`, `ComputedPropertyNode`, `RelationshipNode`, `CommandNode`, `ParameterNode`, `PolicyNode`, `StoreNode`, `OutboxEventNode`, `TypeNode`, `BehaviorNode`, `ConstraintNode`, `FlowNode`, `EffectNode`, `ExposeNode`, `CompositionNode`, and the expression node variants.

## IR Types from `@angriff36/manifest/ir`

The `ir` subpath is the canonical public contract. Core definitions:

```ts
interface IR {
  version: '1.0';
  provenance: IRProvenance;
  modules: IRModule[];
  entities: IREntity[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
}

interface IREntity {
  name: string;
  module?: string;
  properties: IRProperty[];
  computedProperties: IRComputedProperty[];
  relationships: IRRelationship[];
  commands: string[];
  constraints: IRConstraint[];
  policies: string[];
  defaultPolicies?: string[];
  versionProperty?: string;
  versionAtProperty?: string;
  transitions?: IRTransition[];
}

interface IRCommand {
  name: string;
  module?: string;
  entity?: string;
  parameters: IRParameter[];
  guards: IRExpression[];
  constraints?: IRConstraint[];
  policies?: string[];
  actions: IRAction[];
  emits: string[];
  returns?: IRType;
}
```

Additional exported IR types include `IRProvenance`, `IRModule`, `IRTransition`, `IRProperty`, `IRComputedProperty`, `IRRelationship`, `IRStore`, `IREvent`, `IREventField`, `IRParameter`, `IRAction`, `IRPolicy`, `IRType`, `IRValue`, `IRExpression`, `IRDiagnostic`, `ConstraintOutcome`, `OverrideRequest`, `ConcurrencyConflict`, and `CompileToIRResult`.

## Common Pattern

The most common public flow is:

```ts
import { RuntimeEngine } from '@angriff36/manifest';
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const { ir } = await compileToIR(source);
const runtime = new RuntimeEngine(ir!);
```

That path reflects the package design: compile source into IR first, then execute or project from the IR contract.
