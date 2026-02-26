# CLI Path Configuration Fix

## Problem
The DevTools packaged Electron app was failing with `MODULE_NOT_FOUND` errors because it used hardcoded absolute paths to the Manifest CLI that don't exist on user machines.

## Solution
Made the CLI path configurable through persistent settings, allowing users to specify their Manifest repository location once.

## Changes Made

### 1. Electron Main Process (`electron/main.cjs`)
- **Replaced hardcoded `CLI_PATH`** with `DEFAULT_CLI_PATH` (fallback only)
- **Added `getCliPath()`** - Retrieves CLI path from settings with validation
- **Added `getManifestRepoRoot()`** - Retrieves repo root from settings
- **Updated `runCLI()`** to:
  - Use `process.execPath` (Electron's bundled Node.js) instead of system `node`
  - Set `NODE_PATH` environment variable to include:
    - `<repo>/node_modules`
    - `<repo>/packages/cli/node_modules`
  - Use configurable `cwd` (repo root)
- **Added IPC handlers**:
  - `get-cli-path` / `set-cli-path`
  - `get-manifest-repo-root` / `set-manifest-repo-root`
  - `validate-cli-path` - Checks if CLI path exists
- **Added startup validation** - Shows error dialog if CLI path is invalid

### 2. Electron Preload (`electron/preload.cjs`)
- Exposed new IPC handlers to renderer process:
  - `getCliPath()`, `setCliPath()`
  - `getManifestRepoRoot()`, `setManifestRepoRoot()`
  - `validateCliPath()`

### 3. Frontend API (`src/lib/api.ts`)
- Added TypeScript types for new IPC handlers
- Added frontend API methods:
  - `getCliPath()`, `setCliPath()`
  - `getManifestRepoRoot()`, `setManifestRepoRoot()`
  - `validateCliPath()`

### 4. Settings UI (`src/components/SettingsModal.tsx`) - NEW FILE
- Created modal component for configuring CLI settings
- Features:
  - **Manifest Repo Root** input with file picker
  - **CLI Path** auto-computed from repo root
  - Real-time validation with visual indicators (✓/✗)
  - Displays current settings
  - Persists settings to Electron userData

### 5. Layout Component (`src/components/Layout.tsx`)
- Added Settings button to sidebar
- Added `onOpenSettings` prop

### 6. App Component (`src/App.tsx`)
- Integrated SettingsModal
- Added settings open/close state management

### 7. Server Mode (`server.js`) - OPTIONAL
- Made CLI path configurable via:
  - `CLI_PATH` environment variable
  - `--cli-path` command line argument
- Made repo root configurable via:
  - `MANIFEST_REPO_ROOT` environment variable
  - `--repo-root` command line argument
- Updated scan endpoints to use configured paths with proper `NODE_PATH`

## Settings Storage
Settings are persisted in Electron's userData directory:
- **Windows**: `%APPDATA%/manifest-devtools/settings.json`
- **macOS**: `~/Library/Application Support/manifest-devtools/settings.json`
- **Linux**: `~/.config/manifest-devtools/settings.json`

Settings structure:
```json
{
  "manifestRoot": "/path/to/manifests/to/scan",
  "manifestRepoRoot": "/path/to/manifest/repo",
  "cliPath": "/path/to/manifest/repo/packages/cli/bin/manifest.js"
}
```

## User Workflow

### First-Time Setup
1. Launch DevTools
2. If CLI path is invalid, an error dialog appears
3. Click **Settings** button in sidebar
4. Set **Manifest Repo Root** to your local Manifest repository
   - Example: `C:/projects/manifest`
5. CLI path is auto-computed: `<repo>/packages/cli/bin/manifest.js`
6. Green checkmark (✓) indicates valid path
7. Click **Save Settings**
8. Settings persist across app restarts

### Using Scan Features
1. Set the **Manifest Root** (target files to scan) in the header
   - Example: `C:/projects/capsule-pro/packages/manifest-adapters/manifests`
2. Use "Scan All" or "Scan File" features
3. CLI is invoked with proper module resolution

## Technical Details

### Module Resolution
The fix ensures proper Node.js module resolution by:
1. Setting `cwd` to the Manifest repo root
2. Setting `NODE_PATH` to include:
   - Repo-level `node_modules`
   - CLI-specific `node_modules`
3. Using Electron's bundled Node.js (`process.execPath`)

### Why This Works
- **Packaged apps** don't have access to the development repo structure
- **Settings** allow users to point to their local Manifest repo
- **NODE_PATH** ensures CLI can find its dependencies
- **Validation** prevents runtime errors from invalid paths

## Testing Checklist
- [ ] Settings modal opens and closes
- [ ] Repo root file picker works
- [ ] CLI path auto-updates when repo root changes
- [ ] Validation shows green checkmark for valid paths
- [ ] Validation shows red X for invalid paths
- [ ] Settings persist after app restart
- [ ] Scan operations work with configured CLI path
- [ ] Error dialog appears on startup if CLI path is invalid
- [ ] Server mode respects environment variables

## Acceptance Criteria
✅ Packaged app can scan manifests without requiring repo structure  
✅ User can set CLI path once via UI  
✅ Settings persist across app restarts  
✅ Clear error message if CLI path is invalid  
✅ Works with Electron-bundled Node (no external Node.js required)  
✅ Proper module resolution via NODE_PATH  

## Future Enhancements
- Auto-detect Manifest repo location (search common paths)
- Validate repo structure (check for packages/cli/bin/manifest.js)
- Support multiple CLI versions (version selector)
- Export/import settings for team sharing
