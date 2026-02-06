import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileToIR } from '../src/manifest/ir-compiler';

type ExpectedDiagnosticsFile = {
  shouldFail?: boolean;
  diagnostics?: unknown[];
} & Record<string, unknown>;

type NormalizedDiagnostics = {
  errors: unknown[];
  warnings: unknown[];
};

function safeReadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown) {
  const json = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(path, json, 'utf-8');
}

function normalizeDiagnostics(result: unknown): NormalizedDiagnostics {
  // Be tolerant: different compilers name these differently.
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];

  // If diagnostics array exists, extract errors/warnings from it
  if (Array.isArray(result?.diagnostics)) {
    const diagnostics = result.diagnostics as Array<{ severity: string }>;
    return {
      errors: diagnostics.filter(d => d.severity === 'error'),
      warnings: diagnostics.filter(d => d.severity === 'warning'),
    };
  }

  return { errors, warnings };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = join(__dirname, '..');

const fixturesDir = join(repoRoot, 'src', 'manifest', 'conformance', 'fixtures');
const expectedDir = join(repoRoot, 'src', 'manifest', 'conformance', 'expected');

mkdirSync(expectedDir, { recursive: true });

const fixtures = readdirSync(fixturesDir)
  .filter((f) => extname(f) === '.manifest')
  .sort((a, b) => a.localeCompare(b));

const problems: string[] = [];

async function regen() {
  for (const fixtureFile of fixtures) {
    const fixtureName = basename(fixtureFile, '.manifest');

    const fixturePath = join(fixturesDir, fixtureFile);
    const irPath = join(expectedDir, `${fixtureName}.ir.json`);
    const diagnosticsPath = join(expectedDir, `${fixtureName}.diagnostics.json`);

    const source = readFileSync(fixturePath, 'utf-8');

    // Compile
    const compiled = await compileToIR(source);

    const { errors, warnings } = normalizeDiagnostics(compiled);

    // Read expected diagnostics (if any) to see if this fixture is supposed to fail.
    const expectedDiag = safeReadJson<ExpectedDiagnosticsFile>(diagnosticsPath);
    const expectedShouldFail = expectedDiag?.shouldFail === true;

    const didFail = errors.length > 0;

    // Enforce "shouldFail": if fixture declares shouldFail, compilation must fail.
    if (expectedShouldFail && !didFail) {
      problems.push(`${fixtureFile}: Expected to fail but compiled successfully`);
      continue;
    }

  // If compilation succeeded, write IR output (derived, never hand-edited).
  if (!didFail) {
    if (!compiled?.ir) {
      problems.push(`${fixtureFile}: Compile succeeded but no IR was produced`);
      continue;
    }
    // Normalize provenance fields for consistent test output
    const irForOutput = { ...compiled.ir };
    if (irForOutput.provenance) {
      irForOutput.provenance.compiledAt = '2024-01-01T00:00:00.000Z';
      irForOutput.provenance.contentHash = 'normalized-content-hash';
    }
    writeJson(irPath, irForOutput);
  }

  // Write diagnostics when:
  // - The compile produced errors/warnings, OR
  // - A diagnostics file already exists (so regen updates it deterministically)
  if (didFail || warnings.length > 0 || expectedDiag) {
    // Use compiler-provided diagnostics array, formatted as expected by tests
    const diagnostics = compiled?.diagnostics || [];
    const diagOut = {
      shouldFail: expectedShouldFail || didFail,
      diagnostics: diagnostics.map((d: unknown) => {
        if (d && typeof d === 'object' && 'severity' in d && 'message' in d && 'line' in d && 'column' in d) {
          return {
            severity: d.severity,
            message: d.message,
            line: d.line as number,
            column: d.column as number,
          };
        }
        return { severity: 'error', message: 'Unknown diagnostic', line: 0, column: 0 };
      }),
    };

    writeJson(diagnosticsPath, diagOut);
  }
  }

  if (problems.length) {
    // Print all problems and exit non-zero
    console.error(problems.join('\n'));
    process.exit(1);
  }

  console.log(`Regenerated conformance outputs for ${fixtures.length} fixture(s).`);
}

regen();
