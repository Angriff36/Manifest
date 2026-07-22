import { describe, expect, it } from 'vitest';
import type { IR, IREntity, IRProperty, IRStore } from '../../ir';
import { ConvexProjection } from './generator.js';
import { generateMutations } from './functions.js';
import { collectUnsupportedDiagnostics } from './capabilities.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

function durable(name: string): IRStore {
  return { entity: name, target: 'durable', config: {} };
}

function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = []): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers };
}

function entity(name: string, props: IRProperty[]): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function rateLimitedIR(scope: 'user' | 'tenant' | 'global' = 'global'): IR {
  const ir = emptyIR();
  ir.entities = [entity('Order', [prop('status', 'string', ['required']), prop('orgId', 'string')])];
  ir.stores = [durable('Order')];
  if (scope === 'tenant') {
    ir.tenant = { property: 'orgId', type: { name: 'string', nullable: false }, contextPath: 'context.tenantId' };
  }
  ir.commands = [
    {
      name: 'advance',
      entity: 'Order',
      parameters: [],
      guards: [],
      rateLimit: {
        maxRequests: 5,
        windowMs: 60_000,
        scope,
        burstAllowance: 1,
      },
      actions: [
        {
          kind: 'mutate',
          target: 'status',
          expression: { kind: 'literal', value: { kind: 'string', value: 'submitted' } },
        },
      ],
      emits: [],
    },
  ];
  return ir;
}

describe('convex command rateLimit emit', () => {
  it('emits commandRateLimitBuckets table when a command declares rateLimit', () => {
    const result = new ConvexProjection().generate(rateLimitedIR(), { surface: 'convex.schema' });
    const code = result.artifacts[0]?.code ?? '';
    expect(code).toContain('commandRateLimitBuckets');
    expect(code).toContain('by_scopeKey');
  });

  it('does not emit rate-limit table when no command or policy has rateLimit', () => {
    const ir = rateLimitedIR();
    delete ir.commands[0]!.rateLimit;
    const result = new ConvexProjection().generate(ir, { surface: 'convex.schema' });
    expect(result.artifacts[0]?.code).not.toContain('commandRateLimitBuckets');
  });

  it('emits rate-limit table when only a write policy declares rateLimit', () => {
    const ir = rateLimitedIR();
    delete ir.commands[0]!.rateLimit;
    ir.commands[0]!.policies = ['ThrottleWrite'];
    ir.policies = [
      {
        name: 'ThrottleWrite',
        action: 'write',
        entity: 'Order',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        rateLimit: { maxRequests: 5, windowMs: 60_000, scope: 'global' },
      },
    ];
    const result = new ConvexProjection().generate(ir, { surface: 'convex.schema' });
    expect(result.artifacts[0]?.code).toContain('commandRateLimitBuckets');
  });

  it('emits consume helper and check before guards for global scope', () => {
    const code = generateMutations(rateLimitedIR('global'), {
      enableCommandIdempotency: false,
    }).code;
    expect(code).toContain('__consumeCommandRateLimit');
    expect(code).toContain('":global"');
    expect(code).toContain('await __consumeCommandRateLimit(ctx, __rlScopeKey, 5, 60000, 1)');
    expect(code).not.toMatch(/CONVEX_UNSUPPORTED_RATE_LIMIT/);
  });

  it('forces auth binding for user-scoped rateLimit', () => {
    const code = generateMutations(rateLimitedIR('user'), {
      authContextImport: './lib/authContext',
      enableCommandIdempotency: false,
    }).code;
    expect(code).toContain('getAuthContext');
    expect(code).toContain('unresolved user scope');
    expect(code).toContain('":user:"');
  });

  it('no longer emits CONVEX_UNSUPPORTED_RATE_LIMIT for commands', () => {
    const diags = collectUnsupportedDiagnostics(rateLimitedIR('global'));
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_RATE_LIMIT')).toBe(false);
  });

  it('does not warn for write policy rateLimit (emitted on mutations)', () => {
    const ir = emptyIR();
    ir.policies = [
      {
        name: 'ThrottleWrite',
        action: 'write',
        entity: 'Order',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        rateLimit: { maxRequests: 10, windowMs: 1000, scope: 'global' },
      },
    ];
    const diags = collectUnsupportedDiagnostics(ir);
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_RATE_LIMIT')).toBe(false);
  });

  it('still warns for read policy rateLimit', () => {
    const ir = emptyIR();
    ir.policies = [
      {
        name: 'ThrottleRead',
        action: 'read',
        entity: 'Order',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        rateLimit: { maxRequests: 10, windowMs: 1000, scope: 'global' },
      },
    ];
    const diags = collectUnsupportedDiagnostics(ir);
    expect(diags.some((d) => d.code === 'CONVEX_UNSUPPORTED_RATE_LIMIT')).toBe(true);
  });

  it('emits policy rateLimit consume before policy expression on mutations', () => {
    const ir = rateLimitedIR('global');
    delete ir.commands[0]!.rateLimit;
    ir.commands[0]!.policies = ['ThrottleWrite'];
    ir.policies = [
      {
        name: 'ThrottleWrite',
        action: 'write',
        entity: 'Order',
        expression: { kind: 'literal', value: { kind: 'boolean', value: true } },
        rateLimit: { maxRequests: 5, windowMs: 60_000, scope: 'global' },
      },
    ];
    const code = generateMutations(ir, {
      enableCommandIdempotency: false,
    }).code;
    expect(code).toContain('__consumeCommandRateLimit');
    expect(code).toContain('"policy:ThrottleWrite"');
    expect(code).toContain('__consumeCommandRateLimit(ctx, __rlScopeKey, 5, 60000, 0)');
  });
});
