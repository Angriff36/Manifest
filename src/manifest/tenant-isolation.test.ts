import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';
import type { IR } from './ir';
import { COMPILER_VERSION } from './version';

describe('Tenant isolation — lexer', () => {
  it('tokenizes "tenant" as a keyword', () => {
    const lexer = new Lexer('tenant');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe('KEYWORD');
    expect(tokens[0].value).toBe('tenant');
  });
});

describe('Tenant isolation — parser', () => {
  it('parses a tenant declaration', () => {
    const parser = new Parser();
    const { program, errors } = parser.parse('tenant tenantId : string from context.tenantId');
    expect(errors).toHaveLength(0);
    expect(program.tenant).toBeDefined();
    expect(program.tenant!.property).toBe('tenantId');
    expect(program.tenant!.dataType.name).toBe('string');
    expect(program.tenant!.contextPath).toBe('context.tenantId');
  });

  it('rejects duplicate tenant declarations', () => {
    const parser = new Parser();
    const { errors } = parser.parse(
      [
        'tenant tenantId : string from context.tenantId',
        'tenant orgId : string from context.orgId',
      ].join('\n'),
    );
    expect(errors.some((e) => e.message.includes('Duplicate tenant declaration'))).toBe(true);
  });

  it('parses tenant alongside entities', () => {
    const parser = new Parser();
    const { program, errors } = parser.parse(
      [
        'tenant tenantId : string from context.tenantId',
        '',
        'entity Foo {',
        '  property required id: string',
        '}',
      ].join('\n'),
    );
    expect(errors).toHaveLength(0);
    expect(program.tenant).toBeDefined();
    expect(program.entities).toHaveLength(1);
  });
});

describe('Tenant isolation — IR compiler', () => {
  it('compiles tenant declaration to IR', async () => {
    const source = [
      'tenant tenantId : string from context.tenantId',
      '',
      'entity Foo {',
      '  property required id: string',
      '}',
    ].join('\n');

    const { ir, diagnostics } = await compileToIR(source);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(ir).not.toBeNull();
    expect(ir!.tenant).toBeDefined();
    expect(ir!.tenant!.property).toBe('tenantId');
    expect(ir!.tenant!.type.name).toBe('string');
    expect(ir!.tenant!.contextPath).toBe('context.tenantId');
  });

  it('omits tenant from IR when not declared', async () => {
    const source = ['entity Foo {', '  property required id: string', '}'].join('\n');

    const { ir } = await compileToIR(source);
    expect(ir).not.toBeNull();
    expect(ir!.tenant).toBeUndefined();
  });
});

function buildTenantIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test',
      compilerVersion: COMPILER_VERSION,
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    tenant: {
      property: 'tenantId',
      type: { name: 'string', nullable: false },
      contextPath: 'context.tenantId',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Invoice',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
          { name: 'amount', type: { name: 'number', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: ['createInvoice'],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [
      {
        name: 'createInvoice',
        entity: 'Invoice',
        parameters: [{ name: 'amount', type: { name: 'number', nullable: false }, required: true }],
        guards: [],
        actions: [
          { kind: 'mutate', target: 'amount', expression: { kind: 'identifier', name: 'amount' } },
        ],
        emits: [],
      },
    ],
    policies: [],
  };
}

describe('Tenant isolation — runtime engine', () => {
  describe('fail-closed gate', () => {
    it('rejects commands when IR has tenant config but context lacks tenantId', async () => {
      const ir = buildTenantIR();
      const rt = new RuntimeEngine(ir, {}, {});
      const result = await rt.runCommand(
        'createInvoice',
        { amount: 100 },
        { entityName: 'Invoice' },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('MISSING_TENANT_CONTEXT');
    });

    it('allows commands when tenant context is provided', async () => {
      const ir = buildTenantIR();
      const rt = new RuntimeEngine(ir, { tenantId: 'tenant-a' }, {});
      const result = await rt.runCommand(
        'createInvoice',
        { amount: 100 },
        { entityName: 'Invoice' },
      );
      expect(result.success).toBe(true);
    });
  });

  describe('auto-injection on writes', () => {
    it('injects tenantId into created instances', async () => {
      const ir = buildTenantIR();
      const rt = new RuntimeEngine(ir, { tenantId: 'tenant-a' }, {});
      const instance = await rt.createInstance('Invoice', { id: 'inv-1', amount: 50 });
      expect(instance).toBeDefined();
      expect(instance!.tenantId).toBe('tenant-a');
    });
  });

  describe('tenant-scoped reads', () => {
    it('getAllInstances filters by active tenant', async () => {
      const ir = buildTenantIR();

      const rtA = new RuntimeEngine(ir, { tenantId: 'tenant-a' }, {});
      await rtA.createInstance('Invoice', { id: 'inv-a1', amount: 100 });
      await rtA.createInstance('Invoice', { id: 'inv-a2', amount: 200 });

      const store = rtA.getStore('Invoice');
      expect(store).toBeDefined();
      await store!.create({ id: 'inv-b1', amount: 300, tenantId: 'tenant-b' });

      const allForA = await rtA.getAllInstances('Invoice');
      expect(allForA).toHaveLength(2);
      expect(allForA.every((i) => i.tenantId === 'tenant-a')).toBe(true);
    });

    it('getInstance rejects cross-tenant access', async () => {
      const ir = buildTenantIR();
      const rtA = new RuntimeEngine(ir, { tenantId: 'tenant-a' }, {});
      await rtA.createInstance('Invoice', { id: 'inv-a1', amount: 100 });

      const store = rtA.getStore('Invoice');
      await store!.create({ id: 'inv-b1', amount: 300, tenantId: 'tenant-b' });

      const result = await rtA.getInstance('Invoice', 'inv-b1');
      expect(result).toBeUndefined();

      const own = await rtA.getInstance('Invoice', 'inv-a1');
      expect(own).toBeDefined();
      expect(own!.tenantId).toBe('tenant-a');
    });
  });

  describe('backwards compatibility', () => {
    it('no tenant config means no tenant filtering', async () => {
      const ir: IR = {
        ...buildTenantIR(),
        tenant: undefined,
      };
      const rt = new RuntimeEngine(ir, {}, {});
      await rt.createInstance('Invoice', { id: 'inv-1', amount: 100 });
      const all = await rt.getAllInstances('Invoice');
      expect(all).toHaveLength(1);
      expect(all[0].tenantId).toBeUndefined();
    });
  });
});
