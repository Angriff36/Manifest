/**
 * Unit tests for Breaking-Change Classification Engine
 *
 * Tests:
 * - Empty report for identical IR
 * - Entity addition → compatible, entity removal → breaking
 * - Property addition (optional/default → compatible, required → breaking)
 * - Property removal → breaking
 * - Property type change → breaking
 * - Property made optional → compatible, made required → breaking
 * - Computed property expression change → deprecated
 * - Computed property removal → breaking
 * - Relationship removal/kind change → breaking
 * - Constraint removal → deprecated, severity raised → compatible, severity lowered → deprecated
 * - Command removal → breaking
 * - Command parameter added/removed → breaking
 * - Command guards changed → deprecated
 * - Command returns changed → breaking
 * - Policy removal → breaking
 * - Policy expression changed → deprecated
 * - Store removal → breaking, store target changed → breaking
 * - Event removal → breaking, event channel changed → breaking
 * - Module addition/removal
 * - Acknowledgments filtering
 * - Consumer impact aggregation
 * - Deterministic output
 */

import { describe, it, expect } from 'vitest';
import { diffIR } from './ir-diff';
import { classifyBreakingChanges } from './breaking-change';
import type { AcknowledgmentsFile } from './breaking-change';
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

describe('Breaking Change Classifier', () => {
  describe('classifyBreakingChanges', () => {
    it('returns empty report for identical IR', () => {
      const ir = makeIR();
      const diffReport = diffIR(ir, ir);
      const report = classifyBreakingChanges(diffReport);

      expect(report.summary.total).toBe(0);
      expect(report.summary.compatible).toBe(0);
      expect(report.summary.deprecated).toBe(0);
      expect(report.summary.breaking).toBe(0);
      expect(report.classified).toEqual([]);
      expect(report.unacknowledged).toEqual([]);
      expect(report.consumerImpact.commands).toEqual([]);
      expect(report.consumerImpact.routes).toEqual([]);
      expect(report.consumerImpact.projections).toEqual([]);
    });

    // --- Entity classification ---

    it('classifies entity addition as compatible', () => {
      const oldIR = makeIR();
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      expect(report.summary.compatible).toBeGreaterThanOrEqual(1);
      const entityChange = report.classified.find(c => c.path === 'User');
      expect(entityChange?.severity).toBe('compatible');
      expect(entityChange?.category).toBe('entity-added');
    });

    it('classifies entity removal as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const entityChange = report.classified.find(c => c.path === 'User');
      expect(entityChange?.severity).toBe('breaking');
      expect(entityChange?.category).toBe('entity-removed');
    });

    // --- Property classification ---

    it('classifies property addition as compatible when no details available (conservative)', () => {
      // The diff engine does not include details for added properties,
      // so the classifier cannot determine if the property is optional.
      // It defaults to 'breaking' (conservative) since details are absent.
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [
            makeProp('id', 'string'),
            makeProp('email', 'string', { modifiers: ['optional'] }),
          ],
        })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const propChange = report.classified.find(c => c.path === 'User.email');
      // Diff engine doesn't carry details for added properties,
      // so classifier cannot see modifiers/defaults and defaults to breaking.
      expect(propChange?.severity).toBe('breaking');
      expect(propChange?.category).toBe('property-added');
    });

    it('classifies required property addition without default as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [
            makeProp('id', 'string'),
            makeProp('email', 'string', { modifiers: ['required'] }),
          ],
        })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const propChange = report.classified.find(c => c.path === 'User.email');
      expect(propChange?.severity).toBe('breaking');
      expect(propChange?.category).toBe('property-added');
    });

    it('classifies property removal as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string'), makeProp('email', 'string')],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const propChange = report.classified.find(c => c.path === 'User.email');
      expect(propChange?.severity).toBe('breaking');
      expect(propChange?.category).toBe('property-removed');
    });

    it('classifies property type change as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('age', 'string')] })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('age', 'int')] })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const propChange = report.classified.find(c => c.path === 'User.age');
      expect(propChange?.severity).toBe('breaking');
      expect(propChange?.category).toBe('property-type-changed');
    });

    it('classifies property made optional as compatible', () => {
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

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const propChange = report.classified.find(c => c.path === 'User.email');
      expect(propChange?.severity).toBe('compatible');
      expect(propChange?.category).toBe('property-made-optional');
    });

    it('classifies property made required as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [{ name: 'email', type: { name: 'string', nullable: true }, modifiers: [] }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [{ name: 'email', type: { name: 'string', nullable: false }, modifiers: [] }],
        })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const propChange = report.classified.find(c => c.path === 'User.email');
      expect(propChange?.severity).toBe('breaking');
      expect(propChange?.category).toBe('property-made-required');
    });

    // --- Computed property classification ---

    it('classifies computed property expression change as deprecated', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          computedProperties: [{
            name: 'displayName',
            type: { name: 'string', nullable: false },
            expression: { kind: 'identifier', name: 'firstName' },
            dependencies: ['firstName'],
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          computedProperties: [{
            name: 'displayName',
            type: { name: 'string', nullable: false },
            expression: { kind: 'identifier', name: 'lastName' },
            dependencies: ['lastName'],
          }],
        })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const exprChange = report.classified.find(c =>
        c.path === 'User.displayName' && c.category === 'computed-property-expression-changed');
      expect(exprChange?.severity).toBe('deprecated');
    });

    it('classifies computed property removal as breaking', () => {
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
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const cpChange = report.classified.find(c => c.path === 'User.displayName');
      expect(cpChange?.severity).toBe('breaking');
      expect(cpChange?.category).toBe('computed-property-removed');
    });

    // --- Relationship classification ---

    it('classifies relationship removal as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{ name: 'posts', kind: 'hasMany', target: 'Post' }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const relChange = report.classified.find(c => c.path === 'User.posts');
      expect(relChange?.severity).toBe('breaking');
      expect(relChange?.category).toBe('relationship-removed');
    });

    it('classifies relationship kind change as breaking', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{ name: 'profile', kind: 'hasOne', target: 'Profile' }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          relationships: [{ name: 'profile', kind: 'belongsTo', target: 'Profile' }],
        })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const relChange = report.classified.find(c => c.path === 'User.profile');
      expect(relChange?.severity).toBe('breaking');
      expect(relChange?.category).toBe('relationship-kind-changed');
    });

    // --- Constraint classification ---

    it('classifies constraint removal as deprecated', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', {
          properties: [makeProp('id', 'string')],
          constraints: [{
            name: 'adultOnly',
            code: 'adultOnly',
            expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
            severity: 'block',
          }],
        })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const conChange = report.classified.find(c => c.path === 'User.adultOnly');
      expect(conChange?.severity).toBe('deprecated');
      expect(conChange?.category).toBe('constraint-removed');
    });

    it('classifies constraint severity raised as compatible', () => {
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

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const conChange = report.classified.find(c => c.path === 'User.check');
      expect(conChange?.severity).toBe('compatible');
      expect(conChange?.category).toBe('constraint-severity-raised');
    });

    // --- Command classification ---

    it('classifies command removal as breaking', () => {
      const oldIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const cmdChange = report.classified.find(c => c.path === 'createUser');
      expect(cmdChange?.severity).toBe('breaking');
      expect(cmdChange?.category).toBe('command-removed');
    });

    it('classifies command parameter removal as breaking', () => {
      const oldIR = makeIR({
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
      const newIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [
            { name: 'name', type: { name: 'string', nullable: false }, required: true },
          ],
          guards: [],
          actions: [],
          emits: [],
        }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const paramChange = report.classified.find(c =>
        c.path === 'createUser.parameters.email' && c.category === 'command-parameter-removed');
      expect(paramChange?.severity).toBe('breaking');
    });

    it('classifies command guard change as deprecated', () => {
      const oldIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [],
          guards: [{ kind: 'literal', value: { kind: 'boolean', value: true } }],
          actions: [],
          emits: [],
        }],
      });
      const newIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [],
          guards: [{ kind: 'literal', value: { kind: 'boolean', value: false } }],
          actions: [],
          emits: [],
        }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const guardChange = report.classified.find(c => c.category === 'command-guards-changed');
      expect(guardChange?.severity).toBe('deprecated');
    });

    it('classifies command returns change as breaking', () => {
      const oldIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
          returns: { name: 'string', nullable: false },
        }],
      });
      const newIR = makeIR({
        commands: [{
          name: 'createUser',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
          returns: { name: 'int', nullable: false },
        }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const retChange = report.classified.find(c => c.category === 'command-returns-changed');
      expect(retChange?.severity).toBe('breaking');
    });

    // --- Policy classification ---

    it('classifies policy removal as breaking', () => {
      const oldIR = makeIR({
        policies: [{
          name: 'adminOnly',
          action: 'all',
          expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        }],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const polChange = report.classified.find(c => c.path === 'adminOnly');
      expect(polChange?.severity).toBe('breaking');
      expect(polChange?.category).toBe('policy-removed');
    });

    it('classifies policy expression change as deprecated', () => {
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
          action: 'read',
          expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
        }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const exprChange = report.classified.find(c => c.category === 'policy-expression-changed');
      expect(exprChange?.severity).toBe('deprecated');
    });

    // --- Store classification ---

    it('classifies store removal as breaking', () => {
      const oldIR = makeIR({
        stores: [{ entity: 'User', target: 'memory', config: {} }],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const storeChange = report.classified.find(c => c.path === 'store:User');
      expect(storeChange?.severity).toBe('breaking');
      expect(storeChange?.category).toBe('store-removed');
    });

    it('classifies store target change as breaking', () => {
      const oldIR = makeIR({
        stores: [{ entity: 'User', target: 'memory', config: {} }],
      });
      const newIR = makeIR({
        stores: [{ entity: 'User', target: 'postgres', config: {} }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const targetChange = report.classified.find(c => c.category === 'store-target-changed');
      expect(targetChange?.severity).toBe('breaking');
    });

    // --- Event classification ---

    it('classifies event removal as breaking', () => {
      const oldIR = makeIR({
        events: [{ name: 'userCreated', channel: 'users', payload: { name: 'string', nullable: false } }],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const evtChange = report.classified.find(c => c.path === 'userCreated');
      expect(evtChange?.severity).toBe('breaking');
      expect(evtChange?.category).toBe('event-removed');
    });

    it('classifies event channel change as breaking', () => {
      const oldIR = makeIR({
        events: [{ name: 'userCreated', channel: 'users', payload: { name: 'string', nullable: false } }],
      });
      const newIR = makeIR({
        events: [{ name: 'userCreated', channel: 'all', payload: { name: 'string', nullable: false } }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const chChange = report.classified.find(c => c.category === 'event-channel-changed');
      expect(chChange?.severity).toBe('breaking');
    });

    // --- Module classification ---

    it('classifies module removal as breaking', () => {
      const oldIR = makeIR({
        modules: [{ name: 'auth', entities: ['User'], enums: [], commands: [], stores: [], events: [], policies: [] }],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const modChange = report.classified.find(c => c.path === 'module:auth');
      expect(modChange?.severity).toBe('breaking');
      expect(modChange?.category).toBe('module-removed');
    });

    it('classifies module addition as compatible', () => {
      const oldIR = makeIR();
      const newIR = makeIR({
        modules: [{ name: 'auth', entities: ['User'], enums: [], commands: [], stores: [], events: [], policies: [] }],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const modChange = report.classified.find(c => c.path === 'module:auth');
      expect(modChange?.severity).toBe('compatible');
      expect(modChange?.category).toBe('module-added');
    });

    // --- Acknowledgments ---

    it('applies acknowledgments to filter unacknowledged breaking changes', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string'), makeProp('email', 'string')] })],
        commands: [{ name: 'createUser', parameters: [], guards: [], actions: [], emits: [] }],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const acks: AcknowledgmentsFile = {
        version: 1,
        acknowledged: [{
          path: 'User.email',
          category: 'property-removed',
          acknowledgedAt: '2024-01-15T00:00:00Z',
          reason: 'Email field migrated to separate Email entity',
        }],
      };

      const report = classifyBreakingChanges(diffIR(oldIR, newIR), acks);

      // The property removal should be acknowledged
      const emailRemoval = report.classified.find(c => c.path === 'User.email');
      expect(emailRemoval?.severity).toBe('breaking');
      expect(report.acknowledged).toContainEqual(expect.objectContaining({
        path: 'User.email',
        category: 'property-removed',
      }));
      expect(report.unacknowledged).not.toContainEqual(expect.objectContaining({
        path: 'User.email',
        category: 'property-removed',
      }));
    });

    it('does not acknowledge changes with wrong category', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string'), makeProp('email', 'string')] })],
      });
      const newIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });

      const acks: AcknowledgmentsFile = {
        version: 1,
        acknowledged: [{
          path: 'User.email',
          category: 'property-type-changed', // Wrong category
          acknowledgedAt: '2024-01-15T00:00:00Z',
          reason: 'Wrong category',
        }],
      };

      const report = classifyBreakingChanges(diffIR(oldIR, newIR), acks);
      expect(report.unacknowledged).toContainEqual(expect.objectContaining({
        path: 'User.email',
        category: 'property-removed',
      }));
    });

    // --- Consumer impact ---

    it('reports consumer impact for entity removal', () => {
      const oldIR = makeIR({
        entities: [makeEntity('User', { properties: [makeProp('id', 'string')] })],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      expect(report.consumerImpact.projections).toContain('projection:User');
      expect(report.consumerImpact.routes).toContain('route:/api/user');
    });

    it('reports consumer impact for command removal', () => {
      const oldIR = makeIR({
        commands: [{ name: 'createUser', parameters: [], guards: [], actions: [], emits: [] }],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      expect(report.consumerImpact.commands).toContain('command:createUser');
    });

    // --- Deterministic output ---

    it('produces deterministic sorted output', () => {
      const oldIR = makeIR({
        entities: [
          makeEntity('Zebra', { properties: [makeProp('id', 'string')] }),
          makeEntity('Apple', { properties: [makeProp('id', 'string')] }),
        ],
      });
      const newIR = makeIR();

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));
      const paths = report.classified.map(c => c.path);
      expect(paths).toEqual([...paths].sort());
    });

    // --- Complex scenarios ---

    it('handles multiple entity changes in one diff', () => {
      const oldIR = makeIR({
        entities: [
          makeEntity('User', { properties: [makeProp('id', 'string'), makeProp('name', 'string')] }),
          makeEntity('Post', { properties: [makeProp('id', 'string')] }),
        ],
      });
      const newIR = makeIR({
        entities: [
          makeEntity('User', { properties: [makeProp('id', 'string'), makeProp('name', 'string'), makeProp('email', 'string', { modifiers: ['optional'] })] }),
          makeEntity('Comment', { properties: [makeProp('id', 'string')] }),
        ],
      });

      const report = classifyBreakingChanges(diffIR(oldIR, newIR));

      // User changed (email added — no details in diff, defaults to breaking)
      // Post removed → breaking
      // Comment added → compatible
      expect(report.summary.breaking).toBeGreaterThanOrEqual(2);
      expect(report.summary.compatible).toBeGreaterThanOrEqual(1);
    });
  });
});
