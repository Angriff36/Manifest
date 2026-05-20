import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { auditConstitutionCommand } from './audit-constitution';
import { auditGovernanceCommand } from './audit-governance';

/**
 * `audit-constitution` is a deprecated alias for `audit-governance`. These
 * tests pin two guarantees: (1) the alias still exists and runs, and
 * (2) it forwards calls to the canonical implementation without diverging.
 * Full behavior coverage lives in audit-governance.test.ts.
 */

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('manifest audit-constitution (deprecated alias)', () => {
  it('still runs and returns the canonical result shape', async () => {
    const dir = await tempDir('manifest-audit-const-alias-');
    const result = await auditConstitutionCommand({ root: dir, format: 'json' });
    expect(result.detectorsRun).toEqual(
      expect.arrayContaining(['direct-writes', 'route-drift', 'missing-tests'])
    );
    expect(result.findings).toBeDefined();
    expect(typeof result.errorCount).toBe('number');
    expect(typeof result.warningCount).toBe('number');
  });

  it('forwards to the canonical audit-governance command', async () => {
    const dir = await tempDir('manifest-audit-const-fwd-');
    const aliasResult = await auditConstitutionCommand({
      root: dir,
      only: 'direct-writes',
      format: 'json',
    });
    const canonicalResult = await auditGovernanceCommand({
      root: dir,
      only: 'direct-writes',
      format: 'json',
    });
    expect(aliasResult.detectorsRun).toEqual(canonicalResult.detectorsRun);
    expect(aliasResult.errorCount).toBe(canonicalResult.errorCount);
    expect(aliasResult.warningCount).toBe(canonicalResult.warningCount);
  });
});
