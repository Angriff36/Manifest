import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'packages/cli/**/*.test.ts',
      'packages/manifest-projection-prisma/**/*.test.ts',
    ],
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
      '@angriff36/manifest/projections/nextjs': path.resolve(__dirname, './src/manifest/projections/nextjs/generator.ts'),
      '@angriff36/manifest/projections/routes': path.resolve(__dirname, './src/manifest/projections/routes/generator.ts'),
      // Whole-projections-module entry — exposes registerProjection, getProjection, hasProjection,
      // NextJsProjection, RoutesProjection, registerBuiltinProjections. The CLI dispatch helper
      // imports from here so it can discover any registered projection (not just nextjs).
      '@angriff36/manifest/projections': path.resolve(__dirname, './src/manifest/projections/index.ts'),
      // Workspace projection package — registered from the CLI at startup so the boundary holds
      // (Prisma is not bundled into core's builtins.ts).
      '@manifest/projection-prisma': path.resolve(__dirname, './packages/manifest-projection-prisma/src/index.ts'),
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
