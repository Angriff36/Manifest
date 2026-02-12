# Deployment Boundaries and FAQ

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12
Status: Active

This document exists to prevent category errors: Manifest is a deterministic domain DSL, not an infrastructure/deployment manifest format.

Canonical language authority remains in `docs/spec/**` and executable conformance evidence in `src/manifest/conformance/**`.

## Scope Boundary

| Need | Supported in Manifest DSL? | Canonical mechanism | Notes |
|---|---|---|---|
| Domain model and behavior (entities, commands, guards, policies, events) | Yes | `docs/spec/semantics.md` | Core language semantics. |
| Persistence target selection | Yes | `store <Entity> in <target>` + `docs/spec/adapters.md` | `memory` required; other targets are adapters. |
| External DB dependency | Yes | `store ... in postgres`/`supabase` or `storeProvider` adapter | Unsupported targets must produce diagnostics. |
| Runtime user/environment input | Yes | built-ins `user` and `context` (`docs/spec/builtins.md`) | Variability enters through runtime context. |
| Service image, ports, CPU/memory limits, build pipeline steps | No (language semantics) | Deployment/tooling layer (Kubernetes, ECS, CI, framework config) | May be represented as data metadata only; runtime does not interpret operational semantics. |
| Environment variable mutation | Not a DSL primitive | runtime `context` and/or entity data mutation | Prefer `context` for runtime environment behavior. |
| Structural correctness before deploy | Yes | compile to IR, validate schema, run conformance/tests | `docs/spec/ir/ir-v1.schema.json` is contract anchor. |
| Cross-file consistency and references | Yes (at compile/conformance boundary) | compile multiple sources to one IR graph + deterministic checks | Missing references must fail compilation. |
| Change tracking and rollback | Repo process, not DSL | Git + spec/conformance workflow | Follow spec -> tests -> implementation. |

## FAQ: 10 Common Prompts

### 1) Basic application service with name and image
Manifest has no first-class `service` or `image` deployment primitives. Represent application metadata as entity data if needed.

```manifest
entity Application {
  property required id: string
  property required name: string
  property imageRef: string = "ghcr.io/acme/app:1.0.0" // metadata only
}

store Application in memory
```

### 2) Dependency on an external database service
Declare the store target directly in Manifest:

```manifest
entity Recipe {
  property required id: string
  property required name: string
}

store Recipe in postgres
```

When custom behavior is required, provide a custom store through runtime `storeProvider` (see `docs/spec/adapters.md`).

### 3) Different ports for development and production
Not a Manifest semantic feature. Configure process/network ports in deployment/framework tooling, not in the Manifest language.

If you need values represented in language data:

```manifest
entity RuntimeConfig {
  property required id: string
  property devPort: number = 5173
  property prodPort: number = 8080
}

store RuntimeConfig in memory
```

This models data only; it does not bind sockets.

### 4) CPU and memory limits
Not in Manifest semantics. Define resource limits in your deployment platform (Kubernetes/ECS/Nomad/etc.).

### 5) Build step that executes a script
Not in Manifest semantics. Build pipelines belong to CI/tooling; Manifest governs IR and runtime semantics.

### 6) Version control and revert workflow for manifest files
Use Git for change tracking and rollback:

```bash
git add path/to/file.manifest
git commit -m "Update manifest behavior"
git log -- path/to/file.manifest
git restore --source <commit_sha> -- path/to/file.manifest
```

For semantic changes, follow spec -> conformance/tests -> implementation.

### 7) Ensure schema adherence before deployment
Canonical gate:
1. Compile source to IR.
2. Validate IR against `docs/spec/ir/ir-v1.schema.json`.
3. Run conformance and required checks (`npm test`, `npm run typecheck`, `npm run lint`).

### 8) Update environment from DEV to PROD
No native env-var block exists. Use runtime context and optionally persisted data.

```manifest
entity AppSettings {
  property required id: string
  property environment: string = "DEV"

  command setEnvironment(env: string) {
    mutate environment = env
  }

  command runProdOnly() {
    guard context.env == "PROD"
    emit ProdActionRan
  }
}

store AppSettings in memory

event ProdActionRan: "app.prod_action_ran" {
  id: string
}
```

Use `setEnvironment("PROD")` for persisted data, and/or pass `context.env = "PROD"` at runtime.

### 9) Custom business validation beyond schema (e.g., unique names across manifests)
Implement a deterministic repository validation pass:
1. Compile all manifests to IR.
2. Aggregate names (entities, commands, policies, etc.).
3. Emit deterministic diagnostics for duplicates.
4. Fail CI on violations.

Diagnostics must explain; they must not auto-repair semantics.

### 10) Managing references across multiple manifest files
Manage references at compile-time by producing a single program graph (or equivalent merged IR) from multiple sources, then enforce referential integrity before runtime.

Recommended checks:
- all referenced commands/policies/events resolve,
- names are unique where required,
- provenance and schema validation pass,
- conformance/tests stay green after updates.

## References

- `docs/spec/ir/ir-v1.schema.json`
- `docs/spec/semantics.md`
- `docs/spec/builtins.md`
- `docs/spec/adapters.md`
- `docs/spec/conformance.md`
- `src/manifest/conformance/**`
- `docs/DOCUMENTATION_GOVERNANCE.md`
- `house-style.md`
