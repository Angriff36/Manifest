/**
 * Tests for Analytics projection
 */

import { describe, expect, it } from 'vitest';
import { AnalyticsProjection } from './generator';
import { getProjection } from '../registry';
import type { IR, IREntity, IRCommand, IREvent } from '../../ir';

/** Build a minimal valid IR skeleton with sensible defaults for unspecified fields. */
function makeIR(partial: Partial<IR> = {}): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
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
    ...partial,
  };
}

function taskEntity(): IREntity {
  return {
    name: 'Task',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ],
    computedProperties: [],
    relationships: [],
    commands: ['updateStatus'],
    constraints: [],
    policies: [],
  };
}

function taskCommands(): IRCommand[] {
  return [
    {
      name: 'updateStatus',
      entity: 'Task',
      parameters: [
        { name: 'newStatus', type: { name: 'string', nullable: false }, required: true },
      ],
      guards: [],
      actions: [],
      emits: ['TaskStatusUpdated'],
    },
  ];
}

function taskEvents(): IREvent[] {
  return [
    {
      name: 'TaskStatusUpdated',
      channel: 'tasks.updated',
      payload: [
        { name: 'id', type: { name: 'string', nullable: false }, required: true },
        { name: 'newStatus', type: { name: 'string', nullable: false }, required: true },
      ],
    },
  ];
}

describe('AnalyticsProjection', () => {
  const projection = new AnalyticsProjection();

  describe('projection metadata', () => {
    it('should have correct name and description', () => {
      expect(projection.name).toBe('analytics');
      expect(projection.description).toContain('analytics');
    });

    it('should declare correct surfaces', () => {
      expect(projection.surfaces).toEqual([
        'analytics.tracking-plan',
        'analytics.events',
        'analytics.handlers',
      ]);
    });

    it('should be registered in the canonical registry', () => {
      const found = getProjection('analytics');
      expect(found).toBeDefined();
      expect(found?.name).toBe('analytics');
    });
  });

  describe('analytics.tracking-plan surface', () => {
    it('should generate a valid JSON tracking plan', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.tracking-plan' });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].contentType).toBe('json');
      expect(result.artifacts[0].pathHint).toBe('analytics/tracking-plan.json');

      const plan = JSON.parse(result.artifacts[0].code);
      expect(plan.provider).toBe('segment');
      expect(plan.events).toBeDefined();
      expect(plan.events.length).toBeGreaterThan(0);
    });

    it('should include event from command emit', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.tracking-plan' });
      const plan = JSON.parse(result.artifacts[0].code);

      const event = plan.events.find((e: { name: string }) => e.name === 'TaskStatusUpdated');
      expect(event).toBeDefined();
      expect(event.entity).toBe('Task');
      expect(event.command).toBe('updateStatus');
      expect(event.properties).toHaveProperty('id');
      expect(event.properties).toHaveProperty('newStatus');
    });

    it('should include entity property change events by default', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, { surface: 'analytics.tracking-plan' });
      const plan = JSON.parse(result.artifacts[0].code);

      // taskEntity has 3 properties: id, title, status
      // Each should produce a "X Changed" event
      const statusChanged = plan.events.find(
        (e: { name: string }) => e.name === 'Task status Changed',
      );
      expect(statusChanged).toBeDefined();
      expect(statusChanged.entity).toBe('Task');
    });

    it('should exclude entity property events when includeEntityProperties is false', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, {
        surface: 'analytics.tracking-plan',
        options: { includeEntityProperties: false },
      });
      const plan = JSON.parse(result.artifacts[0].code);

      const statusChanged = plan.events.find(
        (e: { name: string }) => e.name === 'Task status Changed',
      );
      expect(statusChanged).toBeUndefined();
    });

    it('should support custom event namespace', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, {
        surface: 'analytics.tracking-plan',
        options: { eventNamespace: 'myapp' },
      });
      const plan = JSON.parse(result.artifacts[0].code);

      const event = plan.events.find((e: { name: string }) => e.name === 'myapp TaskStatusUpdated');
      expect(event).toBeDefined();
      expect(plan.namespace).toBe('myapp');
    });

    it('should use correct provider in tracking plan', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, {
        surface: 'analytics.tracking-plan',
        options: { provider: 'mixpanel' },
      });
      const plan = JSON.parse(result.artifacts[0].code);

      expect(plan.provider).toBe('mixpanel');
    });
  });

  describe('analytics.events surface', () => {
    it('should generate TypeScript event interfaces', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.events' });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].contentType).toBe('typescript');

      const code = result.artifacts[0].code;
      expect(code).toContain('export interface');
      expect(code).toContain('TaskStatusUpdatedProperties');
      expect(code).toContain('id: string');
      expect(code).toContain('newStatus: string');
    });

    it('should generate event name constants', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.events' });
      const code = result.artifacts[0].code;

      expect(code).toContain('export const AnalyticsEvents');
      expect(code).toContain('taskStatusUpdated: "TaskStatusUpdated"');
    });

    it('should generate event map for type safety', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.events' });
      const code = result.artifacts[0].code;

      expect(code).toContain('export interface AnalyticsEventMap');
      expect(code).toContain('"TaskStatusUpdated": TaskStatusUpdatedProperties');
    });

    it('should generate typed track function for segment', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, {
        surface: 'analytics.events',
        options: { provider: 'segment' },
      });
      const code = result.artifacts[0].code;

      expect(code).toContain('export function track');
      expect(code).toContain('analytics.track(event, properties');
    });

    it('should generate typed track function for amplitude', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, {
        surface: 'analytics.events',
        options: { provider: 'amplitude' },
      });
      const code = result.artifacts[0].code;

      expect(code).toContain('analytics.track(event, properties');
    });

    it('should generate typed track function for mixpanel', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, {
        surface: 'analytics.events',
        options: { provider: 'mixpanel' },
      });
      const code = result.artifacts[0].code;

      expect(code).toContain('mixpanel.track(event, properties');
    });

    it('should generate typed track function for snowplow with schema', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [],
        events: [],
      });

      const result = projection.generate(ir, {
        surface: 'analytics.events',
        options: { provider: 'snowplow' },
      });
      const code = result.artifacts[0].code;

      expect(code).toContain('trackSelfDescribingEvent');
      expect(code).toContain('vendor: "com.manifest"');
    });

    it('should handle events with no properties', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [
          {
            name: 'ping',
            parameters: [],
            guards: [],
            actions: [],
            emits: ['Pong'],
          },
        ],
        events: [
          {
            name: 'Pong',
            channel: 'system.pong',
            payload: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'analytics.events' });
      const code = result.artifacts[0].code;

      expect(code).toContain('PongProperties');
      expect(code).toContain('Record<string, never>');
    });

    it('should handle optional properties', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: [
          {
            name: 'updateTask',
            entity: 'Task',
            parameters: [
              { name: 'title', type: { name: 'string', nullable: true }, required: false },
            ],
            guards: [],
            actions: [],
            emits: ['TaskUpdated'],
          },
        ],
        events: [
          {
            name: 'TaskUpdated',
            channel: 'tasks.updated',
            payload: [
              { name: 'id', type: { name: 'string', nullable: false }, required: true },
              { name: 'title', type: { name: 'string', nullable: true }, required: false },
            ],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'analytics.events' });
      const code = result.artifacts[0].code;

      expect(code).toContain('title?: string | null');
    });
  });

  describe('analytics.handlers surface', () => {
    it('should generate per-entity handler files by default', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.handlers' });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts.length).toBeGreaterThan(0);

      const taskHandler = result.artifacts.find((a) => a.id === 'analytics.handlers.Task');
      expect(taskHandler).toBeDefined();
      expect(taskHandler?.contentType).toBe('typescript');
      expect(taskHandler?.pathHint).toBe('analytics/handlers/task.ts');
    });

    it('should generate a track function call for command events', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.handlers' });
      const code = result.artifacts[0].code;

      expect(code).toContain('export function trackUpdateStatus');
      expect(code).toContain('AnalyticsEvents.taskStatusUpdated');
      expect(code).toContain('track(');
    });

    it('should generate a single file when emitPerEntityHandlers is false', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, {
        surface: 'analytics.handlers',
        options: { emitPerEntityHandlers: false },
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('analytics.handlers');
      expect(result.artifacts[0].pathHint).toBe('analytics/handlers.ts');
    });

    it('should skip entities with no commands', () => {
      const ir: IR = makeIR({
        entities: [
          taskEntity(),
          {
            name: 'EmptyEntity',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            computedProperties: [],
            relationships: [],
            commands: [],
            constraints: [],
            policies: [],
          },
        ],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const result = projection.generate(ir, { surface: 'analytics.handlers' });

      // Only Task should have a handler file
      const emptyHandler = result.artifacts.find((a) => a.id === 'analytics.handlers.EmptyEntity');
      expect(emptyHandler).toBeUndefined();
    });

    it('should handle commands with no events gracefully', () => {
      const ir: IR = makeIR({
        entities: [
          {
            name: 'Silent',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            computedProperties: [],
            relationships: [],
            commands: ['noOp'],
            constraints: [],
            policies: [],
          },
        ],
        commands: [
          {
            name: 'noOp',
            entity: 'Silent',
            parameters: [],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
        events: [],
      });

      const result = projection.generate(ir, { surface: 'analytics.handlers' });
      const code = result.artifacts[0].code;

      expect(code).toContain('export function trackNoOp');
      expect(code).toContain('// No events declared for this command');
    });

    it('should not generate handlers for commands without an entity', () => {
      const ir: IR = makeIR({
        entities: [],
        commands: [
          {
            name: 'globalCommand',
            parameters: [],
            guards: [],
            actions: [],
            emits: [],
          },
        ],
        events: [],
      });

      const result = projection.generate(ir, { surface: 'analytics.handlers' });

      // No entity-scoped handlers should be generated
      expect(result.artifacts).toHaveLength(0);
    });
  });

  describe('unknown surface', () => {
    it('should return error for unknown surface', () => {
      const ir: IR = makeIR();

      const result = projection.generate(ir, {
        surface: 'analytics.unknown',
      } as any);

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('ANALYTICS_UNKNOWN_SURFACE');
    });
  });

  describe('deterministic output', () => {
    it('tracking plan should be deterministic', () => {
      const ir: IR = makeIR({
        entities: [taskEntity()],
        commands: taskCommands(),
        events: taskEvents(),
      });

      const r1 = projection.generate(ir, { surface: 'analytics.tracking-plan' });
      const r2 = projection.generate(ir, { surface: 'analytics.tracking-plan' });

      // Strip the generatedAt field for comparison
      const p1 = JSON.parse(r1.artifacts[0].code);
      const p2 = JSON.parse(r2.artifacts[0].code);
      delete p1.generatedAt;
      delete p2.generatedAt;

      expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
    });
  });
});
