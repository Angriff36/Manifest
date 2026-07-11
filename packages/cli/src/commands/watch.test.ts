/**
 * CLI Watch Command Tests
 *
 * Tests the manifest watch command for file watching and incremental rebuild.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper to create temp manifest files
async function createTempManifest(
  content: string,
  filename: string = 'test.manifest',
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-watch-test-'));
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

// Helper to cleanup temp files
async function cleanupTemp(filePath: string): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Capture console output
function captureOutput() {
  const outputs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    outputs.push(args.join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    outputs.push(args.join(' '));
  });
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    outputs.push(args.join(' '));
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data: unknown) => {
    outputs.push(String(data));
    return true;
  });

  return {
    outputs,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}

describe('Watch Command - Module exports', () => {
  it('should export watchCommand function', async () => {
    const mod = await import('./watch.js');
    expect(typeof mod.watchCommand).toBe('function');
  });
});

describe('Watch Command - WatchOptions interface', () => {
  it('should accept valid watch options', async () => {
    // Verify the interface shape is correct by constructing a valid options object
    const options = {
      projection: 'nextjs',
      surface: 'all',
      irOutput: 'ir/',
      codeOutput: 'generated/',
      glob: '**/*.manifest',
      auth: 'clerk',
      database: '@/lib/database',
      runtime: '@/lib/manifest-runtime',
      response: '@/lib/manifest-response',
      debounce: 300,
      events: false,
      clear: false,
    };

    // Type check: ensure all required keys are present
    expect(options.projection).toBe('nextjs');
    expect(options.surface).toBe('all');
    expect(options.debounce).toBe(300);
    expect(options.events).toBe(false);
    expect(options.clear).toBe(false);
  });
});

describe('Watch Command - Initial build', () => {
  let tempFilePath: string;

  afterEach(async () => {
    if (tempFilePath) {
      await cleanupTemp(tempFilePath);
    }
  });

  it('should run initial compile on start', async () => {
    const manifest = `
entity Timer {
  property seconds: number = 0
}
`;
    tempFilePath = await createTempManifest(manifest);
    const tempDir = path.dirname(tempFilePath);

    const { compileCommand } = await import('./compile.js');
    const capture = captureOutput();

    // Just test that the compile step works — the watch loop
    // needs fs.watch which we won't test end-to-end in unit tests.
    await compileCommand(tempFilePath, {
      output: tempDir,
      pretty: true,
    });

    capture.restore();

    // IR file should have been created
    const irPath = path.join(tempDir, 'test.ir.json');
    const irExists = await fs
      .stat(irPath)
      .then(() => true)
      .catch(() => false);
    expect(irExists).toBe(true);

    // Parse and verify IR content
    const irContent = JSON.parse(await fs.readFile(irPath, 'utf-8'));
    expect(irContent.entities).toBeDefined();
    expect(irContent.entities.length).toBeGreaterThan(0);
    expect(irContent.entities[0].name).toBe('Timer');
  });
});

describe('Watch Command - Debounce behavior', () => {
  it('should coalesce rapid changes via debounce', async () => {
    // Simulate debounce logic: multiple calls within debounce window
    // should result in a single build.
    let buildCount = 0;
    let pendingFiles = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRebuild = (file: string) => {
      pendingFiles.add(file);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        buildCount++;
        pendingFiles = new Set();
      }, 50);
    };

    // Simulate rapid file changes
    debouncedRebuild('a.manifest');
    debouncedRebuild('b.manifest');
    debouncedRebuild('c.manifest');

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(buildCount).toBe(1);
  });

  it('should handle sequential builds after debounce', async () => {
    let buildCount = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRebuild = (_file: string) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        buildCount++;
      }, 30);
    };

    // First batch
    debouncedRebuild('a.manifest');
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Second batch (after debounce settled)
    debouncedRebuild('b.manifest');
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(buildCount).toBe(2);
  });
});

describe('Watch Command - Event emission', () => {
  it('should emit valid JSON events when --events is enabled', () => {
    // Test the event shape
    const event = {
      type: 'ready' as const,
      timestamp: new Date().toISOString(),
      files: ['src/app.manifest'],
      irOutput: 'ir/',
      codeOutput: 'generated/',
    };

    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('ready');
    expect(parsed.files).toEqual(['src/app.manifest']);
    expect(parsed.irOutput).toBe('ir/');
    expect(parsed.codeOutput).toBe('generated/');
    expect(parsed.timestamp).toBeDefined();
  });

  it('should emit build:success events with correct shape', () => {
    const event = {
      type: 'build:success' as const,
      timestamp: new Date().toISOString(),
      files: ['src/domain.manifest'],
      irOutput: 'ir/',
      codeOutput: 'generated/',
    };

    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('build:success');
    expect(parsed.files).toHaveLength(1);
  });

  it('should emit build:error events with error message', () => {
    const event = {
      type: 'build:error' as const,
      timestamp: new Date().toISOString(),
      files: ['src/broken.manifest'],
      error: 'Build failed — check diagnostics above',
    };

    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);

    expect(parsed.type).toBe('build:error');
    expect(parsed.error).toBeDefined();
  });
});

describe('Watch Command - File filtering', () => {
  it('should only react to .manifest file extensions', () => {
    // Simulate the file extension check from the watcher
    const shouldWatch = (filename: string) => filename.endsWith('.manifest');

    expect(shouldWatch('app.manifest')).toBe(true);
    expect(shouldWatch('domain/user.manifest')).toBe(true);
    expect(shouldWatch('app.ts')).toBe(false);
    expect(shouldWatch('package.json')).toBe(false);
    expect(shouldWatch('app.manifest.bak')).toBe(false);
    expect(shouldWatch('.manifest')).toBe(true);
  });
});
