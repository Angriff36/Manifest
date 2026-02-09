@echo off
REM Setup and test all Manifest tools (Windows)

setlocal enabledelayedexpansion

echo.
echo 🔧 Manifest Tools Setup
echo =======================
echo.

set "MANIFEST_ROOT=%~dp0.."
set "TOOLS_DIR=%MANIFEST_ROOT%\tools"
set BUILD_SUCCESS=0
set BUILD_FAILED=0

REM Function to build a tool
call :build_tool "IR Schema Validator" "%TOOLS_DIR%\manifest-ir-schema-validator\project"
call :build_tool "IR Consumer Test Harness" "%TOOLS_DIR%\manifest-IR-consumer-test-harness\project\packages\manifest-ir-harness"
call :build_tool "IR Diff Explainer" "%TOOLS_DIR%\IR-diff-explainer\project\packages\ir-diff"
call :build_tool "Generator Field Access Guard" "%TOOLS_DIR%\generator-field-access-guard\packages\field-access-guard"

echo.
echo =======================
echo 📊 Build Summary
echo =======================
echo.
echo ✅ Successfully built: %BUILD_SUCCESS%
echo ❌ Failed: %BUILD_FAILED%
echo.

if %BUILD_FAILED% GTR 0 (
  echo Some tools failed to build. Check errors above.
  exit /b 1
)

echo 🎉 All tools built successfully!
echo.
echo Quick Test Commands:
echo ====================
echo.
echo 1. Validate IR Schema:
echo    cd tools\manifest-ir-schema-validator\project
echo    npm start -- --schema ..\..\..\docs\spec\ir\ir-v1.schema.json --fixtures ..\..\..\src\manifest\conformance\expected
echo.
echo 2. Run Test Harness:
echo    cd tools\manifest-IR-consumer-test-harness\project\packages\manifest-ir-harness
echo    npm run harness -- run --ir ^<path-to-ir^> --script ^<path-to-script^>
echo.
echo 3. Compare IR Versions:
echo    cd tools\IR-diff-explainer\project\packages\ir-diff
echo    npm run cli -- explain --before ^<old.json^> --after ^<new.json^> --out diff.md
echo.
echo 4. Validate Generator:
echo    cd tools\generator-field-access-guard\packages\field-access-guard
echo    npm run cli -- init --input ^<ir.json^> --generator ^<gen.js^> --out allow.json
echo.
echo See docs\tools\USAGE_GUIDE.md for detailed examples!
echo.

exit /b 0

:build_tool
set "TOOL_NAME=%~1"
set "TOOL_PATH=%~2"

echo.
echo Building %TOOL_NAME%...

if not exist "%TOOL_PATH%" (
  echo ❌ Directory not found: %TOOL_PATH%
  set /a BUILD_FAILED+=1
  goto :eof
)

pushd "%TOOL_PATH%"

if not exist "package.json" (
  echo ❌ No package.json found in %TOOL_PATH%
  set /a BUILD_FAILED+=1
  popd
  goto :eof
)

REM Install dependencies
echo   Installing dependencies...
call npm install >nul 2>&1
if errorlevel 1 (
  echo   ✗ npm install failed
  set /a BUILD_FAILED+=1
  popd
  goto :eof
)
echo   ✓ Dependencies installed

REM Build
echo   Building...
call npm run build >nul 2>&1
if errorlevel 1 (
  echo   ✗ npm run build failed
  set /a BUILD_FAILED+=1
  popd
  goto :eof
)
echo   ✓ Build successful

REM Run tests
echo   Running tests...
call npm run test >nul 2>&1
if errorlevel 1 (
  echo   ⚠ Tests skipped or failed ^(non-fatal^)
) else (
  echo   ✓ Tests passed
)

echo ✅ %TOOL_NAME% ready
set /a BUILD_SUCCESS+=1

popd
goto :eof
