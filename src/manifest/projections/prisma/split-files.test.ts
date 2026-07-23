/**
 * Config G6 — Prisma multiSchema.splitFiles proofs.
 */

import { describe, expect, it } from 'vitest';
import type { IR, IREntity, IRStore } from '../../ir.js';
import { PrismaProjection } from './generator.js';
import { schemaFileStem } from './split-files.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
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

function durable(name: string): IRStore {
  return { entity: name, target: 'durable', config: {} };
}

function entity(name: string, module?: string): IREntity {
  return {
    name,
    module,
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

describe('schemaFileStem', () => {
  it('sanitizes unsafe schema names', () => {
    expect(schemaFileStem('auth')).toBe('auth');
    expect(schemaFileStem('billing ops')).toBe('billing_ops');
  });
});

describe('Prisma multiSchema.splitFiles', () => {
  it('emits root datasource file plus one partition per schema', () => {
    const ir = emptyIR();
    ir.entities = [entity('User', 'auth'), entity('Invoice', 'billing')];
    ir.stores = [durable('User'), durable('Invoice')];

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        output: 'prisma/schema.prisma',
        multiSchema: {
          enabled: true,
          splitFiles: { enabled: true, dir: 'prisma/schemas' },
        },
      },
    });

    const paths = result.artifacts.map((a) => a.pathHint).sort();
    expect(paths).toEqual([
      'prisma.config.ts',
      'prisma/schema.prisma',
      'prisma/schemas/auth.prisma',
      'prisma/schemas/billing.prisma',
    ]);

    const root = result.artifacts.find((a) => a.id === 'prisma.schema')!;
    expect(root.code).toContain('provider = "postgresql"');
    expect(root.code).toContain('schemas  = ["auth", "billing"]');
    expect(root.code).not.toContain('model User');
    expect(root.code).toContain('prisma/schemas/');

    const auth = result.artifacts.find((a) => a.pathHint === 'prisma/schemas/auth.prisma')!;
    expect(auth.code).toContain('model User');
    expect(auth.code).toContain('@@schema("auth")');
    expect(auth.code).not.toContain('model Invoice');

    const billing = result.artifacts.find((a) => a.pathHint === 'prisma/schemas/billing.prisma')!;
    expect(billing.code).toContain('model Invoice');
    expect(billing.code).toContain('@@schema("billing")');
  });

  it('errors when splitFiles is enabled without multiSchema', () => {
    const ir = emptyIR();
    ir.entities = [entity('User')];
    ir.stores = [durable('User')];

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        multiSchema: {
          splitFiles: { enabled: true },
        },
      },
    });

    expect(
      result.diagnostics.some((d) => d.code === 'PRISMA_SPLITFILES_REQUIRES_MULTISCHEMA'),
    ).toBe(true);
    expect(result.artifacts.filter((a) => a.contentType === 'prisma')).toHaveLength(1);
  });

  it('keeps single-file emit when splitFiles is off', () => {
    const ir = emptyIR();
    ir.entities = [entity('User', 'auth')];
    ir.stores = [durable('User')];

    const result = new PrismaProjection().generate(ir, {
      surface: 'prisma.schema',
      options: {
        provider: 'postgresql',
        multiSchema: { enabled: true },
      },
    });

    const prismaFiles = result.artifacts.filter((a) => a.contentType === 'prisma');
    expect(prismaFiles).toHaveLength(1);
    expect(prismaFiles[0]!.code).toContain('model User');
    expect(prismaFiles[0]!.code).toContain('@@schema("auth")');
  });
});
