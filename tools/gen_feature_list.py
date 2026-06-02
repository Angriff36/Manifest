import json, sys, io, os, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

features = {}
for fpath in sorted(glob.glob(".automaker/features/*/feature.json")):
    if fpath.endswith(".bak"):
        continue
    dirname = os.path.basename(os.path.dirname(fpath))
    with open(fpath, 'r', encoding='utf-8') as f:
        d = json.load(f)
    title = d.get('title', dirname)
    if title.startswith("I'll help") or title.startswith("Let me analyze"):
        if dirname == 'feature-1780316518102-h71n1r2u1fm':
            title = 'Health Check Projection Export Fix'
        elif dirname == 'feature-1780387482210-qhzhvc02q0j':
            title = 'Health Check Projection ESM Import Fix'
        else:
            title = dirname
    summary = d.get('summary', '').strip()
    features[dirname] = {'title': title, 'summary': summary}

in_v180 = set([
    'aggregate-computed-properties', 'approval-workflow', 'async-command-execution',
    'breaking-change-detector', 'ci-github-actions', 'computed-property-caching',
    'cross-entity-constraint', 'declarative-event-reactions', 'drizzle-projection',
    'event-subscription-language', 'express-projection', 'feature-flags-integration',
    'graphql-projection', 'health-check-endpoint', 'ir-diff-tool', 'ir-to-mermaid',
    'migration-cli-integration', 'multi-module-compilation', 'role-hierarchy',
    'array-type', 'decimal-type', 'enum-type', 'range-constraint',
    'regex-constraint', 'timestamp-auto-fields', 'tenant-isolation-policy',
    'value-object-type',
])

unreleased = {k: v for k, v in features.items()
              if k not in in_v180 and len(v['summary'].strip()) > 100}
no_summary = {k: v for k, v in features.items()
              if k not in in_v180 and len(v['summary'].strip()) <= 100}

releases = [
    {
        'version': 'v1.9.0',
        'theme': 'Language & Type System Extensions',
        'desc': 'New primitive types, entity inheritance/generics, rate limiting, scheduling, and advanced expression capabilities.',
        'features': [
            'date-time-types', 'map-type', 'entity-inheritance', 'generic-entity-types',
            'command-retry-policy', 'rate-limiting-policy', 'scheduled-command',
            'field-level-encryption', 'full-text-search', 'webhook-trigger',
            'data-masking', 'expression-language-extensions', 'standard-library',
            'custom-expression-functions', 'event-sourcing-projection',
        ],
    },
    {
        'version': 'v1.10.0',
        'theme': 'Projections & SDK Generation',
        'desc': '16 projection targets (OpenAPI, Zod, React Query, Flutter, Python, Terraform, etc.) and multi-language SDK generation.',
        'features': [
            'openapi-projection', 'json-schema-projection', 'zod-schema-projection',
            'react-query-projection', 'remix-projection', 'sveltekit-projection',
            'flutter-projection', 'python-pydantic-projection', 'terraform-projection',
            'kysely-projection', 'materialized-view-projection', 'analytics-projection',
            'search-projection', 'sdk-python', 'storybook-projection', 'hono-projection',
        ],
    },
    {
        'version': 'v1.11.0',
        'theme': 'Runtime, Stores & Infrastructure',
        'desc': 'New store adapters (DynamoDB, Redis, Turso), transactional outbox, runtime middleware, federation, saga orchestration, and performance tooling.',
        'features': [
            'dynamodb-store-adapter', 'redis-store-adapter', 'turso-store-adapter',
            'transactional-outbox', 'runtime-middleware', 'runtime-repl',
            'runtime-time-travel', 'runtime-federation', 'saga-workflow',
            'realtime-subscription', 'custom-store-adapter',
            'plugin-api', 'seed-data-generator', 'performance-profiler',
        ],
    },
    {
        'version': 'v1.12.0',
        'theme': 'Developer Tooling & AI Integration',
        'desc': 'AI agent SDK, MCP server, LLM tools, VS Code extension, LSP, formatter, playground, and developer experience features.',
        'features': [
            'ai-agent-sdk', 'ai-test-generator', 'llm-context-export', 'llm-ir-validator',
            'manifest-mcp-server', 'manifest-format', 'manifest-import-system',
            'manifest-playground', 'vscode-extension', 'language-server-protocol',
            'watch-mode-compiler', 'ir-version-control', 'ir-compression',
            'ir-graph-visualizer', 'changelog-from-ir-diff', 'command-coverage-report',
            'documentation-site-generator', 'natural-language-to-manifest',
            'environment-variable-mapping',
            'feature-1780206660992-92bdiex42j7', 'feature-1780316518102-h71n1r2u1fm',
            'feature-1780387482210-qhzhvc02q0j',
        ],
    },
    {
        'version': 'v2.0.0',
        'theme': 'Advanced Runtime & Platform',
        'desc': 'WASM runtime, interactive tooling (REPL, time-travel, tutorial, constraint harness, policy matrix), testing infrastructure, and remaining platform features.',
        'features': [
            'wasm-runtime', 'interactive-tutorial-mode', 'constraint-test-harness',
            'policy-matrix-viewer', 'bundle-size-analyzer', 'load-testing-fixtures',
            'mock-server', 'snapshot-testing', 'property-based-testing',
        ],
    },
]

# Validate
all_grouped = set()
for r in releases:
    for f in r['features']:
        all_grouped.add(f)
missing = set(unreleased.keys()) - all_grouped
if missing:
    print(f"WARNING: features not in any release: {missing}")

# Build the document
lines = []
lines.append("# Manifest Feature List")
lines.append("")
lines.append("> Auto-generated from `.automaker/features/*/feature.json` on 2026-06-02.")
lines.append(f"> **Shipped (v1.8.0): {len(in_v180)}** | **Implemented, unreleased: {len(unreleased)}** | **No summary: {len(no_summary)}** | **Total: {len(features)}**")
lines.append("")
lines.append("---")
lines.append("")

# ========== RELEASE ROADMAP ==========
lines.append("# Release Roadmap")
lines.append("")
lines.append("Planned releases for the 76 unreleased features, grouped by theme.")
lines.append("")

for r in releases:
    lines.append(f"## {r['version']} -- {r['theme']}")
    lines.append("")
    lines.append(r['desc'])
    lines.append("")
    lines.append(f"**{len(r['features'])} features:**")
    lines.append("")
    for fid in r['features']:
        feat = unreleased.get(fid, features.get(fid, {}))
        lines.append(f"- **{feat['title']}** (`{fid}`)")
    lines.append("")
    lines.append("---")
    lines.append("")

# ========== CATEGORY 1: SHIPPED ==========
lines.append("# Category 1 -- Shipped in v1.8.0")
lines.append("")
lines.append("These features are complete and their code exists in the **v1.8.0** npm release.")
lines.append("")
lines.append(f"**{len(in_v180)} features shipped.**")
lines.append("")

for d in sorted(in_v180):
    feat = features[d]
    lines.append(f"### {feat['title']}")
    lines.append(f"**Feature ID:** `{d}`  ")
    lines.append(f"**Status:** Shipped in v1.8.0")
    lines.append("")
    if feat['summary']:
        lines.append("<details><summary>Implementation Details</summary>")
        lines.append("")
        lines.append(feat['summary'])
        lines.append("")
        lines.append("</details>")
    else:
        lines.append("*No detailed summary.*")
    lines.append("")
    lines.append("---")
    lines.append("")

# ========== CATEGORY 2: IMPLEMENTED, UNRELEASED ==========
lines.append("# Category 2 -- Implemented but Unreleased")
lines.append("")
lines.append("These features have full implementation summaries. Code is on **main** but not yet in an npm release.")
lines.append(f"**{len(unreleased)} features.** See the [Release Roadmap](#release-roadmap) above for planned grouping.")
lines.append("")

for d in sorted(unreleased.keys()):
    feat = features[d]
    lines.append(f"### {feat['title']}")
    lines.append(f"**Feature ID:** `{d}`  ")
    for r in releases:
        if d in r['features']:
            lines.append(f"**Planned release:** {r['version']} ({r['theme']})")
            break
    lines.append("")
    if feat['summary']:
        lines.append("<details><summary>Implementation Details</summary>")
        lines.append("")
        lines.append(feat['summary'])
        lines.append("")
        lines.append("</details>")
    else:
        lines.append("*No detailed summary.*")
    lines.append("")
    lines.append("---")
    lines.append("")

# ========== CATEGORY 3: NO SUMMARY ==========
lines.append("# Category 3 -- No Full Implementation Summary")
lines.append("")
lines.append("These features exist in automaker but lack a full implementation summary.")
lines.append("They may be spec'd, partially implemented, or in backlog.")
lines.append("")
lines.append(f"**{len(no_summary)} features.**")
lines.append("")
lines.append("| # | Feature ID | Title |")
lines.append("|---|-----------|-------|")
for i, d in enumerate(sorted(no_summary.keys()), 1):
    lines.append(f"| {i} | `{d}` | {no_summary[d]['title']} |")
lines.append("")

content = "\n".join(lines)
with open('docs/FEATURE-LIST.md', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Written {len(lines)} lines ({len(content)} bytes) to docs/FEATURE-LIST.md")
