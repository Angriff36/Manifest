import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    deps: {
      interopDefault: true,
    },
  },
  resolve: {
    alias: {
      '@angriff36/manifest/ir-compiler': path.resolve(
        __dirname,
        '../../src/manifest/ir-compiler.ts',
      ),
      '@angriff36/manifest/compiler': path.resolve(__dirname, '../../src/manifest/compiler.ts'),
      '@angriff36/manifest/ir': path.resolve(__dirname, '../../src/manifest/ir.ts'),
      '@angriff36/manifest': path.resolve(__dirname, '../../src/manifest/runtime-engine.ts'),
    },
  },
});
