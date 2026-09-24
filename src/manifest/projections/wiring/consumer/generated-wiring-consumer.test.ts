import { describe, expect, it } from 'vitest';
import { GeneratedWiringConsumer as PublicWiringConsumer } from '../index.js';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import { WiringCommandExecutor } from '../transport/command-executor.js';

const SOURCE = `
entity Order {
  property required id: string
  property title: string = ""
  property completedBy: string = ""
  hasMany invoices: Invoice
  command create(title: string, completedBy: string from context.actorId) {
    mutate title = title
    mutate completedBy = completedBy
  }
  command publish() {
    guard self.title != ""
    mutate title = self.title
  }
  private command syncStock() {}
  store Order in durable
}
entity Invoice {
  property required id: string
  property orderId: string = ""
  belongsTo order: Order
  command record() {}
  store Invoice in durable
}
`;

async function compile() {
  const { ir, diagnostics } = await compileToIR(SOURCE);
  const errors = diagnostics.filter((item) => item.severity === 'error');
  expect(errors, errors.map((item) => item.message).join('\n')).toHaveLength(0);
  return buildWiringContract(ir!);
}

function consumerFor(
  contract: Awaited<ReturnType<typeof compile>>,
  respond: (url: string, body: Record<string, unknown>) => Response,
) {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const executor = new WiringCommandExecutor({
    baseUrl: 'https://backend.example',
    bearerToken: 'staff-token',
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      seen.push({ url: String(url), body });
      return respond(String(url), body);
    }) as typeof fetch,
  });
  return { consumer: new PublicWiringConsumer(contract, executor), seen };
}

function ok(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

describe('generated wiring consumer', () => {
  it('sends a parameterized create without the trusted field', async () => {
    const contract = await compile();
    const create = contract.capabilities.find((item) => item.capabilityId === 'Order.create')!;
    const { consumer, seen } = consumerFor(contract, () => ok({ _id: 'order-1', title: 'Soup' }));
    const outcome = await consumer.execute<{ _id: string }>('Order.create', {
      client: { title: 'Soup', completedBy: 'spoofed' },
    });
    expect(create.resultKind).toBe('created');
    expect(outcome).toEqual({ ok: true, data: { _id: 'order-1', title: 'Soup' } });
    expect(seen[0]?.url).toBe(`https://backend.example${create.route}`);
    expect(seen[0]?.body.title).toBe('Soup');
    expect(seen[0]?.body.completedBy).toBeUndefined();
    expect(seen[0]?.body.docId).toBeUndefined();
  });

  it('sends a zero-parameter instance command with the record id', async () => {
    const contract = await compile();
    const publish = contract.capabilities.find((item) => item.capabilityId === 'Order.publish')!;
    expect(publish.clientParameterNames).toEqual([]);
    expect(publish.targetsExistingInstance).toBe(true);
    const { consumer, seen } = consumerFor(contract, () => ok({ _id: 'order-1' }));
    await consumer.execute('Order.publish', { client: {}, docId: 'order-1' });
    expect(seen[0]?.url).toBe(`https://backend.example${publish.route}`);
    expect(seen[0]?.body).toEqual({ docId: 'order-1' });
  });

  it('reads a guard failure from the command rules', async () => {
    const contract = await compile();
    const publish = contract.capabilities.find((item) => item.capabilityId === 'Order.publish')!;
    expect(publish.resultStates.errors).toContain('guard_failure');
    const { consumer } = consumerFor(
      contract,
      () => new Response(JSON.stringify({ error: 'Guard 0 failed' }), { status: 400 }),
    );
    const outcome = await consumer.execute('Order.publish', { client: {}, docId: 'order-1' });
    expect(outcome).toMatchObject({ ok: false, kind: 'guard_failure', message: 'Guard 0 failed' });
  });

  it('marks the related record list stale and offers the generated read', async () => {
    const contract = await compile();
    const { consumer } = consumerFor(contract, () => ok({}));
    expect(consumer.staleReadIds('Order.create')).toEqual([
      'Order.list',
      'Order.get',
      'Invoice.list',
      'Invoice.get',
    ]);
    expect(consumer.read('Invoice.list').kind).toBe('list');
  });

  it('offers the person-facing action and still runs the private one', async () => {
    const contract = await compile();
    const { consumer, seen } = consumerFor(contract, () => ok({ _id: 'order-1' }));
    const offered = consumer.offeredActions().map((action) => action.capabilityId);
    expect(offered).toContain('Order.create');
    expect(offered).not.toContain('Order.syncStock');
    expect(consumer.command('Order.syncStock').presentation.exposure).toBe('internal');
    expect(consumer.command('Order.syncStock').dispatchable).toBe(true);
    const outcome = await consumer.execute('Order.syncStock', {
      client: {},
      docId: 'order-1',
    });
    expect(outcome.ok).toBe(true);
    expect(seen[0]?.url).toContain(consumer.command('Order.syncStock').route);
  });
});
