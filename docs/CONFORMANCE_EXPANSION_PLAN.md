# Conformance Expansion Plan

## Summary of Gaps

Based on analysis of existing conformance tests, current fixtures cover approximately 60% of the Manifest language specification. The following major categories are missing or under-tested:

1. **Storage Adapters** - Only `memory` store is tested
2. **Action Adapters** - `persist`, `publish`, and `effect` actions are not tested
3. **Ref Relationships** - Complex relationship patterns need coverage
4. **Policy Actions** - Different policy action scopes (read, write, delete) not tested
5. **Lambda Expressions** - Function expressions not covered
6. **Array/Object Operations** - Complex data structure operations missing
7. **Modules** - Module organization and scoping not tested
8. **Custom Channels** - Event channel customization not tested
9. **Advanced Constraint Features** - Constraint details, templates, and message mapping
10. **Command Constraints** - Command-level constraints and validation
11. **Override Mechanism** - Constraint overrides with policy authorization
12. **Entity Concurrency** - Version tracking and conflict resolution

## Prioritized List of New Fixtures

### Priority 1 (Critical for Spec Compliance)

#### 1. Storage Adapters
**Fixture**: `40-storage-adapters.manifest`
- Test all supported storage targets: `memory`, `localStorage`, `postgres`, `supabase`
- Test custom store providers via `storeProvider` hook
- Test error handling for unsupported stores
- Test persistence across different store types

**Implementation Guidance**:
- Create entities with different store targets
- Test serialization/deserialization across store types
- Verify store-specific behavior (e.g., localStorage persistence)
- Test custom store interface compliance

**Expected Output Structure**:
```json
{
  "40-storage-adapters.ir.json": Generated IR with store configurations
  "40-storage-adapters.results.json": [
    {
      "name": "localStorage persistence test",
      "persistenceTest": {
        "entity": "Preference",
        "createData": { "id": "pref-1", "theme": "dark" },
        "expectedAfterRestore": { "id": "pref-1", "theme": "dark" }
      }
    },
    {
      "name": "custom store provider test",
      "command": {
        "name": "save",
        "input": { "data": "custom" }
      },
      "expectedResult": {
        "success": true,
        "result": "saved"
      }
    }
  ]
}
```

#### 2. Lambda Expressions
**Fixture**: `41-lambda-expressions.manifest`
- Test function expressions with parameters
- Test lambda in filter/map operations
- Test lambda in command guards and actions
- Test lambda scoping and variable resolution

**Implementation Guidance**:
- Use lambda expressions in computed properties
- Test lambda in array operations (filter, map, reduce)
- Test lambda in conditional expressions
- Verify closure behavior with captured variables

**Expected Output Structure**:
```json
{
  "41-lambda-expressions.ir.json": IR with lambda expressions
  "41-lambda-expressions.results.json": [
    {
      "name": "lambda in computed property",
      "computedProperty": {
        "entity": "Order",
        "instanceId": "order-1",
        "property": "processedItems",
        "expectedValue": [{"id": "item1", "processed": true}]
      }
    }
  ]
}
```

#### 3. Array and Object Operations
**Fixture**: `42-array-operations.manifest`
- Test array operations: `contains`, `in`, filter, map, length
- Test object operations: property access, dynamic keys
- Test nested array/object traversal
- Test array/object literals in expressions

**Implementation Guidance**:
- Create entities with array properties
- Test array membership operations
- Test array transformation functions
- Test object property access and manipulation

**Expected Output Structure**:
```json
{
  "42-array-operations.ir.json": IR with array operations
  "42-array-operations.results.json": [
    {
      "name": "array contains operation",
      "command": {
        "name": "checkPermission",
        "input": { "permission": "edit" }
      },
      "expectedResult": {
        "success": true,
        "result": true
      }
    }
  ]
}
```

### Priority 2 (Important Features)

#### 4. Command Constraints
**Fixture**: `43-command-constraints.manifest`
- Test command-level constraints with different severity levels
- Test constraint evaluation order (policies → command constraints → guards)
- Test constraint details and message templates
- Test constraint outcomes reporting

**Implementation Guidance**:
- Define commands with pre-execution constraints
- Test `ok`, `warn`, and `block` severity levels
- Test constraint details mapping for UI
- Test constraint failure messages

**Expected Output Structure**:
```json
{
  "43-command-constraints.ir.json": IR with command constraints
  "43-command-constraints.results.json": [
    {
      "name": "command constraint blocks execution",
      "command": {
        "name": "update",
        "input": { "value": "invalid" }
      },
      "expectedResult": {
        "success": false,
        "error": "Constraint validation failed"
      }
    }
  ]
}
```

#### 5. Override Mechanism
**Fixture**: `44-constraint-overrides.manifest`
- Test constraint override authorization via policies
- Test override request format and validation
- Test OverrideApplied event emission
- Test overrideable constraint configuration

**Implementation Guidance**:
- Mark constraints as `overrideable: true`
- Define override policies for authorization
- Test override request handling
- Verify override event emission

**Expected Output Structure**:
```json
{
  "44-constraint-overrides.ir.json": IR with override configuration
  "44-constraint-overrides.results.json": [
    {
      "name": "admin can override constraint",
      "command": {
        "name": "bypass",
        "input": { "reason": "Urgent override" }
      },
      "expectedResult": {
        "success": true,
        "emittedEvents": [{
          "name": "OverrideApplied",
          "channel": "constraint.overridden",
          "payload": {
            "constraintCode": "ageCheck",
            "reason": "Urgent override",
            "authorizedBy": "admin-1"
          }
        }]
      }
    }
  ]
}
```

#### 6. Entity Concurrency
**Fixture**: `45-concurrency-control.manifest`
- Test version property incrementing
- Test versionAt property tracking
- Test concurrency conflict detection
- Test optimistic locking behavior

**Implementation Guidance**:
- Define entities with `versionProperty` and `versionAtProperty`
- Test concurrent update scenarios
- Test conflict detection and reporting
- Test version increment on successful updates

**Expected Output Structure**:
```json
{
  "45-concurrency-control.ir.json": IR with concurrency configuration
  "45-concurrency-control.results.json": [
    {
      "name": "concurrent update conflict",
      "setup": {
        "createInstance": {
          "entity": "Document",
          "data": { "id": "doc-1", "content": "Initial", "version": 1 }
        }
      },
      "command": {
        "name": "update",
        "input": { "content": "Updated", "version": 1 }
      },
      "expectedResult": {
        "success": false,
        "error": "ConcurrencyConflict",
        "conflict": {
          "entityType": "Document",
          "entityId": "doc-1",
          "expectedVersion": 1,
          "actualVersion": 2
        }
      }
    }
  ]
}
```

### Priority 3 (Advanced Features)

#### 7. Ref Relationships
**Fixture**: `46-ref-relationships.manifest`
- Test `ref` relationship kind specifically
- Test ref relationship traversal in expressions
- Test ref relationship with null handling
- Test ref relationship in computed properties

**Implementation Guidance**:
- Create entities with `ref` relationships
- Test ref access in expressions
- Test ref resolution with non-existent targets
- Test ref in computed property dependencies

**Expected Output Structure**:
```json
{
  "46-ref-relationships.ir.json": IR with ref relationships
  "46-ref-relationships.results.json": [
    {
      "name": "ref relationship resolution",
      "computedProperty": {
        "entity": "Order",
        "instanceId": "order-1",
        "property": "customerEmail",
        "expectedValue": "customer@example.com"
      }
    }
  ]
}
```

#### 8. Policy Action Scopes
**Fixture**: `47-policy-actions.manifest`
- Test policy action scopes: `read`, `write`, `delete`, `execute`, `all`
- Test action-specific authorization rules
- Test policy scoping to entities
- Test policy priority and ordering

**Implementation Guidance**:
- Define policies with different action scopes
- Test read-only vs write permissions
- Test delete authorization
- Test execute scope for commands

**Expected Output Structure**:
```json
{
  "47-policy-actions.ir.json": IR with policy actions
  "47-policy-actions.results.json": [
    {
      "name": "read-only policy blocks write",
      "command": {
        "name": "update",
        "input": { "value": "new" }
      },
      "expectedResult": {
        "success": false,
        "deniedBy": "readOnlyPolicy"
      }
    }
  ]
}
```

#### 9. Action Adapters
**Fixture**: `48-action-adapters.manifest`
- Test `persist` adapter behavior
- Test `publish` adapter behavior
- Test `effect` adapter behavior
- Test adapter return value handling

**Implementation Guidance**:
- Define actions with adapter hooks
- Test adapter integration points
- Test adapter error handling
- Test adapter return value propagation

**Expected Output Structure**:
```json
{
  "48-action-adapters.ir.json": IR with action adapters
  "48-action-adapters.results.json": [
    {
      "name": "persist action with adapter",
      "command": {
        "name": "saveToDatabase",
        "input": { "data": "persistent" }
      },
      "expectedResult": {
        "success": true,
        "result": "persisted"
      }
    }
  ]
}
```

### Priority 4 (Specialized Features)

#### 10. Modules
**Fixture**: `49-modules.manifest`
- Test module organization and scoping
- Test module-level entity grouping
- Test module policy inheritance
- Test cross-module relationships

**Implementation Guidance**:
- Define multiple modules with different entities
- Test module namespace isolation
- Test cross-module references
- Test module-level configuration

**Expected Output Structure**:
```json
{
  "49-modules.ir.json": IR with module definitions
  "49-modules.results.json": [
    {
      "name": "cross-module relationship",
      "command": {
        "name": "linkModules",
        "input": { "localId": "item-1", "remoteId": "ref-1" }
      },
      "expectedResult": {
        "success": true
      }
    }
  ]
}
```

#### 11. Custom Event Channels
**Fixture**: `50-custom-channels.manifest`
- Test custom event channel definitions
- Test channel-specific event routing
- Test channel filtering and scoping
- Test channel in event emission

**Implementation Guidance**:
- Define events with custom channels
- Test channel-specific behavior
- Test channel-based event filtering
- Test channel in emit expressions

**Expected Output Structure**:
```json
{
  "50-custom-channels.ir.json": IR with custom channels
  "50-custom-channels.results.json": [
    {
      "name": "custom channel event emission",
      "command": {
        "name": "notify",
        "input": { "message": "test" }
      },
      "expectedResult": {
        "success": true,
        "emittedEvents": [{
          "name": "CustomEvent",
          "channel": "custom.notifications",
          "payload": { "message": "test" }
        }]
      }
    }
  ]
}
```

#### 12. Advanced Constraint Features
**Fixture**: `51-advanced-constraints.manifest`
- Test constraint details mapping
- Test message template interpolation
- Test constraint code uniqueness
- Test constraint severity propagation

**Implementation Guidance**:
- Define constraints with detailed mapping
- Test template interpolation with variables
- Test constraint code validation
- Test severity-based behavior

**Expected Output Structure**:
```json
{
  "51-advanced-constraints.ir.json": IR with advanced constraints
  "51-advanced-constraints.results.json": [
    {
      "name": "constraint details mapping",
      "command": {
        "name": "validate",
        "input": { "value": "test" }
      },
      "expectedResult": {
        "success": false,
        "constraintFailures": [{
          "code": "formatCheck",
          "details": { "expected": "^[a-z]+$", "actual": "test" }
        }]
      }
    }
  ]
}
```

## Implementation Timeline

### Phase 1 (2-3 weeks)
- Storage Adapters (40)
- Lambda Expressions (41)
- Array Operations (42)
- Command Constraints (43)

### Phase 2 (2-3 weeks)
- Override Mechanism (44)
- Entity Concurrency (45)
- Ref Relationships (46)
- Policy Actions (47)

### Phase 3 (1-2 weeks)
- Action Adapters (48)
- Modules (49)
- Custom Channels (50)
- Advanced Constraints (51)

## Test Coverage Goals

After implementing all fixtures, the conformance test suite should achieve:
- **IR Coverage**: 95% of all IR schema elements
- **Runtime Coverage**: 100% of runtime behaviors
- **Edge Case Coverage**: All error conditions and edge cases
- **Integration Coverage**: Cross-feature interactions and combinations

## Quality Assurance

Each new fixture must include:
1. **Compilation Test**: Verify IR generation matches expected output
2. **Runtime Test**: Verify runtime behavior matches expected results
3. **Determinism Test**: Verify consistent output across multiple runs
4. **Error Handling Test**: Verify proper error reporting for invalid inputs

## Maintenance Considerations

- Regular review of new spec additions for conformance gaps
- Update fixtures when IR schema changes
- Add integration tests for feature combinations
- Performance testing for complex fixtures\n\n## Updated Analysis Based on Current 36 Fixtures\n\n### Current Coverage Analysis\n\nBased on analysis of src/manifest/conformance/fixtures/ (36 fixtures):\n\n#### ✅ Well-Covered Features (70%)\n1. **Entity Properties** (01, 19) - Basic property types, modifiers, defaults\n2. **Relationships** (02) - Basic hasMany, hasOne, belongsTo patterns\n3. **Computed Properties** (03, 20) - Basic computed values and dependencies\n4. **Commands** (04, 20) - Basic command execution, mutation, events\n5. **Guards** (05, 11) - Guard evaluation, failure reporting\n6. **Policies** (06, 22) - Policy-based authorization, execute scope\n7. **Constraints** (19, 21, 25, 26, 36) - Constraint validation, severity levels\n8. **Events** (04, 15, 20) - Event emission, basic channels\n9. **Error Handling** (12, 28-36) - Compilation and runtime errors\n10. **Built-ins** (16) - Basic function usage\n\n#### ⚠️ Partially Covered Features (20%)\n1. **Array Operations** (16) - Limited built-in function coverage\n2. **Concurrency** (24) - Basic conflict detection but not fully tested\n3. **Override Authorization** (22) - Basic override mechanism but not comprehensive\n\n#### ❌ Missing or Under-Tested Features (10%)\n1. **Storage Adapters** - Only memory store tested\n2. **Action Adapters** - persist, publish, effect not tested\n3. **Lambda Expressions** - Function expressions not covered\n4. **Ref Relationships** - Fourth relationship kind not specifically tested\n5. **Policy Action Scopes** - read, write, delete, override not tested\n6. **Modules** - Module organization not tested\n7. **Custom Channels** - Event channel customization not tested\n8. **Advanced Constraints** - Details and templates not tested\n9. **Command Constraints** - Command-level constraints not tested\n10. **Entity Concurrency** - Version tracking not comprehensively tested\n11. **Override Mechanism** - Constraint overrides not fully tested\n\n## Priority Order Based on IMPLEMENTATION_PLAN.md H-3\n\n### Priority 1: Critical Infrastructure\n1. **Storage Adapters** (40) - localStorage, postgres, supabase, custom providers\n2. **Action Adapters** (41) - persist, publish, effect behavior\n3. **Lambda Expressions** (42) - Function expressions and closures\n4. **Array Operations** (43) - Complex data structure operations\n\n### Priority 2: Advanced Features\n5. **Ref Relationships** (44) - Fourth relationship kind testing\n6. **Policy Actions** (45) - Full policy scope enforcement\n7. **Modules** (46) - Module system validation\n8. **Custom Channels** (47) - Event channel customization\n9. **Advanced Constraints** (48) - Constraint details and templates\n\n### Priority 3: System Features\n10. **Command Constraints** (49) - Command-level validation\n11. **Concurrency Control** (50) - Versioning and locking\n12. **Override Mechanism** (51) - Constraint overrides\n\n## Expected Output Templates\n\n### Storage Adapters (40)\n```json\n{\n  "40-storage-adapters.ir.json": {\n    "entities": [\n      {\n        "name": "Preference",\n        "store": { "target": "localStorage" },\n        "properties": [\n          { "name": "id", "type": { "name": "string" }, "modifiers": ["required"] },\n          { "name": "theme", "type": { "name": "string" }, "defaultValue": { "kind": "string", "value": "light" } }\n        ]\n      }\n    ]\n  },\n  "40-storage-adapters.results.json": [\n    {\n      "name": "localStorage persistence test",\n      "persistenceTest": {\n        "entity": "Preference",\n        "createData": { "id": "pref-1", "theme": "dark" },\n        "expectedAfterRestore": { "id": "pref-1", "theme": "dark" }\n      }\n    }\n  ]\n}\n```\n\n### Lambda Expressions (42)\n```json\n{\n  "42-lambda-expressions.ir.json": {\n    "entities": [\n      {\n        "name": "Order",\n        "computedProperties": [\n          {\n            "name": "processedItems",\n            "expression": {\n              "kind": "lambda",\n              "parameters": ["item"],\n              "body": {\n                "kind": "binary",\n                "operator": "and",\n                "left": { "kind": "member", "object": "item", "property": "processed" },\n                "right": { "kind": "call", "function": "exists", "arguments": [{ "kind": "member", "object": "item", "property": "id" }] }\n              }\n            }\n          }\n        ]\n      }\n    ]\n  }\n}\n```\n\n### Policy Actions (45)\n```json\n{\n  "45-policy-actions.ir.json": {\n    "entities": [\n      {\n        "name": "Document",\n        "commands": [\n          {\n            "name": "read",\n            "policies": [\n              {\n                "name": "canRead",\n                "action": "read",\n                "expression": { "kind": "binary", "operator": "==", "left": { "kind": "member", "object": "user", "property": "role" }, "right": { "kind": "literal", "value": "reader" } }\n              }\n            ]\n          }\n        ]\n      }\n    ]\n  }\n}\n```\n\n## Implementation Timeline\n\n### Phase 1 (Weeks 1-4)\n- Storage Adapters (40)\n- Action Adapters (41)\n- Lambda Expressions (42)\n- Array Operations (43)\n\n### Phase 2 (Weeks 5-8)\n- Ref Relationships (44)\n- Policy Actions (45)\n- Modules (46)\n- Custom Channels (47)\n\n### Phase 3 (Weeks 9-12)\n- Advanced Constraints (48)\n- Command Constraints (49)\n- Concurrency Control (50)\n- Override Mechanism (51)\n\n## Test Coverage Goals\n\nAfter implementing all 15 new fixtures:\n- **IR Coverage**: 95% of all IR schema elements\n- **Runtime Coverage**: 100% of runtime behaviors\n- **Edge Case Coverage**: All error conditions\n- **Integration Coverage**: Cross-feature interactions\n\nTotal tests: 448 (current) + 300+ (new) = 750+ tests\n\n## Quality Assurance\n\nEach fixture must include:\n1. Compilation test (IR generation)\n2. Runtime test (behavior validation)\n3. Determinism test (consistent output)\n4. Error handling test (proper reporting)\n\n## Maintenance\n\n- Quarterly review of new spec additions\n- Annual conformance test suite audit\n- Performance benchmark integration\n- Documentation updates for new fixtures\n\n---\n\n**Updated**: 2026-02-11\n**Analysis Method**: Codebase examination of 36 existing fixtures\n**Priority**: Based on IMPLEMENTATION_PLAN.md H-3 requirements
