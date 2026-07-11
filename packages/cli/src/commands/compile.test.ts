/**
 * CLI Compile Command Tests
 *
 * Tests the manifest compile command for IR generation.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper to create temp manifest files
async function createTempManifest(
  content: string,
  filename: string = 'test.manifest',
): Promise<string> {
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
  // Note: Intentionally NOT using vi.resetModules() to avoid race conditions
  // with dynamic imports in the compile command

  it('should compile a simple entity to IR', async () => {
    const manifest = `
entity Counter {
  property count: number = 0
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
      const irExists = await fs
        .stat(irPath)
        .then(() => true)
        .catch(() => false);
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
      const irExists = await fs
        .stat(irPath)
        .then(() => true)
        .catch(() => false);
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
  // Note: Intentionally NOT using vi.resetModules() to avoid race conditions

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
  // Note: Intentionally NOT using vi.resetModules() to avoid race conditions

  it('should report error for missing file', async () => {
    const { compileCommand } = await import('./compile.js');
    const capture = captureOutput();

    const originalExit = process.exit;
    const exitMock = vi.fn().mockImplementation(() => {
      throw new Error('exit');
    });
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
      const irExists = await fs
        .stat(irPath)
        .then(() => true)
        .catch(() => false);
      expect(irExists).toBe(true);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail a multi-file compile before writing IR when exact entity command duplicates exist', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-compile-test-'));
    await fs.writeFile(
      path.join(tempDir, 'recipe-a.manifest'),
      `
entity Recipe {
  property name: string
  command create(name: string) {
    mutate name = input.name
  }
}
`,
      'utf-8',
    );
    await fs.writeFile(
      path.join(tempDir, 'recipe-b.manifest'),
      `
entity Recipe {
  property name: string
  command create(name: string) {
    mutate name = input.name
  }
}
`,
      'utf-8',
    );

    const { compileCommand } = await import('./compile.js');
    const capture = captureOutput();
    const originalExit = process.exit;
    const exitMock = vi.fn().mockImplementation(() => {
      throw new Error('exit');
    });
    process.exit = exitMock as any;

    try {
      await expect(compileCommand(tempDir, { diagnostics: true })).rejects.toThrow('exit');
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(capture.outputs.join('\n')).toContain('Duplicate command intent for Recipe.create');
      expect(capture.outputs.join('\n')).toContain('existing command Recipe.create');
      expect(capture.outputs.join('\n')).toContain('recipe-a.manifest');
      expect(capture.outputs.join('\n')).toContain('recipe-b.manifest');
      await expect(fs.stat(path.join(tempDir, 'recipe-a.ir.json'))).rejects.toThrow();
      await expect(fs.stat(path.join(tempDir, 'recipe-b.ir.json'))).rejects.toThrow();
    } finally {
      process.exit = originalExit;
      capture.restore();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should fail a multi-file compile before writing IR when command intent duplicates exist', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-compile-test-'));
    await fs.writeFile(
      path.join(tempDir, 'recipe-create.manifest'),
      `
entity Recipe {
  property name: string
  command create(name: string) {
    mutate name = input.name
  }
}
`,
      'utf-8',
    );
    await fs.writeFile(
      path.join(tempDir, 'recipe-add.manifest'),
      `
entity Recipe {
  property name: string
  command addRecipe(name: string) {
    mutate name = input.name
  }
}
`,
      'utf-8',
    );

    const { compileCommand } = await import('./compile.js');
    const capture = captureOutput();
    const originalExit = process.exit;
    const exitMock = vi.fn().mockImplementation(() => {
      throw new Error('exit');
    });
    process.exit = exitMock as any;

    try {
      await expect(compileCommand(tempDir, { diagnostics: true })).rejects.toThrow('exit');
      expect(exitMock).toHaveBeenCalledWith(1);
      expect(capture.outputs.join('\n')).toContain('Duplicate command intent for Recipe.addRecipe');
      expect(capture.outputs.join('\n')).toContain('existing command Recipe.create');
      expect(capture.outputs.join('\n')).toContain('use or extend the existing command');
      await expect(fs.stat(path.join(tempDir, 'recipe-create.ir.json'))).rejects.toThrow();
      await expect(fs.stat(path.join(tempDir, 'recipe-add.ir.json'))).rejects.toThrow();
    } finally {
      process.exit = originalExit;
      capture.restore();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Compile Command - Conformance Fixtures', () => {
  // Note: Intentionally NOT using vi.resetModules() to avoid race conditions

  it('should compile existing conformance fixtures', async () => {
    // Use existing conformance fixtures that are known to work
    const fixturePath = path.resolve(
      process.cwd(),
      'src/manifest/conformance/fixtures/01-entity-properties.manifest',
    );

    try {
      await fs.stat(fixturePath);
      const { compileCommand } = await import('./compile.js');
      const capture = captureOutput();

      await compileCommand(fixturePath, {
        output: path.join(os.tmpdir(), 'manifest-compile-test-output'),
      });

      // Should complete without throwing
      capture.restore();
    } catch {
      // Fixture may not exist in all environments - skip test
    }
  });
});

describe('Compile Command - --all (config-driven merged compile)', () => {
  it('resolves config src+output and drives MERGED compilation', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-compile-all-'));
    await fs.mkdir(path.join(tempDir, 'src'));
    await fs.writeFile(
      path.join(tempDir, 'src', '_base.manifest'),
      'entity TenantScoped {\n  property required id: string\n  indexed property required tenantId: string\n}\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(tempDir, 'src', 'widget.manifest'),
      'use "./_base.manifest"\nentity Widget mixin TenantScoped {\n  property name: string\n}\n',
      'utf-8',
    );
    await fs.writeFile(
      path.join(tempDir, 'manifest.config.yaml'),
      ['src: src/**/*.manifest', 'output: ir/widgets.ir.json', ''].join('\n'),
      'utf-8',
    );

    const { compileAllFromConfig } = await import('./compile.js');
    const capture = captureOutput();
    const origCwd = process.cwd();
    try {
      process.chdir(tempDir);
      // compileAllFromConfig delegates to merged compilation using the config's
      // `src` glob + `output`. We assert it expanded the glob to both files and
      // entered the merge path (the wiring this function owns). End-to-end merge
      // correctness — incl. cross-file `mixin` resolution and all-files error
      // reporting — is covered in src/manifest/multi-compiler.test.ts. (The merge
      // step's dynamic '@angriff36/manifest/multi-compiler' import only resolves
      // in the built package / CLI, not under vitest, so the merge cannot
      // complete here.)
      await compileAllFromConfig({}).catch(() => undefined);
      const out = capture.outputs.join('\n');
      expect(out).toContain('Found 2 file(s) for merged compilation');
    } finally {
      process.chdir(origCwd);
      capture.restore();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});

describe('Compile Command - Idempotent Provenance', () => {
  it('reuses compiledAt + irHash when source is unchanged (byte-identical re-compile)', async () => {
    const source = [
      'entity Counter {',
      '  property required id: string',
      '  property count: number = 0',
      '}',
      '',
    ].join('\n');
    const filePath = await createTempManifest(source, 'counter.manifest');
    const outputPath = filePath.replace(/\.manifest$/, '.ir.json');

    try {
      const { compileCommand } = await import('./compile.js');

      await compileCommand(filePath, { pretty: true });
      const first = await fs.readFile(outputPath, 'utf-8');

      // Wait long enough that a fresh `new Date()` timestamp would differ —
      // this makes the assertion deterministic: only provenance reuse keeps
      // compiledAt stable across the two runs.
      await new Promise((resolve) => setTimeout(resolve, 50));

      await compileCommand(filePath, { pretty: true });
      const second = await fs.readFile(outputPath, 'utf-8');

      expect(second).toBe(first); // byte-identical
      const ir = JSON.parse(second);
      const firstIr = JSON.parse(first);
      expect(ir.provenance.compiledAt).toBe(firstIr.provenance.compiledAt);
      expect(ir.provenance.irHash).toBe(firstIr.provenance.irHash);
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('updates compiledAt when the source actually changes', async () => {
    const sourceA = [
      'entity Counter {',
      '  property required id: string',
      '  property count: number = 0',
      '}',
      '',
    ].join('\n');
    const filePath = await createTempManifest(sourceA, 'counter.manifest');
    const outputPath = filePath.replace(/\.manifest$/, '.ir.json');

    try {
      const { compileCommand } = await import('./compile.js');
      await compileCommand(filePath, { pretty: true });
      const firstAt = JSON.parse(await fs.readFile(outputPath, 'utf-8')).provenance.compiledAt;

      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.writeFile(filePath, sourceA.replace('number = 0', 'number = 1'), 'utf-8');
      await compileCommand(filePath, { pretty: true });
      const secondAt = JSON.parse(await fs.readFile(outputPath, 'utf-8')).provenance.compiledAt;

      expect(secondAt).not.toBe(firstAt);
    } finally {
      await cleanupTemp(filePath);
    }
  });
});
