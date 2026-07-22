/**
 * Convex masking emit — field collection + query codegen wiring.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity } from '../../ir';
import { ConvexProjection } from './generator.js';
import {
  maskedFieldEmits,
  serializeMaskedFields,
  maskAndStripPrivateDoc,
} from './masking-emit.js';
import { collectUnsupportedDiagnostics } from './capabilities.js';

function patientEntity(): IREntity {
  return {
    name: 'Patient',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      {
        name: 'ssn',
        type: { name: 'string', nullable: false },
        modifiers: ['masked'],
        maskStrategy: { type: 'partial', params: [0, 4] },
      },
      {
        name: 'contact',
        type: { name: 'string', nullable: false },
        modifiers: ['masked'],
        maskStrategy: {
          type: 'email',
          unmaskWhen: {
            kind: 'binary',
            operator: '==',
            left: { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'role' },
            right: { kind: 'literal', value: { kind: 'string', value: 'admin' } },
          },
        },
      },
      {
        name: 'shadowEmail',
        type: { name: 'string', nullable: false },
        modifiers: ['private', 'masked'],
        maskStrategy: { type: 'email' },
      },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function irWithPatient(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'mask-test',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [patientEntity()],
    enums: [],
    stores: [{ entity: 'Patient', target: 'durable', config: {} }],
    events: [],
    commands: [],
    policies: [],
  };
}

describe('maskedFieldEmits', () => {
  it('includes non-private masked fields and lowers unmaskWhen', () => {
    const fields = maskedFieldEmits(patientEntity());
    expect(fields.map((f) => f.name)).toEqual(['ssn', 'contact']);
    expect(fields[0]?.strategy).toEqual({ type: 'partial', params: [0, 4] });
    expect(fields[1]?.unmaskWhenCode).toContain('user.role');
  });

  it('serializes unmaskWhen as an arrow function', () => {
    const fields = maskedFieldEmits(patientEntity());
    const lit = serializeMaskedFields(fields);
    expect(lit).toContain('unmaskWhen: (self: any, user: any, context: any) =>');
    expect(lit).toContain('partial');
  });
});

describe('maskAndStripPrivateDoc', () => {
  it('emits __maskDoc before private strip', () => {
    const fields = maskedFieldEmits(patientEntity());
    const code = maskAndStripPrivateDoc('doc', fields, ['shadowEmail'], '{}');
    expect(code).toContain('__maskDoc');
    expect(code).toContain('delete (__out as any).shadowEmail');
  });
});

describe('Convex projection — masked reads', () => {
  it('no longer emits CONVEX_UNSUPPORTED_MASKED', () => {
    const diags = collectUnsupportedDiagnostics(irWithPatient());
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_MASKED')).toBe(false);
  });

  it('emits __maskDoc helper on list/get queries', () => {
    const result = new ConvexProjection().generate(irWithPatient(), {
      surface: 'convex.queries',
      options: { authContextImport: './lib/auth' },
    });
    const code = result.artifacts[0]?.code ?? '';
    expect(code).toContain('function __maskDoc(');
    expect(code).toContain('function __applyMaskStrategy(');
    expect(code).toContain('__maskDoc(');
    expect(code).toMatch(/unmaskWhen:\s*\(self/);
  });
});
