/**
 * Product wiring projection — focused tests for the required contract cases.
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../ir-compiler.js';
import { getProjection } from '../registry.js';
import { generateWiringBindings } from './bindings-generator.js';
import { buildWiringContract } from './contract-builder.js';
import { parseConsumersRegistry, validateWiringCoverage } from './coverage.js';
import { WiringProjection } from './generator.js';
import type { WiringConsumersRegistry, WiringContract } from './types.js';
import { WIRING_CONSUMERS_SCHEMA } from './types.js';

async function compile(source: string) {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  expect(errors, errors.map((e) => e.message).join('\n')).toHaveLength(0);
  expect(ir).not.toBeNull();
  return ir!;
}

function findCap(contract: WiringContract, entity: string, command: string) {
  const cap = contract.capabilities.find((c) => c.entity === entity && c.command === command);
  expect(cap, `missing ${entity}.${command}`).toBeDefined();
  return cap!;
}

const FIXTURE = `
enum Priority { low, medium, high }

entity Task {
  property required id: string
  property status: string = "draft"
  property title: string = ""
  property tags: array<string> = []
  property priority: number = 1
  property dueDate: date = "2026-01-01"
  property completedBy: string = ""

  transition status from "draft" to ["published", "archived"]
  transition status from "published" to ["archived"]

  command create(
    title: string,
    optional notes: string,
    tags: array<string>,
    priority: number,
    dueDate: date,
    completedBy: string from context.actorId,
    channel: string = "web"
  ) {
    constraint titleNonEmpty: length(title) >= 1 "title required"
    constraint priorityRange: between(priority, 1, 5) "priority 1-5"
    mutate title = title
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

  store Task in memory
}
`;

describe('WiringProjection', () => {
  const projection = new WiringProjection();

  it('is registered as a built-in projection', () => {
    const p = getProjection('wiring');
    expect(p).toBeDefined();
    expect(p!.name).toBe('wiring');
    expect(p!.surfaces).toContain('wiring.contract');
    expect(p!.surfaces).toContain('wiring.bindings');
  });

  it('emits contract + bindings on wiring.all', async () => {
    const ir = await compile(FIXTURE);
    const result = projection.generate(ir, { surface: 'wiring.all' });
    expect(result.artifacts.map((a) => a.id).sort()).toEqual([
      'wiring-bindings',
      'wiring-contract',
    ]);
    const contract = JSON.parse(
      result.artifacts.find((a) => a.id === 'wiring-contract')!.code,
    ) as WiringContract;
    expect(contract.$schema).toBe('manifest-wiring-contract/v1');
    expect(contract.capabilities.length).toBeGreaterThan(0);
  });

  describe('input contract fidelity', () => {
    it('1. array<string> produces client input of string[]', async () => {
      const ir = await compile(FIXTURE);
      const contract = buildWiringContract(ir);
      const create = findCap(contract, 'Task', 'create');
      const tags = create.parameters.find((p) => p.name === 'tags')!;
      expect(tags.tsType).toBe('string[]');
      expect(tags.arrayElementType).toBe('string');
      expect(tags.ownership).toBe('client');
      const bindings = generateWiringBindings(contract);
      expect(bindings).toMatch(/tags:\s*string\[\]/);
    });

    it('2. required parameter remains required', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const title = create.parameters.find((p) => p.name === 'title')!;
      expect(title.required).toBe(true);
      expect(create.clientParameterNames).toContain('title');
    });

    it('3. optional parameter remains optional', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const notes = create.parameters.find((p) => p.name === 'notes')!;
      expect(notes.required).toBe(false);
      const bindings = generateWiringBindings(buildWiringContract(ir));
      expect(bindings).toMatch(/notes\?:\s*string/);
    });

    it('3b. defaulted parameter is not a client obligation', async () => {
      // The engine applies defaultValue before the required check fails closed,
      // so a defaulted param must not be reported as required client input.
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const channel = create.parameters.find((p) => p.name === 'channel')!;
      expect(channel.required).toBe(false);
    });

    it('4. finite enum values are preserved', async () => {
      const source = `
enum Status { draft, published, archived }
entity Item {
  property required id: string
  property status: Status = "draft"
  command setStatus(status: Status) {
    mutate status = status
  }
  store Item in memory
}
`;
      const ir = await compile(source);
      const cap = findCap(buildWiringContract(ir), 'Item', 'setStatus');
      const status = cap.parameters.find((p) => p.name === 'status')!;
      expect(status.constraints.enumValues).toEqual(['draft', 'published', 'archived']);
      expect(status.tsType).toContain('"draft"');
      expect(status.tsType).toContain('"published"');
    });

    it('5. statically derivable numeric bounds are exposed', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const priority = create.parameters.find((p) => p.name === 'priority')!;
      expect(priority.constraints.min).toBe(1);
      expect(priority.constraints.max).toBe(5);
    });

    it('6. non-empty constraint is exposed when statically derivable', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const title = create.parameters.find((p) => p.name === 'title')!;
      expect(title.constraints.nonEmpty).toBe(true);
      expect(title.constraints.minLength).toBe(1);
    });

    it('7. required date input cannot become empty string', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const due = create.parameters.find((p) => p.name === 'dueDate')!;
      expect(due.constraints.dateLike).toBe(true);
      expect(due.constraints.rejectEmptyString).toBe(true);
      expect(due.required).toBe(true);
      const bindings = generateWiringBindings(buildWiringContract(ir));
      expect(bindings).toMatch(/Must not be ""/);
    });
  });

  describe('trusted server-owned inputs', () => {
    it('8. server-owned actor field is absent from client input', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      const completedBy = create.parameters.find((p) => p.name === 'completedBy')!;
      expect(completedBy.ownership).toBe('server');
      expect(completedBy.trustedSource).toBe('context.actorId');
      expect(completedBy.trustedSourceKind).toBe('actor');
      expect(create.clientParameterNames).not.toContain('completedBy');
      expect(create.serverParameterNames).toContain('completedBy');
      const bindings = generateWiringBindings(buildWiringContract(ir));
      const clientBlock = bindings.match(/export interface TaskCreateClientInput \{([^}]*)\}/)?.[1];
      expect(clientBlock).toBeDefined();
      expect(clientBlock).not.toMatch(/completedBy/);
      expect(bindings).toMatch(/TaskCreateTrustedContext/);
      expect(bindings).toMatch(/completedBy:\s*string/);
    });

    it('compiles trustedSource onto IRParameter', async () => {
      const ir = await compile(FIXTURE);
      const create = ir.commands.find((c) => c.name === 'create' && c.entity === 'Task')!;
      const p = create.parameters.find((x) => x.name === 'completedBy')!;
      expect(p.trustedSource).toBe('context.actorId');
    });
  });

  describe('lifecycle + invalidation', () => {
    it('11. lifecycle transition metadata from actual semantics', async () => {
      const ir = await compile(FIXTURE);
      const pub = findCap(buildWiringContract(ir), 'Task', 'markPublished');
      expect(pub.lifecycleTransitions.length).toBeGreaterThan(0);
      expect(pub.lifecycleTransitions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'status',
            from: 'draft',
            to: 'published',
            proven: true,
          }),
        ]),
      );
      // Must not invent Active/Inactive
      expect(JSON.stringify(pub.lifecycleTransitions)).not.toMatch(/active|inactive/i);
    });

    it('12. mutation invalidates entity list/detail metadata', async () => {
      const ir = await compile(FIXTURE);
      const create = findCap(buildWiringContract(ir), 'Task', 'create');
      expect(create.invalidation.map((i) => i.kind).sort()).toEqual(['entityDetail', 'entityList']);
      expect(create.invalidation.every((i) => i.entity === 'Task')).toBe(true);
      expect(create.invalidation.some((i) => i.queryKeyHint.includes('lists'))).toBe(true);
      expect(create.invalidation.some((i) => i.queryKeyHint.includes('detail'))).toBe(true);
    });
  });

  describe('coverage validation', () => {
    it('13. unwired capability is reported as defect', async () => {
      const ir = await compile(FIXTURE);
      const contract = buildWiringContract(ir);
      const registry: WiringConsumersRegistry = {
        $schema: WIRING_CONSUMERS_SCHEMA,
        consumers: [
          { capabilityId: 'Task.create', disposition: 'consumed' },
          { capabilityId: 'Task.markPublished', disposition: 'consumed' },
          // archive intentionally omitted → unwired
        ],
      };
      const report = validateWiringCoverage(contract, registry);
      expect(report.ok).toBe(false);
      const unwired = report.findings.filter((f) => f.status === 'unwired');
      expect(unwired.some((f) => f.capabilityId === 'Task.archive' && f.defect)).toBe(true);
    });

    it('14. explicitly backend-only capability is not a defect', async () => {
      const ir = await compile(FIXTURE);
      const contract = buildWiringContract(ir);
      const registry: WiringConsumersRegistry = {
        $schema: WIRING_CONSUMERS_SCHEMA,
        consumers: contract.capabilities.map((c) => ({
          capabilityId: c.capabilityId,
          disposition: c.command === 'archive' ? ('backend-only' as const) : ('consumed' as const),
        })),
      };
      const report = validateWiringCoverage(contract, registry);
      expect(report.ok).toBe(true);
      const archive = report.findings.find((f) => f.capabilityId === 'Task.archive')!;
      expect(archive.status).toBe('backend-only');
      expect(archive.defect).toBe(false);
    });

    it('15. stale consumer reference fails validation', async () => {
      const ir = await compile(FIXTURE);
      const contract = buildWiringContract(ir);
      const registry = parseConsumersRegistry({
        $schema: WIRING_CONSUMERS_SCHEMA,
        consumers: [
          ...contract.capabilities.map((c) => ({
            capabilityId: c.capabilityId,
            disposition: 'consumed',
          })),
          { capabilityId: 'Task.doesNotExist', disposition: 'consumed' },
        ],
      });
      const report = validateWiringCoverage(contract, registry);
      expect(report.ok).toBe(false);
      expect(
        report.findings.some(
          (f) => f.status === 'stale-consumer' && f.capabilityId === 'Task.doesNotExist',
        ),
      ).toBe(true);
    });
  });

  it('bind helper strips spoofed server fields from client object', async () => {
    const ir = await compile(FIXTURE);
    const bindings = generateWiringBindings(buildWiringContract(ir));
    expect(bindings).toContain('delete safeClient["completedBy"]');
    expect(bindings).toContain('bindTaskCreateInput');
  });
});
