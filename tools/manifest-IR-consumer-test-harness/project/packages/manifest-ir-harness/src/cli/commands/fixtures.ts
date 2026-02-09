import { Command } from 'commander';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runScript } from '../../core/executor.js';
import { validateScript } from '../../core/validator.js';
import { formatOutput } from '../../core/output-formatter.js';
import type { IR, TestScript } from '../../types/index.js';

interface DiscoveredFixture {
  name: string;
  irPath: string | null;
  manifestPath: string | null;
  scriptPath: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function discoverFixtures(dir: string): Promise<DiscoveredFixture[]> {
  const fixtures: DiscoveredFixture[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    console.error(`Error: Could not read directory: ${dir}`);
    return fixtures;
  }

  const sorted = entries.sort();

  for (const entry of sorted) {
    const entryPath = join(dir, entry);
    const entryStat = await stat(entryPath);

    if (!entryStat.isDirectory()) continue;

    const scriptPath = join(entryPath, 'script.json');
    if (!(await fileExists(scriptPath))) continue;

    let irPath: string | null = null;
    let manifestPath: string | null = null;

    const irCandidate = join(entryPath, 'test.ir.json');
    if (await fileExists(irCandidate)) {
      irPath = irCandidate;
    }

    const manifestCandidate = join(entryPath, 'test.manifest');
    if (await fileExists(manifestCandidate)) {
      manifestPath = manifestCandidate;
    }

    if (irPath || manifestPath) {
      fixtures.push({ name: entry, irPath, manifestPath, scriptPath });
    }
  }

  return fixtures;
}

export const fixturesCommand = new Command('fixtures')
  .description('Auto-discover and run all test scripts in a fixtures directory')
  .requiredOption('--dir <path>', 'Path to fixtures directory')
  .action(async (options: { dir: string }) => {
    const fixtures = await discoverFixtures(options.dir);

    if (fixtures.length === 0) {
      console.log('No fixtures discovered.');
      return;
    }

    console.log(`Discovered ${fixtures.length} fixture(s)\n`);

    let totalPassed = 0;
    let totalFailed = 0;

    for (const fixture of fixtures) {
      const scriptContent = await readFile(fixture.scriptPath, 'utf-8');
      const script = JSON.parse(scriptContent) as TestScript;

      const validation = validateScript(script);
      if (!validation.valid) {
        console.log(`  SKIP  ${fixture.name} (invalid script: ${validation.errors.join('; ')})`);
        totalFailed++;
        continue;
      }

      try {
        let irSource: IR | undefined;
        let manifestSource: string | undefined;
        let sourcePath: string;

        if (fixture.irPath) {
          const irContent = await readFile(fixture.irPath, 'utf-8');
          irSource = JSON.parse(irContent) as IR;
          sourcePath = fixture.irPath;
        } else {
          manifestSource = await readFile(fixture.manifestPath!, 'utf-8');
          sourcePath = fixture.manifestPath!;
        }

        const result = await runScript({
          irSource,
          manifestSource,
          script,
          sourcePath,
          scriptPath: fixture.scriptPath,
        });

        const status = result.summary.failed === 0 ? 'PASS' : 'FAIL';
        const icon = result.summary.failed === 0 ? ' PASS ' : ' FAIL ';
        console.log(
          `  ${icon} ${fixture.name} — ${result.summary.assertionsPassed}/${result.summary.assertionsPassed + result.summary.assertionsFailed} assertions`
        );

        if (result.summary.failed > 0) {
          totalFailed++;
          for (const step of result.execution.steps) {
            for (const detail of step.assertions.details) {
              if (!detail.passed) {
                console.log(
                  `         step ${step.step}: ${detail.check} — expected ${JSON.stringify(detail.expected)}, got ${JSON.stringify(detail.actual)}`
                );
              }
            }
          }
        } else {
          totalPassed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ERROR ${fixture.name} — ${message}`);
        totalFailed++;
      }
    }

    console.log(`\nResults: ${totalPassed} passed, ${totalFailed} failed, ${fixtures.length} total`);

    if (totalFailed > 0) {
      process.exit(1);
    }
  });
