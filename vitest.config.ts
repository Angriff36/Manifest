import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'packages/cli/**/*.test.ts'],
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
    alias: {
      '@angriff36/manifest/ir-compiler': path.resolve(__dirname, './src/manifest/ir-compiler.ts'),
      '@angriff36/manifest/compiler': path.resolve(__dirname, './src/manifest/compiler.ts'),
      '@angriff36/manifest/ir': path.resolve(__dirname, './src/manifest/ir.ts'),
      '@angriff36/manifest/ir-diff': path.resolve(__dirname, './src/manifest/ir-diff.ts'),
      '@angriff36/manifest/breaking-change': path.resolve(__dirname, './src/manifest/breaking-change.ts'),
      '@angriff36/manifest/agent-sdk': path.resolve(__dirname, './src/manifest/agent-sdk/index.ts'),
      '@angriff36/manifest/projections/nextjs': path.resolve(__dirname, './src/manifest/projections/nextjs/generator.ts'),
      '@angriff36/manifest/projections/routes': path.resolve(__dirname, './src/manifest/projections/routes/generator.ts'),
      '@angriff36/manifest/registry/emit': path.resolve(__dirname, './src/manifest/registry/emit.ts'),
      '@angriff36/manifest/audit/memory': path.resolve(__dirname, './src/manifest/audit/sinks/memory.ts'),
      '@angriff36/manifest/audit/postgres': path.resolve(__dirname, './src/manifest/audit/sinks/postgres.ts'),
      '@angriff36/manifest/audit': path.resolve(__dirname, './src/manifest/audit/audit-sink.ts'),
      '@angriff36/manifest/outbox/memory': path.resolve(__dirname, './src/manifest/outbox/stores/memory.ts'),
      '@angriff36/manifest/outbox/postgres': path.resolve(__dirname, './src/manifest/outbox/stores/postgres.ts'),
      '@angriff36/manifest/outbox': path.resolve(__dirname, './src/manifest/outbox/outbox-store.ts'),
      '@angriff36/manifest': path.resolve(__dirname, './src/manifest/runtime-engine.ts'),
    },
  },
});
