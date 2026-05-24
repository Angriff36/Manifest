/**
 * @manifest/projection-prisma — generic-fixture tests.
 *
 * EVERY fixture here is generic by construction. No real-app entity, table,
 * tenant, or column name appears in this file. That is the evidence that the
 * package carries no app-specific knowledge (Phase 3 constraint, Checkpoint 1).
 *
 * Fixtures are hand-built IR object literals so the projection's true input
 * contract is exercised in isolation — there is no dependency on the main
 * package's compiler or runtime for these tests to run.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRStore } from '@angriff36/manifest/ir';
import { PrismaProjection } from './generator.js';

// ---------------------------------------------------------------------------
// Generic-fixture builders. All names are deliberately abstract.
// ---------------------------------------------------------------------------

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-fixture-hash',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    entities: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

function widgetEntity(): IREntity {
  // Generic-fixture shape derived from the design brief's `Widget`. The brief's
  // example used `property qty: number` — we now use `int` because bare `number`
  // is intentionally ambiguous (and triggers a PRISMA_AMBIGUOUS_NUMBER diagnostic
  // by design, see the dedicated test). `int` is the precise type for a count.
  // Plus an id property so the model is a valid Prisma model.
  return {
    name: 'Widget',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'qty', type: { name: 'int', nullable: false }, modifiers: [] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function durableStore(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}

function memoryStore(entityName: string): IRStore {
  return { entity: entityName, target: 'memory', config: {} };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaProjection — projection target metadata', () => {
  it('declares the expected name, description and surfaces', () => {
    const p = new PrismaProjection();
    expect(p.name).toBe('prisma');
    expect(p.surfaces).toEqual(['prisma.schema']);
    // Description should not name any specific app or backend version.
    expect(p.description).toMatch(/Prisma/);
    expect(p.description).toMatch(/Manifest IR/);
  });

  it('rejects unknown surfaces with a structured diagnostic', () => {
    const p = new PrismaProjection();
    const result = p.generate(emptyIR(), { surface: 'prisma.unknown' });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

describe('PrismaProjection — generic fixture (Widget)', () => {
  it('emits a Prisma model for a durable entity with id, required name, and optional qty', () => {
    // This is the headline Phase 3 evidence: a generic Widget entity with the
    // shape from the design brief flows through the projection and produces a
    // recognisable Prisma model. The string match below is what proves the
    // pipeline works end-to-end without any app coupling.
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0];
    expect(artifact.id).toBe('prisma.schema');
    expect(artifact.pathHint).toBe('schema.prisma');
    expect(artifact.contentType).toBe('prisma');

    const code = artifact.code;
    // Model declaration
    expect(code).toMatch(/model Widget \{/);
    // id is non-null, marked @id
    expect(code).toMatch(/^\s+id String @id$/m);
    // required field → non-null
    expect(code).toMatch(/^\s+name String$/m);
    // unrequired field → nullable (suffixed `?`).
    // `int` resolves to `Int` via DEFAULT_TYPE_MAPPING — the precise integer type.
    expect(code).toMatch(/^\s+qty Int\?$/m);
    // Closing brace
    expect(code).toMatch(/^\}$/m);

    // No PRISMA_UNKNOWN_TYPE diagnostics on a clean fixture.
    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });

  it('applies tableMappings, columnMappings, precision, indexes, typeMappings through config (NO dotted-string keys)', () => {
    // This test is the consumer-facing config-shape evidence. Every option
    // uses the locked nested Record<EntityName, Record<PropertyName, ...>>
    // form. If anyone ever tries to add dotted-string keys, this test must
    // be the first thing they fail.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'sku', type: { name: 'string', nullable: false }, modifiers: ['required', 'unique'] },
        { name: 'qty', type: { name: 'number', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        tableMappings: { Widget: 'widgets' },
        columnMappings: { Widget: { createdAt: 'created_at' } },
        // Nested shape (Checkpoint 1 amendment): NOT "Widget.price".
        precision: { Widget: { price: { precision: 12, scale: 2 } } },
        indexes: { Widget: [['sku', 'createdAt'], { fields: ['qty'], name: 'widget_qty_idx' }] },
        // Override the default number → Float to Int for qty (per-property,
        // nested form).
        typeMappings: { Widget: { qty: 'Int' } },
      },
    });

    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;

    // datasource block was emitted because provider was set.
    expect(code).toMatch(/datasource db \{/);
    expect(code).toMatch(/provider = "postgresql"/);

    // Property-level expectations.
    expect(code).toMatch(/^\s+sku String @unique$/m);
    expect(code).toMatch(/^\s+qty Int$/m); // overridden via typeMappings
    expect(code).toMatch(/^\s+price Decimal @db\.Decimal\(12, 2\)$/m);
    expect(code).toMatch(/^\s+createdAt DateTime @map\("created_at"\)$/m);

    // Model-level @@map and @@index attributes.
    expect(code).toMatch(/^\s+@@map\("widgets"\)$/m);
    expect(code).toMatch(/^\s+@@index\(\[sku, createdAt\]\)$/m);
    expect(code).toMatch(/^\s+@@index\(\[qty\], name: "widget_qty_idx"\)$/m);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('preserves IR source order — does NOT re-sort entities (Checkpoint 1)', () => {
    const ir = emptyIR();
    const beta: IREntity = {
      name: 'Beta',
      properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] }],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    };
    const alpha: IREntity = {
      name: 'Alpha',
      properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] }],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    };
    ir.entities.push(beta, alpha);
    ir.stores.push(durableStore('Beta'), durableStore('Alpha'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;
    const betaPos = code.indexOf('model Beta {');
    const alphaPos = code.indexOf('model Alpha {');
    expect(betaPos).toBeGreaterThan(-1);
    expect(alphaPos).toBeGreaterThan(-1);
    expect(betaPos).toBeLessThan(alphaPos);
  });
});

describe('PrismaProjection — skipping rules', () => {
  it('skips entities with store target `memory`', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(memoryStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.artifacts[0].code).not.toMatch(/model Widget/);
    const skip = result.diagnostics.find((d) => d.code === 'PRISMA_SKIPPED_NON_DURABLE');
    expect(skip).toBeDefined();
    expect(skip?.entity).toBe('Widget');
  });

  it('skips entities marked `external: true` even when a durable store is declared', () => {
    const ir = emptyIR();
    ir.entities.push({ ...widgetEntity(), external: true });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.artifacts[0].code).not.toMatch(/model Widget/);
    const skip = result.diagnostics.find((d) => d.code === 'PRISMA_SKIPPED_EXTERNAL');
    expect(skip).toBeDefined();
    expect(skip?.entity).toBe('Widget');
  });

  it('skips entities with no store declaration', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    // Note: no store pushed.

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.artifacts[0].code).not.toMatch(/model Widget/);
    const skip = result.diagnostics.find((d) => d.code === 'PRISMA_SKIPPED_NO_STORE');
    expect(skip).toBeDefined();
  });

  it('NEVER iterates computedProperties (structural invariant)', () => {
    // The projection iterates `entity.properties` only. Even if a computed
    // property has the same name as a stored property, it must never become
    // a column. This is the structural guarantee from Checkpoint 1.
    //
    // `price: money` is used here intentionally — it's the precise type for
    // currency, exercises the Decimal+default-precision path, and avoids
    // the bare-`number` diagnostic that would otherwise fire.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [
        // A computed "total" derived from price. MUST NOT become a column.
        {
          name: 'total',
          type: { name: 'money', nullable: false },
          expression: { kind: 'identifier', name: 'price' },
          dependencies: ['price'],
        },
      ],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    // `money` → Prisma `Decimal`, with the default precision/scale applied
    // because no `precision` config entry was supplied. This is the explicit
    // money-handling default the user signed off on (replaces the previous
    // silent number→Float behavior).
    expect(code).toMatch(/^\s+price Decimal @db\.Decimal\(12, 2\)$/m);
    // The computed name "total" must NOT appear as a column line.
    expect(code).not.toMatch(/^\s+total /m);
  });
});

describe('PrismaProjection — `money` / `decimal` types and default precision', () => {
  it('maps `money` to Prisma `Decimal` with default precision @db.Decimal(12, 2)', () => {
    // `money` is a first-class Manifest type (added at user direction after
    // Checkpoint 3). It maps to Prisma `Decimal` and picks up a deterministic
    // default precision so authors do NOT have to remember to configure
    // precision on every currency field. This is the safe-by-default
    // alternative to silently mapping bare `number` to `Float`.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'unitCost', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    // Decimal scalar + default precision/scale, no consumer config supplied.
    expect(code).toMatch(/^\s+unitCost Decimal @db\.Decimal\(12, 2\)$/m);
  });

  it('maps `decimal` to Prisma `Decimal` with the same default precision', () => {
    // `decimal` and `money` are intentionally aliased on the Prisma side — both
    // are exact-decimal types. The distinction is editorial in `.manifest`
    // source (currency vs. generic exact decimal); the projection treats them
    // identically. Consumers needing different precision per field use config.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'ratio', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(/^\s+ratio Decimal @db\.Decimal\(12, 2\)$/m);
  });

  it('lets the consumer override the default precision per-property without changing the type', () => {
    // The default `(12, 2)` is the floor, not the ceiling. Consumers needing
    // higher scale (e.g. exchange-rate or scientific decimals) supply the
    // existing `precision` projection option — nested-key shape, no dotted
    // strings, locked at Checkpoint 1.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'fxRate', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { precision: { Widget: { fxRate: { precision: 18, scale: 8 } } } },
    }).artifacts[0].code;

    // Consumer-supplied precision wins over the default.
    expect(code).toMatch(/^\s+fxRate Decimal @db\.Decimal\(18, 8\)$/m);
    // Crucially: no double-attribute, no fallback default re-applied.
    expect(code).not.toMatch(/@db\.Decimal\(12, 2\)/);
  });

  it('applies default precision to ANY property whose resolved scalar is Decimal (override via typeMappings still works)', () => {
    // A property typed `string` whose typeMappings override routes it to
    // `Decimal` should pick up the default precision too — the rule is keyed
    // on resolved scalar, not on the IR type.name. This keeps the behavior
    // consistent regardless of whether the Decimal-ness was declared in
    // .manifest or in projection config.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        // Authored as `string` but the consumer wants Decimal storage. This is
        // an unusual pattern but the rule must still hold.
        { name: 'externalAmount', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { typeMappings: { Widget: { externalAmount: 'Decimal' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+externalAmount Decimal @db\.Decimal\(12, 2\)$/m);
  });
});

describe('PrismaProjection — bare `number` is ambiguous (PRISMA_AMBIGUOUS_NUMBER)', () => {
  it('emits PRISMA_AMBIGUOUS_NUMBER and skips the column for a bare `number` property with no override', () => {
    // Loud at compile time beats silent in production. A property typed only
    // `number` with no override carries no precision intent — Manifest does
    // not distinguish int from float from money. The projection refuses to
    // guess and emits a structured diagnostic instead. This replaces the
    // previous silent `number → Float` mapping.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        // Bare `number` — no override, no replacement type. MUST diagnose.
        { name: 'qty', type: { name: 'number', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('PRISMA_AMBIGUOUS_NUMBER');
    expect(errs[0].entity).toBe('Widget');
    // Message must list the precise alternatives so the author can fix it without docs.
    expect(errs[0].message).toMatch(/Widget\.qty/);
    expect(errs[0].message).toMatch(/'int'/);
    expect(errs[0].message).toMatch(/'bigint'/);
    expect(errs[0].message).toMatch(/'float'/);
    expect(errs[0].message).toMatch(/'money'/);
    expect(errs[0].message).toMatch(/'decimal'/);
    expect(errs[0].message).toMatch(/typeMappings\.Widget\.qty/);

    // The ambiguous property is skipped (no column emitted). The rest of the
    // model still emits — consumer sees the partial schema plus the diagnostic.
    const code = result.artifacts[0].code;
    expect(code).toMatch(/^\s+id String @id$/m);
    expect(code).not.toMatch(/^\s+qty /m);
  });

  it('resolves cleanly when the author picks a precise type (`int`, `float`, `money`)', () => {
    // Inverse of the diagnostic test: same logical entity, but each numeric
    // field carries an explicit precise type. No diagnostic, all columns emit.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'qty', type: { name: 'int', nullable: false }, modifiers: ['required'] },
        { name: 'temperature', type: { name: 'float', nullable: false }, modifiers: ['required'] },
        { name: 'unitCost', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);

    const code = result.artifacts[0].code;
    expect(code).toMatch(/^\s+qty Int$/m);
    expect(code).toMatch(/^\s+temperature Float$/m);
    expect(code).toMatch(/^\s+unitCost Decimal @db\.Decimal\(12, 2\)$/m);
  });

  it('still permits bare `number` IF the consumer supplies a typeMappings override (escape hatch)', () => {
    // The override path is the documented escape hatch. Consumers who genuinely
    // know what they want — for example, mapping an existing `number` field to
    // BigInt for migration reasons — bypass the diagnostic by being explicit.
    // No silent rounding because the override is in source-controlled config.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'legacyCount', type: { name: 'number', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { typeMappings: { Widget: { legacyCount: 'BigInt' } } },
    });

    // No PRISMA_AMBIGUOUS_NUMBER because the override expressed intent.
    expect(result.diagnostics.filter((d) => d.code === 'PRISMA_AMBIGUOUS_NUMBER')).toHaveLength(0);
    expect(result.artifacts[0].code).toMatch(/^\s+legacyCount BigInt$/m);
  });
});

describe('PrismaProjection — diagnostic for unmappable type.name', () => {
  it('emits PRISMA_UNKNOWN_TYPE when a property type has no default mapping and no override', () => {
    // This is the explicit Phase 3 deliverable: a hard diagnostic when the
    // projection cannot resolve a Prisma type for an IR type.name.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        // 'currency' is NOT in DEFAULT_TYPE_MAPPING and no typeMappings entry
        // is supplied for it — must produce a diagnostic.
        { name: 'amount', type: { name: 'currency', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('PRISMA_UNKNOWN_TYPE');
    expect(errs[0].entity).toBe('Widget');
    expect(errs[0].message).toMatch(/Widget\.amount/);
    expect(errs[0].message).toMatch(/currency/);
    expect(errs[0].message).toMatch(/typeMappings/);

    // The unmappable property is skipped (no column emitted) but the rest of
    // the model still emits — the consumer sees both the partial model and
    // the diagnostic and can decide how to react.
    const code = result.artifacts[0].code;
    expect(code).toMatch(/^\s+id String @id$/m);
    expect(code).not.toMatch(/^\s+amount /m);
  });

  it('resolves unmappable types when consumer supplies a `typeMappings` override', () => {
    // Inverse: same IR shape as above, but the consumer supplies the override.
    // No diagnostic, and the column is emitted using the override.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'amount', type: { name: 'currency', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { typeMappings: { Widget: { amount: 'Decimal' } } },
    });

    expect(result.diagnostics.filter((d) => d.code === 'PRISMA_UNKNOWN_TYPE')).toHaveLength(0);
    // Default precision applies because the resolved scalar is `Decimal` and no
    // `precision` config was supplied. This rule (introduced with the money
    // type at user direction post-Checkpoint 3) is keyed on resolved scalar,
    // not on the IR type.name — so even `currency` routed-via-override to
    // `Decimal` picks up the precision floor.
    expect(result.artifacts[0].code).toMatch(/^\s+amount Decimal @db\.Decimal\(12, 2\)$/m);
  });
});

describe('PrismaProjection — app-agnostic invariant', () => {
  it('emits a usable Prisma schema with ZERO app/domain identifiers in the projection source', () => {
    // The projection's own source must not name any real app entity, table,
    // tenant, column, or domain term. This test scans the *output* of the
    // projection on the headline generic fixture and asserts that no token
    // we would consider domain-specific leaked in from defaults.
    //
    // The legitimate tokens are: model / id / String / DateTime / Float / Int /
    // Boolean / @id / @unique / @default / @map / @@map / @@index / @db.Decimal /
    // datasource / generator / provider / env / DATABASE_URL / prisma-client-js
    // — every one of these is Prisma syntax, not application content.
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql' },
    }).artifacts[0].code;

    // None of these app-specific tokens should ever appear by default.
    const forbidden = [
      'tenantId', 'deletedAt', 'organization', 'userTenantMapping',
      'auth', 'clerk', 'supabase_user', 'tenant_id',
    ];
    for (const token of forbidden) {
      expect(code).not.toContain(token);
    }
  });
});

// ---------------------------------------------------------------------------
// Relationship-wiring tests (Step 3)
//
// These exercise the real @relation emission. Fixtures use abstract names
// (Author/Book/Profile/Tag) deliberately — no real-app entity appears.
// ---------------------------------------------------------------------------

/** Helper: a minimal entity with just an `id: string` property. */
function bareEntity(
  name: string,
  extras: { properties?: IREntity['properties']; relationships?: IREntity['relationships'] } = {},
): IREntity {
  return {
    name,
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ...(extras.properties ?? []),
    ],
    computedProperties: [],
    relationships: extras.relationships ?? [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

describe('PrismaProjection — relationship wiring (Step 3)', () => {
  it('emits a working one-to-many: hasMany on parent, belongsTo+FK on child', () => {
    // The canonical 1:N. Author has many Books; each Book belongs to one Author.
    // Both sides declared in IR; projection emits proper @relation on the child
    // and the back-side list on the parent. Prisma will accept this as-is.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;

    // Parent side: list of books.
    expect(code).toMatch(/model Author \{[\s\S]*?\n\s+books Book\[\][\s\S]*?\n\}/);
    // Child side: FK column + relation field with @relation.
    expect(code).toMatch(/^\s+authorId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[authorId\], references: \[id\]\)$/m);

    // FK is NOT @unique on 1:N — Prisma would otherwise interpret it as 1:1.
    const authorIdLine = code.split('\n').find((l) => /^\s+authorId String/.test(l));
    expect(authorIdLine).not.toMatch(/@unique/);

    // No PRISMA_RELATION_UNIMPLEMENTED, no missing-backside warnings.
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_UNIMPLEMENTED')).toBeUndefined();
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE')).toBeUndefined();
  });

  it('emits a working one-to-one: hasOne on parent, belongsTo+@unique FK on child', () => {
    // The canonical 1:1. User has one Profile; the FK on Profile must be @unique
    // for Prisma to recognise the relation as 1:1 rather than 1:N. The projection
    // detects this by inspecting the opposite side (target's hasOne pointing back).
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('User', {
        relationships: [{ name: 'profile', kind: 'hasOne', target: 'Profile' }],
      }),
      bareEntity('Profile', {
        relationships: [{ name: 'user', kind: 'belongsTo', target: 'User' }],
      }),
    );
    ir.stores.push(durableStore('User'), durableStore('Profile'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    // Parent side: nullable single Profile.
    expect(code).toMatch(/^\s+profile Profile\?$/m);
    // Child side: @unique on the FK column makes Prisma treat this as 1:1.
    expect(code).toMatch(/^\s+userId String @unique$/m);
    expect(code).toMatch(/^\s+user User @relation\(fields: \[userId\], references: \[id\]\)$/m);
  });

  it("emits a `ref` relationship like belongsTo, but does NOT warn about missing back-relation", () => {
    // `ref` is the "loose" relation kind — the author explicitly signals
    // "no back-relation expected on the target". The projection still emits
    // the FK + @relation but does NOT raise PRISMA_RELATION_MISSING_BACKSIDE.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Event', {
        relationships: [{ name: 'createdBy', kind: 'ref', target: 'Actor' }],
      }),
      bareEntity('Actor'),
    );
    ir.stores.push(durableStore('Event'), durableStore('Actor'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;

    // Same emission shape as belongsTo.
    expect(code).toMatch(/^\s+createdById String$/m);
    expect(code).toMatch(/^\s+createdBy Actor @relation\(fields: \[createdById\], references: \[id\]\)$/m);
    // But explicitly no missing-backside warning — `ref` opts out of that check.
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE')).toBeUndefined();
  });

  it("uses IR's `foreignKey` annotation when present", () => {
    // Authors can rename the FK field at .manifest source level via the
    // existing IR `foreignKey` annotation. The projection respects it.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          { name: 'author', kind: 'belongsTo', target: 'Author', foreignKey: 'writerId' },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(/^\s+writerId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[writerId\], references: \[id\]\)$/m);
    // The default name `authorId` must NOT also appear.
    expect(code).not.toMatch(/^\s+authorId /m);
  });

  it("respects the `foreignKeys` projection-config override (nested-key shape, no dotted strings)", () => {
    // Same FK rename via projection config — consumer-side override without
    // editing .manifest source. Nested form per the locked option shape.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { foreignKeys: { Book: { author: 'writerId' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+writerId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[writerId\], references: \[id\]\)$/m);
  });

  it("config `foreignKeys` wins over IR's `foreignKey` (consumer override is authoritative)", () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          // IR says `irFkName`; projection config overrides to `configFkName`.
          { name: 'author', kind: 'belongsTo', target: 'Author', foreignKey: 'irFkName' },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { foreignKeys: { Book: { author: 'configFkName' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+configFkName String$/m);
    expect(code).not.toMatch(/irFkName/);
  });

  it("FK column accepts `columnMappings` for snake_case @map (FK is a virtual property)", () => {
    // FK fields are emitted by the projection, not declared in IR. They still
    // honour columnMappings so a consumer can route them to snake_case DB columns.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { columnMappings: { Book: { authorId: 'author_id' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+authorId String @map\("author_id"\)$/m);
  });

  it("FK type follows the target's `id` property type (Int target → Int FK)", () => {
    // The FK type defaults to whatever the target's `id` resolves to, so a
    // BigInt or Int PK doesn't get a type-mismatched String FK.
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Author',
        properties: [{ name: 'id', type: { name: 'int', nullable: false }, modifiers: ['required'] }],
        computedProperties: [],
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
        commands: [], constraints: [], policies: [],
      },
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    // Parent PK is Int → child FK is Int (not String).
    expect(code).toMatch(/^\s+authorId Int$/m);
    expect(code).toMatch(/model Author \{[\s\S]*?id Int @id/);
  });
});

describe('PrismaProjection — relationship diagnostics for unhandleable shapes', () => {
  it("emits PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED for many-to-many via `through`", () => {
    // Many-to-many via an explicit join entity isn't safely emittable on a
    // single side — Prisma needs the join entity declared with its own
    // belongsTo relations. The projection emits a structured info diagnostic
    // and a comment marker instead of a wrong field.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [
          { name: 'books', kind: 'hasMany', target: 'Book', through: 'AuthorBook' },
        ],
      }),
      bareEntity('Book'),
      bareEntity('AuthorBook'),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'), durableStore('AuthorBook'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;

    // No Prisma field for the through-relation.
    expect(code).not.toMatch(/^\s+books Book\[\]$/m);
    // Diagnostic carries the entity, the join model, and the resolution hint.
    const through = result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED');
    expect(through).toBeDefined();
    expect(through?.entity).toBe('Author');
    expect(through?.message).toMatch(/AuthorBook/);
    expect(through?.message).toMatch(/join entity/);
  });

  it("emits PRISMA_RELATION_AMBIGUOUS when multiple relations connect the same pair", () => {
    // Book has TWO belongsTo pointing at Author (e.g. author + editor, both
    // Author-typed). Prisma needs `@relation("name")` on both sides; the
    // projection refuses to invent names and diagnoses instead.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [
          { name: 'authoredBooks', kind: 'hasMany', target: 'Book' },
          { name: 'editedBooks', kind: 'hasMany', target: 'Book' },
        ],
      }),
      bareEntity('Book', {
        relationships: [
          { name: 'author', kind: 'belongsTo', target: 'Author' },
          { name: 'editor', kind: 'belongsTo', target: 'Author' },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    // Diagnostic fires for at least one of the ambiguous relations on each side.
    const ambig = result.diagnostics.filter((d) => d.code === 'PRISMA_RELATION_AMBIGUOUS');
    expect(ambig.length).toBeGreaterThan(0);
    // Specific message tells the operator to add @relation("name") by hand.
    expect(ambig[0].message).toMatch(/@relation/);
  });

  it("emits PRISMA_RELATION_MISSING_BACKSIDE warning when only one side is declared", () => {
    // `hasMany` on Author with no `belongsTo` on Book → Prisma will reject.
    // Projection warns explicitly with the missing declaration.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book'), // no relationships declared
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const warn = result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE');
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning');
    expect(warn?.message).toMatch(/Book/);
    expect(warn?.message).toMatch(/belongsTo|ref/);
  });
});

describe('PrismaProjection — PRISMA_RELATION_UNIMPLEMENTED is retired for handled cases', () => {
  it('does NOT emit PRISMA_RELATION_UNIMPLEMENTED for any handled relationship kind', () => {
    // The Step-3 deliverable: handled cases (hasMany, hasOne, belongsTo, ref
    // without `through`) must NOT trip the legacy "unimplemented" diagnostic.
    // The only relation-shape diagnostics that remain are the structured ones
    // for genuinely-unhandleable shapes (through, ambiguous, missing backside).
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [
          { name: 'books', kind: 'hasMany', target: 'Book' },
          { name: 'profile', kind: 'hasOne', target: 'Profile' },
        ],
      }),
      bareEntity('Book', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
      bareEntity('Profile', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'Author' }],
      }),
      bareEntity('Event', {
        relationships: [{ name: 'actor', kind: 'ref', target: 'Actor' }],
      }),
      bareEntity('Actor'),
    );
    for (const e of ir.entities) ir.stores.push(durableStore(e.name));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_UNIMPLEMENTED')).toBeUndefined();
  });
});
