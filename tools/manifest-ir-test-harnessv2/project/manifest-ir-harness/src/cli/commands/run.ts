import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { executeScript } from '../../core/executor.js';
import { parseScript } from '../../core/script-schema.js';
import { formatOutput } from '../../core/output-formatter.js';
import { adapter } from '../../adapters/manifest-core.js';
import type { IR } from '../../adapters/manifest-core.js';

interface RunOptions {
  manifest?: string;
  ir?: string;
  script: string;
  output?: string;
  snapshot?: boolean;
}

async function loadIR(options: RunOptions): Promise<{ ir: IR; sourcePath: string; sourceType: 'manifest' | 'ir'; irHash: string }> {
  if (options.ir) {
    const irPath = resolve(options.ir);
    const raw = readFileSync(irPath, 'utf-8');
    const ir = JSON.parse(raw) as IR;
    const irHash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return { ir, sourcePath: irPath, sourceType: 'ir', irHash };
  }

  if (options.manifest) {
    const manifestPath = resolve(options.manifest);
    const source = readFileSync(manifestPath, 'utf-8');
    const result = await adapter.compile(source);
    if (!result.ir) {
      const diagnosticMessages = result.diagnostics
        .map(d => String(d))
        .join('\n');
      throw new Error(`Compilation failed:\n${diagnosticMessages}`);
    }
    const irJson = JSON.stringify(result.ir);
    const irHash = createHash('sha256').update(irJson).digest('hex').slice(0, 16);
    return { ir: result.ir, sourcePath: manifestPath, sourceType: 'manifest', irHash };
  }

  throw new Error('Either --manifest or --ir must be specified');
}

export async function runCommand(options: RunOptions): Promise<void> {
  try {
    const { ir, sourcePath, sourceType, irHash } = await loadIR(options);

    const scriptPath = resolve(options.script);
    const scriptRaw = readFileSync(scriptPath, 'utf-8');
    const scriptData = parseScript(JSON.parse(scriptRaw));

    const result = await executeScript({
      ir,
      script: scriptData,
      sourcePath,
      sourceType,
      scriptPath,
      irHash,
    });

    const output = formatOutput(result);

    if (options.output) {
      const outputPath = resolve(options.output);
      writeFileSync(outputPath, output, 'utf-8');
      process.stdout.write(`Results written to ${outputPath}\n`);
    } else {
      process.stdout.write(output + '\n');
    }

    if (result.summary.assertionsFailed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
