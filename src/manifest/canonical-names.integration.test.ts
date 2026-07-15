import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler.js';
import { compileProjectToIR } from './multi-compiler.js';
import { ConvexProjection } from './projections/convex/generator.js';
import { resolveNamingConfig } from './naming-config.js';
import { resolveProjectionOptions } from './config.js';
import type { ResolverHost } from './module-resolver.js';

const ON = resolveNamingConfig({ normalization: true });

function createMemoryHost(files: Record<string, string>): ResolverHost {
  return {
    async readFile(absPath: string): Promise<string> {
      if (!(absPath in files)) throw new Error(`File not found: ${absPath}`);
      return files[absPath]!;
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

describe('naming normalization disabled (default)', () => {
  it('preserves source spelling in IR', async () => {
    const result = await compileToIR(
      `
      entity event_date {
        property required TITLE: string
      }
      store event_date in durable
      `,
      { useCache: false },
    );
    expect(result.ir).not.toBeNull();
    expect(result.ir!.entities.map((e) => e.name)).toContain('event_date');
    expect(result.ir!.entities[0]!.properties[0]!.name).toBe('TITLE');
  });
});

describe('naming normalization enabled', () => {
  it('fixes entity/field/relationship/FK spellings', async () => {
    const result = await compileToIR(
      `
      entity event_date {
        property required TITLE: string
        belongsTo AUTHOR: Author fields [AUTHOR_ID]
        command Create(title: string) { mutate TITLE = title }
      }
      entity Author { property required name: string }
      store event_date in durable
      store Author in durable
      `,
      { useCache: false, naming: ON },
    );
    expect(result.ir).not.toBeNull();
    const entity = result.ir!.entities.find((e) => e.name === 'EventDate');
    expect(entity).toBeDefined();
    expect(entity!.properties.some((p) => p.name === 'title')).toBe(true);
    const rel = entity!.relationships.find((r) => r.name === 'author');
    expect(rel!.foreignKey?.fields).toEqual(['authorId']);
    expect(entity!.commands).toContain('create');
  });

  it('warn mismatch preserves source spelling', async () => {
    const naming = resolveNamingConfig({
      normalization: true,
      entities: { casing: 'pascal', mismatch: 'warn' },
      fields: { casing: 'camel', mismatch: 'warn' },
    });
    const result = await compileToIR(
      `entity event_date { property required TITLE: string }
       store event_date in durable`,
      { useCache: false, naming },
    );
    expect(result.ir!.entities[0]!.name).toBe('event_date');
    expect(result.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('event_date'))).toBe(
      true,
    );
  });

  it('error mismatch fails closed without rewriting', async () => {
    const naming = resolveNamingConfig({
      normalization: true,
      entities: { casing: 'pascal', mismatch: 'error' },
    });
    const result = await compileToIR(
      `entity event_date { property required title: string }`,
      { useCache: false, naming },
    );
    expect(result.diagnostics.some((d) => d.severity === 'error' && d.message.includes('event_date'))).toBe(
      true,
    );
  });

  it('errors on different-word FK unless aliased', async () => {
    const result = await compileToIR(
      `
      entity Book { belongsTo author: Author fields [writerId] }
      entity Author { property name: string }
      `,
      { useCache: false, naming: ON },
    );
    expect(result.diagnostics.some((d) => d.message.includes('writerId'))).toBe(true);

    const aliased = resolveNamingConfig({
      normalization: true,
      aliases: { writer: 'author' },
    });
    // writerId is still a different field spelling of authorId mechanically? 
    // nameKey(writerId)=writerid, nameKey(authorId)=authorid — alias on relationship
    // name 'author' doesn't make writerId mechanical. Alias should map writer→author
    // for relationship names; for FK field writerId, alias of "writer" prefix...
    // Our isMechanicalIdAlias checks relationship name author → authorId.
    // Aliasing writerId requires aliases that make nameKey match — e.g. if relationship
    // were named writer, alias writer→author renames rel to author then FK becomes authorId.
    const viaRel = await compileToIR(
      `
      entity Book { belongsTo writer: Author fields [writerId] }
      entity Author { property name: string }
      `,
      { useCache: false, naming: aliased },
    );
    const book = viaRel.ir?.entities.find((e) => e.name === 'Book');
    expect(book?.relationships[0]?.name).toBe('author');
    expect(book?.relationships[0]?.foreignKey?.fields).toEqual(['authorId']);
  });
});

describe('naming normalization — multi-file', () => {
  it('detects duplicate entities that only differ by casing when enabled', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `entity EventDate { property required title: string }
        store EventDate in durable`,
      '/project/b.manifest': `entity eventdate { property required title: string }
        store eventdate in durable`,
    });
    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
      useCache: false,
      naming: ON,
    });
    expect(result.ir).toBeNull();
    expect(result.diagnostics.some((d) => d.message.includes('Duplicate entity'))).toBe(true);
  });

  it('does not merge casing variants when normalization is off', async () => {
    const host = createMemoryHost({
      '/project/a.manifest': `entity EventDate { property required title: string }`,
      '/project/b.manifest': `entity eventdate { property required title: string }`,
    });
    const result = await compileProjectToIR({
      entries: ['/project/a.manifest', '/project/b.manifest'],
      host,
      basePath: '/project',
      useCache: false,
    });
    expect(result.ir).not.toBeNull();
    expect(result.ir!.entities.map((e) => e.name).sort()).toEqual(['EventDate', 'eventdate']);
  });

  it('resolves extends across casing when enabled', async () => {
    const host = createMemoryHost({
      '/project/base.manifest': `entity EventDate { property required title: string }`,
      '/project/child.manifest': `
        entity Session extends event_date { property required room: string }
        store Session in durable
      `,
    });
    const result = await compileProjectToIR({
      entries: ['/project/base.manifest', '/project/child.manifest'],
      host,
      basePath: '/project',
      useCache: false,
      naming: ON,
    });
    expect(result.ir).not.toBeNull();
    expect(result.ir!.entities.find((e) => e.name === 'Session')?.parent).toBe('EventDate');
  });
});

describe('naming — Convex projection', () => {
  it('emits canonical relationship id and honors legacy table mapping', async () => {
    const result = await compileToIR(
      `
      entity CateringEvent {
        property required title: string
        belongsTo author: Author fields [author_id]
        command create(title: string) { mutate title = title }
        store in durable
      }
      entity Author {
        property required name: string
        store in durable
      }
      `,
      { useCache: false, naming: ON },
    );
    expect(result.ir).not.toBeNull();

    const opts = resolveProjectionOptions(
      {
        naming: {
          normalization: true,
          projections: {
            convex: {
              tables: { CateringEvent: 'events' },
              fields: { 'CateringEvent.author': 'writerId' },
            },
          },
        },
        projections: { convex: { options: {} } },
      },
      'convex',
    );

    const schema = new ConvexProjection().generate(result.ir!, {
      surface: 'convex.schema',
      options: opts,
    }).artifacts[0]?.code;
    expect(schema).toContain('events:');
    expect(schema).toContain('writerId:');
  });
});
