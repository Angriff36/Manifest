/**
 * Integration smoke test — MCP handler pipeline.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleCompile } from './compile.js';
import { handleValidate } from './validate.js';
import { handleExecute } from './execute.js';
import { handleExplain } from './explain.js';
import { sessionStore } from '../state/session-store.js';

const MANIFEST = `
entity Product {
  property id: string
  property name: string = ""
  property price: number = 0

  command setPrice(newPrice: number) {
    guard newPrice > 0
    mutate price = newPrice
    emit PriceChanged
  }
}

event PriceChanged: "product.price.changed" {}

store Product in memory
`;

describe('MCP integration smoke', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('runs compile → validate → explain → execute via handlers', async () => {
    const compiled = await handleCompile({ source: MANIFEST });
    expect(compiled.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(compiled.ir?.entities).toHaveLength(1);

    const validated = await handleValidate({ source: MANIFEST });
    expect(validated.valid).toBe(true);

    const explained = handleExplain({
      contentHash: compiled.contentHash,
      target: 'command',
      name: 'setPrice',
      entityName: 'Product',
    });
    expect(explained.explanation).toContain('Command: setPrice');

    const greeter = await handleCompile({
      source: `
entity Greeter {
  property name: string
  command greet(name: string) {
    mutate result = "Hello, " + name
  }
}
`,
    });

    const executed = await handleExecute({
      contentHash: greeter.contentHash,
      commandName: 'greet',
      entityName: 'Greeter',
      input: { name: 'MCP' },
      context: { user: { id: 'u1', role: 'admin' } },
    });
    expect(executed.success).toBe(true);
  });
});
