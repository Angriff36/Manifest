import { describe, it, expect } from 'vitest';
import { compileProjectToIR } from './multi-compiler';
import { ResolverHost } from './module-resolver';

/**
 * In-memory ResolverHost for testing.
 */
function createMemoryHost(files: Record<string, string>): ResolverHost {
  return {
    async readFile(absPath: string): Promise<string> {
      if (!(absPath in files)) throw new Error(`File not found: ${absPath}`);
      return files[absPath];
    },
    resolvePath(fromDir: string, relativePath: string): string {
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

describe('Multi-Compiler', () => {
  it('compiles a single file project', async () => {
    const host = createMemoryHost({
      '/project/main.manifest': `
        entity User {
          property name: string
          property email: string
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/main.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.ir!.entities).toHaveLength(1);
    expect(result.ir!.entities[0].name).toBe('User');
  });

  it('merges entities from multiple files', async () => {
    const host = createMemoryHost({
      '/project/users.manifest': `
        entity User {
          property name: string
        }
      `,
      '/project/orders.manifest': `
        use "./users.manifest"
        entity Order {
          property total: number
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/orders.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.ir!.entities).toHaveLength(2);
    // Sorted alphabetically
    expect(result.ir!.entities[0].name).toBe('Order');
    expect(result.ir!.entities[1].name).toBe('User');
  });

  it('detects duplicate entity names across files', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        entity User {
          property name: string
        }
      `,
      '/project/b.manifest': `
        entity User {
          property email: string
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).toBeNull();
    expect(result.diagnostics.some(d => d.severity === 'error' && d.message.includes('Duplicate entity'))).toBe(true);
  });

  it('validates relationship targets across files', async () => {
    const host = createMemoryHost({
      '/project/users.manifest': `
        entity User {
          property name: string
        }
      `,
      '/project/orders.manifest': `
        use "./users.manifest"
        entity Order {
          property total: number
          belongsTo customer: User
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/orders.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    // No errors — User is defined in users.manifest
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('reports unknown relationship targets', async () => {
    const host = createMemoryHost({
      '/project/orders.manifest': `
        entity Order {
          property total: number
          belongsTo customer: NonExistent
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/orders.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).toBeNull();
    expect(result.diagnostics.some(d =>
      d.severity === 'error' && d.message.includes('unknown entity') && d.message.includes('NonExistent')
    )).toBe(true);
  });

  it('merges modules with same name', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        module Commerce {
          entity Product {
            property name: string
          }
        }
      `,
      '/project/b.manifest': `
        module Commerce {
          entity Category {
            property title: string
          }
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.ir!.modules).toHaveLength(1);
    expect(result.ir!.modules[0].name).toBe('Commerce');
    expect(result.ir!.modules[0].entities.sort()).toEqual(['Category', 'Product']);
  });

  it('prevents duplicate tenant declarations', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        tenant orgId: string from context.orgId
        entity A { property id: string }
      `,
      '/project/b.manifest': `
        tenant teamId: string from context.teamId
        entity B { property id: string }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).toBeNull();
    expect(result.diagnostics.some(d => d.severity === 'error' && d.message.includes('Duplicate tenant'))).toBe(true);
  });

  it('includes provenance with sources for multi-file', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': 'entity A { property id: string }',
      '/project/b.manifest': `
        use "./a.manifest"
        entity B { property id: string }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.ir!.provenance.sources).toBeDefined();
    expect(result.ir!.provenance.sources).toHaveLength(2);
    // Sources should be sorted by path
    const paths = result.ir!.provenance.sources!.map(s => s.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('tracks source files in result', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': 'entity A { property id: string }',
      '/project/b.manifest': 'entity B { property id: string }',
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.sources).toHaveLength(2);
    expect(result.sources.every(s => s.contentHash.length > 0)).toBe(true);
  });

  it('merges commands sorted by entity.name', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        entity User {
          property name: string
          command UpdateName(newName: string) {
            mutate name = newName
          }
        }
      `,
      '/project/b.manifest': `
        entity Account {
          property balance: number
          command Deposit(amount: number) {
            mutate balance = self.balance + amount
          }
        }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.ir!.commands).toHaveLength(2);
    // Account.Deposit comes before User.UpdateName alphabetically
    expect(result.ir!.commands[0].name).toBe('Deposit');
    expect(result.ir!.commands[1].name).toBe('UpdateName');
  });

  it('handles circular dependency gracefully', async () => {
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

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).toBeNull();
    expect(result.diagnostics.some(d => d.severity === 'error' && d.message.includes('Circular'))).toBe(true);
  });

  it('produces IR with irHash', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': 'entity A { property id: string }',
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.ir!.provenance.irHash).toBeDefined();
    expect(result.ir!.provenance.irHash!.length).toBeGreaterThan(0);
  });

  it('detects duplicate enum names across files', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        enum Status { Active, Inactive }
      `,
      '/project/b.manifest': `
        enum Status { Pending, Completed }
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).toBeNull();
    expect(result.diagnostics.some(d => d.severity === 'error' && d.message.includes('Duplicate enum'))).toBe(true);
  });

  it('merges stores from multiple files', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        entity User {
          property name: string
        }
        store User in memory
      `,
      '/project/b.manifest': `
        entity Product {
          property title: string
        }
        store Product in postgres
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.ir!.stores).toHaveLength(2);
  });

  it('merges policies from multiple files', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `
        entity User {
          property name: string
        }
        policy adminOnly execute: user.role == "admin"
      `,
      '/project/b.manifest': `
        entity Product {
          property title: string
        }
        policy readAll read: true
      `,
    });

    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
    });

    expect(result.ir).not.toBeNull();
    expect(result.ir!.policies).toHaveLength(2);
  });
});
