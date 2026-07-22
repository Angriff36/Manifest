/**
 * Proof: Express / Hono / SvelteKit / Remix read `ir.tenant.property` when
 * options omit `tenantIdProperty` (closes COMPLIANCE_MATRIX web-projection gap).
 */
import { describe, expect, it } from 'vitest';
import { compileToIR } from '../ir-compiler.js';
import { ExpressProjection } from './express/generator.js';
import { HonoProjection } from './hono/generator.js';
import { SvelteKitProjection } from './sveltekit/generator.js';
import { RemixProjection } from './remix/generator.js';

const TENANT_SOURCE = `
  tenant orgId: string from context.orgId
  entity Recipe {
    property id: string
    property name: string
    property orgId: string
    command rename(name: string) {
      mutate name = name
    }
  }
`;

describe('web projections read ir.tenant', () => {
  it('Express router uses orgId from IR without options', async () => {
    const { ir, diagnostics } = await compileToIR(TENANT_SOURCE);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir?.tenant?.property).toBe('orgId');
    const code =
      new ExpressProjection().generate(ir!, { surface: 'express.router' }).artifacts[0]?.code ?? '';
    expect(code).toContain('orgId');
    expect(code).not.toMatch(/\btenantId\b/);
  });

  it('Hono router uses orgId from IR without options', async () => {
    const { ir, diagnostics } = await compileToIR(TENANT_SOURCE);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const code =
      new HonoProjection().generate(ir!, { surface: 'hono.router' }).artifacts[0]?.code ?? '';
    expect(code).toContain('orgId');
    expect(code).not.toMatch(/\btenantId\b/);
  });

  it('SvelteKit server uses orgId from IR without options', async () => {
    const { ir, diagnostics } = await compileToIR(TENANT_SOURCE);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const code =
      new SvelteKitProjection().generate(ir!, {
        surface: 'sveltekit.server',
        entity: 'Recipe',
      }).artifacts[0]?.code ?? '';
    expect(code).toContain('orgId');
  });

  it('Remix list route uses orgId from IR without options', async () => {
    const { ir, diagnostics } = await compileToIR(TENANT_SOURCE);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const code =
      new RemixProjection().generate(ir!, {
        surface: 'remix.list',
        entity: 'Recipe',
      }).artifacts[0]?.code ?? '';
    expect(code).toContain('orgId');
  });

  it('explicit tenantIdProperty still wins over ir.tenant', async () => {
    const { ir } = await compileToIR(TENANT_SOURCE);
    const code =
      new ExpressProjection().generate(ir!, {
        surface: 'express.router',
        options: { tenantIdProperty: 'customTenant' },
      }).artifacts[0]?.code ?? '';
    expect(code).toContain('customTenant');
    expect(code).not.toContain('orgId');
  });
});
