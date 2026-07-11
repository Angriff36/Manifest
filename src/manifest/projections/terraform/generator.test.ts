/**
 * @manifest/projection-terraform — generic-fixture tests.
 *
 * EVERY fixture here is generic by construction. No real-app entity,
 * table, or resource name appears in this file. Fixtures are hand-built
 * IR object literals so the projection's true input contract is exercised
 * in isolation.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IREvent, IRStore } from '../../ir';
import { TerraformProjection } from './generator.js';

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

function widgetEntity(): IREntity {
  return {
    name: 'Widget',
    properties: [
      { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
      { name: 'label', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'count', type: { name: 'int', nullable: true }, modifiers: [] },
      { name: 'active', type: { name: 'boolean', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [
      {
        name: 'status',
        type: { name: 'string', nullable: false },
        expression: { kind: 'literal', value: { kind: 'string', value: 'ok' } },
        dependencies: [],
      },
    ],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function orderEntity(): IREntity {
  return {
    name: 'Order',
    properties: [
      { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
      { name: 'amount', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: [] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function postgresStore(entityName: string): IRStore {
  return { entity: entityName, target: 'postgres', config: {} };
}

function supabaseStore(entityName: string): IRStore {
  return { entity: entityName, target: 'supabase', config: {} };
}

function memoryStore(entityName: string): IRStore {
  return { entity: entityName, target: 'memory', config: {} };
}

function durableStore(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}

function widgetEvent(): IREvent {
  return {
    name: 'WidgetCreated',
    channel: 'widgets.created',
    payload: [{ name: 'id', type: { name: 'uuid', nullable: false }, required: true }],
  };
}

function irWithWidget(): IR {
  return {
    ...emptyIR(),
    entities: [widgetEntity()],
    stores: [postgresStore('Widget')],
  };
}

function irWithWidgetAndOrder(): IR {
  return {
    ...emptyIR(),
    entities: [widgetEntity(), orderEntity()],
    stores: [postgresStore('Widget'), postgresStore('Order')],
    events: [widgetEvent()],
  };
}

// ---------------------------------------------------------------------------
// Projection target metadata
// ---------------------------------------------------------------------------

describe('TerraformProjection — projection target metadata', () => {
  it('declares the expected name, description and surfaces', () => {
    const p = new TerraformProjection();
    expect(p.name).toBe('terraform');
    expect(p.surfaces).toEqual(['terraform.hcl']);
    expect(p.description).toMatch(/Terraform/i);
    expect(p.description).toMatch(/AWS/);
    expect(p.description).toMatch(/GCP/);
    expect(p.description).toMatch(/Supabase/);
  });

  it('rejects unknown surfaces with a structured diagnostic', () => {
    const p = new TerraformProjection();
    const result = p.generate(emptyIR(), { surface: 'terraform.unknown' });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    expect(result.diagnostics[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// AWS provider
// ---------------------------------------------------------------------------

describe('TerraformProjection — AWS provider', () => {
  it('emits aws_db_instance and aws_db_instance_table for persistent entities', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "aws_db_instance"');
    expect(code).toContain('resource "aws_db_instance_table"');
    expect(code).toContain('engine             = "postgres"');
    expect(code).toContain('region = "us-east-1"');
  });

  it('emits aws_s3_bucket resources for declared storage buckets', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: {
        provider: 'aws',
        storageBuckets: [{ name: 'widget-assets', entity: 'Widget' }],
      },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "aws_s3_bucket"');
    expect(code).toContain('bucket = "widget-assets"');
    expect(code).toContain('versioning_configuration');
    expect(code).toContain('server_side_encryption_configuration');
  });

  it('emits aws_sns_topic for each IR event', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidgetAndOrder(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "aws_sns_topic"');
    expect(code).toContain('name = "widget_created"');
  });

  it('emits the AWS provider config block', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('terraform {');
    expect(code).toContain('provider "aws"');
    expect(code).toContain('hashicorp/aws');
  });
});

// ---------------------------------------------------------------------------
// GCP provider
// ---------------------------------------------------------------------------

describe('TerraformProjection — GCP provider', () => {
  it('emits google_sql_database_instance for the database', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'gcp' },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "google_sql_database_instance"');
    expect(code).toContain('resource "google_sql_table"');
  });

  it('emits google_storage_bucket for declared buckets', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: {
        provider: 'gcp',
        storageBuckets: [{ name: 'widget-bucket' }],
      },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "google_storage_bucket"');
    expect(code).toContain('name     = "widget-bucket"');
    expect(code).toContain('versioning');
  });

  it('emits google_pubsub_topic for each IR event', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidgetAndOrder(), {
      surface: 'terraform.hcl',
      options: { provider: 'gcp' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "google_pubsub_topic"');
    expect(code).toContain('name = "widget_created"');
  });

  it('emits the GCP provider config block', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'gcp' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('provider "google"');
    expect(code).toContain('hashicorp/google');
  });
});

// ---------------------------------------------------------------------------
// Supabase provider
// ---------------------------------------------------------------------------

describe('TerraformProjection — Supabase provider', () => {
  it('emits supabase_project for the database', () => {
    const p = new TerraformProjection();
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [supabaseStore('Widget')],
    };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'supabase' },
    });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "supabase_project"');
    expect(code).toContain('supabase/supabase');
  });

  it('emits table documentation for Supabase entities', () => {
    const p = new TerraformProjection();
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [supabaseStore('Widget')],
    };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'supabase' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('Table: widgets');
    expect(code).toContain('Entity: Widget');
  });
});

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

describe('TerraformProjection — type mapping', () => {
  it('maps standard IR types to PostgreSQL column types', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('type = "UUID"');
    expect(code).toContain('type = "TEXT"');
    expect(code).toContain('type = "INTEGER"');
    expect(code).toContain('type = "BOOLEAN"');
  });

  it('marks primary key columns and NOT NULL constraints', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('name = "id"');
    expect(code).toContain('primary_key = true');
    expect(code).toContain('nullable = false');
  });

  it('emits an error diagnostic for unknown property types', () => {
    const p = new TerraformProjection();
    const entity: IREntity = {
      name: 'Custom',
      properties: [
        { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
        {
          name: 'mystery',
          type: { name: 'unknownType', nullable: false },
          modifiers: [],
        },
      ],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    const ir: IR = { ...emptyIR(), entities: [entity], stores: [postgresStore('Custom')] };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result.diagnostics.some((d) => d.code === 'UNKNOWN_TYPE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skipping rules
// ---------------------------------------------------------------------------

describe('TerraformProjection — skipping rules', () => {
  it('skips entities with no store declaration', () => {
    const p = new TerraformProjection();
    const ir: IR = { ...emptyIR(), entities: [widgetEntity()] };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result.diagnostics.some((d) => d.code === 'SKIPPED_NO_STORE')).toBe(true);
  });

  it('skips entities with non-persistent store targets (memory)', () => {
    const p = new TerraformProjection();
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [memoryStore('Widget')],
    };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result.diagnostics.some((d) => d.code === 'SKIPPED_NON_PERSISTENT')).toBe(true);
  });

  it('skips entities with durable store target (not infra-provisionable)', () => {
    const p = new TerraformProjection();
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity()],
      stores: [durableStore('Widget')],
    };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result.diagnostics.some((d) => d.code === 'SKIPPED_NON_PERSISTENT')).toBe(true);
  });

  it('never iterates computedProperties as stored columns', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const code = result.artifacts[0].code;
    // The entity has a computed property 'status' — it must NOT appear as a column.
    // We check that 'status' is not in any column block.
    const statusColumn = /column \{[^}]*name = "status"/s.test(code);
    expect(statusColumn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Output modes
// ---------------------------------------------------------------------------

describe('TerraformProjection — output modes', () => {
  it('emits a single file by default', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe('terraform.hcl');
    expect(result.artifacts[0].pathHint).toBe('main.tf');
    expect(result.artifacts[0].contentType).toBe('hcl');
  });

  it('emits multiple files when emitSingleFile is false', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidgetAndOrder(), {
      surface: 'terraform.hcl',
      options: {
        provider: 'aws',
        emitSingleFile: false,
        storageBuckets: [{ name: 'assets' }],
      },
    });
    const ids = result.artifacts.map((a) => a.id);
    expect(ids).toContain('terraform.provider');
    expect(ids).toContain('terraform.database');
    expect(ids).toContain('terraform.storage');
    expect(ids).toContain('terraform.messaging');
  });

  it('omits the provider config when emitProviderConfig is false', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: { provider: 'aws', emitProviderConfig: false },
    });
    const code = result.artifacts[0].code;
    expect(code).not.toContain('terraform {');
    expect(code).not.toContain('provider "aws"');
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('TerraformProjection — determinism', () => {
  it('produces byte-identical output across two runs', () => {
    const p = new TerraformProjection();
    const ir = irWithWidgetAndOrder();
    const result1 = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const result2 = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    expect(result1.artifacts[0].code).toBe(result2.artifacts[0].code);
  });
});

// ---------------------------------------------------------------------------
// Database config overrides
// ---------------------------------------------------------------------------

describe('TerraformProjection — database config overrides', () => {
  it('honors custom instance class, engine version, and region', () => {
    const p = new TerraformProjection();
    const result = p.generate(irWithWidget(), {
      surface: 'terraform.hcl',
      options: {
        provider: 'aws',
        databaseConfig: {
          instanceClass: 'db.r5.large',
          engineVersion: '16',
          region: 'eu-west-1',
          allocatedStorage: 100,
        },
      },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('instance_class     = "db.r5.large"');
    expect(code).toContain('engine_version     = "16"');
    expect(code).toContain('allocated_storage  = 100');
    expect(code).toContain('region = "eu-west-1"');
  });
});

// ---------------------------------------------------------------------------
// IR source order preservation
// ---------------------------------------------------------------------------

describe('TerraformProjection — IR source order', () => {
  it('emits resources in IR declaration order', () => {
    const p = new TerraformProjection();
    const ir: IR = {
      ...emptyIR(),
      entities: [widgetEntity(), orderEntity()],
      stores: [postgresStore('Widget'), postgresStore('Order')],
    };
    const result = p.generate(ir, {
      surface: 'terraform.hcl',
      options: { provider: 'aws' },
    });
    const code = result.artifacts[0].code;
    const widgetIdx = code.indexOf('table_widget');
    const orderIdx = code.indexOf('table_order');
    expect(widgetIdx).toBeGreaterThan(-1);
    expect(orderIdx).toBeGreaterThan(-1);
    expect(widgetIdx).toBeLessThan(orderIdx);
  });
});
