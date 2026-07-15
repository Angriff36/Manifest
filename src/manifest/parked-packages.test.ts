/**
 * Parked sub-packages must stay private until an explicit unpark + publish.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');

const PARKED = [
  'packages/mcp-server/package.json',
  'packages/lsp-server/package.json',
  'packages/stdlib/package.json',
  'packages/vscode-extension/package.json',
] as const;

describe('parked Manifest sub-packages', () => {
  it('marks mcp/lsp/stdlib/vscode packages private (unpublished)', () => {
    for (const rel of PARKED) {
      const pkg = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')) as {
        name?: string;
        private?: boolean;
      };
      expect(pkg.private, `${rel} (${pkg.name}) must be private`).toBe(true);
    }
  });
});
