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
    alias: {
      '@angriff36/manifest/ir-compiler': path.resolve(__dirname, './src/manifest/ir-compiler.ts'),
      '@angriff36/manifest/compiler': path.resolve(__dirname, './src/manifest/compiler.ts'),
      '@angriff36/manifest/ir': path.resolve(__dirname, './src/manifest/ir.ts'),
      '@angriff36/manifest/projections/nextjs': path.resolve(__dirname, './src/manifest/projections/nextjs/generator.ts'),
      '@angriff36/manifest/projections/routes': path.resolve(__dirname, './src/manifest/projections/routes/generator.ts'),
      '@angriff36/manifest': path.resolve(__dirname, './src/manifest/runtime-engine.ts'),
    },
  },
});
