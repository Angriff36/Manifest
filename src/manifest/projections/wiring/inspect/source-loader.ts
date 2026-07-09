/**
 * Loads application TypeScript/TSX sources into a path→content map.
 * Keys are repo-style forward-slash paths relative to cwd.
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
]);

export async function loadApplicationSources(
  roots: string[],
  cwd = process.cwd(),
): Promise<Map<string, string>> {
  const fileContents = new Map<string, string>();
  for (const root of roots) {
    const abs = path.resolve(cwd, root);
    const keyBase = path.resolve(cwd);
    await walk(abs, keyBase, fileContents);
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

async function walk(
  absDir: string,
  keyBase: string,
  out: Map<string, string>,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, keyBase, out);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!SOURCE_EXT.has(ext)) continue;
    const key = normalizeRepoPath(path.relative(keyBase, abs));
    if (!key || key.startsWith('..')) continue;
    try {
      out.set(key, await fs.readFile(abs, 'utf8'));
    } catch {
      // skip unreadable
    }
  }
}
