# Verify the sample app audits clean

These commands run `manifest audit-governance` against the generic library
fixture. The fixture is intentionally generic — no Capsule-Pro vocabulary
appears under `fixtures/sample-app/`. If `audit-governance` runs cleanly
against this sample, the system is application-agnostic.

```bash
cd C:/projects/manifest

# 1. Verify the fixture's executable content (not its meta-docs) is generic.
rg -n "Capsule|Constitution" fixtures/sample-app \
  --type-not md
#  → must be empty (the README/Verify.md mention these words by name in
#     order to explain what the fixture is; --type-not md excludes them)

# 2. Run the umbrella audit against the sample's root.
manifest audit-governance \
  --root fixtures/sample-app \
  --commands-registry fixtures/sample-app/manifest-registry/commands.json \
  --bypass-registry  fixtures/sample-app/bypasses.json \
  --strict

# 3. Run individual detectors against the sample.
manifest audit-governance --root fixtures/sample-app --only direct-writes,route-drift
#  → expected: clean (no direct writes; dispatcher route is canonical)

manifest audit-governance --root fixtures/sample-app \
  --only missing-tests \
  --commands-registry fixtures/sample-app/manifest-registry/commands.json
#  → expected: clean (tests/library.test.ts references every commandId)

# 4. Confirm the deprecated alias still resolves to the same result.
manifest audit-constitution --root fixtures/sample-app --strict
#  → expected: same exit code as audit-governance, with deprecation warning on stderr
```

Each of the above is the same surface Capsule-Pro consumes (see
`docs/integrations/capsule-pro/integration-proof.md`). The fact that a
non-Capsule sample audits clean against the same surfaces is the proof
that Manifest's governance layer is application-agnostic.
