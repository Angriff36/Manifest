# Manifest IR Consumer Test Harness

Test harness for validating Manifest IR consumers and runtime behavior. Write declarative test scripts, execute them against Manifest IR, and get deterministic, snapshot-able outputs for regression testing.

## Installation

```bash
npm install manifest-ir-harness
```

## Quick Start

```typescript
import { executeScript, parseScript } from 'manifest-ir-harness';
import type { IR } from 'manifest-ir-harness';

const ir: IR = {
  entities: [{
    name: 'Order',
    properties: [
      { name: 'status', type: 'string', default: 'draft' },
      { name: 'items', type: 'array', default: [] }
    ],
    commands: [{
      name: 'submit',
      guards: [
        { expression: 'self.status == "draft"' },
        { expression: 'self.items.length > 0' }
      ],
      mutations: [{ property: 'status', value: 'submitted' }],
      events: [{ name: 'orderSubmitted' }]
    }]
  }]
};

const script = parseScript({
  description: 'Submit an order',
  seedEntities: [{
    entity: 'Order',
    id: 'order-1',
    properties: { status: 'draft', items: [{ id: 'item-1' }] }
  }],
  commands: [{
    step: 1,
    entity: 'Order',
    id: 'order-1',
    command: 'submit',
    expect: {
      success: true,
      stateAfter: { status: 'submitted' },
      emittedEvents: ['orderSubmitted']
    }
  }]
});

const result = await executeScript({ ir, script });
console.log(JSON.stringify(result, null, 2));
```

## CLI Usage

### Run a script against an IR file

```bash
manifest-harness run --ir ./test.ir.json --script ./script.json
```

### Run a script against a .manifest source file

```bash
manifest-harness run --manifest ./test.manifest --script ./script.json
```

### Save output to a file

```bash
manifest-harness run --ir ./test.ir.json --script ./script.json --output ./results.json
```

### Auto-discover and run all fixtures

```bash
manifest-harness fixtures --dir ./fixtures
```

## Programmatic API

### `executeScript(options)`

Execute a test script against an IR definition.

```typescript
import { executeScript } from 'manifest-ir-harness';

const result = await executeScript({
  ir,           // IR object
  script,       // TestScript object
  sourcePath,   // Optional: path to source file
  sourceType,   // Optional: 'manifest' | 'ir'
  scriptPath,   // Optional: path to script file
  irHash,       // Optional: hash of IR for tracking
  executedAt,   // Optional: ISO timestamp (defaults to now)
});
```

### `parseScript(input)`

Validate and parse a test script from JSON.

```typescript
import { parseScript } from 'manifest-ir-harness';

const script = parseScript(jsonData);
```

### `validateScript(input)`

Validate a script without throwing.

```typescript
import { validateScript } from 'manifest-ir-harness';

const { valid, errors } = validateScript(jsonData);
```

### `formatOutput(result)` / `formatForSnapshot(result)`

Format execution results as deterministic JSON.

```typescript
import { formatOutput, formatForSnapshot } from 'manifest-ir-harness';

const json = formatOutput(result);           // Full output
const snapshot = formatForSnapshot(result);  // Timestamps stripped
```

## Script Format

A test script is a JSON file with this structure:

| Field | Type | Description |
|---|---|---|
| `description` | string | Human-readable test description |
| `context` | object | Runtime context (user, custom data) |
| `context.user` | object | User context with `id` and optional `role` |
| `seedEntities` | array | Entities to create before running commands |
| `commands` | array | Commands to execute in order |

Each command has:

| Field | Type | Description |
|---|---|---|
| `step` | number | Sequential step number |
| `entity` | string | Entity name (e.g., "Order") |
| `id` | string | Instance ID |
| `command` | string | Command name |
| `params` | object | Command parameters |
| `expect.success` | boolean | Expected outcome |
| `expect.error` | object | Expected error details |
| `expect.stateAfter` | object | Partial match on entity state after command |
| `expect.emittedEvents` | string[] | Expected event names in order |

## Output Format

The execution result includes:

- **harness**: Version and execution timestamp
- **source**: IR/manifest file path and hash
- **script**: Script path and description
- **execution**: Context and step-by-step results with assertions
- **summary**: Total counts for steps and assertions

Output is deterministic with sorted keys for stable diffs.

## Porting to Another Repo

The adapter pattern makes this harness portable:

1. Copy the `manifest-ir-harness` package to your project
2. Replace `src/adapters/manifest-core.ts` with your implementation
3. Wire the `compile()` and `createRuntime()` methods to your IR compiler and runtime
4. Run tests to verify integration

Only `manifest-core.ts` imports from Manifest. All other files use the adapter interfaces.

## Examples

See the `fixtures/` directory for complete examples:

- `01-simple-command` - Basic command execution with guards, mutations, and events
- `02-guard-denial` - Guard failure when preconditions aren't met
- `03-events-ordering` - Multiple sequential commands with event ordering

## Development

```bash
npm install
npm run build
npm test
```

Update snapshots after intentional output changes:

```bash
npm run test:update
```
