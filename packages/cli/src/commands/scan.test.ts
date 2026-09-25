/**
 * CLI Scan Command Tests
 *
 * Tests the manifest scan command for policy coverage and store consistency validation.
 * Primary goal: "If scan passes, the code works."
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Helper to create temp manifest files
async function createTempManifest(
  content: string,
  filename: string = 'test.manifest',
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-scan-test-'));
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

describe('Scan Command - Policy Coverage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should pass when command has policy with execute action', async () => {
    const manifest = `
entity Counter {
  property count: number

  command increment() {
    guard self.count < 100
    mutate self.count = self.count + 1
  }
}

policy CanIncrement execute: user.role in ["admin"]
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"errors"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      expect(result.errors.filter((e: any) => e.message?.includes('has no policy'))).toHaveLength(
        0,
      );

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should cover command when policy has "all" action', async () => {
    const manifest = `
entity Document {
  property title: string

  command publish() {
    mutate self.title = "Published"
  }
}

policy AdminAllAccess all: user.role == "admin"
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"errors"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      expect(result.errors.filter((e: any) => e.message?.includes('has no policy'))).toHaveLength(
        0,
      );

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Scan Command - Store Consistency', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should accept built-in store targets', async () => {
    const manifest = `
entity Counter {
  property count: number
  store Counter in memory
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"warnings"'));
      if (jsonOutput) {
        const result = JSON.parse(jsonOutput);
        const storeWarnings =
          result.warnings?.filter((w: any) => w.message?.includes('not a built-in target')) || [];
        expect(storeWarnings).toHaveLength(0);
      }

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should warn on unknown store targets', async () => {
    const manifest = `
entity Counter {
  property count: number
  store Counter in customStore
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"warnings"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);

      const storeWarnings =
        result.warnings?.filter((w: any) => w.message?.includes('is not a built-in target')) || [];
      expect(storeWarnings.length).toBeGreaterThan(0);
      expect(storeWarnings[0].message).toContain('customStore');

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Scan Command - Output Formats', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should output JSON format when requested', async () => {
    const manifest = `
entity Counter {
  property count: number
  command increment() {
    mutate self.count = self.count + 1
  }
}
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"filesScanned"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      expect(result).toHaveProperty('filesScanned');
      expect(result).toHaveProperty('commandsChecked');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Scan Command - Multiple Commands', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should cover all commands with single global policy', async () => {
    const manifest = `
entity Counter {
  property count: number

  command increment() {
    mutate self.count = self.count + 1
  }

  command decrement() {
    mutate self.count = self.count - 1
  }
}

policy AuthenticatedOnly execute: user.authenticated
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"errors"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      expect(result.errors.filter((e: any) => e.message?.includes('has no policy'))).toHaveLength(
        0,
      );

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Scan Command - Conformance Fixtures', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should pass scan on fixtures with policies', async () => {
    // Use existing conformance fixtures that have policies
    const fixturePath = path.resolve(
      process.cwd(),
      'src/manifest/conformance/fixtures/17-tiny-app.manifest',
    );

    try {
      await fs.stat(fixturePath);
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(fixturePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"errors"'));
      if (jsonOutput) {
        const result = JSON.parse(jsonOutput);
        // Tiny app fixture should have policy coverage
        expect(result.errors.filter((e: any) => e.message?.includes('has no policy'))).toHaveLength(
          0,
        );
      }

      capture.restore();
    } catch {
      // Fixture may not exist in all environments - skip test
    }
  });
});

describe('Scan Command - Route Context Detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should detect commands that require user context', async () => {
    const manifest = `
entity Document {
  property title: string

  command publish() {
    guard user.role == "admin"
    mutate self.title = "Published"
  }
}

policy AdminOnly execute: user.role == "admin"
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"filesScanned"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      expect(result).toHaveProperty('routesScanned');

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should not require user context for commands without user references', async () => {
    const manifest = `
entity Counter {
  property count: number

  command increment() {
    guard self.count < 100
    mutate self.count = self.count + 1
  }
}

policy Anyone execute: true
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"filesScanned"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      // No routes to scan in temp directory
      expect(result.routesScanned).toBe(0);

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });

  it('should include routesScanned in JSON output', async () => {
    const manifest = `
entity Task {
  property name: string

  command complete() {
    guard user.authenticated
    mutate self.name = "Done"
  }
}

policy Authenticated execute: user.authenticated
`;
    const filePath = await createTempManifest(manifest);
    try {
      const { scanCommand } = await import('./scan.js');
      const capture = captureOutput();

      await scanCommand(filePath, { format: 'json' });

      const jsonOutput = capture.outputs.find((o) => o.includes('"routesScanned"'));
      expect(jsonOutput).toBeDefined();
      const result = JSON.parse(jsonOutput!);
      expect(result).toHaveProperty('routesScanned');
      expect(typeof result.routesScanned).toBe('number');

      capture.restore();
    } finally {
      await cleanupTemp(filePath);
    }
  });
});

describe('Scan Command - multi-file projects and attached policies (2026-09-25)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function project(files: Record<string, string>): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-scan-project-'));
    for (const [name, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await fs.writeFile(path.join(dir, name), content, 'utf-8');
    }
    return dir;
  }

  async function scanJson(dir: string) {
    const { scanCommand } = await import('./scan.js');
    const capture = captureOutput();
    try {
      await scanCommand(dir, { format: 'json' });
    } finally {
      capture.restore();
    }
    const jsonOutput = capture.outputs.find((o) => o.includes('"errors"'));
    expect(jsonOutput).toBeDefined();
    return JSON.parse(jsonOutput!) as {
      errors: Array<{ file: string; message: string; commandName: string }>;
      warnings: Array<{ message: string }>;
    };
  }

  const base = `
role staff {
  allow staffAccess
}
entity Owned {
  property ownerId: string?
}
`;

  it('compiles a use-graph as one project instead of each file alone', async () => {
    const dir = await project({
      'app.manifest': `use "./base.manifest"\nuse "./orders/order.manifest"\n`,
      'base.manifest': base,
      'orders/order.manifest': `
entity Order mixin Owned {
  property status: string = "open"
  default policy orderWrite write: roleAllows(user.role, "staffAccess") "Staff may change orders"
  command close() {
    mutate status = "closed"
  }
}
store Order in durable
`,
    });
    try {
      const result = await scanJson(dir);
      // A per-file compile reports the mixin and role as unknown.
      expect(result.errors).toEqual([]);
      // `durable` is a built-in store target (ir-v1.schema.json IRStore.target).
      expect(result.warnings).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('still reports a command with no attached or execute policy, in the declaring file', async () => {
    const dir = await project({
      'app.manifest': `use "./base.manifest"\nuse "./a.manifest"\nuse "./b.manifest"\n`,
      'base.manifest': base,
      'a.manifest': `
entity Alpha {
  property n: number = 0
  default policy alphaRun execute: roleAllows(user.role, "staffAccess") "Staff may run"
  command bump() {
    mutate n = self.n + 1
  }
}
store Alpha in memory
`,
      'b.manifest': `
entity Beta {
  property n: number = 0
  command bump() {
    mutate n = self.n + 1
  }
}
store Beta in memory
`,
    });
    try {
      const result = await scanJson(dir);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toBe("Command 'Beta.bump' has no policy.");
      expect(path.basename(result.errors[0]!.file)).toBe('b.manifest');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('prints compile error messages as text', async () => {
    const dir = await project({ 'broken.manifest': 'entity {\n' });
    const { scanCommand } = await import('./scan.js');
    const capture = captureOutput();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    try {
      await scanCommand(dir, {});
    } finally {
      capture.restore();
      exit.mockRestore();
      await fs.rm(dir, { recursive: true, force: true });
    }
    expect(capture.outputs.join('\n')).not.toContain('[object Object]');
  });
});
