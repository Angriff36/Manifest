# Manifest Language Specification

If behavior changes, the specification MUST be updated before tests and implementation.

## Purpose

This directory defines the authoritative language specification for Manifest.  
The specification freezes meaning, not tooling.  
The IR schema is the anchor of the language.

## Normative Language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this specification are to be interpreted as described in RFC 2119.

## Document Map

- `docs/spec/ir/ir-v1.schema.json` — IR v1 JSON Schema (authoritative contract)
- `docs/spec/semantics.md` — Runtime meaning of IR nodes
- `docs/spec/builtins.md` — Built-in identifiers and functions
- `docs/spec/adapters.md` — Adapter hooks and required behavior
- `docs/spec/conformance.md` — Conformance fixtures and test rules

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
