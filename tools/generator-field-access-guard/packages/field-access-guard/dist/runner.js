import { createTracedProxy } from './tracer.js';
import { buildReport } from './report.js';
import { pathToFileURL } from 'node:url';
export async function runGuard(opts) {
    const { proxy, getResult } = createTracedProxy(opts.input);
    const generatorUrl = pathToFileURL(opts.generatorPath).href;
    const mod = await import(generatorUrl);
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
