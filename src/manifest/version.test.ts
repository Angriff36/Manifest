import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COMPILER_VERSION, SCHEMA_VERSION } from './version';

/**
 * Guard against compilerVersion desync: COMPILER_VERSION must always match
 * package.json. The `version` lifecycle script (scripts/sync-version.mjs)
 * keeps them in lockstep during release bumps; this test makes any manual
 * drift fail the suite — and the cut-release workflow gates publishing on
 * the suite, so a desynced version can never ship.
 */
describe('version constants', () => {
  it('COMPILER_VERSION matches package.json version', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
    ) as { version: string };
    expect(COMPILER_VERSION).toBe(pkg.version);
  });

  it('SCHEMA_VERSION is the IR contract version, independent of releases', () => {
    expect(SCHEMA_VERSION).toBe('1.0');
  });
});
