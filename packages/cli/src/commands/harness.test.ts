import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

async function cleanupDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

function captureOutput(): { outputs: string[]; restore: () => void } {
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

describe('harnessCommand', () => {
  it('reports passing step/assertion counts for a valid script', async () => {
    const tempDir = await createTempDir('manifest-harness-test-');
    const manifestPath = path.join(tempDir, 'task.manifest');
    const scriptPath = path.join(tempDir, 'script.json');

    const manifest = `
entity Task {
  property id: string
  property status: string = "todo"

  command startProgress() {
    guard self.status == "todo"
    mutate status = "in_progress"
  }

  store Task in memory
}
`;

    const script = {
      description: 'Task.startProgress success',
      seedEntities: [
        {
          entity: 'Task',
          id: 'task-1',
          properties: { status: 'todo' },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Task',
          id: 'task-1',
          command: 'startProgress',
          params: {},
          expect: {
            success: true,
            stateAfter: { status: 'in_progress' },
          },
        },
      ],
    };

    await writeFile(manifestPath, manifest);
    await writeFile(scriptPath, JSON.stringify(script, null, 2));

    const { harnessCommand } = await import('./harness.js');
    const capture = captureOutput();

    try {
      await harnessCommand(manifestPath, { script: scriptPath, format: 'json' });
      const jsonOutput = capture.outputs.find((item) => item.includes('"summary"'));
      expect(jsonOutput).toBeDefined();

      const parsed = JSON.parse(jsonOutput as string);
      expect(parsed.summary.totalSteps).toBe(1);
      expect(parsed.summary.failedSteps).toBe(0);
      expect(parsed.summary.assertionsFailed).toBe(0);
    } finally {
      capture.restore();
      await cleanupDir(tempDir);
    }
  });

  it('returns non-zero when a step assertion fails and reports failure counts', async () => {
    const tempDir = await createTempDir('manifest-harness-test-');
    const manifestPath = path.join(tempDir, 'task.manifest');
    const scriptPath = path.join(tempDir, 'script.json');

    const manifest = `
entity Task {
  property id: string
  property status: string = "backlog"

  command startProgress() {
    guard self.status == "todo"
    mutate status = "in_progress"
  }

  store Task in memory
}
`;

    const script = {
      description: 'Task.startProgress fails from backlog',
      seedEntities: [
        {
          entity: 'Task',
          id: 'task-1',
          properties: { status: 'backlog' },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Task',
          id: 'task-1',
          command: 'startProgress',
          params: {},
          expect: {
            success: true,
          },
        },
      ],
    };

    await writeFile(manifestPath, manifest);
    await writeFile(scriptPath, JSON.stringify(script, null, 2));

    const { harnessCommand } = await import('./harness.js');
    const capture = captureOutput();

    const originalExit = process.exit;
    const exitMock = vi.fn().mockImplementation(() => {
      throw new Error('exit');
    });
    process.exit = exitMock as any;

    try {
      await harnessCommand(manifestPath, { script: scriptPath, format: 'json' });
      expect.fail('Expected harness command to exit');
    } catch (error) {
      expect((error as Error).message).toBe('exit');
      const jsonOutput = capture.outputs.find((item) => item.includes('"summary"'));
      expect(jsonOutput).toBeDefined();

      const parsed = JSON.parse(jsonOutput as string);
      expect(parsed.summary.totalSteps).toBe(1);
      expect(parsed.summary.failedSteps).toBe(1);
      expect(parsed.summary.assertionsFailed).toBeGreaterThan(0);
    } finally {
      process.exit = originalExit;
      capture.restore();
      await cleanupDir(tempDir);
    }
  });
});
