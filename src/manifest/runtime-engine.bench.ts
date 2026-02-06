/**
 * Runtime Engine Performance Benchmarks
 *
 * Benchmarks for the Manifest runtime engine to measure evaluation
 * performance across different scenarios.
 */

import { describe, bench } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';

// Simple source - few constraints
const simpleSource = `
entity User {
  property required id: string = ""
  property required name: string = ""
  property required email: string = ""

  constraint idNotEmpty: self.id != "" "User ID cannot be empty"
  constraint nameNotEmpty: self.name != "" "Name cannot be empty"
  constraint emailValid: self.email contains "@" "Email must be valid"
}

store User in memory
`;

// Medium source - many constraints
const mediumSource = `
entity Order {
  property required id: string = ""
  property required customerId: string = ""
  property required amount: number = 0
  property required status: string = "pending"
  property createdAt: number = 0
  property updatedAt: number = 0
  property discount: number = 0
  property taxRate: number = 0.08
  property shippingAddress: string = ""
  property billingAddress: string = ""
  property notes: string = ""
  property priority: string = "normal"

  constraint idNotEmpty: self.id != "" "Order ID cannot be empty"
  constraint customerIdNotEmpty: self.customerId != "" "Customer ID cannot be empty"
  constraint amountPositive: self.amount > 0 "Order amount must be positive"
  constraint statusValid: self.status in ["pending", "processing", "shipped", "delivered", "cancelled"] "Invalid order status"
  constraint priorityValid: self.priority in ["low", "normal", "high", "urgent"] "Invalid priority level"
  constraint discountValid: self.discount >= 0 and self.discount <= self.amount "Discount cannot be negative or exceed order amount"
  constraint taxRateValid: self.taxRate >= 0 and self.taxRate <= 0.5 "Tax rate must be between 0% and 50%"
  constraint totalAmountValid: (self.amount - self.discount) * (1 + self.taxRate) > 0 "Total amount must be positive after discount and tax"
  constraint hasTimestamp: self.createdAt > 0 "Order must have creation timestamp"
  constraint updatedAtValid: self.updatedAt >= self.createdAt "Update timestamp cannot be before creation"
  constraint shippingRequired: self.status == "shipped" or self.status == "delivered" implies self.shippingAddress != "" "Shipping address required for shipped/delivered orders"
  constraint billingRequired: self.amount > 1000 implies self.billingAddress != "" "Billing address required for orders over $1000"
  constraint notesValid: self.notes == "" or self.notes.length > 5 "Notes must be empty or at least 5 characters"
}

store Order in memory
`;

// Complex source - many constraints, guards, actions, events
const complexSource = `
entity User {
  property required id: string = ""
  property required name: string = ""
  property required email: string = ""
  property optional role: string = "user"
  property optional status: string = "active"
  property createdAt: number = 0
  property updatedAt: number = 0

  constraint idNotEmpty: self.id != "" "User ID cannot be empty"
  constraint nameNotEmpty: self.name != "" "Name cannot be empty"
  constraint nameMinLength: self.name.length >= 2 "Name must be at least 2 characters"
  constraint nameMaxLength: self.name.length <= 100 "Name must not exceed 100 characters"
  constraint emailNotEmpty: self.email != "" "Email cannot be empty"
  constraint emailValid: self.email contains "@" "Email must contain @"
  constraint emailHasDomain: self.email contains "." "Email must have a domain"
  constraint roleValid: self.role in ["user", "admin", "moderator"] "Role must be valid"
  constraint statusValid: self.status in ["active", "inactive", "suspended"] "Status must be valid"
  constraint createdAtValid: self.createdAt > 0 "Creation time must be positive"
  constraint updatedAtValid: self.updatedAt >= self.createdAt "Update time must be after creation"

  command create(id: string, name: string, email: string) {
    guard id != ""
    guard name != ""
    guard name.length >= 2
    guard email != ""
    guard email contains "@"
    action create
    emit UserCreated(userId: id, userName: name, userEmail: email)
  }

  command updateProfile(name: string, email: string) {
    guard name != ""
    guard name.length >= 2
    guard name.length <= 100
    guard email != ""
    guard email contains "@"
    action update
    emit UserUpdated(userId: self.id, userName: name, userEmail: email)
  }

  command changeRole(newRole: string) {
    guard newRole in ["user", "admin", "moderator"]
    action update
    emit UserRoleChanged(userId: self.id, oldRole: self.role, newRole: newRole)
  }

  command deactivate() {
    guard self.status == "active"
    action update
    emit UserDeactivated(userId: self.id)
  }
}

store User in memory
`;

// Basic runtime context
const basicContext: RuntimeContext = {
  user: { id: 'admin-1', role: 'admin' },
  context: { timestamp: 1000000000000 },
  params: {},
};

describe('Runtime Engine Benchmarks', () => {
  describe('Constraint Evaluation', () => {
    bench('check 3 constraints (simple)', async () => {
      const result = await compileToIR(simpleSource);
      const ir = result.ir!;
      const engine = new RuntimeEngine(ir, basicContext);
      await engine.checkConstraints('User', { id: 'user-1', name: 'John Doe', email: 'john@example.com' });
    });

    bench('check 13 constraints (medium)', async () => {
      const result = await compileToIR(mediumSource);
      const ir = result.ir!;
      const engine = new RuntimeEngine(ir, basicContext);
      await engine.checkConstraints('Order', {
        id: 'order-1',
        customerId: 'customer-1',
        amount: 100,
        status: 'pending',
        createdAt: 1000000000000,
        updatedAt: 1000000000000,
        discount: 0,
        taxRate: 0.08,
        shippingAddress: '',
        billingAddress: '',
        notes: '',
        priority: 'normal',
      });
    });

    bench('check 11 constraints (complex)', async () => {
      const result = await compileToIR(complexSource);
      const ir = result.ir!;
      const engine = new RuntimeEngine(ir, basicContext);
      await engine.checkConstraints('User', {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
        status: 'active',
        createdAt: 1000000000000,
        updatedAt: 1000000000000,
      });
    });
  });

  describe('IR Initialization', () => {
    bench('initialize runtime with simple IR (1 entity)', async () => {
      const result = await compileToIR(simpleSource);
      new RuntimeEngine(result.ir!, basicContext);
    });

    bench('initialize runtime with medium IR (1 entity, 13 constraints)', async () => {
      const result = await compileToIR(mediumSource);
      new RuntimeEngine(result.ir!, basicContext);
    });

    bench('initialize runtime with complex IR (1 entity, 11 constraints, 4 commands)', async () => {
      const result = await compileToIR(complexSource);
      new RuntimeEngine(result.ir!, basicContext);
    });
  });

  describe('Full Pipeline', () => {
    bench('compile → initialize runtime (small source)', async () => {
      const result = await compileToIR(simpleSource);
      new RuntimeEngine(result.ir!, basicContext);
    });

    bench('compile → initialize runtime (medium source)', async () => {
      const result = await compileToIR(mediumSource);
      new RuntimeEngine(result.ir!, basicContext);
    });

    bench('compile → initialize runtime (complex source)', async () => {
      const result = await compileToIR(complexSource);
      new RuntimeEngine(result.ir!, basicContext);
    });
  });
});
