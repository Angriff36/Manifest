/**
 * Loads application TypeScript/TSX sources into a path→content map.
 * Keys are repo-style forward-slash paths relative to cwd.
 *
 * Performance notes (Capsule-Pro scale ~10k files):
 * - Parallel reads (bounded concurrency)
 * - Generated bulk files are stubbed (path present for import resolution,
 *   content empty so they are never scanned as consumers)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRepoPath } from './import-path-resolver.js';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  'out',
  '.worktrees',
  '.tmp',
  '__tests__',
  'storybook',
  'e2e',
  'playwright-report',
  '.vercel',
  'coverage-e2e',
]);

/** Paths that exist for resolution but are not scanned for invocations. */
const GENERATED_NAME_RE = /\.generated\.(ts|tsx|js|jsx)$/i;

const READ_CONCURRENCY = 64;

export async function loadApplicationSources(
  roots: string[],
  cwd = process.cwd(),
): Promise<Map<string, string>> {
  const pending: Array<{ abs: string; key: string; stub: boolean }> = [];
  for (const root of roots) {
    const abs = path.resolve(cwd, root);
    const keyBase = path.resolve(cwd);
    await collectFiles(abs, keyBase, pending);
  }

  const fileContents = new Map<string, string>();
  for (let i = 0; i < pending.length; i += READ_CONCURRENCY) {
    const batch = pending.slice(i, i + READ_CONCURRENCY);
    await Promise.all(
      batch.map(async item => {
        if (item.stub) {
          fileContents.set(item.key, '');
          return;
        }
        try {
          fileContents.set(item.key, await fs.readFile(item.abs, 'utf8'));
        } catch {
          // skip unreadable
        }
      }),
    );
  }
  return fileContents;
}

/** Test helper: build a map from relative path → content. */
export function fileMapFromRecord(record: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(record)) {
    map.set(normalizeRepoPath(k), v);
  }
  return map;
}

async function collectFiles(
  absDir: string,
  keyBase: string,
  out: Array<{ abs: string; key: string; stub: boolean }>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  const subdirs: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      subdirs.push(abs);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!SOURCE_EXT.has(ext)) continue;
    const key = normalizeRepoPath(path.relative(keyBase, abs));
    if (!key || key.startsWith('..')) continue;
    const stub =
      GENERATED_NAME_RE.test(entry.name) ||
      key.includes('/manifest-client/') ||
      key.includes('manifest-wiring-bindings');
    out.push({ abs, key, stub });
  }
  // Parallelize directory descent one level at a time
  await Promise.all(subdirs.map(d => collectFiles(d, keyBase, out)));
}
