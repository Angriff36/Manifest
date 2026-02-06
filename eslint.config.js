import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import noHardcodedVersions from './eslint-rules/no-hardcoded-versions.js';

export default tseslint.config(
  { ignores: ['dist', 'generated.ts', 'test.ts'] },
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
  }
);
