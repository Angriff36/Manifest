import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import { DispatcherErrorText } from './dispatcher-error-text.js';
import { WiringCommandExecutor } from './command-executor.js';

const WRAPPED_GUARD = `[CONVEX M(mutations:Ingredient_createViaIntroduce)] [Request ID: a95c55eb16003c2d] Server Error
Uncaught Error: Guard 0 failed
Called by client`;

const REDACTED = '[CONVEX Q(queries:getEvent)] [Request ID: abc] Server Error Called by client';

const SOURCE = `
entity Task {
  property required id: string
  property title: string = ""
  versionProperty version: number
  default policy cookCanPublish execute: context.actorId != null "Only a cook can publish"
  command publish() {
    guard self.title != ""
    constraint titleRequired:block self.title != "" "Title is empty"
    mutate title = "published"
  }
  store Task in memory
}
`;

describe('DispatcherErrorText', () => {
  it('keeps a bare thrown line', () => {
    expect(DispatcherErrorText.thrownLine('Guard 0 failed')).toBe('Guard 0 failed');
  });

  it('unwraps the Convex server-error wrapper', () => {
    expect(DispatcherErrorText.thrownLine(WRAPPED_GUARD)).toBe('Guard 0 failed');
    expect(
      DispatcherErrorText.thrownLine(
        '[Request ID: abc] Server Error: Uncaught Error: Could not verify OIDC token claim',
      ),
    ).toBe('Could not verify OIDC token claim');
  });

  it('finds no thrown line in a production-redacted body', () => {
    expect(DispatcherErrorText.thrownLine(REDACTED)).toBe('');
  });
});

describe('wrapped dispatcher failures', () => {
  it('classifies the thrown line inside a Convex wrapper', async () => {
    const { ir, diagnostics } = await compileToIR(SOURCE);
    expect(diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0);
    const contract = buildWiringContract(ir!);
    const publish = contract.capabilities.find((item) => item.command === 'publish');
    expect(publish).toBeDefined();
    const responses = [
      new Response(JSON.stringify({ error: WRAPPED_GUARD }), { status: 400 }),
      new Response(
        JSON.stringify({
          error: `[CONVEX M(mutations:Task_publish)] [Request ID: abc] Server Error
Uncaught Error: ConcurrencyConflict: VERSION_MISMATCH expected 1 actual 2
Called by client`,
        }),
        { status: 400 },
      ),
      new Response(JSON.stringify({ error: REDACTED }), { status: 400 }),
      new Response(JSON.stringify({ error: 'Guard 0 failed' }), { status: 400 }),
    ];
    const executor = new WiringCommandExecutor({
      baseUrl: 'https://backend.example',
      bearerToken: 'staff-token',
      fetchImpl: (async () => responses.shift()!) as typeof fetch,
    });
    const call = { client: {}, docId: 'doc-1', version: 1 };
    await expect(executor.execute(publish!, call)).resolves.toMatchObject({
      kind: 'guard_failure',
      message: 'Guard 0 failed',
    });
    await expect(executor.execute(publish!, call)).resolves.toMatchObject({
      kind: 'concurrency_conflict',
      message: 'ConcurrencyConflict: VERSION_MISMATCH expected 1 actual 2',
    });
    await expect(executor.execute(publish!, call)).resolves.toMatchObject({
      kind: 'business_failure',
      message: REDACTED,
    });
    await expect(executor.execute(publish!, call)).resolves.toMatchObject({
      kind: 'guard_failure',
      message: 'Guard 0 failed',
    });
  });
});
