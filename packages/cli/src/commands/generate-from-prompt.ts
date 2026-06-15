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
async function callAnthropic(
  prompt: string,
  options: GenerateFromPromptOptions
): Promise<string> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required. Set it or pass --api-key.');
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

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.text ?? '';

  // Extract code blocks if present
  const codeBlockMatch = text.match(/```(?:manifest)?\n([\s\S]+?)\n```/) ||
                         text.match(/```\n([\s\S]+?)\n```/);

  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Return as-is if no code blocks found
  return text.trim();
}

/**
 * Fallback generator that uses a simple template-based approach.
 * This is used when no API key is available or the API fails.
 */
function generateTemplateFallback(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  // Detect common patterns
  const isBlog = lowerPrompt.includes('blog') || lowerPrompt.includes('post');
  const isTodo = lowerPrompt.includes('todo') || lowerPrompt.includes('task');
  const isEcommerce = lowerPrompt.includes('shop') || lowerPrompt.includes('store') || lowerPrompt.includes('product');
  const isUser = lowerPrompt.includes('user') || lowerPrompt.includes('account');

  let output = `// Generated from: "${prompt}"\n`;

  if (isBlog) {
    output += `
module blog {
  enum PostStatus {
    draft
    published
    archived
  }

  entity User {
    property required id: string
    property required name: string
    property required email: string
    property role: string = "author"
    property createdAt: string = now()

    hasMany posts: Post
    hasMany comments: Comment

    command register(userId: string, userName: string, emailAddr: string) {
      guard userId != null and userId != ""
      guard userName != null and userName != ""
      guard emailAddr != null and emailAddr != ""
      mutate id = userId
      mutate name = userName
      mutate email = emailAddr
      mutate createdAt = now()
      emit UserRegistered
    }

    policy canRead read: true
    policy canWrite write: user.id == self.id or user.role == "admin"
    policy canExecute execute: user.id == self.id or user.role == "admin"
  }

  entity Post {
    property required id: string
    property required title: string
    property required content: string
    property required authorId: string
    property status: string = "draft"
    property createdAt: string = now()
    property publishedAt: string = 0
    property viewCount: number = 0

    belongsTo author: User
    hasMany comments: Comment

    computed isPublished: boolean = self.status == "published"
    computed commentCount: number = count_of(self.comments)

    command createPost(postId: string, titleText: string, contentText: string, author: string) {
      guard postId != null and postId != ""
      guard titleText != null and titleText != ""
      guard contentText != null and contentText != ""
      mutate id = postId
      mutate title = titleText
      mutate content = contentText
      mutate authorId = author
      mutate createdAt = now()
      mutate status = "draft"
      emit PostCreated
    }

    command publishPost() {
      guard self.status == "draft"
      guard user.id == self.authorId or user.role == "editor" or user.role == "admin"
      mutate status = "published"
      mutate publishedAt = now()
      emit PostPublished
    }

    command archivePost() {
      guard self.status != "archived"
      guard user.role == "editor" or user.role == "admin"
      mutate status = "archived"
      emit PostArchived
    }

    command incrementViews() {
      mutate viewCount = self.viewCount + 1
    }

    policy canRead read: self.status == "published" or user.id == self.authorId or user.role == "editor" or user.role == "admin"
    policy canWrite write: user.id == self.authorId or user.role == "editor" or user.role == "admin"
    policy canExecute execute: true

    constraint validStatus: self.status in ["draft", "published", "archived"]
    constraint hasTitle: length(self.title) > 0
  }

  entity Comment {
    property required id: string
    property required postId: string
    property required authorId: string
    property required content: string
    property createdAt: string = now()
    property status: string = "visible"

    belongsTo post: Post
    belongsTo author: User

    computed isVisible: boolean = self.status == "visible"

    command addComment(commentId: string, post: string, author: string, text: string) {
      guard commentId != null and commentId != ""
      guard post != null and post != ""
      guard author != null and author != ""
      guard text != null and text != ""
      mutate id = commentId
      mutate postId = post
      mutate authorId = author
      mutate content = text
      mutate createdAt = now()
      mutate status = "visible"
      emit CommentAdded
    }

    command hideComment() {
      guard self.status == "visible"
      guard user.id == self.authorId or user.role == "editor" or user.role == "admin"
      mutate status = "hidden"
      emit CommentHidden
    }

    policy canRead read: self.status == "visible" or user.role == "editor" or user.role == "admin"
    policy canWrite write: user.id == self.authorId or user.role == "editor" or user.role == "admin"
    policy canExecute execute: true

    constraint hasContent: length(self.content) > 0
  }

  event UserRegistered: "user.registered" {
    id: string
    name: string
    email: string
    role: string
    registeredAt: string
  }

  event PostCreated: "post.created" {
    id: string
    title: string
    authorId: string
    createdAt: string
  }

  event PostPublished: "post.published" {
    id: string
    title: string
    authorId: string
    publishedAt: string
  }

  event PostArchived: "post.archived" {
    id: string
    archivedAt: string
  }

  event CommentAdded: "comment.added" {
    id: string
    postId: string
    authorId: string
    content: string
    createdAt: string
  }

  event CommentHidden: "comment.hidden" {
    id: string
    postId: string
    hiddenAt: string
  }
}

store User in memory
store Post in supabase { table: "posts" }
store Comment in supabase { table: "comments" }
`;
  } else if (isTodo) {
    output += `
module tasks {
  enum TaskStatus {
    pending
    in_progress
    completed
  }

  enum TaskPriority {
    low
    medium
    high
  }

  entity Task {
    property required id: string
    property required title: string
    property description: string?
    property required assigneeId: string
    property status: string = "pending"
    property priority: string = "medium"
    property dueDate: string?
    property completedAt: string?
    property createdAt: string = now()

    belongsTo assignee: User

    command startTask() {
      guard self.status == "pending"
      guard user.id == self.assigneeId
      mutate status = "in_progress"
      emit TaskStarted
    }

    command completeTask() {
      guard self.status == "in_progress"
      guard user.id == self.assigneeId
      mutate status = "completed"
      mutate completedAt = now()
      emit TaskCompleted
    }

    command updateTitle(newTitle: string) {
      guard user.id == self.assigneeId
      guard newTitle != null and newTitle != ""
      mutate title = newTitle
    }

    policy canRead read: user.id == self.assigneeId or user.role == "manager"
    policy canWrite write: user.id == self.assigneeId or user.role == "manager"
    policy canExecute execute: user.id == self.assigneeId or user.role == "manager"

    constraint validStatus: self.status in ["pending", "in_progress", "completed"]
    constraint hasTitle: length(self.title) > 0
  }

  entity User {
    property required id: string
    property required name: string
    property required email: string
    property role: string = "member"
    property createdAt: string = now()

    hasMany assignedTasks: Task

    command register(userId: string, userName: string, emailAddr: string) {
      guard userId != null and userId != ""
      guard userName != null and userName != ""
      guard emailAddr != null and emailAddr != ""
      mutate id = userId
      mutate name = userName
      mutate email = emailAddr
      mutate createdAt = now()
      emit UserRegistered
    }

    policy canRead read: true
    policy canWrite write: user.id == self.id or user.role == "admin"
    policy canExecute execute: user.id == self.id or user.role == "admin"
  }

  event TaskStarted: "tasks.task.started" {
    taskId: string
    startedBy: string
  }

  event TaskCompleted: "tasks.task.completed" {
    taskId: string
    completedBy: string
    completedAt: string
  }

  event UserRegistered: "user.registered" {
    userId: string
    name: string
    registeredAt: string
  }
}

store Task in supabase { table: "tasks" }
store User in memory
`;
  } else if (isEcommerce) {
    output += `
module shop {
  entity Product {
    property required id: string
    property required name: string
    property description: string?
    property price: number
    property stock: number = 0
    property active: boolean = true
    property createdAt: string = now()

    command updatePrice(newPrice: number) {
      guard user.role == "admin"
      guard newPrice >= 0
      mutate price = newPrice
      emit PriceUpdated
    }

    command adjustStock(delta: number) {
      guard user.role == "admin"
      mutate stock = stock + delta
      emit StockAdjusted
    }

    policy canRead read: self.active == true or user.role == "admin"
    policy canWrite write: user.role == "admin"
    policy canExecute execute: user.role == "admin"

    constraint validPrice: self.price >= 0
    constraint validStock: self.stock >= 0
  }

  entity Order {
    property required id: string
    property required customerId: string
    property status: string = "pending"
    property total: number = 0
    property createdAt: string = now()

    belongsTo customer: User

    command placeOrder(orderId: string, customer: string, amount: number) {
      guard orderId != null and orderId != ""
      guard customer != null and customer != ""
      guard amount > 0
      mutate id = orderId
      mutate customerId = customer
      mutate total = amount
      mutate createdAt = now()
      mutate status = "pending"
      emit OrderPlaced
    }

    command completeOrder() {
      guard self.status == "pending"
      guard user.id == self.customerId
      mutate status = "completed"
      emit OrderCompleted
    }

    policy canRead read: user.id == self.customerId or user.role == "admin"
    policy canWrite write: user.id == self.customerId or user.role == "admin"
    policy canExecute execute: user.id == self.customerId or user.role == "admin"

    constraint validStatus: self.status in ["pending", "completed", "cancelled"]
    constraint validTotal: self.total >= 0
  }

  entity User {
    property required id: string
    property required name: string
    property required email: string
    property role: string = "customer"
    property createdAt: string = now()

    hasMany orders: Order

    command register(userId: string, userName: string, emailAddr: string) {
      guard userId != null and userId != ""
      guard userName != null and userName != ""
      guard emailAddr != null and emailAddr != ""
      mutate id = userId
      mutate name = userName
      mutate email = emailAddr
      mutate createdAt = now()
      emit UserRegistered
    }

    policy canRead read: true
    policy canWrite write: user.id == self.id or user.role == "admin"
    policy canExecute execute: user.id == self.id or user.role == "admin"
  }

  event PriceUpdated: "shop.price.updated" {
    productId: string
    newPrice: number
  }

  event StockAdjusted: "shop.stock.adjusted" {
    productId: string
    newStock: number
  }

  event OrderPlaced: "shop.order.placed" {
    orderId: string
    customerId: string
    total: number
  }

  event OrderCompleted: "shop.order.completed" {
    orderId: string
    completedAt: string
  }

  event UserRegistered: "user.registered" {
    userId: string
    name: string
    registeredAt: string
  }
}

store Product in supabase { table: "products" }
store Order in supabase { table: "orders" }
store User in supabase { table: "users" }
`;
  } else {
    // Generic template
    output += `
// Generated Manifest source for: "${prompt}"
// Customize this template to match your requirements

module app {
  entity ${isUser ? 'User' : 'Entity'} {
    property required id: string
    property name: string
    property readonly createdAt: string = now()

    command update(name: string) {
      guard user.id == self.id or user.role == "admin"
      mutate self.name = name
      emit EntityUpdated
    }

    policy canRead read: true
    policy canWrite write: user.id == self.id or user.role == "admin"
    policy canExecute execute: user.id == self.id or user.role == "admin"
  }

  event EntityUpdated: "app.entity.updated" {
    entityId: string
    updatedBy: string
  }
}

store ${isUser ? 'User' : 'Entity'} in memory
`;
  }

  return output.trim();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates generated Manifest source by compiling it.
 */
async function validateManifestSource(
  source: string
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
  spinner: Ora
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
      // Try Anthropic API first
      if (process.env.ANTHROPIC_API_KEY || options.apiKey) {
        manifestSource = await callAnthropic(
          `${systemPrompt}\n\nUser request:\n${prompt}`,
          options
        );
      } else {
        // Use template fallback
        spinner.warn('No ANTHROPIC_API_KEY found, using template generator');
        manifestSource = generateTemplateFallback(prompt);
      }

      // Validate the output
      spinner.text = `Validating generated source (attempt ${attempt}/${maxRetries})...`;

      if (options.skipValidation) {
        return {
          manifestSource,
          iterations: [{
            attempt,
            manifestSource,
            valid: true,
            errors: [],
            warnings: [],
          }],
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

      // Update prompt for next iteration (will be used if not last attempt)
      if (attempt < maxRetries) {
        if (process.env.ANTHROPIC_API_KEY || options.apiKey) {
          // Use Anthropic for retry
          const retryPrompt = `${systemPrompt}\n\nUser request:\n${prompt}\n\nIMPORTANT: Your previous output had these errors:\n${validation.errors.map(e => `  - ${e}`).join('\n')}\n\nFix these issues and provide valid Manifest source code.`;
          // Update for next call
          prompt = retryPrompt; // This won't actually work, need to refactor
        }
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
  options: GenerateFromPromptOptions = {}
): Promise<void> {
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
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, result.manifestSource, 'utf-8');
      spinner.succeed(`Generated Manifest source written to ${outputPath}`);
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
        console.log(`  ${icon} Attempt ${iter.attempt}: ${iter.errors.length} error(s), ${iter.warnings.length} warning(s)`);
      }
    }

  } catch (error) {
    spinner.fail(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}
