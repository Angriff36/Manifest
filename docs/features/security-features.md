# Security Features

## Summary

Manifest provides several security-related features: field-level encryption, dynamic data masking, rate limiting on commands, and command retry policies with backoff strategies.

## Field-Level Encryption

Properties marked with the `encrypted` modifier signal that their values should be encrypted at rest. When `encryptionProvider` is supplied via `RuntimeOptions`, the runtime encrypts on write and decrypts on read at the store boundary.

```manifest
entity Patient {
  property name: string
  property encrypted ssn: string
  property encrypted required medicalNotes: string
}
```

### IR Representation

`encrypted` is a property modifier stored in IR metadata. Projections consume this to emit appropriate column types (e.g., Prisma encrypted attributes).

### Runtime Behavior

With `RuntimeOptions.encryptionProvider`, the reference runtime encrypts `encrypted` properties on persist and decrypts on read. Without a provider, values are stored as supplied.

## Dynamic Data Masking

The `masked` modifier declares masking strategies for read paths. Unmask rules use `unmask when <expr>`.

```manifest
entity Patient {
  property required id: string
  property masked(partial, 0, 4) ssn: string
  property masked(email) contact: string unmask when user.role == "admin"
  property masked(phone) phone: string
  property masked(last4) card: string
  property masked notes: string
  property masked(redact) diagnosis: string?
}
```

### Masking Strategies

| Strategy | Behavior |
|----------|----------|
| `partial(start, end)` | Preserve characters at start/end |
| `email` | Mask local part of email |
| `phone` | Mask phone number |
| `last4` | Show last four characters |
| `redact` | Full redaction |
| bare `masked` | Defaults to redact |

When `unmask when` evaluates true for the current `user` binding, the full value is returned.

## Rate Limiting

Rate limits are declared inside command bodies:

```manifest
command sendNotification(recipient: string, message: string) {
  rateLimit {
    maxRequests: 10
    windowMs: 1000
    scope: user
    burstAllowance: 5
  }
  guard context.authenticated == true
  emit NotificationSent
}
```

### Rate Limit Configuration

| Field | Description |
|-------|-------------|
| `windowMs` | Time window in milliseconds |
| `maxRequests` | Maximum allowed requests within the window |
| `scope` | `user`, `"tenant"`, or `global` (quote `tenant` — it is a reserved word) |
| `burstAllowance` | Optional burst above steady rate |

When the rate limit is exceeded, the command fails before execution.

## Command Retry Policy

Commands can declare retry policies for transient action failures:

```manifest
entity Task {
  property id: string
  property status: string

  command sendEmail(recipient: string, body: string) {
    retry {
      maxAttempts: 3
      backoff: exponential
      delay: 1000
      retryOn: transient
    }
    guard self.status == "pending"
    mutate status = "processing"
  }
}
```

### Retry Configuration

| Field | Description |
|-------|-------------|
| `maxAttempts` | Maximum number of retry attempts |
| `backoff` | `fixed`, `exponential`, or `linear` |
| `delay` | Base delay in milliseconds |
| `retryOn` | Conditions that qualify for retry |

Retry policies apply to action execution, not to guard or policy failures.

## Conformance Fixtures

- `72-command-retry-policy.manifest` — retry with exponential backoff
- `74-rate-limit-command.manifest` — rate limiting per user
- `75-rate-limit-policy.manifest` — rate limiting policy declarations
- `91-encrypted-properties.manifest` — encrypted property declarations
- `93-data-masking.manifest` — masked property strategies and unmask rules

## Notes

- Masking is enforced on `getInstance` / `getAllInstances` read paths, not on raw create results
- Rate limiting is enforced by the runtime engine before command execution. Rate-limit state is **in-memory only and resets on process restart** — no durable adapter is shipped. For multi-process deployments each process has an independent counter.
- `retryOn` matches the failed attempt's error code, derived from its `CommandResult`: a concurrency conflict yields `CONCURRENCY_CONFLICT`; a structured (`CODE: message`) error surfaces its leading `CODE` verbatim (so a command that fails with `SUPPLIER_UNAVAILABLE: …` is retryable when `retryOn` lists `SUPPLIER_UNAVAILABLE`); an unstructured error mentioning `TIMEOUT` falls back to `TIMEOUT`. A code that never surfaces as a failure — or is not listed in `retryOn` — simply does not trigger a retry.
- Retry policies apply to the command's action execution, not to guard or policy failures
