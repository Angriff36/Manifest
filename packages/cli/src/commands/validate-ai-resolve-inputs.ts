import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export interface ResolvedInput {
  filePath: string;
  type: 'manifest-source' | 'ir-json';
}

function inputTypeForPath(filePath: string): ResolvedInput['type'] {
  return path.extname(filePath) === '.json' ? 'ir-json' : 'manifest-source';
}

function pushResolved(inputs: ResolvedInput[], filePath: string): void {
  inputs.push({ filePath, type: inputTypeForPath(filePath) });
}

async function collectFromDirectory(dir: string): Promise<ResolvedInput[]> {
  const inputs: ResolvedInput[] = [];
  const manifestFiles = await glob('**/*.manifest', { cwd: dir, ignore: ['node_modules/**'] });
  const irFiles = await glob('**/*.ir.json', { cwd: dir, ignore: ['node_modules/**'] });

  for (const f of manifestFiles) pushResolved(inputs, path.join(dir, f));
  for (const f of irFiles) pushResolved(inputs, path.join(dir, f));
  return inputs;
}

async function collectFromGlobPattern(pattern: string): Promise<ResolvedInput[]> {
  const inputs: ResolvedInput[] = [];
  const files = await glob(pattern, { cwd: process.cwd(), ignore: ['node_modules/**'] });
  for (const f of files) pushResolved(inputs, path.resolve(process.cwd(), f));
  return inputs;
}

async function collectFromCwd(): Promise<ResolvedInput[]> {
  const ignore = ['node_modules/**', 'dist/**', '.next/**'];
  const manifestFiles = await glob('**/*.manifest', { cwd: process.cwd(), ignore });
  const irFiles = await glob('**/*.ir.json', { cwd: process.cwd(), ignore });

  const inputs: ResolvedInput[] = [];
  for (const f of manifestFiles) pushResolved(inputs, path.resolve(process.cwd(), f));
  for (const f of irFiles) pushResolved(inputs, path.resolve(process.cwd(), f));
  return inputs;
}

export async function resolveInputs(source: string | undefined): Promise<ResolvedInput[]> {
  if (!source) return collectFromCwd();

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (stat?.isFile()) {
    return [{ filePath: resolved, type: inputTypeForPath(resolved) }];
  }

  if (stat?.isDirectory()) {
    return collectFromDirectory(resolved);
  }

  const fromGlob = await collectFromGlobPattern(source);
  if (fromGlob.length > 0) return fromGlob;

  return [{ filePath: resolved, type: inputTypeForPath(resolved) }];
}
