/**
 * Unit tests for the SvelteKit projection.
 *
 * Validates:
 *   - Projection metadata (name, description, declared surfaces)
 *   - Auto-registration in the canonical projection registry
 *   - sveltekit.server  → +server.ts emits GET/POST handlers
 *   - sveltekit.load    → +page.server.ts emits load + actions
 *   - sveltekit.command → +server.ts for a single command
 *   - sveltekit.types   → entity/command TypeScript types
 *   - sveltekit.client  → $lib client utilities
 *   - Error diagnostics for missing entity / command / unknown surface
 *   - Option normalization (auth provider, tenant provider, validation)
 *   - Deterministic output and SvelteKit-specific conventions
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRCommand, IRPolicy } from '../../ir';
import { SvelteKitProjection } from './generator';
// Static import: pulling the full registry graph through a dynamic import
// inside a test body can exceed the 5s test timeout under full-suite load.
// Registration stays lazy — it happens inside getProjection(), not at import.
import { getProjection } from '../registry';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function minimalIR(overrides?: Partial<IR>): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: '0.3.21',
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
      {
        name: 'title',
        type: { name: 'string', nullable: false },
        modifiers: ['required'],
        defaultValue: { kind: 'string', value: '' },
      },
      {
        name: 'status',
        type: { name: 'string', nullable: false },
        modifiers: ['required'],
        defaultValue: { kind: 'string', value: 'todo' },
      },
      {
        name: 'priority',
        type: { name: 'int', nullable: true },
        modifiers: [],
        defaultValue: { kind: 'number', value: 1 },
      },
      { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      { name: 'deletedAt', type: { name: 'datetime', nullable: true }, modifiers: [] },
      { name: 'createdAt', type: { name: 'datetime', nullable: false }, modifiers: [] },
    ],
    computedProperties: [
      {
        name: 'isHighPriority',
        type: { name: 'boolean', nullable: false },
        expression: {
          kind: 'binary',
          operator: '>=',
          left: {
            kind: 'member',
            object: { kind: 'identifier', name: 'self' },
            property: 'priority',
          },
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
    parameters: [{ name: 'newStatus', type: { name: 'string', nullable: false }, required: true }],
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

function onlyAssigneePolicy(): IRPolicy {
  return {
    name: 'OnlyAssignee',
    entity: 'Task',
    action: 'execute',
    expression: {
      kind: 'binary',
      operator: '==',
      left: { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'id' },
      right: {
        kind: 'member',
        object: { kind: 'identifier', name: 'self' },
        property: 'assigneeId',
      },
    },
    message: 'Only the assigned user can execute this command',
  };
}

function fullIR(): IR {
  return minimalIR({
    entities: [taskEntity()],
    commands: [updateStatusCommand()],
    policies: [onlyAssigneePolicy()],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SvelteKitProjection', () => {
  const projection = new SvelteKitProjection();

  // -------------------------------------------------------------------------
  // Metadata + registry registration
  // -------------------------------------------------------------------------

  describe('projection metadata', () => {
    it('has correct name', () => {
      expect(projection.name).toBe('sveltekit');
    });

    it('has a non-empty description mentioning SvelteKit', () => {
      expect(projection.description).toBeTruthy();
      expect(projection.description).toContain('SvelteKit');
    });

    it('declares all five surfaces', () => {
      expect(projection.surfaces).toContain('sveltekit.server');
      expect(projection.surfaces).toContain('sveltekit.load');
      expect(projection.surfaces).toContain('sveltekit.command');
      expect(projection.surfaces).toContain('sveltekit.types');
      expect(projection.surfaces).toContain('sveltekit.client');
    });

    it('is registered as a built-in projection', () => {
      const p = getProjection('sveltekit');
      expect(p).toBeDefined();
      expect(p!.name).toBe('sveltekit');
    });
  });

  // -------------------------------------------------------------------------
  // sveltekit.server
  // -------------------------------------------------------------------------

  describe('sveltekit.server surface', () => {
    it('emits a +server.ts artifact at the entity route', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].pathHint).toBe('src/routes/task/+server.ts');
      expect(result.artifacts[0].id).toBe('sveltekit.server:Task');
      expect(result.artifacts[0].contentType).toBe('typescript');
    });

    it('emits both GET and POST RequestHandler exports', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
      });
      const code = result.artifacts[0].code;

      expect(code).toContain('export const GET: RequestHandler');
      expect(code).toContain('export const POST: RequestHandler');
      expect(code).toContain('import { json } from "@sveltejs/kit"');
      expect(code).toContain('import type { RequestHandler } from "./$types"');
    });

    it('routes writes through the Manifest runtime', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
      }).artifacts[0].code;

      expect(code).toContain('createManifestRuntime');
      expect(code).toContain('runtime.runCommand("Task", command,');
    });

    it('emits status-coded responses for failed commands', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
      }).artifacts[0].code;

      expect(code).toContain('"policy_denial"');
      expect(code).toContain('"guard_failure"');
      expect(code).toContain('"constraint_block"');
      expect(code).toContain('"concurrency_conflict"');
    });

    it('returns MISSING_ENTITY diagnostic when entity is omitted', () => {
      const result = projection.generate(fullIR(), { surface: 'sveltekit.server' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('MISSING_ENTITY');
    });

    it('returns ENTITY_NOT_FOUND for unknown entity name', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'NotAnEntity',
      });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('ENTITY_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // sveltekit.load
  // -------------------------------------------------------------------------

  describe('sveltekit.load surface', () => {
    it('emits a +page.server.ts artifact at the entity route', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.load',
        entity: 'Task',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].pathHint).toBe('src/routes/task/+page.server.ts');
      expect(result.artifacts[0].id).toBe('sveltekit.load:Task');
    });

    it('emits PageServerLoad load function', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.load',
        entity: 'Task',
      }).artifacts[0].code;

      expect(code).toContain('export const load: PageServerLoad');
      expect(code).toContain('import type { Actions, PageServerLoad } from "./$types"');
    });

    it('emits a form Actions export with command keys', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.load',
        entity: 'Task',
      }).artifacts[0].code;

      expect(code).toContain('export const actions: Actions');
      expect(code).toContain('updateStatus: async (event)');
    });

    it('uses fail() for command failures inside actions', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.load',
        entity: 'Task',
      }).artifacts[0].code;

      expect(code).toContain('import { error, redirect, fail }');
      expect(code).toContain('return fail(status, {');
    });

    it('throws redirect when load auth fails', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.load',
        entity: 'Task',
      }).artifacts[0].code;

      expect(code).toContain('throw redirect(');
    });

    it('honors emitFormActions: false', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.load',
        entity: 'Task',
        options: { emitFormActions: false },
      }).artifacts[0].code;

      expect(code).not.toContain('export const actions');
    });
  });

  // -------------------------------------------------------------------------
  // sveltekit.command
  // -------------------------------------------------------------------------

  describe('sveltekit.command surface', () => {
    it('emits a +server.ts artifact at the command route', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.command',
        entity: 'Task',
        command: 'updateStatus',
      });

      expect(result.diagnostics).toHaveLength(0);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].pathHint).toBe(
        'src/routes/task/commands/update-status/+server.ts',
      );
      expect(result.artifacts[0].id).toBe('sveltekit.command:Task.updateStatus');
    });

    it('only emits a POST RequestHandler for the command', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.command',
        entity: 'Task',
        command: 'updateStatus',
      }).artifacts[0].code;

      expect(code).toContain('export const POST: RequestHandler');
      expect(code).not.toContain('export const GET');
    });

    it('annotates with command guards/policies/emits in JSDoc', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.command',
        entity: 'Task',
        command: 'updateStatus',
      }).artifacts[0].code;

      expect(code).toContain('Guards: 1');
      expect(code).toContain('Policies: OnlyAssignee');
      expect(code).toContain('Emits: TaskStatusUpdated');
    });

    it('returns MISSING_COMMAND when command is omitted', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.command',
        entity: 'Task',
      });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('MISSING_COMMAND');
    });

    it('returns COMMAND_NOT_FOUND for unknown command', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.command',
        entity: 'Task',
        command: 'nope',
      });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('COMMAND_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // sveltekit.types
  // -------------------------------------------------------------------------

  describe('sveltekit.types surface', () => {
    it('emits entity interfaces alphabetically', () => {
      const ir = minimalIR({
        entities: [
          taskEntity(),
          {
            name: 'User',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
              { name: 'email', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            computedProperties: [],
            relationships: [],
            commands: [],
            constraints: [],
            policies: [],
          },
        ],
      });
      const code = projection.generate(ir, { surface: 'sveltekit.types' }).artifacts[0].code;

      expect(code).toContain('export interface Task');
      expect(code).toContain('export interface User');
      expect(code.indexOf('export interface Task')).toBeLessThan(
        code.indexOf('export interface User'),
      );
    });

    it('includes ManifestActionResult shape', () => {
      const code = projection.generate(fullIR(), { surface: 'sveltekit.types' }).artifacts[0].code;

      expect(code).toContain('export interface ManifestActionResult');
      expect(code).toContain('success: boolean');
      expect(code).toContain('export interface ManifestDiagnostic');
    });

    it('emits command parameter interfaces', () => {
      const code = projection.generate(fullIR(), { surface: 'sveltekit.types' }).artifacts[0].code;
      expect(code).toContain('export interface TaskUpdateStatusParams');
      expect(code).toContain('newStatus: string');
    });

    it('produces deterministic output', () => {
      const a = projection.generate(fullIR(), {
        surface: 'sveltekit.types',
        options: { generatedAt: '2025-01-01T00:00:00.000Z' },
      });
      const b = projection.generate(fullIR(), {
        surface: 'sveltekit.types',
        options: { generatedAt: '2025-01-01T00:00:00.000Z' },
      });
      expect(a.artifacts[0].code).toEqual(b.artifacts[0].code);
    });

    it('puts the types file under src/lib/', () => {
      const result = projection.generate(fullIR(), { surface: 'sveltekit.types' });
      expect(result.artifacts[0].pathHint).toBe('src/lib/manifest-types.ts');
    });
  });

  // -------------------------------------------------------------------------
  // sveltekit.client
  // -------------------------------------------------------------------------

  describe('sveltekit.client surface', () => {
    it('emits client utilities under $lib', () => {
      const result = projection.generate(fullIR(), { surface: 'sveltekit.client' });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].pathHint).toBe('src/lib/manifest-client.ts');
      expect(result.artifacts[0].id).toBe('sveltekit.client');
    });

    it('exports invokeManifestCommand and normalizeCommandResult', () => {
      const code = projection.generate(fullIR(), { surface: 'sveltekit.client' }).artifacts[0].code;

      expect(code).toContain('export async function invokeManifestCommand');
      expect(code).toContain('export function normalizeCommandResult');
      expect(code).toContain('import type { ManifestActionResult');
    });
  });

  // -------------------------------------------------------------------------
  // Unknown surface
  // -------------------------------------------------------------------------

  describe('unknown surface', () => {
    it('returns UNKNOWN_SURFACE diagnostic', () => {
      const result = projection.generate(fullIR(), { surface: 'sveltekit.bogus' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
      expect(result.diagnostics[0].message).toContain('sveltekit.bogus');
    });
  });

  // -------------------------------------------------------------------------
  // Options
  // -------------------------------------------------------------------------

  describe('options handling', () => {
    it('respects custom routesDir', () => {
      const result = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { routesDir: 'custom/routes' },
      });
      expect(result.artifacts[0].pathHint).toBe('custom/routes/task/+server.ts');
    });

    it('supports authProvider: none', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { authProvider: 'none' },
      }).artifacts[0].code;

      expect(code).toContain('Auth disabled');
      expect(code).not.toContain('lucia');
    });

    it('supports authProvider: lucia by default', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
      }).artifacts[0].code;
      expect(code).toContain('import { lucia } from "$lib/server/auth"');
      expect(code).toContain('event.locals.session');
    });

    it('supports authProvider: auth-js', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { authProvider: 'auth-js' },
      }).artifacts[0].code;
      expect(code).toContain('getServerSession');
    });

    it('supports authProvider: custom', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { authProvider: 'custom' },
      }).artifacts[0].code;
      expect(code).toContain('requireUser');
    });

    it('disables tenant filtering when includeTenantFilter is false', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { includeTenantFilter: false },
      }).artifacts[0].code;
      expect(code).not.toContain('userTenantMapping');
      expect(code).not.toContain('tenantId,');
    });

    it('honors custom tenantProvider', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: {
          tenantProvider: {
            importPath: '$lib/server/tenant',
            functionName: 'getTenantIdForOrg',
            lookupKey: 'orgId',
          },
        },
      }).artifacts[0].code;
      expect(code).toContain('getTenantIdForOrg(orgId)');
    });

    it('uses configured unauthorizedStatus', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { unauthorizedStatus: 403 },
      }).artifacts[0].code;
      expect(code).toContain('status: 403');
    });

    it('omits comments when includeComments is false', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { includeComments: false },
      }).artifacts[0].code;
      expect(code).not.toContain('Auto-generated SvelteKit');
    });

    it('omits the ./$types import when emitTypeImports is false', () => {
      const code = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: { emitTypeImports: false },
      }).artifacts[0].code;
      expect(code).not.toContain('./$types');
    });
  });

  // -------------------------------------------------------------------------
  // Determinism
  // -------------------------------------------------------------------------

  describe('determinism', () => {
    it('produces identical output across invocations when generatedAt is pinned', () => {
      const opts = { generatedAt: '2025-01-01T00:00:00.000Z' };
      const a = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: opts,
      }).artifacts[0].code;
      const b = projection.generate(fullIR(), {
        surface: 'sveltekit.server',
        entity: 'Task',
        options: opts,
      }).artifacts[0].code;
      expect(a).toEqual(b);
    });
  });
});
