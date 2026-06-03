# Security Features

## Summary

Manifest provides several security-related features: field-level encryption, dynamic data masking, rate limiting policies, and command retry policies with backoff strategies.

## Field-Level Encryption

Properties marked with the `encrypted` modifier signal that their values should be encrypted at rest. The runtime stores values in plaintext, but projections emit encrypted column types.

```manifest
entity User {
  property required id: string
  property required email: string
  encrypted property ssn: string
  encrypted property bankAccount: string
}
```

### IR Representation

`encrypted` is a property modifier stored as `IREncryptedModifier` in the IR. Projections consume this to emit appropriate column types (e.g., Prisma `encrypted` attribute, DynamoDB encrypted fields).

### Runtime Behavior

The reference runtime does not perform encryption/decryption. Encryption is a storage-layer concern handled by projections and adapters.

## Dynamic Data Masking

The `masked` modifier declares that a property's value should be masked in certain access contexts (e.g., non-admin users see `***` instead of the actual value).

```manifest
entity Customer {
  property required id: string
  property required name: string
  masked property creditCard: string policy: user.role != "admin"
  masked property email: string policy: user.role == "support"
}
```

### Masking Policies

Each `masked` property has an associated policy expression. When the policy evaluates to `true`, the value is masked in the read response. When `false`, the full value is returned.

### Masking Strategies

| Strategy | Replacement |
|----------|------------|
| `full` | `***` (default) |
| `partial` | First/last characters preserved (e.g., `****1234`) |
| `hash` | Irreversible hash of the value |

## Rate Limiting

Rate limiting policies constrain how frequently a command can be invoked per user, tenant, or globally.

```manifest
entity ApiKey {
  property required id: string
  property userId: string

  command makeRequest() {
    rateLimit {
      window: 60000
      maxRequests: 100
      scope: user.id
    }
    // command body
  }
}
```

### Rate Limit Configuration

| Field | Description |
|-------|-------------|
| `window` | Time window in milliseconds |
| `maxRequests` | Maximum allowed requests within the window |
| `scope` | `user.id`, `tenant.id`, or `global` |
| `strategy` | `fixed` or `sliding` window |

When the rate limit is exceeded, the command returns a `rateLimitExceeded` result with retry-after metadata.

## Command Retry Policy

Commands can declare retry policies for transient failures with configurable backoff strategies.

```manifest
entity Notification {
  command sendEmail(to: string, body: string) {
    retry {
      maxAttempts: 3
      backoff: exponential
      initialDelay: 1000
      maxDelay: 10000
      jitter: true
    }
    // command body
  }
}
```

### Retry Configuration

| Field | Description |
|-------|-------------|
| `maxAttempts` | Maximum number of retry attempts |
| `backoff` | `fixed`, `exponential`, or `linear` |
| `initialDelay` | First retry delay in milliseconds |
| `maxDelay` | Cap on retry delay |
| `jitter` | Add random jitter to prevent thundering herd |

### Retry Events

| Event | When emitted |
|-------|-------------|
| `{Command}RetryAttempted` | Each retry attempt |
| `{Command}RetryExhausted` | All retries failed |

## Conformance Fixtures

- `72-command-retry-policy.manifest` — retry with exponential backoff
- `74-rate-limit-command.manifest` — rate limiting per user
- `75-rate-limit-policy.manifest` — rate limiting policy declarations
- `89-full-text-search.manifest` — searchable properties
- `91-encrypted-properties.manifest` — encrypted property declarations

## Notes

- Encryption and masking are declarative — the reference runtime does not enforce them at execution time
- Rate limiting is enforced by the runtime engine before command execution
- Retry policies apply to the command's action execution, not to guard or policy failures
