import { describe, it, expect } from 'vitest';
import { Parser } from './parser';
import type { BinaryOpNode, MemberAccessNode, CallNode, ConditionalNode, ArrayNode, ObjectNode } from './types';

describe('Parser', () => {
  describe('Program Structure', () => {
    it('should parse empty source', () => {
      const result = new Parser().parse('');
      expect(result.errors).toHaveLength(0);
      expect(result.program.entities).toHaveLength(0);
    });

    it('should parse whitespace-only source', () => {
      const result = new Parser().parse('   \n\n   \t  ');
      expect(result.errors).toHaveLength(0);
      expect(result.program.entities).toHaveLength(0);
    });

    it('should collect multiple errors without throwing', () => {
      const source = `
entity User {
  property name: string
}

entity Foo {
  property name
}

entity Bar {
  property name:string =
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Entity Parsing', () => {
    it('should parse empty entity', () => {
      const source = 'entity Empty {}';
      const result = new Parser().parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.program.entities).toHaveLength(1);
      const entity = result.program.entities[0];
      expect(entity.type).toBe('Entity');
      expect(entity.name).toBe('Empty');
      expect(entity.properties).toHaveLength(0);
    });

    it('should parse entity with properties', () => {
      const source = `
entity User {
  property name: string
  property age: number
  property active: boolean
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.name).toBe('User');
      expect(entity.properties).toHaveLength(3);
      expect(entity.properties[0].name).toBe('name');
      expect(entity.properties[1].name).toBe('age');
      expect(entity.properties[2].name).toBe('active');
    });

    it('should parse entity with required modifier', () => {
      const source = `
entity User {
  property required id: string
  property optional name: string
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.properties[0].modifiers).toContain('required');
      expect(entity.properties[1].modifiers).toContain('optional');
    });

    it('should parse entity with property defaults', () => {
      const source = `
entity User {
  property name: string = "Anonymous"
  property age: number = 0
  property active: boolean = true
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.properties[0].defaultValue).toEqual({ type: 'Literal', value: 'Anonymous', dataType: 'string' });
      expect(entity.properties[1].defaultValue).toEqual({ type: 'Literal', value: 0, dataType: 'number' });
      expect(entity.properties[2].defaultValue).toEqual({ type: 'Literal', value: true, dataType: 'boolean' });
    });

    it('should parse entity with computed property', () => {
      const source = `
entity User {
  property firstName: string
  property lastName: string
  computed fullName: string = self.firstName + " " + self.lastName
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.computedProperties).toHaveLength(1);
      expect(entity.computedProperties[0].name).toBe('fullName');
      // Dependencies only include non-reserved identifiers, self.* is not tracked
      expect(entity.computedProperties[0].dependencies).toEqual([]);
    });

    it('should parse entity with all relationship types', () => {
      const source = `
entity User {
  hasMany posts: Post
  hasOne profile: Profile
  belongsTo organization: Organization
  ref bestFriend: User
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.relationships).toHaveLength(4);
      expect(entity.relationships[0].kind).toBe('hasMany');
      expect(entity.relationships[1].kind).toBe('hasOne');
      expect(entity.relationships[2].kind).toBe('belongsTo');
      expect(entity.relationships[3].kind).toBe('ref');
    });

    it('should parse relationship with through clause', () => {
      const source = `
entity User {
  hasMany friends: User through UserFriend
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.relationships[0].through).toBe('UserFriend');
    });

    it('should parse relationship with foreignKey clause', () => {
      const source = `
entity Post {
  belongsTo author: User with userId
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.relationships[0].foreignKey).toBe('userId');
    });

    it('should parse entity with store declaration', () => {
      const source = `
entity User {
  store memory
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.store).toBe('memory');
    });

    it('should parse multiple entities', () => {
      const source = `
entity User {
  property name: string
}

entity Post {
  property title: string
}
`;
      const result = new Parser().parse(source);
      expect(result.program.entities).toHaveLength(2);
      expect(result.program.entities[0].name).toBe('User');
      expect(result.program.entities[1].name).toBe('Post');
    });
  });

  describe('Constraint Parsing', () => {
    it('should parse inline constraint', () => {
      const source = `
entity User {
  property age: number
  constraint adult: self.age >= 18 "Must be an adult"
}
`;
      const result = new Parser().parse(source);
      const entity = result.program.entities[0];
      expect(entity.constraints).toHaveLength(1);
      const constraint = entity.constraints[0];
      expect(constraint.name).toBe('adult');
      expect(constraint.message).toBe('Must be an adult');
      expect(constraint.severity).toBe('block'); // default
    });

    it('should parse constraint with ok severity', () => {
      const source = `
entity User {
  constraint info:ok self.id != null "Info message"
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      expect(constraint.severity).toBe('ok');
    });

    it('should parse constraint with warn severity', () => {
      const source = `
entity User {
  constraint warning:warn self.age < 13 "Warning message"
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      expect(constraint.severity).toBe('warn');
    });

    it('should parse constraint with block severity', () => {
      const source = `
entity User {
  constraint block:block self.age < 0 "Block message"
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      expect(constraint.severity).toBe('block');
    });

    it('should parse overrideable constraint', () => {
      const source = `
entity User {
  constraint overrideable maxAge:self.age <= 100 "Too old"
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      expect(constraint.overrideable).toBe(true);
    });
  });

  describe('Policy Parsing', () => {
    it('should parse read policy', () => {
      const source = `
entity User {
  policy canRead read: self.user == self.owner
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      expect(policy.name).toBe('canRead');
      expect(policy.action).toBe('read');
    });

    it('should parse write policy', () => {
      const source = `
entity User {
  policy canWrite write: self.user.role == "admin"
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      expect(policy.action).toBe('write');
    });

    it('should parse delete policy', () => {
      const source = `
entity User {
  policy canDelete delete: self.user.role == "admin"
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      expect(policy.action).toBe('delete');
    });

    it('should parse execute policy', () => {
      const source = `
entity User {
  policy canExecute execute: self.user.role == "user"
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      expect(policy.action).toBe('execute');
    });

    it('should parse all policy', () => {
      const source = `
entity User {
  policy allowAll all: true
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      expect(policy.action).toBe('all');
    });

    it('should parse override policy', () => {
      const source = `
entity User {
  policy overridePolicy override: self.user.role == "superadmin"
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      expect(policy.action).toBe('override');
    });
  });

  describe('Command Parsing', () => {
    it('should parse command without parameters', () => {
      const source = `
entity User {
  command greet() {
    mutate greeting = "Hello"
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.name).toBe('greet');
      expect(command.parameters).toHaveLength(0);
    });

    it('should parse command with parameters', () => {
      const source = `
entity User {
  command update(name: string, age: number) {
    mutate name = input.name
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.parameters).toHaveLength(2);
      expect(command.parameters[0].name).toBe('name');
      expect(command.parameters[1].name).toBe('age');
    });

    it('should parse command with optional parameter', () => {
      const source = `
entity User {
  command update(optional title: string) {
    mutate name = input.title
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.parameters[0].required).toBe(false);
    });

    it('should parse command with single guard', () => {
      const source = `
entity User {
  command delete() {
    guard self.user.role == "admin"
    mutate deleted = true
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.guards).toHaveLength(1);
    });

    it('should parse command with multiple guards', () => {
      const source = `
entity User {
  command delete() {
    guard self.user.role == "admin"
    when self.user.id != self.id
    mutate deleted = true
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.guards).toHaveLength(2);
    });

    it('should parse command with mutate action', () => {
      const source = `
entity User {
  command setAge(age: number) {
    mutate age = input.age
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.actions).toHaveLength(1);
      expect(command.actions[0].kind).toBe('mutate');
      expect(command.actions[0].target).toBe('age');
    });

    it('should parse command with emit action', () => {
      const source = `
entity User {
  command notify() {
    emit UserNotified
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.emits).toContain('UserNotified');
    });

    it('should parse command with return type', () => {
      const source = `
entity User {
  command getAge() returns number {
    compute result = self.age
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.returns?.name).toBe('number');
    });

    it('should parse command with constraint', () => {
      const source = `
entity User {
  command setAge(age: number) {
    constraint validAge:block input.age >= 0 && input.age <= 150
    mutate age = input.age
  }
}
`;
      const result = new Parser().parse(source);
      const command = result.program.entities[0].commands[0];
      expect(command.constraints).toHaveLength(1);
    });
  });

  describe('Expression Parsing - Literals', () => {
    it('should parse string literal', () => {
      const source = `
entity User {
  constraint test: self.name == "hello"
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const binOp = constraint.expression as BinaryOpNode;
      expect(binOp.right).toEqual({ type: 'Literal', value: 'hello', dataType: 'string' });
    });

    it('should parse number literal', () => {
      const source = `
entity User {
  constraint test: self.age == 42
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const binOp = constraint.expression as BinaryOpNode;
      expect(binOp.right).toEqual({ type: 'Literal', value: 42, dataType: 'number' });
    });

    it('should parse decimal number literal', () => {
      const source = `
entity User {
  constraint test: self.price == 19.99
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const binOp = constraint.expression as BinaryOpNode;
      expect(binOp.right).toEqual({ type: 'Literal', value: 19.99, dataType: 'number' });
    });

    it('should parse boolean true literal', () => {
      const source = `
entity User {
  property active: boolean = true
}
`;
      const result = new Parser().parse(source);
      const prop = result.program.entities[0].properties[0];
      expect(prop.defaultValue).toEqual({ type: 'Literal', value: true, dataType: 'boolean' });
    });

    it('should parse boolean false literal', () => {
      const source = `
entity User {
  property active: boolean = false
}
`;
      const result = new Parser().parse(source);
      const prop = result.program.entities[0].properties[0];
      expect(prop.defaultValue).toEqual({ type: 'Literal', value: false, dataType: 'boolean' });
    });

    it('should parse null literal', () => {
      const source = `
entity User {
  constraint test: self.name == null
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const binOp = constraint.expression as BinaryOpNode;
      expect(binOp.right).toEqual({ type: 'Literal', value: null, dataType: 'null' });
    });
  });

  describe('Expression Parsing - Identifiers', () => {
    it('should parse simple identifier', () => {
      const source = `
entity User {
  constraint test: age >= 18
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left).toEqual({ type: 'Identifier', name: 'age' });
    });

    it('should parse self member access', () => {
      const source = `
entity User {
  constraint test: self.age >= 18
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left.type).toBe('MemberAccess');
      expect((expr.left as MemberAccessNode).property).toBe('age');
    });

    it('should parse user member access', () => {
      const source = `
entity User {
  policy p read: user.role == "admin"
}
`;
      const result = new Parser().parse(source);
      const policy = result.program.entities[0].policies[0];
      const expr = policy.expression as BinaryOpNode;
      expect(expr.left.type).toBe('MemberAccess');
    });

    it('should parse context member access', () => {
      const source = `
entity User {
  constraint test: context.now > 0
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left.type).toBe('MemberAccess');
    });

    it('should parse nested member access', () => {
      const source = `
entity User {
  constraint test: self.profile.age >= 18
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left.type).toBe('MemberAccess');
      expect((expr.left as MemberAccessNode).object.type).toBe('MemberAccess');
    });
  });

  describe('Expression Parsing - Operators', () => {
    it('should parse arithmetic operators', () => {
      const source = `
entity User {
  computed test: number = self.a + self.b - self.c * self.d / self.e % self.f
}
`;
      const result = new Parser().parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse comparison operators', () => {
      const source = `
entity User {
  constraint test: self.a == self.b && self.c != self.d && self.e < self.f && self.g > self.h && self.i <= self.j && self.k >= self.l
}
`;
      const result = new Parser().parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse logical operators', () => {
      const source = `
entity User {
  constraint test: self.a && self.b || self.c
}
`;
      const result = new Parser().parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse keyword operators (is, in, contains)', () => {
      const source = `
entity User {
  constraint test: self.status is "active" && self.role in ["admin", "user"] && self.name contains "admin"
}
`;
      const result = new Parser().parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should respect operator precedence (multiplication before addition)', () => {
      const source = `
entity User {
  computed test: number = 1 + 2 * 3
}
`;
      const result = new Parser().parse(source);
      const computed = result.program.entities[0].computedProperties[0];
      const expr = computed.expression as BinaryOpNode;
      // Should be parsed as 1 + (2 * 3), not (1 + 2) * 3
      expect(expr.operator).toBe('+');
      expect((expr.right as BinaryOpNode).operator).toBe('*');
    });

    it('should respect operator precedence (AND before OR)', () => {
      const source = `
entity User {
  constraint test: self.a && self.b || self.c && self.d
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      // Should be parsed as (a && b) || (c && d)
      expect(expr.operator).toBe('||');
      expect(expr.left.type).toBe('BinaryOp');
      expect((expr.left as BinaryOpNode).operator).toBe('&&');
      expect(expr.right.type).toBe('BinaryOp');
      expect((expr.right as BinaryOpNode).operator).toBe('&&');
    });
  });

  describe('Expression Parsing - Function Calls', () => {
    it('should parse simple function call', () => {
      const source = `
entity User {
  constraint test: now() > 0
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left.type).toBe('Call');
    });

    it('should parse function call with arguments', () => {
      const source = `
entity User {
  constraint test: upper(self.name) == "ADMIN"
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left.type).toBe('Call');
      expect((expr.left as CallNode).arguments).toHaveLength(1);
    });

    it('should parse nested function calls', () => {
      const source = `
entity User {
  constraint test: outer(inner(self.value)) > 0
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.left.type).toBe('Call');
      expect((expr.left as CallNode).callee.type).toBe('Identifier');
      expect((expr.left as CallNode).arguments[0].type).toBe('Call');
    });
  });

  describe('Expression Parsing - Conditionals', () => {
    it('should parse simple ternary conditional', () => {
      const source = `
entity User {
  computed result: string = self.age >= 18 ? "adult" : "minor"
}
`;
      const result = new Parser().parse(source);
      const computed = result.program.entities[0].computedProperties[0];
      const expr = computed.expression as ConditionalNode;
      expect(expr.type).toBe('Conditional');
      expect(expr.consequent).toEqual({ type: 'Literal', value: 'adult', dataType: 'string' });
      expect(expr.alternate).toEqual({ type: 'Literal', value: 'minor', dataType: 'string' });
    });

    it('should parse nested ternary conditional', () => {
      const source = `
entity User {
  computed result: string = self.age >= 65 ? "senior" : (self.age >= 18 ? "adult" : "minor")
}
`;
      const result = new Parser().parse(source);
      const computed = result.program.entities[0].computedProperties[0];
      const expr = computed.expression as ConditionalNode;
      expect(expr.type).toBe('Conditional');
      expect(expr.alternate.type).toBe('Conditional');
    });

    it('should parse ternary without alternate', () => {
      const source = `
entity User {
  computed result: string = self.active ? "yes" : "no"
}
`;
      const result = new Parser().parse(source);
      const computed = result.program.entities[0].computedProperties[0];
      const expr = computed.expression as ConditionalNode;
      expect(expr.type).toBe('Conditional');
    });
  });

  describe('Expression Parsing - Arrays', () => {
    it('should parse empty array', () => {
      const source = `
entity User {
  constraint test: self.role in []
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.right.type).toBe('Array');
      expect((expr.right as ArrayNode).elements).toHaveLength(0);
    });

    it('should parse array with elements', () => {
      const source = `
entity User {
  constraint test: self.role in ["admin", "user", "guest"]
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.right.type).toBe('Array');
      expect((expr.right as ArrayNode).elements).toHaveLength(3);
    });

    it('should parse array with trailing comma', () => {
      const source = `
entity User {
  constraint test: self.role in ["admin", "user",]
}
`;
      const result = new Parser().parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse nested array', () => {
      const source = `
entity User {
  constraint test: self.matrix in [[1, 2], [3, 4]]
}
`;
      const result = new Parser().parse(source);
      const constraint = result.program.entities[0].constraints[0];
      const expr = constraint.expression as BinaryOpNode;
      expect(expr.right.type).toBe('Array');
      expect((expr.right as ArrayNode).elements[0].type).toBe('Array');
    });
  });

  describe('Expression Parsing - Objects', () => {
    it('should parse empty object', () => {
      const source = `
entity User {
  property config: object = {}
}
`;
      const result = new Parser().parse(source);
      const prop = result.program.entities[0].properties[0];
      const expr = prop.defaultValue as ObjectNode;
      expect(expr.type).toBe('Object');
      expect(expr.properties).toHaveLength(0);
    });

    it('should parse object with properties', () => {
      const source = `
entity User {
  property config: object = { name: "John", age: 30 }
}
`;
      const result = new Parser().parse(source);
      const prop = result.program.entities[0].properties[0];
      const expr = prop.defaultValue as ObjectNode;
      expect(expr.type).toBe('Object');
      expect(expr.properties).toHaveLength(2);
    });

    it('should parse nested object', () => {
      const source = `
entity User {
  property config: object = { user: { name: "John" } }
}
`;
      const result = new Parser().parse(source);
      const prop = result.program.entities[0].properties[0];
      const expr = prop.defaultValue as ObjectNode;
      expect(expr.type).toBe('Object');
      expect(expr.properties[0].value.type).toBe('Object');
    });
  });

  describe('Store Parsing', () => {
    it('should parse memory store', () => {
      const source = 'store User in memory';
      const result = new Parser().parse(source);
      expect(result.program.stores).toHaveLength(1);
      const store = result.program.stores[0];
      expect(store.type).toBe('Store');
      expect(store.entity).toBe('User');
      expect(store.target).toBe('memory');
    });

    it('should parse Postgres store', () => {
      const source = 'store User in postgres';
      const result = new Parser().parse(source);
      const store = result.program.stores[0];
      expect(store.target).toBe('postgres');
    });

    it('should parse store with config object', () => {
      const source = `
store User in memory {
  ttl: 3600
  maxSize: 1000
}
`;
      const result = new Parser().parse(source);
      const store = result.program.stores[0];
      expect(store.config).toBeDefined();
      expect(store.config?.ttl).toBeDefined();
      expect(store.config?.maxSize).toBeDefined();
    });
  });

  describe('Event Parsing', () => {
    it('should parse simple outbox event', () => {
      const source = `
event UserCreated: "user.created" {
  userId: string
  name: string
}
`;
      const result = new Parser().parse(source);
      expect(result.program.events).toHaveLength(1);
      const event = result.program.events[0];
      expect(event.type).toBe('OutboxEvent');
      expect(event.name).toBe('UserCreated');
      expect(event.channel).toBe('user.created');
    });

    it('should parse event with dot in name', () => {
      const source = `
event appCreated: "app.created" {
  appId: string
}
`;
      const result = new Parser().parse(source);
      expect(result.program.events).toHaveLength(1);
      expect(result.program.events[0].name).toBe('appCreated');
      expect(result.program.events[0].channel).toBe('app.created');
    });
  });

  describe('Module Parsing', () => {
    it('should parse module with entities', () => {
      const source = `
module Blog {
  entity Post {
    property title: string
  }

  entity Comment {
    property text: string
  }
}
`;
      const result = new Parser().parse(source);
      expect(result.program.modules).toHaveLength(1);
      const module = result.program.modules[0];
      expect(module.type).toBe('Module');
      expect(module.name).toBe('Blog');
      expect(module.entities).toHaveLength(2);
    });

    it('should parse module with commands', () => {
      const source = `
module Admin {
  command reset() {
    mutate status = "reset"
  }
}
`;
      const result = new Parser().parse(source);
      const module = result.program.modules[0];
      expect(module.commands).toHaveLength(1);
    });

    it('should parse module with policies', () => {
      const source = `
module Admin {
  policy adminOnly execute: user.role == "admin"
}
`;
      const result = new Parser().parse(source);
      const module = result.program.modules[0];
      expect(module.policies).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should report error for unclosed entity brace', () => {
      const source = `
entity User {
  property name: string
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('Expected }'))).toBe(true);
    });

    it('should report error for missing colon in property', () => {
      const source = `
entity User {
  property name string
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('Expected :'))).toBe(true);
    });

    it('should report error for incomplete expression', () => {
      const source = `
entity User {
  constraint test: self.age +
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error for invalid operator sequence', () => {
      const source = `
entity User {
  constraint test: self.age &&& self.active
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error for constraint block without expression', () => {
      const source = `
entity User {
  constraint test {
    message: "Test"
  }
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('expression'))).toBe(true);
    });

    it('should report error for reserved word as entity identifier', () => {
      const source = `
entity command {
  property name: string
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.some(e => e.message.includes('Reserved word') && e.message.includes('command'))).toBe(true);
    });

    it('should report error for malformed relationship', () => {
      const source = `
entity User {
  hasMany orders
}
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error for unclosed command block', () => {
      const source = `
entity User {
  command test() {
    mutate value = 1
`;
      const result = new Parser().parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
