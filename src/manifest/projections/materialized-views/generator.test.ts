/**
 * @manifest/projection-materialized-views — generic-fixture tests.
 *
 * EVERY fixture here is generic by construction. No real-app entity, table,
 * or view name appears in this file. Fixtures are hand-built IR object
 * literals so the projection's true input contract is exercised in isolation.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRComputedProperty, IRExpression } from '../../ir';
import { MaterializedViewsProjection } from './generator.js';
import { translateExpression } from './expression-to-sql.js';

// ---------------------------------------------------------------------------
// Generic-fixture builders
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

function orderEntity(): IREntity {
  const sumExpr: IRExpression = {
    kind: 'call',
    callee: { kind: 'identifier', name: 'SUM' },
    args: [{ kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'amount' }],
  };

  const computed: IRComputedProperty = {
    name: 'totalAmount',
    type: { name: 'number', nullable: false },
    expression: sumExpr,
    dependencies: ['amount'],
  };

  return {
    name: 'Order',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'amount', type: { name: 'number', nullable: false }, modifiers: ['required'] },
      { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [computed],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function irWithOrder(): IR {
  return { ...emptyIR(), entities: [orderEntity()] };
}

// ---------------------------------------------------------------------------
// Projection target metadata
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — projection target metadata', () => {
  it('declares the expected name, description and surfaces', () => {
    const p = new MaterializedViewsProjection();
    expect(p.name).toBe('materialized-views');
    expect(p.surfaces).toEqual(['materialized-views.ddl']);
    expect(p.description).toMatch(/PostgreSQL/);
    expect(p.description).toMatch(/MATERIALIZED VIEW/i);
  });

  it('rejects unknown surfaces with a structured diagnostic', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(emptyIR(), { surface: 'materialized-views.unknown' });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Empty / no-views configurations
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — empty configurations', () => {
  it('returns a warning when no views are declared', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), { surface: 'materialized-views.ddl', options: {} });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('NO_VIEWS_DECLARED');
    expect(result.diagnostics[0].severity).toBe('warning');
  });

  it('returns an error when source entity is not in the IR', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(emptyIR(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [{ name: 'missing_view', source: 'NonExistent' }],
      },
    });
    expect(result.diagnostics.some((d) => d.code === 'UNKNOWN_SOURCE')).toBe(true);
    // The artifact is still emitted (with an error comment) so the consumer
    // can see what went wrong; the diagnostic is the authoritative signal.
    expect(result.artifacts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// On-demand refresh
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — on-demand refresh strategy', () => {
  it('emits CREATE MATERIALIZED VIEW with stored props + translated computed columns', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [{ name: 'all_orders', source: 'Order' }],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toContain('CREATE MATERIALIZED VIEW "all_orders"');
    expect(code).toContain('WITH DATA');
    expect(code).toContain('"id"');
    expect(code).toContain('"amount"');
    expect(code).toContain('SUM("amount") AS "totalAmount"');
    expect(code).toContain('FROM "orders"');
    expect(code).toContain('REFRESH MATERIALIZED VIEW "all_orders"');
  });

  it('honors custom viewName and sourceTable overrides', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'customView',
            source: 'Order',
            viewName: 'custom_view',
            sourceTable: 'tbl_orders',
          },
        ],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('CREATE MATERIALIZED VIEW "custom_view"');
    expect(code).toContain('FROM "tbl_orders"');
  });

  it('qualifies names with a schema prefix when configured', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        schema: 'analytics',
        views: [{ name: 'schema_view', source: 'Order' }],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('"analytics"."schema_view"');
    expect(code).toContain('FROM "analytics"."orders"');
  });

  it('emits WITH NO DATA when configured', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [{ name: 'lazy_view', source: 'Order', withNoData: true }],
      },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('WITH NO DATA');
  });
});

// ---------------------------------------------------------------------------
// Column expressions
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — column expressions', () => {
  it('translates consumer-supplied SQL column expressions', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'order_summary',
            source: 'Order',
            columns: {
              dayBucket: "DATE_TRUNC('day', created_at)",
              totalAmount: 'SUM(amount)',
              orderCount: 'COUNT(*)',
            },
          },
        ],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('DATE_TRUNC(\'day\', created_at) AS "dayBucket"');
    expect(code).toContain('SUM(amount) AS "totalAmount"');
    expect(code).toContain('COUNT(*) AS "orderCount"');
  });
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — index emission', () => {
  it('emits CREATE INDEX for each declared index', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'indexed_view',
            source: 'Order',
            indexes: [
              { columns: ['status'], unique: true },
              { columns: ['id', 'amount'], name: 'idx_id_amount' },
              { columns: ['status'], method: 'hash', where: "status <> 'archived'" },
            ],
          },
        ],
      },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('CREATE UNIQUE INDEX');
    expect(code).toContain('ON "indexed_view"');
    expect(code).toContain('USING btree');
    expect(code).toContain('USING hash');
    expect(code).toContain('idx_id_amount');
    expect(code).toContain("WHERE status <> 'archived'");
  });
});

// ---------------------------------------------------------------------------
// Scheduled refresh strategy
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — scheduled refresh strategy', () => {
  it('emits a pg_cron schedule when cron expression is provided', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'hourly_view',
            source: 'Order',
            refreshStrategy: 'scheduled',
            schedule: { cron: '0 * * * *' },
          },
        ],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('SELECT cron.schedule(');
    expect(code).toContain("'0 * * * *'");
    expect(code).toContain('REFRESH MATERIALIZED VIEW "hourly_view"');
  });

  it('emits a pg_cron schedule when interval is provided', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'interval_view',
            source: 'Order',
            refreshStrategy: 'scheduled',
            schedule: { interval: '1 hour' },
          },
        ],
      },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain("'1 hour'");
  });

  it('reports an error when scheduled strategy has no schedule config', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'broken_scheduled',
            source: 'Order',
            refreshStrategy: 'scheduled',
          },
        ],
      },
    });
    expect(result.diagnostics.some((d) => d.code === 'MISSING_SCHEDULE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trigger-based refresh strategy
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — trigger-based refresh strategy', () => {
  it('emits a trigger function and trigger statement', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'triggered_view',
            source: 'Order',
            refreshStrategy: 'trigger-based',
            trigger: { sourceTable: 'orders', column: 'amount', debounceSeconds: 5 },
          },
        ],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('CREATE OR REPLACE FUNCTION refresh_triggered_view()');
    expect(code).toContain('RETURNS TRIGGER');
    expect(code).toContain('CREATE TRIGGER orders_refresh_triggered_view');
    expect(code).toContain('AFTER UPDATE OF "amount"');
    expect(code).toContain('EXECUTE FUNCTION refresh_triggered_view()');
  });

  it('reports an error when trigger strategy is missing sourceTable', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        views: [
          {
            name: 'broken_trigger',
            source: 'Order',
            refreshStrategy: 'trigger-based',
            trigger: {},
          },
        ],
      },
    });
    expect(result.diagnostics.some((d) => d.code === 'MISSING_TRIGGER')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-view artifact mode
// ---------------------------------------------------------------------------

describe('MaterializedViewsProjection — per-view artifact mode', () => {
  it('emits one artifact per view when emitSingleFile is false', () => {
    const p = new MaterializedViewsProjection();
    const result = p.generate(irWithOrder(), {
      surface: 'materialized-views.ddl',
      options: {
        emitSingleFile: false,
        views: [
          { name: 'view_a', source: 'Order' },
          { name: 'view_b', source: 'Order' },
        ],
      },
    });
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0].id).toBe('materialized-views.view_a.ddl');
    expect(result.artifacts[1].id).toBe('materialized-views.view_b.ddl');
    expect(result.artifacts[0].pathHint).toBe('view_a.sql');
  });
});

// ---------------------------------------------------------------------------
// Expression-to-SQL translator
// ---------------------------------------------------------------------------

describe('translateExpression — IRExpression to SQL', () => {
  const columnResolver = (name: string) => `col_${name}`;

  it('translates a literal number', () => {
    const { sql, diagnostics } = translateExpression(
      { kind: 'literal', value: { kind: 'number', value: 42 } },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('42');
    expect(diagnostics).toHaveLength(0);
  });

  it('translates a literal string with proper escaping', () => {
    const { sql } = translateExpression(
      { kind: 'literal', value: { kind: 'string', value: "O'Reilly" } },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe("'O''Reilly'");
  });

  it('translates a literal boolean to TRUE/FALSE', () => {
    const { sql: t } = translateExpression(
      { kind: 'literal', value: { kind: 'boolean', value: true } },
      columnResolver,
      'Entity',
    );
    expect(t).toBe('TRUE');
    const { sql: f } = translateExpression(
      { kind: 'literal', value: { kind: 'boolean', value: false } },
      columnResolver,
      'Entity',
    );
    expect(f).toBe('FALSE');
  });

  it('translates a literal null to NULL', () => {
    const { sql } = translateExpression(
      { kind: 'literal', value: { kind: 'null' } },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('NULL');
  });

  it('translates an identifier to a resolved column', () => {
    const { sql, diagnostics } = translateExpression(
      { kind: 'identifier', name: 'amount' },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('col_amount');
    expect(diagnostics).toHaveLength(0);
  });

  it('reports an error for an unknown identifier', () => {
    const strictResolver = (name: string) => (name === 'known' ? `col_${name}` : undefined);
    const { diagnostics } = translateExpression(
      { kind: 'identifier', name: 'ghost' },
      strictResolver,
      'Entity',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('UNKNOWN_PROPERTY');
  });

  it('translates self.prop member access to the resolved column', () => {
    const { sql, diagnostics } = translateExpression(
      {
        kind: 'member',
        object: { kind: 'identifier', name: 'self' },
        property: 'amount',
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('col_amount');
    expect(diagnostics).toHaveLength(0);
  });

  it('translates a binary expression with arithmetic', () => {
    const { sql } = translateExpression(
      {
        kind: 'binary',
        operator: '*',
        left: { kind: 'identifier', name: 'qty' },
        right: { kind: 'identifier', name: 'price' },
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('(col_qty * col_price)');
  });

  it('translates a binary expression with logical AND', () => {
    const { sql } = translateExpression(
      {
        kind: 'binary',
        operator: 'AND',
        left: { kind: 'identifier', name: 'a' },
        right: { kind: 'identifier', name: 'b' },
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('(col_a AND col_b)');
  });

  it('translates === to = and !== to !=', () => {
    const { sql: eq } = translateExpression(
      {
        kind: 'binary',
        operator: '===',
        left: { kind: 'identifier', name: 'a' },
        right: { kind: 'identifier', name: 'b' },
      },
      columnResolver,
      'Entity',
    );
    expect(eq).toBe('(col_a = col_b)');
    const { sql: neq } = translateExpression(
      {
        kind: 'binary',
        operator: '!==',
        left: { kind: 'identifier', name: 'a' },
        right: { kind: 'identifier', name: 'b' },
      },
      columnResolver,
      'Entity',
    );
    expect(neq).toBe('(col_a != col_b)');
  });

  it('translates a unary NOT', () => {
    const { sql } = translateExpression(
      {
        kind: 'unary',
        operator: 'NOT',
        operand: { kind: 'identifier', name: 'active' },
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('NOT col_active');
  });

  it('translates a call expression to a function call', () => {
    const { sql } = translateExpression(
      {
        kind: 'call',
        callee: { kind: 'identifier', name: 'SUM' },
        args: [{ kind: 'identifier', name: 'amount' }],
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('SUM(col_amount)');
  });

  it('translates a conditional to CASE WHEN', () => {
    const { sql } = translateExpression(
      {
        kind: 'conditional',
        condition: { kind: 'identifier', name: 'active' },
        consequent: { kind: 'literal', value: { kind: 'number', value: 1 } },
        alternate: { kind: 'literal', value: { kind: 'number', value: 0 } },
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('CASE WHEN col_active THEN 1 ELSE 0 END');
  });

  it('translates an array literal to ARRAY[...]', () => {
    const { sql } = translateExpression(
      {
        kind: 'array',
        elements: [
          { kind: 'literal', value: { kind: 'number', value: 1 } },
          { kind: 'literal', value: { kind: 'number', value: 2 } },
        ],
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('ARRAY[1, 2]');
  });

  it('translates an object expression to json_build_object with a warning', () => {
    const { sql, diagnostics } = translateExpression(
      {
        kind: 'object',
        properties: [
          {
            key: 'name',
            value: { kind: 'literal', value: { kind: 'string', value: 'foo' } },
          },
        ],
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toContain('json_build_object');
    expect(diagnostics.some((d) => d.code === 'OBJECT_EXPRESSION_INLINED')).toBe(true);
  });

  it('rejects a lambda expression with an error', () => {
    const { sql, diagnostics } = translateExpression(
      {
        kind: 'lambda',
        params: ['x'],
        body: { kind: 'identifier', name: 'x' },
      },
      columnResolver,
      'Entity',
    );
    expect(sql).toBe('NULL');
    expect(diagnostics.some((d) => d.code === 'UNSUPPORTED_LAMBDA')).toBe(true);
  });
});
