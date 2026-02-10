# Changelog - @manifest/cli

All notable changes to this package will be documented in this file.

## [0.3.9] - 2025-02-09

### Fixed
- **CLI Projection Options Not Passed to generate()**: Options were passed to constructor but not included in request object
  - The projection's `generate()` method expects options via `request.options`
  - CLI now passes `projectionOptions` in every `generate()` call
  - Fixes issue where generated code used default `@/lib/*` paths instead of configured paths
- **CLI Projection API Bug**: Fixed calls to deprecated projection methods
  - `generateRoute()` → `generate(ir, { surface: 'nextjs.route', entity })`
  - `generateTypes()` → `generate(ir, { surface: 'ts.types' })`
  - `generateClient()` → `generate(ir, { surface: 'ts.client' })`
- **CLI writeProjectionResult**: Updated to handle new artifacts array format
  - Old format: `{ code: string, filePath: string }`
  - New format: `{ artifacts: [{ id, pathHint, contentType, code }], diagnostics: [] }`
- **Import Fallback Path**: Fixed relative import path for development
  - Changed from `../../../src/` to `../../../../src/`
  - Correct for files located at `packages/cli/src/commands/generate.ts`
- **Import Export Name**: Fixed to use named export instead of default
  - Changed from `projectionModule.default` to `projectionModule.NextJsProjection`
  - The generator exports `NextJsProjection` as a named export, not default

### Added
- **API Contract Tests**: Added 12 tests in `src/cli/generate.test.ts`
  - Verifies correct API usage
  - Ensures no deprecated methods exist
  - Tests artifact path hints
  - Tests error handling

### Changed
- Removed invalid `outputPath` option from projection configuration
  - Not part of `NextJsProjectionOptions` interface
  - Output directory handled by CLI layer, not projection

### Technical Details
- The CLI uses `manifest.config.yaml` for configuration (created by `manifest init`)
- Command-line options override config values
- Fallback defaults used when no config exists

---

## [0.3.8] and earlier
- See git history for changes prior to CLI API fix
