/**
 * Tenant-singleton belongsTo hydration (foreignKey.fields = [tenantId]).
 *
 * Proven Capsule blocker: VendorOrder → WeeklyPurchasingConfig keyed only by
 * tenantId was incorrectly hydrated via invented purchasingConfigId + db.get.
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../ir-compiler.js';
import { planAndRenderAggregateHydration } from './aggregate-hydrate.js';
import { ConvexProjection } from './generator.js';
import { normalizeOptions } from './options.js';

const PROGRAM = `
tenant tenantId : string from context.tenantId

entity Vendor {
  property name: string = ""
}

entity PurchasingConfig {
  property tenantId: string
  property orderApprovalThresholdAmount: number? = null
  unique [tenantId]
}

entity VendorOrder {
  property tenantId: string
  property vendorId: string
  property totalAmount: number = 0
  belongsTo vendor: Vendor fields [vendorId] references [id]
  belongsTo purchasingConfig: PurchasingConfig fields [tenantId] references [tenantId]
  computed needsSpendApproval: boolean = self.purchasingConfig != null and self.purchasingConfig.orderApprovalThresholdAmount != null and self.totalAmount > self.purchasingConfig.orderApprovalThresholdAmount
  computed vendorName: string = self.vendor.name
}

store Vendor in durable
store PurchasingConfig in durable
store VendorOrder in durable
`;

describe('convex tenant-singleton belongsTo hydration', () => {
  it('hydrates tenant-singleton via tenantId index and keeps identity belongsTo on db.get', async () => {
    const { ir, diagnostics } = await compileToIR(PROGRAM);
    const errors = (diagnostics ?? []).filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(ir).not.toBeNull();

    const order = ir!.entities.find((entity) => entity.name === 'VendorOrder');
    expect(order).toBeTruthy();
    const options = normalizeOptions({});
    const planned = planAndRenderAggregateHydration(
      ir!,
      order!,
      order!.computedProperties.map((cp) => cp.expression),
      options,
      'docId',
    );

    const hydrate = planned.lines.join('\n');
    expect(planned.diagnostics).toEqual([]);

    // Tenant-singleton: declared foreignKey.fields [tenantId] → by_tenantId index.
    expect(hydrate).toContain('withIndex("by_tenantId"');
    expect(hydrate).toContain('q.eq("tenantId", __lookup)');
    expect(hydrate).toContain('.purchasingConfig = __lookup != null');
    expect(hydrate).toContain('query("purchasingConfigs")');

    // Must NOT invent or require purchasingConfigId / db.get for the singleton.
    expect(hydrate).not.toContain('purchasingConfigId');
    const purchasingBlock = hydrate.match(
      /\{\s*const __lookup[\s\S]*?\.purchasingConfig =[\s\S]*?\n\s*\}/,
    )?.[0];
    expect(purchasingBlock).toBeTruthy();
    expect(purchasingBlock).not.toContain('db.get');

    // Conventional identity belongsTo still uses db.get on the declared id field.
    expect(hydrate).toContain('const __fk = ((doc as any) as any).vendorId');
    expect(hydrate).toContain(
      '.vendor = __fk != null ? await ctx.db.get(__fk as any) : null',
    );

    const computed = new ConvexProjection().generate(ir!, { surface: 'convex.computed' });
    const code = computed.artifacts[0]!.code;
    expect(code).toContain('hydrateComputedRelationsForVendorOrder');
    expect(code).toContain('needsSpendApproval');
    expect(code).toContain('withIndex("by_tenantId"');
    expect(code).not.toContain('purchasingConfigId');
    expect(computed.diagnostics.filter((d) => d.code === 'CONVEX_BELONGS_TO_HYDRATE_NO_LOOKUP')).toEqual(
      [],
    );
  });
});
