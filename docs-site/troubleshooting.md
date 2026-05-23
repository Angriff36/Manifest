---
title: "Troubleshoot common Manifest issues"
description: "Diagnose and fix the most common errors you'll encounter when compiling, running, or generating code with the Manifest SDK and CLI."
---

The issues below cover the most common problems reported when working with Manifest — from CLI configuration mismatches to runtime guard inspection and Windows-specific path bugs. Each entry describes what you see, why it happens, and how to fix it.

<AccordionGroup>
  <Accordion title='"Entity not found in IR"'>
    **What you see**

    An error like `Entity 'todo' not found` or `Entity X not found` when compiling or running a command.

    **Why it happens**

    Entity names in Manifest are case-sensitive. If your source defines `entity Todo` but your code references `'todo'` or `'TODO'`, the lookup fails.

    **How to fix it**

    Check the exact casing of the entity name in your `.manifest` source file. Then confirm the entity is present in the compiled IR:

    ```typescript theme={null}
    // Print all entity names from the compiled IR
    console.log(result.ir.entities.map(e => e.name));
    ```

    Make sure the name you pass to `runCommand` matches exactly.
  </Accordion>

  <Accordion title='"Guard failed but no diagnostic"'>
    **What you see**

    A command returns `success: false` but you cannot find any diagnostic information. Accessing `result.diagnostics` returns `undefined`.

    **Why it happens**

    `CommandResult` does not have a `diagnostics` field. Guard failure details are returned in `result.guardFailure`. Policy denial details are in `result.policyDenial`. General errors are in `result.error`. Inspecting the wrong field produces nothing.

    **How to fix it**

    Check the correct fields on `CommandResult`:

    ```typescript theme={null}
    const result = await runtime.runCommand('create', input, { entityName: 'Todo' });

    if (!result.success) {
      if (result.guardFailure) {
        console.error('Guard failed:', {
          index: result.guardFailure.index,
          expression: result.guardFailure.formatted,
          resolved: result.guardFailure.resolved
        });
      } else if (result.policyDenial) {
        console.error('Policy denied:', {
          policy: result.policyDenial.policyName,
          message: result.policyDenial.message
        });
      } else {
        console.error('Error:', result.error);
      }
      return;
    }

    console.log('Success:', result.result);
    ```

    <Note>
      The runtime does not emit events like `runtime.on('guardFailed')`. All diagnostic information is returned in the `CommandResult` object returned by `runCommand`.
    </Note>
  </Accordion>

  <Accordion title='"No .manifest files found"'>
    **What you see**

    Running `manifest compile` or `manifest build` prints `No .manifest files found` and exits without producing any output.

    **Why it happens**

    The CLI looks for `.manifest` files using either the `src` glob in `manifest.config.yaml` or a default discovery pattern. If neither is configured and no path is passed explicitly, no files are found.

    **How to fix it**

    Pass the source path directly:

    ```bash theme={null}
    manifest compile path/to/your/file.manifest
    ```

    Or set the `src` glob in your config file:

    ```yaml theme={null}
    # manifest.config.yaml
    src: "modules/**/*.manifest"
    output: "ir/"
    ```

    Then run without arguments:

    ```bash theme={null}
    manifest compile
    ```
  </Accordion>

  <Accordion title='"Cannot find module" errors during manifest compile'>
    **What you see**

    The compile command starts and then fails with:

    ```text theme={null}
    Cannot find module .../dist/manifest/parser imported from .../dist/manifest/ir-compiler.js
    ```

    **Why it happens**

    You are on a build where ESM relative imports were emitted without `.js` file extensions. Node's ESM resolver requires explicit extensions and cannot fall back to bare specifiers.

    **How to fix it**

    Upgrade to a version where the runtime ESM imports use explicit `.js` extensions (`./parser.js`, `./lexer.js`, `./ir-cache.js`, and so on). Then verify the fix:

    ```bash theme={null}
    pnpm exec manifest compile
    ```

    Expected result: compile runs across discovered manifests without module-resolution errors.

    If you are working inside the Manifest repo itself, make sure you have built the library before running the CLI:

    ```bash theme={null}
    npm run build
    pnpm exec manifest compile
    ```
  </Accordion>

  <Accordion title="Windows: manifest exits 0 with no output">
    **What you see**

    On Windows, any `manifest` CLI command exits with code `0` and prints nothing — no help text, no error, no output.

    **Why it happens**

    The CLI uses direct-run detection to avoid double-execution when invoked through pnpm shims. Before version 0.3.10, the detection compared normalized (but not resolved) paths. On Windows, the pnpm shim path and the `.pnpm` real target path differ, so the comparison always failed — the CLI detected itself as a passthrough and exited silently.

    This is fixed in **0.3.10**. The CLI now compares normalized **realpaths** and performs a case-insensitive comparison on Windows.

    **How to fix it**

    Upgrade to 0.3.10 or later:

    ```bash theme={null}
    pnpm add @angriff36/manifest@latest
    ```

    If you cannot upgrade immediately, use one of these workarounds to verify the CLI is reachable:

    ```bash theme={null}
    pnpm exec manifest --help
    node .\node_modules\@manifest\runtime\packages\cli\dist\index.js --help
    .\node_modules\.bin\manifest.cmd --help
    ```

    Each of these should print the Manifest help text.

    <Warning>
      `manifest init --force` is interactive and requires terminal input. In non-interactive or headless shells it may wait for prompts or exit without rewriting the config file. Run it in an interactive terminal.
    </Warning>
  </Accordion>

  <Accordion title="Constraint is not blocking execution">
    **What you see**

    A constraint you defined is violated, but the command succeeds and the entity is persisted anyway.

    **Why it happens**

    The constraint's severity level controls whether a violation halts execution. Only `block` severity stops the command. If the severity is `warn` or `ok`, a violation is recorded but execution continues.

    **How to fix it**

    Check the severity declaration in your `.manifest` source. If you want the constraint to halt execution, make sure it uses the default severity (`block`) or explicitly sets it:

    ```manifest theme={null}
    constraint titleNotEmpty {
      severity: block
      rule: this.title is not empty
    }
    ```

    After a successful command, check `result.nonBlockingViolations`:

    ```typescript theme={null}
    if (result.nonBlockingViolations) {
      console.warn('Non-blocking violations:', result.nonBlockingViolations);
    }
    ```
  </Accordion>

  <Accordion title="Read policies are not being enforced">
    **What you see**

    You defined a `policy read allow if ...` rule, but the policy is never enforced — reads succeed regardless of the policy condition.

    **Why it happens**

    This is correct behavior. Per the Manifest language specification, `read`-scoped policies are **not** enforced by default. Read operations are application-defined and may bypass the runtime entirely to query storage directly.

    **How to fix it**

    If you need a policy enforced during command execution, use the `execute` or `all` scope instead:

    ```manifest theme={null}
    policy execute allow if user.role == "admin"
    policy all allow if user.id == this.createdBy
    ```

    `execute` is enforced during `runCommand`. `all` is enforced during all operations.
  </Accordion>

  <Accordion title="Generated Next.js routes don't work">
    **What you see**

    Running the generated route handler returns a 500 error, a module-not-found error, or silently fails with no output.

    **Why it happens**

    Generated routes import helper modules from paths configured during `manifest init` (or passed via CLI flags). If those files don't exist at the expected paths — for example `@/lib/manifest-runtime`, `@/lib/database`, or `@/lib/manifest-response` — the route fails at import time.

    **How to fix it**

    Verify all three lib files exist in your project:

    * `lib/manifest-runtime.ts` — wraps `RuntimeEngine`
    * `lib/database.ts` — exports your database client
    * `lib/manifest-response.ts` — exports `manifestSuccessResponse` and `manifestErrorResponse`

    If `manifest-response.ts` is missing, create it:

    ```typescript theme={null}
    // lib/manifest-response.ts
    export function manifestSuccessResponse(data: unknown, status = 200) {
      return Response.json(data, { status });
    }

    export function manifestErrorResponse(
      message: string | object,
      status = 400
    ) {
      return Response.json(
        typeof message === 'string' ? { error: message } : message,
        { status }
      );
    }
    ```

    For workspace monorepos, confirm the import paths in `manifest.config.yaml` match your actual package names.
  </Accordion>

  <Accordion title='"Unsupported storage target" error'>
    **What you see**

    The runtime throws or returns an error like `Store not supported` or `Unsupported storage target`.

    **Why it happens**

    The runtime only supports built-in targets that are explicitly configured. If you reference a target that has not been set up — or pass an unrecognized string — the runtime emits a diagnostic instead of silently falling back to memory.

    **How to fix it**

    For built-in targets (`memory`, `localStorage`, `postgres`, `supabase`), make sure you are using the correct runtime for your environment.

    For custom databases, implement the `Store` interface and pass it via `storeProvider`:

    ```typescript theme={null}
    import { RuntimeEngine } from '@angriff36/manifest';

    const runtime = new RuntimeEngine(ir, {
      userId: 'user-123',
      storeProvider: (entityName) => {
        if (entityName === 'Todo') {
          return new MyCustomTodoStore();
        }
        return undefined;
      }
    });
    ```
  </Accordion>

  <Accordion title='manifest validate reports "Missing required field: metadata" or "Schema not found"'>
    **What you see**

    Running `manifest validate` fails with either `Missing required field: metadata` or `Schema not found at docs/spec/ir/ir-v1.schema.json`.

    **Why it happens**

    You are running a stale global CLI binary (pre-0.3.23). The old `validate` command resolved the schema relative to `process.cwd()`, which only works inside the Manifest repo itself.

    **How to fix it**

    Stop using the global binary and use `pnpm exec manifest` instead:

    ```bash theme={null}
    pnpm exec manifest validate path/to/output.ir.json
    ```

    As of 0.3.23, the schema is bundled inside the package and resolved relative to the CLI binary, not the working directory.

    <Tip>
      Always use `pnpm exec manifest` (or `npx manifest`) rather than a globally installed binary. Run `pnpm exec manifest --version` to confirm the version matches the installed package.
    </Tip>
  </Accordion>
</AccordionGroup>

<Note>
  If your issue is not listed here, check the [FAQ](/faq) for answers about Manifest's design and semantics. To report a new issue, open a GitHub issue and include your `.manifest` source, the compiled IR, and any diagnostic output.
</Note>
