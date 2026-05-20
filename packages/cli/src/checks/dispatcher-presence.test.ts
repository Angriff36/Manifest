import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { checkDispatcherPresence } from './dispatcher-presence';

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'manifest-dispatcher-presence-'));
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

describe('checkDispatcherPresence', () => {
  it('detects the canonical dispatcher under app/api/manifest/...', async () => {
    const dir = await tempDir();
    try {
      const target = path.join(dir, 'app', 'api', 'manifest', '[entity]', 'commands', '[command]');
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, 'route.ts'), 'export const POST = () => {};');

      const result = await checkDispatcherPresence(dir);
      expect(result.found).toBe(true);
      expect(result.path).toBe('app/api/manifest/[entity]/commands/[command]/route.ts');
    } finally {
      await rmrf(dir);
    }
  });

  it('detects the dispatcher under src/app/api/manifest/... (Next.js src/ layout)', async () => {
    const dir = await tempDir();
    try {
      const target = path.join(dir, 'src', 'app', 'api', 'manifest', '[entity]', 'commands', '[command]');
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, 'route.ts'), '');

      const result = await checkDispatcherPresence(dir);
      expect(result.found).toBe(true);
      expect(result.path).toBe('src/app/api/manifest/[entity]/commands/[command]/route.ts');
    } finally {
      await rmrf(dir);
    }
  });

  it('returns found=false and lists candidates when no dispatcher is present', async () => {
    const dir = await tempDir();
    try {
      const result = await checkDispatcherPresence(dir);
      expect(result.found).toBe(false);
      expect(result.candidatesSearched.length).toBeGreaterThan(0);
      // Candidate paths are repo-relative, not absolute.
      for (const c of result.candidatesSearched) {
        expect(path.isAbsolute(c)).toBe(false);
      }
    } finally {
      await rmrf(dir);
    }
  });
});
