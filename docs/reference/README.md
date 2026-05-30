# Reference

Programmatic and command-line reference for the Manifest toolchain.

## Command line

- [CLI reference](./cli.md) — every registered `manifest` command with options and examples
- [`integration-check`](./integration-check.md) — the umbrella validation command for downstream consumers

## Programmatic API

- [API reference](./api.md) — the public package surface and subpath exports
- [Compiler & IR](./compiler-ir.md) — compiling source to IR, the `compileToIR` API
- [Runtime engine](./runtime-engine.md) — `RuntimeEngine` concepts and `runCommand`
- [Types](./types.md) — core TypeScript types
- [Architecture](./architecture.md) — the compilation pipeline end to end

## Packaging & performance

- [Module system](./module-system.md)
- [Packages & distribution](./packages-and-distribution.md) — package shape, subpath exports, tarball contents
- [Performance](./performance.md) — benchmarks and performance characteristics

## Configuration

- [`manifest.config` schema](../spec/config/manifest.config.md)
