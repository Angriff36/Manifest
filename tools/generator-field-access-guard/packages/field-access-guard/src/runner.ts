import { createTracedProxy } from './tracer.js';
import { AllowlistMatcher } from './allowlist.js';
import { buildReport, type GuardReport } from './report.js';
import { pathToFileURL } from 'node:url';

export interface RunOptions {
  input: Record<string, unknown>;
  generatorPath: string;
  allowlist?: AllowlistMatcher;
}

export interface GeneratorModule {
  generate: (input: unknown, options?: unknown) => unknown;
}

export async function runGuard(opts: RunOptions): Promise<GuardReport> {
  const { proxy, getResult } = createTracedProxy(opts.input);

  const generatorUrl = pathToFileURL(opts.generatorPath).href;
  const mod = await import(generatorUrl) as GeneratorModule;

  if (typeof mod.generate !== 'function') {
    throw new Error(`Generator at ${opts.generatorPath} does not export a "generate" function`);
  }

  await mod.generate(proxy, {});

  const { observedPaths } = getResult();
  const forbiddenPaths = opts.allowlist
    ? opts.allowlist.filterForbidden(observedPaths)
    : [];

  return buildReport(observedPaths, forbiddenPaths);
}
