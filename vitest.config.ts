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
      '@manifest/runtime/ir-compiler': path.resolve(__dirname, './src/manifest/ir-compiler.ts'),
      '@manifest/runtime/compiler': path.resolve(__dirname, './src/manifest/compiler.ts'),
      '@manifest/runtime/ir': path.resolve(__dirname, './src/manifest/ir.ts'),
      '@manifest/runtime/projections/nextjs': path.resolve(__dirname, './src/manifest/projections/nextjs/generator.ts'),
      '@manifest/runtime': path.resolve(__dirname, './src/manifest/runtime-engine.ts'),
    },
  },
});
