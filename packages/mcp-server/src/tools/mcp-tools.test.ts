/**
 * Tests for MCP server tool handlers.
 *
 * Tests the compile, validate, execute, and explain tool handlers directly
 * without going through the MCP SDK transport layer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleCompile } from './compile.js';
import { handleValidate } from './validate.js';
import { handleExecute } from './execute.js';
import { handleExplain } from './explain.js';
import { sessionStore } from '../state/session-store.js';

const VALID_MANIFEST = `
entity Order {
  property id: string
  property status: string = "pending"
  property total: number = 0

  command placeOrder(items: number) {
    guard status == "pending"
    mutate status = "placed"
    mutate total = items * 10
    emit OrderPlaced
  }

  constraint positiveTotal {
    severity: block
    expression: total >= 0
    message: "Total must be non-negative"
  }
}

store Order in memory

event OrderPlaced: "order.placed" {
  orderId: string
}
`;

const INVALID_MANIFEST = `
entity 123Invalid {
  property = "bad"
}
`;

describe('MCP compile tool', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('compiles valid manifest source to IR', async () => {
    const result = await handleCompile({ source: VALID_MANIFEST });

    expect(result.contentHash).toBeTruthy();
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ir).not.toBeNull();
    expect(result.diagnostics).toEqual([]);
    expect(result.summary.entityCount).toBe(1);
    expect(result.summary.hasErrors).toBe(false);
  });

  it('returns diagnostics for invalid source', async () => {
    const result = await handleCompile({ source: INVALID_MANIFEST });

    expect(result.ir).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.entityCount).toBe(0);
  });

  it('caches IR in session store after compile', async () => {
    const result = await handleCompile({ source: VALID_MANIFEST });

    const cached = sessionStore.get(result.contentHash);
    expect(cached).toBeDefined();
    expect(cached!.ir).toBe(result.ir);
  });

  it('returns same contentHash for same source', async () => {
    const result1 = await handleCompile({ source: VALID_MANIFEST });
    const result2 = await handleCompile({ source: VALID_MANIFEST });

    expect(result1.contentHash).toBe(result2.contentHash);
  });

  it('includes command count in summary', async () => {
    const result = await handleCompile({ source: VALID_MANIFEST });

    expect(result.summary.commandCount).toBe(1);
  });
});

describe('MCP validate tool', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('validates valid source as valid', async () => {
    const result = await handleValidate({ source: VALID_MANIFEST });

    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it('validates invalid source as invalid', async () => {
    const result = await handleValidate({ source: INVALID_MANIFEST });

    expect(result.valid).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it('does not cache IR (unlike compile)', async () => {
    await handleValidate({ source: VALID_MANIFEST });

    // No entries in the session store from validate
    const entries = sessionStore.list();
    expect(entries).toEqual([]);
  });

  it('counts warnings correctly', async () => {
    // A valid manifest with a warning-generating pattern
    const result = await handleValidate({ source: VALID_MANIFEST });

    // The valid manifest should have 0 warnings
    expect(result.warningCount).toBe(0);
  });
});

describe('MCP execute tool', () => {
  let contentHash: string;

  beforeEach(async () => {
    sessionStore.clear();
    const compileResult = await handleCompile({ source: VALID_MANIFEST });
    contentHash = compileResult.contentHash;
  });

  it('returns error for unknown contentHash', async () => {
    const result = await handleExecute({
      contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
      commandName: 'placeOrder',
      input: { items: 5 },
      entityName: 'Order',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No compiled IR found');
  });

  it('executes a command successfully', async () => {
    // Compile a simple command that doesn't require an instance
    sessionStore.clear();
    const compileResult = await handleCompile({
      source: `
entity Greeter {
  property name: string
  command greet(name: string) {
    mutate result = "Hello, " + name
  }
}
`,
    });
    contentHash = compileResult.contentHash;

    const result = await handleExecute({
      contentHash,
      commandName: 'greet',
      input: { name: 'World' },
      entityName: 'Greeter',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('includes guard failure diagnostics when guard fails', async () => {
    // Compile a command with a guard
    sessionStore.clear();
    const compileResult = await handleCompile({
      source: `
entity User {
  property name: string
  command updateName(newName: string) {
    guard newName != ""
    mutate result = true
  }
}
`,
    });
    contentHash = compileResult.contentHash;

    const result = await handleExecute({
      contentHash,
      commandName: 'updateName',
      input: { newName: '' },
      entityName: 'User',
    });

    expect(result.success).toBe(false);
    expect(result.guardFailure).toBeDefined();
  });
});

describe('MCP explain tool', () => {
  let contentHash: string;

  beforeEach(async () => {
    sessionStore.clear();
    const compileResult = await handleCompile({ source: VALID_MANIFEST });
    contentHash = compileResult.contentHash;
  });

  it('explains an entity', () => {
    const result = handleExplain({
      contentHash,
      target: 'entity',
      name: 'Order',
    });

    expect(result.explanation).toContain('Entity: Order');
    expect(result.explanation).toContain('Properties:');
    expect(result.explanation).toContain('Commands:');
    expect(result.details).toBeDefined();
  });

  it('explains a command', () => {
    const result = handleExplain({
      contentHash,
      target: 'command',
      name: 'placeOrder',
      entityName: 'Order',
    });

    expect(result.explanation).toContain('Command: placeOrder');
    expect(result.explanation).toContain('Entity: Order');
    expect(result.explanation).toContain('Parameters:');
    expect(result.explanation).toContain('Guards');
  });

  it('returns error for unknown contentHash', () => {
    const result = handleExplain({
      contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
      target: 'entity',
      name: 'Order',
    });

    expect(result.explanation).toContain('No compiled IR found');
  });

  it('returns error for unknown entity name', () => {
    const result = handleExplain({
      contentHash,
      target: 'entity',
      name: 'NonExistent',
    });

    expect(result.explanation).toContain('not found');
  });

  it('returns error for unknown command name', () => {
    const result = handleExplain({
      contentHash,
      target: 'command',
      name: 'nonExistent',
    });

    expect(result.explanation).toContain('not found');
  });
});
