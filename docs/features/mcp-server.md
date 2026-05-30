# MCP Server

The Manifest MCP server exposes compilation, execution, validation, and introspection as Model Context Protocol tools and resources over stdio, letting MCP-compatible hosts (Claude Desktop, Cursor, and others) consume and reason about Manifest programs as structured context. Verified against `packages/mcp-server/`.

## Usage / Syntax

The server runs over stdio. The package (`@manifest/mcp-server`) provides a `manifest-mcp` bin. Configure it in an MCP host, for example Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "manifest": {
      "command": "npx",
      "args": ["--package", "@angriff36/manifest", "manifest-mcp"]
    }
  }
}
```

The bin (`packages/mcp-server/bin/manifest-mcp.js`) imports `startServer` from the built output and starts it on a `StdioServerTransport`. The server is created with name `manifest-mcp-server`.

## Behavior / What it does

`startServer()` constructs an `McpServer`, registers the tools and resources, and connects a stdio transport. Registration is orchestrated in `src/server.ts`.

Four tools are registered:

- **compile** — compiles `.manifest` source to IR via `compileToIR` (with `useCache: false`), caches the IR in the session store keyed by the IR's provenance `contentHash`, and returns `{ contentHash, ir, diagnostics, summary }`, where `summary` includes entity/command/policy counts and a `hasErrors` flag. Input: `source` (string), optional `sourcePath`.
- **execute** — looks up a previously compiled IR by `contentHash`, optionally replaces the runtime context, then runs the named command through `RuntimeEngine.runCommand`. Returns a structured result with `success`, `result`, `error`, `deniedBy`, and normalized `guardFailure`, `policyDenial`, `constraintOutcomes`, and `emittedEvents`. If the hash is unknown it returns a failure telling the caller to run compile first. Input: `contentHash`, `commandName`, `input`, optional `entityName`, `instanceId`, and a `context` object (tenantId, orgId, actorId, requestId, source, user).
- **validate** — lightweight check that compiles the source (no caching) and returns `{ valid, diagnostics, errorCount, warningCount }`. `valid` is true only when there are no error diagnostics and IR was produced. Input: `source`, optional `sourcePath`.
- **explain** — references a compiled IR by `contentHash` and formats a chosen `target` (`entity`, `command`, or `policy`) by `name` into human-readable detail, with its own expression/value formatters. Input: `contentHash`, `target` enum, `name`, optional `entityName`.

Three resources are registered (`src/resources/`): `manifest://ir/schema` (the IR JSON Schema), `manifest://ir/{contentHash}` (cached compiled IR via a dynamic `ResourceTemplate`), and `manifest://semantics` (the language semantics reference).

State is held in a `SessionStore` singleton: an in-process cache keyed by `contentHash`, each entry holding the IR plus a pre-warmed `RuntimeEngine`.

## Reference

- Bin: `manifest-mcp` → `packages/mcp-server/bin/manifest-mcp.js`.
- Transport: stdio (`StdioServerTransport`).
- Tools: `compile`, `execute`, `validate`, `explain`.
- Resources: `manifest://ir/schema`, `manifest://ir/{contentHash}`, `manifest://semantics`.
- Package: `@manifest/mcp-server`, dependencies `@modelcontextprotocol/sdk` and `zod`. Tool input schemas are defined with zod.

## Notes & limitations

The session cache is in-process and lost on restart; `execute` and `explain` require a `contentHash` from a prior `compile` call in the same session. `compile` uses the IR provenance `contentHash` (SHA-256 of source computed by the compiler) as the cache key, so identical source reuses the same entry. `validate` deliberately does not cache, so it cannot be followed by `execute` on the same hash. The package's own version is `0.1.0`; the server identifies itself as `manifest-mcp-server`.

Note on provenance: the consolidated summary states the session store caps at 50 entries with FIFO eviction; that limit is an implementation detail of `session-store.ts` and not re-verified line-by-line here.
