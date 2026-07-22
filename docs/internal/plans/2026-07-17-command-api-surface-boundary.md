# Command API surface — inbound / outbound boundary

**Created:** 2026-07-17  
**Status:** Binding for command HTTP/MCP/agent surfaces, webhook directionality,
and Capsule↔Manifest integration of external write paths. Never overrides Tier A
(`docs/spec/**`).

**Capsule twin (consumption):**  
`C:/Projects/capsule/docs/generation/2026-07-17-command-api-surface-boundary.md`

**Governing Tier A:**

- `docs/spec/semantics.md` § Webhooks (Inbound HTTP Triggers)
- `docs/spec/adapters.md` § Canonical Dispatcher
- `docs/spec/adapters.md` § Outbox Store / Event Bus
- `docs/spec/ir/ir-v1.schema.json` → `IRWebhook` description

**Ownership boundary:**  
`docs/internal/contracts/manifest-builder-boundary.md`

---

## Law (do not invert)

| Term                              | Direction                          | Meaning                                                                                                     |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **`webhook` decl**                | **Inbound**                        | External HTTP → `runCommand`. HMAC / transform / idempotency optional.                                      |
| **Canonical dispatcher**          | **Inbound**                        | `POST /api/manifest/{entity}/commands/{command}` → same `runCommand`.                                       |
| **`agent-sdk` tools**             | **Inbound**                        | Same IR commands as tool schemas; not a parallel rule system.                                               |
| **`publish` + outbox / EventBus** | **Outbound**                       | Command effects notify outside processes. Not a `webhook` decl.                                             |
| **Outbound HTTP partner POST**    | **Not a language construct today** | Event → `POST https://partner…` is adapter/worker work (or a future projection). Do not overload `webhook`. |

Agents that call Manifest “webhooks” outbound event delivery are **wrong**. Correct them against this plan and Tier A, then fix any doc that repeats the error.

---

## Source-of-truth surfaces (one contract)

```text
                    Manifest IR (commands, policies, guards, emits)
                                    |
        ┌───────────────────────────┼────────────────────────────┐
        |                           |                            |
  App UI / Convex            Inbound command API          Outbound delivery
  mutations + hooks          dispatcher · OpenAPI ·       publish · outbox ·
  (humans)                   agent-sdk tools              EventBus
                             (agents, partners, mobile)
        |
  inbound webhook decls (provider callbacks → same runCommand)
```

**Hard rule:** no separate “AI API,” “partner API,” or “ChatGPT API” with different
guards/policies. Assistants and external developers consume the **same generated
command capabilities**. UI rules ≡ API rules ≡ agent tools.

CRUD-shaped REST over tables is rejected for governed writes. Prefer capability
commands (Capsule today: `Recipe.draft`, `RecipeImport.upload` → review/finalize
lifecycle — not a single `RecipeImport.create`), not `POST /recipes` with raw
ingredient graphs.

---

## Ownership

| Surface                                                        | Owner                        | Notes                                                                               |
| -------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| IR command contract (params, guards, policies, emits)          | Manifest                     | Language law                                                                        |
| Canonical dispatcher shape + Next.js projection                | Manifest                     | `adapters.md` § Canonical Dispatcher                                                |
| OpenAPI / routes / wiring projections of commands              | Manifest                     | Must stay command-shaped; path drift is a Manifest bug                              |
| `webhook` runtime + projections (HMAC, idempotency)            | Manifest                     | **Inbound only**                                                                    |
| Outbox / EventBus adapters                                     | Manifest                     | Outbound fan-out primitives                                                         |
| `@angriff36/manifest/agent-sdk` tool generation                | Manifest                     | Same commands                                                                       |
| `@manifest/mcp-server` (compile/execute/explain/validate)      | Manifest                     | In-repo authoring/runtime tooling; **unpublished**; not the product partner surface |
| Agent orchestration UX                                         | Builder                      | On top of agent-sdk / MCP — see boundary contract                                   |
| Live public HTTP for Capsule (auth → RuntimeContext → command) | Capsule                      | Consume dispatcher contract; do not invent parallel semantics                       |
| Domain commands (`Recipe.draft`, `RecipeImport.upload`, etc.)  | Capsule (`.manifest` proofs) | Product capabilities                                                                |
| Outbound partner HTTP workers (until a projection exists)      | Capsule / ops                | May use outbox; must not reimplement guards                                         |

---

## Current reality (verified 2026-07-17)

### Shipped / present

- **Inbound webhooks:** syntax → IR → `src/manifest/webhooks/handler.ts`; Convex/Next/Express/Hono projections materialize routes. Matrix row: Webhooks + HMAC (`CLAIMED_NEEDS_PROOF`, fixture `90`).
- **Canonical dispatcher path:** `POST /api/manifest/{entity}/commands/{command}` (`docs/spec/adapters.md`).
- **Capsule wiring catalog:** generated bindings already list those routes (e.g. `src/generated/manifest-wiring-bindings.ts`).
- **agent-sdk:** tool definitions over IR commands (`src/manifest/agent-sdk/`).
- **Outbound primitives:** `publish` + `RuntimeOptions.outboxStore`; `EventBus` for cross-instance fan-out.

### Gaps (do not paper over)

1. ~~**Capsule live inbound HTTP** — Convex `http.ts` currently emits **0** webhook routes and no public command dispatcher; app writes today go through generated Convex mutations. Wiring route strings alone are not a public API.~~
   > **Update (2026-07-20):** Manifest Convex projection now emits the
   > authenticated command dispatcher (`POST /api/manifest/{entity}/commands/{command}`
   > via `ctx.auth` → existing mutation). Capsule still needs a Manifest pin bump
   > + `manifest:regen` before live `convex/http.ts` includes it; until then
   > Capsule app writes remain mutation/MCP-client only. Wiring route strings
   > alone are still not a public API without that regen.
2. ~~**OpenAPI path shape** — command ops use `/{entity}/{command-kebab}` under the OpenAPI base path, not the dispatcher template. Align or document as a deliberate alias; do not treat them as two semantics.~~
   > **Update (2026-07-22):** OpenAPI default emits canonical
   > `{base}/manifest/{entity}/commands/{command}` plus deprecated legacy
   > `{base}/{entity}/{command-kebab}` (`commandPathStyle: 'both'`). Same
   > command semantics; not two APIs.
3. ~~**Outbound HTTP webhook projection** — no IR construct for “on event, POST URL.” Matrix: treat as `NOT_IMPLEMENTED` until designed spec-first.~~
   > **Update (2026-07-22):** Adapter shipped — `HttpPartnerDeliverer` /
   > `@angriff36/manifest/outbox/http-partner` POSTs outbox entries to a host
   > event→URL map (optional HMAC). Still **not** an IR `webhook` construct and
   > still **no** declarative partner-URL syntax in `.manifest`. Matrix row
   > `FULLY_IMPLEMENTED` for the adapter path.
4. **Product MCP** — wrapping Capsule’s command surface for ChatGPT/partners is Capsule/Builder consumption of **agent-sdk / dispatcher**, not a third Manifest rule engine. Keep `@manifest/mcp-server` as authoring tools unless published and scoped.

---

## Capsule consumption rules

1. External writes (assistant, partner, mobile) MUST target **commands**, never hand-rolled entity CRUD.
2. Prefer the dispatcher URL template (or Convex mutation equivalent that still runs the same command path). Do not add app middleware that bypasses policies/guards.
3. Provider callbacks (Stripe-style) use Manifest **`webhook`** decls — inbound.
4. Notifying inventory/calendar/purchasing systems uses **emits + outbox/EventBus** (or an explicit future outbound projection) — not `webhook`.
5. Do not invent `src/**/ai-api/**` with separate authz. Thin transport only.
6. Manifest pin / proof-kit rules remain under  
   `docs/internal/plans/2026-07-16-dx-proof-kit-boundary.md` and the Capsule twin.

---

## Anti-patterns (reject in review)

- Calling Manifest webhooks “outbound integrations.”
- Adding a ChatGPT-only endpoint that skips guards/policies.
- Exposing raw table CRUD because “the assistant needs flexibility.”
- Hand-mounting HMAC webhook routes in Capsule when a `webhook` decl would do.
- Documenting `@manifest/mcp-server` as the installable Capsule partner API.

---

## Capsule product acceptance (north star)

Capsule twin owns the checklist; summary here so Manifest agents do not redefine
“done” as “OpenAPI exists.”

**Done when:** an IDE agent can read recipe/ops documents and enter ingredients,
recipes, dishes, prep tasks, and events into Capsule via the **same** governed
commands as the UI — with auth, discoverable contract, idempotent retry, and an
automated proof. Full AC:
`C:/Projects/capsule/docs/generation/2026-07-17-command-api-surface-boundary.md`
§ Acceptance criteria.

Wiring catalogs alone do **not** satisfy this. Capsule vertical slice (2026-07-17):
product MCP + document-enter coordinator + runtime proof — see Capsule twin § Status.
Live IDE use still needs operator JWT (`CAPSULE_AGENT_JWT`). Empty `convex/http.ts`
is acceptable for the IDE-MCP slice; public HTTP dispatcher remains a later gap.

---

## Sequencing (when work is picked up)

1. Keep this directionality in docs / Mintlify / skill text (inbound ≠ outbound).
2. Capsule: ship agent-reachable transport for the AC command set (auth →
   RuntimeContext → same mutations/dispatcher) + discoverable tool/contract
   surface + proof for document→enter demo.
3. Manifest (optional, spec-first): align OpenAPI paths with dispatcher; design outbound HTTP delivery if product needs declarative partner POSTs.
4. Graduate this plan into `docs/internal/contracts/` once Capsule’s product AC
   has one live inbound path proven end-to-end.

---

## Proof expectations

Completion claims for any row above still go through
`docs/internal/COMPLIANCE_MATRIX.md` (filename + line range + commit SHA).
This plan binds **ownership and direction**, not feature-completion status.
