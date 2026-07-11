import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8'),
) as {
  exports?: Record<string, unknown>;
  files?: string[];
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, unknown>;
  scripts?: Record<string, string>;
};

describe('WASM package surface', () => {
  it('does not expose a quarantined wasm subpath export', () => {
    expect(packageJson.exports).not.toHaveProperty('./wasm');
  });

  it('does not advertise unpublished wasm packaging hooks', () => {
    expect(packageJson.scripts).not.toHaveProperty('wasm:build');
    expect(packageJson.scripts).not.toHaveProperty('wasm:build:debug');
    expect(packageJson.files).not.toContain('src/manifest/wasm/*.wasm');
  });

  it('does not require the AssemblyScript loader as a package peer', () => {
    expect(packageJson.peerDependencies).not.toHaveProperty('@assemblyscript/loader');
    expect(packageJson.peerDependenciesMeta).not.toHaveProperty('@assemblyscript/loader');
  });
});
