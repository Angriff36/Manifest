/**
 * Integration tests for the manifest generate command
 *
 * These tests ensure the CLI uses the correct projection API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextJsProjection } from '../manifest/projections/nextjs/generator';
import type { IR } from '../manifest/ir';

// Minimal valid IR for testing
const mockIR: IR = {
  version: '1.0',
  entities: [
    {
      name: 'TestEntity',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['readonly'] },
        { name: 'name', type: { name: 'string', nullable: false }, modifiers: [] },
      ],
    },
  ],
  commands: [],
  events: [],
};

describe('CLI Generate Command - API Contract Tests', () => {
  let projection: NextJsProjection;

  beforeEach(() => {
    projection = new NextJsProjection({});
  });

  describe('Projection API compliance', () => {
    it('should have generate method that accepts IR and ProjectionRequest', () => {
      expect(projection).toHaveProperty('generate');
      expect(typeof projection.generate).toBe('function');
    });

    it('should return ProjectionResult with artifacts array', () => {
      const result = projection.generate(mockIR, {
        surface: 'ts.types',
      });

      expect(result).toHaveProperty('artifacts');
      expect(Array.isArray(result.artifacts)).toBe(true);
      expect(result).toHaveProperty('diagnostics');
      expect(Array.isArray(result.diagnostics)).toBe(true);
    });

    it('should NOT have deprecated convenience methods', () => {
      // These old methods should NOT exist
      expect(projection).not.toHaveProperty('generateRoute');
      expect(projection).not.toHaveProperty('generateTypes');
      expect(projection).not.toHaveProperty('generateClient');
    });

    it('should generate nextjs.route surface correctly', () => {
      const result = projection.generate(mockIR, {
        surface: 'nextjs.route',
        entity: 'TestEntity',
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('nextjs.route:TestEntity');
      expect(result.artifacts[0].pathHint).toContain('testentity');
      expect(result.artifacts[0].contentType).toBe('typescript');
      expect(result.artifacts[0].code).toContain('export async function GET');
    });

    it('should generate ts.types surface correctly', () => {
      const result = projection.generate(mockIR, {
        surface: 'ts.types',
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('ts.types');
      expect(result.artifacts[0].code).toContain('export interface TestEntity');
    });

    it('should generate ts.client surface correctly', () => {
      const result = projection.generate(mockIR, {
        surface: 'ts.client',
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('ts.client');
      expect(result.artifacts[0].code).toContain('getTestEntitys');
    });

    it('should return error for unknown surface', () => {
      const result = projection.generate(mockIR, {
        surface: 'unknown.surface',
      });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
    });

    it('should return error for missing entity on route surface', () => {
      const result = projection.generate(mockIR, {
        surface: 'nextjs.route',
      });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('MISSING_ENTITY');
    });

    it('should return error for unknown entity', () => {
      const result = projection.generate(mockIR, {
        surface: 'nextjs.route',
        entity: 'UnknownEntity',
      });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('ENTITY_NOT_FOUND');
    });
  });

  describe('Artifact path hints', () => {
    it('should include correct subdirectories for routes', () => {
      const result = projection.generate(mockIR, {
        surface: 'nextjs.route',
        entity: 'TestEntity',
      });

      expect(result.artifacts[0].pathHint).toBe('apps/api/app/api/testentity/list/route.ts');
    });

    it('should include correct subdirectories for commands', () => {
      const irWithCommand: IR = {
        ...mockIR,
        commands: [
          {
            name: 'create',
            entity: 'TestEntity',
            parameters: [],
            guards: [],
            mutations: [],
          },
        ],
      };

      const result = projection.generate(irWithCommand, {
        surface: 'nextjs.command',
        entity: 'TestEntity',
        command: 'create',
      });

      expect(result.artifacts[0].pathHint).toBe('apps/api/app/api/testentity/create/route.ts');
    });

    it('should not include app/api prefix for types', () => {
      const result = projection.generate(mockIR, {
        surface: 'ts.types',
      });

      expect(result.artifacts[0].pathHint).toBe('src/types/manifest-generated.ts');
      expect(result.artifacts[0].pathHint).not.toContain('app/api');
    });
  });
});
