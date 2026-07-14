#!/usr/bin/env node
/**
 * One-button release: dispatch the cut-release workflow and watch it to green.
 *
 *   pnpm manifest:publish            # patch bump (2.18.5 -> 2.18.6)
 *   pnpm manifest:publish minor      # feature bump  (also +0.0.1 — see below)
 *   pnpm manifest:publish major      # BREAKING bump (+0.1: x.Y.z -> x.Y+1.0)
 *   pnpm manifest:publish 2.19.0     # explicit version
 *
 * VERSIONING POLICY (owner decision 2026-07-14, not standard semver):
 * major/breaking bumps the MINOR digit; minor and patch both bump the PATCH
 * digit. The remap lives in cut-release.yml's Bump step. Consumers pin exact.
 *
 * Wraps `gh workflow run cut-release.yml -f version=<bump>` + `gh run watch`,
 * so releases don't depend on remembering the exact gh invocation. The actual
 * publish (test/typecheck gates -> npm OIDC -> tag/push) lives in the workflow;
 * this is just the trigger. Pre-write the CHANGELOG section first — see
 * tools/release/ensure-changelog-section.mjs.
 *
 * ponytail: thin gh wrapper; no SDK, no API client.
 */
import { execFileSync, execSync } from 'node:child_process';

const bump = process.argv[2] ?? 'patch';
const REPO = 'Angriff36/Manifest';
const WORKFLOW = 'cut-release.yml';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });

console.log(`\n▶ Dispatching ${WORKFLOW} (version=${bump}) on ${REPO}\n`);
sh(`gh workflow run ${WORKFLOW} -f version=${bump} --repo ${REPO}`);

// The dispatch is async; give GitHub a moment to register the run, then grab
// the newest cut-release run id and watch it to completion.
await new Promise((r) => setTimeout(r, 6000));
const runId = execFileSync(
  'gh',
  [
    'run',
    'list',
    '--workflow',
    WORKFLOW,
    '--repo',
    REPO,
    '--limit',
    '1',
    '--json',
    'databaseId',
    '--jq',
    '.[0].databaseId',
  ],
  { encoding: 'utf8' },
).trim();

if (!runId) {
  console.error('Could not find the dispatched run. Check: gh run list --workflow cut-release.yml');
  process.exit(1);
}

console.log(`\n▶ Watching run ${runId} (Ctrl+C stops watching, not the release)\n`);
// --exit-status makes this process fail if the release fails.
sh(`gh run watch ${runId} --repo ${REPO} --exit-status`);
