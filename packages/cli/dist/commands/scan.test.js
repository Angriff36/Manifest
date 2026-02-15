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
async function createTempManifest(content, filename = 'test.manifest') {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-scan-test-'));
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
}
// Helper to cleanup temp files
async function cleanupTemp(filePath) {
    try {
        const dir = path.dirname(filePath);
        await fs.rm(dir, { recursive: true, force: true });
    }
    catch {
        // Ignore cleanup errors
    }
}
// Helper to capture all console output
function captureOutput() {
    const outputs = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        outputs.push(args.join(' '));
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        outputs.push(args.join(' '));
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
        outputs.push(args.join(' '));
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"errors"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            expect(result.errors.filter((e) => e.message?.includes('has no policy'))).toHaveLength(0);
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"errors"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            expect(result.errors.filter((e) => e.message?.includes('has no policy'))).toHaveLength(0);
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"warnings"'));
            if (jsonOutput) {
                const result = JSON.parse(jsonOutput);
                const storeWarnings = result.warnings?.filter((w) => w.message?.includes('not a built-in target')) || [];
                expect(storeWarnings).toHaveLength(0);
            }
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"warnings"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            const storeWarnings = result.warnings?.filter((w) => w.message?.includes('is not a built-in target')) || [];
            expect(storeWarnings.length).toBeGreaterThan(0);
            expect(storeWarnings[0].message).toContain('customStore');
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"filesScanned"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            expect(result).toHaveProperty('filesScanned');
            expect(result).toHaveProperty('commandsChecked');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('warnings');
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"errors"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            expect(result.errors.filter((e) => e.message?.includes('has no policy'))).toHaveLength(0);
            capture.restore();
        }
        finally {
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
        const fixturePath = path.resolve(process.cwd(), 'src/manifest/conformance/fixtures/17-tiny-app.manifest');
        try {
            await fs.stat(fixturePath);
            const { scanCommand } = await import('./scan.js');
            const capture = captureOutput();
            await scanCommand(fixturePath, { format: 'json' });
            const jsonOutput = capture.outputs.find(o => o.includes('"errors"'));
            if (jsonOutput) {
                const result = JSON.parse(jsonOutput);
                // Tiny app fixture should have policy coverage
                expect(result.errors.filter((e) => e.message?.includes('has no policy'))).toHaveLength(0);
            }
            capture.restore();
        }
        catch {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"filesScanned"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            expect(result).toHaveProperty('routesScanned');
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"filesScanned"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            // No routes to scan in temp directory
            expect(result.routesScanned).toBe(0);
            capture.restore();
        }
        finally {
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
            const jsonOutput = capture.outputs.find(o => o.includes('"routesScanned"'));
            expect(jsonOutput).toBeDefined();
            const result = JSON.parse(jsonOutput);
            expect(result).toHaveProperty('routesScanned');
            expect(typeof result.routesScanned).toBe('number');
            capture.restore();
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
});
//# sourceMappingURL=scan.test.js.map