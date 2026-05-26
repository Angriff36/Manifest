import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import noHardcodedVersions from './eslint-rules/no-hardcoded-versions.js';

export default tseslint.config(
  // Build artifacts and one-off generated files are never linted. The
  // previous config only ignored "dist" at the root, which left
  // packages/cli/dist/* under the lint scope and produced phantom
  // errors against compiled output.
  {
    ignores: [
      'dist',
      'dist/**',
      'dist-app/**',
      '**/dist/**',
      'packages/cli/dist/**',
      'generated.ts',
      'test.ts',
      // Exploration scripts checked into docs/. Not part of the package
      // surface; they intentionally use ad-hoc shapes that don't deserve
      // strict typing. See docs/integrations/capsule-pro/README.md for
      // their purpose.
      'docs/integrations/**/*.ts',
      // Git worktrees managed by Claude Code tooling — never linted.
      '.claude/worktrees/**',
      '.worktrees/**',
    ],
  },
  // Default rule set for everything else.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      manifest: {
        rules: {
          'no-hardcoded-versions': noHardcodedVersions,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTaggedTemplates: true,
          allowTernary: true,
        },
      ],
      // Permit deliberately-unused identifiers prefixed with `_`. This is
      // the TypeScript convention for "I know this exists but I'm not
      // using it" — common in interface implementations, destructuring,
      // and required-shape callbacks. Without this override, every
      // `_unused` triggers a false-positive lint error.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'manifest/no-hardcoded-versions': [
        'warn',
        {
          allowPatterns: [
            '**/conformance/expected/**',
            '**/fixtures/**',
            '**/*.test.ts',
            '**/*.test.tsx',
            '**/eslint-rules/**',
            '**/version.ts', // Source of truth for version
            '**/zipExporter.ts', // Default version for generated projects
            '**/templates.ts', // Placeholder versions for templates
          ],
          versionImportPath: './version',
        },
      ],
    },
  },
  // Test files: relax `no-explicit-any` because `any` is the standard
  // shorthand for mocks, fixtures, and stubs where the production type
  // would be overkill. The trade-off (slightly looser test code in
  // exchange for not lint-blocking real engineering work) is worth it.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test-*.ts', '**/*.bench.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
