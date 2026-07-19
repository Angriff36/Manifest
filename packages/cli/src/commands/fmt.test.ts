/**
 * CLI fmt command tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { formatManifestSource, fmtCommand } from './fmt.js';

const VALID_MANIFEST = `entity Product {
  property required name: string
  property price: number = 0
  property inStock: boolean = true
  property description: string = ""
}

store Product in memory
`;

describe('formatManifestSource', () => {
  it('normalizes trailing whitespace and final newline', () => {
    const input = 'entity Recipe {\r\n  property title: string   \r\n}\r\n\r\n';
    expect(formatManifestSource(input)).toBe('entity Recipe {\n  property title: string\n}\n');
  });

  it('is idempotent', () => {
    const once = formatManifestSource(`entity Recipe {\n  property title: string  \n}\n`);
    const twice = formatManifestSource(once);
    expect(twice).toBe(once);
  });

  it('converts tabs to two spaces', () => {
    expect(formatManifestSource('entity Recipe {\n\tproperty title: string\n}\n')).toBe(
      'entity Recipe {\n  property title: string\n}\n',
    );
  });
});

describe('fmtCommand', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-fmt-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it('writes formatted output with --write', async () => {
    const raw = 'entity Recipe {\n  property title: string  \n}\n\n';
    const filePath = path.join(tempDir, 'Recipe.manifest');
    await fs.writeFile(filePath, raw, 'utf-8');

    await fmtCommand(filePath, { write: true });

    const updated = await fs.readFile(filePath, 'utf-8');
    expect(updated).toBe(formatManifestSource(raw));
  });

  it('fails --check when file needs formatting', async () => {
    const filePath = path.join(tempDir, 'Recipe.manifest');
    await fs.writeFile(filePath, 'entity Recipe {\n  property title: string  \n}\n\n', 'utf-8');

    await fmtCommand(filePath, { check: true });

    expect(process.exitCode).toBe(1);
  });

  it('passes --check for valid formatted manifest', async () => {
    const filePath = path.join(tempDir, 'Recipe.manifest');
    await fs.writeFile(filePath, formatManifestSource(VALID_MANIFEST), 'utf-8');

    await fmtCommand(filePath, { check: true });

    expect(process.exitCode ?? 0).toBe(0);
  });

  it('formats files with cross-file references (mixins/events unresolvable standalone)', async () => {
    // Regression (2026-07-19): fmt ran the full IR compiler per file, so any
    // file using cross-file mixins or reacting to another file's events was
    // rejected as "failed to parse". Formatting only needs syntax.
    const raw =
      'entity PurchaseNeed mixin TenantScoped, SoftDeletable {\n  property required unit: string  \n}\n\non VendorOrderSubmitted fanOut PurchaseNeed where vendorOrderId = payload.vendorOrderId\n  run markDraftOrdered\n\n';
    const filePath = path.join(tempDir, 'PurchaseNeed.manifest');
    await fs.writeFile(filePath, raw, 'utf-8');

    await fmtCommand(filePath, { write: true });

    expect(process.exitCode ?? 0).toBe(0);
    const updated = await fs.readFile(filePath, 'utf-8');
    expect(updated).toBe(formatManifestSource(raw));
  });
});
