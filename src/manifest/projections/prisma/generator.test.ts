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
import type { IR, IREntity, IRStore } from '../../ir';
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
  values: [],
  entities: [],
  enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

function widgetEntity(): IREntity {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrismaProjection — projection target metadata', () => {
  it('declares the expected name, description and surfaces', () => {
    const p = new PrismaProjection();
    expect(p.name).toBe('prisma');
    expect(p.surfaces).toEqual(['prisma.schema']);
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
    expect(code).toMatch(/model Widget \{/);
    expect(code).toMatch(/^\s+id String @id$/m);
    expect(code).toMatch(/^\s+name String$/m);
    expect(code).toMatch(/^\s+qty Int\?$/m);
    expect(code).toMatch(/^\}$/m);

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });

  it('applies tableMappings, columnMappings, precision, indexes, typeMappings through config (NO dotted-string keys)', () => {
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
        precision: { Widget: { price: { precision: 12, scale: 2 } } },
        indexes: { Widget: [['sku', 'createdAt'], { fields: ['qty'], name: 'widget_qty_idx' }] },
        typeMappings: { Widget: { qty: 'Int' } },
      },
    });

    // provider is set → schema artifact + prisma.config.ts companion
    expect(result.artifacts).toHaveLength(2);
    const code = result.artifacts[0].code;
    expect(result.artifacts[1].id).toBe('prisma.config.ts');
    expect(result.artifacts[1].code).toMatch(/DATABASE_URL/);

    expect(code).toMatch(/datasource db \{/);
    expect(code).toMatch(/provider = "postgresql"/);
    expect(code).toMatch(/^\s+sku String @unique$/m);
    expect(code).toMatch(/^\s+qty Int$/m);
    expect(code).toMatch(/^\s+price Decimal @db\.Decimal\(12, 2\)$/m);
    expect(code).toMatch(/^\s+createdAt DateTime @map\("created_at"\)$/m);
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
    ir.entities.push({ ...widgetEntity(), external: true } as IREntity & { external: boolean });
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

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.artifacts[0].code).not.toMatch(/model Widget/);
    const skip = result.diagnostics.find((d) => d.code === 'PRISMA_SKIPPED_NO_STORE');
    expect(skip).toBeDefined();
  });

  it('NEVER iterates computedProperties (structural invariant)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [
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
    expect(code).toMatch(/^\s+price Decimal @db\.Decimal\(12, 2\)$/m);
    expect(code).not.toMatch(/^\s+total /m);
  });
});

describe('PrismaProjection — `money` / `decimal` types and default precision', () => {
  it('maps `money` to Prisma `Decimal` with default precision @db.Decimal(12, 2)', () => {
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
    expect(code).toMatch(/^\s+unitCost Decimal @db\.Decimal\(12, 2\)$/m);
  });

  it('maps `decimal` to Prisma `Decimal` with the same default precision', () => {
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

    expect(code).toMatch(/^\s+fxRate Decimal @db\.Decimal\(18, 8\)$/m);
    expect(code).not.toMatch(/@db\.Decimal\(12, 2\)/);
  });

  it('applies default precision to ANY property whose resolved scalar is Decimal', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
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
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
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
    expect(errs[0].message).toMatch(/Widget\.qty/);
    expect(errs[0].message).toMatch(/'int'/);
    expect(errs[0].message).toMatch(/'bigint'/);
    expect(errs[0].message).toMatch(/'float'/);
    expect(errs[0].message).toMatch(/'money'/);
    expect(errs[0].message).toMatch(/'decimal'/);
    expect(errs[0].message).toMatch(/typeMappings\.Widget\.qty/);

    const code = result.artifacts[0].code;
    expect(code).toMatch(/^\s+id String @id$/m);
    expect(code).not.toMatch(/^\s+qty /m);
  });

  it('resolves cleanly when the author picks a precise type (`int`, `float`, `money`)', () => {
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

    expect(result.diagnostics.filter((d) => d.code === 'PRISMA_AMBIGUOUS_NUMBER')).toHaveLength(0);
    expect(result.artifacts[0].code).toMatch(/^\s+legacyCount BigInt$/m);
  });
});

describe('PrismaProjection — diagnostic for unmappable type.name', () => {
  it('emits PRISMA_UNKNOWN_TYPE when a property type has no default mapping and no override', () => {
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

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('PRISMA_UNKNOWN_TYPE');
    expect(errs[0].entity).toBe('Widget');
    expect(errs[0].message).toMatch(/Widget\.amount/);
    expect(errs[0].message).toMatch(/currency/);
    expect(errs[0].message).toMatch(/typeMappings/);

    const code = result.artifacts[0].code;
    expect(code).toMatch(/^\s+id String @id$/m);
    expect(code).not.toMatch(/^\s+amount /m);
  });

  it('resolves unmappable types when consumer supplies a `typeMappings` override', () => {
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
    expect(result.artifacts[0].code).toMatch(/^\s+amount Decimal @db\.Decimal\(12, 2\)$/m);
  });
});

describe('PrismaProjection — app-agnostic invariant', () => {
  it('emits a usable Prisma schema with ZERO app/domain identifiers in the projection source', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql' },
    }).artifacts[0].code;

    const forbidden = [
      'tenantId', 'deletedAt', 'organization', 'userTenantMapping',
      'auth', 'clerk', 'supabase_user', 'tenant_id',
    ];
    for (const token of forbidden) {
      expect(code).not.toContain(token);
    }
  });
});

describe('PrismaProjection — relationship wiring (Step 3)', () => {
  it('emits a working one-to-many: hasMany on parent, belongsTo+FK on child', () => {
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

    expect(code).toMatch(/model Author \{[\s\S]*?\n\s+books Book\[\][\s\S]*?\n\}/);
    expect(code).toMatch(/^\s+authorId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[authorId\], references: \[id\]\)$/m);

    const authorIdLine = code.split('\n').find((l) => /^\s+authorId String/.test(l));
    expect(authorIdLine).not.toMatch(/@unique/);

    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_UNIMPLEMENTED')).toBeUndefined();
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE')).toBeUndefined();
  });

  it('emits a working one-to-one: hasOne on parent, belongsTo+@unique FK on child', () => {
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

    expect(code).toMatch(/^\s+profile Profile\?$/m);
    expect(code).toMatch(/^\s+userId String @unique$/m);
    expect(code).toMatch(/^\s+user User @relation\(fields: \[userId\], references: \[id\]\)$/m);
  });

  it('emits a `ref` relationship like belongsTo, AND warns about missing back-relation', () => {
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

    expect(code).toMatch(/^\s+createdById String$/m);
    expect(code).toMatch(/^\s+createdBy Actor @relation\(fields: \[createdById\], references: \[id\]\)$/m);
    const warn = result.diagnostics.find(
      (d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE' && d.entity === 'Event',
    );
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning');
  });

  it("uses IR's `foreignKey.fields` annotation when present (single-column, backward-compat)", () => {
    // IR foreignKey.fields renames the FK field at .manifest source level.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          { name: 'author', kind: 'belongsTo', target: 'Author', foreignKey: { fields: ['writerId'] } },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(/^\s+writerId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[writerId\], references: \[id\]\)$/m);
    expect(code).not.toMatch(/^\s+authorId /m);
  });

  it("respects the `foreignKeys` projection-config override (nested-key shape, no dotted strings)", () => {
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

  it("config `foreignKeys` wins over IR's `foreignKey.fields` (consumer override is authoritative)", () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          { name: 'author', kind: 'belongsTo', target: 'Author', foreignKey: { fields: ['irFkName'] } },
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

  it("FK type follows the referenced property type (Int target → Int FK)", () => {
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
    expect(code).toMatch(/^\s+authorId Int$/m);
    expect(code).toMatch(/model Author \{[\s\S]*?id Int @id/);
  });
});

describe('PrismaProjection — relationship diagnostics for unhandleable shapes', () => {
  it("emits PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED for many-to-many via `through`", () => {
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

    expect(code).not.toMatch(/^\s+books Book\[\]$/m);
    const through = result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED');
    expect(through).toBeDefined();
    expect(through?.entity).toBe('Author');
    expect(through?.message).toMatch(/AuthorBook/);
    expect(through?.message).toMatch(/join entity/);
  });

  it("emits deterministic named @relation on both sides when multiple relations connect the same pair", () => {
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

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    // FK side: name is first @relation arg, paired by declaration order.
    expect(code).toMatch(/author\s+Author\s+@relation\("Book_author", fields: \[authorId\], references: \[id\]\)/);
    expect(code).toMatch(/editor\s+Author\s+@relation\("Book_editor", fields: \[editorId\], references: \[id\]\)/);
    // Back side: same names, paired authoredBooks↔author, editedBooks↔editor.
    expect(code).toMatch(/authoredBooks\s+Book\[\]\s+@relation\("Book_author"\)/);
    expect(code).toMatch(/editedBooks\s+Book\[\]\s+@relation\("Book_editor"\)/);
    // No give-up comment.
    expect(code).not.toMatch(/PRISMA_RELATION_AMBIGUOUS/);
  });

  it("warns PRISMA_RELATION_AMBIGUOUS when a multi-relation back side has no FK to anchor a name", () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [
          { name: 'authoredBooks', kind: 'hasMany', target: 'Book' },
          { name: 'editedBooks', kind: 'hasMany', target: 'Book' },
        ],
      }),
      bareEntity('Book'),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    const ambig = result.diagnostics.filter((d) => d.code === 'PRISMA_RELATION_AMBIGUOUS');
    expect(ambig.length).toBeGreaterThan(0);
    expect(ambig[0].message).toMatch(/belongsTo/);
  });

  it("emits PRISMA_RELATION_MISSING_BACKSIDE warning when only one side is declared", () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book'),
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

describe('PrismaProjection — autoBackRelations', () => {
  it('auto-emits the inverse hasMany on the target for a one-sided belongsTo', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Post', {
        relationships: [{ name: 'author', kind: 'belongsTo', target: 'User' }],
      }),
      bareEntity('User'),
    );
    ir.stores.push(durableStore('Post'), durableStore('User'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: { autoBackRelations: true } });
    const code = result.artifacts[0].code;
    // Forward side present, inverse auto-emitted on User (pluralized, camel).
    expect(code).toMatch(/author\s+User\s+@relation\(fields: \[authorId\], references: \[id\]\)/);
    expect(code).toMatch(/model User \{[\s\S]*?posts\s+Post\[\][\s\S]*?\}/);
    // No missing-backside warning when auto is on.
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE')).toBeUndefined();
  });

  it('does NOT auto-emit (and still warns) when the option is off', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Post', { relationships: [{ name: 'author', kind: 'belongsTo', target: 'User' }] }),
      bareEntity('User'),
    );
    ir.stores.push(durableStore('Post'), durableStore('User'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    expect(result.artifacts[0].code).not.toMatch(/posts\s+Post\[\]/);
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_RELATION_MISSING_BACKSIDE')).toBeDefined();
  });

  it('does not duplicate an inverse the target already declares', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Post', { relationships: [{ name: 'author', kind: 'belongsTo', target: 'User' }] }),
      bareEntity('User', { relationships: [{ name: 'posts', kind: 'hasMany', target: 'Post' }] }),
    );
    ir.stores.push(durableStore('Post'), durableStore('User'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: { autoBackRelations: true } }).artifacts[0].code;
    // Exactly one `posts Post[]` on User (the declared one), no auto duplicate.
    const matches = code.match(/posts\s+Post\[\]/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('auto-emits distinct named inverses for ambiguous multi-relations', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Connection', {
        relationships: [
          { name: 'fromCard', kind: 'belongsTo', target: 'Card' },
          { name: 'toCard', kind: 'belongsTo', target: 'Card' },
        ],
      }),
      bareEntity('Card'),
    );
    ir.stores.push(durableStore('Connection'), durableStore('Card'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: { autoBackRelations: true } }).artifacts[0].code;
    // Forward sides carry the deterministic names.
    expect(code).toMatch(/fromCard\s+Card\s+@relation\("Connection_fromCard"/);
    expect(code).toMatch(/toCard\s+Card\s+@relation\("Connection_toCard"/);
    // Auto inverses on Card carry matching names and distinct field names.
    expect(code).toMatch(/connectionsFromCard\s+Connection\[\]\s+@relation\("Connection_fromCard"\)/);
    expect(code).toMatch(/connectionsToCard\s+Connection\[\]\s+@relation\("Connection_toCard"\)/);
  });

  it('uniquifies an auto inverse field name that collides with a property', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Post', { relationships: [{ name: 'author', kind: 'belongsTo', target: 'User' }] }),
      bareEntity('User', {
        properties: [{ name: 'posts', type: { name: 'string', nullable: false }, modifiers: [] }],
      }),
    );
    ir.stores.push(durableStore('Post'), durableStore('User'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: { autoBackRelations: true } }).artifacts[0].code;
    // The scalar `posts` property stays; the auto inverse gets a suffixed name.
    expect(code).toMatch(/model User \{[\s\S]*?posts\s+String[\s\S]*?posts2\s+Post\[\][\s\S]*?\}/);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 golden tests: composite PK / FK / referential actions
// ---------------------------------------------------------------------------

describe('PrismaProjection — composite PK, composite FK, and referential actions (v1.0)', () => {
  it('REGRESSION: single-column `with` relation emits byte-identical output (no regression)', () => {
    // This is the Phase 3 regression gate. `with authorId` compiles to
    // foreignKey: { fields: ['authorId'] } (references absent). The projection
    // must emit exactly the same output as before: authorId String + @relation
    // with references: [id] defaulted.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          // foreignKey.references absent → projection defaults to [id]
          { name: 'author', kind: 'belongsTo', target: 'Author', foreignKey: { fields: ['authorId'] } },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    // Exact same output as before the IR shape change.
    expect(code).toMatch(/^\s+authorId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[authorId\], references: \[id\]\)$/m);
  });

  it('composite PK entity emits @@id([...]) and suppresses PRISMA_NO_ID_PROPERTY', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Order',
      key: ['tenantId', 'orderId'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'orderId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'amount', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Order'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;

    // Composite PK block present.
    expect(code).toMatch(/^\s+@@id\(\[tenantId, orderId\]\)$/m);
    // No single @id attribute on any field (@@id is fine; standalone @id is not).
    expect(code).not.toMatch(/(?<!@)@id\b/m);
    // PRISMA_NO_ID_PROPERTY must NOT fire when key is set.
    expect(result.diagnostics.find((d) => d.code === 'PRISMA_NO_ID_PROPERTY')).toBeUndefined();
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('composite PK entity whose key includes a property named `id` does NOT emit @id on that column', () => {
    // Real-world case: entity has key [tenantId, id] — `id` is a composite PK column,
    // not a single-column identity. Emitting both `id String @id` AND `@@id([tenantId, id])`
    // would produce an invalid Prisma schema.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Participant',
      key: ['tenantId', 'id'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Participant'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    expect(code).toMatch(/^\s+@@id\(\[tenantId, id\]\)$/m);
    // `id` column must appear as a plain column, NOT carrying @id
    expect(code).toMatch(/^\s+id String$/m);
    expect(code).not.toMatch(/(?<!@)@id\b/m);
  });

  it('alternate key (unique [...]) emits @@unique([...]) on the target entity', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Organization',
      key: ['tenantId', 'id'],
      alternateKeys: [['tenantId', 'externalId']],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'externalId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Organization'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    expect(code).toMatch(/^\s+@@id\(\[tenantId, id\]\)$/m);
    expect(code).toMatch(/^\s+@@unique\(\[tenantId, externalId\]\)$/m);
  });

  it('composite FK emits multiple FK column lines and correct fields/references', () => {
    // belongsTo org: Organization fields [orgTenantId, orgId] references [tenantId, id]
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Organization',
        key: ['tenantId', 'id'],
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'orders', kind: 'hasMany', target: 'Order' }],
        commands: [], constraints: [], policies: [],
      },
      {
        name: 'Order',
        key: ['tenantId', 'orderId'],
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'orderId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [
          {
            name: 'org',
            kind: 'belongsTo' as const,
            target: 'Organization',
            foreignKey: { fields: ['tenantId', 'orderId'], references: ['tenantId', 'id'] },
          },
        ],
        commands: [], constraints: [], policies: [],
      },
    );
    ir.stores.push(durableStore('Organization'), durableStore('Order'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;

    // FK columns: already declared as entity properties, so NOT re-emitted
    // (fkAlreadyDeclared prevents duplicate lines). The @relation line is always emitted.
    expect(code).toMatch(
      /^\s+org Organization @relation\(fields: \[tenantId, orderId\], references: \[tenantId, id\]\)$/m,
    );

    // @@id on both entities.
    expect(code).toMatch(/@@id\(\[tenantId, orderId\]\)/);
    expect(code).toMatch(/@@id\(\[tenantId, id\]\)/);
  });

  it('composite FK with undeclared columns emits multiple FK column lines', () => {
    // When the FK columns are NOT declared as properties, the projection emits them.
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Parent', {
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        relationships: [{ name: 'children', kind: 'hasMany', target: 'Child' }],
      }),
      bareEntity('Child', {
        relationships: [
          {
            name: 'parent',
            kind: 'belongsTo' as const,
            target: 'Parent',
            foreignKey: { fields: ['parentTenantId', 'parentId'], references: ['tenantId', 'id'] },
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Parent'), durableStore('Child'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    // Both FK columns emitted (neither is a declared entity property).
    expect(code).toMatch(/^\s+parentTenantId String$/m);
    expect(code).toMatch(/^\s+parentId String$/m);
    expect(code).toMatch(
      /^\s+parent Parent @relation\(fields: \[parentTenantId, parentId\], references: \[tenantId, id\]\)$/m,
    );
  });

  it('non-id references target uses the referenced property type', () => {
    // belongsTo org: Org references [tenantId, externalId]
    // The FK types should match the Org.externalId type, not default to String blindly.
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Org',
        key: ['tenantId', 'id'],
        alternateKeys: [['tenantId', 'externalId']],
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'externalId', type: { name: 'int', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'items', kind: 'hasMany', target: 'Item' }],
        commands: [], constraints: [], policies: [],
      },
      bareEntity('Item', {
        relationships: [
          {
            name: 'org',
            kind: 'belongsTo' as const,
            target: 'Org',
            foreignKey: {
              fields: ['orgTenantId', 'orgExternalId'],
              references: ['tenantId', 'externalId'],
            },
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Org'), durableStore('Item'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;

    // orgTenantId → String (Org.tenantId is string), orgExternalId → Int (Org.externalId is int)
    expect(code).toMatch(/^\s+orgTenantId String$/m);
    expect(code).toMatch(/^\s+orgExternalId Int$/m);
    expect(code).toMatch(
      /^\s+org Org @relation\(fields: \[orgTenantId, orgExternalId\], references: \[tenantId, externalId\]\)$/m,
    );
  });

  it('onDelete cascade emits onDelete: Cascade in @relation', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          {
            name: 'author',
            kind: 'belongsTo' as const,
            target: 'Author',
            onDelete: 'cascade',
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(
      /^\s+author Author @relation\(fields: \[authorId\], references: \[id\], onDelete: Cascade\)$/m,
    );
  });

  it('onUpdate restrict emits onUpdate: Restrict in @relation', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Author', {
        relationships: [{ name: 'books', kind: 'hasMany', target: 'Book' }],
      }),
      bareEntity('Book', {
        relationships: [
          {
            name: 'author',
            kind: 'belongsTo' as const,
            target: 'Author',
            onUpdate: 'restrict',
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Author'), durableStore('Book'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(
      /^\s+author Author @relation\(fields: \[authorId\], references: \[id\], onUpdate: Restrict\)$/m,
    );
  });

  it('both onDelete and onUpdate emit both referential actions', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Parent', {
        relationships: [{ name: 'children', kind: 'hasMany', target: 'Child' }],
      }),
      bareEntity('Child', {
        relationships: [
          {
            name: 'parent',
            kind: 'belongsTo' as const,
            target: 'Parent',
            onDelete: 'cascade',
            onUpdate: 'noAction',
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Parent'), durableStore('Child'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(
      /^\s+parent Parent @relation\(fields: \[parentId\], references: \[id\], onDelete: Cascade, onUpdate: NoAction\)$/m,
    );
  });

  it('absent onDelete/onUpdate emit no referential action attributes (let Prisma default)', () => {
    // Critical for Phase 5: relations with no action declared must diff clean
    // against real-schema relations that also have no onDelete/onUpdate.
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

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    // @relation must not contain onDelete or onUpdate when not declared.
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[authorId\], references: \[id\]\)$/m);
    expect(code).not.toMatch(/onDelete/);
    expect(code).not.toMatch(/onUpdate/);
  });

  it('setNull and setDefault actions are PascalCased correctly', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Parent', {
        relationships: [{ name: 'children', kind: 'hasMany', target: 'Child' }],
      }),
      bareEntity('Child', {
        relationships: [
          {
            name: 'parent',
            kind: 'belongsTo' as const,
            target: 'Parent',
            onDelete: 'setNull',
            onUpdate: 'setDefault',
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Parent'), durableStore('Child'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    expect(code).toMatch(/onDelete: SetNull/);
    expect(code).toMatch(/onUpdate: SetDefault/);
  });
});

// ---------------------------------------------------------------------------
// dbAttributes conformance tests
// ---------------------------------------------------------------------------

describe('PrismaProjection — dbAttributes config', () => {
  it('emits @db.Uuid on a string field via dbAttributes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'externalRef', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { dbAttributes: { Widget: { externalRef: 'Uuid' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+externalRef String @db\.Uuid$/m);
  });

  it('emits @db.Timestamptz(6) on a DateTime field via dbAttributes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { dbAttributes: { Widget: { createdAt: 'Timestamptz(6)' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+createdAt DateTime @db\.Timestamptz\(6\)$/m);
  });

  it('emits @db.Date on a DateTime field', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'bornOn', type: { name: 'datetime', nullable: false }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { dbAttributes: { Widget: { bornOn: 'Date' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+bornOn DateTime\? @db\.Date$/m);
  });

  it('emits @db.SmallInt on an Int field via dbAttributes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'priority', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { dbAttributes: { Widget: { priority: 'SmallInt' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+priority Int @db\.SmallInt$/m);
  });

  it('SKIPS dbAttributes when @db.Decimal was already emitted by precision config (no duplicate @db)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'price', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    // Both precision AND dbAttributes target the same field.
    // precision wins → @db.Decimal(12, 2); dbAttributes is skipped.
    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        precision: { Widget: { price: { precision: 12, scale: 2 } } },
        dbAttributes: { Widget: { price: 'Decimal(18, 4)' } },
      },
    }).artifacts[0].code;

    // precision-emitted @db.Decimal wins
    expect(code).toMatch(/^\s+price Decimal @db\.Decimal\(12, 2\)$/m);
    // No duplicate @db from dbAttributes
    expect(code).not.toMatch(/@db\.Decimal\(18, 4\)/);
  });

  it('SKIPS dbAttributes when @db.Decimal was auto-emitted for decimal/money type (no override)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'cost', type: { name: 'money', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    // money type auto-emits @db.Decimal(12, 2); dbAttributes should be suppressed.
    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { dbAttributes: { Widget: { cost: 'Numeric' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+cost Decimal @db\.Decimal\(12, 2\)$/m);
    expect(code).not.toMatch(/@db\.Numeric/);
  });

  it('emits dbAttributes on the id field (not blocked by @id)', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { dbAttributes: { Widget: { id: 'Uuid' } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+id String @id @db\.Uuid$/m);
  });

  it('coexists with @map from columnMappings on the same field', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        columnMappings: { Widget: { createdAt: 'created_at' } },
        dbAttributes: { Widget: { createdAt: 'Timestamptz(6)' } },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+createdAt DateTime @map\("created_at"\) @db\.Timestamptz\(6\)$/m);
  });
});

// ---------------------------------------------------------------------------
// fieldAttributes conformance tests
// ---------------------------------------------------------------------------

describe('PrismaProjection — fieldAttributes config', () => {
  it('emits @unique from fieldAttributes on a field without modifiers', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'sku', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { sku: ['@unique'] } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+sku String @unique$/m);
  });

  it('emits @default(now()) from fieldAttributes on a DateTime field', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { createdAt: ['@default(now())'] } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+createdAt DateTime @default\(now\(\)\)$/m);
  });

  it('emits @updatedAt from fieldAttributes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'updatedAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { updatedAt: ['@updatedAt'] } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+updatedAt DateTime @updatedAt$/m);
  });

  it('emits @default(dbgenerated(...)) from fieldAttributes', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { id: ['@default(dbgenerated("gen_random_uuid()"))'] } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+id String @id @default\(dbgenerated\("gen_random_uuid\(\)"\)\)$/m);
  });

  it('deduplicates fieldAttributes — does NOT re-add @unique already from modifiers', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'sku', type: { name: 'string', nullable: false }, modifiers: ['required', 'unique'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    // @unique is already emitted from modifiers; fieldAttributes should NOT duplicate it.
    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { sku: ['@unique'] } } },
    }).artifacts[0].code;

    // Only one @unique
    const skuLine = code.split('\n').find((l) => /^\s+sku /.test(l));
    expect(skuLine).toBeDefined();
    const uniqueCount = (skuLine!.match(/@unique/g) ?? []).length;
    expect(uniqueCount).toBe(1);
  });

  it('deduplicates fieldAttributes — does NOT re-add @default already from prop.defaultValue', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'active',
          type: { name: 'boolean', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'boolean', value: true },
        },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    // @default(true) already emitted from prop.defaultValue; fieldAttributes should not duplicate.
    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { active: ['@default(true)'] } } },
    }).artifacts[0].code;

    const activeLine = code.split('\n').find((l) => /^\s+active /.test(l));
    expect(activeLine).toBeDefined();
    const defaultCount = (activeLine!.match(/@default/g) ?? []).length;
    expect(defaultCount).toBe(1);
  });

  it('emits multiple fieldAttributes on the same field', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { fieldAttributes: { Widget: { createdAt: ['@default(now())', '@updatedAt'] } } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+createdAt DateTime @default\(now\(\)\) @updatedAt$/m);
  });
});

// ---------------------------------------------------------------------------
// dbAttributes + fieldAttributes interaction
// ---------------------------------------------------------------------------

describe('PrismaProjection — dbAttributes + fieldAttributes together', () => {
  it('emits both @db.* and field attributes on the same field', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        dbAttributes: { Widget: { createdAt: 'Timestamptz(6)' } },
        fieldAttributes: { Widget: { createdAt: ['@default(now())'] } },
      },
    }).artifacts[0].code;

    expect(code).toMatch(
      /^\s+createdAt DateTime @db\.Timestamptz\(6\) @default\(now\(\)\)$/m,
    );
  });

  it('emits @db.Uuid + @default(dbgenerated(...)) together on id field', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        dbAttributes: { Widget: { id: 'Uuid' } },
        fieldAttributes: { Widget: { id: ['@default(dbgenerated("gen_random_uuid()"))'] } },
      },
    }).artifacts[0].code;

    // dbAttributes are emitted before fieldAttributes in the attr list
    expect(code).toMatch(
      /^\s+id String @id @db\.Uuid @default\(dbgenerated\("gen_random_uuid\(\)"\)\)$/m,
    );
  });
});

// ---------------------------------------------------------------------------
// Snapshot test: procurement-like entity with all features combined
// ---------------------------------------------------------------------------

describe('PrismaProjection — procurement entity snapshot (dbAttributes + fieldAttributes)', () => {
  it('generates deterministic schema for a composite-key entity with dbAttributes and fieldAttributes', () => {
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Vendor',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'items', kind: 'hasMany', target: 'ProcurementItem' }],
        commands: [], constraints: [], policies: [],
      },
      {
        name: 'ProcurementItem',
        key: ['vendorId', 'lineNo'],
        properties: [
          { name: 'vendorId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'lineNo', type: { name: 'int', nullable: false }, modifiers: ['required'] },
          { name: 'description', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'unitCost', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
          { name: 'quantity', type: { name: 'int', nullable: false }, modifiers: ['required'] },
          { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: ['required'] },
          { name: 'updatedAt', type: { name: 'datetime', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [
          {
            name: 'vendor',
            kind: 'belongsTo' as const,
            target: 'Vendor',
            foreignKey: { fields: ['vendorId'], references: ['id'] },
          },
        ],
        commands: [], constraints: [], policies: [],
      },
    );
    ir.stores.push(durableStore('Vendor'), durableStore('ProcurementItem'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        tableMappings: { ProcurementItem: 'procurement_items', Vendor: 'vendors' },
        dbAttributes: {
          ProcurementItem: { vendorId: 'Uuid', createdAt: 'Timestamptz(6)', updatedAt: 'Timestamptz(6)' },
          Vendor: { id: 'Uuid', createdAt: 'Timestamptz(6)' },
        },
        fieldAttributes: {
          ProcurementItem: { createdAt: ['@default(now())'], updatedAt: ['@updatedAt'] },
          Vendor: { createdAt: ['@default(now())'] },
        },
        precision: { ProcurementItem: { unitCost: { precision: 14, scale: 4 } } },
        indexes: { ProcurementItem: [['description']] },
      },
    });

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;

    // Vendor: id String @id @db.Uuid
    expect(code).toMatch(/^\s+id String @id @db\.Uuid$/m);
    // Vendor: createdAt DateTime @db.Timestamptz(6) @default(now())
    expect(code).toMatch(/^\s+createdAt DateTime @db\.Timestamptz\(6\) @default\(now\(\)\)$/m);

    // ProcurementItem: vendorId String @db.Uuid (FK column, property-declared)
    expect(code).toMatch(/^\s+vendorId String @db\.Uuid$/m);
    // ProcurementItem: lineNo Int
    expect(code).toMatch(/^\s+lineNo Int$/m);
    // ProcurementItem: unitCost Decimal @db.Decimal(14, 4)  — precision wins, dbAttributes skipped
    expect(code).toMatch(/^\s+unitCost Decimal @db\.Decimal\(14, 4\)$/m);
    // ProcurementItem: createdAt DateTime @db.Timestamptz(6) @default(now())
    expect(code).toMatch(/^\s+createdAt DateTime @db\.Timestamptz\(6\) @default\(now\(\)\)$/m);
    // ProcurementItem: updatedAt DateTime? @db.Timestamptz(6) @updatedAt
    expect(code).toMatch(/^\s+updatedAt DateTime\? @db\.Timestamptz\(6\) @updatedAt$/m);
    // Composite PK
    expect(code).toMatch(/^\s+@@id\(\[vendorId, lineNo\]\)$/m);
    // Composite FK relation
    expect(code).toMatch(
      /^\s+vendor Vendor @relation\(fields: \[vendorId\], references: \[id\]\)$/m,
    );
    // Table mapping
    expect(code).toMatch(/^\s+@@map\("vendors"\)$/m);
    expect(code).toMatch(/^\s+@@map\("procurement_items"\)$/m);
    // Index
    expect(code).toMatch(/^\s+@@index\(\[description\]\)$/m);

    // Determinism: run twice, assert identical output
    const result2 = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        tableMappings: { ProcurementItem: 'procurement_items', Vendor: 'vendors' },
        dbAttributes: {
          ProcurementItem: { vendorId: 'Uuid', createdAt: 'Timestamptz(6)', updatedAt: 'Timestamptz(6)' },
          Vendor: { id: 'Uuid', createdAt: 'Timestamptz(6)' },
        },
        fieldAttributes: {
          ProcurementItem: { createdAt: ['@default(now())'], updatedAt: ['@updatedAt'] },
          Vendor: { createdAt: ['@default(now())'] },
        },
        precision: { ProcurementItem: { unitCost: { precision: 14, scale: 4 } } },
        indexes: { ProcurementItem: [['description']] },
      },
    });
    expect(result.artifacts[0].code).toBe(result2.artifacts[0].code);
  });
});

// ---------------------------------------------------------------------------
// Regression tests for Capsule-Pro proven bugs
// ---------------------------------------------------------------------------

describe('PrismaProjection — regression: object-shaped foreignKeys config', () => {
  it('accepts ForeignKeyConfig objects in foreignKeys (not just strings)', () => {
    // Capsule-Pro passes {fields, references, onDelete} objects instead of plain strings.
    // The emitter must extract fields/references/actions from the object, not stringify it.
    const ir = emptyIR();
    ir.entities.push(
      {
        name: 'Order',
        key: ['tenantId', 'id'],
        properties: [
          { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [{ name: 'items', kind: 'hasMany', target: 'OrderItem' }],
        commands: [], constraints: [], policies: [],
      },
      bareEntity('OrderItem', {
        relationships: [
          { name: 'order', kind: 'belongsTo' as const, target: 'Order' },
        ],
      }),
    );
    ir.stores.push(durableStore('Order'), durableStore('OrderItem'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        foreignKeys: {
          OrderItem: {
            order: {
              fields: ['tenantId', 'orderId'],
              references: ['tenantId', 'id'],
              onDelete: 'Cascade',
            },
          },
        },
      },
    });

    const code = result.artifacts[0].code;

    // Must NOT contain [object Object]
    expect(code).not.toContain('[object Object]');

    // Must emit proper FK columns and relation line
    expect(code).toMatch(/^\s+tenantId String$/m);
    expect(code).toMatch(/^\s+orderId String$/m);
    expect(code).toMatch(
      /^\s+order Order @relation\(fields: \[tenantId, orderId\], references: \[tenantId, id\], onDelete: Cascade\)$/m,
    );

    // No errors
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('object-shaped foreignKeys with single column works like string form', () => {
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
      options: {
        foreignKeys: {
          Book: { author: { fields: ['writerId'] } },
        },
      },
    }).artifacts[0].code;

    expect(code).not.toContain('[object Object]');
    expect(code).toMatch(/^\s+writerId String$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[writerId\], references: \[id\]\)$/m);
  });
});

describe('PrismaProjection — regression: duplicate @default dedup', () => {
  it('fieldAttributes @default(now()) overrides IR @default(0) — no duplicate', () => {
    // When IR has defaultValue: {kind: "number", value: 0} and fieldAttributes
    // supplies @default(now()), only the fieldAttributes version should appear.
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'createdAt',
          type: { name: 'datetime', nullable: false },
          modifiers: ['required'],
          defaultValue: { kind: 'number', value: 0 },
        },
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
        fieldAttributes: {
          Widget: { createdAt: ['@default(now())'] },
        },
      },
    });

    const code = result.artifacts[0].code;

    // Count @default occurrences on the createdAt line
    const createdAtIndex = code.indexOf('createdAt');
    const createdAtLine = code.substring(createdAtIndex, code.indexOf('\n', createdAtIndex));

    // Must have exactly ONE @default
    const defaultCount = (createdAtLine.match(/@default/g) || []).length;
    expect(defaultCount).toBe(1);

    // Must be @default(now()), NOT @default(0)
    expect(createdAtIndex).toBeGreaterThan(-1);
    expect(code).toMatch(/^\s+createdAt DateTime @default\(now\(\)\)$/m);
  });

  it('fieldAttributes @unique is suppressed when prop.modifiers already has unique', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Widget',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'sku', type: { name: 'string', nullable: false }, modifiers: ['required', 'unique'] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        fieldAttributes: { Widget: { sku: ['@unique'] } },
      },
    }).artifacts[0].code;

    const skuLine = code.split('\n').find(l => /^\s+sku /.test(l));
    expect(skuLine).toBeDefined();
    // Exactly one @unique
    expect((skuLine!.match(/@unique/g) || []).length).toBe(1);
  });

  // ── Array type emission ──────────────────────────────────────────────

  it('emits String[] for array<string> type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Taggable',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'tags', type: { name: 'array', generic: { name: 'string', nullable: false }, nullable: false }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Taggable'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: {} }).artifacts[0].code;
    expect(code).toMatch(/^\s+tags\s+String\[\]$/m);
  });

  it('emits Int[] for array<int> type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Scored',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'scores', type: { name: 'array', generic: { name: 'int', nullable: false }, nullable: false }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Scored'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: {} }).artifacts[0].code;
    expect(code).toMatch(/^\s+scores\s+Int\[\]$/m);
  });

  it('emits Decimal[] for array<decimal> type', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Priced',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'prices', type: { name: 'array', generic: { name: 'decimal', nullable: false }, nullable: false }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Priced'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: {} }).artifacts[0].code;
    // Decimal[] may get @db.Decimal attribute appended — just check the type portion.
    const pricesLine = code.split('\n').find(l => /^\s+prices /.test(l));
    expect(pricesLine).toBeDefined();
    expect(pricesLine).toMatch(/^\s+prices\s+Decimal\[\]/);
  });

  it('array field never gets nullable ? suffix', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Taggable',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        // No 'required' modifier — yet should still NOT get ?
        { name: 'tags', type: { name: 'array', generic: { name: 'string', nullable: false }, nullable: false }, modifiers: [] },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Taggable'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: {} }).artifacts[0].code;
    const tagsLine = code.split('\n').find(l => /^\s+tags /.test(l));
    expect(tagsLine).toBeDefined();
    // Must NOT contain ?
    expect(tagsLine!.includes('?')).toBe(false);
    expect(tagsLine).toMatch(/^\s+tags\s+String\[\]$/);
  });

  it('array field emits scalar-list @default when IR has a default value', () => {
    const ir = emptyIR();
    ir.entities.push({
      name: 'Taggable',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        {
          name: 'tags',
          type: { name: 'array', generic: { name: 'string', nullable: false }, nullable: false },
          modifiers: [],
          defaultValue: { kind: 'array', elements: [] },
        },
      ],
      computedProperties: [], relationships: [], commands: [], constraints: [], policies: [],
    });
    ir.stores.push(durableStore('Taggable'));

    const code = new PrismaProjection().generate(ir, { surface: 'prisma.schema', options: {} }).artifacts[0].code;
    const tagsLine = code.split('\n').find(l => /^\s+tags /.test(l));
    expect(tagsLine).toBeDefined();
    expect(tagsLine).toMatch(/^\s+tags\s+String\[\]\s+@default\(\[\]\)$/);
  });
});

// ---------------------------------------------------------------------------
// Multi-schema layout (G6): preserve module layout instead of flattening.
// ---------------------------------------------------------------------------

/** A durable entity in a named module (the "real layout" signal). */
function moduleEntity(name: string, moduleName: string | undefined): IREntity {
  return {
    name,
    module: moduleName,
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

describe('PrismaProjection — multi-schema layout (G6)', () => {
  it('is OFF by default: no @@schema, no schemas list (back-compat)', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.stores.push(durableStore('User'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql' },
    }).artifacts[0].code;

    expect(code).not.toMatch(/@@schema/);
    expect(code).not.toMatch(/schemas\s*=/);
  });

  it('emits a custom generator block and datasource relationMode from config', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.stores.push(durableStore('User'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        relationMode: 'prisma',
        generator: {
          provider: 'prisma-client',
          output: '../generated',
          moduleFormat: 'esm',
        },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+relationMode = "prisma"$/m);
    expect(code).toMatch(/generator client \{[\s\S]*?provider = "prisma-client"[\s\S]*?\}/);
    expect(code).toMatch(/^\s+output = "\.\.\/generated"$/m);
    expect(code).toMatch(/^\s+moduleFormat = "esm"$/m);
    // default generator is not emitted when overridden
    expect(code).not.toMatch(/prisma-client-js/);
  });

  it('defaults the generator to prisma-client-js and omits relationMode when unset', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.stores.push(durableStore('User'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql' },
    }).artifacts[0].code;

    expect(code).toMatch(/provider = "prisma-client-js"/);
    expect(code).not.toMatch(/relationMode/);
  });

  it('derives @@schema from entity.module and lists schemas on the datasource', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.entities.push(moduleEntity('Invoice', 'billing'));
    ir.stores.push(durableStore('User'));
    ir.stores.push(durableStore('Invoice'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql', multiSchema: { enabled: true } },
    });
    const code = result.artifacts[0].code;

    // datasource lists both schemas (sorted: auth, billing).
    expect(code).toMatch(/^\s+schemas\s+=\s+\["auth", "billing"\]$/m);
    // each model carries its module's @@schema.
    expect(code).toMatch(/model User \{[\s\S]*?@@schema\("auth"\)[\s\S]*?\}/);
    expect(code).toMatch(/model Invoice \{[\s\S]*?@@schema\("billing"\)[\s\S]*?\}/);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('entitySchema override takes precedence over the module', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.stores.push(durableStore('User'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        multiSchema: { enabled: true, entitySchema: { User: 'identity' } },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/@@schema\("identity"\)/);
    expect(code).not.toMatch(/@@schema\("auth"\)/);
    expect(code).toMatch(/^\s+schemas\s+=\s+\["identity"\]$/m);
  });

  it('falls back to defaultSchema for a module-less entity', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('Setting', undefined));
    ir.stores.push(durableStore('Setting'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql', multiSchema: { enabled: true, defaultSchema: 'core' } },
    }).artifacts[0].code;

    expect(code).toMatch(/@@schema\("core"\)/);
  });

  it('module-less entity defaults to "public" when defaultSchema is unset', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('Setting', undefined));
    ir.stores.push(durableStore('Setting'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql', multiSchema: { enabled: true } },
    }).artifacts[0].code;

    expect(code).toMatch(/@@schema\("public"\)/);
  });

  it('preserves explicit schemas order and appends used-but-unlisted schemas', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));      // listed
    ir.entities.push(moduleEntity('Audit', 'logging'));  // NOT listed → appended
    ir.stores.push(durableStore('User'));
    ir.stores.push(durableStore('Audit'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        multiSchema: { enabled: true, schemas: ['public', 'auth'] },
      },
    }).artifacts[0].code;

    // explicit order preserved (public, auth), then appended sorted (logging).
    expect(code).toMatch(/^\s+schemas\s+=\s+\["public", "auth", "logging"\]$/m);
  });

  it('errors on an unsupported provider and falls back to a flat layout', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.stores.push(durableStore('User'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'mysql', multiSchema: { enabled: true } },
    });
    const code = result.artifacts[0].code;

    expect(result.diagnostics.some(d => d.code === 'PRISMA_MULTISCHEMA_UNSUPPORTED_PROVIDER' && d.severity === 'error')).toBe(true);
    expect(code).not.toMatch(/@@schema/);
    expect(code).not.toMatch(/schemas\s*=/);
  });

  it('models-only mode (no provider): emits @@schema + info diagnostic, no datasource', () => {
    const ir = emptyIR();
    ir.entities.push(moduleEntity('User', 'auth'));
    ir.stores.push(durableStore('User'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { multiSchema: { enabled: true } },
    });
    const code = result.artifacts[0].code;

    expect(code).toMatch(/@@schema\("auth"\)/);
    expect(code).not.toMatch(/datasource db \{/);
    const info = result.diagnostics.find(d => d.code === 'PRISMA_MULTISCHEMA_MODELS_ONLY');
    expect(info?.severity).toBe('info');
    expect(info?.message).toMatch(/schemas = \["auth"\]/);
    // models-only → no prisma.config.ts companion (provider unset).
    expect(result.artifacts).toHaveLength(1);
  });
});

describe('PrismaProjection — naming convention (auto casing)', () => {
  /** Entity with camelCase columns to exercise the convention. */
  function userAccountEntity(): IREntity {
    return {
      name: 'UserAccount',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: [] },
        { name: 'displayName', type: { name: 'string', nullable: false }, modifiers: [] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
  }

  it("naming: 'snake_case' maps camelCase columns and pluralizes the table; identifiers unchanged", () => {
    const ir = emptyIR();
    ir.entities.push(userAccountEntity());
    ir.stores.push(durableStore('UserAccount'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { naming: 'snake_case' },
    }).artifacts[0].code;

    // Prisma field identifier stays camelCase; only @map carries the physical name.
    expect(code).toMatch(/^\s+createdAt DateTime\? @map\("created_at"\)$/m);
    expect(code).toMatch(/^\s+displayName String\? @map\("display_name"\)$/m);
    // Model name stays PascalCase; @@map carries the pluralized physical name.
    expect(code).toMatch(/^model UserAccount \{/m);
    expect(code).toMatch(/^\s+@@map\("user_accounts"\)$/m);
  });

  it("does not @map names that are already in the target case (id stays bare)", () => {
    const ir = emptyIR();
    ir.entities.push(userAccountEntity());
    ir.stores.push(durableStore('UserAccount'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { naming: 'snake_case' },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+id String @id$/m);
    expect(code).not.toMatch(/id String @id @map/);
  });

  it('maps default FK columns under the convention (authorId → author_id)', () => {
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
      options: { naming: 'snake_case' },
    }).artifacts[0].code;

    // FK identifier stays authorId; physical column mapped; relation reference unchanged.
    expect(code).toMatch(/^\s+authorId String @map\("author_id"\)$/m);
    expect(code).toMatch(/^\s+author Author @relation\(fields: \[authorId\], references: \[id\]\)$/m);
  });

  it('explicit tableMappings / columnMappings override the convention', () => {
    const ir = emptyIR();
    ir.entities.push(userAccountEntity());
    ir.stores.push(durableStore('UserAccount'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        naming: 'snake_case',
        tableMappings: { UserAccount: 'accounts' },
        columnMappings: { UserAccount: { createdAt: 'inserted_at' } },
      },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+@@map\("accounts"\)$/m);
    expect(code).not.toMatch(/user_accounts/);
    expect(code).toMatch(/^\s+createdAt DateTime\? @map\("inserted_at"\)$/m);
    expect(code).not.toMatch(/created_at/);
  });

  it('pluralizeTables: false casing without pluralization', () => {
    const ir = emptyIR();
    ir.entities.push(widgetEntity());
    ir.stores.push(durableStore('Widget'));

    const code = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { naming: { table: 'snake_case', column: 'snake_case', pluralizeTables: false } },
    }).artifacts[0].code;

    expect(code).toMatch(/^\s+@@map\("widget"\)$/m);
  });

  it('no naming option → output identical to default (no @map/@@map added)', () => {
    const ir = emptyIR();
    ir.entities.push(userAccountEntity());
    ir.stores.push(durableStore('UserAccount'));

    const withoutOption = new PrismaProjection().generate(ir, { surface: 'prisma.schema' }).artifacts[0].code;
    const withEmptyOptions = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {},
    }).artifacts[0].code;

    expect(withoutOption).toBe(withEmptyOptions);
    expect(withoutOption).not.toMatch(/@map/);
    expect(withoutOption).not.toMatch(/@@map/);
  });
});

describe('PrismaProjection — date/time primitive types', () => {
  it('maps time → DateTime and duration → Float', () => {
    const ir = emptyIR();
    ir.entities.push(
      bareEntity('Gadget', {
        properties: [
          { name: 'openAt', type: { name: 'time', nullable: false }, modifiers: ['required'] },
          { name: 'span', type: { name: 'duration', nullable: false }, modifiers: ['required'] },
        ],
      }),
    );
    ir.stores.push(durableStore('Gadget'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });

    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toMatch(/^\s+openAt DateTime$/m);
    expect(code).toMatch(/^\s+span Float$/m);

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });
});

describe('PrismaProjection — enum types', () => {
  function statusEnum() {
    return {
      name: 'Status',
      values: [
        { name: 'draft' },
        { name: 'published', label: 'Published' },
        { name: 'archived', ordinal: 2 },
      ],
    };
  }

  it('emits an enum block, types the column as the enum, and emits a BARE @default', () => {
    const ir = emptyIR();
    ir.enums.push(statusEnum());
    ir.entities.push(
      bareEntity('Article', {
        properties: [
          {
            name: 'status',
            type: { name: 'Status', nullable: false },
            modifiers: ['required'],
            defaultValue: { kind: 'string', value: 'draft' },
          },
        ],
      }),
    );
    ir.stores.push(durableStore('Article'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0].code;

    // Enum block with BARE value names — label ("Published") and ordinal (2) are
    // UI/sort-only and intentionally dropped; no @map (that would change the value).
    expect(code).toMatch(/enum Status \{/);
    expect(code).toMatch(/^\s+draft$/m);
    expect(code).toMatch(/^\s+published$/m);
    expect(code).toMatch(/^\s+archived$/m);
    expect(code).not.toMatch(/Published/);
    expect(code).not.toMatch(/@map/);

    // Column typed as the enum; default emitted bare (not quoted like a string).
    expect(code).toMatch(/^\s+status Status @default\(draft\)$/m);
    expect(code).not.toMatch(/@default\("draft"\)/);

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });

  it('does NOT emit an enum referenced only by a skipped (memory) entity', () => {
    const ir = emptyIR();
    ir.enums.push({ name: 'Color', values: [{ name: 'red' }, { name: 'blue' }] });
    ir.entities.push(
      bareEntity('Palette', {
        properties: [{ name: 'color', type: { name: 'Color', nullable: false }, modifiers: ['required'] }],
      }),
    );
    ir.stores.push(memoryStore('Palette'));

    const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
    const code = result.artifacts[0]?.code ?? '';
    expect(code).not.toMatch(/enum Color/);
  });

  it('places the enum in its module schema under multiSchema and lists it in the datasource', () => {
    const ir = emptyIR();
    ir.enums.push({ name: 'Stage', module: 'sales', values: [{ name: 'lead' }, { name: 'won' }] });
    ir.entities.push({
      name: 'Deal',
      module: 'sales',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'stage', type: { name: 'Stage', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    });
    ir.stores.push(durableStore('Deal'));

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: { provider: 'postgresql', multiSchema: { enabled: true } },
    });
    const code = result.artifacts[0].code;

    expect(code).toMatch(/enum Stage \{/);
    expect(code).toMatch(/^\s+@@schema\("sales"\)$/m);
    expect(code).toMatch(/schemas\s+= \[[^\]]*"sales"[^\]]*\]/);

    const errs = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(0);
  });
});
