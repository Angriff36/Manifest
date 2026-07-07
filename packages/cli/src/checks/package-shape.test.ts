import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { getPackageShapeSubpaths } from './package-shape';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');

async function loadExpectedPublicSubpaths(): Promise<string[]> {
  const raw = await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw) as { name: string; exports: Record<string, unknown> };
  return Object.keys(pkg.exports)
    .filter(key => key !== './package.json')
    .map(key => (key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`))
    .sort();
}

describe('getPackageShapeSubpaths', () => {
  it('covers every public export declared in package.json', async () => {
    const expected = await loadExpectedPublicSubpaths();
    const actual = (await getPackageShapeSubpaths(repoRoot)).map(entry => entry.subpath);
    expect(actual).toEqual(expected);
  });

  it('treats agent-sdk as a verified public operational surface', async () => {
    const subpaths = await getPackageShapeSubpaths(repoRoot);
    expect(subpaths).toContainEqual(
      expect.objectContaining({
        subpath: '@angriff36/manifest/agent-sdk',
        expectedExports: expect.arrayContaining(['AgentRuntime', 'toOpenAITools', 'findMatchingCommands']),
      })
    );
  });
});
