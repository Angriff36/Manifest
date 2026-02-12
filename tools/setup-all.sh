#!/bin/bash
# Setup and test all Manifest tools

set -e  # Exit on error

MANIFEST_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_DIR="$MANIFEST_ROOT/tools"

echo "🔧 Manifest Tools Setup"
echo "======================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Track success/failure
BUILT=()
FAILED=()

build_tool() {
  local tool_name=$1
  local tool_path=$2

  echo -e "${YELLOW}Building ${tool_name}...${NC}"

  if [ ! -d "$tool_path" ]; then
    echo -e "${RED}❌ Directory not found: $tool_path${NC}"
    FAILED+=("$tool_name")
    return
  fi

  cd "$tool_path"

  if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ No package.json found in $tool_path${NC}"
    FAILED+=("$tool_name")
    return
  fi

  # Install dependencies
  if npm install > /dev/null 2>&1; then
    echo "  ✓ Dependencies installed"
  else
    echo -e "${RED}  ✗ npm install failed${NC}"
    FAILED+=("$tool_name")
    return
  fi

  # Build
  if npm run build > /dev/null 2>&1; then
    echo "  ✓ Build successful"
  else
    echo -e "${RED}  ✗ npm run build failed${NC}"
    FAILED+=("$tool_name")
    return
  fi

  # Run tests if they exist
  if npm run test > /dev/null 2>&1; then
    echo "  ✓ Tests passed"
  else
    echo "  ⚠ Tests skipped or failed (non-fatal)"
  fi

  BUILT+=("$tool_name")
  echo -e "${GREEN}✅ ${tool_name} ready${NC}"
  echo ""
}

# Build each tool
echo "Building tools..."
echo ""

build_tool "IR Schema Validator" "$TOOLS_DIR/manifest-ir-schema-validator/project"
build_tool "IR Consumer Test Harness" "$TOOLS_DIR/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness"
build_tool "IR Diff Explainer" "$TOOLS_DIR/IR-diff-explainer/project/packages/ir-diff"
build_tool "Generator Field Access Guard" "$TOOLS_DIR/generator-field-access-guard/packages/field-access-guard"

# Summary
echo "======================="
echo "📊 Build Summary"
echo "======================="
echo ""

if [ ${#BUILT[@]} -gt 0 ]; then
  echo -e "${GREEN}✅ Successfully built (${#BUILT[@]}):${NC}"
  for tool in "${BUILT[@]}"; do
    echo "   - $tool"
  done
  echo ""
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "${RED}❌ Failed to build (${#FAILED[@]}):${NC}"
  for tool in "${FAILED[@]}"; do
    echo "   - $tool"
  done
  echo ""
  exit 1
fi

echo -e "${GREEN}🎉 All tools built successfully!${NC}"
echo ""
echo "Quick Test Commands:"
echo "===================="
echo ""
echo "1. Validate IR Schema:"
echo "   cd tools/manifest-ir-schema-validator/project"
echo "   npm start -- --schema ../../../docs/spec/ir/ir-v1.schema.json --fixtures ../../../src/manifest/conformance/expected"
echo ""
echo "2. Run Test Harness:"
echo "   cd tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness"
echo "   npm run harness -- run --ir <path-to-ir> --script <path-to-script>"
echo ""
echo "3. Compare IR Versions:"
echo "   cd tools/IR-diff-explainer/project/packages/ir-diff"
echo "   npm run cli -- explain --before <old.json> --after <new.json> --out diff.md"
echo ""
echo "4. Validate Generator:"
echo "   cd tools/generator-field-access-guard/packages/field-access-guard"
echo "   npm run cli -- init --input <ir.json> --generator <gen.js> --out allow.json"
echo ""
echo "See docs/tools/USAGE_GUIDE.md for detailed examples!"
