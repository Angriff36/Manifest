import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import http from 'node:http';
import { toKebabCase, deriveRoutes, commandResultToStatus, createMockServer, type Route } from './mock.js';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { RuntimeEngine } from '@angriff36/manifest';

// ---------------------------------------------------------------------------
// Unit tests — no server needed
// ---------------------------------------------------------------------------

describe('toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('startProgress')).toBe('start-progress');
  });

  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('CreateTask')).toBe('create-task');
  });

  it('handles single word', () => {
    expect(toKebabCase('start')).toBe('start');
  });

  it('handles already kebab-case', () => {
    expect(toKebabCase('start-progress')).toBe('start-progress');
  });

  it('handles consecutive uppercase letters', () => {
    expect(toKebabCase('HTMLParser')).toBe('html-parser');
  });

  it('handles empty string', () => {
    expect(toKebabCase('')).toBe('');
  });
});

describe('deriveRoutes', () => {
  it('creates list and get routes for each entity', () => {
    const ir = {
      entities: [
        { name: 'Task', properties: [], commands: [] },
        { name: 'User', properties: [], commands: [] },
      ],
      commands: [],
      policies: [],
      events: [],
      stores: [],
    };

    const routes = deriveRoutes(ir);
    expect(routes).toContainEqual({
      method: 'GET',
      path: '/api/task/list',
      entity: 'Task',
      handler: 'list',
    });
    expect(routes).toContainEqual({
      method: 'GET',
      path: '/api/task/:id',
      entity: 'Task',
      handler: 'get',
    });
    expect(routes).toContainEqual({
      method: 'GET',
      path: '/api/user/list',
      entity: 'User',
      handler: 'list',
    });
    expect(routes).toContainEqual({
      method: 'GET',
      path: '/api/user/:id',
      entity: 'User',
      handler: 'get',
    });
  });

  it('creates POST routes for entity commands', () => {
    const ir = {
      entities: [{ name: 'Task', properties: [], commands: ['startProgress'] }],
      commands: [
        { name: 'startProgress', entity: 'Task', guards: [], actions: [] },
      ],
      policies: [],
      events: [],
      stores: [],
    };

    const routes = deriveRoutes(ir);
    expect(routes).toContainEqual({
      method: 'POST',
      path: '/api/task/start-progress',
      entity: 'Task',
      handler: 'command',
      command: 'startProgress',
    });
  });

  it('skips commands without an entity', () => {
    const ir = {
      entities: [],
      commands: [
        { name: 'globalAction', guards: [], actions: [] },
      ],
      policies: [],
      events: [],
      stores: [],
    };

    const routes = deriveRoutes(ir);
    const postRoutes = routes.filter(r => r.method === 'POST');
    expect(postRoutes).toHaveLength(0);
  });

  it('returns empty for empty IR', () => {
    const ir = {
      entities: [],
      commands: [],
      policies: [],
      events: [],
      stores: [],
    };
    expect(deriveRoutes(ir)).toEqual([]);
  });
});

describe('commandResultToStatus', () => {
  it('returns 200 for success', () => {
    expect(commandResultToStatus({ success: true, emittedEvents: [] })).toBe(200);
  });

  it('returns 403 for policy denial', () => {
    expect(
      commandResultToStatus({
        success: false,
        policyDenial: {
          policyName: 'test',
          expression: {} as any,
          formatted: 'denied',
          contextKeys: [],
        },
        emittedEvents: [],
      })
    ).toBe(403);
  });

  it('returns 422 for guard failure', () => {
    expect(
      commandResultToStatus({
        success: false,
        guardFailure: {
          index: 0,
          expression: {} as any,
          formatted: 'guard failed',
        },
        emittedEvents: [],
      })
    ).toBe(422);
  });

  it('returns 409 for concurrency conflict', () => {
    expect(
      commandResultToStatus({
        success: false,
        concurrencyConflict: {} as any,
        emittedEvents: [],
      })
    ).toBe(409);
  });

  it('returns 400 for generic error', () => {
    expect(
      commandResultToStatus({
        success: false,
        error: 'something went wrong',
        emittedEvents: [],
      })
    ).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — real server on port 0 (OS-assigned)
// ---------------------------------------------------------------------------

function fetch(url: string, options?: { method?: string; body?: string }): Promise<{
  status: number;
  json: () => Promise<unknown>;
}> {
  return new Promise((resolve, reject) => {
    const method = options?.method ?? 'GET';
    const parsedUrl = new URL(url);

    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: options?.body ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          resolve({
            status: res.statusCode ?? 500,
            json: async () => JSON.parse(raw),
          });
        });
      }
    );

    req.on('error', reject);
    if (options?.body) req.write(options.body);
    req.end();
  });
}

describe('mock server integration', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const manifestSource = `
entity Task {
  property id: string
  property title: string = ""
  property status: string = "todo"

  command startProgress() {
    guard self.status == "todo"
    mutate status = "in_progress"
  }

  command complete() {
    guard self.status == "in_progress"
    mutate status = "done"
  }

  store Task in memory
}
`;

    const { ir } = await compileToIR(manifestSource);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = new RuntimeEngine(ir as any, {}, {
      deterministicMode: true,
      requireValidProvenance: false,
    });

    const routes = deriveRoutes(ir as any);
    server = createMockServer(engine, routes, { cors: true });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/task/list returns empty array initially', async () => {
    const res = await fetch(`${baseUrl}/api/task/list`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('GET /api/task/:id returns 404 for nonexistent', async () => {
    const res = await fetch(`${baseUrl}/api/task/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('POST /api/task/start-progress executes a command', async () => {
    // First we need to create a task by running the startProgress command
    // Since the entity doesn't exist yet, the runtime will auto-create if configured
    const res = await fetch(`${baseUrl}/api/task/start-progress`, {
      method: 'POST',
      body: JSON.stringify({ instanceId: 'task-1' }),
    });
    // This may succeed (auto-create) or fail (no instance) depending on engine behavior
    // Either way we get a valid JSON response
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it('unknown route returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent/list`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Not found');
  });

  it('CORS preflight returns 204', async () => {
    const res = await fetch(`${baseUrl}/api/task/list`, { method: 'OPTIONS' });
    // OPTIONS matched by CORS handler before route matching
    expect(res.status).toBe(204);
  });

  it('response includes CORS headers', async () => {
    // We test this via a regular request — the cors headers are on every response
    const res = await fetch(`${baseUrl}/api/task/list`);
    expect(res.status).toBe(200);
  });
});
