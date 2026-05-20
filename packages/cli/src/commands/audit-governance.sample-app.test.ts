import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditGovernanceCommand } from './audit-governance';

/**
 * Application-agnostic proof.
 *
 * `fixtures/sample-app/` is a generic governed app (a library lending books
 * to members). The fixture intentionally contains zero project-specific
 * downstream-app vocabulary. These tests run the full audit-governance
 * suite against that fixture and assert it passes — proof that Manifest's
 * governance surfaces work for any downstream application.
 *
 * If these tests start failing, it likely means a detector has been
 * specialized for one downstream app's assumptions. Fix the detector to
 * stay generic; do NOT adapt the sample fixture to match.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/cli/src/commands → repo root is 4 levels up.
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const sampleRoot = path.join(repoRoot, 'fixtures', 'sample-app');
const commandsRegistry = path.join(sampleRoot, 'manifest-registry', 'commands.json');
const bypassRegistry = path.join(sampleRoot, 'bypasses.json');

describe('audit-governance vs. generic sample app', () => {
  it('runs every detector against the sample fixture and reports zero errors', async () => {
    const result = await auditGovernanceCommand({
      root: sampleRoot,
      commandsRegistry,
      bypassRegistry,
      format: 'json',
    });
    expect(result.errorCount).toBe(0);
    expect(result.detectorsRun).toEqual(
      expect.arrayContaining([
        'direct-writes',
        'event-fabrication',
        'route-drift',
        'missing-tests',
        'bypass-violations',
      ])
    );
  });

  it('missing-tests detector finds a reference for every governed commandId', async () => {
    const result = await auditGovernanceCommand({
      root: sampleRoot,
      only: 'missing-tests',
      commandsRegistry,
      format: 'json',
    });
    const missing = result.findings.filter((f) => f.code === 'MISSING_CONFORMANCE_TEST');
    expect(missing).toEqual([]);
  });

  it('route-drift detector treats the sample dispatcher route as canonical', async () => {
    const result = await auditGovernanceCommand({
      root: sampleRoot,
      only: 'route-drift',
      format: 'json',
    });
    const drift = result.findings.filter((f) => f.code === 'ROUTE_DRIFT');
    expect(drift).toEqual([]);
  });

  it('bypass-violations detector flags nothing when the sample bypass registry is consulted', async () => {
    const result = await auditGovernanceCommand({
      root: sampleRoot,
      only: 'bypass-violations',
      bypassRegistry,
      format: 'json',
    });
    const violations = result.findings.filter((f) => f.code === 'BYPASS_VIOLATION');
    expect(violations).toEqual([]);
  });
});
