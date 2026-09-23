/**
 * Executable generated command transport — canonical Convex dispatcher.
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { DISPATCHER_FORBIDDEN_BODY_KEYS } from '../../convex/http-dispatcher.js';
import { generateWiringBindings } from '../bindings-generator.js';
import { buildWiringContract } from '../contract-builder.js';
import type { WiringCommandDescriptor } from '../types.js';
import { CONVEX_HTTP_FORBIDDEN_BODY_KEYS } from './command-wire-protocol.js';
import { WiringCommandExecutor } from './command-executor.js';
import { WiringTransportError } from './transport-error.js';

const FIXTURE = `
entity Task {
  property required id: string
  property title: string = ""
  property dueDate: date = "2026-01-01"
  property completedBy: string = ""
  property version: number = 1

  command create(
    title: string,
    dueDate: date,
    completedBy: string from context.actorId
  ) {
    mutate title = title
    mutate dueDate = dueDate
    mutate completedBy = completedBy
  }

  command markPublished() {
    mutate title = "published"
  }

  command createViaCapture(title: string) {
    mutate title = title
  }

  store Task in memory
}
`;

async function compile(source: string) {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  expect(errors, errors.map((e) => e.message).join('\n')).toHaveLength(0);
  return ir!;
}

function cap(sourceCaps: WiringCommandDescriptor[], command: string): WiringCommandDescriptor {
  const found = sourceCaps.find((item) => item.command === command);
  expect(found, command).toBeDefined();
  return found!;
}

describe('wiring command transport', () => {
  it('uses the same forbidden identity keys as the Convex dispatcher', () => {
    expect([...CONVEX_HTTP_FORBIDDEN_BODY_KEYS]).toEqual([...DISPATCHER_FORBIDDEN_BODY_KEYS]);
  });

  it('builds a parameterized create without docId and strips trusted fields', async () => {
    const ir = await compile(FIXTURE);
    const contract = buildWiringContract(ir);
    const create = cap(contract.capabilities, 'create');
    expect(create.targetsExistingInstance).toBe(false);
    expect(create.dispatchable).toBe(true);
    expect(create.serverParameterNames).toContain('completedBy');

    const seen: Array<{ url: string; init: RequestInit }> = [];
    const executor = new WiringCommandExecutor({
      baseUrl: 'https://backend.example',
      bearerToken: 'staff-token',
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ data: { id: 'task-1' } }), { status: 200 });
      }) as typeof fetch,
    });

    const outcome = await executor.execute(create, {
      client: {
        title: 'Dinner',
        dueDate: '2026-06-01T00:00:00.000Z',
        completedBy: 'spoofed-actor',
        actorId: 'spoofed-too',
        tenantId: 'spoofed-tenant',
      },
      idempotencyKey: 'create-1',
    });

    expect(outcome).toEqual({ ok: true, data: { id: 'task-1' } });
    expect(seen[0]?.url).toBe('https://backend.example/api/manifest/Task/commands/create');
    expect(seen[0]?.init.headers).toMatchObject({
      authorization: 'Bearer staff-token',
      'content-type': 'application/json',
    });
    const body = JSON.parse(String(seen[0]?.init.body)) as Record<string, unknown>;
    expect(body.title).toBe('Dinner');
    expect(body.dueDate).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
    expect(body.idempotencyKey).toBe('create-1');
    expect(body).not.toHaveProperty('docId');
    expect(body).not.toHaveProperty('completedBy');
    expect(body).not.toHaveProperty('actorId');
    expect(body).not.toHaveProperty('tenantId');
  });

  it('sends a Date and omits an undefined date instead of failing', async () => {
    const contract = buildWiringContract(await compile(FIXTURE));
    const create = cap(contract.capabilities, 'create');
    const bodies: Record<string, unknown>[] = [];
    const executor = new WiringCommandExecutor({
      baseUrl: 'https://backend.example',
      bearerToken: 'staff-token',
      fetchImpl: (async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ data: { id: 'task-1' } }), { status: 200 });
      }) as typeof fetch,
    });
    const due = new Date('2026-06-01T00:00:00.000Z');
    await executor.execute(create, { client: { title: 'Dinner', dueDate: due } });
    await executor.execute(create, { client: { title: 'Dinner', dueDate: undefined } });
    expect(bodies[0]?.dueDate).toBe(due.getTime());
    expect(bodies[1]).not.toHaveProperty('dueDate');
  });

  it('uses the global fetch function when no fetch implementation is injected', async () => {
    const contract = buildWiringContract(await compile(FIXTURE));
    const publish = cap(contract.capabilities, 'markPublished');
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    }) as typeof fetch;
    try {
      const executor = new WiringCommandExecutor({
        baseUrl: 'https://backend.example',
        bearerToken: 'staff-token',
      });
      await executor.execute(publish, { client: {}, docId: 'doc-1' });
    } finally {
      globalThis.fetch = original;
    }
    expect(called).toBe(true);
  });

  it('requires docId for a zero-parameter instance command and forwards version', async () => {
    const ir = await compile(FIXTURE);
    ir.entities.find((entity) => entity.name === 'Task')!.versionProperty = 'version';
    const contract = buildWiringContract(ir);
    const publish = cap(contract.capabilities, 'markPublished');
    expect(publish.clientParameterNames).toEqual([]);
    expect(publish.targetsExistingInstance).toBe(true);
    expect(publish.versionField).toBe('version');

    const executor = new WiringCommandExecutor({
      baseUrl: 'https://backend.example/',
      bearerToken: 'staff-token',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: 'missing' }), { status: 400 })) as typeof fetch,
    });
    await expect(executor.execute(publish, { client: {} })).rejects.toMatchObject({
      code: 'missing_instance_identity',
    });

    let body: Record<string, unknown> = {};
    const sending = new WiringCommandExecutor({
      baseUrl: 'https://backend.example',
      bearerToken: 'staff-token',
      fetchImpl: (async (_url, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ data: null }), { status: 200 });
      }) as typeof fetch,
    });
    const outcome = await sending.execute(publish, { client: {}, docId: 'doc-9', version: 3 });
    expect(outcome).toEqual({ ok: true, data: null });
    expect(body).toEqual({ docId: 'doc-9', version: 3 });
  });

  it('does not treat a createVia-named update as the createVia id result', async () => {
    const contract = buildWiringContract(await compile(FIXTURE));
    const capture = cap(contract.capabilities, 'createViaCapture');
    expect(capture.targetsExistingInstance).toBe(false);
    expect(capture.resultKind).toBe('instance');
    expect(capture.returnTsType).toContain('_id: string');
    expect(capture.returnTsType).toContain('_creationTime: number');
    expect(capture.returnTsType).not.toContain('docId');
  });

  it('types create, an update, a createVia id, and an empty command from the dispatcher', async () => {
    const source = `
entity Task {
  property required id: string
  property title: string = ""
  property private taxId: string = ""
  property due: date = "2026-01-01"
  command create(title: string) { mutate title = title }
  command rename(title: string) returns string { mutate title = title }
  command markPublished() { mutate title = "published" }
  store Task in memory
}
entity Note {
  property required id: string
  property required body: string
  command capture(body: string) { mutate body = body }
  store Note in memory
}
command ping() { }
`;
    const contract = buildWiringContract(await compile(source));
    const create = cap(contract.capabilities, 'create');
    const rename = cap(contract.capabilities, 'rename');
    const publish = cap(contract.capabilities, 'markPublished');
    const capture = cap(contract.capabilities, 'capture');
    const ping = contract.capabilities.find((item) => item.command === 'ping');
    expect(create.resultKind).toBe('created');
    expect(create.returnTsType).toBe('{ _id: string; title: string; due: number }');
    expect(rename.resultKind).toBe('instance');
    expect(rename.returnTsType).toBe(
      '{ _id: string; _creationTime: number; title: string; due: number }',
    );
    expect(publish.returnTsType).toBe(rename.returnTsType);
    expect(capture.resultKind).toBe('allocation');
    expect(capture.returnTsType).toBe('{ docId: string }');
    expect(ping?.resultKind).toBe('empty');
    expect(ping?.returnTsType).toBe('void');
    const bindings = generateWiringBindings(contract);
    expect(bindings).toContain(
      'export type TaskCreateResult = { _id: string; title: string; due: number };',
    );
    expect(bindings).not.toContain('taxId');
    expect(bindings).not.toContain('TaskRenameResult = string');
    expect(bindings).not.toContain('returnTsType: "unknown"');
  });

  it('reads unauthorized and business-failure envelopes', async () => {
    const contract = buildWiringContract(await compile(FIXTURE));
    const create = cap(contract.capabilities, 'create');
    const responses = [
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      new Response(JSON.stringify({ error: 'Guard refused' }), { status: 400 }),
    ];
    const executor = new WiringCommandExecutor({
      baseUrl: 'https://backend.example',
      bearerToken: 'staff-token',
      fetchImpl: (async () => responses.shift()!) as typeof fetch,
    });
    const call = { client: { title: 'Dinner', dueDate: 1 } };
    await expect(executor.execute(create, call)).resolves.toMatchObject({
      ok: false,
      kind: 'unauthorized',
    });
    await expect(executor.execute(create, call)).resolves.toMatchObject({
      ok: false,
      kind: 'business_failure',
      message: 'Guard refused',
    });
  });

  it('emits transport facts into generated bindings', async () => {
    const contract = buildWiringContract(await compile(FIXTURE));
    const bindings = generateWiringBindings(contract);
    expect(bindings).toContain('export const WIRING_TRANSPORT =');
    expect(bindings).toContain('"profile": "convex-http"');
    expect(bindings).toContain('targetsExistingInstance: false');
    expect(bindings).toContain('targetsExistingInstance: true');
    expect(contract.meta.transport.profile).toBe('convex-http');
    expect(contract.meta.transport.dateWire).toBe('epoch-ms');
  });

  it('builds the same contract twice', async () => {
    const ir = await compile(FIXTURE);
    expect(JSON.stringify(buildWiringContract(ir))).toBe(JSON.stringify(buildWiringContract(ir)));
  });

  it('rejects a date that is not a time', async () => {
    const contract = buildWiringContract(await compile(FIXTURE));
    const create = cap(contract.capabilities, 'create');
    const executor = new WiringCommandExecutor({
      baseUrl: 'https://backend.example',
      bearerToken: 'staff-token',
      fetchImpl: (async () => {
        throw new Error('fetch should not run');
      }) as typeof fetch,
    });
    await expect(
      executor.execute(create, { client: { title: 'Dinner', dueDate: 'not-a-date' } }),
    ).rejects.toBeInstanceOf(WiringTransportError);
  });
});
