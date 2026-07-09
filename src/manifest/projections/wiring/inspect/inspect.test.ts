/**
 * Automatic wiring consumer inspection — focused proof cases.
 *
 * Trace forms adapted from codebase-explorer indirectUiConsumer tests.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import {
  inspectWiringConsumersSync,
  fileMapFromRecord,
} from './inspector.js';
import { WIRING_CONSUMERS_SCHEMA } from '../types.js';
import type { WiringContract } from '../types.js';
import { bracketRoutePathToRegex, dynamicRouteProbePath } from './route-helper-index.js';
import { ProductionFlowParser } from './production-flow-parser.js';
import { RouteHelperIndex } from './route-helper-index.js';
import { resolveImportPath } from './import-path-resolver.js';

async function contractFrom(source: string): Promise<WiringContract> {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter(d => d.severity === 'error');
  expect(errors, errors.map(e => e.message).join('\n')).toHaveLength(0);
  expect(ir).not.toBeNull();
  return buildWiringContract(ir!);
}

const DOMAIN = `
enum Priority { low, medium, high }

entity Task {
  property required id: string
  property status: string = "draft"
  property title: string = ""
  property tags: array<string> = []
  property priority: number = 1
  property dueDate: date = "2026-01-01"
  property completedBy: string = ""
  property summary: string = ""

  transition status from "draft" to ["published", "archived"]
  transition status from "published" to ["draft", "archived"]

  command create(
    title: string,
    summary: string,
    tags: array<string>,
    priority: number,
    dueDate: date,
    completedBy: string from context.actorId
  ) {
    constraint titleNonEmpty: length(title) >= 1 "title required"
    constraint priorityRange: between(priority, 1, 5) "priority 1-5"
    mutate title = title
    mutate summary = summary
    mutate tags = tags
    mutate priority = priority
    mutate dueDate = dueDate
    mutate completedBy = completedBy
  }

  command markPublished() {
    mutate status = "published"
  }

  command archive() {
    mutate status = "archived"
  }

  command markCompleted(completedByUserId: string from context.actorId) {
    mutate completedBy = completedByUserId
  }

  store Task in memory
}
`;

const ROUTES = `
  export const taskUpdate = (id: string): string =>
    \`/api/tasks/\${encodeURIComponent(id)}/update\`;
  export const taskCreate = (): string => "/api/tasks/create";
`;

describe('wiring inspect — consumer traces', () => {
  it('1. direct generated-client call is consumed', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-form.tsx': `
        import { taskMarkPublished } from "@/app/lib/manifest-client.generated";
        export function Form() {
          return <button onClick={() => taskMarkPublished({ id: "1" })} />;
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function taskMarkPublished(input: { id: string }) {}
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const f = report.findings.find(x => x.capabilityId === 'Task.markPublished');
    expect(f?.status).toBe('consumed');
    expect(f?.evidence[0]?.classification).toBe('generated_client');
  });

  it('2. direct executeCommand call is consumed', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "archive", { id: "1" });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'consumed',
    );
  });

  it('3. UI → server action → runManifestCommand', async () => {
    const contract = await contractFrom(DOMAIN);
    const ui = `
      import { publishTask } from "./actions";
      export function Page() {
        return <form action={publishTask} />;
      }
    `;
    const actions = `
      "use server";
      import { runManifestCommand } from "@/lib/manifest-command";
      export async function publishTask() {
        return runManifestCommand({ entity: "Task", command: "markPublished", body: { id: "1" } });
      }
    `;
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': ui,
      'apps/app/app/ui/actions.ts': actions,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const f = report.findings.find(x => x.capabilityId === 'Task.markPublished');
    expect(f?.status).toBe('consumed');
    expect(f?.evidence[0]?.classification).toBe('server_action');
    const trace = f?.evidence[0]?.trace.map(t => t.label).join(' → ') ?? '';
    expect(trace).toMatch(/page\.tsx/);
    expect(trace).toMatch(/publishTask/);
    expect(trace).toMatch(/Task\.markPublished/);
  });

  it('4. UI → API helper → dynamic route → runtime command', async () => {
    const contract = await contractFrom(DOMAIN);
    const ui = `
      import { apiFetch } from "@/app/lib/api";
      import { taskUpdate } from "@/app/lib/routes";
      export async function save(id: string) {
        await apiFetch(taskUpdate(id), { method: "POST", body: "{}" });
      }
    `;
    const handler = `
      import "./service";
      export async function POST() {}
    `;
    const service = `
      await runtime.runCommand("archive", { id: "1" }, { entityName: "Task" });
    `;
    const files = fileMapFromRecord({
      'apps/app/app/ui/edit.tsx': ui,
      'apps/app/app/lib/routes.ts': ROUTES,
      'apps/api/app/api/tasks/[id]/update/route.ts': handler,
      'apps/api/app/api/tasks/[id]/update/service.ts': service,
    });

    const routeHelpers = RouteHelperIndex.build(files);
    expect(routeHelpers.resolve('taskUpdate')).toBeDefined();
    const parser = new ProductionFlowParser(files);
    const links = parser.resolveHandlersFromUi(ui, routeHelpers);
    expect(links.length).toBe(1);

    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'consumed',
    );
  });

  it('5. UI → server action → API route → runtime command', async () => {
    const contract = await contractFrom(DOMAIN);
    const ui = `
      import { submitTask } from "./actions";
      export async function onSave() { await submitTask({ id: "1" }); }
    `;
    const actions = `
      "use server";
      import { apiFetch } from "@/app/lib/api";
      import { taskUpdate } from "@/app/lib/routes";
      export async function submitTask(input: { id: string }) {
        return apiFetch(taskUpdate(input.id), { method: "POST", body: "{}" });
      }
    `;
    const files = fileMapFromRecord({
      'apps/app/app/ui/edit.tsx': ui,
      'apps/app/app/ui/actions.ts': actions,
      'apps/app/app/lib/routes.ts': ROUTES,
      'apps/api/app/api/tasks/[id]/update/route.ts': `import "./service"; export async function POST() {}`,
      'apps/api/app/api/tasks/[id]/update/service.ts': `
        await runtime.runCommand("archive", {}, { entityName: "Task" });
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'consumed',
    );
  });

  it('6. imported helper chain', async () => {
    const contract = await contractFrom(DOMAIN);
    const ui = `
      import { archiveTask } from "./helpers";
      export function Page() {
        return <button onClick={() => archiveTask()} />;
      }
    `;
    const helpers = `
      import { executeCommand } from "@/lib/client";
      export async function archiveTask() {
        return executeCommand("Task", "archive", { id: "1" });
      }
    `;
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': ui,
      'apps/app/app/ui/helpers.ts': helpers,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'consumed',
    );
  });

  it('7. import-only action is not consumed', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `
        import { saveTask } from "./actions";
        export function Page() { return null; }
      `,
      'apps/app/app/ui/actions.ts': `
        "use server";
        import { runManifestCommand } from "@/lib/manifest-command";
        export async function saveTask() {
          return runManifestCommand({ entity: "Task", command: "archive", body: {} });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'unwired',
    );
  });

  it('8. dead/unreferenced action is not consumed', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `
        export function Page() { return <button onClick={() => refresh()} />; }
        function refresh() { return null; }
      `,
      'apps/app/app/ui/orphan-actions.ts': `
        "use server";
        import { runManifestCommand } from "@/lib/manifest-command";
        export async function orphanArchive() {
          return runManifestCommand({ entity: "Task", command: "archive", body: {} });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'unwired',
    );
  });

  it('9. generated client definition is not a consumer', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function taskArchive(input: { id: string }) {
          return executeCommand("Task", "archive", input);
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'unwired',
    );
  });
});

describe('wiring inspect — contract mismatches', () => {
  it('10. missing required payload field is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            title: "x",
            tags: [],
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'missing_required_input' && m.parameter === 'summary',
      ),
    ).toBe(true);
  });

  it('11. string vs string[] mismatch is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'wrong_input_shape' && m.parameter === 'tags',
      ),
    ).toBe(true);
  });

  it('12. invalid finite literal is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: [],
            priority: 10,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'invalid_finite_literal' && m.parameter === 'priority',
      ),
    ).toBe(true);
  });

  it('13. required date sent as "" is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: [],
            priority: 1,
            dueDate: "",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'invalid_date_sentinel' && m.parameter === 'dueDate',
      ),
    ).toBe(true);
  });

  it('14. client-supplied trusted field is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "markCompleted", {
            id: "1",
            completedByUserId: "user-from-client",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m =>
          m.kind === 'trusted_field_spoofing' && m.parameter === 'completedByUserId',
      ),
    ).toBe(true);
  });

  it('15. valid trusted-context binding is accepted', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "markCompleted", { id: "1" });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.filter(m => m.capabilityId === 'Task.markCompleted'),
    ).toHaveLength(0);
    expect(
      report.findings.find(x => x.capabilityId === 'Task.markCompleted')?.status,
    ).toBe('consumed');
  });

  it('15b. ES property shorthand is not reported as missing required input', async () => {
    const packagingDomain = `
entity RecipeVersion {
  property required id: string
  property dropOffNotes: string = ""
  property bringHotNotes: string = ""
  property cookOnSiteNotes: string = ""

  command setPackaging(dropOff: string, bringHot: string, cookOnSite: string) {
    mutate dropOffNotes = dropOff
    mutate bringHotNotes = bringHot
    mutate cookOnSiteNotes = cookOnSite
  }

  store RecipeVersion in memory
}
`;
    const contract = await contractFrom(packagingDomain);
    const files = fileMapFromRecord({
      'apps/app/app/(authenticated)/(operations)/kitchen/recipes/[recipeId]/components/recipe-packaging-editor.tsx': `
        import { recipeVersionSetPackaging } from "@/app/lib/manifest-client.generated";
        export async function save(recipeVersionId: string, dropOff: string, bringHot: string, cookOnSite: string) {
          await recipeVersionSetPackaging({
            id: recipeVersionId,
            dropOff,
            bringHot,
            cookOnSite,
          });
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function recipeVersionSetPackaging(input: Record<string, unknown>) {}
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const packagingMismatches = report.mismatches.filter(
      m => m.capabilityId === 'RecipeVersion.setPackaging',
    );
    expect(
      packagingMismatches.filter(
        m =>
          m.kind === 'missing_required_input' &&
          (m.parameter === 'dropOff' ||
            m.parameter === 'bringHot' ||
            m.parameter === 'cookOnSite'),
      ),
    ).toHaveLength(0);
    expect(
      report.findings.find(x => x.capabilityId === 'RecipeVersion.setPackaging')
        ?.status,
    ).toBe('consumed');
  });

  it('16. stale command reference is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "oldCommand", { id: "1" });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.findings.some(
        f => f.status === 'stale-consumer' && f.capabilityId === 'Task.oldCommand',
      ),
    ).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('17. unwired command is reported', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `export function Page() { return null; }`,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'], strictCoverage: true },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'unwired',
    );
    expect(report.ok).toBe(false);
  });

  it('18. backend-only override suppresses unwired defect', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `export function Page() { return null; }`,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: {
        roots: ['.'],
        strictCoverage: true,
        overrides: {
          $schema: WIRING_CONSUMERS_SCHEMA,
          consumers: contract.capabilities.map(c => ({
            capabilityId: c.capabilityId,
            disposition: 'backend-only' as const,
          })),
        },
      },
    });
    expect(report.findings.every(f => f.status === 'backend-only')).toBe(true);
    expect(report.ok).toBe(true);
  });

  it('19. deferred override suppresses unwired defect', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `export function Page() { return null; }`,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: {
        roots: ['.'],
        strictCoverage: true,
        overrides: {
          $schema: WIRING_CONSUMERS_SCHEMA,
          consumers: [
            { capabilityId: 'Task.archive', disposition: 'deferred' },
            { capabilityId: 'Task.create', disposition: 'deferred' },
            { capabilityId: 'Task.markPublished', disposition: 'deferred' },
            { capabilityId: 'Task.markCompleted', disposition: 'deferred' },
          ],
        },
      },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'deferred',
    );
    expect(report.ok).toBe(true);
  });

  it('20. ambiguous trace does not become a false proven defect', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `
        import { mysteryHelper } from "@/external/unknown-package";
        export function Page() {
          return <button onClick={() => mysteryHelper()} />;
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.unresolved.length).toBeGreaterThan(0);
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'unwired',
    );
    // ambiguous must not fail the gate by default
    expect(report.ok).toBe(true);
  });

  it('21. dynamic Next.js [id] route resolution works', () => {
    const re = bracketRoutePathToRegex('/api/tasks/[id]/update');
    expect(re.test('/api/tasks/abc/update')).toBe(true);
    expect(re.test('/api/tasks/abc/other')).toBe(false);
    expect(dynamicRouteProbePath('/api/tasks/[id]/update')).toBe(
      '/api/tasks/__probe__/update',
    );
    expect(dynamicRouteProbePath('/api/tasks/[id]/update')).not.toMatch(/\[/);
  });

  it('22. test/generated/doc files do not count as product consumers', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/__tests__/task.test.tsx': `
        import { executeCommand } from "@/lib/client";
        await executeCommand("Task", "archive", { id: "1" });
      `,
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function taskArchive() {
          return executeCommand("Task", "archive", {});
        }
      `,
      'docs/examples/task.mdx': `
        executeCommand("Task", "archive", {})
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(report.findings.find(x => x.capabilityId === 'Task.archive')?.status).toBe(
      'unwired',
    );
  });

  it('23. FilePathIndex resolves @/ and relative imports without linear scan', () => {
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `import { x } from "@/app/lib/helpers";`,
      'apps/app/app/lib/helpers.ts': `export const x = 1;`,
      'apps/app/app/ui/nested/child.tsx': `import { y } from "../sibling";`,
      'apps/app/app/ui/sibling.ts': `export const y = 2;`,
    });
    expect(
      resolveImportPath(
        'apps/app/app/ui/page.tsx',
        '@/app/lib/helpers',
        files,
        false,
      ),
    ).toBe('apps/app/app/lib/helpers.ts');
    expect(
      resolveImportPath(
        'apps/app/app/ui/nested/child.tsx',
        '../sibling',
        files,
        false,
      ),
    ).toBe('apps/app/app/ui/sibling.ts');
  });
});
