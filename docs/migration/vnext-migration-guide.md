# Manifest vNext Migration Guide

This guide helps you migrate existing Manifest code to use vNext features. vNext introduces constraint severity levels, override mechanisms, command-level constraints, and optimistic concurrency controls.

**Why Migrate?**
- **Softer Constraints**: Use `ok` and `warn` for informational checks that don't halt execution
- **Authorized Overrides**: Allow trusted users to bypass specific constraints with audit trails
- **Pre-execution Validation**: Add command-level constraints for early validation
- **Concurrency Safety**: Use optimistic locking to prevent lost updates in concurrent scenarios

## Quick Reference

| Feature | Syntax | Status |
|---------|--------|--------|
| Constraint Severity | `constraint name:severity expr "message"` | Backward Compatible |
| Overrideable Constraints | `constraint overrideable name { ... }` | New |
| Command Constraints | Add `constraint` blocks inside commands | New |
| Entity Versioning | `versionProperty` / `versionAtProperty` | New |
| Override Policies | `policy name override: expr "message"` | New |

---

## 1. Constraint Severity Levels

### Before (Baseline)
All constraints either passed or blocked execution:

```manifest
entity Order {
  property required status: string = "pending"
  property amount: number = 0

  // This ALWAYS blocks if amount > 1000
  constraint maxAmount: self.amount <= 1000 "Amount exceeds limit"
}
```

### After (vNext)
Use severity levels to differentiate between informational, warning, and blocking constraints:

```manifest
entity Order {
  property required status: string = "pending"
  property amount: number = 0

  // Informational - always passes, provides context
  constraint orderInfo:ok self.amount > 0 "Order has positive amount"

  // Warning - passes but surfaces concern
  constraint largeAmount:warn self.amount > 5000 "Large order - may require review"

  // Block - halts execution on failure (default behavior)
  constraint maxAmount:block self.amount > 1000 "Amount exceeds limit"
}
```

### Severity Behavior

| Severity | Expression Result | Execution Continues? | Outcome Recorded |
|----------|-------------------|---------------------|------------------|
| `ok` | Any value | Yes | Always `passed` |
| `warn` | `true` / truthy | Yes | `passed` |
| `warn` | `false` / falsey | Yes | `passed` (with warning) |
| `block` | `true` / truthy | Yes | `passed` |
| `block` | `false` / falsey | **No** | `failed` (halts) |

### Default Severity
If no severity is specified, `block` is assumed (backward compatible):

```manifest
// These are equivalent:
constraint maxAmount: self.amount <= 1000 "Exceeds limit"
constraint maxAmount:block self.amount <= 1000 "Exceeds limit"
```

---

## 2. Overrideable Constraints

### Before (Baseline)
Constraints were always enforced - no way to bypass even for authorized users.

### After (vNext)
Mark constraints as `overrideable` and specify the policy that authorizes overrides:

```manifest
entity ExpenseReport {
  property required amount: number = 0
  property required status: string = "pending"
  property approvedBy: string = ""

  command approve() {
    constraint overrideable requiresApproval {
      expression: self.status == "approved" or self.amount <= 500
      severity: block
      message: "Expenses over $500 require approval"
      overridePolicy: canApproveExpenses
    }

    mutate status = "approved"
    mutate approvedBy = context.user.id
    emit ExpenseApproved
  }
}

policy canApproveExpenses override:
  user.role == "manager" or user.role == "finance"
  "Only managers and finance team can approve expenses over limit"
```

### Override Flow

When a constraint fails and is marked `overrideable`:

1. Runtime checks if constraint allows overrides (`overrideable: true`)
2. If `overridePolicyRef` is specified, the referenced policy is evaluated
3. If policy passes, constraint outcome is marked `overridden: true`
4. An `OverrideApplied` event is emitted with audit details
5. Command execution continues

### Constraint Override Schema

```manifest
constraint overrideable name {
  expression: <boolean expression>
  severity: block | warn | ok
  message: "Human-readable message"
  overridePolicy: policyName  // Optional: references policy with action: override
}
```

### Security Considerations

- **NOT all constraints should be overrideable** - use sparingly for business rules that require legitimate exceptions
- **Override policies use `action: override`** - distinct from read/write/execute policies
- **All overrides are audited** - the `overriddenBy` field captures who authorized the bypass
- **Override requests require**: constraint code, reason, authorizer, timestamp

---

## 3. Command-Level Constraints

### Before (Baseline)
Constraints existed only at entity level - evaluated during any mutation:

```manifest
entity Order {
  property required status: string = "pending"

  constraint notCancelled: self.status != "cancelled"
    "Cannot modify cancelled orders"

  command cancel() {
    mutate status = "cancelled"
  }
}
```

### After (vNext)
Add constraints inside commands for pre-execution validation specific to that operation:

```manifest
entity Order {
  property required status: string = "pending"

  command cancel() {
    constraint alreadyCancelled:ok self.status == "cancelled"
      "Order is already cancelled"

    constraint refundWarning:warn self.amount > 100
      "Refund required for paid orders"

    constraint blockShipped:block self.status == "shipped"
      "Cannot cancel shipped orders"

    mutate status = "cancelled"
    emit OrderCancelled
  }

  command updateStatus(newStatus: string) {
    constraint blockCancelled:block self.status == "cancelled"
      "Cannot update cancelled order"

    mutate status = newStatus
    emit StatusUpdated
  }
}
```

### Constraint Evaluation Order

For command execution:
1. **Policies** (`action: execute` or `all`)
2. **Command constraints** (all severities evaluated)
3. **Guards** (short-circuit on first falsey)
4. **Actions**
5. **Emits**

### When to Use Command vs Entity Constraints

| Use Entity Constraints When | Use Command Constraints When |
|----------------------------|------------------------------|
| Rule applies to ALL mutations | Rule applies to ONE specific command |
| Invariant must always hold | Validation is operation-specific |
| Cross-command consistency needed | Different commands need different rules |

---

## 4. Optimistic Concurrency Control

### Before (Baseline)
Concurrent updates could overwrite each other (last write wins):

```manifest
entity Document {
  property required id: string
  property title: string
  property content: string

  command update(newTitle: string, newContent: string) {
    mutate title = newTitle
    mutate content = newContent
  }
}
// Problem: Two users updating simultaneously = lost data
```

### After (vNext)
Use `versionProperty` and `versionAtProperty` for optimistic locking:

```manifest
entity Document {
  property required id: string
  property title: string
  property content: string

  versionProperty version: number
  versionAtProperty versionAt: number

  command create(title: string, content: string) {
    guard title != null and title != ""
    mutate id = uuid()
    mutate title = title
    mutate content = content
    mutate version = 1
    mutate versionAt = now()
    emit DocumentCreated
  }

  command update(newTitle: string, newContent: string, currentVersion: number) {
    guard newTitle != null and newTitle != ""
    guard self.version == currentVersion
      // This guard ensures we're working with latest data

    mutate title = newTitle
    mutate content = newContent
    mutate version = currentVersion + 1
    mutate versionAt = now()
    emit DocumentUpdated
  }
}
```

### Concurrency Conflict Behavior

When version check fails:
1. Command does NOT execute
2. Returns `ConcurrencyConflict` with:
   - `entityType`: Entity name
   - `entityId`: Instance ID
   - `expectedVersion`: Version provided by caller
   - `actualVersion`: Current version in storage
   - `conflictCode`: Stable code for categorization
3. Client can retry with fresh data

### Usage Pattern

```javascript
// Client-side usage example
async function updateDocument(docId, updates) {
  let doc = await store.get(docId);
  let retries = 3;

  while (retries > 0) {
    try {
      let result = await runtime.execute(doc.entity, 'update', {
        newTitle: updates.title,
        newContent: updates.content,
        currentVersion: doc.version  // Pass current version
      });
      return result;
    } catch (err) {
      if (err.conflictCode === 'CONCURRENCY_VERSION_MISMATCH') {
        // Fetch fresh data and retry
        doc = await store.get(docId);
        retries--;
      } else {
        throw err;
      }
    }
  }
}
```

---

## 5. Complete Example: Migrating an Entity

### Before (Baseline Manifest)

```manifest
entity Invoice {
  property required id: string
  property required amount: number = 0
  property required status: string = "draft"
  property approvedBy: string = ""

  constraint positiveAmount: self.amount > 0 "Amount must be positive"

  command approve() {
    mutate status = "approved"
    mutate approvedBy = context.user.id
    emit InvoiceApproved
  }

  command process() {
    mutate status = "processed"
    emit InvoiceProcessed
  }
}
```

### After (vNext Manifest)

```manifest
entity Invoice {
  property required id: string
  property required amount: number = 0
  property required status: string = "draft"
  property approvedBy: string = ""

  versionProperty version: number
  versionAtProperty versionAt: number

  // Informational: track invoice state
  constraint isDraft:ok self.status == "draft" "Invoice is in draft state"

  // Warning: surface large invoices for review
  constraint largeInvoice:warn self.amount > 10000
    "Large invoice - management review recommended"

  // Block: validate business rule
  constraint positiveAmount:block self.amount > 0 "Amount must be positive"

  command approve(approverComment: string) {
    constraint alreadyApproved:ok self.status == "approved"
      "Invoice already approved"

    constraint blockProcessed:block self.status == "processed"
      "Cannot approve processed invoice"

    mutate status = "approved"
    mutate approvedBy = context.user.id
    mutate version = self.version + 1
    mutate versionAt = now()
    emit InvoiceApproved
  }

  command process(currentVersion: number) {
    constraint overrideable requiresApproval {
      expression: self.status == "approved" or self.amount <= 500
      severity: block
      message: "Invoices over $500 must be approved"
      overridePolicy: canProcessInvoices
    }

    guard self.version == currentVersion
      "Version check for optimistic concurrency"

    mutate status = "processed"
    mutate version = currentVersion + 1
    mutate versionAt = now()
    emit InvoiceProcessed
  }
}

policy canProcessInvoices override:
  user.role in ["manager", "finance", "admin"]
  "Only managers can process unapproved invoices over limit"
```

---

## 6. Breaking Changes

**None.** vNext is fully backward compatible:

- Existing constraints without severity default to `block`
- Entities without versioning work as before
- Commands without constraints work as before
- No syntax changes to existing features

---

## 7. Testing Your Migration

After applying vNext features, verify with conformance tests:

```bash
npm run conformance:regen  # Regenerate expected outputs
npm test                   # Run all conformance tests
```

Expected results for vNext fixtures:
- Fixture 21: Constraint Outcomes - 134 tests pass
- Fixture 22: Override Authorization - 134 tests pass
- Fixture 23: Workflow Idempotency - 134 tests pass
- Fixture 24: Concurrency Conflict - 134 tests pass
- Fixture 25: Command Constraints - 134 tests pass
- Fixture 26: Performance Constraints - 134 tests pass
- Fixture 27: vNext Integration - 134 tests pass

---

## 8. Further Reading

- **vNext Feature Specification**: `docs/spec/manifest-vnext.md`
- **IR Schema**: `docs/spec/ir/ir-v1.schema.json`
- **Runtime Semantics**: `docs/spec/semantics.md`
- **Conformance Tests**: `src/manifest/conformance/fixtures/`

---

## 9. Quick Migration Checklist

- [ ] Identify constraints that could use `ok` or `warn` severity
- [ ] Add `overrideable` to constraints requiring legitimate exceptions
- [ ] Create `override` policies for authorization
- [ ] Move operation-specific validation to command constraints
- [ ] Add `versionProperty`/`versionAtProperty` to entities with concurrent updates
- [ ] Update commands to include version checks
- [ ] Run conformance tests to verify
- [ ] Audit your override events for security compliance
