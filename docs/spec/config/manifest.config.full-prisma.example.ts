/**
 * FULL-SCOPE Manifest config example — every Prisma + Prisma-store projection
 * option, annotated. This is consumer documentation / a copy-paste starting
 * point, NOT projection source code (the implementation lives in
 * src/manifest/projections/prisma/* and prisma-store/*).
 *
 * A consumer drops a file like this at the repo ROOT as `manifest.config.ts`
 * (sibling of package.json). `manifest config validate` loads it via the same
 * loader as YAML and validates its `build` block against
 * docs/spec/config/manifest.config.schema.json — so every key here is also a
 * documented, validated key. `defineConfig` is an identity helper (autocomplete
 * + type-checking only).
 *
 * NOTE on merge semantics: a TS config's `build.projections` REPLACES the YAML
 * `projections` block wholesale (shallow merge). If you keep a YAML config too,
 * declare ALL projections in one place.
 */
import { defineConfig } from '@angriff36/manifest/config';

export default defineConfig({
  build: {
    // Where .manifest sources are and where compiled IR JSON lands.
    src: 'manifest/source/**/*.manifest',
    output: 'manifest/ir/',

    // Optional path used by property-alignment scans / drift checks.
    prismaSchema: 'packages/database/prisma/schema.prisma',

    // Global identifier casing inherited by projections that map IR names to
    // physical DB names. A per-projection options.naming overrides it.
    naming: 'snake_case',

    projections: {
      // ── Prisma schema projection — emits schema.prisma ──────────────────
      prisma: {
        // Top-level `output` is the DIRECTORY the artifact is written to.
        // generate --all SKIPS any projection without it.
        output: 'packages/database/prisma',
        options: {
          // Filename (pathHint) resolved against the directory above. Keep this
          // a bare filename — putting the full path in both doubles the path.
          output: 'schema.prisma',

          // Datasource provider → emits `datasource db { ... }` + a
          // prisma.config.ts companion. Omit to emit models only.
          provider: 'postgresql',

          // Emitted as `relationMode = "..."`. Use "prisma" for hosts that
          // enforce relations client-side (PlanetScale, pooled Neon). Under
          // "prisma" on Postgres the projection breaks reference cycles with
          // `Restrict` (NoAction is disallowed there).
          relationMode: 'prisma',

          // Env var for the DB URL in the emitted prisma.config.ts companion.
          urlEnvVar: 'DATABASE_URL',

          // `generator client { ... }` fields, emitted verbatim as key = "value"
          // in this order. Default is { provider: "prisma-client-js" }.
          generator: {
            provider: 'prisma-client',
            output: '../generated',
            moduleFormat: 'esm',
            generatedFileExtension: 'ts',
            importFileExtension: 'ts',
          },

          // Identifier casing for THIS projection (overrides global). snake_case
          // shorthand ≡ { table: 'snake_case', column: 'snake_case', pluralizeTables: true }.
          naming: 'snake_case',

          // Auto-emit the inverse relation field on a target for any
          // belongsTo/ref lacking an explicit opposite — removes the need to
          // hand-author inverse hasMany on hub entities. Default false.
          autoBackRelations: true,

          // Multi-schema layout (PostgreSQL / CockroachDB / SQL Server).
          // Per-model resolution: entitySchema[name] → IR module → defaultSchema.
          multiSchema: {
            enabled: true,
            defaultSchema: 'public',
            schemas: ['public', 'tenant_crm', 'tenant_events'],
            entitySchema: {
              Client: 'tenant_crm',
              Event: 'tenant_events',
            },
          },

          // Per-entity physical table name → @@map("..."). Overrides naming.
          tableMappings: {
            Event: 'events',
            OrderLine: 'order_lines',
          },

          // Per-entity, per-property physical column name → @map("..."). Overrides naming.
          columnMappings: {
            Event: { tenantId: 'tenant_id', startsAt: 'starts_at' },
            OrderLine: { unitPrice: 'unit_price' },
          },

          // Per-entity, per-property Decimal precision/scale → @db.Decimal(p, s).
          precision: {
            OrderLine: { unitPrice: { precision: 14, scale: 2 } },
          },

          // Per-entity composite/named indexes → @@index([...]).
          indexes: {
            Event: [
              ['tenantId', 'startsAt'],
              { fields: ['tenantId', 'eventNumber'], name: 'events_tenant_number_idx' },
            ],
          },

          // Per-entity, per-property Prisma scalar override (bypasses the
          // default IR-type → Prisma-type table). Use for bare `number`.
          typeMappings: {
            Event: { eventNumber: 'Int' },
          },

          // Per-entity, per-relationship FK override. String = rename the FK
          // column; object = full fields/references + referential actions.
          foreignKeys: {
            OrderLine: {
              order: {
                fields: ['orderId'],
                references: ['id'],
                onDelete: 'Cascade',
                onUpdate: 'Cascade',
              },
            },
          },

          // Per-entity, per-property native @db.* attribute (without the @db. prefix).
          dbAttributes: {
            Event: { id: 'Uuid', tenantId: 'Uuid', startsAt: 'Timestamptz(6)' },
          },

          // Per-entity, per-property verbatim field attributes (not duplicated
          // if the standard pipeline already emits them).
          fieldAttributes: {
            Event: {
              id: ['@default(dbgenerated("gen_random_uuid()"))'],
              updatedAt: ['@updatedAt'],
            },
          },
        },
      },

      // ── Prisma-store projection — emits store metadata + registry ───────
      // Inherits EVERY prisma option above (provider, naming, multiSchema, …)
      // PLUS the store-owned keys below.
      'prisma-store': {
        output: 'manifest/generated/prisma',
        options: {
          provider: 'postgresql',
          naming: 'snake_case',

          // Per-entity Prisma client delegate override. This is the native way
          // to point an entity at a differently-named client accessor (e.g. when
          // the model identifier and the delegate you call differ). It is the
          // replacement for ad-hoc "entity → model" glue maps.
          accessorNames: {
            OrderLine: 'orderLine',
          },

          // Output filenames for the generated support modules.
          metadataOutput: 'prisma-model-metadata.generated.ts',
          registryOutput: 'prisma-store-registry.generated.ts',

          // Imports baked into the generated registry artifact.
          storeImportPath: '@angriff36/manifest/stores/prisma-generic',
          metadataImportPath: './prisma-model-metadata.generated.js',

          // Status-based soft-delete for entities that don't use a deletedAt
          // timestamp: `field` is the status property, `deletedValue` the sentinel.
          softDelete: {
            Event: { field: 'status', deletedValue: 'cancelled' },
          },
        },
      },
    },
  },
});
