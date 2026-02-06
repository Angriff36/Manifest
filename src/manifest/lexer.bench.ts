/**
 * Lexer Performance Benchmarks
 *
 * Benchmarks for the Manifest lexer to measure tokenization performance
 * across different input sizes and complexity.
 */

import { describe, bench } from 'vitest';
import { Lexer } from './lexer';

// Small source (~100 tokens)
const smallSource = `
entity User {
  property required id: string = ""
  property required name: string = ""
  property required email: string = ""

  constraint idNotEmpty: self.id != "" "User ID cannot be empty"
  constraint nameNotEmpty: self.name != "" "Name cannot be empty"
  constraint emailValid: self.email contains "@" "Email must be valid"

  command create(id: string, name: string, email: string) {
    guard id != "" and name != "" and email != ""
    action create
    emit UserCreated(userId: id, userName: name)
  }
}
`;

// Medium source (~500 tokens)
const mediumSource = `
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
`;

// Large source (~2000 tokens) - multiple entities
const largeSource = `
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
  constraint emailNotEmpty: self.email != "" "Email cannot be empty"
  constraint emailValid: self.email contains "@" "Email must be valid"
  constraint roleValid: self.role in ["user", "admin", "moderator"] "Role must be valid"

  command create(id: string, name: string, email: string) {
    guard id != "" and name != "" and email != ""
    action create
    emit UserCreated(userId: id, userName: name)
  }
}

entity Order {
  property required id: string = ""
  property required customerId: string = ""
  property required amount: number = 0
  property optional status: string = "pending"
  property createdAt: number = 0
  property updatedAt: number = 0
  property discount: number = 0
  property taxRate: number = 0.08

  constraint idNotEmpty: self.id != "" "Order ID cannot be empty"
  constraint customerIdNotEmpty: self.customerId != "" "Customer ID required"
  constraint amountPositive: self.amount > 0 "Amount must be positive"
  constraint statusValid: self.status in ["pending", "processing", "shipped", "delivered", "cancelled"] "Invalid status"
  constraint discountValid: self.discount >= 0 and self.discount <= self.amount "Invalid discount"
  constraint taxRateValid: self.taxRate >= 0 and self.taxRate <= 0.5 "Invalid tax rate"

  command create(id: string, customerId: string, amount: number) {
    guard id != "" and customerId != "" and amount > 0
    action create
    emit OrderCreated(orderId: id, customerId: customerId, amount: amount)
  }

  command updateStatus(newStatus: string) {
    guard newStatus in ["pending", "processing", "shipped", "delivered", "cancelled"]
    action update
    emit OrderStatusUpdated(orderId: self.id, oldStatus: self.status, newStatus: newStatus)
  }
}

entity Product {
  property required id: string = ""
  property required name: string = ""
  property optional description: string = ""
  property required price: number = 0
  property optional category: string = ""
  property optional inStock: boolean = true
  property createdAt: number = 0

  constraint idNotEmpty: self.id != "" "Product ID required"
  constraint nameNotEmpty: self.name != "" "Name required"
  constraint nameMinLength: self.name.length >= 3 "Name too short"
  constraint pricePositive: self.price > 0 "Price must be positive"
  constraint priceReasonable: self.price < 1000000 "Price seems too high"

  command create(id: string, name: string, price: number) {
    guard id != "" and name != "" and name.length >= 3 and price > 0
    action create
    emit ProductCreated(productId: id, productName: name, price: price)
  }

  command updatePrice(newPrice: number) {
    guard newPrice > 0 and newPrice < 1000000
    action update
    emit ProductPriceUpdated(productId: self.id, oldPrice: self.price, newPrice: newPrice)
  }
}

entity Invoice {
  property required id: string = ""
  property required orderId: string = ""
  property required customerId: string = ""
  property required totalAmount: number = 0
  property optional status: string = "draft"
  property issuedAt: number = 0
  property dueDate: number = 0
  property paidAt: number = 0

  constraint idNotEmpty: self.id != "" "Invoice ID required"
  constraint totalAmountPositive: self.totalAmount > 0 "Total must be positive"
  constraint statusValid: self.status in ["draft", "issued", "paid", "overdue", "cancelled"] "Invalid status"

  command create(id: string, orderId: string, customerId: string, totalAmount: number) {
    guard id != "" and orderId != "" and customerId != "" and totalAmount > 0
    action create
    emit InvoiceCreated(invoiceId: id, orderId: orderId, totalAmount: totalAmount)
  }

  command markAsIssued(dueDate: number) {
    guard self.status == "draft" and dueDate > 0
    action update
    emit InvoiceIssued(invoiceId: self.id, dueDate: dueDate)
  }
}

entity Shipment {
  property required id: string = ""
  property required orderId: string = ""
  property optional carrier: string = ""
  property optional trackingNumber: string = ""
  property optional status: string = "preparing"
  property shippedAt: number = 0
  property deliveredAt: number = 0

  constraint idNotEmpty: self.id != "" "Shipment ID required"
  constraint orderIdNotEmpty: self.orderId != "" "Order ID required"
  constraint statusValid: self.status in ["preparing", "shipped", "in-transit", "delivered", "failed"] "Invalid status"

  command create(id: string, orderId: string, carrier: string) {
    guard id != "" and orderId != "" and carrier != ""
    action create
    emit ShipmentCreated(shipmentId: id, orderId: orderId, carrier: carrier)
  }

  command markAsShipped(trackingNumber: string) {
    guard trackingNumber != "" and self.status == "preparing"
    action update
    emit ShipmentShipped(shipmentId: self.id, trackingNumber: trackingNumber)
  }
}
`;

describe('Lexer Benchmarks', () => {
  bench('tokenize small source (~100 tokens)', () => {
    const lexer = new Lexer(smallSource);
    lexer.tokenize();
  });

  bench('tokenize medium source (~500 tokens)', () => {
    const lexer = new Lexer(mediumSource);
    lexer.tokenize();
  });

  bench('tokenize large source (~2000 tokens)', () => {
    const lexer = new Lexer(largeSource);
    lexer.tokenize();
  });
});
