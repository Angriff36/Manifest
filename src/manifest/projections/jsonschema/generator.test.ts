/**
 * Tests for the JSON Schema projection.
 *
 * Generic fixtures only — hand-built IR object literals so the projection's
 * input contract is exercised in isolation (same idiom as the Prisma and Zod
 * projection tests).
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity } from '../../ir';
import { JsonSchemaProjection } from './generator';

function makeMinimalIR(overrides: Partial<IR> = {}): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-fixture-hash',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

function bareEntity(name: string, properties: IREntity['properties']): IREntity {
  return {
    name,
    properties,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

describe('JsonSchemaProjection — date/time primitive types', () => {
  it('maps time → { type: string, format: time } and duration → { type: number }', () => {
    const ir = makeMinimalIR({
      entities: [
        bareEntity('Gadget', [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'openAt', type: { name: 'time', nullable: false }, modifiers: ['required'] },
          { name: 'span', type: { name: 'duration', nullable: false }, modifiers: ['required'] },
        ]),
      ],
    });

    const result = new JsonSchemaProjection().generate(ir, {
      surface: 'jsonschema.entity',
      entity: 'Gadget',
    });

    expect(result.artifacts).toHaveLength(1);
    const schema = JSON.parse(result.artifacts[0].code);
    expect(schema.properties.openAt).toEqual({ type: 'string', format: 'time' });
    expect(schema.properties.span).toEqual({ type: 'number' });

    const unknownTypeWarnings = result.diagnostics.filter((d) => d.code === 'UNKNOWN_TYPE');
    expect(unknownTypeWarnings).toHaveLength(0);
  });
});
