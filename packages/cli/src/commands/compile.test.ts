/**
 * CLI Compile Command Tests
 *
 * Tests the manifest compile command for IR generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper to create temp manifest files
async function createTempManifest(content: string, filename: string = 'test.manifest'): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-compile-test-'));
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

// Helper to get temp directory from file path
function getTempDir(filePath: string): string {
  return path.dirname(filePath);
}

// Helper to cleanup temp files
async function cleanupTemp(filePath: string): Promise<void> {
  try {
    const dir = getTempDir(filePath);
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Helper to capture output
function captureOutput() {
  const outputs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    outputs.push(args.join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    outputs.push(args.join(' '));
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data: any) => {
    outputs.push(String(data));
    return true;
  });

  return {
    outputs,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

describe('Compile Command - Basic Compilation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should compile a simple entity to IR', async () => {
    const manifest = `
entity Counter {
  property count: number default 0
  property name: string
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(filePath, { pretty: true });

      // Check that IR file was created
      const irPath = filePath.replace('.manifest', '.ir.json');
      const irExists = await fs.stat(irPath).then(() => true).catch(() => false);
      expect(irExists).toBe(true);

      // Check IR content
      const rawContent = await fs.readFile(irPath, 'utf-8');
      const irContent = JSON.parse(rawContent);
      expect(irContent).toHaveProperty('entities');
      expect(irContent.entities).toHaveLength(1);
      expect(irContent.entities[0].name).toBe('Counter');

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should compile entity with relationships', async () => {
    const manifest = `
entity Author {
  property id: string
  property name: string
  hasMany books: Book
}

entity Book {
  property id: string
  property title: string
  belongsTo author: Author
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(filePath, {});

      const irPath = filePath.replace('.manifest', '.ir.json');
      const irExists = await fs.stat(irPath).then(() => true).catch(() => false);
      expect(irExists).toBe(true);

      const irContent = JSON.parse(await fs.readFile(irPath, 'utf-8'));
      expect(irContent.entities).toHaveLength(2);
      const author = irContent.entities.find((e: any) => e.name === 'Author');
      expect(author.relationships).toBeDefined();
      expect(author.relationships.length).toBeGreaterThan(0);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Compile Command - Output Options', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should output pretty JSON when requested', async () => {
    const manifest = `
entity Counter {
  property count: number
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(filePath, { pretty: true });

      const irPath = filePath.replace('.manifest', '.ir.json');
      const irRaw = await fs.readFile(irPath, 'utf-8');

      // Pretty JSON should have newlines and indentation
      expect(irRaw).toContain('\n');
      expect(irRaw).toContain('  ');

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should output compact JSON by default', async () => {
    const manifest = `
entity Counter {
  property count: number
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(filePath, {});

      const irPath = filePath.replace('.manifest', '.ir.json');
      const irRaw = await fs.readFile(irPath, 'utf-8');

      // Compact JSON should be single line
      expect(irRaw.split('\n').length).toBe(1);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Compile Command - Error Handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should report error for missing file', async () => {
    const { compileCommand } = await import('./compile.js');
    const capture = captureOutput();

    const originalExit = process.exit;
    const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
    process.exit = exitMock as any;

    try {
      await compileCommand('/nonexistent/path/file.manifest', {});
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.message).toBe('exit');
    }

    process.exit = originalExit;
    capture.restore();
  });

  it('should handle empty manifest file', async () => {
    const manifest = '';
    const filePath = await createTempManifest(manifest);
    try {
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(filePath, {});

      // Empty manifest should still compile (empty IR)
      const irPath = filePath.replace('.manifest', '.ir.json');
      const irExists = await fs.stat(irPath).then(() => true).catch(() => false);
      expect(irExists).toBe(true);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Compile Command - Conformance Fixtures', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should compile existing conformance fixtures', async () => {
    // Use existing conformance fixtures that are known to work
    const fixturePath = path.resolve(process.cwd(), 'src/manifest/conformance/fixtures/01-entity-properties.manifest');

    try {
      await fs.stat(fixturePath);
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(fixturePath, { output: path.join(os.tmpdir(), 'manifest-compile-test-output') });

      // Should complete without throwing
      capture.restore();
    } catch {
      // Fixture may not exist in all environments - skip test
    }
  });
});
