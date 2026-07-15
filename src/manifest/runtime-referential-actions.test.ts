/**
 * Runtime referential actions (onDelete / onUpdate) — executable evidence for
 * docs/spec/semantics.md § Referential Actions.
 */

import { describe, it, expect } from 'vitest';
import {
  RuntimeEngine,
  ManifestReferentialRestrictError,
  ManifestReferentialSetNullError,
} from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';

async function compile(source: string): Promise<IR> {
  const result = await new IRCompiler().compileToIR(source);
  if (!result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

function engine(ir: IR): RuntimeEngine {
  let n = 0;
  return new RuntimeEngine(ir, {}, { generateId: () => `id-${++n}`, now: () => 1_000_000 });
}

describe('Referential actions (runtime)', () => {
  it('onDelete cascade deletes matching children', async () => {
    const ir = await compile(`
entity Author {
  property required name: string
  hasMany books: Book
  command create(name: string) {
    create { name: name }
  }
}
entity Book {
  property required title: string
  belongsTo author: Author with authorId onDelete cascade
  command create(title: string, authorId: string) {
    create { title: title, authorId: authorId }
  }
}
store Author in memory
store Book in memory
`);
    const rt = engine(ir);
    const author = await rt.createInstance('Author', { name: 'Ada' });
    await rt.createInstance('Book', { title: 'A', authorId: author!.id });
    await rt.createInstance('Book', { title: 'B', authorId: author!.id });
    const other = await rt.createInstance('Author', { name: 'Other' });
    await rt.createInstance('Book', { title: 'C', authorId: other!.id });

    expect(await rt.deleteInstance('Author', author!.id)).toBe(true);
    expect(await rt.getInstance('Author', author!.id)).toBeUndefined();
    const books = await rt.getAllInstances('Book');
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('C');
  });

  it('onDelete restrict throws and leaves parent+children intact', async () => {
    const ir = await compile(`
entity Parent {
  property required name: string
  hasMany children: Child
  command create(name: string) {
    create { name: name }
  }
}
entity Child {
  property required name: string
  belongsTo parent: Parent with parentId onDelete restrict
  command create(name: string, parentId: string) {
    create { name: name, parentId: parentId }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { name: 'P' });
    await rt.createInstance('Child', { name: 'C', parentId: parent!.id });

    await expect(rt.deleteInstance('Parent', parent!.id)).rejects.toBeInstanceOf(
      ManifestReferentialRestrictError,
    );
    expect(await rt.getInstance('Parent', parent!.id)).toBeDefined();
    expect(await rt.getAllInstances('Child')).toHaveLength(1);
  });

  it('onDelete setNull clears nullable FK columns', async () => {
    const ir = await compile(`
entity Parent {
  property required name: string
  hasMany children: Child
  command create(name: string) {
    create { name: name }
  }
}
entity Child {
  property required name: string
  property parentId: string?
  belongsTo parent: Parent with parentId onDelete setNull
  command create(name: string, parentId: string) {
    create { name: name, parentId: parentId }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { name: 'P' });
    const child = await rt.createInstance('Child', { name: 'C', parentId: parent!.id });

    expect(await rt.deleteInstance('Parent', parent!.id)).toBe(true);
    const after = await rt.getInstance('Child', child!.id);
    expect(after?.parentId).toBeNull();
  });

  it('onDelete setNull on non-nullable FK throws', async () => {
    const ir = await compile(`
entity Parent {
  property required name: string
  hasMany children: Child
  command create(name: string) {
    create { name: name }
  }
}
entity Child {
  property required name: string
  property required parentId: string
  belongsTo parent: Parent with parentId onDelete setNull
  command create(name: string, parentId: string) {
    create { name: name, parentId: parentId }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { name: 'P' });
    await rt.createInstance('Child', { name: 'C', parentId: parent!.id });

    await expect(rt.deleteInstance('Parent', parent!.id)).rejects.toBeInstanceOf(
      ManifestReferentialSetNullError,
    );
    expect(await rt.getInstance('Parent', parent!.id)).toBeDefined();
  });

  it('onDelete setDefault restores property default', async () => {
    const ir = await compile(`
entity Parent {
  property required name: string
  hasMany children: Child
  command create(name: string) {
    create { name: name }
  }
}
entity Child {
  property required name: string
  property parentId: string? = "none"
  belongsTo parent: Parent with parentId onDelete setDefault
  command create(name: string, parentId: string) {
    create { name: name, parentId: parentId }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { name: 'P' });
    const child = await rt.createInstance('Child', { name: 'C', parentId: parent!.id });

    expect(await rt.deleteInstance('Parent', parent!.id)).toBe(true);
    const after = await rt.getInstance('Child', child!.id);
    expect(after?.parentId).toBe('none');
  });

  it('absent onDelete leaves orphan children', async () => {
    const ir = await compile(`
entity Parent {
  property required name: string
  hasMany children: Child
  command create(name: string) {
    create { name: name }
  }
}
entity Child {
  property required name: string
  belongsTo parent: Parent with parentId
  command create(name: string, parentId: string) {
    create { name: name, parentId: parentId }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { name: 'P' });
    await rt.createInstance('Child', { name: 'C', parentId: parent!.id });

    expect(await rt.deleteInstance('Parent', parent!.id)).toBe(true);
    expect(await rt.getAllInstances('Child')).toHaveLength(1);
  });

  it('cascade is recursive through grandchild chains', async () => {
    const ir = await compile(`
entity A {
  property required name: string
  hasMany bees: B
  command create(name: string) {
    create { name: name }
  }
}
entity B {
  property required name: string
  belongsTo a: A with aId onDelete cascade
  hasMany cees: C
  command create(name: string, aId: string) {
    create { name: name, aId: aId }
  }
}
entity C {
  property required name: string
  belongsTo b: B with bId onDelete cascade
  command create(name: string, bId: string) {
    create { name: name, bId: bId }
  }
}
store A in memory
store B in memory
store C in memory
`);
    const rt = engine(ir);
    const a = await rt.createInstance('A', { name: 'a' });
    const b = await rt.createInstance('B', { name: 'b', aId: a!.id });
    await rt.createInstance('C', { name: 'c', bId: b!.id });

    expect(await rt.deleteInstance('A', a!.id)).toBe(true);
    expect(await rt.getAllInstances('B')).toHaveLength(0);
    expect(await rt.getAllInstances('C')).toHaveLength(0);
  });

  it('onUpdate cascade rewrites child FK when referenced parent column changes', async () => {
    const ir = await compile(`
entity Parent {
  property required code: string
  property required name: string
  hasMany children: Child
  command create(code: string, name: string) {
    create { code: code, name: name }
  }
}
entity Child {
  property required name: string
  property parentCode: string
  belongsTo parent: Parent fields [parentCode] references [code] onUpdate cascade
  command create(name: string, parentCode: string) {
    create { name: name, parentCode: parentCode }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { code: 'P1', name: 'P' });
    const child = await rt.createInstance('Child', { name: 'C', parentCode: 'P1' });

    await rt.updateInstance('Parent', parent!.id, { code: 'P2' });

    const afterChild = await rt.getInstance('Child', child!.id);
    expect(afterChild?.parentCode).toBe('P2');
  });

  it('onUpdate restrict blocks referenced-column change when children exist', async () => {
    const ir = await compile(`
entity Parent {
  property required code: string
  property required name: string
  hasMany children: Child
  command create(code: string, name: string) {
    create { code: code, name: name }
  }
}
entity Child {
  property required name: string
  property parentCode: string
  belongsTo parent: Parent fields [parentCode] references [code] onUpdate restrict
  command create(name: string, parentCode: string) {
    create { name: name, parentCode: parentCode }
  }
}
store Parent in memory
store Child in memory
`);
    const rt = engine(ir);
    const parent = await rt.createInstance('Parent', { code: 'P1', name: 'P' });
    await rt.createInstance('Child', { name: 'C', parentCode: 'P1' });

    await expect(rt.updateInstance('Parent', parent!.id, { code: 'P2' })).rejects.toBeInstanceOf(
      ManifestReferentialRestrictError,
    );
    const still = await rt.getInstance('Parent', parent!.id);
    expect(still?.code).toBe('P1');
  });
});
