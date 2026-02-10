# Embedded Runtime Pattern

Use this pattern when your application owns request handling and orchestrates Manifest command execution directly.

Normative semantics are defined in `C:/Projects/Manifest/docs/spec/semantics.md`.

## Minimal Flow

1. Compile or load IR.
2. Construct `RuntimeEngine` with runtime context and optional `RuntimeOptions`.
3. Execute commands with `runCommand`.
4. Handle command result and emitted events in application code.

## Example

```ts
import { compileToIR } from '@manifest/ir-compiler';
import { RuntimeEngine } from '@manifest/runtime';

const { ir } = await compileToIR(source);
if (!ir) throw new Error('Compilation failed');

const runtime = new RuntimeEngine(ir, {
  user: { id: 'user-1', role: 'admin' },
  context: { requestId: 'req-1' }
});

const result = await runtime.runCommand(
  'approve',
  { reason: 'validated' },
  { entityName: 'Invoice', instanceId: 'inv-1' }
);

if (!result.success) {
  // Surface diagnostics; do not alter semantics.
  console.error(result.error, result.guardFailure, result.policyDenial);
}
```

## Event Handling

Use `onEvent` to observe emitted events in execution order.

```ts
const unsubscribe = runtime.onEvent((event) => {
  // Persist, publish, enqueue, or trace.
  console.log(event.name, event.channel, event.payload);
});

try {
  await runtime.runCommand('approve', {}, { entityName: 'Invoice', instanceId: 'inv-1' });
} finally {
  unsubscribe();
}
```

## Runtime Context

If guards or policies reference `user` or `context`, provide those fields in runtime context. Missing required context is a valid execution failure.

## Determinism for Tests

Use deterministic options in tests:

- `generateId`
- `now`

This is required for stable conformance-style assertions.

## Do Not

- Do not bypass `runCommand` for mutation paths that rely on Manifest semantics.
- Do not reorder policy/constraint/guard/action/emits evaluation.
- Do not inject permissive context defaults to force success.

## Related

- `C:/Projects/Manifest/docs/spec/semantics.md`
- `C:/Projects/Manifest/docs/spec/builtins.md`
- `C:/Projects/Manifest/docs/spec/adapters.md`
- `C:/Projects/Manifest/src/manifest/conformance/conformance.test.ts`