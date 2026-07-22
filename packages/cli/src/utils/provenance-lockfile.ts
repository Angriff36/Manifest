/**
 * Config G4 — read/write provenance.lock.json for CLI compile.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import type { IR, IRProvenance } from '@angriff36/manifest/ir';
import {
  buildProvenanceLockfile,
  checkProvenanceLockfileStale,
  resolveProvenanceConfig,
  type ProvenanceLockfile,
  type ResolvedProvenanceConfig,
} from '@angriff36/manifest/config';

export async function readProvenanceLockfile(
  cwd: string,
  relativePath: string,
): Promise<ProvenanceLockfile | null> {
  const abs = path.resolve(cwd, relativePath);
  try {
    await fs.access(abs); // Check existence first
    const raw = await fs.readFile(abs, 'utf8');
    const parsed = JSON.parse(raw) as ProvenanceLockfile;
    // Validate basic shape to reject malformed lockfiles
    if (!parsed || typeof parsed !== 'object' || !parsed.contentHash || !parsed.compilerVersion) {
      throw new Error('Invalid lockfile: missing required fields');
    }
    return parsed;
  } catch (error) {
    // Distinguish ENOENT (missing) from other errors (invalid/unreadable)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist — not an error
    }
    // File exists but is unreadable or invalid — surface the error
    throw new Error(`Failed to read lockfile: ${(error as Error).message}`);
  }
}

export async function writeProvenanceLockfile(
  cwd: string,
  relativePath: string,
  provenance: IRProvenance,
): Promise<string> {
  const abs = path.resolve(cwd, relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const entry = buildProvenanceLockfile(provenance);
  await fs.writeFile(abs, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  return abs;
}

/**
 * Fail closed when failIfStale + lockfile + deterministic drift.
 * Returns an error message or null when OK / not applicable.
 */
export async function evaluateProvenanceStale(
  cwd: string,
  policy: ResolvedProvenanceConfig,
  provenance: IRProvenance,
): Promise<string | null> {
  if (!policy.failIfStale || !policy.lockfile) return null;
  const existing = await readProvenanceLockfile(cwd, policy.lockfile);
  if (!existing) return null;
  return checkProvenanceLockfileStale(existing, provenance, {
    deterministic: policy.deterministic,
  });
}

/**
 * Idempotent provenance: if an existing output IR was produced from the SAME
 * source (identical contentHash), reuse its compiledAt and recompute irHash.
 * Bypassed when deterministic provenance is enabled (fixed compiledAt required).
 */
export async function stabilizeProvenance(
  ir: IR,
  outputPath: string,
  computeIRHash: (ir: IR) => Promise<string>,
  deterministicProvenance: boolean,
): Promise<void> {
  // Deterministic mode always uses fixed compiledAt — never reuse wall-clock
  if (deterministicProvenance) return;

  const priorRaw = await fs.readFile(outputPath, 'utf-8').catch(() => null);
  if (!priorRaw) return;
  let prior: { provenance?: { contentHash?: string; compiledAt?: string } };
  try {
    prior = JSON.parse(priorRaw);
  } catch {
    return;
  }
  if (
    ir.provenance?.contentHash &&
    prior.provenance?.contentHash === ir.provenance.contentHash &&
    prior.provenance?.compiledAt
  ) {
    ir.provenance.compiledAt = prior.provenance.compiledAt;
    ir.provenance.irHash = await computeIRHash(ir);
  }
}

/** Config G4 — failIfStale check + optional lockfile write after a successful compile. */
export async function finalizeProvenanceLock(
  ir: IR | null | undefined,
  opts: { dryRun?: boolean; cwd?: string } = {},
): Promise<void> {
  if (!ir?.provenance || opts.dryRun) return;
  const cwd = opts.cwd ?? process.cwd();
  const { loadConfig } = await import('./config.js');
  const cfg = await loadConfig(cwd);
  const policy = resolveProvenanceConfig(cfg?.provenance);
  if (!policy.stamp || !policy.lockfile) return;

  const stale = await evaluateProvenanceStale(cwd, policy, ir.provenance);
  if (stale) {
    throw new Error(stale);
  }
  const abs = await writeProvenanceLockfile(cwd, policy.lockfile, ir.provenance);
  console.log(chalk.gray(`  Provenance lock → ${path.relative(cwd, abs)}`));
}
