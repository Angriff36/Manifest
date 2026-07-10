/**
 * replace-empty-date-sentinel — proven local Date source (live PrepTask shape).
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  fileMapFromRecord,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
  applyRepairPlan,
} from './remediate-test-fixtures.js';

const PREP_DOMAIN = `
entity PrepTask {
  property required id: string
  property dishId: string = ""
  property locationId: string = ""
  property estimatedMinutes: number = 0
  property dueByTime: datetime = "2026-01-01T00:00:00.000Z"

  command updateDetails(
    dishId: string,
    locationId: string,
    estimatedMinutes: number,
    dueByTime: datetime
  ) {
    mutate dishId = dishId
    mutate locationId = locationId
    mutate estimatedMinutes = estimatedMinutes
    mutate dueByTime = dueByTime
  }

  store PrepTask in memory
}

entity Task {
  property required id: string
  property title: string = ""
  property tags: array<string> = []
  property priority: number = 1
  property dueDate: date = "2026-01-01"
  property summary: string = ""
  property completedBy: string = ""

  command create(
    title: string,
    summary: string,
    tags: array<string>,
    priority: number,
    dueDate: date,
    completedBy: string from context.actorId
  ) {
    mutate title = title
    mutate summary = summary
    mutate tags = tags
    mutate priority = priority
    mutate dueDate = dueDate
    mutate completedBy = completedBy
  }

  store Task in memory
}
`;

const ACTION_PATH =
  'apps/app/app/(authenticated)/(events)/events/actions/task-breakdown.ts';
const UI_PATH =
  'apps/app/app/(authenticated)/(events)/events/components/task-breakdown-display.tsx';

const LIVE_ACTION = `
"use server";
import { runManifestCommand } from "@/lib/manifest-command";

export async function createPrepTasks(eventDate: string, locationId: string) {
  const dueByDate = new Date(eventDate);
  dueByDate.setHours(dueByDate.getHours() - 6);
  return runManifestCommand({
    entity: "PrepTask",
    command: "updateDetails",
    body: {
      id: "task-1",
      dishId: "dish-1",
      locationId,
      estimatedMinutes: 30,
      dueByTime: "",
    },
  });
}
`;

const LIVE_UI = `
import { createPrepTasks } from "../actions/task-breakdown";

export function TaskBreakdownDisplay() {
  return (
    <button type="button" onClick={() => void createPrepTasks("2026-01-01", "loc-1")}>
      Generate
    </button>
  );
}
`;

function liveFiles(): Map<string, string> {
  return fileMapFromRecord({
    [ACTION_PATH]: LIVE_ACTION,
    [UI_PATH]: LIVE_UI,
  });
}

describe('replace-empty-date-sentinel with proven Date local', () => {
  it('1. dueByTime "" repairs from dueByDate.toISOString() when Date local exists', async () => {
    const contract = await contractFrom(PREP_DOMAIN);
    const files = liveFiles();
    const before = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      before.mismatches.some(
        m =>
          m.kind === 'invalid_date_sentinel' &&
          m.capabilityId === 'PrepTask.updateDetails' &&
          m.parameter === 'dueByTime',
      ),
    ).toBe(true);

    const plan = planWiringRepairs({
      contract,
      report: before,
      fileContents: files,
      capabilityId: 'PrepTask.updateDetails',
    }).plans.find(p => p.repairKind === 'replace-empty-date-sentinel');
    expect(plan?.automaticApplicationAllowed).toBe(true);
    expect(plan?.edits[0]?.operation).toMatchObject({
      type: 'replace-object-property-value',
      parameter: 'dueByTime',
      toExpression: 'dueByDate.toISOString()',
    });

    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'PrepTask.updateDetails',
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const content = [...applyRepairPlan(plan!, files).nextContents.values()].find(c =>
      c.includes('dueByTime'),
    )!;
    expect(content).toMatch(/dueByTime:\s*dueByDate\.toISOString\(\)/);
    expect(content).not.toMatch(/dueByTime:\s*""/);
    expect(content).toContain('estimatedMinutes: 30');
    expect(content).toContain('locationId');

    const after = inspectWiringConsumersSync({
      contract,
      fileContents: applyRepairPlan(plan!, files).nextContents,
      config: { roots: ['.'] },
    });
    expect(
      after.mismatches.some(
        m =>
          m.kind === 'invalid_date_sentinel' &&
          m.capabilityId === 'PrepTask.updateDetails' &&
          m.parameter === 'dueByTime',
      ),
    ).toBe(false);
  });

  it('2. no repair when no proven local date source exists', async () => {
    const contract = await contractFrom(PREP_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/update.tsx': `
        import { runManifestCommand } from "@/lib/manifest-command";
        export async function run() {
          await runManifestCommand({
            entity: "PrepTask",
            command: "updateDetails",
            body: { id: "1", dishId: "d", locationId: "l", estimatedMinutes: 1, dueByTime: "" },
          });
        }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'] },
      }),
      fileContents: files,
      capabilityId: 'PrepTask.updateDetails',
    }).plans.find(p => p.repairKind === 'replace-empty-date-sentinel');
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.decision).toBe('ambiguous-product-decision');
  });

  it('3. does not invent a date literal', async () => {
    const contract = await contractFrom(PREP_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/update.tsx': `
        import { runManifestCommand } from "@/lib/manifest-command";
        const notes = "later";
        export async function run() {
          await runManifestCommand({
            entity: "PrepTask",
            command: "updateDetails",
            body: { id: "1", dishId: "d", locationId: "l", estimatedMinutes: 1, dueByTime: "" },
          });
        }
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'PrepTask.updateDetails',
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(0);
    expect([...files.values()][0]).toMatch(/dueByTime:\s*""/);
  });

  it('4. idempotent second run', async () => {
    const contract = await contractFrom(PREP_DOMAIN);
    const files = liveFiles();
    const first = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'PrepTask.updateDetails',
      writeFile: (path, content) => {
        files.set(path, content);
      },
    });
    expect(first.applied.some(a => a.applied)).toBe(true);
    const second = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'PrepTask.updateDetails',
    });
    expect(second.applied.filter(a => a.applied)).toHaveLength(0);
  });

  it('5. stale source invalidates the plan', async () => {
    const contract = await contractFrom(PREP_DOMAIN);
    const files = liveFiles();
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'] },
      }),
      fileContents: files,
      capabilityId: 'PrepTask.updateDetails',
    }).plans.find(p => p.repairKind === 'replace-empty-date-sentinel')!;
    expect(plan.automaticApplicationAllowed).toBe(true);
    files.set(
      ACTION_PATH,
      LIVE_ACTION.replace('dueByTime: ""', 'dueByTime: dueByDate.toISOString()'),
    );
    const patch = applyRepairPlan(plan, files);
    const content = [...patch.nextContents.values()].find(c => c.includes('dueByTime'))!;
    expect(content).not.toMatch(/dueByTime:\s*""/);
  });

  it('6. one-defect prefers date sentinel over ambiguous unwired controls', async () => {
    const contract = await contractFrom(PREP_DOMAIN);
    const files = liveFiles();
    files.set(
      'apps/app/app/ui/unrelated.tsx',
      `
        export function Page() {
          return <button onClick={() => setFilter("x")}>Filter</button>;
        }
      `,
    );
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const applied = result.applied.find(a => a.applied)!;
    expect(applied.findingId).toMatch(/invalid_date_sentinel|PrepTask\.updateDetails|dueByTime/);
    expect(applied.findingId).not.toMatch(/wire-existing/);
  });
});
