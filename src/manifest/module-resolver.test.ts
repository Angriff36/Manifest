import { describe, it, expect } from 'vitest';
import { resolveModuleGraph, ResolverHost } from './module-resolver';
import { Parser } from './parser';

/**
 * In-memory ResolverHost for testing (no real filesystem).
 */
function createMemoryHost(files: Record<string, string>): ResolverHost {
  return {
    async readFile(absPath: string): Promise<string> {
      if (!(absPath in files)) throw new Error(`File not found: ${absPath}`);
      return files[absPath];
    },
    resolvePath(fromDir: string, relativePath: string): string {
      // Simple path resolution for testing: normalize /a/b/../c → /a/c
      const parts = fromDir.replace(/\\/g, '/').split('/');
      for (const seg of relativePath.replace(/\\/g, '/').split('/')) {
        if (seg === '..') parts.pop();
        else if (seg !== '.') parts.push(seg);
      }
      return parts.join('/');
    },
    async fileExists(absPath: string): Promise<boolean> {
      return absPath in files;
    },
  };
}

function parseFn(source: string) {
  return new Parser().parse(source);
}

describe('Module Resolver', () => {
  it('resolves a single file with no dependencies', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': 'entity User { property name: string }',
    });

    const result = await resolveModuleGraph(['/project/main.manifest'], host, parseFn);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(1);
    expect(result.order[0].absPath).toBe('/project/main.manifest');
    expect(result.files.size).toBe(1);
  });

  it('resolves two files with a dependency', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': `
        use "./types.manifest"
        entity Order { property userId: string }
      `,
      '/project/types.manifest': 'entity User { property name: string }',
    });

    const result = await resolveModuleGraph(['/project/main.manifest'], host, parseFn);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(2);
    // types.manifest should come first (dependency before dependent)
    expect(result.order[0].absPath).toBe('/project/types.manifest');
    expect(result.order[1].absPath).toBe('/project/main.manifest');
  });

  it('resolves a diamond dependency', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': `
        use "./a.manifest"
        use "./b.manifest"
        entity Main { property id: string }
      `,
      '/project/a.manifest': `
        use "./shared.manifest"
        entity A { property id: string }
      `,
      '/project/b.manifest': `
        use "./shared.manifest"
        entity B { property id: string }
      `,
      '/project/shared.manifest': 'entity Shared { property id: string }',
    });

    const result = await resolveModuleGraph(['/project/main.manifest'], host, parseFn);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(4);
    // shared.manifest must be first (depended on by both a and b)
    expect(result.order[0].absPath).toBe('/project/shared.manifest');
    // main.manifest must be last (depends on a and b)
    expect(result.order[3].absPath).toBe('/project/main.manifest');
    // Each file parsed exactly once
    expect(result.files.size).toBe(4);
  });

  it('detects circular dependencies', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        use "./b.manifest"
        entity A { property id: string }
      `,
      '/project/b.manifest': `
        use "./a.manifest"
        entity B { property id: string }
      `,
    });

    const result = await resolveModuleGraph(['/project/a.manifest'], host, parseFn);

    expect(
      result.diagnostics.some(
        (d) => d.severity === 'error' && d.message.includes('Circular dependency'),
      ),
    ).toBe(true);
    expect(result.order).toHaveLength(0);
  });

  it('reports missing file', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': `
        use "./missing.manifest"
        entity Main { property id: string }
      `,
    });

    const result = await resolveModuleGraph(['/project/main.manifest'], host, parseFn);

    expect(
      result.diagnostics.some(
        (d) => d.severity === 'error' && d.message.includes('File not found'),
      ),
    ).toBe(true);
    expect(result.order).toHaveLength(0);
  });

  it('warns on duplicate use declarations', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': `
        use "./types.manifest"
        use "./types.manifest"
        entity Main { property id: string }
      `,
      '/project/types.manifest': 'entity Type { property id: string }',
    });

    const result = await resolveModuleGraph(['/project/main.manifest'], host, parseFn);

    expect(
      result.diagnostics.some(
        (d) => d.severity === 'warning' && d.message.includes('Duplicate use'),
      ),
    ).toBe(true);
    // Should still resolve successfully (warning, not error)
    expect(result.order).toHaveLength(2);
  });

  it('produces deterministic ordering (sorted paths for tie-break)', async () => {
    const host = createMemoryHost({
      '/project/z.manifest': 'entity Z { property id: string }',
      '/project/a.manifest': 'entity A { property id: string }',
      '/project/m.manifest': 'entity M { property id: string }',
    });

    const result = await resolveModuleGraph(
      ['/project/z.manifest', '/project/a.manifest', '/project/m.manifest'],
      host,
      parseFn,
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(3);
    // Alphabetical order since no dependencies
    expect(result.order[0].absPath).toBe('/project/a.manifest');
    expect(result.order[1].absPath).toBe('/project/m.manifest');
    expect(result.order[2].absPath).toBe('/project/z.manifest');
  });

  it('handles transitive dependencies', async () => {
    const host = createMemoryHost({
      '/project/c.manifest': `
        use "./b.manifest"
        entity C { property id: string }
      `,
      '/project/b.manifest': `
        use "./a.manifest"
        entity B { property id: string }
      `,
      '/project/a.manifest': 'entity A { property id: string }',
    });

    const result = await resolveModuleGraph(['/project/c.manifest'], host, parseFn);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(3);
    expect(result.order[0].absPath).toBe('/project/a.manifest');
    expect(result.order[1].absPath).toBe('/project/b.manifest');
    expect(result.order[2].absPath).toBe('/project/c.manifest');
  });

  it('resolves relative paths with ../', async () => {
    const host = createMemoryHost({
      '/project/src/main.manifest': `
        use "../shared/types.manifest"
        entity Main { property id: string }
      `,
      '/project/shared/types.manifest': 'entity SharedType { property id: string }',
    });

    const result = await resolveModuleGraph(['/project/src/main.manifest'], host, parseFn);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(2);
    expect(result.order[0].absPath).toBe('/project/shared/types.manifest');
    expect(result.order[1].absPath).toBe('/project/src/main.manifest');
  });

  it('handles multiple entry points', async () => {
    const host = createMemoryHost({
      '/project/app1.manifest': `
        use "./shared.manifest"
        entity App1 { property id: string }
      `,
      '/project/app2.manifest': `
        use "./shared.manifest"
        entity App2 { property id: string }
      `,
      '/project/shared.manifest': 'entity Shared { property id: string }',
    });

    const result = await resolveModuleGraph(
      ['/project/app1.manifest', '/project/app2.manifest'],
      host,
      parseFn,
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.order).toHaveLength(3);
    // Shared must come before both entries
    expect(result.order[0].absPath).toBe('/project/shared.manifest');
  });

  it('reports parse errors from dependent files', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': `
        use "./broken.manifest"
        entity Main { property id: string }
      `,
      '/project/broken.manifest': 'entity { }', // missing name
    });

    const result = await resolveModuleGraph(['/project/main.manifest'], host, parseFn);

    // Should have diagnostics from the broken file
    expect(result.diagnostics.some((d) => d.file === '/project/broken.manifest')).toBe(true);
  });
});
