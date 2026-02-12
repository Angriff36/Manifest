# Changelog - @manifest/cli

All notable changes to this package will be documented in this file.

## [0.3.12] - 2026-02-10

### Fixed
- **`manifest compile` runtime packaging failure in linked installs**
  - Symptom after CLI entrypoint fixes: `Cannot find module .../dist/manifest/parser imported from .../dist/manifest/ir-compiler.js`
  - Root cause: ESM relative imports in built runtime files omitted `.js` extensions (for example `./parser`, `./lexer`, `./ir-cache`, `./version`), which are not resolvable by Node ESM in this packaged execution path.

### Implementation
- Added explicit `.js` extensions for internal runtime/projection ESM imports in source and synced dist outputs:
  - `src/manifest/ir-compiler.ts` + `dist/manifest/ir-compiler.js`
  - `src/manifest/parser.ts` + `dist/manifest/parser.js`
  - `src/manifest/compiler.ts` + `dist/manifest/compiler.js`
  - `src/manifest/generator.ts` + `dist/manifest/generator.js`
  - `src/manifest/standalone-generator.ts` + `dist/manifest/standalone-generator.js`
  - `src/manifest/projections/{builtins,index,registry}.ts` + matching dist files

### Verification (from `C:\Projects\capsule-pro`)
- `pnpm exec manifest compile` now succeeds:
  - `Found 54 file(s)`
  - `Compiled 54 file(s)`
  - exit `0`

## [0.3.11] - 2026-02-10

### Fixed
- **`manifest compile` crash with `TypeError: Cannot read properties of undefined (reading 'output')`**
  - Observed in linked Windows installs at `packages/cli/dist/index.js:48` during `pnpm exec manifest compile`.
  - Root cause: command arguments were declared twice (in `.command('compile [source]')` and `.argument('[source]')`), which shifted Commander action parameters so `options` could be `undefined`.

### Implementation
- Removed duplicate arg declarations from command signatures:
  - `compile [source]` -> `compile`
  - `generate <ir>` -> `generate`
  - `build [source]` -> `build`
  - `validate [ir]` -> `validate`
- Kept explicit `.argument(...)` declarations as the single source of argument shape.
- Added defensive defaults in actions:
  - `action(async (source, options = {}) => ...)`
  - `action(async (ir, options = {}) => ...)`
- Retained null-safe config handling (`config?.output`, `config?.projections?...`) in command option resolution.

## [0.3.10] - 2026-02-10

### Fixed
- **Windows CLI no-op on direct execution paths**: `manifest` commands could exit `0` with no output when invoked through pnpm/node shim paths that resolve differently (`node_modules` shim vs `.pnpm` target).
  - Observed failures:
    - `pnpm exec manifest --help` returned no output
    - `node node_modules/@manifest/runtime/packages/cli/dist/index.js --help` returned no output
    - `manifest.cmd --help`/`manifest.cmd init --force` returned no output
  - Root cause: direct-run guard compared normalized unresolved paths only, which can differ for symlink/junction/shim execution on Windows.

### Implementation
- Replaced the direct-execution guard in `packages/cli/src/index.ts` with a realpath-based check:
  - `modulePath = await realpath(fileURLToPath(import.meta.url))`
  - `argvPath = await realpath(resolve(process.argv[1]))` (when `process.argv[1]` exists)
  - Compare normalized realpaths (lowercased on `win32`)
- Added conservative fallback behavior when `argvPath` cannot be resolved:
  - Run CLI if resolved argv path contains `manifest` or ends with `index.js`
  - Run CLI if ESM main equivalence matches (`import.meta.url === pathToFileURL(argvResolvedPath).href`)
- Preserved module import behavior (importing the module does not auto-run the CLI).

### Verification (from `C:\Projects\capsule-pro`)
- `pnpm exec manifest --help` now prints help text (exit `0`)
- `node .\\node_modules\\@manifest\\runtime\\packages\\cli\\dist\\index.js --help` now prints help text (exit `0`)
- `.\\node_modules\\.bin\\manifest.cmd --help` now prints help text (exit `0`)
- `pnpm exec manifest init --force` now invokes the command path correctly; in non-interactive shells it waits for prompts (TTY/input behavior), not a no-op.

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
