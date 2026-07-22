/**
 * manifest emit registries
 *
 * Emits machine-readable command and governed-entity registries from
 * compiled IR. Validates the output against the schemas in
 * docs/spec/registry/{commands,entities}.schema.json.
 *
 * The registries are Manifest's inventory surface for downstream
 * governance integrations and CI gates. Authoritative shape lives in
 * `docs/spec/registry/`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import Ajv, { type ErrorObject } from 'ajv';

interface EmitOptions {
  ir?: string;
  source?: string;
  out?: string;
  validate?: boolean;
  pretty?: boolean;
  dryRun?: boolean;
}

/**
 * Locate the docs/spec/registry/ directory. The schemas are shipped with
 * the package (see package.json#files). Walk up from this module until we
 * find them — works in both dev (running from src/) and prod (from dist/).
 */
async function locateSchemas(): Promise<{ commands: object; entities: object }> {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (let prev = ''; dir !== prev; prev = dir, dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'docs', 'spec', 'registry', 'commands.schema.json');
    try {
      await fs.access(candidate);
      const commands = JSON.parse(await fs.readFile(candidate, 'utf-8')) as object;
      const entities = JSON.parse(
        await fs.readFile(
          path.join(dir, 'docs', 'spec', 'registry', 'entities.schema.json'),
          'utf-8',
        ),
      ) as object;
      return { commands, entities };
    } catch {
      // keep walking up
    }
  }
  throw new Error('Could not locate docs/spec/registry/ schemas');
}

async function loadEmitter() {
  const mod = await import('@angriff36/manifest/registry/emit');
  return mod.emitRegistries;
}

async function loadCompiler() {
  const mod = await import('@angriff36/manifest/ir-compiler');
  return mod.compileToIR;
}

async function resolveIR(options: EmitOptions): Promise<unknown> {
  if (options.ir) {
    const irPath = path.resolve(process.cwd(), options.ir);
    const raw = await fs.readFile(irPath, 'utf-8');
    return JSON.parse(raw);
  }
  if (options.source) {
    const srcPath = path.resolve(process.cwd(), options.source);
    const src = await fs.readFile(srcPath, 'utf-8');
    const compileToIR = await loadCompiler();
    const result = await compileToIR(src);
    if (!result.ir) {
      const messages = result.diagnostics.map((d: { message: string }) => d.message).join('; ');
      throw new Error(`Compile failed: ${messages}`);
    }
    return result.ir;
  }
  throw new Error('emit-registries requires either --ir <path> or --source <path>');
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return '';
  return errors.map((e) => `  - ${e.instancePath || '<root>'} ${e.message ?? ''}`).join('\n');
}

export async function emitRegistriesCommand(options: EmitOptions = {}): Promise<void> {
  const outDir = path.resolve(process.cwd(), options.out ?? 'manifest-registry');
  const indent = options.pretty === false ? 0 : 2;
  const validate = options.validate !== false;

  const ir = await resolveIR(options);
  const emitRegistries = await loadEmitter();
  const { commands, entities } = emitRegistries(ir as Parameters<typeof emitRegistries>[0]);

  if (validate) {
    const schemas = await locateSchemas();
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validateCommands = ajv.compile(schemas.commands);
    const validateEntities = ajv.compile(schemas.entities);
    if (!validateCommands(commands)) {
      const reason = formatAjvErrors(validateCommands.errors);
      throw new Error(`Emitted commands registry does not conform to schema:\n${reason}`);
    }
    if (!validateEntities(entities)) {
      const reason = formatAjvErrors(validateEntities.errors);
      throw new Error(`Emitted entities registry does not conform to schema:\n${reason}`);
    }
  }

  const commandsPath = path.join(outDir, 'commands.json');
  const entitiesPath = path.join(outDir, 'entities.json');
  const commandsBody = JSON.stringify(commands, null, indent);
  const entitiesBody = JSON.stringify(entities, null, indent);
  const { writeTextFile } = await import('../utils/dry-run-fs.js');
  await writeTextFile(commandsPath, commandsBody, { dryRun: options.dryRun });
  await writeTextFile(entitiesPath, entitiesBody, { dryRun: options.dryRun });

  if (!options.dryRun) {
    console.log(
      chalk.green('Wrote'),
      commandsPath,
      chalk.gray(`(${commands.commands.length} commands)`),
    );
    console.log(
      chalk.green('Wrote'),
      entitiesPath,
      chalk.gray(`(${entities.entities.length} entities)`),
    );
  }
}

// Exported only for tests.
export const __internal = { locateSchemas };
