/**
 * Shared generic IR fixtures for Kysely projection tests.
 * No real-app entity/table/column names.
 */

import type { IR, IREntity, IRStore } from '../../ir';

export function emptyIR(): IR {
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

export function widgetEntity(): IREntity {
  return {
    name: 'Widget',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'qty', type: { name: 'int', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

export function durableStore(entityName: string): IRStore {
  return { entity: entityName, target: 'durable', config: {} };
}

export function memoryStore(entityName: string): IRStore {
  return { entity: entityName, target: 'memory', config: {} };
}

export function bareEntity(
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
