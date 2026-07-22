---
title: Security Policy
created: 2026-07-22
updated: 2026-07-22
---

# Security Policy

## Supported versions

Only the latest published version of `@angriff36/manifest` receives security
fixes. Check the current version with `npm view @angriff36/manifest version`.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately via GitHub's private vulnerability reporting:
<https://github.com/Angriff36/Manifest/security/advisories/new>

If that is unavailable, email <ostwind365@gmail.com> with a description,
reproduction steps, and impact assessment.

You should receive an acknowledgment within a few days. Fixes ship as a new
npm release; the advisory is published after the fix is available.

## Scope notes

The Manifest runtime executes IR produced from `.manifest` source. Areas of
particular interest:

- Guard/policy bypasses (an invalid program succeeding is a language
  violation, not just a bug)
- Injection through runtime context or store adapters (Postgres, Redis,
  Supabase, etc.)
- Generated-code output that introduces vulnerabilities into consumer
  projects (Next.js/Prisma/Convex projections)
