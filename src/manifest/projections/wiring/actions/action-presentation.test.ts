import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import { generateWiringBindings } from '../bindings-generator.js';

async function compile(source: string) {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter((item) => item.severity === 'error');
  expect(errors, errors.map((item) => item.message).join('\n')).toHaveLength(0);
  return ir!;
}

const SOURCE = `
enum Status {
  draft
  published = "Published"
}
entity Plate {
  property required id: string
  property title: string = ""
  property status: Status = draft
  transition status from "draft" to ["published"]
  command create(title: string, completedBy: string from context.actorId) {
    mutate title = title
    mutate completedBy = completedBy
  }
  command markPublished() {
    mutate status = "published"
  }
  command setStatus(status: Status) {
    mutate status = status
  }
  command delete() {}
  private command syncStock() {}
  store Plate in memory
}
entity Scrap {
  property required id: string
  property title: string = ""
  command remove(title: string) {
    mutate title = title
  }
  store Scrap in memory
}
`;

describe('action presentation', () => {
  it('offers a normal save with person-facing words and fields', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const create = contract.capabilities.find((cap) => cap.command === 'create')!;
    expect(create.presentation.exposure).toBe('human');
    expect(create.presentation.label).toBe('Create');
    expect(create.presentation.confirm).toBe(false);
    expect(create.presentation.fields.map((field) => field.name)).toEqual(['title']);
    expect(create.presentation.fields[0]).toMatchObject({
      label: 'Title',
      required: true,
    });
  });

  it('names the status a person must already have', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const publish = contract.capabilities.find((cap) => cap.command === 'markPublished')!;
    expect(publish.presentation.label).toBe('Mark published');
    expect(publish.presentation.availableFrom).toEqual({
      property: 'status',
      values: ['draft'],
    });
  });

  it('keeps declared enum labels on the field', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const setStatus = contract.capabilities.find((cap) => cap.command === 'setStatus')!;
    expect(setStatus.presentation.fields[0]?.choices).toEqual([
      { value: 'draft', label: 'draft' },
      { value: 'published', label: 'Published' },
    ]);
  });

  it('asks for confirmation only when the record is removed', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const remove = contract.capabilities.find((cap) => cap.command === 'delete')!;
    const rename = contract.capabilities.find(
      (cap) => cap.entity === 'Scrap' && cap.command === 'remove',
    )!;
    expect(remove.presentation.confirm).toBe(true);
    expect(remove.presentation.label).toBe('Delete');
    expect(rename.presentation.confirm).toBe(false);
  });

  it('keeps a private command off the screen', async () => {
    const contract = buildWiringContract(await compile(SOURCE));
    const sync = contract.capabilities.find((cap) => cap.command === 'syncStock')!;
    expect(sync.dispatchable).toBe(true);
    expect(sync.presentation).toEqual({
      exposure: 'internal',
      label: 'Sync stock',
      confirm: false,
      fields: [],
    });
    const bindings = generateWiringBindings(contract);
    expect(bindings).toContain('export const PlateSyncStockAction');
    expect(bindings).toContain('"exposure": "internal"');
  });
});
