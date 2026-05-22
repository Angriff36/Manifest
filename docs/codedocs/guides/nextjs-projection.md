---
title: "Next.js Projection"
description: "Generate Next.js route handlers, a dispatcher, types, and client helpers from compiled Manifest IR."
---

Use this guide when you want Manifest to generate App Router artifacts from IR while keeping write semantics anchored to the runtime.

## Problem

Handwritten route handlers drift easily. Reads and writes get mixed together, import paths become inconsistent across apps, and transport routes stop matching the domain contract represented by your Manifest source.

## Solution

Compile source to IR, pass the IR to `NextJsProjection`, and write the generated artifacts into your Next.js app. For CLI-driven projects, the same flow is available through `@manifest/cli`.

<Steps>
<Step>
### Compile a Manifest module to IR

```ts
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const source = `
entity Recipe {
  property required id: string
  property required name: string
  property tenantId: string
  property deletedAt: string?

  command publish() {
    guard self.deletedAt == null
    emit recipePublished
  }
}

store Recipe in memory

event recipePublished: "recipes.published" {
  id: string
}
`;

const { ir, diagnostics } = await compileToIR(source);
if (!ir || diagnostics.some((d) => d.severity === 'error')) {
  throw new Error(JSON.stringify(diagnostics, null, 2));
}
```

</Step>
<Step>
### Generate the dispatcher and type artifacts

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NextJsProjection } from '@angriff36/manifest/projections/nextjs';

const projection = new NextJsProjection();

const dispatcher = projection.generate(ir, {
  surface: 'nextjs.dispatcher',
  options: {
    authProvider: 'clerk',
    authImportPath: '@repo/auth/server',
    databaseImportPath: '@repo/database',
    runtimeImportPath: '@repo/manifest/runtime',
    responseImportPath: '@/lib/manifest-response',
    includeTenantFilter: true,
    includeSoftDeleteFilter: true,
  },
});

const types = projection.generate(ir, {
  surface: 'ts.types',
});

for (const artifact of [...dispatcher.artifacts, ...types.artifacts]) {
  const path = join(process.cwd(), artifact.pathHint!);
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, artifact.code, 'utf8');
}
```

</Step>
<Step>
### Generate entity read and command routes

```ts
const listRoute = projection.generate(ir, {
  surface: 'nextjs.route',
  entity: 'Recipe',
  options: {
    authProvider: 'clerk',
    databaseImportPath: '@repo/database',
  },
});

const commandRoute = projection.generate(ir, {
  surface: 'nextjs.command',
  entity: 'Recipe',
  command: 'publish',
  options: {
    authProvider: 'clerk',
    runtimeImportPath: '@repo/manifest/runtime',
    responseImportPath: '@/lib/manifest-response',
  },
});

console.log(listRoute.artifacts[0].pathHint);
console.log(commandRoute.artifacts[0].pathHint);
```

</Step>
</Steps>

You can run the same workflow through the CLI:

<Tabs items={["CLI", "API"]}>
<Tab value="CLI">

```bash
npm install -D @manifest/cli

manifest compile modules/recipe.manifest --output ir/
manifest generate ir/recipe.ir.json --projection nextjs --surface all --output apps/api/app/api/
```

</Tab>
<Tab value="API">

```ts
import { NextJsProjection } from '@angriff36/manifest/projections/nextjs';

const projection = new NextJsProjection();
const result = projection.generate(ir, {
  surface: 'nextjs.dispatcher',
  options: {
    authProvider: 'nextauth',
    runtimeImportPath: '@/lib/manifest-runtime',
    responseImportPath: '@/lib/manifest-response',
  },
});
```

</Tab>
</Tabs>

Real-world pattern:

- Use `nextjs.dispatcher` as the canonical write surface.
- Use `nextjs.route` and `nextjs.detail` for read endpoints when direct storage queries are acceptable.
- Use `ts.types` in shared code and `ts.client` in frontend clients that need generated fetch helpers.

The source reinforces that split. `src/manifest/projections/nextjs/generator.ts` exposes separate surfaces for read routes, command routes, a dispatcher, generated types, and generated client helpers. The CLI in `packages/cli/src/commands/generate.ts` automates generation for those surfaces, but it still uses the same projection class under the hood.
