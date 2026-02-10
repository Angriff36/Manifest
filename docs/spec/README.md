# Manifest Language Specification

If behavior changes, the specification MUST be updated before tests and implementation.

## Purpose

This directory defines the authoritative language specification for Manifest.
The specification freezes meaning, not tooling.
The IR schema is the anchor of the language.

## IR-First Architecture

Manifest is an **IR-first language**. The Intermediate Representation (IR) is the single source of truth for program semantics.

### Key Principles

1. **IR is Authority**: The IR (defined by `ir-v1.schema.json`) is the executable contract. All runtime behavior derives from the IR.

2. **Generated Code is Derivative**: Any TypeScript, React components, or other code generated from the IR is a *view* or *projection*—not the source of truth. Generated code MUST NOT diverge from IR semantics.

3. **Provenance is Mandatory**: IR includes provenance metadata (`contentHash`, `irHash`, `compilerVersion`, `schemaVersion`, `compiledAt`) for traceability. Runtimes MAY verify IR integrity via the `irHash` before execution.

4. **No Silent Drift**: Changes to IR schema or semantics MUST be reflected in:
   - The IR schema version
   - The specification documents
   - The conformance fixtures
   - Any generated code templates

### What This Means

- **Compilers** produce IR, not executable code. The IR is the deliverable.
- **Runtimes** execute IR directly. Generated TypeScript is for debugging or IDE integration only.
- **Generated Code** (e.g., TypeScript definitions, React components) is a convenience layer that MUST stay in sync with IR.
- **Verification**: Production deployments SHOULD enable `requireValidProvenance` to ensure IR integrity.

### The Choke Point

The IR is the "choke point" that prevents semantic drift:
- Source manifest → Compiler → **IR** (choke point) → Runtime
- Generated code → IR (verified) → Execution

If you cannot prove your code came from a specific IR + toolchain version, it is not Manifest.

## Normative Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this specification are to be interpreted as described in RFC 2119.

## Document Map

- `docs/spec/ir/ir-v1.schema.json` — IR v1 JSON Schema (authoritative contract)
- `docs/spec/semantics.md` — Runtime meaning of IR nodes
- `docs/spec/builtins.md` — Built-in identifiers and functions
- `docs/spec/adapters.md` — Adapter hooks and required behavior
- `docs/spec/conformance.md` — Conformance fixtures and test rules
- `docs/spec/manifest-vnext.md` — vNext features: constraint outcomes, overrides, workflows, concurrency

### Migration Documentation

- `docs/migration/vnext-migration-guide.md` — Guide for migrating to vNext features

## Versioning Rules

- The IR schema version is the canonical version boundary.
- A change that violates the IR schema MUST bump the IR version.
- A change that preserves the IR schema but alters meaning MUST update:
  - `semantics.md`, and
  - the conformance fixtures.

## Nonconformance Policy

When implementation behavior differs from this specification, the difference MUST be explicitly documented as **Nonconformance** in the relevant specification file.

This allows staged implementation without weakening the authority of the language definition.

## Conformance Enforcement

The Manifest specification is enforced by a mandatory conformance test suite.

Any change to the language that affects:

- IR structure
- compilation output
- runtime semantics

MUST either:

- Preserve all existing conformance fixtures, or
- Update the specification, fixtures, and implementation together.

A change is considered valid only when the full conformance suite passes.
