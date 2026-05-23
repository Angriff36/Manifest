# docs-site (Mintlify)

Source for the Manifest documentation site, deployed via Mintlify.

## Structure

```
docs-site/
  docs.json                   # Mintlify nav, theme, anchors
  introduction.mdx            # Landing page
  quickstart.md
  installation.mdx
  faq.md
  troubleshooting.md
  language/                   # Language reference (entities, commands, etc.)
  integration/                # Integration patterns (projections, embedded, Next.js)
  adapters/                   # Audit sink, outbox, custom stores
  cli/                        # CLI reference
    overview.md
    commands.mdx              # Core build pipeline
    governance.mdx            # v0.6.0+ enforce-surface, integration-check, etc.
    configuration.mdx         # manifest.config.yaml reference
  spec/ir-v1/                 # Formal IR specification (frozen at ir-v1)
  architecture/               # Project positioning, house style, boundaries
  migration/                  # Version migration guides
```

## How Mintlify reads this

Mintlify deploys whatever `docs.json` references. Pages not listed in
`docs.json` aren't served, even if they exist on disk.

Make changes by editing the `.mdx` / `.md` files directly, then commit. Mintlify
rebuilds the site on every push to `main` (assuming the GitHub source is
configured in the Mintlify dashboard).

## Local preview

```bash
npm install --global mintlify
cd docs-site
mintlify dev
```

Opens `http://localhost:3000`.

## Adding a new page

1. Write the source as `.mdx` (or `.md`) under the appropriate directory
2. Add the path (no extension) to `docs.json` under the relevant group
3. Commit + push

## Versioning

Pages under `spec/ir-v1/` are intentionally pinned to the `ir-v1` schema
version. When `ir-v2` ships, add a parallel `spec/ir-v2/` group rather than
overwriting in place.

## Things NOT in this site

Internal-only docs live in `/docs/` at the repo root, not here. Examples:

- `docs/plans/`, `docs/proposals/`, `docs/context/` — in-flight work
- `docs/archive/` — legacy / historical
- `docs/DETERMINISM_AUDIT.md`, `docs/CONFORMANCE_EXPANSION_PLAN.md` — internal governance
- `AGENTS.md`, `house-style.md` at repo root — agent-discipline rules
