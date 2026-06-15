/**
 * Snapshot tests for all built-in projection generators.
 *
 * These tests compile a representative Manifest program to IR, then run every
 * built-in projection against it and snapshot the generated artifacts. Changes
 * to generated code show up as snapshot diffs in code review.
 *
 * To update snapshots after intentional changes:
 *   npx vitest -u src/manifest/projections/snapshot.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRCommand, IREvent, IRPolicy, IRStore } from '../ir';
import { listBuiltinProjections } from './builtins';
import type { ProjectionTarget, ProjectionResult } from './interface';

// ---------------------------------------------------------------------------
// Shared IR fixture — a small but representative program with entities,
// commands, computed properties, relationships, events, policies, and a
// durable store so ORM projections (Prisma, Drizzle) emit output.
// ---------------------------------------------------------------------------

function snapshotIR(): IR {
  const taskEntity: IREntity = {
    name: 'Task',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'], defaultValue: { kind: 'string', value: '' } },
      { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'], defaultValue: { kind: 'string', value: 'todo' } },
      { name: 'priority', type: { name: 'int', nullable: true }, modifiers: [], defaultValue: { kind: 'number', value: 1 } },
      { name: 'assigneeId', type: { name: 'string', nullable: true }, modifiers: [] },
      { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: [] },
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
    relationships: [
      {
        name: 'assignee',
        kind: 'belongsTo',
        target: 'User',
        foreignKey: { fields: ['assigneeId'] },
      },
    ],
    commands: ['updateStatus', 'assignTask'],
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
    policies: ['OnlyAssignee'],
  };

  const userEntity: IREntity = {
    name: 'User',
    properties: [
      { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'email', type: { name: 'string', nullable: false }, modifiers: ['required', 'unique'] },
      { name: 'role', type: { name: 'string', nullable: false }, modifiers: ['required'], defaultValue: { kind: 'string', value: 'member' } },
    ],
    computedProperties: [],
    relationships: [
      {
        name: 'tasks',
        kind: 'hasMany',
        target: 'Task',
        foreignKey: { fields: ['assigneeId'] },
      },
    ],
    commands: [],
    constraints: [],
    policies: [],
  };

  const commands: IRCommand[] = [
    {
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
    },
    {
      name: 'assignTask',
      entity: 'Task',
      parameters: [
        { name: 'userId', type: { name: 'string', nullable: false }, required: true },
      ],
      guards: [
        {
          kind: 'binary',
          operator: '!=',
          left: { kind: 'identifier', name: 'userId' },
          right: { kind: 'literal', value: { kind: 'string', value: '' } },
        },
      ],
      actions: [
        {
          kind: 'mutate',
          target: 'assigneeId',
          expression: { kind: 'identifier', name: 'userId' },
        },
      ],
      emits: ['TaskAssigned'],
    },
  ];

  const events: IREvent[] = [
    {
      name: 'TaskStatusUpdated',
      channel: 'tasks.updated',
      payload: [
        { name: 'id', type: { name: 'string', nullable: false }, required: true },
        { name: 'newStatus', type: { name: 'string', nullable: false }, required: true },
      ],
    },
    {
      name: 'TaskAssigned',
      channel: 'tasks.assigned',
      payload: [
        { name: 'id', type: { name: 'string', nullable: false }, required: true },
        { name: 'userId', type: { name: 'string', nullable: false }, required: true },
      ],
    },
  ];

  const policies: IRPolicy[] = [
    {
      name: 'OnlyAssignee',
      entity: 'Task',
      action: 'execute',
      expression: {
        kind: 'binary',
        operator: '==',
        left: { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'id' },
        right: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'assigneeId' },
      },
      message: 'Only the assigned user can execute this command',
    },
  ];

  const stores: IRStore[] = [
    { entity: 'Task', target: 'durable', config: {} },
    { entity: 'User', target: 'durable', config: {} },
  ];

  return {
    version: '1.0',
    provenance: {
      contentHash: 'snapshot-fixture-hash',
      compilerVersion: 'snapshot-test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [taskEntity, userEntity],
    enums: [],
    stores,
    events,
    commands,
    policies,
  };
}

// ---------------------------------------------------------------------------
// Helper: collect all artifacts from all surfaces of a projection
// ---------------------------------------------------------------------------

function generateAllSurfaces(projection: ProjectionTarget, ir: IR): ProjectionResult {
  const allArtifacts: ProjectionResult['artifacts'] = [];
  const allDiagnostics: ProjectionResult['diagnostics'] = [];

  for (const surface of projection.surfaces) {
    // For entity-scoped surfaces, generate for each entity
    const result = projection.generate(ir, { surface });
    allArtifacts.push(...result.artifacts);
    allDiagnostics.push(...result.diagnostics);

    // Also try entity-scoped generation for each entity
    for (const entity of ir.entities) {
      const entityResult = projection.generate(ir, { surface, entity: entity.name });
      // Only add artifacts that weren't already generated by the non-entity call
      for (const artifact of entityResult.artifacts) {
        if (!allArtifacts.some(a => a.id === artifact.id)) {
          allArtifacts.push(artifact);
        }
      }
      // Collect unique diagnostics
      for (const diag of entityResult.diagnostics) {
        if (!allDiagnostics.some(d => d.message === diag.message && d.entity === diag.entity)) {
          allDiagnostics.push(diag);
        }
      }
    }
  }

  return { artifacts: allArtifacts, diagnostics: allDiagnostics };
}

// ---------------------------------------------------------------------------
// Normalize non-deterministic content (timestamps) so snapshots are stable.
// ---------------------------------------------------------------------------

const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const STABLE_TIMESTAMP = '2025-01-01T00:00:00.000Z';

function stabilize(code: string): string {
  return code.replace(ISO_TIMESTAMP_RE, STABLE_TIMESTAMP);
}

// ---------------------------------------------------------------------------
// Snapshot tests
// ---------------------------------------------------------------------------

describe('projection snapshots', () => {
  const ir = snapshotIR();
  const projections = listBuiltinProjections();

  // Sanity: ensure we're testing all built-ins
  it('covers all 27 built-in projections', () => {
    expect(projections.length).toBe(27);
  });

  for (const projection of projections) {
    describe(projection.name, () => {
      it('generated artifacts match snapshot', () => {
        const result = generateAllSurfaces(projection, ir);

        // Build a stable, readable snapshot object: map of id → stabilized code
        const snapshot: Record<string, string> = {};
        for (const artifact of result.artifacts) {
          snapshot[artifact.id] = stabilize(artifact.code);
        }

        // At least one artifact should be generated, unless the projection
        // requires projection-specific options (e.g., materialized-views needs
        // `views` in options) and only emits warning diagnostics.
        const hasOnlyOptionWarnings = result.artifacts.length === 0
          && result.diagnostics.length > 0
          && result.diagnostics.every(d => d.severity === 'warning');
        if (!hasOnlyOptionWarnings) {
          expect(Object.keys(snapshot).length).toBeGreaterThan(0);
        }

        // Snapshot even when empty so that future changes are caught
        expect(snapshot).toMatchSnapshot();
      });

      it('produces deterministic output', () => {
        const result1 = generateAllSurfaces(projection, ir);
        const result2 = generateAllSurfaces(projection, ir);

        expect(result1.artifacts.map(a => stabilize(a.code))).toEqual(
          result2.artifacts.map(a => stabilize(a.code)),
        );
      });
    });
  }
});
