import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'packages/cli/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
  },
});
