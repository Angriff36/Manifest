Phase 2 Deliverable: Formalize Projections

File Structure

src/manifest/
├── projections/
│ ├── interface.ts # Projection contract (50 lines)
│ ├── registry.ts # Registration + lookup (30 lines)
│ ├── nextjs/
│ │ ├── generator.ts # Your capsule-pro generator
│ │ ├── generator.test.ts # Your smoke test
│ │ └── README.md # Usage + examples
│ ├── hono/ # (future)
│ └── express/ # (future)
├── compiler.ts
├── runtime-engine.ts
└── generator.ts # Keep for generic TS classes

docs/
├── spec/
│ └── ...
└── patterns/
└── external-projections.md # The doc that prevents runtime.query()

1. Projection Interface (src/manifest/projections/interface.ts)

/**

-    Projection target for platform-specific code generation.
-    Projections consume IR and emit platform code.
-    They are NOT part of runtime semantics.
     _/
     export interface ProjectionTarget {
     /_* Unique identifier (e.g., "nextjs", "hono") */
     readonly name: string;

    /** Human-readable description */

    readonly description: string;

    /**
     * Generate API route handler for an entity.
     *
     * @param ir - Compiled Manifest IR
     * @param entityName - Entity to generate route for
     * @param options - Platform-specific options
     * @returns Generated route code as string
     */
    generateRoute(
      ir: IR,
      entityName: string,
      options?: Record<string, unknown>
    ): string;

    /**
     * Generate TypeScript types from IR.
     * Optional - not all projections need types.
     */
    generateTypes?(ir: IR): string;

    /**
     * Generate client SDK from IR.
     * Optional - not all projections need clients.
     */
    generateClient?(ir: IR): string;

}

2. Registry (src/manifest/projections/registry.ts)

const projections = new Map<string, ProjectionTarget>();

export function registerProjection(projection: ProjectionTarget): void {
if (projections.has(projection.name)) {
throw new Error(`Projection "${projection.name}" already registered`);
}
projections.set(projection.name, projection);
}

export function getProjection(name: string): ProjectionTarget | undefined {
return projections.get(name);
}

export function listProjections(): ProjectionTarget[] {
return Array.from(projections.values());
}

3. Next.js Projection (src/manifest/projections/nextjs/generator.ts)

import type { ProjectionTarget, IR } from '../interface';

export class NextJsProjection implements ProjectionTarget {
readonly name = "nextjs";
readonly description = "Next.js App Router API routes with Prisma";

    generateRoute(ir: IR, entityName: string, options?: Record<string, unknown>): string {
      const entity = ir.entities.find(e => e.name === entityName);
      if (!entity) {
        throw new Error(`Entity "${entityName}" not found in IR`);
      }

      // Your capsule-pro generator logic here
      return `

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { database } from "@/lib/database";
import { manifestSuccessResponse, manifestErrorResponse } from "@/lib/manifest-response";

export async function GET(request: NextRequest) {
const { userId } = await auth();
if (!userId) {
return manifestErrorResponse("Unauthorized", 401);
}

    const userMapping = await database.userTenantMapping.findUnique({
      where: { userId },
    });

    if (!userMapping) {
      return manifestErrorResponse("User not mapped to tenant", 400);
    }

    const { tenantId } = userMapping;

    const ${entityName.toLowerCase()}s = await database.${entityName.toLowerCase()}.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return manifestSuccessResponse({ ${entityName.toLowerCase()}s });

}
`.trim();
}
}

4. CLI Entry Point (bin/generate-projection.ts)

#!/usr/bin/env node

# Usage:

# npx manifest-generate nextjs Recipe recipe.manifest --output route.ts

#!/usr/bin/env node
import { compile } from '../src/manifest/compiler';
import { getProjection, registerProjection } from '../src/manifest/projections/registry';
import { NextJsProjection } from '../src/manifest/projections/nextjs/generator';
import fs from 'fs';

// Register built-in projections
registerProjection(new NextJsProjection());

const [target, entityName, manifestPath, ...args] = process.argv.slice(2);

const outputIndex = args.indexOf('--output');
const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : undefined;

if (!target || !entityName || !manifestPath) {
console.error('Usage: manifest-generate <target> <entity> <manifest-file> --output <path>');
process.exit(1);
}

const projection = getProjection(target);
if (!projection) {
console.error(`Projection "${target}" not found`);
process.exit(1);
}

const source = fs.readFileSync(manifestPath, 'utf-8');
const result = compile(source);

if (result.diagnostics.length > 0) {
console.error('Compilation errors:');
result.diagnostics.forEach(d => console.error(`  ${d.message}`));
process.exit(1);
}

const code = projection.generateRoute(result.ir!, entityName);

if (outputPath) {
fs.writeFileSync(outputPath, code, 'utf-8');
console.log(`Generated ${target} route for ${entityName} → ${outputPath}`);
} else {
console.log(code);
}

5. The Critical Doc (docs/guides/external-projections.md)

# External Projections Pattern

## The Boundary

Manifest defines language semantics. Projections generate platform code.

**Runtime responsibilities:**

- Execute commands with guards (in order, short-circuit on first failure)
- Check policies scoped to `execute` or `all`
- Emit events
- Return deterministic results

**Projection responsibilities:**

- Read IR and emit platform-specific code
- Choose storage strategy (direct DB, adapters, runtime)
- Handle platform concerns (auth, middleware, response format)

## Read vs. Write Strategy

### Reads (GET operations)

**MAY bypass runtime entirely.**

Why: Per `docs/spec/semantics.md`, policies scoped to `read` are NOT enforced by default. Only `execute` and `all` policies apply during command execution.

````typescript
// ✅ Valid - direct Prisma query
const recipes = await database.recipe.findMany({
  where: { tenantId, deletedAt: null }
});

Writes (POST/PUT/DELETE)

MUST use runtime.executeCommand().

Why: Mutations require:
- Guard evaluation (ordered, short-circuit)
- Constraint validation
- Policy checks (execute or all)
- Event emission

// ✅ Valid - runtime enforces semantics
await runtime.executeCommand("Recipe", "create", {
  name: "Pasta Carbonara",
  category: "Italian"
});

Adding Runtime Read APIs

Don't.

If you want a runtime-level query() or get() method, you are defining new execution semantics. That requires:

1. Update docs/spec/semantics.md with read execution order
2. Define policy enforcement behavior for read scope
3. Write conformance tests in src/manifest/conformance/
4. Update all 427 tests

Unless you need language-level read policies, use adapters or go direct to storage.

Adapter Boundary (If Needed)

If projections need shared read logic, extend docs/spec/adapters.md:

interface StorageAdapter<T> {
  // Projections can optionally use these
  findMany(entity: string, filter?: Filter): Promise<T[]>;
  findOne(entity: string, id: string): Promise<T | null>;

  // Runtime uses these (mutations only)
  create(entity: string, data: Partial<T>): Promise<T>;
  update(entity: string, id: string, data: Partial<T>): Promise<T>;
}

This keeps reads at adapter boundary (tooling), not runtime core (semantics).

Reference Implementation

See src/manifest/projections/nextjs/ for a working example.

### 6. Test (`src/manifest/projections/nextjs/generator.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler';
import { NextJsProjection } from './generator';

describe('NextJsProjection', () => {
  const projection = new NextJsProjection();

  it('generates route with direct Prisma query (not runtime.query)', () => {
    const source = `
      entity Recipe {
        property id: string
        property name: string
      }
    `;

    const result = compile(source);
    expect(result.diagnostics).toHaveLength(0);

    const code = projection.generateRoute(result.ir!, 'Recipe');

    // Contract: Must use Prisma directly for reads
    expect(code).toContain('database.recipe.findMany');
    expect(code).not.toContain('runtime.query');
    expect(code).not.toContain('runtime.get');

    // Contract: Must filter by tenant
    expect(code).toContain('tenantId');
    expect(code).toContain('deletedAt: null');
  });

  it('throws if entity not found in IR', () => {
    const source = `entity Recipe { property id: string }`;
    const result = compile(source);

    expect(() => projection.generateRoute(result.ir!, 'NonExistent'))
      .toThrow('Entity "NonExistent" not found');
  });
});

---
Phase 2 Checklist

- Create src/manifest/projections/interface.ts (50 lines)
- Create src/manifest/projections/registry.ts (30 lines)
- Move capsule-pro generator → src/manifest/projections/nextjs/generator.ts
- Add src/manifest/projections/nextjs/generator.test.ts (your smoke test)
- Create bin/generate-projection.ts CLI
- Write docs/guides/external-projections.md (the doc that prevents runtime.query())
- Update README.md to mention projections
- Verify npm test still shows 427/427 passing

Time estimate: ~2 hours (not 2-3 weeks 😉)

This keeps boundaries sharp, prevents future rot, and makes your capsule-pro pattern the blessed approach.

✻ Finagling… (esc to interrupt · running stop hooks… 1/3 · 51s · ↓ 3.1k tokens)

> This is the right shape, and it will absolutely prevent future rot. Also, thank you for writing it like a human who has been harmed by “helpful” abstractions.

Two concrete corrections before you go implement this and accidentally build a nice-looking lie:

Your repo’s README says the conformance suite is “64+ tests,” not “427/427.” If you’re expecting a 427-test blast radius, you’re mixing this with Capsule-Pro’s counts or a different branch. The README also
explicitly frames “Export / Templates” as a consumer of IR alongside Runtime and Conformance, which backs your “projections are tooling, not semantics” boundary. That’s not philosophy, that’s literally the
documented architecture. (Source: `/mnt/data/README.md`.)

Your CLI stub has two `#!/usr/bin/env node` lines, and the block you wrote is half shell comments and half TypeScript. That sounds petty, but it’s exactly how “it looked like it worked” starts again. Make
it one real Node entrypoint (TS compiled to JS in `dist/`, or a TS runner like `tsx`), and keep the usage docs in README, not in a fake shebang sandwich.

Now the implementation-level sanity checks, because this is where things usually go to die quietly:

Your `ProjectionTarget` interface is fine, but don’t type `options?: Record<string, unknown>` unless you actually plan to validate them. Otherwise you just created a dumping ground for “just one more flag”
until the generator becomes an untestable ritual. If options exist, make them per-projection types (even if it’s tiny) so the registry can’t pass garbage. This matches the repo’s “Explicitness” invariant in
spirit, even if you’re implementing it in tooling rather than semantics. (Still grounded in the README’s “Explicitness” and “Spec-first workflow” constraints.)

Your `generateRoute` example hardcodes Clerk auth, a specific Prisma schema (`userTenantMapping`), and response helpers from `@/lib/manifest-response`. That might be correct for Capsule-Pro, but as a
“built-in Next.js projection” it is not portable. If you bake those into `src/manifest/projections/nextjs`, you’re not building a projection system, you’re vendoring Capsule-Pro assumptions into Manifest
core. The fix is simple: make the Next.js projection accept a tiny config object that supplies the auth/tenant lookup strategy and the import paths, and then your smoke test asserts the contract (“no
runtime.query, includes tenantId + deletedAt null filtering”) without forcing Clerk to be “the One True Auth.” The README explicitly treats stores/adapters as pluggable and tooling as separate from runtime
semantics, so keeping the Next.js projection configurable is aligned with the repo’s stated design. (Source: `/mnt/data/README.md` sections on Stores/adapters and architecture.)

Your registry is fine, but add one thing: a “built-ins register” function that registers all bundled projections in one place. Otherwise every CLI and every consumer will “remember” to register Next.js and
then one day won’t, and you’ll be back to silent failure theater. This is the same class of bug as the missing `await` you already fixed: easy to miss, catastrophic to trust.

The doc you proposed (`docs/guides/external-projections.md`) is the most important part of Phase 2. Make it brutally explicit that runtime read APIs are a semantics change and therefore require spec +
conformance updates. That aligns with the repo’s documented “Spec-first workflow” and “Never fix UI by changing semantics.” (Source: `/mnt/data/README.md` “For AI Agents: Critical Constraints” and “Required
Workflow.”)

One more nit that matters: you wrote “compile() returns { ir, diagnostics } and diagnostics length > 0 means errors.” That might be true in your current code, but the README describes compilation as
producing IR + diagnostics and your earlier session used `compileToIR()` specifically. Before you freeze the CLI contract, match it to the actual exported API names and the actual diagnostic severity
handling in your compiler module, or you’ll create a second “looks like it compiled” path. (Source: `/mnt/data/README.md` references `ir-compiler.ts` and the conformance workflow; plus your own summary
about `compileToIR()`.)

Bottom line: yes to the file structure, yes to the interface/registry approach, yes to moving the Next.js generator under projections with a smoke test, and yes to the “external projections” doc as the
anti-rot fence. Just don’t accidentally ship Capsule-Pro-specific auth/schema assumptions as “Manifest’s Next.js projection,” and don’t invent a CLI API shape that doesn’t match the compiler exports you
actually have.

Confidence: 90% — Directly grounded in the repo README’s architecture/invariants and your verified Phase 1 behavior; remaining uncertainty is the exact compiler export names/diagnostics API because only
README is available here, not the full source tree.

````
