import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { directWritesDetector } from './direct-writes.js';
import { unregisteredEntityWriteDetector } from './unregistered-entity-write.js';

async function tempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'dw-'));
}

async function writeFile(root: string, rel: string, body: string) {
  const dir = path.join(root, path.dirname(rel));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(root, rel), body);
}

describe('directWritesDetector — configurable write receiver', () => {
  it('flags prisma.X.create by default (receiver "prisma")', async () => {
    const root = await tempDir();
    await writeFile(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return prisma.user.create({ data: {} }); }`
    );
    const findings = await directWritesDetector.run({ root });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DIRECT_WRITE');
  });

  it('does NOT flag a custom receiver (database.X.create) when receiver is left at default', async () => {
    const root = await tempDir();
    await writeFile(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return database.user.create({ data: {} }); }`
    );
    const findings = await directWritesDetector.run({ root });
    // `database` is not the default receiver `prisma`, so nothing is flagged.
    expect(findings).toEqual([]);
  });

  it('flags database.X.create when writeReceiver is set to "database"', async () => {
    const root = await tempDir();
    await writeFile(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return database.user.create({ data: {} }); }`
    );
    const findings = await directWritesDetector.run({ root, writeReceiver: 'database' });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('DIRECT_WRITE');
    // Message reflects the configured receiver, not a hardcoded "prisma".
    expect(findings[0].message).toContain('database.create');
  });

  it('does NOT flag prisma.X.create when receiver is switched to "database"', async () => {
    const root = await tempDir();
    await writeFile(
      root,
      'app/api/x/route.ts',
      `export async function POST(){ return prisma.user.create({ data: {} }); }`
    );
    const findings = await directWritesDetector.run({ root, writeReceiver: 'database' });
    expect(findings).toEqual([]);
  });
});

describe('unregisteredEntityWriteDetector — configurable write receiver', () => {
  it('flags database.model.create against unregistered model when receiver is "database"', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'entities.json');
    await fs.writeFile(reg, JSON.stringify([{ name: 'User' }]));
    await writeFile(
      root,
      'app/api/audit/route.ts',
      `export async function POST(){ return database.auditLog.create({ data: {} }); }`
    );
    const findings = await unregisteredEntityWriteDetector.run({
      root,
      entitiesRegistry: reg,
      writeReceiver: 'database',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('UNREGISTERED_ENTITY_WRITE');
    expect(findings[0].entity).toBe('auditLog');
  });

  it('ignores database.* by default (receiver "prisma")', async () => {
    const root = await tempDir();
    const reg = path.join(root, 'entities.json');
    await fs.writeFile(reg, JSON.stringify([{ name: 'User' }]));
    await writeFile(
      root,
      'app/api/audit/route.ts',
      `export async function POST(){ return database.auditLog.create({ data: {} }); }`
    );
    const findings = await unregisteredEntityWriteDetector.run({
      root,
      entitiesRegistry: reg,
    });
    expect(findings).toEqual([]);
  });
});
