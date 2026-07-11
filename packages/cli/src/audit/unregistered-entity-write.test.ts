import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { unregisteredEntityWriteDetector } from './unregistered-entity-write.js';

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'uew-'));
}

async function writeEntities(root: string, names: string[]) {
  const reg = path.join(root, 'entities.json');
  await fs.writeFile(
    reg,
    JSON.stringify({
      irHash: 'x',
      compilerVersion: 'y',
      entities: names.map((n) => ({ name: n })),
    }),
  );
  return reg;
}

async function writeFile(root: string, rel: string, body: string) {
  const dir = path.join(root, path.dirname(rel));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(root, rel), body);
}

describe('unregisteredEntityWriteDetector', () => {
  it('accepts a flat-array entities registry (downstream consumer shape)', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'entities.json');
    await fs.writeFile(reg, JSON.stringify([{ name: 'User' }, { name: 'Order' }]));
    await writeFile(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return prisma.user.create({ data: {} }); }`,
    );
    const findings = await unregisteredEntityWriteDetector.run({
      root,
      entitiesRegistry: reg,
    });
    // `user` matches registered entity `User` -> no false-positive finding.
    expect(findings).toEqual([]);
  });

  it('flags prisma.model.create when model has no entity in registry', async () => {
    const root = await tempDir();
    const reg = await writeEntities(root, ['User']);
    await writeFile(
      root,
      'app/api/audit/route.ts',
      `export async function POST(){ return prisma.auditLog.create({ data: {} }); }`,
    );
    const findings = await unregisteredEntityWriteDetector.run({
      root,
      entitiesRegistry: reg,
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].code).toBe('UNREGISTERED_ENTITY_WRITE');
    expect(findings[0].entity).toBe('auditLog');
  });

  it('does not flag writes against a registered entity (PascalCase ↔ camelCase)', async () => {
    const root = await tempDir();
    const reg = await writeEntities(root, ['User']);
    await writeFile(
      root,
      'app/api/users/route.ts',
      `export async function POST(){ return prisma.user.create({ data: {} }); }`,
    );
    const findings = await unregisteredEntityWriteDetector.run({
      root,
      entitiesRegistry: reg,
    });
    expect(findings).toEqual([]);
  });

  it('flags update/delete/upsert/createMany/updateMany/deleteMany', async () => {
    const root = await tempDir();
    const reg = await writeEntities(root, []);
    await writeFile(
      root,
      'app/api/x/route.ts',
      `
        prisma.foo.update({});
        prisma.foo.delete({});
        prisma.foo.upsert({});
        prisma.foo.createMany({});
        prisma.foo.updateMany({});
        prisma.foo.deleteMany({});
      `,
    );
    const findings = await unregisteredEntityWriteDetector.run({
      root,
      entitiesRegistry: reg,
    });
    expect(findings.length).toBe(6);
  });

  it('does nothing when no entities registry is provided', async () => {
    const root = await tempDir();
    await writeFile(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return prisma.x.create({}); }`,
    );
    const findings = await unregisteredEntityWriteDetector.run({ root });
    expect(findings).toEqual([]);
  });
});
