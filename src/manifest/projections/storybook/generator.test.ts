/**
 * Unit tests for the Storybook CSF3 projection.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRCommand } from '../../ir';
import { StorybookProjection } from './generator';

// ---------------------------------------------------------------------------
// Helper: minimal IR fixture
// ---------------------------------------------------------------------------

function minimalIR(overrides?: Partial<IR>): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: '1.0.0',
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
    ...overrides,
  };
}

function taskEntity(): IREntity {
  return {
    name: 'Task',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'], defaultValue: { kind: 'string', value: '' } },
      { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'], defaultValue: { kind: 'string', value: 'todo' } },
      { name: 'priority', type: { name: 'int', nullable: true }, modifiers: [], defaultValue: { kind: 'number', value: 1 } },
      { name: 'isPrivate', type: { name: 'boolean', nullable: false }, modifiers: ['private'] },
    ],
    computedProperties: [
      {
        name: 'isHighPriority',
        type: { name: 'boolean', nullable: false },
        expression: {
          kind: 'binary',
          operator: '>=',
          left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'priority' },
          right: { kind: 'literal', value: { kind: 'number', value: 3 } },
        },
        dependencies: ['priority'],
      },
    ],
    relationships: [],
    commands: ['updateStatus'],
    constraints: [
      {
        name: 'titleNotEmpty',
        code: 'TITLE_NOT_EMPTY',
        expression: {
          kind: 'binary',
          operator: '!=',
          left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'title' },
          right: { kind: 'literal', value: { kind: 'string', value: '' } },
        },
        severity: 'block',
        message: 'Title must not be empty',
      },
    ],
    policies: [],
  };
}

function updateStatusCommand(): IRCommand {
  return {
    name: 'updateStatus',
    entity: 'Task',
    parameters: [
      { name: 'newStatus', type: { name: 'string', nullable: false }, required: true },
    ],
    guards: [
      {
        kind: 'binary',
        operator: '!=',
        left: { kind: 'identifier', name: 'newStatus' },
        right: { kind: 'literal', value: { kind: 'string', value: '' } },
      },
    ],
    actions: [
      {
        kind: 'mutate',
        target: 'status',
        expression: { kind: 'identifier', name: 'newStatus' },
      },
    ],
    emits: ['TaskStatusUpdated'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorybookProjection', () => {
  const projection = new StorybookProjection();

  describe('metadata', () => {
    it('has correct name', () => {
      expect(projection.name).toBe('storybook');
    });

    it('has correct surfaces', () => {
      expect(projection.surfaces).toContain('storybook.entity');
      expect(projection.surfaces).toContain('storybook.command');
      expect(projection.surfaces).toContain('storybook.all');
    });

    it('has a description', () => {
      expect(projection.description).toBeTruthy();
    });
  });

  describe('storybook.entity surface', () => {
    it('generates entity story with argTypes and defaults', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'Task' });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(code).toContain("title: 'Manifest/Entities/Task'");
      expect(code).toContain('export const Default: Story');
      expect(code).toContain('export const Complete: Story');
      expect(code).toContain("control: 'text'");
      expect(result.artifacts[0].pathHint).toBe('stories/Task.stories.tsx');
      expect(result.artifacts[0].id).toBe('storybook.entity.Task');
    });

    it('excludes private properties', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'Task' });
      const code = result.artifacts[0].code;

      expect(code).not.toContain('isPrivate');
    });

    it('marks computed properties as control: false', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'Task' });
      const code = result.artifacts[0].code;

      expect(code).toContain("isHighPriority: { control: false, description: 'Computed' }");
    });

    it('generates constraint violation story', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'Task' });
      const code = result.artifacts[0].code;

      expect(code).toContain('export const ConstraintViolation: Story');
      expect(code).toContain("constraintViolations: ['titleNotEmpty']");
    });

    it('generates all entities when no entity specified', () => {
      const userEntity: IREntity = {
        name: 'User',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };
      const ir = minimalIR({ entities: [taskEntity(), userEntity] });
      const result = projection.generate(ir, { surface: 'storybook.entity' });

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0].id).toBe('storybook.entity.Task');
      expect(result.artifacts[1].id).toBe('storybook.entity.User');
    });

    it('returns error diagnostic for missing entity', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'NonExistent' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('ENTITY_NOT_FOUND');
    });

    it('uses enum type as select control with options', () => {
      const entity: IREntity = {
        name: 'Order',
        properties: [
          { name: 'status', type: { name: 'OrderStatus', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      };
      const ir = minimalIR({
        entities: [entity],
        enums: [{ name: 'OrderStatus', values: [{ name: 'pending' }, { name: 'shipped' }, { name: 'delivered' }] }],
      });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'Order' });
      const code = result.artifacts[0].code;

      expect(code).toContain("control: 'select'");
      expect(code).toContain("'pending'");
      expect(code).toContain("'shipped'");
      expect(code).toContain("'delivered'");
    });

    it('maps int type to number control with step', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, { surface: 'storybook.entity', entity: 'Task' });
      const code = result.artifacts[0].code;

      expect(code).toContain('type: "number"');
      expect(code).toContain('step: 1');
    });
  });

  describe('storybook.command surface', () => {
    it('generates command story with parameters', () => {
      const ir = minimalIR({ commands: [updateStatusCommand()] });
      const result = projection.generate(ir, { surface: 'storybook.command', command: 'updateStatus' });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(code).toContain("title: 'Manifest/Commands/Task/UpdateStatus'");
      expect(code).toContain('export const GuardsPass: Story');
      expect(code).toContain('export const GuardFails: Story');
      expect(result.artifacts[0].pathHint).toBe('stories/Task/UpdateStatus.stories.tsx');
    });

    it('includes play functions for guard scenarios', () => {
      const ir = minimalIR({ commands: [updateStatusCommand()] });
      const result = projection.generate(ir, { surface: 'storybook.command', command: 'updateStatus' });
      const code = result.artifacts[0].code;

      expect(code).toContain('play: async ({ canvasElement })');
      expect(code).toContain("getByTestId('guard-status')");
      expect(code).toContain("toHaveTextContent('pass')");
      expect(code).toContain("toHaveTextContent('denied')");
    });

    it('generates correct pass/fail args for guards', () => {
      const ir = minimalIR({ commands: [updateStatusCommand()] });
      const result = projection.generate(ir, { surface: 'storybook.command', command: 'updateStatus' });
      const code = result.artifacts[0].code;

      // Pass story should have non-empty string
      expect(code).toContain("newStatus: 'valid-value'");
      // Fail story should have empty string
      expect(code).toContain('newStatus: ""');
    });

    it('generates all commands when no command specified', () => {
      const assignCmd: IRCommand = {
        name: 'assignTask',
        entity: 'Task',
        parameters: [
          { name: 'userId', type: { name: 'string', nullable: false }, required: true },
        ],
        guards: [],
        actions: [],
        emits: [],
      };
      const ir = minimalIR({ commands: [updateStatusCommand(), assignCmd] });
      const result = projection.generate(ir, { surface: 'storybook.command' });

      expect(result.artifacts).toHaveLength(2);
    });

    it('returns error diagnostic for missing command', () => {
      const ir = minimalIR({ commands: [updateStatusCommand()] });
      const result = projection.generate(ir, { surface: 'storybook.command', command: 'nonExistent' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('COMMAND_NOT_FOUND');
    });

    it('omits play function when no guards', () => {
      const cmd: IRCommand = {
        name: 'simpleAction',
        entity: 'Task',
        parameters: [{ name: 'value', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        actions: [],
        emits: [],
      };
      const ir = minimalIR({ commands: [cmd] });
      const result = projection.generate(ir, { surface: 'storybook.command', command: 'simpleAction' });
      const code = result.artifacts[0].code;

      expect(code).not.toContain('play:');
      expect(code).not.toContain('GuardFails');
    });
  });

  describe('storybook.all surface', () => {
    it('combines entity and command stories', () => {
      const ir = minimalIR({
        entities: [taskEntity()],
        commands: [updateStatusCommand()],
      });
      const result = projection.generate(ir, { surface: 'storybook.all' });

      expect(result.artifacts.length).toBeGreaterThanOrEqual(2);
      const ids = result.artifacts.map(a => a.id);
      expect(ids).toContain('storybook.entity.Task');
      expect(ids).toContain('storybook.command.updateStatus');
    });
  });

  describe('unknown surface', () => {
    it('returns error diagnostic', () => {
      const ir = minimalIR();
      const result = projection.generate(ir, { surface: 'storybook.invalid' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    });
  });

  describe('options', () => {
    it('respects custom titlePrefix', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, {
        surface: 'storybook.entity',
        entity: 'Task',
        options: { titlePrefix: 'MyApp' },
      });
      const code = result.artifacts[0].code;

      expect(code).toContain("title: 'MyApp/Entities/Task'");
    });

    it('respects custom componentImportPattern', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, {
        surface: 'storybook.entity',
        entity: 'Task',
        options: { componentImportPattern: '~/ui/{Entity}View' },
      });
      const code = result.artifacts[0].code;

      expect(code).toContain("from '~/ui/TaskView'");
    });

    it('omits constraint stories when disabled', () => {
      const ir = minimalIR({ entities: [taskEntity()] });
      const result = projection.generate(ir, {
        surface: 'storybook.entity',
        entity: 'Task',
        options: { includeConstraintStories: false },
      });
      const code = result.artifacts[0].code;

      expect(code).not.toContain('ConstraintViolation');
    });

    it('omits guard scenarios when disabled', () => {
      const ir = minimalIR({ commands: [updateStatusCommand()] });
      const result = projection.generate(ir, {
        surface: 'storybook.command',
        command: 'updateStatus',
        options: { includeGuardScenarios: false },
      });
      const code = result.artifacts[0].code;

      expect(code).not.toContain('GuardFails');
      expect(code).not.toContain('play:');
    });
  });

  describe('determinism', () => {
    it('produces identical output across runs', () => {
      const ir = minimalIR({
        entities: [taskEntity()],
        commands: [updateStatusCommand()],
      });
      const result1 = projection.generate(ir, { surface: 'storybook.all' });
      const result2 = projection.generate(ir, { surface: 'storybook.all' });

      expect(result1.artifacts.map(a => a.code)).toEqual(result2.artifacts.map(a => a.code));
    });
  });
});
