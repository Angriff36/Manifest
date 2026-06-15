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
      // Git-ignored scratch directory (temporary generate/diff experiments).
      // ESLint flat config does not read .gitignore, so this must be listed
      // explicitly or it lints throwaway files that aren't part of the repo.
      '.tmp/**',
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
            // OpenAPI generator: the version literals here are the OpenAPI
            // spec format version ("3.1.0") and the generated document's
            // default info.version ("1.0.0") — neither is the Manifest
            // package version, so importing ./version would be wrong.
            '**/projections/openapi/generator.ts',
            // The following version literals are NOT the Manifest package
            // version, so importing ./version would be incorrect:
            //  - ir-version-store.ts: the initial semver tag ("0.1.0")
            //    assigned to a user's IR artifact when no prior tag exists.
            //  - mcp-server/src/index.ts: the MCP server's own advertised
            //    version (a separate package).
            //  - assembly/index.ts: the WASM runtime version constant
            //    (AssemblyScript cannot import the TS ./version module).
            '**/ir-version-store.ts',
            '**/mcp-server/src/index.ts',
            '**/assembly/index.ts',
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
  },
  // Projection boundary: generated code is a *view* of the IR, never of the
  // runtime. Projections must depend on IR and shared projection utilities
  // only — importing the runtime engine would couple code generation to
  // runtime internals and erode the IR-first contract (see CLAUDE.md
  // "Module Boundaries"). IR types and shared helpers are unaffected; this
  // rule blocks the runtime-engine module specifically.
  {
    files: ['src/manifest/projections/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/runtime-engine',
                '**/runtime-engine.js',
                '@angriff36/manifest/runtime-engine',
              ],
              message:
                'Projections are views of the IR and must not import the runtime engine. Depend on IR types instead (see CLAUDE.md "Module Boundaries").',
            },
          ],
        },
      ],
    },
  }
);
