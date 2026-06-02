/**
 * manifest mock command
 *
 * Starts a local HTTP server that simulates API routes derived from compiled
 * Manifest IR. Uses RuntimeEngine with in-memory stores for real command
 * execution. Enables frontend teams to develop against a realistic API
 * before the backend is deployed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import chalk from 'chalk';
import ora from 'ora';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { RuntimeEngine, type CommandResult } from '@angriff36/manifest';

interface MockCommandOptions {
  port?: string | number;
  host?: string;
  cors?: boolean;
  scenario?: string;
}

interface IR {
  entities: IREntity[];
  commands: IRCommand[];
  policies: unknown[];
  events: unknown[];
  stores: unknown[];
  [key: string]: unknown;
}

interface IREntity {
  name: string;
  properties: Array<{
    name: string;
    type?: { name?: string } | string;
    defaultValue?: unknown;
  }>;
  commands?: string[];
  constraints?: unknown[];
  [key: string]: unknown;
}

interface IRCommand {
  name: string;
  entity?: string;
  parameters?: Array<{ name: string; type?: unknown }>;
  guards?: unknown[];
  actions?: unknown[];
  [key: string]: unknown;
}

export interface Route {
  method: 'GET' | 'POST';
  path: string;
  entity: string;
  handler: 'list' | 'get' | 'command';
  command?: string;
}

/**
 * Convert camelCase or PascalCase to kebab-case.
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Derive REST routes from IR entities and commands.
 */
export function deriveRoutes(ir: IR): Route[] {
  const routes: Route[] = [];

  for (const entity of ir.entities) {
    const entitySlug = entity.name.toLowerCase();

    // GET /api/{entity}/list — list all instances
    routes.push({
      method: 'GET',
      path: `/api/${entitySlug}/list`,
      entity: entity.name,
      handler: 'list',
    });

    // GET /api/{entity}/:id — get by ID
    routes.push({
      method: 'GET',
      path: `/api/${entitySlug}/:id`,
      entity: entity.name,
      handler: 'get',
    });
  }

  for (const command of ir.commands) {
    if (!command.entity) continue;

    const entitySlug = command.entity.toLowerCase();
    const commandSlug = toKebabCase(command.name);

    // POST /api/{entity}/{command-kebab} — execute command
    routes.push({
      method: 'POST',
      path: `/api/${entitySlug}/${commandSlug}`,
      entity: command.entity,
      handler: 'command',
      command: command.name,
    });
  }

  return routes;
}

/**
 * Map a CommandResult to an HTTP status code.
 */
export function commandResultToStatus(result: CommandResult): number {
  if (result.success) return 200;
  if (result.policyDenial) return 403;
  if (result.guardFailure) return 422;
  if (result.concurrencyConflict) return 409;
  return 400;
}

/**
 * Parse the JSON body from an incoming request.
 */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 */
function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  corsHeaders?: Record<string, string>
): void {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders,
  };
  res.writeHead(status, headers);
  res.end(json);
}

/**
 * Match a request URL against route patterns.
 * Returns the matched route and extracted parameters.
 */
function matchRoute(
  method: string,
  url: string,
  routes: Route[]
): { route: Route; params: Record<string, string> } | null {
  const urlPath = url.split('?')[0];

  for (const route of routes) {
    if (route.method !== method) continue;

    const routeParts = route.path.split('/');
    const urlParts = urlPath.split('/');

    if (routeParts.length !== urlParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = urlParts[i];
      } else if (routeParts[i] !== urlParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { route, params };
  }

  return null;
}

/**
 * Load and compile IR from source file (either .manifest or .ir.json).
 */
async function loadIR(sourcePath: string): Promise<IR> {
  const resolved = path.resolve(process.cwd(), sourcePath);
  const content = await fs.readFile(resolved, 'utf-8');

  if (resolved.endsWith('.ir.json') || resolved.endsWith('.json')) {
    return JSON.parse(content) as IR;
  }

  // Compile .manifest source
  const { ir, diagnostics } = await compileToIR(content, { sourcePath: resolved });
  const errors = (diagnostics || []).filter(
    (d: { severity?: string }) => d.severity === 'error'
  );

  if (!ir || errors.length > 0) {
    const messages = errors
      .map((d: { message?: string }) => d.message || 'Unknown compile error')
      .join('\n  ');
    throw new Error(`Compilation failed:\n  ${messages}`);
  }

  return ir as unknown as IR;
}

/**
 * Print scenario hints about guards and constraints in the IR.
 */
function printScenarioHints(ir: IR, scenario: string): void {
  if (scenario === 'default') return;

  console.log('');
  console.log(chalk.bold('Scenario hints:'));

  if (scenario === 'guard-fail') {
    console.log(chalk.gray('  Commands with guards that can reject requests:'));
    for (const cmd of ir.commands) {
      const guards = cmd.guards as unknown[] | undefined;
      if (guards && guards.length > 0) {
        console.log(
          chalk.yellow(`    ${cmd.entity ?? '(global)'}.${cmd.name}`) +
            chalk.gray(` — ${guards.length} guard(s)`)
        );
      }
    }
  }

  if (scenario === 'constraint-fail') {
    console.log(chalk.gray('  Entities with constraints:'));
    for (const entity of ir.entities) {
      const constraints = entity.constraints as unknown[] | undefined;
      if (constraints && constraints.length > 0) {
        console.log(
          chalk.yellow(`    ${entity.name}`) +
            chalk.gray(` — ${constraints.length} constraint(s)`)
        );
      }
    }
  }
}

/**
 * Create and start the mock HTTP server.
 */
export function createMockServer(
  engine: RuntimeEngine,
  routes: Route[],
  options: { cors?: boolean }
): http.Server {
  const corsHeaders: Record<string, string> = options.cors
    ? {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    : {};

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // CORS preflight
    if (options.cors && method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(chalk.gray(`  ${timestamp} ${method} ${url}`));

    const matched = matchRoute(method, url, routes);
    if (!matched) {
      sendJson(res, 404, { error: 'Not found' }, corsHeaders);
      return;
    }

    const { route, params } = matched;

    try {
      switch (route.handler) {
        case 'list': {
          const instances = await engine.getAllInstances(route.entity);
          sendJson(res, 200, instances, corsHeaders);
          break;
        }

        case 'get': {
          const instance = await engine.getInstance(route.entity, params.id);
          if (!instance) {
            sendJson(res, 404, { error: `${route.entity} not found: ${params.id}` }, corsHeaders);
          } else {
            sendJson(res, 200, instance, corsHeaders);
          }
          break;
        }

        case 'command': {
          const body = await parseBody(req);
          const { instanceId, input, ...rest } = body;

          const commandInput = (input as Record<string, unknown>) ?? rest;
          const result = await engine.runCommand(route.command!, commandInput, {
            entityName: route.entity,
            instanceId: instanceId as string | undefined,
          });

          const status = commandResultToStatus(result);
          sendJson(res, status, result, corsHeaders);
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`    Error: ${message}`));
      sendJson(res, 500, { error: message }, corsHeaders);
    }
  });

  return server;
}

/**
 * Main mock command handler.
 */
export async function mockCommand(
  source: string,
  options: MockCommandOptions
): Promise<void> {
  const spinner = ora('Loading manifest').start();

  try {
    if (!source) {
      spinner.fail('Source file required: manifest mock <source.manifest|source.ir.json>');
      process.exitCode = 1;
      return;
    }

    // Load IR
    const ir = await loadIR(source);
    spinner.succeed(`Loaded ${path.relative(process.cwd(), path.resolve(source))}`);

    // Create runtime engine with in-memory stores (default)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = new RuntimeEngine(ir as any, {}, {
      deterministicMode: true,
      requireValidProvenance: false,
    });

    // Derive routes
    const routes = deriveRoutes(ir);

    if (routes.length === 0) {
      console.log(chalk.yellow('  No routes derived from IR (no entities found)'));
      return;
    }

    // Print scenario hints
    const scenario = options.scenario ?? 'default';
    printScenarioHints(ir, scenario);

    // Start server
    const port = parseInt(String(options.port ?? '4000'), 10);
    const host = options.host ?? '127.0.0.1';
    const cors = !!options.cors;

    const server = createMockServer(engine, routes, { cors });

    server.listen(port, host, () => {
      console.log('');
      console.log(
        chalk.bold(`Mock server running at `) +
          chalk.cyan(`http://${host}:${port}`)
      );
      if (cors) {
        console.log(chalk.gray('  CORS enabled'));
      }
      console.log('');
      console.log(chalk.bold('Routes:'));
      for (const route of routes) {
        const methodColor = route.method === 'GET' ? chalk.green : chalk.blue;
        console.log(`  ${methodColor(route.method.padEnd(5))} ${route.path}`);
      }
      console.log('');
      console.log(chalk.gray('Press Ctrl+C to stop'));
      console.log('');
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('');
      console.log(chalk.gray('Shutting down mock server...'));
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    spinner.fail(
      `Mock server failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
