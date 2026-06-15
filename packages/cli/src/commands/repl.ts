/**
 * manifest repl command
 *
 * Interactive read-eval-print loop for executing commands, inspecting entity state,
 * and evaluating expressions against a live runtime loaded from .manifest source.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { createInterface, Interface } from 'node:readline';
import type { IR, IREntity, IRCommand } from '@angriff36/manifest/ir';
import type { RuntimeEngine } from '@angriff36/manifest';

type CompileToIR = (
  source: string,
  options?: { sourcePath?: string },
) => Promise<{ ir: IR | null; diagnostics: Array<{ severity: string; message: string }> }>;

type RuntimeEngineConstructor = new (
  ir: IR,
  context?: REPLUserContext,
) => RuntimeEngine;

// Import from the main Manifest package
async function loadCompiler(): Promise<{ compileToIR: CompileToIR }> {
  const module = await import('@angriff36/manifest/ir-compiler');
  return {
    compileToIR: module.compileToIR as CompileToIR,
  };
}

async function loadRuntime(): Promise<{ RuntimeEngine: RuntimeEngineConstructor }> {
  const module = await import('@angriff36/manifest');
  return {
    RuntimeEngine: module.RuntimeEngine as RuntimeEngineConstructor,
  };
}

interface REPLUserContext {
  user?: { id: string; role?: string };
  tenantId?: string;
  context?: Record<string, unknown>;
}

interface REPLContext {
  ir: IR;
  runtime: RuntimeEngine;
  manifestPath: string;
  jsonMode: boolean;
  userContext: REPLUserContext;
}

interface REPLCommand {
  name: string;
  description: string;
  handler: (args: string[], context: REPLContext) => Promise<void | string>;
  completer?: (args: string[], context: REPLContext) => string[];
}

/**
 * Get all manifest files from source pattern
 */
async function getManifestFiles(source: string): Promise<string[]> {
  if (!source) {
    const pattern = '**/*.manifest';
    const files = await glob(pattern, { cwd: process.cwd() });
    return files.map(f => path.resolve(process.cwd(), f));
  }

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isFile()) {
    return [resolved];
  }

  const pattern = '**/*.manifest';
  const files = await glob(pattern, { cwd: resolved });
  return files.map(f => path.resolve(resolved, f));
}

/**
 * Compile a manifest file to IR
 */
async function compileManifest(filePath: string, spinner: Ora): Promise<IR> {
  const { compileToIR } = await loadCompiler();

  spinner.text = `Compiling ${path.relative(process.cwd(), filePath)}`;
  const source = await fs.readFile(filePath, 'utf-8');
  const result = await compileToIR(source, { sourcePath: filePath });

  if (result.diagnostics && result.diagnostics.length > 0) {
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      spinner.fail(`Compilation failed with ${errors.length} error(s)`);
      for (const error of errors) {
        console.error(chalk.red(`  ${error.message}`));
      }
      throw new Error('Compilation failed');
    }
  }

  if (!result.ir) {
    throw new Error('Compilation produced no IR');
  }

  spinner.succeed(`Compiled ${path.relative(process.cwd(), filePath)}`);
  return result.ir;
}

/**
 * Create a RuntimeEngine instance from IR
 */
async function createRuntime(ir: IR, context: REPLUserContext): Promise<RuntimeEngine> {
  const { RuntimeEngine } = await loadRuntime();
  return new RuntimeEngine(ir, context);
}

/**
 * Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Read an optional `description` field that may exist on runtime IR objects
 * but is not declared on the static IR types.
 */
function optionalDescription(obj: unknown): string | undefined {
  if (obj && typeof obj === 'object' && 'description' in obj) {
    const value = (obj as { description?: unknown }).description;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * Colorize JSON output for better readability
 */
function colorizeJSON(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/(".*?"): ("(.*?)"|(\d+)|(true|false|null))/g, (match, key, value, num, bool) => {
      const coloredKey = chalk.cyan(key);
      let coloredValue = value;
      if (num) coloredValue = chalk.green(num);
      else if (bool === 'true' || bool === 'false') coloredValue = chalk.yellow(bool);
      else if (bool === 'null') coloredValue = chalk.gray(bool);
      else coloredValue = chalk.white(value);
      return `${coloredKey}: ${coloredValue}`;
    });
}

/**
 * REPL Commands
 */

// HELP: Show all available commands
const helpCommand: REPLCommand = {
  name: 'help',
  description: 'Show this help message',
  handler: async (_args: string[], _context: REPLContext) => {
    const commands = getAllCommands();
    let output = '\n' + chalk.bold('Available Commands:') + '\n\n';

    for (const cmd of commands) {
      const args = cmd.completer ? ' [...]' : '';
      output += `  ${chalk.green(cmd.name + args)} - ${chalk.gray(cmd.description)}\n`;
    }

    output += '\n' + chalk.bold('Expression Evaluation:') + '\n';
    output += '  Any input not matching a command is evaluated as a Manifest expression.\n';
    output += '  Example: `user.role` or `context.tenantId`\n\n';

    output += chalk.bold('Meta Commands:') + '\n';
    output += '  `json on|off` - Toggle JSON output mode\n';
    output += '  `set user <id>` - Set current user\n';
    output += '  `set tenant <id>` - Set current tenant\n';
    output += '  `set context <json>` - Set context variables\n\n';

    output += chalk.bold('Tips:') + '\n';
    output += '  Use TAB for completion\n';
    output += '  Use UP/DOWN arrows for command history\n';
    output += '  Use Ctrl+C or type `exit` to quit\n';

    return output;
  },
};

// LIST: List all entities
const listCommand: REPLCommand = {
  name: 'list',
  description: 'List all entities (aliases: ls, entities)',
  handler: async (_args: string[], context: REPLContext) => {
    const entities = context.ir.entities || [];
    if (context.jsonMode) {
      return JSON.stringify(entities.map((e: IREntity) => ({
        name: e.name,
        properties: e.properties.length,
        commands: e.commands.length,
      })), null, 2);
    }

    let output = '\n' + chalk.bold('Entities:') + '\n\n';
    for (const entity of entities) {
      output += `  ${chalk.cyan(entity.name)}`;
      output += chalk.gray(` (${entity.properties.length} properties, ${entity.commands.length} commands)\n`);
    }
    return output;
  },
  completer: (_args: string[], _context: REPLContext) => [],
};

// INSPECT: Show entity details
const inspectCommand: REPLCommand = {
  name: 'inspect',
  description: 'Show entity schema, properties, and commands',
  handler: async (args: string[], context: REPLContext) => {
    const [entityName] = args;
    if (!entityName) {
      return chalk.red('Error: Entity name required\nUsage: inspect <entity-name>');
    }

    const entity = context.ir.entities.find((e: IREntity) => e.name === entityName);
    if (!entity) {
      return chalk.red(`Error: Entity '${entityName}' not found`);
    }

    if (context.jsonMode) {
      return JSON.stringify(entity, null, 2);
    }

    let output = '\n' + chalk.bold(`Entity: ${chalk.cyan(entity.name)}`) + '\n\n';

    // Properties
    output += chalk.bold('Properties:') + '\n';
    for (const prop of entity.properties) {
      const isRequired = (prop as { required?: unknown }).required;
      const required = isRequired ? '' : chalk.gray('?');
      const typeName = prop.type?.name || prop.type || 'unknown';
      const nullable = prop.type?.nullable ? '?' : '';
      output += `  ${chalk.yellow(prop.name)}${required}: ${chalk.white(typeName + nullable)}\n`;
    }

    // Computed properties
    if (entity.computedProperties.length > 0) {
      output += '\n' + chalk.bold('Computed Properties:') + '\n';
      for (const cp of entity.computedProperties) {
        output += `  ${chalk.yellow(cp.name)}: ${chalk.gray('(computed)')}\n`;
      }
    }

    // Relationships
    if (entity.relationships.length > 0) {
      output += '\n' + chalk.bold('Relationships:') + '\n';
      for (const rel of entity.relationships) {
        output += `  ${chalk.yellow(rel.name)}: ${rel.kind} → ${chalk.cyan(rel.target)}\n`;
      }
    }

    // Commands
    if (entity.commands.length > 0) {
      output += '\n' + chalk.bold('Commands:') + '\n';
      for (const cmd of entity.commands) {
        const command = context.ir.commands.find((c: IRCommand) => c.name === cmd && c.entity === entityName);
        if (command) {
          output += `  ${chalk.green(cmd)}${chalk.gray(' - ' + (optionalDescription(command) || 'No description'))}\n`;
        } else {
          output += `  ${chalk.green(cmd)}\n`;
        }
      }
    }

    // Constraints
    if (entity.constraints.length > 0) {
      output += '\n' + chalk.bold('Constraints:') + '\n';
      for (const constraint of entity.constraints) {
        output += `  ${chalk.yellow(constraint.name)}: ${chalk.gray(constraint.code || 'block')}\n`;
      }
    }

    return output;
  },
  completer: (_args: string[], context: REPLContext) => {
    return context.ir.entities.map((e: IREntity) => e.name);
  },
};

// SHOW: Show entity instances
const showCommand: REPLCommand = {
  name: 'show',
  description: 'List all instances of an entity',
  handler: async (args: string[], context: REPLContext) => {
    const [entityName] = args;
    if (!entityName) {
      return chalk.red('Error: Entity name required\nUsage: show <entity-name>');
    }

    const entity = context.ir.entities.find((e: IREntity) => e.name === entityName);
    if (!entity) {
      return chalk.red(`Error: Entity '${entityName}' not found`);
    }

    const instances = await context.runtime.getAllInstances(entityName);

    if (context.jsonMode) {
      return JSON.stringify(instances, null, 2);
    }

    if (instances.length === 0) {
      return chalk.gray(`No instances of ${chalk.cyan(entityName)} found`);
    }

    let output = `\n${chalk.bold(entityName)} instances (${instances.length}):\n\n`;
    for (const inst of instances) {
      output += `  ${chalk.green(inst.id)}`;
      // Show a few key properties
      const keys = Object.keys(inst).filter(k => k !== 'id' && !k.startsWith('_')).slice(0, 3);
      if (keys.length > 0) {
        const preview = keys.map(k => `${k}=${JSON.stringify(inst[k])}`).join(', ');
        output += chalk.gray(` - ${preview}`);
      }
      output += '\n';
    }

    return output;
  },
  completer: (_args: string[], context: REPLContext) => {
    return context.ir.entities.map((e: IREntity) => e.name);
  },
};

// GET: Get a specific instance by ID
const getCommand: REPLCommand = {
  name: 'get',
  description: 'Get a specific instance by ID',
  handler: async (args: string[], context: REPLContext) => {
    const [entityName, id] = args;
    if (!entityName || !id) {
      return chalk.red('Error: Entity name and ID required\nUsage: get <entity-name> <id>');
    }

    const entity = context.ir.entities.find((e: IREntity) => e.name === entityName);
    if (!entity) {
      return chalk.red(`Error: Entity '${entityName}' not found`);
    }

    const instance = await context.runtime.getInstance(entityName, id);

    if (!instance) {
      return chalk.yellow(`Instance ${chalk.green(id)} of ${chalk.cyan(entityName)} not found`);
    }

    if (context.jsonMode) {
      return JSON.stringify(instance, null, 2);
    }

    return `\n${chalk.cyan(entityName)} ${chalk.green(id)}:\n${colorizeJSON(instance)}`;
  },
  completer: (_args: string[], context: REPLContext) => {
    return context.ir.entities.map((e: IREntity) => e.name);
  },
};

// RUN: Execute a command
const runCommand: REPLCommand = {
  name: 'run',
  description: 'Execute a manifest command (aliases: exec, execute)',
  handler: async (args: string[], context: REPLContext) => {
    const [entityName, commandName, ...inputArgs] = args;
    if (!entityName || !commandName) {
      return chalk.red('Error: Entity name and command name required\nUsage: run <entity> <command> [json-input]');
    }

    // Parse input JSON if provided
    let input: Record<string, unknown> = {};
    if (inputArgs.length > 0) {
      try {
        const inputStr = inputArgs.join(' ');
        input = JSON.parse(inputStr);
      } catch {
        return chalk.red('Error: Invalid JSON input\nUsage: run <entity> <command> {"key": "value"}');
      }
    }

    const result = await context.runtime.runCommand(commandName, input, {
      entityName,
    });

    if (context.jsonMode) {
      return JSON.stringify(result, null, 2);
    }

    let output = '';
    if (result.success) {
      output += chalk.green(`✓ Command ${chalk.cyan(`${entityName}.${commandName}`)} succeeded\n`);
      if (result.instance) {
        output += `\n${chalk.bold('Result:')}\n${colorizeJSON(result.instance)}\n`;
      } else if (result.result !== undefined) {
        output += `\n${chalk.bold('Result:')}\n${colorizeJSON(result.result)}\n`;
      }
    } else {
      output += chalk.red(`✗ Command ${chalk.cyan(`${entityName}.${commandName}`)} failed\n`);
      if (result.error) {
        output += chalk.red(`  Error: ${result.error}\n`);
      }
      if (result.deniedBy) {
        output += chalk.yellow(`  Denied by: ${result.deniedBy}\n`);
      }
      if (result.guardFailure) {
        output += chalk.yellow(`  Guard ${result.guardFailure.index} failed\n`);
      }
    }

    // Show emitted events
    if (result.emittedEvents && result.emittedEvents.length > 0) {
      output += `\n${chalk.bold('Emitted Events:')}\n`;
      for (const event of result.emittedEvents) {
        output += `  ${chalk.magenta(event.name)} - ${chalk.gray(JSON.stringify(event.payload))}\n`;
      }
    }

    return output;
  },
  completer: (args: string[], context: REPLContext) => {
    if (args.length === 0 || args.length === 1) {
      return context.ir.entities.map((e: IREntity) => e.name);
    }
    const [entityName] = args;
    const entity = context.ir.entities.find((e: IREntity) => e.name === entityName);
    if (entity && args.length === 2) {
      return entity.commands;
    }
    return [];
  },
};

// CMDS: List all commands in the IR
const cmdsCommand: REPLCommand = {
  name: 'cmds',
  description: 'List all commands',
  handler: async (_args: string[], context: REPLContext) => {
    const commands = context.ir.commands || [];

    if (context.jsonMode) {
      return JSON.stringify(commands, null, 2);
    }

    // Group by entity
    const byEntity: Record<string, IRCommand[]> = {};
    for (const cmd of commands) {
      const entity = cmd.entity || '(global)';
      if (!byEntity[entity]) byEntity[entity] = [];
      byEntity[entity].push(cmd);
    }

    let output = '\n' + chalk.bold('Commands:') + '\n\n';
    for (const [entity, cmds] of Object.entries(byEntity)) {
      output += chalk.cyan(entity) + ':\n';
      for (const cmd of cmds) {
        output += `  ${chalk.green(cmd.name)}`;
        const description = optionalDescription(cmd);
        if (description) {
          output += chalk.gray(` - ${description}`);
        }
        output += '\n';
      }
      output += '\n';
    }

    return output;
  },
  completer: (_args: string[], _context: REPLContext) => [],
};

// EVAL: Evaluate a Manifest expression
const evalCommand: REPLCommand = {
  name: 'eval',
  description: 'Evaluate a Manifest expression (use `:eval` for inline evaluation)',
  handler: async (args: string[], _context: REPLContext) => {
    const expr = args.join(' ');
    if (!expr) {
      return chalk.red('Error: Expression required\nUsage: eval <expression>');
    }

    try {
      // For now, we'll just return the expression as-is
      // Full expression evaluation would require parsing the expression
      return chalk.gray(`Expression evaluation not yet implemented for: ${expr}`);
    } catch (err: unknown) {
      return chalk.red(`Error evaluating expression: ${errorMessage(err)}`);
    }
  },
};

// SET: Set context variables
const setCommand: REPLCommand = {
  name: 'set',
  description: 'Set context variables (user, tenant, context)',
  handler: async (args: string[], context: REPLContext) => {
    const [key, ...valueParts] = args;
    const value = valueParts.join(' ');

    switch (key) {
      case 'user':
        context.userContext.user = { id: value, role: 'user' };
        return chalk.green(`User set to: ${value}`);

      case 'tenant':
        context.userContext.tenantId = value;
        // Recreate runtime with new tenant context
        context.runtime = await createRuntime(context.ir, context.userContext);
        return chalk.green(`Tenant set to: ${value}`);

      case 'context':
        try {
          const parsed = JSON.parse(value);
          context.userContext.context = { ...context.userContext.context, ...parsed };
          return chalk.green(`Context updated`);
        } catch {
          return chalk.red('Error: Invalid JSON for context');
        }

      default:
        return chalk.yellow(`Unknown setting: ${key}\nAvailable: user, tenant, context`);
    }
  },
  completer: (_args: string[], _context: REPLContext) => ['user', 'tenant', 'context'],
};

// POLICIES: List all policies
const policiesCommand: REPLCommand = {
  name: 'policies',
  description: 'List all policies',
  handler: async (_args: string[], context: REPLContext) => {
    const policies = context.ir.policies || [];

    if (context.jsonMode) {
      return JSON.stringify(policies, null, 2);
    }

    let output = '\n' + chalk.bold('Policies:') + '\n\n';
    for (const policy of policies) {
      output += `  ${chalk.cyan(policy.name)}`;
      const description = optionalDescription(policy);
      if (description) {
        output += chalk.gray(` - ${description}`);
      }
      output += '\n';
    }

    return output;
  },
};

// INFO: Show runtime info
const infoCommand: REPLCommand = {
  name: 'info',
  description: 'Show runtime and IR information',
  handler: async (_args: string[], context: REPLContext) => {
    const provenance = context.ir.provenance;

    if (context.jsonMode) {
      return JSON.stringify({
        manifestPath: context.manifestPath,
        compilerVersion: provenance?.compilerVersion,
        schemaVersion: provenance?.schemaVersion,
        compiledAt: provenance?.compiledAt,
        entities: context.ir.entities.length,
        commands: context.ir.commands.length,
        policies: context.ir.policies.length,
        tenant: context.ir.tenant,
      }, null, 2);
    }

    let output = '\n' + chalk.bold('Runtime Information') + '\n\n';
    output += `  ${chalk.yellow('Manifest:')} ${context.manifestPath}\n`;
    output += `  ${chalk.yellow('Compiler:')} ${provenance?.compilerVersion || 'unknown'}\n`;
    output += `  ${chalk.yellow('Schema:')} ${provenance?.schemaVersion || 'unknown'}\n`;
    output += `  ${chalk.yellow('Compiled:')} ${provenance?.compiledAt || 'unknown'}\n\n`;
    output += `  ${chalk.yellow('Entities:')} ${context.ir.entities.length}\n`;
    output += `  ${chalk.yellow('Commands:')} ${context.ir.commands.length}\n`;
    output += `  ${chalk.yellow('Policies:')} ${context.ir.policies.length}\n`;

    if (context.ir.tenant) {
      output += `  ${chalk.yellow('Tenant:')} ${context.ir.tenant.property}\n`;
    }

    // Show current context
    output += '\n' + chalk.bold('Current Context:') + '\n';
    if (context.userContext.user) {
      output += `  ${chalk.yellow('User:')} ${context.userContext.user.id}\n`;
    }
    if (context.userContext.tenantId) {
      output += `  ${chalk.yellow('Tenant ID:')} ${context.userContext.tenantId}\n`;
    }
    output += `  ${chalk.yellow('JSON Mode:')} ${context.jsonMode ? 'on' : 'off'}\n`;

    return output;
  },
};

// CLEAR: Clear event log
const clearCommand: REPLCommand = {
  name: 'clear',
  description: 'Clear the event log (aliases: cls)',
  handler: async (_args: string[], context: REPLContext) => {
    context.runtime.clearEventLog();
    return chalk.green('Event log cleared');
  },
};

// EVENTS: Show event log
const eventsCommand: REPLCommand = {
  name: 'events',
  description: 'Show event log',
  handler: async (_args: string[], context: REPLContext) => {
    const events = context.runtime.getEventLog();

    if (context.jsonMode) {
      return JSON.stringify(events, null, 2);
    }

    if (events.length === 0) {
      return chalk.gray('No events logged yet');
    }

    let output = `\n${chalk.bold('Event Log')} (${events.length} events):\n\n`;
    for (const event of events) {
      output += `  ${chalk.magenta(event.name)} - ${chalk.gray(JSON.stringify(event.payload))}\n`;
    }

    return output;
  },
};

// EXIT: Exit the REPL
const exitCommand: REPLCommand = {
  name: 'exit',
  description: 'Exit the REPL (aliases: quit, q)',
  handler: async () => {
    return '__EXIT__';
  },
};

// JSON: Toggle JSON output mode
const jsonToggleCommand: REPLCommand = {
  name: 'json',
  description: 'Toggle JSON output mode',
  handler: async (args: string[], context: REPLContext) => {
    const [mode] = args;
    if (mode === 'on' || mode === 'true' || mode === '1') {
      context.jsonMode = true;
      return chalk.green('JSON mode: ON');
    } else if (mode === 'off' || mode === 'false' || mode === '0') {
      context.jsonMode = false;
      return chalk.green('JSON mode: OFF');
    } else {
      context.jsonMode = !context.jsonMode;
      return chalk.green(`JSON mode: ${context.jsonMode ? 'ON' : 'OFF'}`);
    }
  },
  completer: (_args: string[], _context: REPLContext) => ['on', 'off'],
};

// Reload: Reload the manifest file
const reloadCommand: REPLCommand = {
  name: 'reload',
  description: 'Reload the manifest file',
  handler: async (args: string[], context: REPLContext) => {
    const spinner = ora('Reloading manifest').start();
    try {
      const ir = await compileManifest(context.manifestPath, spinner);
      context.ir = ir;
      context.runtime = await createRuntime(ir, context.userContext);
      return chalk.green('Manifest reloaded successfully');
    } catch (err: unknown) {
      spinner.fail('Reload failed');
      return chalk.red(`Error: ${errorMessage(err)}`);
    }
  },
};

// Get all commands with aliases
function getAllCommands(): REPLCommand[] {
  return [
    helpCommand,
    listCommand,
    inspectCommand,
    showCommand,
    getCommand,
    runCommand,
    cmdsCommand,
    evalCommand,
    setCommand,
    policiesCommand,
    infoCommand,
    clearCommand,
    eventsCommand,
    jsonToggleCommand,
    reloadCommand,
    exitCommand,
  ];
}

// Command lookup by name (including aliases)
const commandAliases: Record<string, string> = {
  'ls': 'list',
  'entities': 'list',
  'exec': 'run',
  'execute': 'run',
  'quit': 'exit',
  'q': 'exit',
  'cls': 'clear',
};

function findCommand(name: string): REPLCommand | undefined {
  const canonicalName = commandAliases[name] || name;
  return getAllCommands().find(c => c.name === canonicalName);
}

/**
 * Parse input line into command and arguments
 */
function parseInput(line: string): { command: string; args: string[]; raw: string } {
  const trimmed = line.trim();

  // Check for special "json on|off" syntax
  if (trimmed.startsWith('json ')) {
    const parts = trimmed.slice(4).trim().split(/\s+/);
    return { command: 'json', args: parts, raw: trimmed };
  }

  // Check for "set user/tenant/context" syntax
  if (trimmed.startsWith('set ')) {
    const parts = trimmed.slice(4).trim().split(/\s+/);
    return { command: 'set', args: parts, raw: trimmed };
  }

  // Check for ":eval" inline evaluation syntax
  if (trimmed.startsWith(':eval ')) {
    const expr = trimmed.slice(6).trim();
    return { command: 'eval', args: [expr], raw: trimmed };
  }

  // Regular command parsing
  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  return { command, args, raw: trimmed };
}

/**
 * Create readline interface with completion
 */
function createReadline(context: REPLContext): Interface {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => {
      const { command, args } = parseInput(line);
      const cmd = findCommand(command);

      if (cmd && cmd.completer) {
        const completions = cmd.completer(args, context);
        const lastArg = args[args.length - 1] || '';
        const hits = completions.filter((c: string) => c.startsWith(lastArg));

        // Show all completions if no input, or filter by input
        if (args.length === 0) {
          return [completions, line];
        }
        return [hits.length ? hits : completions, line];
      }

      // Complete command names
      if (args.length === 0) {
        const commands = getAllCommands().map(c => c.name);
        const hits = commands.filter(c => c.startsWith(command));
        return [hits.length ? hits : commands, line];
      }

      return [[], line];
    },
    prompt: chalk.cyan('manifest') + chalk.gray('>') + ' ',
  });
}

/**
 * Main REPL loop
 */
async function replLoop(context: REPLContext): Promise<void> {
  const rl = createReadline(context);

  // Show welcome message
  console.log('');
  console.log(chalk.bold.green('Manifest REPL') + chalk.gray(' - Interactive Runtime'));
  console.log(chalk.gray('Type `help` for available commands, `exit` to quit'));
  console.log('');

  rl.prompt();

  for await (const line of rl) {
    if (line.trim() === '') {
      rl.prompt();
      continue;
    }

    try {
      const { command, args } = parseInput(line);
      const cmd = findCommand(command);

      if (cmd) {
        const result = await cmd.handler(args, context);
        if (result === '__EXIT__') {
          rl.close();
          break;
        }
        if (result) {
          console.log(result);
        }
      } else {
        // Not a recognized command - could be an expression evaluation
        // For now, show an error
        console.log(chalk.yellow(`Unknown command: ${command}`));
        console.log(chalk.gray('Type `help` for available commands'));
      }
    } catch (err: unknown) {
      console.error(chalk.red(`Error: ${errorMessage(err)}`));
    }

    rl.prompt();
  }
}

/**
 * Main entry point for the repl command
 */
export async function replCommand(source: string | undefined, options: {
  json?: boolean;
  user?: string;
  tenant?: string;
  context?: string;
} = {}): Promise<void> {
  // Find and compile manifest file
  const files = await getManifestFiles(source || '');

  if (files.length === 0) {
    console.error(chalk.red('Error: No .manifest files found'));
    console.log(chalk.gray('Create a .manifest file or specify a source path'));
    process.exit(1);
  }

  // Use the first file found
  const manifestPath = files[0];
  const spinner = ora('Loading manifest').start();

  try {
    const ir = await compileManifest(manifestPath, spinner);

    // Build user context
    const userContext: REPLUserContext = {
      user: options.user ? { id: options.user, role: 'user' } : { id: 'repl-user', role: 'user' },
    };

    if (options.tenant) {
      userContext.tenantId = options.tenant;
    }

    if (options.context) {
      try {
        userContext.context = JSON.parse(options.context);
      } catch {
        spinner.warn('Invalid JSON for --context, ignoring');
      }
    }

    // Create runtime
    const runtime = await createRuntime(ir, userContext);

    // Set up REPL context
    const replContext: REPLContext = {
      ir,
      runtime,
      manifestPath,
      jsonMode: options.json || false,
      userContext,
    };

    spinner.stop();

    // Start REPL loop
    await replLoop(replContext);
  } catch (err: unknown) {
    spinner.fail('Failed to load manifest');
    console.error(chalk.red(errorMessage(err)));
    process.exit(1);
  }
}
