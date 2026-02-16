/**
 * Tests for the manifest lint-routes command.
 *
 * Verifies:
 * - Detection of hardcoded route strings
 * - Allowlist bypass
 * - Comment/generated-file skipping
 * - Multiple prefix support
 * - Config loading defaults
 * - Clean code passes without violations
 */

import { describe, it, expect } from 'vitest';
import { scanFileForRoutes, loadLintRoutesConfig } from './lint-routes';
import type { LintRoutesConfig } from './lint-routes';

const DEFAULT_CONFIG: LintRoutesConfig = {
  dirs: ['src'],
  prefixes: ['/api/'],
  allowlist: [],
  exclude: [],
};

describe('lint-routes', () => {
  // ========================================================================
  // scanFileForRoutes
  // ========================================================================

  describe('scanFileForRoutes', () => {
    it('detects hardcoded route in double-quoted string', () => {
      const content = `const url = "/api/recipes/list";`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(1);
      expect(violations[0].match).toBe('/api/recipes/list');
      expect(violations[0].line).toBe(1);
      expect(violations[0].file).toBe('src/app.ts');
    });

    it('detects hardcoded route in single-quoted string', () => {
      const content = `const url = '/api/users';`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(1);
      expect(violations[0].match).toBe('/api/users');
    });

    it('detects hardcoded route in template literal', () => {
      const content = 'const url = `/api/recipes`;';
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(1);
      expect(violations[0].match).toBe('/api/recipes');
    });

    it('detects multiple violations in one file', () => {
      const content = `
const a = "/api/recipes";
const b = '/api/users';
const c = \`/api/orders\`;
      `;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(3);
    });

    it('reports correct line numbers', () => {
      const content = `const x = 1;
const y = 2;
const url = "/api/recipes";
const z = 3;`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(1);
      expect(violations[0].line).toBe(3);
    });

    it('skips single-line comments', () => {
      const content = `// const url = "/api/recipes";`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(0);
    });

    it('skips multi-line comment markers', () => {
      const content = `/* const url = "/api/recipes"; */`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(0);
    });

    it('skips lines with DO NOT EDIT', () => {
      const content = `// DO NOT EDIT — generated route: "/api/recipes"`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(0);
    });

    it('skips lines with Auto-generated', () => {
      const content = `// Auto-generated: "/api/recipes"`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(0);
    });

    it('respects allowlist — exact match', () => {
      const config: LintRoutesConfig = {
        ...DEFAULT_CONFIG,
        allowlist: ['/api/health'],
      };
      const content = `const url = "/api/health";`;
      const violations = scanFileForRoutes(content, 'src/app.ts', config);

      expect(violations).toHaveLength(0);
    });

    it('respects allowlist — prefix match', () => {
      const config: LintRoutesConfig = {
        ...DEFAULT_CONFIG,
        allowlist: ['/api/health'],
      };
      const content = `const url = "/api/health/deep";`;
      const violations = scanFileForRoutes(content, 'src/app.ts', config);

      expect(violations).toHaveLength(0);
    });

    it('does not allowlist non-matching paths', () => {
      const config: LintRoutesConfig = {
        ...DEFAULT_CONFIG,
        allowlist: ['/api/health'],
      };
      const content = `const url = "/api/recipes";`;
      const violations = scanFileForRoutes(content, 'src/app.ts', config);

      expect(violations).toHaveLength(1);
    });

    it('supports multiple prefixes', () => {
      const config: LintRoutesConfig = {
        ...DEFAULT_CONFIG,
        prefixes: ['/api/', '/v1/', '/v2/'],
      };
      const content = `
const a = "/api/recipes";
const b = "/v1/users";
const c = "/v2/orders";
const d = "/other/path";
      `;
      const violations = scanFileForRoutes(content, 'src/app.ts', config);

      expect(violations).toHaveLength(3);
      expect(violations.map(v => v.match)).toEqual([
        '/api/recipes',
        '/v1/users',
        '/v2/orders',
      ]);
    });

    it('clean code produces zero violations', () => {
      const content = `
import { recipeListPath, recipeCreatePath } from './routes';

const recipes = await fetch(recipeListPath());
const result = await fetch(recipeCreatePath(), { method: 'POST', body });
      `;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations).toHaveLength(0);
    });

    it('includes suggestion in violations', () => {
      const content = `const url = "/api/recipes";`;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);

      expect(violations[0].suggestion).toContain('route helper');
      expect(violations[0].suggestion).toContain('routes.ts');
    });

    it('handles empty file', () => {
      const violations = scanFileForRoutes('', 'src/app.ts', DEFAULT_CONFIG);
      expect(violations).toHaveLength(0);
    });

    it('handles file with no matching strings', () => {
      const content = `
const x = 42;
const name = "hello world";
const path = "/other/path";
      `;
      const violations = scanFileForRoutes(content, 'src/app.ts', DEFAULT_CONFIG);
      expect(violations).toHaveLength(0);
    });
  });

  // ========================================================================
  // Config loading
  // ========================================================================

  describe('loadLintRoutesConfig', () => {
    it('returns defaults when no config file exists', async () => {
      // Use a path that definitely has no manifest config
      const config = await loadLintRoutesConfig('/nonexistent/path');

      expect(config.dirs).toEqual(['src', 'app', 'pages', 'components', 'lib']);
      expect(config.prefixes).toEqual(['/api/']);
      expect(config.allowlist).toEqual([]);
      expect(config.exclude.length).toBeGreaterThan(0);
    });
  });
});
