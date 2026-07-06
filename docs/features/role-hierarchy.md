# Role Hierarchy and Permission Inheritance

## Summary

Role declarations define named permission sets with single inheritance. A role that extends a parent inherits all its permissions. Deny rules are absolute — if any role in the chain denies an action, the denial takes precedence regardless of allows from other roles.

## DSL Syntax

```manifest
role User {
  allow read
}

role Manager extends User {
  allow write
  allow execute CreateReport
}

role Admin extends Manager {
  allow delete
  deny execute DangerousReset
}
```

## Permission Inheritance

- `User` can read
- `Manager` extends `User` → can read, write, execute `CreateReport`
- `Admin` extends `Manager` → can read, write, execute `CreateReport`, delete (but `DangerousReset` is denied)

### Inheritance Rules

1. Permissions are inherited transitively through the `extends` chain
2. `effectivePermissions` is precomputed at compile time
3. `deny` always wins over `allow` — even if a parent role allows and a child denies

## Runtime Builtins

- `hasPermission(action, target?)` — checks if the current user's role grants a permission (reads `context.user.role`)
- `roleAllows(roleName, action)` — checks if a named role allows an action

**Role name matching is exact and case-sensitive.** `'Admin'` and `'admin'` are treated as different roles. A caller supplying the wrong case silently receives `false` with no error. Ensure role names in `context.user.role` match the declared role names exactly.

## Context-Sensitive `role` Keyword

The `role` keyword is context-sensitive — it is emitted as an identifier rather than a reserved keyword, so `property role: string` and `mutate role = "admin"` continue to parse without reserved-word errors.

## Conformance Fixtures

- `71-role-hierarchy.manifest` — User/Manager/Admin hierarchy with permission checks

## Test Coverage

Tests in `src/manifest/runtime-engine.test.ts` covering inheritance chains, deny semantics, effectivePermissions computation, and builtins.
