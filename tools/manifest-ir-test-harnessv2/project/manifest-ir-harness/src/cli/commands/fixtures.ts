import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { executeScript } from '../../core/executor.js';
import { parseScript } from '../../core/script-schema.js';
import { formatOutput } from '../../core/output-formatter.js';
import { adapter } from '../../adapters/manifest-core.js';
import type { IR } from '../../adapters/manifest-core.js';

interface FixturesOptions {
  dir: string;
  snapshot?: boolean;
}

interface FixtureDir {
  name: string;
  path: string;
  irPath?: string;
  manifestPath?: string;
  scriptPath: string;
}

function discoverFixtures(baseDir: string): FixtureDir[] {
  const resolved = resolve(baseDir);
  const entries = readdirSync(resolved, { withFileTypes: true });
  const fixtures: FixtureDir[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = join(resolved, entry.name);
    const scriptPath = join(dirPath, 'script.json');

    if (!existsSync(scriptPath)) continue;

    const irPath = join(dirPath, 'test.ir.json');
    const manifestPath = join(dirPath, 'test.manifest');

    fixtures.push({
      name: entry.name,
      path: dirPath,
      irPath: existsSync(irPath) ? irPath : undefined,
      manifestPath: existsSync(manifestPath) ? manifestPath : undefined,
      scriptPath,
    });
  }

  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadFixtureIR(fixture: FixtureDir): Promise<{ ir: IR; sourcePath: string; sourceType: 'manifest' | 'ir'; irHash: string }> {
  if (fixture.irPath) {
    const raw = readFileSync(fixture.irPath, 'utf-8');
    const ir = JSON.parse(raw) as IR;
    const irHash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return { ir, sourcePath: fixture.irPath, sourceType: 'ir', irHash };
  }

  if (fixture.manifestPath) {
    const source = readFileSync(fixture.manifestPath, 'utf-8');
    const result = await adapter.compile(source);
    if (!result.ir) {
      throw new Error(`Compilation failed for ${fixture.manifestPath}`);
    }
    const irJson = JSON.stringify(result.ir);
    const irHash = createHash('sha256').update(irJson).digest('hex').slice(0, 16);
    return { ir: result.ir, sourcePath: fixture.manifestPath, sourceType: 'manifest', irHash };
  }

  throw new Error(`Fixture "${fixture.name}" has no IR or Manifest file`);
}

export async function fixturesCommand(options: FixturesOptions): Promise<void> {
  try {
    const fixtures = discoverFixtures(options.dir);

    if (fixtures.length === 0) {
      process.stdout.write(`No fixtures found in ${resolve(options.dir)}\n`);
      return;
    }

    process.stdout.write(`Found ${fixtures.length} fixture(s)\n\n`);

    let totalPassed = 0;
    let totalFailed = 0;

    for (const fixture of fixtures) {
      process.stdout.write(`Running: ${fixture.name}\n`);

      try {
        const { ir, sourcePath, sourceType, irHash } = await loadFixtureIR(fixture);
        const scriptRaw = readFileSync(fixture.scriptPath, 'utf-8');
        const script = parseScript(JSON.parse(scriptRaw));

        const result = await executeScript({
          ir,
          script,
          sourcePath,
          sourceType,
          scriptPath: fixture.scriptPath,
          irHash,
        });

        const status = result.summary.assertionsFailed === 0 ? 'PASS' : 'FAIL';
        process.stdout.write(
          `  ${status} - ${result.summary.assertionsPassed} passed, ${result.summary.assertionsFailed} failed\n`
        );

        if (result.summary.assertionsFailed > 0) {
          totalFailed++;
          const output = formatOutput(result);
          process.stdout.write(`  Details:\n${output}\n`);
        } else {
          totalPassed++;
        }
      } catch (err) {
        totalFailed++;
        const message = err instanceof Error ? err.message : String(err);
        process.stdout.write(`  ERROR: ${message}\n`);
      }

      process.stdout.write('\n');
    }

    process.stdout.write(`\nResults: ${totalPassed} passed, ${totalFailed} failed\n`);

    if (totalFailed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
