import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import { generateWiringBindings } from '../bindings-generator.js';
import type { IR } from '../../../ir.js';

async function compile(source: string): Promise<IR> {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter((item) => item.severity === 'error');
  expect(errors, errors.map((item) => item.message).join('\n')).toHaveLength(0);
  return ir!;
}

describe('wiring read catalog', () => {
  it('describes list, get, and indexed reads for stored records only', async () => {
    const source = `
policy canRead read: true
entity Task {
  property required id: string
  property title: string = ""
  property indexed due: datetime
  command create(title: string) { mutate title = title }
  store Task in durable
}
entity Note {
  property required id: string
  property body: string = ""
  command create(body: string) { mutate body = body }
  store Note in memory
}
`;
    const ir = await compile(source);
    const closed = buildWiringContract(ir);
    expect(closed.reads.map((read) => read.readId)).toEqual([
      'Task.byDue',
      'Task.get',
      'Task.list',
    ]);
    expect(closed.reads.every((read) => read.clientCallable)).toBe(false);
    expect(closed.reads.every((read) => read.pagination === 'unsupported')).toBe(true);
    const list = closed.reads.find((read) => read.readId === 'Task.list');
    const detail = closed.reads.find((read) => read.readId === 'Task.get');
    const byDue = closed.reads.find((read) => read.readId === 'Task.byDue');
    expect(list?.parameters).toEqual([]);
    expect(list?.exportName).toBe('listTask');
    expect(list?.returnTsType.startsWith('Array<')).toBe(true);
    expect(detail?.parameters).toEqual([{ name: 'id', tsType: 'string', required: true }]);
    expect(detail?.returnTsType.endsWith('| null')).toBe(true);
    expect(byDue?.parameters).toEqual([{ name: 'due', tsType: 'number', required: false }]);
    expect(byDue?.exportName).toBe('listTaskByDue');

    const open = buildWiringContract(ir, { authContextImport: './lib/auth' });
    expect(open.reads.every((read) => read.clientCallable)).toBe(true);
    const bindings = generateWiringBindings(open);
    expect(bindings).toContain('export const listTaskRead =');
    expect(bindings).toContain('export const ALL_READ_IDS =');
    expect(JSON.stringify(buildWiringContract(ir).reads)).toBe(JSON.stringify(closed.reads));
  });
});
