/**
 * Unit tests for Approval Workflow feature
 *
 * Tests the approval gate in the command execution pipeline:
 * - Parser: approval block parses correctly
 * - IR Compiler: approval → IR transformation and validation diagnostics
 * - Runtime: command blocking, stage approval, denial, expiration
 */

import { describe, it, expect } from 'vitest';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';
import { MemoryApprovalStore } from './approval/stores/memory';

// Helper to compile manifest source to IR
async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

const APPROVAL_SOURCE = `
entity PurchaseOrder {
  property required id: string
  property amount: number = 0
  property status: string = "draft"

  command submit() {
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
        policy: user.role == "director"
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

store PurchaseOrder in memory

event OrderSubmitted: "order.submitted" {
  orderId: string
}

event ApprovalRequested: "approval.requested" {
  orderId: string
}

event ApprovalGranted: "approval.granted" {
  orderId: string
}
`;

describe('Approval Workflow', () => {
  // ─── Parser Tests ────────────────────────────────────────────────
  describe('Parser', () => {
    it('should parse approval block with stages', async () => {
      const ir = await compileToIR(APPROVAL_SOURCE);
      const entity = ir.entities.find((e) => e.name === 'PurchaseOrder');
      expect(entity?.approvals).toBeDefined();
      expect(entity?.approvals).toHaveLength(1);

      const approval = entity!.approvals![0];
      expect(approval.name).toBe('submitApproval');
      expect(approval.command).toBe('submit');
      expect(approval.stages).toHaveLength(2);
      expect(approval.timeout).toBe(72);
      expect(approval.onTimeout).toBe('cancel');
      expect(approval.emits).toEqual(['ApprovalRequested', 'ApprovalGranted']);
    });

    it('should parse stage with policy expression', async () => {
      const ir = await compileToIR(APPROVAL_SOURCE);
      const stage = ir.entities[0].approvals![0].stages[0];
      expect(stage.name).toBe('manager');
      expect(stage.required).toBe(1);
      expect(stage.policy.kind).toBe('binary');
      expect(stage.when).toBeUndefined();
    });

    it('should parse stage with when condition', async () => {
      const ir = await compileToIR(APPROVAL_SOURCE);
      const stage = ir.entities[0].approvals![0].stages[1];
      expect(stage.name).toBe('director');
      expect(stage.when).toBeDefined();
      expect(stage.when!.kind).toBe('binary');
    });

    it('should compile approval without timeout', async () => {
      const ir = await compileToIR(`
        entity Task {
          property required id: string
          command close() {
            mutate result = true
          }
          approval closeApproval {
            command: close
            stages {
              lead {
                policy: user.role == "lead"
                required: 1
              }
            }
            emit ApprovalRequested
          }
        }
        event ApprovalRequested: "approval.requested" { taskId: string }
      `);
      const approval = ir.entities[0].approvals![0];
      expect(approval.timeout).toBeUndefined();
      expect(approval.onTimeout).toBeUndefined();
    });
  });

  // ─── IR Compiler Validation Tests ────────────────────────────────
  describe('IR Compiler Validation', () => {
    it('should emit error for approval referencing non-existent command', async () => {
      const compiler = new IRCompiler();
      const result = await compiler.compileToIR(`
        entity Order {
          property required id: string
          approval orderApproval {
            command: nonexistent
            stages {
              admin {
                policy: user.role == "admin"
                required: 1
              }
            }
            emit ApprovalRequested
          }
        }
        event ApprovalRequested: "approval.requested" { orderId: string }
      `);
      expect(
        result.diagnostics.some(
          (d) => d.severity === 'error' && d.message.includes('does not exist on entity'),
        ),
      ).toBe(true);
    });

    it('should emit error for duplicate stage names', async () => {
      const compiler = new IRCompiler();
      const result = await compiler.compileToIR(`
        entity Order {
          property required id: string
          command submit() { mutate result = true }
          approval orderApproval {
            command: submit
            stages {
              admin {
                policy: user.role == "admin"
                required: 1
              }
              admin {
                policy: user.role == "superadmin"
                required: 1
              }
            }
            emit ApprovalRequested
          }
        }
        event ApprovalRequested: "approval.requested" { orderId: string }
      `);
      expect(
        result.diagnostics.some(
          (d) => d.severity === 'error' && d.message.includes('Duplicate stage name'),
        ),
      ).toBe(true);
    });

    it('should emit error for approval with no stages', async () => {
      const compiler = new IRCompiler();
      const result = await compiler.compileToIR(`
        entity Order {
          property required id: string
          command submit() { mutate result = true }
          approval orderApproval {
            command: submit
            stages {
            }
            emit ApprovalRequested
          }
        }
        event ApprovalRequested: "approval.requested" { orderId: string }
      `);
      expect(
        result.diagnostics.some(
          (d) => d.severity === 'error' && d.message.includes('at least one stage'),
        ),
      ).toBe(true);
    });

    it('should not emit approvals field for entities without approvals', async () => {
      const ir = await compileToIR(`
        entity User {
          property required id: string
          property name: string
          command rename(newName: string) {
            mutate name = newName
          }
        }
      `);
      const entity = ir.entities.find((e) => e.name === 'User');
      expect(entity?.approvals).toBeUndefined();
    });
  });

  // ─── Runtime Tests ───────────────────────────────────────────────
  describe('Runtime', () => {
    let ir: IR;

    it('should block command when approval is required (low amount, manager only)', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-001',
      });

      // Create the instance first
      await runtime.createInstance('PurchaseOrder', {
        id: 'po-001',
        amount: 5000,
        status: 'draft',
      });

      // Running submit should be blocked
      const result = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-001',
        },
      );

      expect(result.success).toBe(false);
      expect(result.approvalRequired).toBeDefined();
      expect(result.approvalRequired!.approvalName).toBe('submitApproval');
      // amount=5000 < 10000 so director stage is skipped
      expect(result.approvalRequired!.pendingStages).toEqual(['manager']);
    });

    it('should block command with both stages for high amount', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-002',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-002',
        amount: 20000,
        status: 'draft',
      });

      const result = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-002',
        },
      );

      expect(result.success).toBe(false);
      expect(result.approvalRequired).toBeDefined();
      expect(result.approvalRequired!.pendingStages).toEqual(['manager', 'director']);
    });

    it('should allow command after all required stages are approved', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-003',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-003',
        amount: 5000,
        status: 'draft',
      });

      // First attempt - blocked
      const blocked = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-003',
        },
      );
      expect(blocked.success).toBe(false);
      expect(blocked.approvalRequired).toBeDefined();

      // Approve the manager stage
      const approvalState = await runtime.approveStage(
        'PurchaseOrder',
        'po-003',
        'submitApproval',
        'manager',
        'manager',
      );
      expect(approvalState.status).toBe('granted');

      // Retry - should succeed
      const result = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-003',
        },
      );
      expect(result.success).toBe(true);
    });

    it('should deny approval and block subsequent attempts', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-004',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-004',
        amount: 5000,
        status: 'draft',
      });

      // Trigger approval creation
      await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-004',
        },
      );

      // Deny the approval
      const denied = await runtime.denyApproval(
        'PurchaseOrder',
        'po-004',
        'submitApproval',
        'manager-user',
        'Budget exceeded',
      );
      expect(denied.status).toBe('denied');

      // Retry creates a NEW pending request (denied requests are reset)
      const retryResult = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-004',
        },
      );
      expect(retryResult.success).toBe(false);
      expect(retryResult.approvalRequired).toBeDefined();
    });

    it('should expire pending approvals past timeout', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      let currentTime = 1000000;
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => currentTime,
        generateId: () => 'po-005',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-005',
        amount: 5000,
        status: 'draft',
      });

      // Trigger approval creation
      await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-005',
        },
      );

      // Advance time past 72 hours
      currentTime = 1000000 + 73 * 3600000;
      const expired = await runtime.expireApprovals(currentTime);
      expect(expired).toHaveLength(1);
      expect(expired[0].status).toBe('expired');
    });

    it('should escalate with open author-defined target expression', async () => {
      const escalateSource = `
        entity PurchaseOrder {
          property required id: string
          property amount: number = 0
          property status: string = "draft"
          property escalationQueue: string = "director-queue"

          command submit() {
            mutate status = "submitted"
          }

          approval submitApproval {
            command: submit
            stages {
              manager {
                policy: user.role == "manager"
                required: 1
              }
            }
            timeout: 24
            on_timeout: escalate {
              to: self.escalationQueue
              status: pending
              timeout: 48
            }
            emit ApprovalRequested
          }
        }
        store PurchaseOrder in memory
        event ApprovalRequested: "approval.requested" { orderId: string }
      `;
      const escalateIr = await compileToIR(escalateSource);
      const approval = escalateIr.entities[0].approvals![0];
      expect(approval.onTimeout).toMatchObject({
        action: 'escalate',
        status: 'pending',
        timeout: 48,
      });

      let currentTime = 1000000;
      const runtime = new RuntimeEngine(
        escalateIr,
        { user: { id: 'user1', role: 'employee' } },
        { now: () => currentTime, generateId: () => 'po-esc' },
      );

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-esc',
        amount: 100,
        status: 'draft',
        escalationQueue: 'director-queue',
      });
      await runtime.runCommand('submit', {}, { entityName: 'PurchaseOrder', instanceId: 'po-esc' });

      currentTime = 1000000 + 25 * 3600000;
      const affected = await runtime.expireApprovals(currentTime);
      expect(affected).toHaveLength(1);
      expect(affected[0].status).toBe('pending');
      expect(affected[0].escalatedTo).toBe('director-queue');
      expect(affected[0].escalatedAt).toBe(currentTime);
      expect(affected[0].expiresAt).toBe(currentTime + 48 * 3600000);
    });

    it('should reject bare on_timeout escalate without block', async () => {
      const compiler = new IRCompiler();
      const result = await compiler.compileToIR(`
        entity Order {
          property required id: string
          command submit() { mutate result = true }
          approval orderApproval {
            command: submit
            stages {
              admin {
                policy: user.role == "admin"
                required: 1
              }
            }
            timeout: 1
            on_timeout: escalate
            emit ApprovalRequested
          }
        }
        event ApprovalRequested: "approval.requested" { orderId: string }
      `);
      expect(
        result.diagnostics.some((d) => d.code === 'APPROVAL_ONTIMEOUT_ESCALATE_INCOMPLETE'),
      ).toBe(true);
      expect(result.ir).toBeNull();
    });

    it('should throw when approving non-existent request', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const runtime = new RuntimeEngine(ir);

      await expect(
        runtime.approveStage('PurchaseOrder', 'nonexistent', 'submitApproval', 'manager', 'user1'),
      ).rejects.toThrow('No pending approval');
    });

    it('should throw when approver fails policy check', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-006',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-006',
        amount: 5000,
        status: 'draft',
      });

      // Trigger approval creation
      await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-006',
        },
      );

      // Try to approve with wrong role
      await expect(
        runtime.approveStage('PurchaseOrder', 'po-006', 'submitApproval', 'manager', 'employee'),
      ).rejects.toThrow('not authorized');
    });

    it('should not gate commands without approval declarations', async () => {
      // A command without an approval declaration should proceed normally
      const ir = await compileToIR(`
        entity Item {
          property required id: string
          property name: string = "untitled"
          command rename(newName: string) {
            mutate name = newName
          }
        }
        store Item in memory
      `);

      const runtime = new RuntimeEngine(
        ir,
        {},
        {
          generateId: () => 'item-001',
        },
      );

      await runtime.createInstance('Item', { id: 'item-001' });
      const result = await runtime.runCommand(
        'rename',
        { newName: 'Test' },
        {
          entityName: 'Item',
          instanceId: 'item-001',
        },
      );
      expect(result.success).toBe(true);
      expect(result.approvalRequired).toBeUndefined();
    });

    it('should retrieve approval request state', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-007',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-007',
        amount: 5000,
        status: 'draft',
      });

      // Before any approval attempt
      expect(
        runtime.getApprovalRequest('PurchaseOrder', 'po-007', 'submitApproval'),
      ).toBeUndefined();

      // Trigger approval
      await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-007',
        },
      );

      const state = runtime.getApprovalRequest('PurchaseOrder', 'po-007', 'submitApproval');
      expect(state).toBeDefined();
      expect(state!.status).toBe('pending');
      expect(state!.requiredStages).toEqual(['manager']);
    });

    it('should require both stages for high-amount then grant when both approved', async () => {
      ir = await compileToIR(APPROVAL_SOURCE);
      const context: RuntimeContext = { user: { id: 'user1', role: 'employee' } };
      const runtime = new RuntimeEngine(ir, context, {
        now: () => 1000000,
        generateId: () => 'po-008',
      });

      await runtime.createInstance('PurchaseOrder', {
        id: 'po-008',
        amount: 20000,
        status: 'draft',
      });

      // Trigger approval
      await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-008',
        },
      );

      // Approve manager stage
      let state = await runtime.approveStage(
        'PurchaseOrder',
        'po-008',
        'submitApproval',
        'manager',
        'manager',
      );
      expect(state.status).toBe('pending'); // Still pending - director required

      // Retry submit - should still be blocked
      const blocked = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-008',
        },
      );
      expect(blocked.success).toBe(false);
      expect(blocked.approvalRequired!.pendingStages).toEqual(['director']);

      // Approve director stage
      state = await runtime.approveStage(
        'PurchaseOrder',
        'po-008',
        'submitApproval',
        'director',
        'director',
      );
      expect(state.status).toBe('granted');

      // Retry submit - should succeed
      const result = await runtime.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-008',
        },
      );
      expect(result.success).toBe(true);
    });
  });

  // ─── BUG 3: durable approvalStore + real role/permission context ───────
  describe('Durable approvalStore + role context', () => {
    it('makes a request created by engine A approvable by a fresh engine B', async () => {
      const irA = await compileToIR(APPROVAL_SOURCE);
      const irB = await compileToIR(APPROVAL_SOURCE);

      // Shared durable backing store (stands in for Postgres/Redis in prod).
      const approvalStore = new MemoryApprovalStore();

      // Engine A — the request that blocks the command.
      const engineA = new RuntimeEngine(
        irA,
        { user: { id: 'u1', role: 'employee' } },
        {
          now: () => 1000000,
          generateId: () => 'po-dur',
          approvalStore,
        },
      );
      await engineA.createInstance('PurchaseOrder', {
        id: 'po-dur',
        amount: 5000,
        status: 'draft',
      });

      const blocked = await engineA.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-dur',
        },
      );
      expect(blocked.success).toBe(false);
      expect(blocked.approvalRequired!.pendingStages).toEqual(['manager']);

      // Engine B — freshly constructed (e.g. a new HTTP request), same store.
      // It must SEE engine A's pending request and be able to approve it.
      const engineB = new RuntimeEngine(
        irB,
        { user: { id: 'u2', role: 'employee' } },
        {
          now: () => 1000000,
          approvalStore,
        },
      );
      const granted = await engineB.approveStage(
        'PurchaseOrder',
        'po-dur',
        'submitApproval',
        'manager',
        { id: 'mgr-alice', role: 'manager' },
      );
      expect(granted.status).toBe('granted');

      // Engine A retries — the grant written by engine B is durable, so the
      // command now proceeds. (Without a shared store this is impossible.)
      const ok = await engineA.runCommand(
        'submit',
        {},
        {
          entityName: 'PurchaseOrder',
          instanceId: 'po-dur',
        },
      );
      expect(ok.success).toBe(true);
    });

    it('evaluates the stage policy against a real role distinct from the userId', async () => {
      const ir = await compileToIR(APPROVAL_SOURCE);
      const approvalStore = new MemoryApprovalStore();
      const runtime = new RuntimeEngine(
        ir,
        { user: { id: 'u1', role: 'employee' } },
        {
          now: () => 1000000,
          generateId: () => 'po-rbac',
          approvalStore,
        },
      );
      await runtime.createInstance('PurchaseOrder', {
        id: 'po-rbac',
        amount: 5000,
        status: 'draft',
      });
      await runtime.runCommand(
        'submit',
        {},
        { entityName: 'PurchaseOrder', instanceId: 'po-rbac' },
      );

      // Approver id 'alice' has NOTHING to do with the role; her role is the
      // gate. The old userId-doubles-as-role hack would reject this.
      const state = await runtime.approveStage(
        'PurchaseOrder',
        'po-rbac',
        'submitApproval',
        'manager',
        { id: 'alice', role: 'manager' },
      );
      expect(state.status).toBe('granted');
      expect(state.grants[0].by).toBe('alice');
    });

    it('rejects an approver whose real role fails the stage policy', async () => {
      const ir = await compileToIR(APPROVAL_SOURCE);
      const approvalStore = new MemoryApprovalStore();
      const runtime = new RuntimeEngine(
        ir,
        { user: { id: 'u1', role: 'employee' } },
        {
          now: () => 1000000,
          generateId: () => 'po-rbac2',
          approvalStore,
        },
      );
      await runtime.createInstance('PurchaseOrder', {
        id: 'po-rbac2',
        amount: 5000,
        status: 'draft',
      });
      await runtime.runCommand(
        'submit',
        {},
        { entityName: 'PurchaseOrder', instanceId: 'po-rbac2' },
      );

      await expect(
        runtime.approveStage('PurchaseOrder', 'po-rbac2', 'submitApproval', 'manager', {
          id: 'bob',
          role: 'employee',
        }),
      ).rejects.toThrow('not authorized');
    });
  });
});
