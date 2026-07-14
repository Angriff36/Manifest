/**
 * manifest gen-tests command
 *
 * Analyzes existing .manifest source and uses an LLM to generate additional
 * conformance fixture scenarios covering edge cases, boundary conditions,
 * and adversarial inputs. Generated fixtures are saved to the conformance
 * directory and must pass the existing test runner before being accepted.
 *
 * Usage:
 *   manifest gen-tests [source]
 *   manifest gen-tests --feature "computed properties with edge cases"
 *   manifest gen-tests --count 5 --category edge-cases
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { loadCompiler } from './validate-ai.js';
import { buildSystemPrompt } from './generate-from-prompt.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenTestsOptions {
  /** Source .manifest file, directory, or glob pattern */
  source?: string;
  /** Output directory for generated fixtures */
  output?: string;
  /** Custom feature description for test generation */
  feature?: string;
  /** Test category: edge-cases, boundary, adversarial, coverage */
  category?: 'edge-cases' | 'boundary' | 'adversarial' | 'coverage';
  /** Number of test fixtures to generate */
  count?: number;
  /** Model to use for generation */
  model?: string;
  /** Maximum retry attempts for validation failures */
  maxRetries?: number;
  /** Include iteration details in output */
  verbose?: boolean;
  /** API key for Anthropic (default: ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Temperature for LLM generation */
  temperature?: number;
  /** Dry run - don't write files */
  dryRun?: boolean;
  /** Next fixture number to use (auto-detected if omitted) */
  nextNumber?: number;
}

export interface GeneratedFixture {
  name: string;
  source: string;
  ir: unknown;
  diagnostics?: unknown;
  results?: unknown;
}

export interface GenerationResult {
  fixtures: GeneratedFixture[];
  totalAttempts: number;
  successful: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFORMANCE_FIXTURES_DIR = 'src/manifest/conformance/fixtures';
const CONFORMANCE_EXPECTED_DIR = 'src/manifest/conformance/expected';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the next available fixture number in the conformance directory.
 */
async function getNextFixtureNumber(fixturesDir: string): Promise<number> {
  try {
    const files = await glob('*.manifest', { cwd: fixturesDir });
    const numbers = files.map((f) => parseInt(f.split('-')[0], 10)).filter((n) => !isNaN(n));
    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  } catch {
    return 1;
  }
}

/**
 * Convert a feature name to a valid fixture filename.
 */
function featureToFixtureName(feature: string): string {
  return feature
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

/**
 * Build the test generation prompt based on category and feature.
 */
async function buildTestGenerationPrompt(
  options: GenTestsOptions,
  existingFixtures: string[],
): Promise<string> {
  const category = options.category ?? 'edge-cases';
  const feature = options.feature ?? 'general language features';
  const count = options.count ?? 3;

  const existingFixtureNames = existingFixtures.map((f) => f.replace('.manifest', ''));

  let categoryGuidance = '';
  switch (category) {
    case 'edge-cases':
      categoryGuidance = `
Generate tests that probe edge cases and corner cases:
- Empty strings, null values, undefined behavior
- Boundary conditions (0, -1, maximum values)
- Type coercion and type edge cases
- Empty arrays and empty objects
- Concurrent operations on same entity
- Error paths and failure modes
- Guard expressions that evaluate to falsy values
- Policy denials and authorization edge cases
`;
      break;
    case 'boundary':
      categoryGuidance = `
Generate tests that explore value boundaries:
- Minimum and maximum values for numbers
- String length limits
- Array size limits
- Nested relationship depth
- Constraint boundaries and thresholds
- Decimal precision edge cases
- Timestamp boundaries (epoch, far future, etc.)
`;
      break;
    case 'adversarial':
      categoryGuidance = `
Generate tests that simulate adversarial inputs:
- SQL injection attempts (in constraint expressions)
- Command injection patterns
- Policy bypass attempts
- Guard expression manipulation
- Invalid UTF-8 sequences
- Malformed constraint expressions
- Attempted privilege escalation
- Unexpected input types
`;
      break;
    case 'coverage':
      categoryGuidance = `
Generate tests that improve code coverage:
- Test every property type (string, number, boolean, decimal, timestamp, array, map, enum, value)
- Test every property modifier (required, readonly, optional with ?)
- Test every relationship type (hasOne, hasMany, belongsTo, ref)
- Test command features (guards, mutations, emits)
- Test policy actions (read, write, execute, all)
- Test constraint severity (ok, warn, block)
- Test computed properties with various expressions
- Test events and event reactions
`;
      break;
  }

  return `# Manifest Test Fixture Generator

Generate ${count} test fixture(s) for the feature: "${feature}"

## Test Category: ${category.toUpperCase()}
${categoryGuidance}

## Fixture Requirements

1. **Complete Test**: Each fixture should be a self-contained .manifest file that tests a specific scenario
2. **Descriptive Naming**: Include comments explaining what edge case or condition is being tested
3. **Valid Manifest**: All fixtures must compile to valid IR (no syntax errors)
4. **Focused**: Each fixture should test one or two related scenarios, not everything

## Existing Fixtures (avoid duplicating):
${existingFixtureNames.length > 0 ? existingFixtureNames.map((n) => `  - ${n}`).join('\n') : '  (none)'}

## Output Format

For each fixture, output:
1. A brief comment line describing the test
2. The complete .manifest source code

Separate multiple fixtures with a line of "---".

Example output format:
\`\`\`
// Test: Empty string defaults for optional string properties
entity Example {
  property required id: string
  property optionalName: string?
  property emptyDefault: string = ""
}
---
// Test: Guard with falsy value comparison
entity Example2 {
  ...
}
\`\`\`

Generate ${count} unique test fixtures following the "${category}" category for the feature: "${feature}".
`;
}

/**
 * Call Anthropic's Claude API to generate test fixtures.
 */
async function callAnthropic(prompt: string, options: GenTestsOptions): Promise<string> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required. Set it or pass --api-key.',
    );
  }

  const model = options.model ?? 'claude-3-5-sonnet-20241022';
  const temperature = options.temperature ?? 0.5;

  const systemPrompt = await buildSystemPrompt();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  return data.content?.[0]?.text ?? '';
}

/**
 * Parse generated fixtures from LLM output.
 */
function parseGeneratedFixtures(output: string): string[] {
  // Split by "---" to get individual fixtures
  const fixtures = output
    .split('---')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  // Remove markdown code blocks if present
  return fixtures.map((f) => {
    const codeMatch =
      f.match(/```(?:manifest)?\n([\s\S]+?)\n```/) || f.match(/```\n([\s\S]+?)\n```/);
    return codeMatch ? codeMatch[1].trim() : f;
  });
}

/**
 * Validate and compile a fixture to generate expected outputs.
 */
async function validateAndCompileFixture(
  source: string,
  _spinner: Ora,
  _options: GenTestsOptions,
): Promise<{ ir: unknown; diagnostics?: unknown }> {
  const { compileToIR } = await loadCompiler();

  const result = await compileToIR(source, { sourcePath: '<generated>' });

  if (
    result.diagnostics &&
    result.diagnostics.some((d: { severity: string }) => d.severity === 'error')
  ) {
    const errors = result.diagnostics.filter((d: { severity: string }) => d.severity === 'error');
    throw new Error(
      `Compilation failed: ${errors.map((e: { message: string }) => e.message).join(', ')}`,
    );
  }

  return {
    ir: result.ir,
    diagnostics: result.diagnostics,
  };
}

/**
 * Generate a fixture name from the test content.
 */
function generateFixtureName(source: string, index: number, baseNumber: number): string {
  // Extract the first comment for naming
  const commentMatch = source.match(/^\/\/\s*Test:\s*(.+)$/m);
  if (commentMatch) {
    const testName = featureToFixtureName(commentMatch[1]);
    return `${String(baseNumber + index).padStart(2, '0')}-${testName}.manifest`;
  }

  // Fallback: analyze the source for hints
  const entityMatch = source.match(/entity\s+(\w+)/);
  if (entityMatch) {
    const entityName = featureToFixtureName(entityMatch[1]);
    return `${String(baseNumber + index).padStart(2, '0')}-${entityName}-test.manifest`;
  }

  return `${String(baseNumber + index).padStart(2, '0')}-generated-test.manifest`;
}

/**
 * Write fixture files to the conformance directory.
 */
async function writeFixtureFiles(
  fixtureName: string,
  source: string,
  ir: unknown,
  fixturesDir: string,
  expectedDir: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(chalk.gray(`\n[Dry run] Would create fixture:`));
    console.log(chalk.cyan(`  ${fixtureName}`));
    return;
  }

  // Write fixture source
  const fixturePath = path.join(fixturesDir, fixtureName);
  await fs.mkdir(fixturesDir, { recursive: true });
  await fs.writeFile(fixturePath, source, 'utf-8');

  // Write expected IR
  const baseName = fixtureName.replace('.manifest', '');
  const irPath = path.join(expectedDir, `${baseName}.ir.json`);
  await fs.mkdir(expectedDir, { recursive: true });
  await fs.writeFile(irPath, JSON.stringify(ir, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Main Command Handler
// ---------------------------------------------------------------------------

export async function genTestsCommand(
  source: string | undefined,
  options: GenTestsOptions = {},
): Promise<GenerationResult> {
  const root = path.resolve(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  );
  const fixturesDir = path.resolve(root, options.output ?? CONFORMANCE_FIXTURES_DIR);
  const expectedDir = path.resolve(root, CONFORMANCE_EXPECTED_DIR);

  const spinner = ora('Analyzing source and generating tests').start();

  try {
    // Get existing fixtures to avoid duplication
    const existingFixtures = await glob('*.manifest', { cwd: fixturesDir });
    spinner.info(`Found ${existingFixtures.length} existing fixtures`);

    // Determine next fixture number
    const nextNumber = options.nextNumber ?? (await getNextFixtureNumber(fixturesDir));
    spinner.text = `Starting from fixture number ${nextNumber}`;

    // Build the generation prompt
    const prompt = await buildTestGenerationPrompt(options, existingFixtures);
    spinner.text = 'Generating test fixtures with LLM...';

    // Call LLM
    let llmOutput = '';
    try {
      if (process.env.ANTHROPIC_API_KEY || options.apiKey) {
        llmOutput = await callAnthropic(prompt, options);
      } else {
        spinner.warn(
          'No ANTHROPIC_API_KEY found. Please set the environment variable to use LLM generation.',
        );
        throw new Error('ANTHROPIC_API_KEY is required for test generation');
      }
    } catch (error) {
      spinner.fail(
        `LLM generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    // Parse generated fixtures
    spinner.text = 'Parsing generated fixtures...';
    const fixtures = parseGeneratedFixtures(llmOutput);
    spinner.info(`Generated ${fixtures.length} fixture(s)`);

    const result: GenerationResult = {
      fixtures: [],
      totalAttempts: fixtures.length,
      successful: 0,
      failed: 0,
    };

    // Validate and compile each fixture
    for (let i = 0; i < fixtures.length; i++) {
      const fixtureSource = fixtures[i];
      spinner.text = `Validating fixture ${i + 1}/${fixtures.length}...`;

      try {
        const { ir, diagnostics } = await validateAndCompileFixture(
          fixtureSource,
          spinner,
          options,
        );
        const fixtureName = generateFixtureName(fixtureSource, i, nextNumber);

        await writeFixtureFiles(
          fixtureName,
          fixtureSource,
          ir,
          fixturesDir,
          expectedDir,
          options.dryRun ?? false,
        );

        result.fixtures.push({
          name: fixtureName,
          source: fixtureSource,
          ir,
          diagnostics,
        });
        result.successful++;

        spinner.succeed(chalk.green(`Created: ${fixtureName}`));
        spinner.start();
      } catch (error) {
        result.failed++;
        const msg = error instanceof Error ? error.message : String(error);
        spinner.fail(chalk.red(`Fixture ${i + 1} failed validation: ${msg}`));

        if (options.verbose) {
          console.log(chalk.gray('\nFailed fixture source:'));
          console.log(fixtureSource);
        }

        spinner.start();
      }
    }

    spinner.stop();

    // Summary
    console.log('');
    console.log(chalk.bold('Test Generation Summary:'));
    console.log(`  Total fixtures:    ${result.totalAttempts}`);
    console.log(`  Successful:       ${chalk.green(result.successful)}`);
    console.log(`  Failed:           ${chalk.red(result.failed)}`);

    if (result.fixtures.length > 0) {
      console.log('');
      console.log(chalk.bold('Generated Fixtures:'));
      for (const fixture of result.fixtures) {
        console.log(chalk.cyan(`  ${fixture.name}`));
      }

      if (!options.dryRun) {
        console.log('');
        console.log(chalk.bold('Next Steps:'));
        console.log(`  1. Review the generated fixtures in: ${fixturesDir}`);
        console.log(`  2. Run tests: pnpm test`);
        console.log(`  3. If tests pass, the fixtures are ready for the conformance suite`);
      }
    }

    return result;
  } catch (error) {
    spinner.fail(
      `Test generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (options.verbose) {
      console.error(error);
    }
    throw error;
  }
}
