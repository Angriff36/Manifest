/**
 * CLI Validate Command Tests
 *
 * Tests the manifest validate command for IR validation against schema.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper to create temp IR files
async function createTempIR(content: object, filename: string = 'test.ir.json'): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-validate-test-'));
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, JSON.stringify(content), 'utf-8');
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

// Helper to capture all console output
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
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data: any) => {
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

describe('Validate Command - Valid IR', () => {
  it('should pass validation for valid IR with entities', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
        schemaVersion: 'v1',
        compiledAt: '2026-02-14T00:00:00Z',
      },
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      await validateCommand(filePath, { strict: false });

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/valid|Valid/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should pass validation for valid IR with commands', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
        schemaVersion: 'v1',
      },
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
      commands: [
        {
          name: 'increment',
          entity: 'Counter',
          guards: [],
          actions: [],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      await validateCommand(filePath, { strict: false });

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/valid|Valid/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Validate Command - Invalid IR', () => {
  it('should fail for IR missing metadata', async () => {
    const ir = {
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/metadata|Missing/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail for IR missing both entities and commands', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
      },
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/entities|commands/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail for entity missing name', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
      },
      entities: [
        {
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/name.*required/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail for entity missing properties array', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
      },
      entities: [
        {
          name: 'Counter',
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/properties.*array/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail for invalid JSON file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-validate-test-'));
    const filePath = path.join(tempDir, 'invalid.ir.json');
    await fs.writeFile(filePath, '{ invalid json', 'utf-8');

    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/JSON|Invalid/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Validate Command - Strict Mode', () => {
  it('should pass in strict mode when IR is fully valid', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
        schemaVersion: 'v1',
      },
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      await validateCommand(filePath, { strict: true });

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/valid|Valid/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail in strict mode for missing schemaVersion warning', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
        // schemaVersion is recommended but not required
      },
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: true });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      // Should fail because strict mode treats warnings as errors
      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/schemaVersion|STRICT/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Validate Command - Commands Array', () => {
  it('should fail for commands not being an array', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
      },
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
      commands: 'not an array',
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/commands.*array/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should fail for command missing name', async () => {
    const ir = {
      metadata: {
        compilerVersion: '0.3.8',
      },
      entities: [
        {
          name: 'Counter',
          properties: [{ name: 'count', type: 'number' }],
        },
      ],
      commands: [
        {
          entity: 'Counter',
          guards: [],
          actions: [],
        },
      ],
    };

    const filePath = await createTempIR(ir);
    try {
      const { validateCommand } = await import('./validate.js');
      const capture = captureOutput();

      const originalExit = process.exit;
      const exitMock = vi.fn().mockImplementation(() => { throw new Error('exit'); });
      process.exit = exitMock as any;

      try {
        await validateCommand(filePath, { strict: false });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toBe('exit');
      }

      process.exit = originalExit;

      const allOutput = capture.outputs.join(' ');
      expect(allOutput).toMatch(/commands.*name/i);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});
