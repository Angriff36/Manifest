# Feature Flags

The `flag(name)` built-in resolves a named feature flag through a runtime-provided ~~provider~~ map or provider, letting guards and computed properties gate behavior on flags declared in the program but evaluated against external flag state. ~~When no provider is configured, `flag` returns `false` so features are off by default.~~

> **Correction (2026-07-15) @RYANSIGNED:** Resolution order in `RuntimeEngine.getBuiltins().flag`:
> (1) if `RuntimeOptions.flagProvider` is set, it wins; (2) else if `RuntimeOptions.flags`
> (`Record<string, unknown>`) has an own property for the name, return that value; (3) else
> `false`. Safe default remains off when neither is configured.

## Syntax

`flag(name)` is used in guards and computed properties. From the conformance fixture `src/manifest/conformance/fixtures/66-feature-flags.manifest`:

```
entity FeatureGatedEntity {
  property required id: string
  property status: string = "inactive"

  command activate() {
    guard flag("new-activation-flow")
    mutate status = "active"
  }

  command deactivate() {
    guard flag("allow-deactivation") and self.status == "active"
    mutate status = "inactive"
  }
}

entity FlagInspector {
  property required id: string
  property flagValue: string = ""

  computed isNewUIEnabled: boolean = flag("new-ui")
}

store FeatureGatedEntity in memory
store FlagInspector in memory
```

The single argument is the flag name as a string literal. `flag(...)` composes with other expressions, as in `flag("allow-deactivation") and self.status == "active"`.

## Behavior

The `flag` built-in is defined in the runtime engine's `getBuiltins()` (`src/manifest/runtime-engine.ts`). It returns `false` if the argument is not a string. ~~Otherwise, if `RuntimeOptions.flagProvider` is set, it delegates to that provider — `this.options.flagProvider(name)` — and returns whatever the provider returns. When no provider is configured, it returns `false`.~~

> **Correction (2026-07-15) @RYANSIGNED:** After the string check: `flagProvider` if present;
> otherwise look up `options.flags[name]` when the key exists; otherwise `false`.

~~The provider is typed as `flagProvider?: (name: string) => unknown` on the runtime options.~~
Both `flags?: Record<string, unknown>` and `flagProvider?: (name: string) => unknown` are on
`RuntimeOptions`. Provider (or map) return values are passed through unchanged — the engine does
not coerce. The option comment shows
`flagProvider: (name) => launchDarklyClient.variation(name, false)`.

~~Because resolution happens entirely through the runtime-supplied provider~~ Because resolution
happens through runtime options (`flags` / `flagProvider`) and the IR carries only the
`flag("name")` call, the same compiled program yields different gating behavior in different
runtime contexts without any IR change — consistent with Manifest's rule that variability enters
through runtime context, not by editing the IR.

In a guard, a falsey `flag(...)` result halts command execution at that guard in order, the same as any other guard expression.

## How it maps to projections

Feature flags are a runtime expression concern, not a schema construct, so there is no dedicated projection mapping. The `flag("name")` call is carried in the IR like any other expression and is meaningful wherever the runtime evaluates expressions.

## Notes & limitations

The conformance fixture `66-feature-flags.manifest` has an expected `.ir.json` but no `results.json`. That means the IR shape of `flag(...)` is conformance-locked, but the runtime gating behavior described above is verified only against the engine source and unit-level reasoning, not against a recorded conformance results fixture. Treat the runtime semantics as confirmed in code but not yet pinned by an executable conformance result.

The safe default is off: ~~with no `flagProvider`, every `flag(...)` returns `false`~~ with neither
`flagProvider` nor a matching `flags` entry, every `flag(...)` returns `false`, so guards depending
on a flag will deny by default. Provider/map return values are not validated or coerced by the
engine, so a non-boolean will pass straight into the surrounding expression.
