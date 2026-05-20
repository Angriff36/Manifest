import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { emitRegistriesCommand, __internal } from './emit-registries';

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('manifest emit registries', () => {
  it('writes commands.json and entities.json from a source file', async () => {
    const dir = await tempDir('manifest-emit-registries-');
    const srcPath = path.join(dir, 'sample.manifest');
    const outDir = path.join(dir, 'out');
    await fs.writeFile(
      srcPath,
      `
      entity Recipe {
        property tenantId: string
        property title: string
        command create() { emit RecipeCreated }
      }
      event RecipeCreated: "recipe.created" { recipeId: string }
      `,
      'utf-8'
    );

    await emitRegistriesCommand({ source: srcPath, out: outDir });

    const commands = JSON.parse(await fs.readFile(path.join(outDir, 'commands.json'), 'utf-8'));
    const entities = JSON.parse(await fs.readFile(path.join(outDir, 'entities.json'), 'utf-8'));

    expect(commands.commands).toHaveLength(1);
    expect(commands.commands[0].commandId).toBe('Recipe.create');
    expect(entities.entities[0].name).toBe('Recipe');
    expect(entities.entities[0].classification).toBe('governed');
  });

  it('also accepts a precompiled IR JSON file via --ir', async () => {
    const dir = await tempDir('manifest-emit-registries-ir-');
    const irPath = path.join(dir, 'sample.ir.json');
    const outDir = path.join(dir, 'out');

    // Hand-built minimal IR
    const ir = {
      version: '1.0',
      provenance: {
        contentHash: 'test',
        compilerVersion: '0.0.0',
        schemaVersion: '1.0',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [
        {
          name: 'Foo',
          properties: [{ name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: [] }],
          computedProperties: [],
          relationships: [],
          commands: ['bar'],
          constraints: [],
          policies: [],
        },
      ],
      stores: [],
      events: [],
      commands: [
        { name: 'bar', entity: 'Foo', parameters: [], guards: [], actions: [], emits: [] },
      ],
      policies: [],
    };
    await fs.writeFile(irPath, JSON.stringify(ir), 'utf-8');

    await emitRegistriesCommand({ ir: irPath, out: outDir });
    const commands = JSON.parse(await fs.readFile(path.join(outDir, 'commands.json'), 'utf-8'));
    expect(commands.commands[0].commandId).toBe('Foo.bar');
  });

  it('throws if neither --ir nor --source is provided', async () => {
    await expect(emitRegistriesCommand({})).rejects.toThrow(/--ir.*--source/);
  });

  it('locateSchemas finds and parses the shipped schemas', async () => {
    const { commands, entities } = await __internal.locateSchemas();
    expect((commands as { title: string }).title).toBe('Manifest Command Registry');
    expect((entities as { title: string }).title).toBe('Manifest Governed Entity Registry');
  });

  it('rejects invalid output during validation (bad classification enum)', async () => {
    const dir = await tempDir('manifest-emit-registries-bad-');
    const irPath = path.join(dir, 'sample.ir.json');
    const outDir = path.join(dir, 'out');

    // Hand-built IR. We will write the *registry* file the emitter would
    // produce, then re-validate it via a fresh Ajv instance to confirm the
    // shipped schema actually rejects the bad classification value.
    const Ajv = (await import('ajv')).default;
    const schemas = await __internal.locateSchemas();
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validateEntities = ajv.compile(schemas.entities);

    const bogus = {
      irHash: 'x',
      compilerVersion: 'y',
      entities: [
        {
          name: 'Foo',
          classification: 'not_a_real_classification',
          tenantScoped: false,
          commands: [],
          properties: [],
        },
      ],
    };
    expect(validateEntities(bogus)).toBe(false);

    // Sanity: the emitter never produces this, but if we ever changed
    // EntityClassification without bumping the schema, the file generated
    // through emitRegistriesCommand would fail validation here.
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(irPath, JSON.stringify({}), 'utf-8');
    // Empty IR is fine for the emitter; it just produces empty arrays.
    await fs.writeFile(
      irPath,
      JSON.stringify({
        version: '1.0',
        provenance: { contentHash: 'h', compilerVersion: 'v', schemaVersion: '1.0', compiledAt: '' },
        modules: [],
        entities: [],
        stores: [],
        events: [],
        commands: [],
        policies: [],
      }),
      'utf-8'
    );
    await expect(
      emitRegistriesCommand({ ir: irPath, out: outDir })
    ).resolves.toBeUndefined();
  });
});
