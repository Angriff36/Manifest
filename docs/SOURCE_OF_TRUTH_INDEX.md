---
title: Manifest Sources of Truth Index
created: 2026-07-15
updated: 2026-07-15
source_of_truth: true
source_of_truth_for: Index of which document is authoritative for which concern
authority: Binding index — if a path here is wrong, fix this file and the stale caller
---

# Sources of Truth Index

Use this table to pick the right authority. Do **not** invent a parallel SoT.

| Concern                                              | Authoritative path                                          | Notes                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Manifest-owned feature **completion** (done vs open) | `docs/internal/COMPLIANCE_MATRIX.md`                        | Sole completion SoT; `FULLY_IMPLEMENTED` needs filename + lines + commit SHA |
| Verified **open items** checklist                    | `docs/TODO.md`                                              | Binding open-item inventory. **Agents MUST NOT delete this file.**           |
| Feature **existence** inventory                      | `docs/platform/CONFIRMED-FEATURES.md`                       | Existence claims; loses completion disputes to the matrix                    |
| Completion mirror (non-binding)                      | `docs/platform/FEATURE_MATRIX.md`                           | Navigation copy only                                                         |
| Ownership Manifest vs Builder                        | `docs/internal/contracts/manifest-builder-boundary.md`      |                                                                              |
| Builder consumption / E2E                            | `C:/projects/builder/docs/CAPABILITY_CONSUMPTION_MATRIX.md` | Other repo                                                                   |
| IR shape                                             | `docs/spec/ir/ir-v1.schema.json`                            |                                                                              |
| Runtime meaning                                      | `docs/spec/semantics.md`                                    |                                                                              |
| Built-ins                                            | `docs/spec/builtins.md`                                     |                                                                              |
| Adapter hooks                                        | `docs/spec/adapters.md`                                     |                                                                              |
| Executable semantics                                 | `docs/spec/conformance.md` + `src/manifest/conformance/*`   |                                                                              |
| Doc governance                                       | `docs/internal/DOCUMENTATION_GOVERNANCE.md`                 |                                                                              |
| Generated registry inventory                         | `docs/FEATURE-LIST.md`                                      | Not completion proof                                                         |

Closing work: update **COMPLIANCE_MATRIX** first, then reconcile **TODO** and
**CONFIRMED-FEATURES**.
