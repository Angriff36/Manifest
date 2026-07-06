# Approval Workflows

## Summary

Multi-stage approval workflows gate command execution behind one or more approval stages. Each stage declares a policy expression controlling who can approve, a required count of approvals, and an optional when condition for conditional staging.

## DSL Syntax

```manifest
entity PurchaseOrder {
  property required id: string
  property amount: number = 0
  property status: string = "pending"

  command submit() {
    guard self.status == "pending"
    mutate status = "submitted"
    emit OrderSubmitted
  }

  approval submitApproval {
    command: submit
    stages {
      manager {
        policy: user.role == "manager"
        required: 1
      }
      director {
        policy: user.role == "director" or user.role == "admin"
        required: 1
        when: self.amount > 10000
      }
    }
    timeout: 72
    on_timeout: "cancel"
    emit ApprovalRequested
    emit ApprovalGranted
  }
}
```

## IR Schema Changes

- `IRApprovalStage`: name, policy (IRExpression), required (number), optional when (IRExpression)
- `IRApproval`: name, command (string), stages (IRApprovalStage[]), optional timeout/onTimeout, emits
- `IREntity.approvals`: optional array of IRApproval

## Runtime Behavior

Execution gate order: rate-limit → policies → constraints → guards → **approval gate** → actions → emits

When a command has a matching approval declaration:
1. The runtime evaluates each stage's `when` condition to determine required stages
2. If all required stages are granted, execution proceeds normally
3. If any required stage is pending, the command returns `{ approvalRequired: ApprovalRequiredInfo }`
4. No actions execute until all approvals are satisfied

### Runtime API

- `requestApproval(entity, instanceId, approvalName)` — creates a pending approval request
- `approveStage(entity, instanceId, approvalName, stage, userId)` — evaluates stage policy, records grant
- `denyApproval(entity, instanceId, approvalName, deniedBy, reason)` — marks as denied
- `expireApprovals(now?)` — expires pending approvals past timeout
- `getApprovalRequest(entity, instanceId, approvalName)` — query approval state

## Conformance Fixtures

- `68-approval-workflow.manifest` — PurchaseOrder with manager/director stages

## Test Coverage

18 tests in `src/manifest/runtime-approval.test.ts` covering parser, IR compiler validation, and runtime lifecycle.
