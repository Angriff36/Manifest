# Test Plan: CLI Path Configuration Fix

## Pre-Test Setup
1. Build the Electron app: `npm run electron:build`
2. Locate the packaged app in `dist-electron/`
3. Have a Manifest repository available (e.g., `C:/projects/manifest`)
4. Have manifest files to scan (e.g., Capsule-Pro manifests)

## Test Cases

### TC1: First Launch - Invalid CLI Path
**Objective**: Verify error dialog appears when CLI path is not configured

**Steps**:
1. Delete settings file (if exists):
   - Windows: `%APPDATA%/manifest-devtools/settings.json`
2. Launch DevTools
3. Observe startup behavior

**Expected**:
- Error dialog appears: "Manifest CLI Not Found"
- Dialog explains how to configure CLI path
- App remains functional (doesn't crash)

**Status**: [ ]

---

### TC2: Configure CLI Path via Settings
**Objective**: Verify settings modal allows CLI path configuration

**Steps**:
1. Click **Settings** button in sidebar
2. Settings modal opens
3. Click **Browse** next to "Manifest Repository Root"
4. Select your Manifest repo directory (e.g., `C:/projects/manifest`)
5. Observe CLI path auto-updates
6. Verify green checkmark (✓) appears next to CLI path
7. Click **Save Settings**

**Expected**:
- Settings modal opens successfully
- File picker works
- CLI path auto-computes: `<repo>/packages/cli/bin/manifest.js`
- Green checkmark indicates valid path
- Settings save without errors
- Modal closes

**Status**: [ ]

---

### TC3: Settings Persistence
**Objective**: Verify settings persist across app restarts

**Steps**:
1. Configure CLI path (TC2)
2. Close DevTools
3. Relaunch DevTools
4. Open Settings modal

**Expected**:
- No error dialog on startup
- Settings modal shows previously saved values
- CLI path still shows green checkmark

**Status**: [ ]

---

### TC4: Scan Single File
**Objective**: Verify scan operations work with configured CLI path

**Steps**:
1. Configure CLI path (TC2)
2. Set Manifest Root to a directory with .manifest files
3. Navigate to "Issue Tracker" tool
4. Click "Scan All" button
5. Observe scan results

**Expected**:
- Scan executes without MODULE_NOT_FOUND errors
- Results display (errors/warnings/success)
- No console errors related to CLI execution

**Status**: [ ]

---

### TC5: Invalid CLI Path Validation
**Objective**: Verify validation prevents saving invalid paths

**Steps**:
1. Open Settings modal
2. Manually edit CLI path to invalid location (e.g., `C:/invalid/path/manifest.js`)
3. Observe validation indicator
4. Attempt to save

**Expected**:
- Red X (✗) appears next to CLI path
- Error message: "CLI path does not exist"
- Save button is disabled
- Cannot save invalid settings

**Status**: [ ]

---

### TC6: Auto-Update CLI Path
**Objective**: Verify CLI path updates when repo root changes

**Steps**:
1. Open Settings modal
2. Enter repo root: `C:/projects/manifest`
3. Observe CLI path
4. Change repo root to: `D:/other/manifest`
5. Observe CLI path updates

**Expected**:
- CLI path updates automatically
- New path: `D:/other/manifest/packages/cli/bin/manifest.js`
- Validation runs automatically
- Checkmark/X updates based on path existence

**Status**: [ ]

---

### TC7: Server Mode with Environment Variables
**Objective**: Verify server mode respects CLI_PATH env var

**Steps**:
1. Set environment variable: `CLI_PATH=C:/projects/manifest/packages/cli/bin/manifest.js`
2. Set environment variable: `MANIFEST_REPO_ROOT=C:/projects/manifest`
3. Run: `npm run dev` (starts server mode)
4. Test scan endpoint via browser/Postman

**Expected**:
- Server starts without errors
- Scan operations use configured CLI path
- No MODULE_NOT_FOUND errors

**Status**: [ ]

---

### TC8: Packaged App - Full Workflow
**Objective**: End-to-end test in packaged app

**Steps**:
1. Launch packaged app (from `dist-electron/`)
2. Configure settings (TC2)
3. Set Manifest Root to Capsule-Pro manifests
4. Run "Scan All" in Issue Tracker
5. Verify results display correctly

**Expected**:
- All features work in packaged app
- No hardcoded paths cause errors
- Scan results match development mode

**Status**: [ ]

---

## Regression Tests

### RT1: Existing Features Still Work
**Objective**: Verify other DevTools features unaffected

**Steps**:
1. Test Entity Scanner
2. Test Policy Coverage
3. Test Guard Debugger
4. Test Profiler
5. Test IR Verifier

**Expected**:
- All tools function normally
- No new errors introduced

**Status**: [ ]

---

## Performance Tests

### PT1: Scan Performance
**Objective**: Verify scan performance is not degraded

**Steps**:
1. Scan 10+ manifest files
2. Measure time to completion
3. Compare with previous version (if available)

**Expected**:
- Scan completes in reasonable time (<30s for 10 files)
- No noticeable performance degradation

**Status**: [ ]

---

## Edge Cases

### EC1: Missing node_modules
**Objective**: Verify error handling when dependencies missing

**Steps**:
1. Configure CLI path to valid manifest.js
2. Temporarily rename `<repo>/node_modules`
3. Attempt scan

**Expected**:
- Clear error message about missing dependencies
- App doesn't crash

**Status**: [ ]

---

### EC2: Spaces in Path
**Objective**: Verify paths with spaces work correctly

**Steps**:
1. Configure repo root with spaces (e.g., `C:/My Projects/manifest`)
2. Run scan

**Expected**:
- Paths properly quoted
- Scan executes successfully

**Status**: [ ]

---

## Sign-Off

**Tester**: _______________  
**Date**: _______________  
**Build Version**: _______________  
**Overall Status**: [ ] PASS [ ] FAIL  

**Notes**:
