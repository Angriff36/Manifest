/**
 * Config G8 — build lifecycle hooks (`hooks.lifecycle`).
 *
 * Runs configured script paths around compile / generate. Fail-closed:
 * non-zero exit aborts the CLI command. Distinct from git pre-commit hooks
 * (`hooks.provider` / `manifest install-hooks`).
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

export type LifecyclePhase = 'beforeCompile' | 'afterGenerate';

export interface LifecycleHooksConfig {
  beforeCompile?: string[];
  afterGenerate?: string[];
}

/** Flat git-hook fields plus optional G8 lifecycle (backward compatible). */
export interface HooksWithLifecycle {
  skipInCi?: boolean;
  provider?: 'husky' | 'simple-git-hooks';
  runFmt?: boolean;
  runValidate?: boolean;
  lifecycle?: LifecycleHooksConfig;
}

export interface RunLifecycleHooksOptions {
  cwd: string;
  /** When true, list scripts without executing. */
  dryRun?: boolean;
  /** Injected runner for tests. */
  runScript?: (scriptPath: string, cwd: string) => Promise<void>;
}

function scriptsForPhase(hooks: HooksWithLifecycle | undefined, phase: LifecyclePhase): string[] {
  const list = hooks?.lifecycle?.[phase];
  if (!list || list.length === 0) return [];
  return list.map((s) => s.trim()).filter(Boolean);
}

async function assertReadable(scriptPath: string): Promise<void> {
  try {
    await access(scriptPath);
  } catch {
    throw new Error(`LIFECYCLE_HOOK_MISSING: ${scriptPath}`);
  }
}

function nodeArgsForScript(scriptPath: string): string[] {
  const ext = path.extname(scriptPath).toLowerCase();
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
    // Node 20+ can load TS via the project's tsx register when present.
    return ['--import', 'tsx', scriptPath];
  }
  return [scriptPath];
}

/** Default: spawn `node` (with tsx import for TypeScript). */
export function defaultRunLifecycleScript(scriptPath: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgsForScript(scriptPath), {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', (err) => {
      reject(new Error(`LIFECYCLE_HOOK_SPAWN: ${scriptPath}: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`LIFECYCLE_HOOK_FAILED: ${scriptPath} exited ${code ?? 'null'}`));
    });
  });
}

/**
 * Execute lifecycle scripts for a phase in declaration order.
 * No-op when the phase has no scripts configured.
 */
export async function runLifecycleHooks(
  phase: LifecyclePhase,
  hooks: HooksWithLifecycle | undefined,
  opts: RunLifecycleHooksOptions,
): Promise<string[]> {
  const scripts = scriptsForPhase(hooks, phase);
  if (scripts.length === 0) return [];

  const run = opts.runScript ?? defaultRunLifecycleScript;
  const ran: string[] = [];

  for (const entry of scripts) {
    const absolute = path.isAbsolute(entry) ? entry : path.resolve(opts.cwd, entry);
    await assertReadable(absolute);
    if (opts.dryRun) {
      ran.push(absolute);
      continue;
    }
    await run(absolute, opts.cwd);
    ran.push(absolute);
  }
  return ran;
}

/** Load build config hooks (if any) and run a lifecycle phase. */
export async function runLifecycleHooksFromCwd(
  phase: LifecyclePhase,
  cwd: string = process.cwd(),
  opts: Omit<RunLifecycleHooksOptions, 'cwd'> = {},
): Promise<string[]> {
  const { loadConfig } = await import('./config.js');
  const config = await loadConfig(cwd);
  const hooks = (config?.hooks ?? undefined) as HooksWithLifecycle | undefined;
  return runLifecycleHooks(phase, hooks, { ...opts, cwd });
}
