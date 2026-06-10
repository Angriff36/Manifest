/**
 * Tests for the LLM Context projection.
 *
 * Verifies:
 * - Projection metadata (name, surfaces, description)
 * - llm-context.full surface — complete manifest-context.json
 * - llm-context.summary surface — lightweight without expressions/IR
 * - llm-context.ir surface — raw IR passthrough
 * - Options: includeRawIR, includeExpressions, includeEnums, includeEvents, includeStores
 * - Entity, command, policy, constraint, relationship extraction
 * - Computed properties with dependency tracking
 * - Enum, event, and store context building
 * - Domain summary counts
 * - Deterministic output
 * - Edge cases (empty IR, unknown surfaces)
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { LlmContextProjection } from './generator';
// Static import: pulling the full registry graph through a dynamic import
// inside a test body can exceed the 5s test timeout under full-suite load.
// Registration stays lazy — it happens inside getProjection(), not at import.
import { getProjection } from '../registry';
import type { ManifestContext } from './types';

describe('LlmContextProjection', () => {
  const projection = new LlmContextProjection();

  function parseContext(result: ReturnType<typeof projection.generate>): ManifestContext {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return JSON.parse(result.artifacts[0].code);
  }

  function makeMinimalIR(overrides: Record<string, unknown> = {}) {
    return {
      version: '1.0' as const,
      provenance: {
        contentHash: 'abc123',
        compilerVersion: '0.3.21',
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

  // ========================================================================
  // Projection metadata
  // ========================================================================

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('llm-context');
      expect(projection.description).toContain('manifest-context.json');
      expect(projection.surfaces).toContain('llm-context.full');
      expect(projection.surfaces).toContain('llm-context.summary');
      expect(projection.surfaces).toContain('llm-context.ir');
    });

    it('is registered as a built-in projection', () => {
      const p = getProjection('llm-context');
      expect(p).toBeDefined();
      expect(p!.name).toBe('llm-context');
    });
  });

  // ========================================================================
  // llm-context.full surface
  // ========================================================================

  describe('llm-context.full surface', () => {
    it('generates valid JSON with schema version', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.$schema).toBe('manifest-context/v1');
    });

    it('includes meta with provenance info', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.meta.compilerVersion).toBe('0.3.21');
      expect(ctx.meta.schemaVersion).toBe('1.0');
      expect(ctx.meta.contentHash).toBe('abc123');
      expect(ctx.meta.projection).toBe('llm-context');
      expect(ctx.meta.generatedAt).toBeTruthy();
    });

    it('includes domain summary with correct counts', async () => {
      const source = `
        entity Widget {
          property required id: string
          property name: string = "untitled"
          constraint valid_name: self.name != ""
          command activate() {
            mutate status = "active"
          }
          policy canView read: true
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      expect(ctx.domain.entityCount).toBe(1);
      expect(ctx.domain.commandCount).toBe(1);
      expect(ctx.domain.policyCount).toBe(1);
      expect(ctx.domain.constraintCount).toBe(1);
    });

    it('returns correct artifact metadata', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.full' });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('llm-context-full');
      expect(artifact.pathHint).toBe('manifest-context.json');
      expect(artifact.contentType).toBe('json');
    });

    it('includes raw IR by default', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.ir).toBeDefined();
      expect((ctx.ir as Record<string, unknown>).version).toBe('1.0');
    });

    it('includes enums, events, and stores by default', () => {
      const ir = makeMinimalIR({
        enums: [{
          name: 'Status',
          values: [{ name: 'ACTIVE' }, { name: 'INACTIVE' }],
        }],
        events: [{
          name: 'widgetCreated',
          channel: 'widget.created',
          payload: [
            { name: 'widgetId', type: { name: 'string', nullable: false }, required: true },
          ],
        }],
        stores: [{
          entity: 'Widget',
          target: 'supabase',
        }],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.enums).toHaveLength(1);
      expect(ctx.enums![0].name).toBe('Status');
      expect(ctx.events).toHaveLength(1);
      expect(ctx.events![0].name).toBe('widgetCreated');
      expect(ctx.stores).toHaveLength(1);
      expect(ctx.stores![0].entity).toBe('Widget');
    });
  });

  // ========================================================================
  // Entity context
  // ========================================================================

  describe('entity context', () => {
    it('extracts entity properties with types and modifiers', async () => {
      const source = `
        entity Widget {
          property required id: string
          property name: string = "untitled"
          property count: number?
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      const widget = ctx.entities.find(e => e.name === 'Widget');
      expect(widget).toBeDefined();

      const idProp = widget!.properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect(idProp!.type).toContain('string');
      expect(idProp!.required).toBe(true);

      const countProp = widget!.properties.find(p => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.type).toContain('null');
    });

    it('extracts computed properties with expressions', async () => {
      const source = `
        entity OrderItem {
          property required id: string
          property price: number = 0
          property quantity: number = 1
          computed subtotal: number = price * quantity
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      const entity = ctx.entities.find(e => e.name === 'OrderItem');
      expect(entity).toBeDefined();

      const computed = entity!.computedProperties.find(cp => cp.name === 'subtotal');
      expect(computed).toBeDefined();
      expect(computed!.expression).not.toBe('[omitted]');
      expect(computed!.dependencies).toContain('price');
      expect(computed!.dependencies).toContain('quantity');
    });

    it('extracts constraints from entities', async () => {
      const source = `
        entity Widget {
          property required id: string
          property price: number = 0
          constraint positive_price: self.price >= 0
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      const widget = ctx.entities.find(e => e.name === 'Widget');
      expect(widget!.constraints.length).toBe(1);
      expect(widget!.constraints[0].name).toBe('positive_price');
      expect(widget!.constraints[0].expression).not.toBe('[omitted]');

      // Also appears in flat constraint list
      expect(ctx.constraints.length).toBe(1);
      expect(ctx.constraints[0].entity).toBe('Widget');
    });

    it('extracts relationships', () => {
      const ir = makeMinimalIR({
        entities: [{
          name: 'Widget',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [
            { name: 'parts', kind: 'hasMany', target: 'Part' },
            { name: 'owner', kind: 'belongsTo', target: 'User' },
          ],
          commands: [],
          constraints: [],
          policies: [],
        }],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.relationships).toHaveLength(2);
      expect(ctx.relationships[0].source).toBe('Widget');
      expect(ctx.relationships[0].target).toBe('Part');
      expect(ctx.relationships[0].kind).toBe('hasMany');
      expect(ctx.relationships[1].kind).toBe('belongsTo');
    });
  });

  // ========================================================================
  // Command context
  // ========================================================================

  describe('command context', () => {
    it('extracts command signatures with parameters', async () => {
      const source = `
        entity Widget {
          property required id: string
          command assign(userId: string, priority: number) {
            mutate status = "assigned"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      const cmd = ctx.commands.find(c => c.name === 'assign');
      expect(cmd).toBeDefined();
      expect(cmd!.entity).toBe('Widget');
      expect(cmd!.parameters).toHaveLength(2);
      expect(cmd!.parameters[0].name).toBe('userId');
      expect(cmd!.parameters[0].type).toContain('string');
    });

    it('extracts guards and actions with expressions', async () => {
      const source = `
        entity Widget {
          property required id: string
          property status: string = "draft"
          command release() {
            guard self.status == "draft"
            mutate status = "released"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      const cmd = ctx.commands.find(c => c.name === 'release');
      expect(cmd).toBeDefined();
      expect(cmd!.guards.length).toBeGreaterThan(0);
      expect(cmd!.guards[0]).not.toBe('[omitted]');
      expect(cmd!.actions.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Policy context
  // ========================================================================

  describe('policy context', () => {
    it('extracts policies from IR', async () => {
      const source = `
        entity Widget {
          property required id: string
          policy canView read: true
          policy canEdit write: user.role == "admin"
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.full' });
      const ctx = parseContext(projResult);

      expect(ctx.policies.length).toBe(2);
      const canView = ctx.policies.find(p => p.name === 'canView');
      expect(canView).toBeDefined();
      expect(canView!.action).toBe('read');
    });
  });

  // ========================================================================
  // llm-context.summary surface
  // ========================================================================

  describe('llm-context.summary surface', () => {
    it('omits raw IR', async () => {
      const source = `
        entity Widget {
          property required id: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.summary' });
      const ctx = parseContext(projResult);

      expect(ctx.ir).toBeUndefined();
    });

    it('omits expressions (shows [omitted])', async () => {
      const source = `
        entity Widget {
          property required id: string
          property price: number = 0
          constraint positive_price: self.price >= 0
          command release() {
            guard self.price > 0
            mutate status = "released"
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, { surface: 'llm-context.summary' });
      const ctx = parseContext(projResult);

      // Constraints should have [omitted] expressions
      expect(ctx.constraints[0].expression).toBe('[omitted]');

      // Command guards and actions should have [omitted]
      const cmd = ctx.commands.find(c => c.name === 'release');
      expect(cmd!.guards[0]).toBe('[omitted]');
      expect(cmd!.actions[0].expression).toBe('[omitted]');
    });

    it('returns correct artifact metadata', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.summary' });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('llm-context-summary');
      expect(artifact.pathHint).toBe('manifest-context-summary.json');
      expect(artifact.contentType).toBe('json');
    });

    it('still includes domain summary', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.summary' });
      const ctx = parseContext(result);

      expect(ctx.domain).toBeDefined();
      expect(ctx.domain.entityCount).toBe(0);
    });
  });

  // ========================================================================
  // llm-context.ir surface
  // ========================================================================

  describe('llm-context.ir surface', () => {
    it('returns raw IR as JSON', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.ir' });
      const parsed = JSON.parse(result.artifacts[0].code);

      expect(parsed.version).toBe('1.0');
      expect(parsed.provenance).toBeDefined();
    });

    it('returns correct artifact metadata', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.ir' });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('llm-context-ir');
      expect(artifact.pathHint).toBe('manifest-ir.json');
      expect(artifact.contentType).toBe('json');
    });
  });

  // ========================================================================
  // Options
  // ========================================================================

  describe('options', () => {
    it('excludes raw IR when includeRawIR is false', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'llm-context.full',
        options: { includeRawIR: false },
      });
      const ctx = parseContext(result);

      expect(ctx.ir).toBeUndefined();
    });

    it('omits expressions when includeExpressions is false', async () => {
      const source = `
        entity Widget {
          property required id: string
          property price: number = 0
          constraint positive_price: self.price >= 0
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const projResult = projection.generate(result.ir!, {
        surface: 'llm-context.full',
        options: { includeExpressions: false },
      });
      const ctx = parseContext(projResult);

      expect(ctx.constraints[0].expression).toBe('[omitted]');
    });

    it('excludes enums when includeEnums is false', () => {
      const ir = makeMinimalIR({
        enums: [{
          name: 'Status',
          values: [{ name: 'ACTIVE' }],
        }],
      });

      const result = projection.generate(ir, {
        surface: 'llm-context.full',
        options: { includeEnums: false },
      });
      const ctx = parseContext(result);

      expect(ctx.enums).toBeUndefined();
    });

    it('excludes events when includeEvents is false', () => {
      const ir = makeMinimalIR({
        events: [{
          name: 'widgetCreated',
          channel: 'widget.created',
          payload: [
            { name: 'widgetId', type: { name: 'string', nullable: false }, required: true },
          ],
        }],
      });

      const result = projection.generate(ir, {
        surface: 'llm-context.full',
        options: { includeEvents: false },
      });
      const ctx = parseContext(result);

      expect(ctx.events).toBeUndefined();
    });

    it('excludes stores when includeStores is false', () => {
      const ir = makeMinimalIR({
        stores: [{
          entity: 'Widget',
          target: 'supabase',
        }],
      });

      const result = projection.generate(ir, {
        surface: 'llm-context.full',
        options: { includeStores: false },
      });
      const ctx = parseContext(result);

      expect(ctx.stores).toBeUndefined();
    });
  });

  // ========================================================================
  // Enum, event, and store context
  // ========================================================================

  describe('enum context', () => {
    it('includes enum values with labels and ordinals', () => {
      const ir = makeMinimalIR({
        enums: [{
          name: 'Priority',
          values: [
            { name: 'LOW', label: 'Low priority', ordinal: 0 },
            { name: 'HIGH', label: 'High priority', ordinal: 1 },
          ],
        }],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.enums![0].name).toBe('Priority');
      expect(ctx.enums![0].values).toHaveLength(2);
      expect(ctx.enums![0].values[0].label).toBe('Low priority');
      expect(ctx.enums![0].values[1].ordinal).toBe(1);
    });
  });

  describe('event context', () => {
    it('formats event payload as string', () => {
      const ir = makeMinimalIR({
        events: [{
          name: 'orderPlaced',
          channel: 'order.placed',
          payload: [
            { name: 'orderId', type: { name: 'string', nullable: false }, required: true },
            { name: 'total', type: { name: 'number', nullable: false }, required: true },
          ],
        }],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.events![0].name).toBe('orderPlaced');
      expect(ctx.events![0].channel).toBe('order.placed');
      expect(ctx.events![0].payload).toContain('orderId');
      expect(ctx.events![0].payload).toContain('total');
    });
  });

  describe('store context', () => {
    it('extracts store entity and target', () => {
      const ir = makeMinimalIR({
        stores: [
          { entity: 'Widget', target: 'supabase' },
          { entity: 'Gadget', target: 'memory' },
        ],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.stores).toHaveLength(2);
      expect(ctx.stores![0].entity).toBe('Widget');
      expect(ctx.stores![0].target).toBe('supabase');
      expect(ctx.stores![1].target).toBe('memory');
    });
  });

  // ========================================================================
  // Multi-tenancy
  // ========================================================================

  describe('multi-tenancy', () => {
    it('reports multiTenant false when no tenant config', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.domain.multiTenant).toBe(false);
    });

    it('reports multiTenant true when tenant is configured', () => {
      const ir = makeMinimalIR({
        tenant: {
          property: 'tenantId',
          type: { name: 'string', nullable: false },
          contextPath: 'context.tenantId',
        },
      });
      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.domain.multiTenant).toBe(true);
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('determinism', () => {
    it('produces structurally identical output for identical IR (ignoring timestamps)', () => {
      const ir = makeMinimalIR({
        entities: [{
          name: 'Widget',
          properties: [
            { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          ],
          computedProperties: [],
          relationships: [],
          commands: ['activate'],
          constraints: [],
          policies: [],
        }],
        commands: [{
          name: 'activate',
          entity: 'Widget',
          parameters: [],
          guards: [],
          actions: [
            { kind: 'mutate', target: 'self.status', expression: { kind: 'literal', value: { kind: 'string', value: 'active' } } },
          ],
          emits: [],
        }],
      });

      const result1 = projection.generate(ir, { surface: 'llm-context.full' });
      const result2 = projection.generate(ir, { surface: 'llm-context.full' });

      const ctx1 = parseContext(result1);
      const ctx2 = parseContext(result2);

      // Timestamps will differ, so compare everything else
      expect(ctx1.$schema).toBe(ctx2.$schema);
      expect(ctx1.domain).toEqual(ctx2.domain);
      expect(ctx1.entities).toEqual(ctx2.entities);
      expect(ctx1.commands).toEqual(ctx2.commands);
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('handles empty IR', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.entities).toHaveLength(0);
      expect(ctx.commands).toHaveLength(0);
      expect(ctx.policies).toHaveLength(0);
      expect(ctx.constraints).toHaveLength(0);
      expect(ctx.relationships).toHaveLength(0);
      expect(ctx.domain.entityCount).toBe(0);
    });

    it('returns warning for unknown surface', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'llm-context.unknown' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('warning');
      expect(result.diagnostics[0].message).toContain('Unknown surface');
    });

    it('handles entity with no properties', () => {
      const ir = makeMinimalIR({
        entities: [{
          name: 'Empty',
          properties: [],
          computedProperties: [],
          relationships: [],
          commands: [],
          constraints: [],
          policies: [],
        }],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.entities).toHaveLength(1);
      expect(ctx.entities[0].name).toBe('Empty');
      expect(ctx.entities[0].properties).toHaveLength(0);
    });

    it('handles command with no parameters or guards', () => {
      const ir = makeMinimalIR({
        commands: [{
          name: 'reset',
          entity: 'Widget',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.commands).toHaveLength(1);
      expect(ctx.commands[0].parameters).toHaveLength(0);
      expect(ctx.commands[0].guards).toHaveLength(0);
    });

    it('produces valid JSON for all surfaces', () => {
      const ir = makeMinimalIR();

      for (const surface of projection.surfaces) {
        const result = projection.generate(ir, { surface });
        expect(result.artifacts).toHaveLength(1);
        // Should not throw
        JSON.parse(result.artifacts[0].code);
      }
    });

    it('handles modules in domain summary', () => {
      const ir = makeMinimalIR({
        modules: [
          { name: 'core', entities: ['Widget'], enums: [], commands: [], stores: [], events: [], policies: [] },
          { name: 'billing', entities: ['Invoice'], enums: [], commands: [], stores: [], events: [], policies: [] },
        ],
      });

      const result = projection.generate(ir, { surface: 'llm-context.full' });
      const ctx = parseContext(result);

      expect(ctx.domain.modules).toContain('core');
      expect(ctx.domain.modules).toContain('billing');
    });
  });
});
