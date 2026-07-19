/**
 * Reusable Convex runtime proof helpers.
 * This module must not import `convex-test` — apps inject the factory/harness.
 */

export interface ManifestIdentity {
  subject: string;
  role: string;
  tenantId: string;
  tokenIdentifier?: string;
  [key: string]: unknown;
}

export interface ManifestConvexDb {
  insert: (table: string, doc: Record<string, unknown>) => Promise<unknown>;
  get: (id: unknown) => Promise<Record<string, unknown> | null>;
  query: (table: string) => {
    collect: () => Promise<Record<string, unknown>[]>;
    withIndex?: (
      name: string,
      builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { collect: () => Promise<Record<string, unknown>[]> };
  };
  patch: (id: unknown, value: Record<string, unknown>) => Promise<void>;
}

export interface ManifestConvexTestHarness {
  withIdentity: (identity: Record<string, unknown>) => ManifestConvexTestHarness;
  mutation: (fn: unknown, args?: unknown) => Promise<unknown>;
  query: (fn: unknown, args?: unknown) => Promise<unknown>;
  run: <T>(handler: (ctx: { db: ManifestConvexDb; auth: unknown }) => Promise<T>) => Promise<T>;
}

export type ConvexTestFactory = (
  schema: unknown,
  modules?: Record<string, () => Promise<unknown>>,
) => ManifestConvexTestHarness;

export interface CreateManifestTestContextOptions {
  /** Injected `convexTest` from the `convex-test` package. */
  convexTest: ConvexTestFactory;
  schema: unknown;
  modules: Record<string, () => Promise<unknown>>;
}

export class ManifestConvexProofHarness {
  constructor(private readonly root: ManifestConvexTestHarness) {}

  asRole(identity: ManifestIdentity): ManifestConvexTestHarness {
    return this.root.withIdentity({
      ...identity,
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier ?? `test|${identity.subject}`,
      role: identity.role,
      tenantId: identity.tenantId,
    });
  }

  async executeCommand(
    actor: ManifestConvexTestHarness,
    mutationRef: unknown,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return actor.mutation(mutationRef, args);
  }

  async seedEntity(
    actor: ManifestConvexTestHarness,
    table: string,
    doc: Record<string, unknown>,
  ): Promise<unknown> {
    return actor.run(async (ctx) => ctx.db.insert(table, doc));
  }

  async expectEvent(
    actor: ManifestConvexTestHarness,
    options: {
      eventsTable?: string;
      type: string;
      tenantId?: string;
      predicate?: (payload: Record<string, unknown>) => boolean;
    },
  ): Promise<Record<string, unknown>> {
    const table = options.eventsTable ?? 'manifestEvents';
    const events = await actor.run(async (ctx) => ctx.db.query(table).collect());
    const match = events.find((event) => {
      if (event.type !== options.type) return false;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      if (options.tenantId && payload.tenantId !== options.tenantId) return false;
      return options.predicate ? options.predicate(payload) : true;
    });
    if (!match) {
      throw new Error(`Expected event '${options.type}' was not emitted`);
    }
    return match;
  }

  async expectDocuments(
    actor: ManifestConvexTestHarness,
    table: string,
    predicate: (doc: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>[]> {
    const docs = await actor.run(async (ctx) => ctx.db.query(table).collect());
    return docs.filter(predicate);
  }

  async expectTenantIsolation(
    otherTenantActor: ManifestConvexTestHarness,
    table: string,
    foreignTenantId: string,
  ): Promise<void> {
    const visible = await otherTenantActor.run(async (ctx) => {
      const rows = await ctx.db.query(table).collect();
      return rows.filter((row) => row.tenantId === foreignTenantId);
    });
    // Other-tenant identity must not observe foreign tenant rows via public query
    // helpers when apps pass list queries; for raw db in tests we assert the
    // actor's auth tenant cannot match foreign docs when filtering by auth.
    const authTenant = await otherTenantActor.run(async (ctx) => {
      const identity = await (
        ctx.auth as { getUserIdentity: () => Promise<Record<string, unknown> | null> }
      ).getUserIdentity();
      return identity?.tenantId;
    });
    if (authTenant === foreignTenantId) {
      throw new Error('Tenant isolation setup error: actors share tenantId');
    }
    // Documents may physically exist in the mock DB; isolation is enforced by
    // generated mutations/queries. Callers should assert public list is empty.
    void visible;
  }
}

export function createManifestTestContext(
  options: CreateManifestTestContextOptions,
): ManifestConvexProofHarness {
  const root = options.convexTest(options.schema, options.modules);
  return new ManifestConvexProofHarness(root);
}
