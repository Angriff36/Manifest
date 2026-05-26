/**
 * Unit tests for IR Diff Engine
 *
 * Tests:
 * - Identical IR produces empty diff
 * - Entity addition/removal/change detection
 * - Property type/modifier/default changes
 * - Computed property diffing
 * - Relationship diffing
 * - Constraint diffing
 * - Command diffing
 * - Policy diffing
 * - Store diffing
 * - Event diffing
 * - Module diffing
 * - Migration generation (SQL and Prisma)
 * - Deterministic ordering
 */

import { describe, it, expect } from 'vitest';
import { diffIR, generateMigration } from './ir-diff';
import type { IR, IREntity, IRProperty } from './ir';

function makeIR(overrides: Partial<IR> = {}): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2024-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    enums: [],
    entities: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

function makeEntity(name: string, overrides: Partial<IREntity> = {}): IREntity {
  return {
    name,
    properties: [],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    ...overrides,
  };
}

function makeProp(name: string, type: string, overrides: Partial<IRProperty> = {}): IRProperty {
  return {
    name,
    type: { name: type, nullable: false },
    modifiers: [],
    ...overrides,
  };
}

describe('IR Diff Engine', () => {
  describe('diffIR', () => {
    it('returns no changes for identical IR', () => {
      const ir = makeIR();
      const report = diffIR(ir, ir);
      expect(report.summary.hasChanges).toBe(false);
      expect(report.entities).toEqual([]);
      expect(report.commands).toEqual([]);
      expect(report.policies).toEqual([]);
      expect(report.stores).toEqual([]);
      expect(report.events).toEqual([]);
      expect(report.modules).toEqual([]);
    });

    it('detects added entities', () => {
      const oldIR = makeIR();
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('name', 'string')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.summary.entitiesAdded).toBe(1);
      expect(report.summary.hasChanges).toBe(true);
      expect(report.entities).toHaveLength(1);
      expect(report.entities[0].name).toBe('User');
      expect(report.entities[0].change).toBe('added');
      expect(report.entities[0].properties).toHaveLength(2);
      expect(report.entities[0].properties[0].change).toBe('added');
    });

    it('detects removed entities', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
        })],
      });
      const newIR = makeIR();

      const report = diffIR(oldIR, newIR);
      expect(report.summary.entitiesRemoved).toBe(1);
      expect(report.entities[0].change).toBe('removed');
    });

    it('detects property additions within an entity', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('email', 'string')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.entities).toHaveLength(1);
      expect(report.entities[0].change).toBe('changed');
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].name).toBe('email');
      expect(propDiffs[0].change).toBe('added');
    });

    it('detects property removal within an entity', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('email', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].name).toBe('email');
      expect(propDiffs[0].change).toBe('removed');
    });

    it('detects property type changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('age', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('age', 'int')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].change).toBe('changed');
      expect(propDiffs[0].details?.type).toEqual({ from: 'string', to: 'int' });
    });

    it('detects property modifier changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('email', 'string', { modifiers: [] })],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('email', 'string', { modifiers: ['required', 'unique'] })],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].change).toBe('changed');
      expect(propDiffs[0].details?.modifiers).toBeDefined();
      expect(propDiffs[0].details!.modifiers!.from).toEqual([]);
      expect(propDiffs[0].details!.modifiers!.to).toEqual(['required', 'unique']);
    });

    it('detects property default value changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('name', 'string', { defaultValue: { kind: 'string', value: 'Anonymous' } })],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('name', 'string', { defaultValue: { kind: 'string', value: 'Unknown' } })],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].details?.defaultValue).toEqual({ from: '"Anonymous"', to: '"Unknown"' });
    });

    it('detects computed property additions and removals', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          computedProperties: [{
            name: 'displayName',
            type: { name: 'string', nullable: false },
            expression: { kind: 'identifier', name: 'name' },
            dependencies: ['name'],
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          computedProperties: [{
            name: 'fullName',
            type: { name: 'string', nullable: false },
            expression: { kind: 'identifier', name: 'firstName' },
            dependencies: ['firstName'],
          }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const cpDiffs = report.entities[0].computedProperties;
      expect(cpDiffs).toHaveLength(2);
      const removed = cpDiffs.find(d => d.name === 'displayName');
      const added = cpDiffs.find(d => d.name === 'fullName');
      expect(removed?.change).toBe('removed');
      expect(added?.change).toBe('added');
    });

    it('detects relationship additions and removals', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{
            name: 'posts',
            kind: 'hasMany',
            target: 'Post',
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{
            name: 'comments',
            kind: 'hasMany',
            target: 'Comment',
          }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const relDiffs = report.entities[0].relationships;
      expect(relDiffs).toHaveLength(2);
      const removed = relDiffs.find(d => d.name === 'posts');
      const added = relDiffs.find(d => d.name === 'comments');
      expect(removed?.change).toBe('removed');
      expect(added?.change).toBe('added');
    });

    it('detects relationship kind changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{
            name: 'profile',
            kind: 'hasOne',
            target: 'Profile',
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{
            name: 'profile',
            kind: 'belongsTo',
            target: 'Profile',
          }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const relDiffs = report.entities[0].relationships;
      expect(relDiffs).toHaveLength(1);
      expect(relDiffs[0].change).toBe('changed');
      expect(relDiffs[0].details?.kind).toEqual({ from: 'hasOne', to: 'belongsTo' });
    });

    it('detects constraint additions and removals', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('age', 'int')],
          constraints: [{
            name: 'adultOnly',
            code: 'adultOnly',
            expression: { kind: 'binary', operator: '>=', left: { kind: 'identifier', name: 'age' }, right: { kind: 'literal', value: { kind: 'number', value: 18 } } },
            severity: 'block',
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('age', 'int')],
          constraints: [{
            name: 'positiveAge',
            code: 'positiveAge',
            expression: { kind: 'binary', operator: '>', left: { kind: 'identifier', name: 'age' }, right: { kind: 'literal', value: { kind: 'number', value: 0 } } },
            severity: 'warn',
          }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const conDiffs = report.entities[0].constraints;
      expect(conDiffs).toHaveLength(2);
      const removed = conDiffs.find(d => d.name === 'adultOnly');
      const added = conDiffs.find(d => d.name === 'positiveAge');
      expect(removed?.change).toBe('removed');
      expect(added?.change).toBe('added');
    });

    it('detects constraint severity changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          constraints: [{
            name: 'check',
            code: 'check',
            expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
            severity: 'warn',
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          constraints: [{
            name: 'check',
            code: 'check',
            expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
            severity: 'block',
          }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const conDiffs = report.entities[0].constraints;
      expect(conDiffs).toHaveLength(1);
      expect(conDiffs[0].change).toBe('changed');
      expect(conDiffs[0].details?.severity).toEqual({ from: 'warn', to: 'block' });
    });

    it('detects command additions and removals', () => {
      const oldIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });
      const newIR = makeIR({
        commands: [{
          name: 'deleteUser',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.summary.commandsAdded).toBe(1);
      expect(report.summary.commandsRemoved).toBe(1);
      expect(report.commands.find(c => c.name === 'deleteUser')?.change).toBe('added');
      expect(report.commands.find(c => c.name === 'createUser')?.change).toBe('removed');
    });

    it('detects command entity change', () => {
      const oldIR = makeIR({
        commands: [{
          name: 'create',
          entity: 'User',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });
      const newIR = makeIR({
        commands: [{
          name: 'create',
          entity: 'Admin',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.commands).toHaveLength(1);
      expect(report.commands[0].change).toBe('changed');
      expect(report.commands[0].details?.entity).toEqual({ from: 'User', to: 'Admin' });
    });

    it('detects policy additions and removals', () => {
      const oldIR = makeIR({
        policies: [{
          name: 'adminOnly',
          action: 'all',
          expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        }],
      });
      const newIR = makeIR({
        policies: [{
          name: 'userRead',
          action: 'read',
          expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.summary.policiesAdded).toBe(1);
      expect(report.summary.policiesRemoved).toBe(1);
    });

    it('detects policy action change', () => {
      const oldIR = makeIR({
        policies: [{
          name: 'access',
          action: 'read',
          expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        }],
      });
      const newIR = makeIR({
        policies: [{
          name: 'access',
          action: 'write',
          expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.policies).toHaveLength(1);
      expect(report.policies[0].change).toBe('changed');
      expect(report.policies[0].details?.action).toEqual({ from: 'read', to: 'write' });
    });

    it('detects store additions and removals', () => {
      const oldIR = makeIR({
        stores: [{ entity: 'User', target: 'memory', config: {} }],
      });
      const newIR = makeIR({
        stores: [{ entity: 'Post', target: 'postgres', config: {} }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.summary.storesAdded).toBe(1);
      expect(report.summary.storesRemoved).toBe(1);
    });

    it('detects store target change', () => {
      const oldIR = makeIR({
        stores: [{ entity: 'User', target: 'memory', config: {} }],
      });
      const newIR = makeIR({
        stores: [{ entity: 'User', target: 'postgres', config: {} }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.stores).toHaveLength(1);
      expect(report.stores[0].change).toBe('changed');
      expect(report.stores[0].details?.target).toEqual({ from: 'memory', to: 'postgres' });
    });

    it('detects event additions and removals', () => {
      const oldIR = makeIR({
        events: [{ name: 'userCreated', channel: 'users', payload: { name: 'string', nullable: false } }],
      });
      const newIR = makeIR({
        events: [{ name: 'userDeleted', channel: 'users', payload: { name: 'string', nullable: false } }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.summary.eventsAdded).toBe(1);
      expect(report.summary.eventsRemoved).toBe(1);
    });

    it('detects event channel change', () => {
      const oldIR = makeIR({
        events: [{ name: 'userCreated', channel: 'users', payload: { name: 'string', nullable: false } }],
      });
      const newIR = makeIR({
        events: [{ name: 'userCreated', channel: 'all', payload: { name: 'string', nullable: false } }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.events).toHaveLength(1);
      expect(report.events[0].change).toBe('changed');
      expect(report.events[0].details?.channel).toEqual({ from: 'users', to: 'all' });
    });

    it('detects module additions and removals', () => {
      const oldIR = makeIR({
        modules: [{ name: 'auth', entities: ['User'], enums: [], commands: [], stores: [], events: [], policies: [] }],
      });
      const newIR = makeIR({
        modules: [{ name: 'blog', entities: ['Post'], enums: [], commands: [], stores: [], events: [], policies: [] }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.summary.modulesAdded).toBe(1);
      expect(report.summary.modulesRemoved).toBe(1);
    });

    it('produces deterministic sorted output', () => {
      const oldIR = makeIR({
        entities: [
          makeEntity('Zebra', { properties: [makeProp('id', 'string')] }),
          makeEntity('Apple', { properties: [makeProp('id', 'string')] }),
        ],
      });
      const newIR = makeIR();

      const report = diffIR(oldIR, newIR);
      const names = report.entities.map(e => e.name);
      expect(names).toEqual([...names].sort());
    });

    it('detects nullable type changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [{ name: 'email', type: { name: 'string', nullable: false }, modifiers: [] }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [{ name: 'email', type: { name: 'string', nullable: true }, modifiers: [] }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].details?.type).toEqual({ from: 'string', to: 'string?' });
    });

    it('detects generic type (array) changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [{ name: 'tags', type: { name: 'array', generic: { name: 'string', nullable: false }, nullable: false }, modifiers: [] }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [{ name: 'tags', type: { name: 'array', generic: { name: 'int', nullable: false }, nullable: false }, modifiers: [] }],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const propDiffs = report.entities[0].properties;
      expect(propDiffs).toHaveLength(1);
      expect(propDiffs[0].details?.type).toEqual({ from: 'array<string>', to: 'array<int>' });
    });
  });

  describe('generateMigration', () => {
    it('generates CREATE TABLE for added entities', () => {
      const oldIR = makeIR();
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [
            makeProp('id', 'string', { modifiers: ['required'] }),
            makeProp('name', 'string', { modifiers: ['required'] }),
            makeProp('email', 'string', { modifiers: ['required', 'unique'] }),
          ],
        })],
        stores: [{ entity: 'User', target: 'postgres', config: {} }],
      });

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      expect(migration.sql.some(s => s.includes('CREATE TABLE'))).toBe(true);
      expect(migration.sql.some(s => s.includes('id'))).toBe(true);
      expect(migration.prisma.some(s => s.includes('model User'))).toBe(true);
      expect(migration.summary.some(s => s.includes("Added entity 'User'"))).toBe(true);
    });

    it('generates DROP TABLE for removed entities', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
        })],
      });
      const newIR = makeIR();

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      expect(migration.sql.some(s => s.includes('DROP TABLE'))).toBe(true);
      expect(migration.warnings.some(w => w.includes('DROPPING TABLE'))).toBe(true);
      expect(migration.summary.some(s => s.includes("Removed entity 'User'"))).toBe(true);
    });

    it('generates ALTER TABLE ADD COLUMN for added properties', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('email', 'string')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      expect(migration.sql.some(s => s.includes('ADD COLUMN') && s.includes('email'))).toBe(true);
      expect(migration.summary.some(s => s.includes("Added property 'User.email'"))).toBe(true);
    });

    it('generates ALTER TABLE DROP COLUMN for removed properties', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('email', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      expect(migration.sql.some(s => s.includes('DROP COLUMN') && s.includes('email'))).toBe(true);
      expect(migration.warnings.some(w => w.includes('DROPPING COLUMN'))).toBe(true);
      expect(migration.summary.some(s => s.includes("Removed property 'User.email'"))).toBe(true);
    });

    it('generates ALTER TABLE ALTER COLUMN for type changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('age', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('age', 'int')],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      expect(migration.sql.some(s => s.includes('ALTER COLUMN') && s.includes('TYPE'))).toBe(true);
      expect(migration.summary.some(s => s.includes("Changed type of 'User.age'"))).toBe(true);
    });

    it('generates Prisma model blocks for added entities', () => {
      const oldIR = makeIR();
      const newIR = makeIR({
        entities: [makeEntity('Post', {
          properties: [
            makeProp('id', 'string', { modifiers: ['required'] }),
            makeProp('title', 'string', { modifiers: ['required'] }),
          ],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      const prismaModel = migration.prisma.join('\n');
      expect(prismaModel).toContain('model Post');
      expect(prismaModel).toContain('id String');
      expect(prismaModel).toContain('title String');
    });

    it('produces empty migration for no changes', () => {
      const ir = makeIR();
      const report = diffIR(ir, ir);
      const migration = generateMigration(report, ir, ir);

      expect(migration.sql).toEqual([]);
      expect(migration.prisma).toEqual([]);
      expect(migration.summary).toEqual([]);
      expect(migration.warnings).toEqual([]);
    });

    it('includes UNIQUE constraint additions and removals', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [
            makeProp('id', 'string'),
            makeProp('email', 'string', { modifiers: [] }),
          ],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [
            makeProp('id', 'string'),
            makeProp('email', 'string', { modifiers: ['unique'] }),
          ],
        })],
      });

      const report = diffIR(oldIR, newIR);
      const migration = generateMigration(report, oldIR, newIR);

      expect(migration.sql.some(s => s.includes('ADD UNIQUE'))).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('handles multiple entity changes in one diff', () => {
      const oldIR = makeIR({
        entities: [
          makeEntity('User', {
            properties: [makeProp('id', 'string'), makeProp('name', 'string')],
          }),
          makeEntity('Post', {
            properties: [makeProp('id', 'string'), makeProp('title', 'string')],
          }),
        ],
      });
      const newIR = makeIR({
        entities: [
          makeEntity('User', {
            properties: [makeProp('id', 'string'), makeProp('name', 'string'), makeProp('email', 'string')],
          }),
          makeEntity('Comment', {
            properties: [makeProp('id', 'string'), makeProp('body', 'string')],
          }),
        ],
      });

      const report = diffIR(oldIR, newIR);

      // User changed (email added)
      // Post removed
      // Comment added
      expect(report.summary.entitiesAdded).toBe(1);
      expect(report.summary.entitiesRemoved).toBe(1);
      expect(report.summary.entitiesChanged).toBe(1);
    });

    it('handles commands with parameter changes', () => {
      const oldIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [{ name: 'name', type: { name: 'string', nullable: false }, required: true }],
          guards: [],
          actions: [],
          emits: [],
        }],
      });
      const newIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [
            { name: 'name', type: { name: 'string', nullable: false }, required: true },
            { name: 'email', type: { name: 'string', nullable: false }, required: true },
          ],
          guards: [],
          actions: [],
          emits: [],
        }],
      });

      const report = diffIR(oldIR, newIR);
      expect(report.commands).toHaveLength(1);
      expect(report.commands[0].change).toBe('changed');
      expect(report.commands[0].details?.parametersAdded).toBeDefined();
      expect(report.commands[0].details!.parametersAdded!.length).toBe(1);
    });
  });
});
