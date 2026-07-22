/**
 * Zod per-module pathHint nesting.
 */

import { describe, expect, it } from 'vitest';
import type { IR, IRCommand, IREntity, IRStore } from '../../ir.js';
import { ZodProjection } from './generator.js';
import {
  zodCommandSchemaPathHint,
  zodEntitySchemaPathHint,
  zodModuleDirSegment,
} from './path-hints.js';

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

describe('zodModuleDirSegment', () => {
  it('sanitizes module names', () => {
    expect(zodModuleDirSegment('kitchen ops')).toBe('kitchen_ops');
    expect(zodModuleDirSegment(undefined)).toBeUndefined();
  });
});

describe('zod path hints', () => {
  it('keeps flat paths without module', () => {
    expect(zodEntitySchemaPathHint({ name: 'Recipe' })).toBe('schemas/Recipe.schema.ts');
    expect(
      zodCommandSchemaPathHint({ commandName: 'create', entityName: 'Recipe' }),
    ).toBe('schemas/Recipe_create.schema.ts');
  });

  it('nests under module directory when set', () => {
    expect(zodEntitySchemaPathHint({ name: 'Recipe', module: 'kitchen' })).toBe(
      'schemas/kitchen/Recipe.schema.ts',
    );
    expect(
      zodCommandSchemaPathHint({
        commandName: 'create',
        entityName: 'Recipe',
        moduleName: 'kitchen',
      }),
    ).toBe('schemas/kitchen/Recipe_create.schema.ts');
  });
});

describe('ZodProjection module pathHints', () => {
  it('emits nested entity/command pathHints from IR module', () => {
    const ir = emptyIR();
    ir.entities = [entity('Recipe', 'kitchen')];
    ir.commands = [
      {
        name: 'create',
        entity: 'Recipe',
        parameters: [
          { name: 'title', type: { name: 'string', nullable: false }, required: true },
        ],
        guards: [],
        actions: [],
        emits: [],
      } satisfies IRCommand,
    ];
    ir.stores = [{ entity: 'Recipe', target: 'durable', config: {} } satisfies IRStore];

    const entities = new ZodProjection().generate(ir, { surface: 'zod.entity' });
    expect(entities.artifacts[0]?.pathHint).toBe('schemas/kitchen/Recipe.schema.ts');

    const commands = new ZodProjection().generate(ir, { surface: 'zod.command' });
    expect(commands.artifacts[0]?.pathHint).toBe('schemas/kitchen/Recipe_create.schema.ts');
  });
});
