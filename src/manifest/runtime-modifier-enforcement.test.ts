import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';
import { RuntimeEngine } from './runtime-engine';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

function engine(ir: IR): RuntimeEngine {
  let counter = 0;
  return new RuntimeEngine(ir, {}, {
    generateId: () => `id-${++counter}`,
    now: () => 1000,
  });
}

// ── Item 1: command parameter validation (required + defaultValue) ──
describe('command parameter enforcement', () => {
  const source = `
    entity Doc {
      property id: string
      property title: string
      property tag: string

      command create(title: string, tag: string = "draft") {
        mutate title = title
        mutate tag = tag
      }
    }
  `;

  it('rejects a call missing a required parameter with a structured failure', async () => {
    const rt = engine(await compile(source));
    const result = await rt.runCommand('create', {}, { entityName: 'Doc' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('MISSING_REQUIRED_PARAMETER');
    expect(result.parameterFailure?.parameter).toBe('title');
  });

  it('applies a parameter defaultValue when the argument is omitted', async () => {
    const rt = engine(await compile(source));
    const result = await rt.runCommand('create', { title: 'Hello' }, { entityName: 'Doc' });
    expect(result.success).toBe(true);
    const stored = await rt.getInstance('Doc', result.instance!.id);
    expect(stored?.tag).toBe('draft');
    expect(stored?.title).toBe('Hello');
  });

  it('uses the supplied argument over the default', async () => {
    const rt = engine(await compile(source));
    const result = await rt.runCommand('create', { title: 'Hello', tag: 'final' }, { entityName: 'Doc' });
    expect(result.success).toBe(true);
    const stored = await rt.getInstance('Doc', result.instance!.id);
    expect(stored?.tag).toBe('final');
  });

  it('allows an omitted optional parameter with no default', async () => {
    const rt = engine(await compile(`
      entity Doc {
        property id: string
        property title: string
        command touch(optional note: string) {
          mutate title = "x"
        }
      }
    `));
    const result = await rt.runCommand('touch', {}, { entityName: 'Doc' });
    expect(result.success).toBe(true);
  });
});

// ── Item 2a: required property modifier on create ──
describe('required property modifier on create', () => {
  it('blocks createInstance when a required property is absent with no default', async () => {
    const rt = engine(await compile(`
      entity Person {
        property id: string
        property required name: string
      }
    `));
    const created = await rt.createInstance('Person', { id: 'p1' });
    expect(created).toBeUndefined();
    expect(await rt.getAllInstances('Person')).toEqual([]);
  });

  it('allows createInstance when the required property is provided', async () => {
    const rt = engine(await compile(`
      entity Person {
        property id: string
        property required name: string
      }
    `));
    const created = await rt.createInstance('Person', { id: 'p1', name: 'Ada' });
    expect(created).toMatchObject({ id: 'p1', name: 'Ada' });
  });

  it('treats a required property written by the create command actions as satisfied', async () => {
    const rt = engine(await compile(`
      entity Person {
        property id: string
        property required name: string
        command create(name: string) {
          mutate name = name
        }
      }
    `));
    const result = await rt.runCommand('create', { name: 'Grace' }, { entityName: 'Person' });
    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({ name: 'Grace' });
  });

  it('blocks the create command when a required property is neither input nor produced', async () => {
    const rt = engine(await compile(`
      entity Person {
        property id: string
        property required name: string
        property note: string
        command create(note: string) {
          mutate note = note
        }
      }
    `));
    const result = await rt.runCommand('create', { note: 'hi' }, { entityName: 'Person' });
    expect(result.success).toBe(false);
    expect(result.constraintOutcomes?.some(o => o.code === 'E_REQUIRED')).toBe(true);
  });
});

// ── Item 2b: readonly property modifier on update ──
describe('readonly property modifier on update', () => {
  const source = `
    entity Account {
      property id: string
      property readonly ssn: string
      property nickname: string
    }
  `;

  it('blocks an update that changes a readonly property', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('Account', { id: 'a1', ssn: '111', nickname: 'x' });
    const updated = await rt.updateInstance('Account', 'a1', { ssn: '222' });
    expect(updated).toBeUndefined();
    const stored = await rt.getInstance('Account', 'a1');
    expect(stored?.ssn).toBe('111');
  });

  it('allows an update that leaves the readonly property unchanged', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('Account', { id: 'a1', ssn: '111', nickname: 'x' });
    const updated = await rt.updateInstance('Account', 'a1', { ssn: '111', nickname: 'y' });
    expect(updated).toMatchObject({ nickname: 'y' });
  });

  it('allows setting the readonly property while the creating command runs', async () => {
    const rt = engine(await compile(`
      entity Account {
        property id: string
        property readonly ssn: string
        command create(ssn: string) {
          mutate ssn = ssn
        }
      }
    `));
    const result = await rt.runCommand('create', { ssn: '999' }, { entityName: 'Account' });
    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({ ssn: '999' });
  });
});

// ── Item 3: unique property modifier on create/update ──
describe('unique property modifier', () => {
  const source = `
    entity User {
      property id: string
      property unique email: string
      property name: string
    }
  `;

  it('blocks a create whose unique value already exists', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('User', { id: 'u1', email: 'a@x.com', name: 'A' });
    const dup = await rt.createInstance('User', { id: 'u2', email: 'a@x.com', name: 'B' });
    expect(dup).toBeUndefined();
    expect((await rt.getAllInstances('User')).length).toBe(1);
  });

  it('allows distinct unique values', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('User', { id: 'u1', email: 'a@x.com', name: 'A' });
    const ok = await rt.createInstance('User', { id: 'u2', email: 'b@x.com', name: 'B' });
    expect(ok).toMatchObject({ email: 'b@x.com' });
  });

  it('blocks an update that collides with another instance', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('User', { id: 'u1', email: 'a@x.com', name: 'A' });
    await rt.createInstance('User', { id: 'u2', email: 'b@x.com', name: 'B' });
    const updated = await rt.updateInstance('User', 'u2', { email: 'a@x.com' });
    expect(updated).toBeUndefined();
    expect((await rt.getInstance('User', 'u2'))?.email).toBe('b@x.com');
  });

  it('allows an update that keeps its own unique value', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('User', { id: 'u1', email: 'a@x.com', name: 'A' });
    const updated = await rt.updateInstance('User', 'u1', { email: 'a@x.com', name: 'Z' });
    expect(updated).toMatchObject({ name: 'Z' });
  });
});

// ── Item 4: plain private property read filtering ──
describe('plain private property read filtering', () => {
  const source = `
    entity Secret {
      property id: string
      property private token: string
      property label: string
    }
  `;

  it('strips a plain private property from getInstance', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('Secret', { id: 's1', token: 'sk-123', label: 'k' });
    const read = await rt.getInstance('Secret', 's1');
    expect(read).toBeDefined();
    expect('token' in read!).toBe(false);
    expect(read!.label).toBe('k');
  });

  it('strips a plain private property from getAllInstances', async () => {
    const rt = engine(await compile(source));
    await rt.createInstance('Secret', { id: 's1', token: 'sk-123', label: 'k' });
    const all = await rt.getAllInstances('Secret');
    expect(all.length).toBe(1);
    expect('token' in all[0]).toBe(false);
  });

  it('still evaluates guards against the real private value (execution sees plaintext)', async () => {
    const rt = engine(await compile(`
      entity Secret {
        property id: string
        property private token: string
        property label: string
        command reveal() {
          guard self.token == "sk-123"
          mutate label = "ok"
        }
      }
    `));
    await rt.createInstance('Secret', { id: 's1', token: 'sk-123', label: '' });
    const result = await rt.runCommand('reveal', {}, { entityName: 'Secret', instanceId: 's1' });
    expect(result.success).toBe(true);
    expect((await rt.getInstance('Secret', 's1'))?.label).toBe('ok');
  });
});
