// Regression: composite-key runtime identity must NOT overwrite the persisted
// `id` field passed to store.create().
//
// 3.3.0 introduced composite-key runtime identity and, in prepareCreateData,
// unconditionally set `mergedData.id = compositeId(entity, mergedData)` for any
// `key`-declaring entity. For the common `key [tenantId, id]` shape (where `id`
// is a REAL uuid column) this handed the store `id = "<tenantId>|<uuid>"`,
// which Postgres rejects with `invalid input syntax for type uuid`, breaking
// every generic-store create. See the fix in runtime-engine.ts prepareCreateData.

import { describe, expect, it } from "vitest";
import type { IR } from "./ir";
import { IRCompiler } from "./ir-compiler";
import {
  type EntityInstance,
  RuntimeEngine,
  type Store,
} from "./runtime-engine";

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(
      `Compilation failed: ${result.diagnostics.map((d) => d.message).join(", ")}`
    );
  }
  return result.ir;
}

/** Store that records exactly what the runtime passes to create(). */
class SpyStore implements Store<EntityInstance> {
  readonly created: EntityInstance[] = [];
  private readonly rows = new Map<string, EntityInstance>();

  async getAll(): Promise<EntityInstance[]> {
    return [...this.rows.values()];
  }
  async getById(id: string): Promise<EntityInstance | undefined> {
    return this.rows.get(id);
  }
  async create(data: Partial<EntityInstance>): Promise<EntityInstance> {
    const row = { ...data } as EntityInstance;
    this.created.push(row);
    this.rows.set(row.id, row);
    return row;
  }
  async update(
    id: string,
    data: Partial<EntityInstance>
  ): Promise<EntityInstance | undefined> {
    const existing = this.rows.get(id);
    if (!existing) {
      return;
    }
    const updated = { ...existing, ...data, id };
    this.rows.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
  async clear(): Promise<void> {
    this.rows.clear();
    this.created.length = 0;
  }
}

const UUID = "e65ba311-2caa-44b5-b628-419f645f447d";
const TENANT = "02981b1c-f9d4-454b-9766-ff2395926663";

// Mirrors the Capsule shape: tenant auto-injected from context, `key
// [tenantId, id]`, `id` is a real uuid column.
const TENANT_ID_SOURCE = `
  tenant tenantId : string from context.tenantId
  entity Notification {
    property required id: string
    property tenantId: string
    property title: string
    key [tenantId, id]
    command create(title: string) { mutate title = title }
    command rename(title: string) { mutate title = title }
  }
`;

describe("composite-key identity does not corrupt persisted id", () => {
  it("[tenantId, id]: store.create receives the bare UUID, not tenantId|id", async () => {
    const ir = await compile(TENANT_ID_SOURCE);
    const store = new SpyStore();
    const runtime = new RuntimeEngine(
      ir,
      { tenantId: TENANT },
      {
        generateId: () => UUID,
        storeProvider: (name) => (name === "Notification" ? store : undefined),
      }
    );

    const result = await runtime.runCommand(
      "create",
      { title: "hi" },
      { entityName: "Notification" }
    );

    expect(result.success).toBe(true);
    // The exact regression: the store must receive the real bare uuid.
    expect(store.created).toHaveLength(1);
    expect(store.created[0].id).toBe(UUID);
    expect(String(store.created[0].id)).not.toContain("|");
    // The real tenant key column is preserved as its own field.
    expect(store.created[0].tenantId).toBe(TENANT);
  });

  it("[tenantId, id]: read / update / delete address the row by its bare id", async () => {
    const ir = await compile(TENANT_ID_SOURCE);
    const store = new SpyStore();
    const runtime = new RuntimeEngine(
      ir,
      { tenantId: TENANT },
      {
        generateId: () => UUID,
        storeProvider: (name) => (name === "Notification" ? store : undefined),
      }
    );

    await runtime.runCommand(
      "create",
      { title: "first" },
      { entityName: "Notification" }
    );

    // read by bare id
    const read = await runtime.getInstance("Notification", UUID);
    expect(read?.id).toBe(UUID);
    expect(read?.title).toBe("first");

    // update by bare id
    const upd = await runtime.runCommand(
      "rename",
      { title: "second" },
      { entityName: "Notification", instanceId: UUID }
    );
    expect(upd.success).toBe(true);
    expect((await runtime.getInstance("Notification", UUID))?.title).toBe(
      "second"
    );

    // delete by bare id
    expect(await runtime.deleteInstance("Notification", UUID)).toBe(true);
    expect(await runtime.getInstance("Notification", UUID)).toBeUndefined();
  });

  it("single-key entity: store.create receives the bare id", async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string
        command create(title: string) { mutate title = title }
      }
    `);
    const store = new SpyStore();
    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => UUID,
        storeProvider: (name) => (name === "Todo" ? store : undefined),
      }
    );

    await runtime.runCommand("create", { title: "x" }, { entityName: "Todo" });
    expect(store.created[0].id).toBe(UUID);
    expect(String(store.created[0].id)).not.toContain("|");
  });

  it("keyless-id composite key (>2 fields) still uses the composite as its addressing handle", async () => {
    // No `id` column: `key [region, warehouseCode, slot]`. Here the composite IS
    // the only identity, so the runtime legitimately synthesizes it as `id` and
    // the entity stays addressable by that string — this must NOT regress.
    const ir = await compile(`
      entity Bin {
        property region: string required
        property warehouseCode: string required
        property slot: string required
        property label: string
        key [region, warehouseCode, slot]
        command create(region: string, warehouseCode: string, slot: string) {
          mutate region = region
          mutate warehouseCode = warehouseCode
          mutate slot = slot
        }
      }
    `);
    const store = new SpyStore();
    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => UUID,
        storeProvider: (name) => (name === "Bin" ? store : undefined),
      }
    );

    const result = await runtime.runCommand(
      "create",
      { region: "us-east", warehouseCode: "wh1", slot: "A-01" },
      { entityName: "Bin" }
    );
    expect(result.success).toBe(true);
    // Composite handle = encoded tuple, addressable via getInstance.
    expect(store.created[0].id).toBe("us-east|wh1|A-01");
    // Real key columns are still present as their own fields.
    expect(store.created[0].region).toBe("us-east");
    expect(store.created[0].warehouseCode).toBe("wh1");
    expect(store.created[0].slot).toBe("A-01");
    expect(await runtime.getInstance("Bin", "us-east|wh1|A-01")).toBeDefined();
  });
});
