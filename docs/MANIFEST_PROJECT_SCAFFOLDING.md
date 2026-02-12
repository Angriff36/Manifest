# Manifest Project Scaffolding Guide

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Complete guide to scaffolding a full-stack project using Manifest DSL.

---

## Overview

Manifest can generate a complete application structure from declarative `.manifest` files:

**What Manifest generates:**
- IR (Intermediate Representation) - Executable contract
- API routes (Next.js) - Type-safe handlers with auth
- TypeScript types - Entity interfaces
- Client SDKs - Type-safe API clients

**What you provide:**
- Database schema (Prisma)
- Auth configuration (Clerk/NextAuth/custom)
- Response helpers
- Runtime configuration

---

## Prerequisites: Link Manifest Locally

**Manifest is NOT published to npm.** You must link the local package.

### Step 0: Build and Link Manifest

In the Manifest monorepo directory:

```bash
cd /path/to/manifest

# 1. Build distribution files
npm run build:lib

# 2. Create global symlink
npm link
```

In your new project directory:

```bash
# 3. Link Manifest into your project
npm link @manifest/runtime
```

See: [Using Manifest in a New Project](./tools/USING_MANIFEST_IN_NEW_PROJECT.md) for complete linking instructions.

---

## Quick Start: Complete Next.js App

### Step 1: Initialize Project

```bash
# Create Next.js app (if starting fresh)
npx create-next-app@latest my-app --typescript --tailwind --app
cd my-app

# Link Manifest (NOT npm install)
npm link @manifest/runtime
```

**Note**: Skip `npx manifest init` for now - it requires CLI setup. Use manual compilation instead.

### Step 2: Create Your First Manifest

Create `manifest/Recipe.manifest`:

```manifest
entity Recipe {
  property id: string
  property name: string
  property category: string?
  property ingredients: string[]
  property instructions: string
  property createdAt: timestamp
  property updatedAt: timestamp
  property tenantId: string
  property deletedAt: timestamp?

  command create(name: string, category: string?, ingredients: string[], instructions: string) {
    guard name is not empty
    guard ingredients.length > 0
    guard instructions is not empty

    mutate this.name = name
    mutate this.category = category
    mutate this.ingredients = ingredients
    mutate this.instructions = instructions
    mutate this.createdAt = now()
    mutate this.updatedAt = now()
    mutate this.tenantId = user.tenantId
  }

  command update(name: string, category: string?, ingredients: string[], instructions: string) {
    guard this.id is not empty
    guard name is not empty

    mutate this.name = name
    mutate this.category = category
    mutate this.ingredients = ingredients
    mutate this.instructions = instructions
    mutate this.updatedAt = now()
  }

  command delete() {
    guard this.id is not empty
    guard this.deletedAt is empty

    mutate this.deletedAt = now()
  }

  policy canRead read: true
  policy canWrite execute: user.id == this.tenantId or user.role == "admin"
}

event RecipeCreated {
  recipeId: string
  name: string
  category: string?
  tenantId: string
}
```

### Step 3: Set Up Database (Prisma)

**Note**: Prisma 7+ changed how database URLs are configured. See [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7).

Install Prisma:

```bash
# For Prisma 7+ (new format)
npm install prisma@latest @prisma/client@latest

# Or pin to Prisma 6 (old format with url in schema)
npm install prisma@^6 @prisma/client@^6

npx prisma init
```

Create `prisma/schema.prisma`:

**For Prisma 7+:**

```prisma
datasource db {
  provider = "postgresql"
  // Note: url is now configured in prisma.config.ts, not here
}

generator client {
  provider = "prisma-client-js"
}

// User-tenant mapping for multi-tenancy
model UserTenantMapping {
  id        String   @id @default(uuid())
  userId    String   @unique
  tenantId  String
  user      User     @relation(fields: [userId], references: [id])
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Tenant {
  id       String               @id @default(uuid())
  name     String
  users    UserTenantMapping[]
  recipes  Recipe[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model User {
  id              String              @id @default(uuid())
  email           String              @unique
  name            String?
  role            String              @default("user")
  tenantMappings  UserTenantMapping[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model Recipe {
  id           String    @id @default(uuid())
  name         String
  category     String?
  ingredients  String[]
  instructions String
  tenantId     String
  tenant       Tenant    @relation(fields: [tenantId], references: [id])
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  @@index([tenantId, deletedAt])
}
```

**For Prisma 7+**, also create `prisma/prisma.config.ts`:

```typescript
// prisma.config.ts - Prisma 7+ configuration
import { defineConfig } from '@prisma/photon' || {};

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasourceUrl: process.env.DATABASE_URL,
});
```

Set your database URL in `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
```

Generate Prisma client:

```bash
npx prisma generate
```

### Step 4: Create Database Client

Create `lib/database.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const database = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = database;
```

### Step 5: Set Up Auth (Clerk Example)

Install Clerk:

```bash
npm install @clerk/nextjs
```

Create `lib/auth.ts`:

```typescript
import { auth } from '@clerk/nextjs';

export async function getCurrentUser() {
  const { userId } = await auth();
  return userId ?? null;
}

export { auth };
```

### Step 6: Create Response Helpers

Create `lib/manifest-response.ts`:

```typescript
import { NextResponse } from 'next/server';

export function manifestSuccessResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function manifestErrorResponse(
  message: string | { message?: string; diagnostics?: unknown[] },
  status = 400
) {
  const body = typeof message === 'string' ? { error: message } : message;
  return NextResponse.json(body, { status });
}
```

### Step 7: Compile Manifest to IR

```bash
# Compile single file
npx manifest compile manifest/Recipe.manifest -o ir/Recipe.ir.json

# Or compile all manifest files
npx manifest compile
```

### Step 8: Generate API Routes

```bash
# Generate all routes for Recipe entity
npx manifest generate ir -o app/api/generated --surface route --entity Recipe

# Generate command routes (POST endpoints)
npx manifest generate ir -o app/api/generated --surface command --entity Recipe

# Generate TypeScript types
npx manifest generate ir -o lib/types --surface types

# Generate client SDK
npx manifest generate ir -o lib/client --surface client

# Or generate everything at once
npx manifest generate ir -o app/api/generated --surface all
```

### Step 9: Use in Your App

Create `app/page.tsx`:

```typescript
import { database } from '@/lib/database';
import { auth } from '@/lib/auth';

export default async function HomePage() {
  const { userId } = await auth();
  const recipes = userId
    ? await database.recipe.findMany({
        where: {
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return (
    <main>
      <h1>Recipes</h1>
      <ul>
        {recipes.map((recipe) => (
          <li key={recipe.id}>{recipe.name}</li>
        ))}
      </ul>
    </main>
  );
}
```

---

## Complete File Structure

After scaffolding, your project structure should look like:

```
my-app/
├── manifest/
│   └── Recipe.manifest          # Your Manifest source
├── ir/
│   └── Recipe.ir.json            # Compiled IR
├── app/
│   ├── api/
│   │   └── generated/           # Generated API routes
│   │       ├── recipes/
│   │       │   └── route.ts     # GET /api/generated/recipes
│   │       └── recipes/
│   │           └── create/
│   │               └── route.ts # POST /api/generated/recipes/create
│   └── page.tsx
├── lib/
│   ├── database.ts               # Prisma client
│   ├── auth.ts                   # Auth utilities
│   ├── manifest-response.ts     # Response helpers
│   ├── types/                    # Generated TypeScript types
│   │   └── recipe.ts
│   └── client/                   # Generated client SDK
│       └── recipe.ts
├── prisma/
│   ├── schema.prisma             # Your database schema
│   └── dev.db                    # SQLite (or PostgreSQL connection)
├── manifest.config.yaml          # Manifest configuration
├── package.json
└── tsconfig.json
```

---

## Manual Route Generation (Alternative)

If you prefer more control, generate routes manually:

```typescript
import { compileToIR } from '@manifest/runtime/ir-compiler';
import { NextJsProjection } from '@manifest/runtime/projections/nextjs';
import fs from 'fs/promises';
import path from 'path';

// 1. Read your manifest source
const source = await fs.readFile('manifest/Recipe.manifest', 'utf-8');

// 2. Compile to IR
const { ir, diagnostics } = await compileToIR(source);
if (diagnostics.some(d => d.severity === 'error')) {
  console.error('Compilation errors:', diagnostics);
  process.exit(1);
}

// 3. Create projection with options
const projection = new NextJsProjection();

// 4. Generate GET route
const routeCode = projection.generate(ir, 'Recipe', {
  surface: 'nextjs.route',
  authProvider: 'clerk',
  databaseImportPath: '@/lib/database',
  responseImportPath: '@/lib/manifest-response',
  includeTenantFilter: true,
  includeSoftDeleteFilter: true,
});

// 5. Write to file
await fs.writeFile(
  'app/api/recipes/route.ts',
  routeCode.artifacts[0].code,
  'utf-8'
);
```

---

## Multi-Entity Project

For projects with multiple entities, organize like this:

```
manifest/
├── entities/
│   ├── User.manifest
│   ├── Recipe.manifest
│   └── Ingredient.manifest
├── commands/
│   ├── recipe/
│   │   ├── create.manifest
│   │   └── update.manifest
│   └── ingredient/
│       └── create.manifest
└── events/
    └── RecipeEvents.manifest
```

Compile all at once:

```bash
npx manifest compile "manifest/**/*.manifest" -o ir/
```

---

## Development Workflow

### Watch Mode (Manual)

For development, use a file watcher to recompile:

```bash
# Install nodemon (or similar)
npm install -D nodemon

# Run in watch mode
npx nodemon --watch manifest --ext manifest --exec "npx manifest compile && npx manifest generate ir -o app/api/generated"
```

### Validation

Validate your manifest files before compiling:

```bash
npx manifest validate manifest/Recipe.manifest
```

### Check IR

Inspect generated IR:

```bash
npx manifest compile manifest/Recipe.manifest -o - | jq .
```

---

## Production Deployment

### Environment Variables

```env
# .env.production
DATABASE_URL=postgresql://user:password@host:5432/dbname
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### Build Process

Add to `package.json`:

```json
{
  "scripts": {
    "manifest:build": "npx manifest compile && npx manifest generate ir -o app/api/generated --surface all",
    "build": "npm run manifest:build && next build",
    "dev": "npm run manifest:build && next dev"
  }
}
```

---

## Troubleshooting

### "Entity not found in IR"

Ensure the entity name in `projection.generate()` matches the entity name in your manifest exactly (case-sensitive).

### "Cannot find module '@/lib/database'"

Create the missing file or update the import path in the projection options.

### Generated routes don't work

1. Verify IR is valid: `npx manifest validate manifest/Recipe.manifest`
2. Check auth configuration
3. Ensure database schema matches entity properties

### Multi-tenancy not working

Ensure:
1. `tenantId` property exists on your entity
2. `includeTenantFilter: true` in projection options
3. User-tenant mapping exists in database

---

## Next Steps

- **Advanced Features**: See `docs/spec/manifest-vnext.md` for vNext features
- **Projections**: See `docs/patterns/external-projections.md`
- **Custom Stores**: See `docs/patterns/implementing-custom-stores.md`
- **Embedded Runtime**: See `docs/patterns/embedded-runtime-pattern.md`

---

## Missing Functionality (TODOs)

The following functionality would enable complete project scaffolding:

1. **`manifest create` command** - Scaffolds entire project structure
   - Creates directory structure
   - Generates Prisma schema from entities
   - Creates auth setup files
   - Generates example manifest files

2. **`manifest new entity` command** - Generates entity template
   - Creates `.manifest` file with boilerplate
   - Adds common properties (id, timestamps)
   - Generates CRUD commands

3. **Database schema generation** - Reverse from IR to Prisma
   - Auto-generate `schema.prisma` from IR entities
   - Include relationships and indexes
   - Map IR types to Prisma types

4. **Template system** - Project templates
   - `--template nextjs` - Full Next.js app
   - `--template express` - Express API
   - `--template standalone` - Runtime-only

5. **Middleware generation** - Auth middleware
   - Generate auth wrappers automatically
   - Support for Clerk, NextAuth, Lucia
   - Policy enforcement middleware

See `IMPLEMENTATION_PLAN.md` for tracking these features.
