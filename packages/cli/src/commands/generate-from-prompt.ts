/**
 * manifest generate --from-prompt command
 *
 * Generates .manifest source code from natural language descriptions using an LLM.
 * Treats the LLM as an emitter, not a validator — validates output against the
 * conformance suite and iterates on failures.
 *
 * Usage:
 *   manifest generate --from-prompt "Create a blog with posts and comments"
 *   manifest generate --from-prompt --model claude-3-5-sonnet-20241022 "Design a task tracker"
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { loadCompiler } from './validate-ai.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateFromPromptOptions {
  /** Model to use for generation */
  model?: string;
  /** Output file path (default: stdout or generated filename) */
  output?: string;
  /** Maximum retry attempts for validation failures */
  maxRetries?: number;
  /** Include iteration details in output */
  verbose?: boolean;
  /** Skip validation (not recommended) */
  skipValidation?: boolean;
  /** API key for Anthropic (default: ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Temperature for LLM generation */
  temperature?: number;
  /** Preview -o write without touching the filesystem (stdout still works). */
  dryRun?: boolean;
}

interface GenerationIteration {
  attempt: number;
  manifestSource: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface GenerationResult {
  manifestSource: string;
  iterations: GenerationIteration[];
  success: boolean;
  totalAttempts: number;
}

// ---------------------------------------------------------------------------
// System Prompt Template
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt with IR schema and semantics documentation.
 * This is the single source of truth for the LLM about Manifest language.
 */
export async function buildSystemPrompt(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(here, '..', '..', '..');

  // Read spec files
  const schemaPath = path.join(root, 'docs', 'spec', 'ir', 'ir-v1.schema.json');
  const semanticsPath = path.join(root, 'docs', 'spec', 'semantics.md');
  const builtinsPath = path.join(root, 'docs', 'spec', 'builtins.md');
  const adaptersPath = path.join(root, 'docs', 'spec', 'adapters.md');

  let schemaContent = '';
  let semanticsContent = '';
  let builtinsContent = '';
  let _adaptersContent = '';

  try {
    schemaContent = await fs.readFile(schemaPath, 'utf-8');
  } catch {
    // Schema file not found, continue without it
  }

  try {
    semanticsContent = await fs.readFile(semanticsPath, 'utf-8');
  } catch {
    // Semantics file not found, continue without it
  }

  try {
    builtinsContent = await fs.readFile(builtinsPath, 'utf-8');
  } catch {
    // Builtins file not found, continue without it
  }

  try {
    _adaptersContent = await fs.readFile(adaptersPath, 'utf-8');
  } catch {
    // Adapters file not found, continue without it
  }

  // Read a few examples from examples.ts
  const examplesPath = path.join(root, 'src', 'manifest', 'examples.ts');
  let examplesContent = '';
  try {
    const fullExamples = await fs.readFile(examplesPath, 'utf-8');
    // Extract just the first 2-3 examples (truncated for context)
    const examplesMatch = fullExamples.match(/name: '.*?'\s+code: `[^`]{500,2000}`/gs);
    if (examplesMatch) {
      examplesContent = examplesMatch.slice(0, 3).join('\n\n');
    }
  } catch {
    // Examples file not found, continue without it
  }

  return `# Manifest Language Code Generator

You are an expert Manifest language code generator. Your task is to generate valid .manifest source code from natural language descriptions.

## Manifest Language Overview

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications. It compiles to an Intermediate Representation (IR).

## Core Language Concepts

### Entities
Entities define structured data with properties, relationships, commands, policies, and constraints.

\`\`\`manifest
entity User {
  property required id: string
  property required name: string
  property email: string?
  property role: string = "user"
  property readonly createdAt: string = now()

  // Commands
  command updateProfile(name: string, email: string) {
    guard self.id == user.id
    mutate self.name = name
    mutate self.email = email
  }

  // Policies
  policy canRead read: true
  policy canWrite write: user.id == self.id or user.role == "admin"

  // Constraints
  constraint validEmail: email == null or matches(email, "^[^@]+@[^@]+$")
}
\`\`\`

### Property Types
- \`string\`, \`number\`, \`boolean\`, \`decimal\`, \`timestamp\`
- \`array<T>\` for arrays
- \`map<T>\` for key-value maps
- \`enum Name\` for enums (defined separately)
- \`value Name\` for value objects

### Property Modifiers
- \`required\` - field must be present
- \`readonly\` - set once, never changes
- Optional \`?\` suffix - nullable field
- Default values: \`= <expression>\`

### Commands
Commands define business operations with guards, mutations, and emits.

\`\`\`manifest
command publish() {
  guard self.status == "draft"
  guard user.role == "editor"
  mutate self.status = "published"
  mutate self.publishedAt = now()
  emit PostPublished
}
\`\`\`

### Relationships
- \`hasOne\`, \`hasMany\`, \`belongsTo\`, \`ref\`

\`\`\`manifest
entity Post {
  hasOne author: User
  hasMany comments: Comment
  belongsTo category: Category
}
\`\`\`

### Policies
Authorization rules for read, write, execute actions.

\`\`\`manifest
policy canRead read: true
policy canWrite write: user.role == "admin"
policy canExecute execute: user.id == self.userId
\`\`\`

### Constraints
Data validation rules with severity levels.

\`\`\`manifest
constraint validStatus: self.status in ["draft", "published"]
constraint sufficientBalance: self.balance >= 0
\`\`\`

### Events
Realtime events for state changes.

\`\`\`manifest
event PostPublished: "post.published" {
  postId: string
  publishedBy: string
}
\`\`\`

### Stores
Persistence configuration.

\`\`\`manifest
store User in supabase { table: "users" }
store Post in memory
\`\`\`

### Modules
Logical grouping of related entities.

\`\`\`manifest
module blog {
  entity Post { ... }
  entity Comment { ... }
}
\`\`\`

### Enums
Enumeration types.

\`\`\`manifest
enum Status {
  draft
  published
  archived
}

entity Post {
  property status: Status = draft
}
\`\`\`

### Computed Properties
Auto-calculated derived fields.

\`\`\`manifest
entity Order {
  hasMany items: OrderItem
  computed total: number = sum(self.items, (item) => item.price * item.quantity)
}
\`\`\`

## Built-in Functions

### String Functions
- \`trim(s)\`, \`split(s, sep)\`, \`startsWith(s, prefix)\`, \`endsWith(s, suffix)\`
- \`replace(s, search, replacement)\`, \`toUpperCase(s)\`, \`toLowerCase(s)\`
- \`length(s)\`, \`substring(s, start, end?)\`, \`indexOf(s, search)\`
- \`matches(s, pattern)\` - regex test

### Math Functions
- \`abs(x)\`, \`round(x)\`, \`floor(x)\`, \`ceil(x)\`
- \`min(...)\`, \`max(...)\`, \`between(value, low, high)\`

### Aggregate Functions
- \`sum(arr, mapper?)\`, \`avg(arr, mapper?)\`
- \`min_of(arr, mapper?)\`, \`max_of(arr, mapper?)\`
- \`count_of(arr, predicate?)\`, \`filter(arr, predicate)\`, \`map(arr, mapper)\`

### Date Functions
- \`now()\` - current timestamp
- \`year(ts)\`, \`month(ts)\`, \`day(ts)\`, \`hours(ts)\`, \`minutes(ts)\`, \`seconds(ts)\`

### Other Functions
- \`uuid()\` - generate unique identifier
- \`flag(name)\` - resolve feature flag

## Expression Context
Available bindings in expressions:
- \`self\` / \`this\` - current entity instance
- \`user\` - current user object
- \`context\` - runtime context

## Code Generation Guidelines

1. **Be idiomatic**: Use proper Manifest syntax and conventions
2. **Be complete**: Include all entities, relationships, commands, and policies
3. **Be practical**: Focus on actionable business logic
4. **Add policies**: Every command should have appropriate policies
5. **Add constraints**: Validate data integrity
6. **Use computed properties**: For derived values
7. **Use relationships**: Connect related entities
8. **Define stores**: Specify persistence targets

## Output Format

Output ONLY valid .manifest source code. No explanations, no markdown code blocks, just the raw source code.

---

## IR Schema Reference (Condensed)

${schemaContent.length > 0 ? 'The IR schema defines the executable contract. Generated .manifest source must compile to valid IR.' : 'Schema reference: The generated source must compile to valid IR matching the IR v1 schema.'}

---

## Semantics Reference

${semanticsContent.length > 0 ? semanticsContent.substring(0, 3000) + '...' : 'Semantics: See docs/spec/semantics.md for detailed runtime behavior.'}

---

## Built-in Functions Reference

${builtinsContent.length > 0 ? builtinsContent.substring(0, 2000) + '...' : 'Builtins: See docs/spec/builtins.md for complete reference.'}

---

## Examples

${examplesContent.length > 0 ? examplesContent : 'Examples: See src/manifest/examples.ts for more examples.'}

---
`;
}

// ---------------------------------------------------------------------------
// LLM Integration
// ---------------------------------------------------------------------------

/**
 * Calls Anthropic's Claude API to generate Manifest source code.
 */
async function callAnthropic(prompt: string, options: GenerateFromPromptOptions): Promise<string> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required. Set it or pass --api-key.',
    );
  }

  const model = options.model ?? 'claude-3-5-sonnet-20241022';
  const temperature = options.temperature ?? 0.3;

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
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.text ?? '';

  // Extract code blocks if present
  const codeBlockMatch =
    text.match(/```(?:manifest)?\n([\s\S]+?)\n```/) || text.match(/```\n([\s\S]+?)\n```/);

  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Return as-is if no code blocks found
  return text.trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates generated Manifest source by compiling it.
 */
async function validateManifestSource(
  source: string,
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  try {
    const { compileToIR } = await loadCompiler();
    const result = await compileToIR(source, { sourcePath: '<generated>' });

    const errors: string[] = [];
    const warnings: string[] = [];

    if (result.diagnostics && result.diagnostics.length > 0) {
      for (const d of result.diagnostics) {
        const message = d.line ? `Line ${d.line}: ${d.message}` : d.message;
        if (d.severity === 'error') {
          errors.push(message);
        } else if (d.severity === 'warning') {
          warnings.push(message);
        }
      }
    }

    return {
      valid: errors.length === 0 && !!result.ir,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Main Generation Loop
// ---------------------------------------------------------------------------

/**
 * Generates Manifest source from a prompt with retry on validation failures.
 */
async function generateFromPrompt(
  prompt: string,
  options: GenerateFromPromptOptions,
  spinner: Ora,
): Promise<GenerationResult> {
  const maxRetries = options.maxRetries ?? 3;
  const iterations: GenerationIteration[] = [];
  const systemPrompt = await buildSystemPrompt();

  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    spinner.text = `Generating Manifest source (attempt ${attempt}/${maxRetries})...`;

    let manifestSource = '';

    try {
      // The command handler guarantees an API key is present before we get here.
      manifestSource = await callAnthropic(`${systemPrompt}\n\nUser request:\n${prompt}`, options);

      // Validate the output
      spinner.text = `Validating generated source (attempt ${attempt}/${maxRetries})...`;

      if (options.skipValidation) {
        return {
          manifestSource,
          iterations: [
            {
              attempt,
              manifestSource,
              valid: true,
              errors: [],
              warnings: [],
            },
          ],
          success: true,
          totalAttempts: attempt,
        };
      }

      const validation = await validateManifestSource(manifestSource);
      iterations.push({
        attempt,
        manifestSource,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      });

      if (validation.valid) {
        spinner.succeed(`Generated valid Manifest source (attempt ${attempt})`);
        return {
          manifestSource,
          iterations,
          success: true,
          totalAttempts: attempt,
        };
      }

      // Build retry prompt with errors
      spinner.warn(`Attempt ${attempt} failed: ${validation.errors.length} error(s)`);

      if (options.verbose) {
        console.log('');
        console.log(chalk.gray('  Errors:'));
        for (const err of validation.errors) {
          console.log(chalk.red(`    - ${err}`));
        }
        console.log('');
      }

      // Feed the validation errors back into the prompt for the next attempt.
      if (attempt < maxRetries) {
        prompt = `${systemPrompt}\n\nUser request:\n${prompt}\n\nIMPORTANT: Your previous output had these errors:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}\n\nFix these issues and provide valid Manifest source code.`;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      iterations.push({
        attempt,
        manifestSource: manifestSource || '',
        valid: false,
        errors: [msg],
        warnings: [],
      });

      if (attempt === maxRetries) {
        spinner.fail(`Generation failed after ${attempt} attempts: ${msg}`);
        return {
          manifestSource: '',
          iterations,
          success: false,
          totalAttempts: attempt,
        };
      }

      spinner.warn(`Attempt ${attempt} failed: ${msg}`);
    }
  }

  spinner.fail(`Failed to generate valid Manifest after ${maxRetries} attempts`);
  return {
    manifestSource: iterations[iterations.length - 1]?.manifestSource ?? '',
    iterations,
    success: false,
    totalAttempts: maxRetries,
  };
}

// ---------------------------------------------------------------------------
// Command Handler
// ---------------------------------------------------------------------------

export async function generateFromPromptCommand(
  prompt: string,
  options: GenerateFromPromptOptions = {},
): Promise<void> {
  // LLM-backed, like `generate-tests`: an API key is required. Fail fast with
  // an actionable message rather than a mid-run network stack trace. (Without
  // this gate the generator falls back to a canned template that ignores the
  // prompt — a permissive default that contradicts the house-style rules.)
  if (!(options.apiKey ?? process.env.ANTHROPIC_API_KEY)) {
    console.error(chalk.red('error: generate-from-prompt requires an Anthropic API key.'));
    console.error(chalk.gray('  Set ANTHROPIC_API_KEY or pass --api-key <key>.'));
    process.exit(1);
  }

  const spinner = ora('Preparing to generate').start();

  try {
    // Generate with retry loop
    const result = await generateFromPrompt(prompt, options, spinner);

    if (!result.success) {
      spinner.fail('Failed to generate valid Manifest source');
      console.error('');
      console.error(chalk.red('Generation failed. Last errors:'));
      for (const iter of result.iterations) {
        for (const err of iter.errors) {
          console.error(chalk.red(`  - ${err}`));
        }
      }
      process.exit(1);
    }

    // Output the result
    const outputPath = options.output;

    if (outputPath) {
      const resolvedPath = path.resolve(process.cwd(), outputPath);
      const { writeTextFile } = await import('../utils/dry-run-fs.js');
      await writeTextFile(resolvedPath, result.manifestSource, { dryRun: options.dryRun });
      spinner.succeed(
        options.dryRun
          ? `Dry-run: would write generated Manifest source to ${outputPath}`
          : `Generated Manifest source written to ${outputPath}`,
      );
    } else {
      spinner.stop();
      console.log('');
      console.log(chalk.bold('Generated Manifest source:'));
      console.log('─'.repeat(80));
      console.log(result.manifestSource);
      console.log('─'.repeat(80));
    }

    // Show iteration summary if verbose
    if (options.verbose && result.iterations.length > 1) {
      console.log('');
      console.log(chalk.bold('Iteration summary:'));
      for (const iter of result.iterations) {
        const icon = iter.valid ? chalk.green('✓') : chalk.red('✗');
        console.log(
          `  ${icon} Attempt ${iter.attempt}: ${iter.errors.length} error(s), ${iter.warnings.length} warning(s)`,
        );
      }
    }
  } catch (error) {
    spinner.fail(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}
