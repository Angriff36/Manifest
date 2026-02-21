/**
 * CLI Validate Command Tests
 *
 * Tests the manifest validate command for IR validation against the real
 * ir-v1.schema.json. Fixtures must conform to the actual schema — no invented
 * fields (e.g. "metadata") that do not exist in the spec.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
// ---------------------------------------------------------------------------
// Minimal valid IR fixture (matches ir-v1.schema.json required fields)
// ---------------------------------------------------------------------------
function makeValidIR(overrides = {}) {
    return {
        version: '1.0',
        provenance: {
            contentHash: 'abc123',
            compilerVersion: '0.3.21',
            schemaVersion: '1.0',
            compiledAt: '2026-02-21T00:00:00.000Z',
        },
        modules: [],
        entities: [],
        stores: [],
        events: [],
        commands: [],
        policies: [],
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createTempIR(content, filename = 'test.ir.json') {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-validate-test-'));
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, JSON.stringify(content), 'utf-8');
    return filePath;
}
async function cleanupTemp(filePath) {
    try {
        await fs.rm(path.dirname(filePath), { recursive: true, force: true });
    }
    catch {
        // ignore
    }
}
function captureOutput() {
    const outputs = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => { outputs.push(a.join(' ')); });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...a) => { outputs.push(a.join(' ')); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => { outputs.push(a.join(' ')); });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((d) => { outputs.push(String(d)); return true; });
    return {
        outputs,
        restore: () => { logSpy.mockRestore(); errorSpy.mockRestore(); warnSpy.mockRestore(); stderrSpy.mockRestore(); },
    };
}
/** Run validateCommand, swallowing the process.exit(1) it calls on failure. */
async function runValidate(filePath, opts = { strict: false }) {
    const { validateCommand } = await import('./validate.js');
    const capture = captureOutput();
    let exited = false;
    const originalExit = process.exit;
    process.exit = vi.fn().mockImplementation(() => { exited = true; throw new Error('process.exit'); });
    try {
        await validateCommand(filePath, opts);
    }
    catch (e) {
        if (e.message !== 'process.exit')
            throw e;
    }
    finally {
        process.exit = originalExit;
        capture.restore();
    }
    return { outputs: capture.outputs, exited };
}
// ---------------------------------------------------------------------------
// Valid IR
// ---------------------------------------------------------------------------
describe('Validate Command – valid IR', () => {
    beforeEach(() => { vi.resetModules(); });
    it('passes for a minimal valid IR', async () => {
        const filePath = await createTempIR(makeValidIR());
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(false);
            expect(outputs.join(' ')).toMatch(/valid/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('passes when optional irHash is present in provenance', async () => {
        const filePath = await createTempIR(makeValidIR({
            provenance: {
                contentHash: 'abc123',
                irHash: 'def456',
                compilerVersion: '0.3.21',
                schemaVersion: '1.0',
                compiledAt: '2026-02-21T00:00:00.000Z',
            },
        }));
        try {
            const { exited } = await runValidate(filePath);
            expect(exited).toBe(false);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
});
// ---------------------------------------------------------------------------
// Invalid IR – top-level required fields
// ---------------------------------------------------------------------------
describe('Validate Command – missing top-level required fields', () => {
    beforeEach(() => { vi.resetModules(); });
    it('fails when version is missing', async () => {
        const ir = makeValidIR();
        delete ir.version;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/version/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when provenance is missing', async () => {
        const ir = makeValidIR();
        delete ir.provenance;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/provenance/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when modules is missing', async () => {
        const ir = makeValidIR();
        delete ir.modules;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/modules/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when entities is missing', async () => {
        const ir = makeValidIR();
        delete ir.entities;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/entities/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when commands is missing', async () => {
        const ir = makeValidIR();
        delete ir.commands;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/commands/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
});
// ---------------------------------------------------------------------------
// Invalid IR – provenance required fields
// ---------------------------------------------------------------------------
describe('Validate Command – provenance validation', () => {
    beforeEach(() => { vi.resetModules(); });
    it('fails when provenance.contentHash is missing', async () => {
        const ir = makeValidIR();
        delete ir.provenance.contentHash;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/contentHash/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when provenance.compilerVersion is missing', async () => {
        const ir = makeValidIR();
        delete ir.provenance.compilerVersion;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/compilerVersion/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when provenance.compiledAt is missing', async () => {
        const ir = makeValidIR();
        delete ir.provenance.compiledAt;
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/compiledAt/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
    it('fails when provenance has an unknown additional property', async () => {
        const ir = makeValidIR();
        ir.provenance.sources = ['foo.manifest']; // not in schema (additionalProperties: false)
        const filePath = await createTempIR(ir);
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/sources|unknown/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
});
// ---------------------------------------------------------------------------
// Invalid IR – version const
// ---------------------------------------------------------------------------
describe('Validate Command – version field', () => {
    beforeEach(() => { vi.resetModules(); });
    it('fails when version is not "1.0"', async () => {
        const filePath = await createTempIR(makeValidIR({ version: '2.0' }));
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/version/i);
        }
        finally {
            await cleanupTemp(filePath);
        }
    });
});
// ---------------------------------------------------------------------------
// File-level errors
// ---------------------------------------------------------------------------
describe('Validate Command – file errors', () => {
    beforeEach(() => { vi.resetModules(); });
    it('fails for invalid JSON', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-validate-test-'));
        const filePath = path.join(tempDir, 'bad.ir.json');
        await fs.writeFile(filePath, '{ not valid json', 'utf-8');
        try {
            const { outputs, exited } = await runValidate(filePath);
            expect(exited).toBe(true);
            expect(outputs.join(' ')).toMatch(/JSON|Invalid/i);
        }
        finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
    it('fails for a missing file', async () => {
        const { outputs, exited } = await runValidate('/nonexistent/path/test.ir.json');
        expect(exited).toBe(true);
        expect(outputs.join(' ')).toMatch(/not found|ENOENT/i);
    });
});
//# sourceMappingURL=validate.test.js.map