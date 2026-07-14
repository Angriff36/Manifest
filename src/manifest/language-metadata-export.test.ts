import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
};

describe('language-metadata package export', () => {
  it('exposes @angriff36/manifest/language-metadata in package.json exports', () => {
    expect(pkg.exports).toHaveProperty('./language-metadata');
    const entry = pkg.exports['./language-metadata'] as { types?: string; import?: string };
    expect(entry.types).toBe('./dist/manifest/language-metadata.d.ts');
    expect(entry.import).toBe('./dist/manifest/language-metadata.js');
  });

  it('is importable from the source module used to build the export', async () => {
    const mod = await import('./language-metadata.js');
    expect(typeof mod.getLanguageMetadata).toBe('function');
    expect(mod.getLanguageMetadata().keywords.length).toBeGreaterThan(0);
  });
});
