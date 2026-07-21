# Manifest documentation (Mintlify)

Authority: Advisory
Enforced by: None
Last updated: 2026-07-15

Public product docs for **`@angriff36/manifest`**.

~~This directory used to ship as an unmodified Mintlify starter kit (placeholder
README / AGENTS / CONTRIBUTING).~~

> **Correction (2026-07-15) @RYANSIGNED:** Content here is Manifest-specific.
> ~~Version SoT is the repo root `package.json` (**3.6.4**).~~
>
> **Correction (2026-07-20):** Version SoT is the repo root `package.json`
> (**3.6.32**). Node **`>=20`**. Do not invent features; prefer
> `docs/CONFIRMED-FEATURES.md` + the spec chain.

## Context7 AI chat widget

`context7-widget.js` loads the Context7 chat assistant (library
`/angriff36/manifest`) on every page. Mintlify auto-includes `.js` files in this
directory.

Before the widget works in production, enable it and allow your docs domains in
[Context7 admin](https://context7.com/angriff36/manifest/admin) (Chat tab), e.g.
`manifest-b1e8623f.mintlify.app` and any custom domain.

## Local preview

```bash
npm i -g mint
# from this directory (mintlify/), where docs.json lives:
mint dev
```

Preview: `http://localhost:3000`. Update CLI with `mint update` if the preview fails.

## AI-assisted writing

```bash
npx skills add https://mintlify.com/docs
```

Also read `AGENTS.md` in this folder before editing behavioral pages.

## Publishing

Install the Mintlify GitHub app from your [dashboard](https://dashboard.mintlify.com/settings/organization/github-app). Pushes to the default branch deploy production docs.

## Accuracy

False claims must use strikethrough + dated `@RYANSIGNED` correction (see `AGENTS.md` / `CONTRIBUTING.md`). Ledger: `docs/internal/plans/2026-07-15-docs-accuracy-loop.md`.
