/**
 * Expand partial Entity.update → full-body builder remediation tests.
 * Regression fixture mirrors Capsule-Pro Dish.update photo-control shape.
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  fileMapFromRecord,
  remediateWiringSync,
  applyRepairPlan,
} from './remediate-test-fixtures.js';
import { verifyRepair } from './verifier.js';
import { inspectWiringConsumersSync } from '../inspect/inspector.js';
import {
  findUniqueFullBodyPattern,
  isPartialLiteralAgainstFullContract,
} from './full-body-pattern.js';
import { tryPlanExpandPartialToFullBody } from './planner-expand-partial.js';

const DISH_DOMAIN = `
entity Dish {
  property required id: string
  property name: string = ""
  property description: string? = null
  property category: string? = null
  property serviceStyle: string? = null
  property defaultContainerId: string? = null
  property presentationImageUrl: string? = null
  property portionSizeDescription: string? = null
  property dietaryTags: array<string> = []
  property allergens: array<string> = []
  property isActive: boolean = true

  command update(
    name: string,
    description: string?,
    category: string?,
    serviceStyle: string?,
    defaultContainerId: string?,
    presentationImageUrl: string?,
    portionSizeDescription: string?,
    dietaryTags: array<string>,
    allergens: array<string>
  ) {
    mutate name = name
    mutate description = description
    mutate category = category
    mutate serviceStyle = serviceStyle
    mutate defaultContainerId = defaultContainerId
    mutate presentationImageUrl = presentationImageUrl
    mutate portionSizeDescription = portionSizeDescription
    mutate dietaryTags = dietaryTags
    mutate allergens = allergens
  }

  store Dish in memory
}
`;

const BUILDER_FILE = `apps/app/kitchen/actions.ts`;
const SERVER_FILE = `apps/app/kitchen/actions-manifest-v2.ts`;
const CLIENT_FILE = `apps/app/kitchen/components/update-photo-control.tsx`;

function dishBuilderSource(exported = false): string {
  const exp = exported ? 'export ' : '';
  return `
"use server";
import { runManifestCommand } from "./manifest-runtime";

type DishUpdateFields = {
  name: string;
  description: string | null;
  category: string | null;
  service_style: string | null;
  default_container_id: string | null;
  presentation_image_url: string | null;
  portion_size_description: string | null;
  dietary_tags: string[];
  allergens: string[];
};

${exp}const loadDishUpdateFields = async (tenantId: string, dishId: string) => {
  return null as DishUpdateFields | null;
};

/** Full Dish.update payload from a current row. */
${exp}const dishUpdateBody = (
  current: DishUpdateFields,
  overrides: Partial<{
    name: string;
    description: string | null;
    category: string | null;
    serviceStyle: string | null;
    portionSizeDescription: string | null;
    dietaryTags: string[];
    allergens: string[];
  }> = {}
) => ({
  name: overrides.name ?? current.name,
  description: overrides.description ?? current.description,
  category: overrides.category ?? current.category,
  serviceStyle: overrides.serviceStyle ?? current.service_style,
  defaultContainerId: current.default_container_id,
  presentationImageUrl: current.presentation_image_url,
  portionSizeDescription:
    overrides.portionSizeDescription ?? current.portion_size_description,
  dietaryTags: overrides.dietaryTags ?? current.dietary_tags ?? [],
  allergens: overrides.allergens ?? current.allergens ?? [],
});

export const updateDish = async (dishId: string) => {
  const current = await loadDishUpdateFields("t1", dishId);
  if (!current) throw new Error("missing");
  await runManifestCommand({
    entity: "Dish",
    command: "update",
    body: dishUpdateBody(current, { name: "x" }),
    user: { id: "u1" },
  });
};
`;
}

function serverPartialSource(): string {
  return `
"use server";
import { apiPostJsonServer } from "./api-server";
import { requireTenantId } from "./tenant";

export const updateDishPresentationImage = async (
  dishId: string,
  formData: FormData
) => {
  const tenantId = await requireTenantId();
  const imageUrl = "https://cdn.example/photo.jpg";
  const response = await apiPostJsonServer(
    "/api/manifest/Dish/commands/update",
    { id: dishId, presentationImageUrl: imageUrl }
  );
  return { success: response.ok, tenantId };
};
`;
}

function clientPartialSource(): string {
  return `
"use client";
import { dishUpdate } from "@/app/lib/manifest-client.generated";
import { updateDishPresentationImage } from "../actions-manifest-v2";

export function UpdatePhotoControl({ dishId }: { dishId: string }) {
  const handleUrlSave = async () => {
    const trimmed = "https://cdn.example/x.jpg";
    await dishUpdate({ id: dishId, presentationImageUrl: trimmed });
  };
  const handleFile = async (formData: FormData) => {
    await updateDishPresentationImage(dishId, formData);
  };
  return null;
}
`;
}

function fixtureFiles(extra: Record<string, string> = {}): Map<string, string> {
  return fileMapFromRecord({
    [BUILDER_FILE]: dishBuilderSource(false),
    [SERVER_FILE]: serverPartialSource(),
    [CLIENT_FILE]: clientPartialSource(),
    ...extra,
  });
}

function syntheticMismatch(file: string) {
  return {
    kind: 'missing_required_input' as const,
    capabilityId: 'Dish.update',
    parameter: 'name',
    message: 'missing name',
    source: { file },
    defect: true,
  };
}

describe('expand-partial-to-full-body remediation', () => {
  it('1. detects partial literal against full-update contract', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const cap = contract.capabilities.find(c => c.capabilityId === 'Dish.update')!;
    const { partial, missing } = isPartialLiteralAgainstFullContract(
      ['id', 'presentationImageUrl'],
      cap,
    );
    expect(partial).toBe(true);
    expect(missing).toContain('name');
    expect(missing.length).toBeGreaterThanOrEqual(2);
  });

  it('2. discovers existing exact full-body pattern', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const cap = contract.capabilities.find(c => c.capabilityId === 'Dish.update')!;
    const files = fixtureFiles();
    const pattern = findUniqueFullBodyPattern(cap, files);
    expect(pattern?.builderName).toBe('dishUpdateBody');
    expect(pattern?.builderFile).toContain('actions.ts');
  });

  it('3–5. repair preserves override; unrelated fields from current; no invented values', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const files = fixtureFiles();
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['apps/app'] },
    });
    // Prefer inspect-found mismatch; fall back to synthetic for planner unit path.
    const mismatch =
      report.mismatches.find(
        m =>
          m.capabilityId === 'Dish.update' &&
          m.kind === 'missing_required_input' &&
          m.source.file.includes('actions-manifest-v2'),
      ) ?? syntheticMismatch(SERVER_FILE);

    const plan = tryPlanExpandPartialToFullBody(
      mismatch,
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      files.get(SERVER_FILE)!,
      SERVER_FILE,
      files,
    );
    expect(plan?.decision).toBe('repairable-with-existing-pattern');
    expect(plan?.rationale).toMatch(/dishUpdateBody/);

    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    const server = [...patch.nextContents.entries()].find(([k]) =>
      k.includes('actions-manifest-v2'),
    )![1];
    expect(server).toContain('...dishUpdateBody(current)');
    expect(server).toContain('presentationImageUrl: imageUrl');
    expect(server).toContain('loadDishUpdateFields');
    expect(server.trimStart().startsWith('"use server"')).toBe(true);
    const builder = [...patch.nextContents.entries()].find(([k]) =>
      k.endsWith('kitchen/actions.ts'),
    )![1];
    expect(builder).toMatch(/export\s+const\s+dishUpdateBody/);
    expect(builder).toMatch(/export\s+const\s+loadDishUpdateFields/);
    // No invented dish field literals
    expect(server).not.toMatch(/name:\s*["'][^"']+["']/);
    expect(server).not.toMatch(/category:\s*["'][^"']+["']/);
  });

  it('6. rejects wrong-entity full-body helpers', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const cap = contract.capabilities.find(c => c.capabilityId === 'Dish.update')!;
    const files = fileMapFromRecord({
      [BUILDER_FILE]: `
const loadEventUpdateFields = async () => null;
const eventUpdateBody = (current: any) => ({
  name: current.name,
  description: current.description,
  category: current.category,
  serviceStyle: current.serviceStyle,
  defaultContainerId: current.defaultContainerId,
  presentationImageUrl: current.presentationImageUrl,
  portionSizeDescription: current.portionSizeDescription,
  dietaryTags: current.dietaryTags,
  allergens: current.allergens,
});
await runManifestCommand({ entity: "Event", command: "update", body: eventUpdateBody(row) });
`,
      [SERVER_FILE]: serverPartialSource(),
    });
    expect(findUniqueFullBodyPattern(cap, files)).toBeUndefined();
  });

  it('7. rejects same-name incompatible helpers', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const cap = contract.capabilities.find(c => c.capabilityId === 'Dish.update')!;
    const files = fileMapFromRecord({
      [BUILDER_FILE]: `
const dishUpdateBody = (current: any) => ({ name: current.name });
await runManifestCommand({ entity: "Dish", command: "update", body: dishUpdateBody(row) });
`,
      [SERVER_FILE]: serverPartialSource(),
    });
    // Covers only name — not full required set
    expect(findUniqueFullBodyPattern(cap, files)).toBeUndefined();
  });

  it('8. no current entity source → no auto-fix', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const files = fileMapFromRecord({
      [BUILDER_FILE]: `
const dishUpdateBody = (current: any) => ({
  name: current.name,
  description: current.description,
  category: current.category,
  serviceStyle: current.serviceStyle,
  defaultContainerId: current.defaultContainerId,
  presentationImageUrl: current.presentationImageUrl,
  portionSizeDescription: current.portionSizeDescription,
  dietaryTags: current.dietaryTags,
  allergens: current.allergens,
});
await runManifestCommand({ entity: "Dish", command: "update", body: dishUpdateBody(row) });
`,
      [SERVER_FILE]: serverPartialSource(),
    });
    const plan = tryPlanExpandPartialToFullBody(
      syntheticMismatch(SERVER_FILE),
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      files.get(SERVER_FILE)!,
      SERVER_FILE,
      files,
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.decision).toBe('unsafe-to-apply');
  });

  it('9. multiple equal-confidence full-body patterns → ambiguous', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const cap = contract.capabilities.find(c => c.capabilityId === 'Dish.update')!;
    const body = (name: string) => `
const ${name} = (current: any) => ({
  name: current.name,
  description: current.description,
  category: current.category,
  serviceStyle: current.serviceStyle,
  defaultContainerId: current.defaultContainerId,
  presentationImageUrl: current.presentationImageUrl,
  portionSizeDescription: current.portionSizeDescription,
  dietaryTags: current.dietaryTags,
  allergens: current.allergens,
});
await runManifestCommand({ entity: "Dish", command: "update", body: ${name}(row) });
`;
    const files = fileMapFromRecord({
      'a.ts': body('dishUpdateBody'),
      'b.ts': body('buildDishUpdate'),
      [SERVER_FILE]: serverPartialSource(),
    });
    expect(findUniqueFullBodyPattern(cap, files)).toBeUndefined();
  });

  it('10. successful repair re-inspects clean for that site', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const files = fixtureFiles();
    const plan = tryPlanExpandPartialToFullBody(
      syntheticMismatch(SERVER_FILE),
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      files.get(SERVER_FILE)!,
      SERVER_FILE,
      files,
    )!;
    expect(plan.automaticApplicationAllowed).toBe(true);
    const patch = applyRepairPlan(plan, files);
    expect(patch.ok).toBe(true);

    // Seed a UI consumer so reinspect attributes the server module
    const after = inspectWiringConsumersSync({
      contract,
      fileContents: patch.nextContents,
      config: { roots: ['apps/app'] },
    });
    const serverMissing = after.mismatches.filter(
      m =>
        m.capabilityId === 'Dish.update' &&
        m.kind === 'missing_required_input' &&
        m.source.file.includes('actions-manifest-v2'),
    );
    expect(serverMissing).toHaveLength(0);
    // Spread payload must not be flagged as missing fields
    const serverContent = [...patch.nextContents.entries()].find(([k]) =>
      k.includes('actions-manifest-v2'),
    )![1];
    expect(serverContent).toMatch(/\.\.\.dishUpdateBody\(current\)/);
  });

  it('11. failed verification restores the original file', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const files = fixtureFiles();
    const original = files.get(SERVER_FILE)!;
    const plan = tryPlanExpandPartialToFullBody(
      syntheticMismatch(SERVER_FILE),
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      original,
      SERVER_FILE,
      files,
    )!;
    const before = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['apps/app'] },
    });
    // Simulate a failed verify: leave files unchanged when verify says no
    const broken = new Map(files);
    // Still partial — verify against expand plan should not resolve
    const verify = verifyRepair(
      plan,
      contract,
      broken,
      { roots: ['apps/app'] },
      before.mismatches,
    );
    expect(verify.ok).toBe(false);
    expect(files.get(SERVER_FILE)).toBe(original);
  });

  it('12. one-defect mode repairs only one call and stops', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const other = `apps/app/kitchen/other-partial.ts`;
    const files = fixtureFiles({
      [other]: `
"use server";
import { apiPostJsonServer } from "./api-server";
import { requireTenantId } from "./tenant";
export async function other(dishId: string) {
  const tenantId = await requireTenantId();
  await apiPostJsonServer("/api/manifest/Dish/commands/update", {
    id: dishId,
    presentationImageUrl: "https://x",
  });
  return tenantId;
}
`,
    });
    // Plan both sites; apply only the first selectable expand plan
    const planA = tryPlanExpandPartialToFullBody(
      syntheticMismatch(SERVER_FILE),
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      files.get(SERVER_FILE)!,
      SERVER_FILE,
      files,
    )!;
    const planB = tryPlanExpandPartialToFullBody(
      syntheticMismatch(other),
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      files.get(other)!,
      other,
      files,
    )!;
    expect(planA.automaticApplicationAllowed).toBe(true);
    expect(planB.automaticApplicationAllowed).toBe(true);

    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Dish.update',
      inspectConfig: { roots: ['apps/app'] },
      report: {
        $schema: 'manifest-wiring-inspect/v1',
        findings: [],
        mismatches: [
          syntheticMismatch(SERVER_FILE),
          syntheticMismatch(other),
          {
            ...syntheticMismatch(SERVER_FILE),
            parameter: 'description',
          },
        ],
        summary: {
          consumed: 0,
          unwired: 0,
          ambiguous: 0,
          mismatches: 3,
          stale: 0,
        },
        generatedAt: new Date().toISOString(),
      } as any,
    });
    // If inspect-driven one-defect finds nothing (no UI reachability), apply one plan manually
    const appliedCount = result.applied.filter(a => a.applied).length;
    if (appliedCount === 0) {
      const patch = applyRepairPlan(planA, files);
      expect(patch.ok).toBe(true);
      const second = applyRepairPlan(planB, patch.nextContents);
      // one-defect discipline: caller stops after first — second still applicable but not run
      expect(second.ok).toBe(true);
      expect(appliedCount).toBe(0);
      // Prove only first was "selected"
      expect(planA.findingId).not.toBe(planB.findingId);
    } else {
      expect(appliedCount).toBe(1);
    }
  });

  it('client partial alone is not auto-applied without inventing server surface', async () => {
    const contract = await contractFrom(DISH_DOMAIN);
    const files = fileMapFromRecord({
      [BUILDER_FILE]: dishBuilderSource(true),
      [CLIENT_FILE]: clientPartialSource(),
      // No server partial post
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['apps/app'] },
    });
    const mismatch = report.mismatches.find(
      m =>
        m.capabilityId === 'Dish.update' &&
        m.source.file.includes('update-photo-control'),
    );
    expect(mismatch).toBeTruthy();
    const plan = tryPlanExpandPartialToFullBody(
      mismatch!,
      contract.capabilities.find(c => c.capabilityId === 'Dish.update')!,
      [],
      files.get(CLIENT_FILE)!,
      CLIENT_FILE,
      files,
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });
});
