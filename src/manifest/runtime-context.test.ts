import { describe, it, expect } from 'vitest';
import type { RuntimeContext } from './runtime-engine';

// Type-level assertions: these lines are enforced by `npm run typecheck`,
// not by vitest (vitest strips types). They fail to compile if the typed
// fields resolve to `unknown` via the index signature instead of their
// declared narrow types.
function _typeAssertions(ctx: RuntimeContext): void {
  const _tenantId: string | undefined = ctx.tenantId;
  const _orgId: string | undefined = ctx.orgId;
  const _actorId: string | undefined = ctx.actorId;
  const _requestId: string | undefined = ctx.requestId;
  const _source: string | undefined = ctx.source;
  const _deterministic: boolean | undefined = ctx.deterministic;
  // Silence unused-var lints
  void _tenantId; void _orgId; void _actorId; void _requestId;
  void _source; void _deterministic;
}
void _typeAssertions;

describe('RuntimeContext typed fields', () => {
  it('accepts the documented typed fields with correct types', () => {
    const ctx: RuntimeContext = {
      tenantId: 'tenant_1',
      orgId: 'org_1',
      actorId: 'user_1',
      requestId: 'req_abc',
      source: 'route',
      deterministic: false,
    };
    expect(ctx.tenantId).toBe('tenant_1');
    expect(ctx.orgId).toBe('org_1');
    expect(ctx.actorId).toBe('user_1');
    expect(ctx.requestId).toBe('req_abc');
    expect(ctx.source).toBe('route');
    expect(ctx.deterministic).toBe(false);
  });

  it('still permits ad-hoc keys for backwards compatibility', () => {
    const ctx: RuntimeContext = { tenantId: 't', anything: 1, nested: { ok: true } };
    expect(ctx.anything).toBe(1);
    expect((ctx.nested as { ok: boolean }).ok).toBe(true);
  });

  it('still permits the legacy user shorthand', () => {
    const ctx: RuntimeContext = { user: { id: 'u1', role: 'admin' } };
    expect(ctx.user?.id).toBe('u1');
    expect(ctx.user?.role).toBe('admin');
  });

  it('accepts any string for source (not just the enum)', () => {
    const ctx: RuntimeContext = { source: 'custom-surface' };
    expect(ctx.source).toBe('custom-surface');
  });
});
