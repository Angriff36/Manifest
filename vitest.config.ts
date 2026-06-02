import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'packages/cli/**/*.test.ts', 'packages/mcp-server/**/*.test.ts', 'packages/lsp-server/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
    deps: {
      interopDefault: true,
    },
  },
  resolve: {
    // Subpath aliases mirror package.json `exports`. Specific entries
    // first; the catch-all `@angriff36/manifest` (root) last. Without
    // these aliases, tests resolve the published tarball under
    // node_modules/, not the in-tree sources.
    //
    // NOTE: Array-style entries use regex/exact match so that
    // `@angriff36/manifest/projections` does NOT shadow the longer
    // `@angriff36/manifest/projections/nextjs` alias.
    alias: [
      // Exact match for the projections registry (not a prefix match)
      {
        find: /^@angriff36\/manifest\/projections$/,
        replacement: path.resolve(__dirname, './src/manifest/projections/registry.ts'),
      },
      // Sub-path projection aliases (more specific, must come before catch-all)
      {
        find: '@angriff36/manifest/projections/nextjs',
        replacement: path.resolve(__dirname, './src/manifest/projections/nextjs/generator.ts'),
      },
      {
        find: '@angriff36/manifest/projections/routes',
        replacement: path.resolve(__dirname, './src/manifest/projections/routes/generator.ts'),
      },
      // All other aliases (object-style, prefix matching is fine here)
      {
        find: '@angriff36/manifest/lexer',
        replacement: path.resolve(__dirname, './src/manifest/lexer.ts'),
      },
      {
        find: '@angriff36/manifest/parser',
        replacement: path.resolve(__dirname, './src/manifest/parser.ts'),
      },
      {
        find: '@angriff36/manifest/types',
        replacement: path.resolve(__dirname, './src/manifest/types.ts'),
      },
      {
        find: '@angriff36/manifest/ir-compiler',
        replacement: path.resolve(__dirname, './src/manifest/ir-compiler.ts'),
      },
      {
        find: '@angriff36/manifest/compiler',
        replacement: path.resolve(__dirname, './src/manifest/compiler.ts'),
      },
      {
        find: '@angriff36/manifest/ir',
        replacement: path.resolve(__dirname, './src/manifest/ir.ts'),
      },
      {
        find: '@angriff36/manifest/ir-diff',
        replacement: path.resolve(__dirname, './src/manifest/ir-diff.ts'),
      },
      {
        find: '@angriff36/manifest/breaking-change',
        replacement: path.resolve(__dirname, './src/manifest/breaking-change.ts'),
      },
      {
        find: '@angriff36/manifest/agent-sdk',
        replacement: path.resolve(__dirname, './src/manifest/agent-sdk/index.ts'),
      },
      {
        find: '@angriff36/manifest/registry/emit',
        replacement: path.resolve(__dirname, './src/manifest/registry/emit.ts'),
      },
      {
        find: '@angriff36/manifest/audit/memory',
        replacement: path.resolve(__dirname, './src/manifest/audit/sinks/memory.ts'),
      },
      {
        find: '@angriff36/manifest/audit/postgres',
        replacement: path.resolve(__dirname, './src/manifest/audit/sinks/postgres.ts'),
      },
      {
        find: '@angriff36/manifest/audit',
        replacement: path.resolve(__dirname, './src/manifest/audit/audit-sink.ts'),
      },
      {
        find: '@angriff36/manifest/outbox/memory',
        replacement: path.resolve(__dirname, './src/manifest/outbox/stores/memory.ts'),
      },
      {
        find: '@angriff36/manifest/outbox/postgres',
        replacement: path.resolve(__dirname, './src/manifest/outbox/stores/postgres.ts'),
      },
      {
        find: '@angriff36/manifest/outbox',
        replacement: path.resolve(__dirname, './src/manifest/outbox/outbox-store.ts'),
      },
      {
        find: '@angriff36/manifest/ir-version-store',
        replacement: path.resolve(__dirname, './src/manifest/ir-version-store.ts'),
      },
      {
        find: '@angriff36/manifest/plugin-api',
        replacement: path.resolve(__dirname, './src/manifest/plugin-api.ts'),
      },
      {
        find: '@angriff36/manifest/plugin-loader',
        replacement: path.resolve(__dirname, './src/manifest/plugin-loader.ts'),
      },
      // Catch-all root alias (last)
      {
        find: '@angriff36/manifest',
        replacement: path.resolve(__dirname, './src/manifest/runtime-engine.ts'),
      },
    ],
  },
});
