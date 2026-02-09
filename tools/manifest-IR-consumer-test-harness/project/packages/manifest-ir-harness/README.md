# @repo/manifest-ir-harness

Test harness for Manifest IR consumers. Given a Manifest source or IR JSON file, runs scripted commands against the runtime and produces deterministic snapshot outputs (results, emitted events, denial diagnostics).

## Install

```bash
# In a pnpm workspace
pnpm add @repo/manifest-ir-harness --filter your-package

# Standalone
npm install
```

## Usage

### CLI

```bash
# Run a single script against an IR file
harness run --ir path/to/file.ir.json --script path/to/script.json

# Run a script, compiling a manifest source first
harness run --manifest path/to/file.manifest --script path/to/script.json

# Auto-discover and run all fixtures in a directory
harness fixtures --dir path/to/fixtures

# Write output to a file
harness run --ir test.ir.json --script script.json --output results.json

# Snapshot-friendly output (normalized timestamps)
harness run --ir test.ir.json --script script.json --snapshot
```

During development (without building):

```bash
npm run harness -- run --ir test.ir.json --script script.json
```

### Programmatic API

```typescript
import { runScript, validateScript } from '@repo/manifest-ir-harness';

// Validate a script
const validation = validateScript(scriptObject);
if (!validation.valid) {
  console.error(validation.errors);
}

// Run against IR
const result = await runScript({
  irSource: irJsonObject,
  script: scriptObject,
});

// Run against manifest source (compile first)
const result2 = await runScript({
  manifestSource: manifestSourceString,
  script: scriptObject,
});

console.log(result.summary);
// { totalSteps: 1, passed: 1, failed: 0, assertionsPassed: 3, assertionsFailed: 0 }
```

### Vitest Integration

```typescript
import { describe, it, expect } from 'vitest';
import { runScript, normalizeForSnapshot } from '@repo/manifest-ir-harness';

describe('my IR consumer', () => {
  it('handles order submission', async () => {
    const result = await runScript({
      irSource: myIR,
      script: myScript,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const normalized = normalizeForSnapshot(result);
    expect(normalized).toMatchSnapshot();
  });
});
```

## Script Format

Scripts are JSON files that define test scenarios:

```json
{
  "description": "Order submission with valid guards",
  "context": {
    "user": { "id": "user-1", "role": "customer" }
  },
  "seedEntities": [
    {
      "entity": "Order",
      "id": "order-1",
      "properties": { "status": "draft", "items": [{ "id": "item-1" }] }
    }
  ],
  "commands": [
    {
      "step": 1,
      "entity": "Order",
      "id": "order-1",
      "command": "submit",
      "params": {},
      "expect": {
        "success": true,
        "stateAfter": { "status": "submitted" },
        "emittedEvents": ["orderSubmitted"]
      }
    }
  ]
}
```

### Script Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | Human-readable description of the test scenario |
| `context` | No | Runtime context (user info, custom data) |
| `context.user` | No | User context with `id` and optional `role` |
| `seedEntities` | No | Entities to create before running commands |
| `commands` | Yes | Ordered list of commands to execute |

### Command Fields

| Field | Required | Description |
|-------|----------|-------------|
| `step` | Yes | Sequential step number |
| `entity` | Yes | Entity type name |
| `id` | Yes | Entity instance ID |
| `command` | Yes | Command name to execute |
| `params` | No | Command parameters |
| `expect` | Yes | Assertion expectations |

### Expectation Fields

| Field | Description |
|-------|-------------|
| `success` | Whether the command should succeed (required) |
| `error.type` | Expected error type: `guard`, `policy`, or `constraint` |
| `error.message` | Partial match on error message |
| `error.guardIndex` | Expected failing guard index |
| `stateAfter` | Partial match on entity state after command |
| `emittedEvents` | Expected event names in exact order |
| `constraintWarnings` | Expected constraint warning names |

## Fixture Directory Convention

```
fixtures/
  01-simple-command/
    test.ir.json      # IR file
    script.json        # Test script
  02-guard-denial/
    test.ir.json
    script.json
```

Each fixture directory must contain a `script.json` and either `test.ir.json` or `test.manifest`.

## Wiring the Adapter (Portability)

The adapter boundary is at `src/adapters/manifest-core.ts`. This is the ONLY file that needs replacing when porting to another repo.

### Default (Stub) Adapter

The default adapter provides a simple in-memory runtime for testing. It supports:
- Entity seeding and state management
- Guard evaluation (path-based checks with operators: eq, neq, gt, gte, lt, lte)
- State transitions
- Event emission

### Replacing the Adapter

To wire your real Manifest runtime:

1. Copy this package into your repo
2. Replace `src/adapters/manifest-core.ts` with your implementation:

```typescript
import { compile } from 'your-manifest-compiler';
import { Runtime } from 'your-manifest-runtime';
import type { ManifestAdapter, RuntimeEngine, IR, CompileResult, RuntimeContext, CommandResult } from '../types/index.js';

class YourRuntimeEngine implements RuntimeEngine {
  private runtime: Runtime;

  constructor(ir: IR) {
    this.runtime = new Runtime(ir);
  }

  seedEntity(entity: string, id: string, properties: Record<string, unknown>): void {
    this.runtime.seed(entity, id, properties);
  }

  executeCommand(
    entity: string,
    id: string,
    command: string,
    params: Record<string, unknown>,
    context: RuntimeContext
  ): CommandResult {
    // Map your runtime's result to CommandResult
    const result = this.runtime.execute(entity, id, command, params, context);
    return {
      success: result.ok,
      entityStateAfter: result.state,
      emittedEvents: result.events.map(e => ({ name: e.name, data: e.data })),
      guardFailures: result.guardErrors?.map((g, i) => ({
        guardIndex: i,
        expression: g.expr,
        resolvedValues: g.resolved,
        evaluatedTo: false,
      })) ?? null,
      constraintWarnings: result.warnings ?? [],
      error: result.ok ? undefined : {
        type: result.errorType,
        message: result.errorMessage,
      },
    };
  }

  getEntityState(entity: string, id: string): Record<string, unknown> | null {
    return this.runtime.getState(entity, id);
  }
}

export const adapter: ManifestAdapter = {
  async compile(source: string): Promise<CompileResult> {
    const result = await compile(source);
    return {
      ir: result.ir,
      diagnostics: result.diagnostics,
    };
  },
  createRuntime(ir: IR): RuntimeEngine {
    return new YourRuntimeEngine(ir);
  },
};

export type { ManifestAdapter, RuntimeEngine, IR, CompileResult };
```

3. All tests and CLI commands work as before with your real runtime.

## Output Format

The harness produces stable, deterministic JSON output with sorted keys:

```json
{
  "harness": { "version": "1.0.0", "executedAt": "..." },
  "source": { "type": "ir", "path": "...", "irHash": "sha256:..." },
  "script": { "path": "...", "description": "..." },
  "execution": {
    "context": { ... },
    "steps": [
      {
        "step": 1,
        "command": { "entity": "Order", "id": "order-1", "name": "submit", "params": {} },
        "result": {
          "success": true,
          "entityStateAfter": { ... },
          "emittedEvents": [{ "name": "orderSubmitted", "data": {} }],
          "guardFailures": null,
          "constraintWarnings": []
        },
        "assertions": {
          "passed": 3,
          "failed": 0,
          "details": [ ... ]
        }
      }
    ]
  },
  "summary": { "totalSteps": 1, "passed": 1, "failed": 0, "assertionsPassed": 3, "assertionsFailed": 0 }
}
```

## Development

```bash
npm run build     # Compile TypeScript
npm run test      # Run tests
npm run harness   # Run CLI (dev mode via tsx)
```
