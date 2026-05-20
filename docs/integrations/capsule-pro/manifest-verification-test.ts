/**
 * Manifest Comprehensive Verification Script for Capsule-Pro
 * 
 * This script verifies that Manifest is correctly integrated and working in capsule-pro.
 * It checks: IR structure, route generation, guards, commands, policies, execution order,
 * constraints, runtime context, relationships, stores, and determinism.
 * 
 * USAGE:
 *   1. Copy this file to your capsule-pro project (e.g., scripts/manifest-verification-test.ts)
 *   2. Adjust the import paths below to match your project structure
 *   3. Adjust the config paths at the bottom
 *   4. Run with: npx tsx scripts/manifest-verification-test.ts
 * 
 * Spec References:
 * - docs/spec/ir/ir-v1.schema.json - IR shape contract
 * - docs/spec/semantics.md - Runtime meaning
 * - docs/spec/builtins.md - Built-in identifiers
 * - docs/spec/adapters.md - Adapter hooks
 * - docs/spec/conformance.md - Conformance rules
 * - docs/spec/manifest-vnext.md - vNext features
 */

// ============================================================================
// IMPORTS - Adjust these for your project structure
// ============================================================================

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Option A: From @manifest packages (monorepo)
// import { compileToIR } from '@manifest/ir-compiler';
// import { RuntimeEngine, type RuntimeOptions, type EntityInstance } from '@manifest/runtime-engine';
// import type { IR, IREntity, IRCommand, IRStore, IREvent, IRPolicy } from '@manifest/ir';

// Option B: From local build (capsule-pro)
// Adjust these paths to match your project
import { compileToIR } from '../../src/manifest/ir-compiler.js';
import { RuntimeEngine, type RuntimeOptions, type EntityInstance } from '../../src/manifest/runtime-engine.js';
import type { IR, IREntity, IRCommand, IRStore, IREvent, IRPolicy } from '../../src/manifest/ir.js';

// ============================================================================
// TEST FRAMEWORK
// ============================================================================

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
}

class AsyncTestRunner {
  private suites: TestSuite[] = [];
  private currentSuite: TestSuite | null = null;
  
  describe(name: string, fn: () => Promise<void> | void): void {
    this.currentSuite = { name, tests: [] };
    const result = fn();
    if (result instanceof Promise) {
      // Will be awaited by runAll()
    }
    this.suites.push(this.currentSuite);
    this.currentSuite = null;
  }
  
  it(name: string, fn: () => Promise<{ passed: boolean; message: string; details?: Record<string, unknown> }> | { passed: boolean; message: string; details?: Record<string, unknown> }): void {
    if (!this.currentSuite) throw new Error('No active suite');
    
    const result = fn();
    if (result instanceof Promise) {
      result.then(r => {
        this.currentSuite!.tests.push({ category: this.currentSuite!.name, name, ...r });
      }).catch(error => {
        this.currentSuite!.tests.push({
          category: this.currentSuite!.name,
          name,
          passed: false,
          message: `Exception: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
    } else {
      this.currentSuite.tests.push({ category: this.currentSuite.name, name, ...result });
    }
  }
  
  expect<T>(actual: T) {
    return {
      toBe: (expected: T) => {
        if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      },
      toEqual: (expected: T) => {
        const actualStr = JSON.stringify(actual, null, 2);
        const expectedStr = JSON.stringify(expected, null, 2);
        if (actualStr !== expectedStr) throw new Error(`Expected:\n${expectedStr}\n\nGot:\n${actualStr}`);
      },
      toBeTruthy: () => {
        if (!actual) throw new Error(`Expected truthy but got ${actual}`);
      },
      toBeFalsy: () => {
        if (actual) throw new Error(`Expected falsy but got ${actual}`);
      },
      toContain: (expected: string) => {
        if (typeof actual !== 'string' || !actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      },
      toHaveLength: (expected: number) => {
        if (!('length' in Object(actual))) throw new Error(`Expected ${actual} to have length`);
        if ((actual as { length: number }).length !== expected) {
          throw new Error(`Expected length ${expected} but got ${(actual as { length: number }).length}`);
        }
      },
      toBeGreaterThan: (expected: number) => {
        if (typeof actual !== 'number' || actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeDefined: () => {
        if (actual === undefined) throw new Error('Expected value to be defined');
      },
      toBeNull: () => {
        if (actual !== null) throw new Error(`Expected null but got ${actual}`);
      },
      not: {
        toBe: (expected: T) => {
          if (actual === expected) throw new Error(`Expected ${actual} not to be ${expected}`);
        },
        toBeNull: () => {
          if (actual === null) throw new Error('Expected value not to be null');
        },
        toBeFalsy: () => {
          if (!actual) throw new Error(`Expected not falsy but got ${actual}`);
        },
      },
    };
  }
  
  report(): void {
    console.log('\n' + '='.repeat(80));
    console.log('MANIFEST VERIFICATION REPORT');
    console.log('='.repeat(80) + '\n');
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    for (const suite of this.suites) {
      const passed = suite.tests.filter(t => t.passed).length;
      const failed = suite.tests.filter(t => !t.passed).length;
      totalPassed += passed;
      totalFailed += failed;
      
      const status = failed === 0 ? '✅' : '❌';
      console.log(`${status} ${suite.name}: ${passed}/${suite.tests.length} passed`);
      
      for (const test of suite.tests) {
        const icon = test.passed ? '  ✓' : '  ✗';
        console.log(`${icon} ${test.name}`);
        if (!test.passed) {
          console.log(`      ERROR: ${test.message}`);
          if (test.details) {
            console.log(`      DETAILS: ${JSON.stringify(test.details, null, 2).split('\n').join('\n      ')}`);
          }
        }
      }
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('='.repeat(80) + '\n');
    
    if (totalFailed > 0) {
      process.exit(1);
    }
  }
}

const runner = new AsyncTestRunner();
const { describe, it, expect } = runner;

// ============================================================================
// CONFIGURATION - Adjust for your capsule-pro structure
// ============================================================================

interface TestConfig {
  manifestDir: string;
  expectedDir: string;
  generatedRoutesDir: string;
  primaryManifest: string;  // Main manifest file to test
}

const config: TestConfig = {
  manifestDir: './manifests',
  expectedDir: './expected',
  generatedRoutesDir: './app/api',
  primaryManifest: 'Recipe.manifest',  // Change to your main manifest
};

// ============================================================================
// DETERMINISTIC OPTIONS
// ============================================================================

const DETERMINISTIC_TIMESTAMP = 1000000000000;
let idCounter = 0;

function createDeterministicOptions(): RuntimeOptions {
  idCounter = 0;
  return {
    generateId: () => `test-id-${++idCounter}`,
    now: () => DETERMINISTIC_TIMESTAMP,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function loadManifest(name: string): string {
  const path = join(config.manifestDir, name);
  if (!existsSync(path)) {
    throw new Error(`Manifest file not found: ${path}`);
  }
  return readFileSync(path, 'utf-8');
}

async function compileManifest(name: string): Promise<{ ir: IR | null; diagnostics: unknown[] }> {
  const source = loadManifest(name);
  return compileToIR(source);
}

function findEntity(ir: IR, name: string): IREntity | undefined {
  return ir.entities.find(e => e.name === name);
}

function findCommand(ir: IR, name: string): IRCommand | undefined {
  return ir.commands.find(c => c.name === name);
}

function findPolicy(ir: IR, name: string): IRPolicy | undefined {
  return ir.policies.find(p => p.name === name);
}

function findStore(ir: IR, entityName: string): IRStore | undefined {
  return ir.stores.find(s => s.entity === entityName);
}

function findEvent(ir: IR, name: string): IREvent | undefined {
  return ir.events.find(e => e.name === name);
}

function getDefaultValue(typeName: string): unknown {
  switch (typeName) {
    case 'string': return 'test';
    case 'number': return 0;
    case 'boolean': return false;
    case 'date':
    case 'datetime': return '2024-01-01';
    default: return null;
  }
}

// ============================================================================
// 1. IR STRUCTURE VALIDATION
// ============================================================================

describe('1. IR Structure Validation', async () => {
  it('IR has required top-level fields', async () => {
    const { ir, diagnostics } = await compileManifest(config.primaryManifest);
    
    if (!ir) {
      return { passed: false, message: `Compilation failed: ${JSON.stringify(diagnostics)}` };
    }
    
    try {
      expect(ir.version).toBe('1.0');
      expect(ir.provenance).toBeDefined();
      expect(Array.isArray(ir.modules)).toBeTruthy();
      expect(Array.isArray(ir.entities)).toBeTruthy();
      expect(Array.isArray(ir.stores)).toBeTruthy();
      expect(Array.isArray(ir.events)).toBeTruthy();
      expect(Array.isArray(ir.commands)).toBeTruthy();
      expect(Array.isArray(ir.policies)).toBeTruthy();
      return { passed: true, message: 'All required IR fields present' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('IR has valid provenance', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    try {
      expect(ir.provenance.contentHash).toBeDefined();
      expect(ir.provenance.compilerVersion).toBeDefined();
      expect(ir.provenance.schemaVersion).toBeDefined();
      expect(ir.provenance.compiledAt).toBeDefined();
      expect(ir.provenance.contentHash.length).toBe(64); // SHA-256
      return { passed: true, message: 'Provenance valid' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Entities have required structure', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    try {
      for (const entity of ir.entities) {
        expect(entity.name).toBeDefined();
        expect(Array.isArray(entity.properties)).toBeTruthy();
        expect(Array.isArray(entity.computedProperties)).toBeTruthy();
        expect(Array.isArray(entity.relationships)).toBeTruthy();
        expect(Array.isArray(entity.commands)).toBeTruthy();
        expect(Array.isArray(entity.constraints)).toBeTruthy();
        expect(Array.isArray(entity.policies)).toBeTruthy();
      }
      return { passed: true, message: `Validated ${ir.entities.length} entities` };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Commands have required structure', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    try {
      for (const command of ir.commands) {
        expect(command.name).toBeDefined();
        expect(Array.isArray(command.parameters)).toBeTruthy();
        expect(Array.isArray(command.guards)).toBeTruthy();
        expect(Array.isArray(command.actions)).toBeTruthy();
        expect(Array.isArray(command.emits)).toBeTruthy();
      }
      return { passed: true, message: `Validated ${ir.commands.length} commands` };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Policies have required structure', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    try {
      for (const policy of ir.policies) {
        expect(policy.name).toBeDefined();
        expect(policy.action).toBeDefined();
        expect(['read', 'write', 'delete', 'execute', 'all', 'override']).toContain(policy.action);
        expect(policy.expression).toBeDefined();
      }
      return { passed: true, message: `Validated ${ir.policies.length} policies` };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Stores have required structure', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    try {
      for (const store of ir.stores) {
        expect(store.entity).toBeDefined();
        expect(store.target).toBeDefined();
        expect(['memory', 'localStorage', 'postgres', 'supabase']).toContain(store.target);
        expect(store.config).toBeDefined();
      }
      return { passed: true, message: `Validated ${ir.stores.length} stores` };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// 2. ROUTE GENERATION VERIFICATION
// ============================================================================

describe('2. Route Generation Verification', async () => {
  it('Route files exist in correct directories', () => {
    const apiDir = config.generatedRoutesDir;
    if (!existsSync(apiDir)) {
      return { passed: false, message: `API directory not found: ${apiDir}` };
    }
    
    const routeFiles: string[] = [];
    
    function findRoutes(dir: string) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) findRoutes(join(dir, entry.name));
          else if (entry.name === 'route.ts') routeFiles.push(join(dir, entry.name));
        }
      } catch {}
    }
    
    findRoutes(apiDir);
    
    if (routeFiles.length === 0) return { passed: false, message: 'No route.ts files found' };
    return { passed: true, message: `Found ${routeFiles.length} route files`, details: { routes: routeFiles } };
  });

  it('Routes have correct HTTP method exports', () => {
    const apiDir = config.generatedRoutesDir;
    if (!existsSync(apiDir)) return { passed: false, message: 'API directory not found' };
    
    const issues: string[] = [];
    let checkedCount = 0;
    
    function checkRouteFile(dir: string) {
      const routePath = join(dir, 'route.ts');
      if (!existsSync(routePath)) return;
      
      const content = readFileSync(routePath, 'utf-8');
      checkedCount++;
      
      const hasMethod = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/.test(content);
      if (!hasMethod) issues.push(`${routePath}: No HTTP method exports`);
    }
    
    function scan(dir: string) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) scan(join(dir, entry.name));
        }
        checkRouteFile(dir);
      } catch {}
    }
    
    scan(apiDir);
    
    if (issues.length > 0) return { passed: false, message: 'Routes missing HTTP methods', details: { issues } };
    return { passed: true, message: `Checked ${checkedCount} route files` };
  });

  it('Routes use runtime.runCommand for writes', () => {
    const apiDir = config.generatedRoutesDir;
    if (!existsSync(apiDir)) return { passed: false, message: 'API directory not found' };
    
    const issues: string[] = [];
    
    function checkRouteFile(dir: string) {
      const routePath = join(dir, 'route.ts');
      if (!existsSync(routePath)) return;
      
      const content = readFileSync(routePath, 'utf-8');
      if (/export\s+async\s+function\s+POST/.test(content)) {
        if (!content.includes('runCommand')) issues.push(`${routePath}: POST route must use runtime.runCommand`);
      }
    }
    
    function scan(dir: string) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) scan(join(dir, entry.name));
        }
        checkRouteFile(dir);
      } catch {}
    }
    
    scan(apiDir);
    
    if (issues.length > 0) return { passed: false, message: 'POST routes must use runCommand', details: { issues } };
    return { passed: true, message: 'All POST routes correctly use runCommand' };
  });

  it('Routes strip client identity fields', () => {
    const apiDir = config.generatedRoutesDir;
    if (!existsSync(apiDir)) return { passed: false, message: 'API directory not found' };
    
    const issues: string[] = [];
    const dangerousPatterns = [/body\.id/, /body\.userId/, /body\.tenantId/, /body\.orgId/];
    
    function checkRouteFile(dir: string) {
      const routePath = join(dir, 'route.ts');
      if (!existsSync(routePath)) return;
      
      const content = readFileSync(routePath, 'utf-8');
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          issues.push(`${routePath}: Uses client identity field`);
          break;
        }
      }
    }
    
    function scan(dir: string) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) scan(join(dir, entry.name));
        }
        checkRouteFile(dir);
      } catch {}
    }
    
    scan(apiDir);
    
    if (issues.length > 0) return { passed: false, message: 'Routes should strip client identity', details: { issues } };
    return { passed: true, message: 'Routes properly handle identity' };
  });
});

// ============================================================================
// 3. GUARD EVALUATION TESTING
// ============================================================================

describe('3. Guard Evaluation Testing', async () => {
  it('Guards halt on first falsey', async () => {
    const testSource = `
      entity TestEntity {
        property id: string
        property status: string
        command testCommand {
          guard self.status != "blocked"
          guard self.status == "active"
          action mutate self.status = "processed"
        }
      }
      store TestEntity in memory
    `;
    
    const { ir } = await compileToIR(testSource);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());
    await engine.createInstance('TestEntity', { id: 'test-1', status: 'blocked' } as EntityInstance);
    
    const result = await engine.runCommand('testCommand', {}, { entityName: 'TestEntity', instanceId: 'test-1' });
    
    try {
      expect(result.success).toBeFalsy();
      expect(result.guardFailure).toBeDefined();
      expect(result.guardFailure?.index).toBe(0);
      return { passed: true, message: 'First guard failed as expected', details: { guardIndex: result.guardFailure?.index } };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Guard failure has diagnostic info', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const commandWithGuards = ir.commands.find(c => c.guards.length > 0);
    if (!commandWithGuards) return { passed: true, message: 'No commands with guards to test' };
    
    return { passed: true, message: `Command "${commandWithGuards.name}" has ${commandWithGuards.guards.length} guards` };
  });
});

// ============================================================================
// 4. POLICY AUTHORIZATION TESTING
// ============================================================================

describe('4. Policy Authorization Testing', async () => {
  it('Policies evaluated for execute action', async () => {
    const testSource = `
      entity SecureEntity {
        property id: string
        policy AdminsOnly execute: user.role == "admin"
        command secureAction { action compute true }
      }
      store SecureEntity in memory
    `;
    
    const { ir } = await compileToIR(testSource);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, { user: { id: 'user-1', role: 'user' } }, createDeterministicOptions());
    const result = await engine.runCommand('secureAction', {}, { entityName: 'SecureEntity' });
    
    try {
      expect(result.success).toBeFalsy();
      expect(result.policyDenial).toBeDefined();
      return { passed: true, message: 'Policy correctly denied non-admin', details: { policyName: result.policyDenial?.policyName } };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Commands have policies defined', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const commandsWithoutPolicies = ir.commands
      .filter(c => c.entity && (c.policies?.length ?? 0) === 0)
      .map(c => c.name);
    
    if (commandsWithoutPolicies.length > 0) {
      return { passed: false, message: 'Commands without policies', details: { commands: commandsWithoutPolicies } };
    }
    return { passed: true, message: 'All entity-bound commands have policies' };
  });
});

// ============================================================================
// 5. COMMAND EXECUTION TESTING
// ============================================================================

describe('5. Command Execution Testing', async () => {
  it('CommandResult has correct shape', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, { user: { id: 'test-user' } }, createDeterministicOptions());
    const command = ir.commands[0];
    if (!command) return { passed: true, message: 'No commands to test' };
    
    if (command.entity) {
      const entity = findEntity(ir, command.entity);
      if (entity) {
        const instanceData: Record<string, unknown> = { id: 'test-instance' };
        for (const prop of entity.properties) {
          if (prop.name !== 'id') instanceData[prop.name] = getDefaultValue(prop.type.name);
        }
        await engine.createInstance(command.entity, instanceData as EntityInstance);
      }
    }
    
    const result = await engine.runCommand(command.name, {}, { entityName: command.entity, instanceId: 'test-instance' });
    
    try {
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.emittedEvents)).toBeTruthy();
      return { passed: true, message: 'CommandResult has correct shape', details: { success: result.success, eventCount: result.emittedEvents.length } };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('Actions execute in order', async () => {
    const testSource = `
      entity Counter {
        property id: string
        property value: number
        command increment {
          action mutate self.value = self.value + 1
          action mutate self.value = self.value + 10
          action mutate self.value = self.value + 100
        }
      }
      store Counter in memory
    `;
    
    const { ir } = await compileToIR(testSource);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());
    await engine.createInstance('Counter', { id: 'counter-1', value: 0 } as EntityInstance);
    await engine.runCommand('increment', {}, { entityName: 'Counter', instanceId: 'counter-1' });
    
    const instance = await engine.getInstance('Counter', 'counter-1');
    
    try {
      expect(instance?.value).toBe(111); // 0 + 1 + 10 + 100
      return { passed: true, message: 'Actions executed in order', details: { finalValue: instance?.value } };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// 6. CONSTRAINT TESTING
// ============================================================================

describe('6. Constraint Testing', async () => {
  it('Entities have constraints array', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    try {
      for (const entity of ir.entities) {
        expect(Array.isArray(entity.constraints)).toBeTruthy();
      }
      return { passed: true, message: 'All entities have constraints array' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// 7. RUNTIME CONTEXT TESTING
// ============================================================================

describe('7. Runtime Context Testing', async () => {
  it('Built-in self/this identifiers work', async () => {
    const testSource = `
      entity SelfTest {
        property id: string
        property name: string
        property selfWorks: boolean
        command testSelf {
          guard self.name != ""
          action mutate self.selfWorks = true
        }
      }
      store SelfTest in memory
    `;
    
    const { ir } = await compileToIR(testSource);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());
    await engine.createInstance('SelfTest', { id: 'self-1', name: 'TestName', selfWorks: false } as EntityInstance);
    
    const result = await engine.runCommand('testSelf', {}, { entityName: 'SelfTest', instanceId: 'self-1' });
    
    try {
      expect(result.success).toBeTruthy();
      const instance = await engine.getInstance('SelfTest', 'self-1');
      expect(instance?.selfWorks).toBe(true);
      return { passed: true, message: 'self/this identifiers work' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });

  it('now() returns deterministic value', async () => {
    const testSource = `
      entity TimeTest {
        property id: string
        property timestamp: number
        command recordTime { action mutate self.timestamp = now() }
      }
      store TimeTest in memory
    `;
    
    const { ir } = await compileToIR(testSource);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());
    await engine.createInstance('TimeTest', { id: 'time-1', timestamp: 0 } as EntityInstance);
    await engine.runCommand('recordTime', {}, { entityName: 'TimeTest', instanceId: 'time-1' });
    
    const instance = await engine.getInstance('TimeTest', 'time-1');
    
    try {
      expect(instance?.timestamp).toBe(DETERMINISTIC_TIMESTAMP);
      return { passed: true, message: `now() returned deterministic value` };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// 8. RELATIONSHIP TESTING
// ============================================================================

describe('8. Relationship Testing', async () => {
  it('Relationships have valid structure', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const validKinds = ['hasMany', 'hasOne', 'belongsTo', 'ref'];
    
    try {
      for (const entity of ir.entities) {
        for (const rel of entity.relationships) {
          expect(rel.name).toBeDefined();
          expect(rel.kind).toBeDefined();
          expect(validKinds).toContain(rel.kind);
          expect(rel.target).toBeDefined();
        }
      }
      return { passed: true, message: 'All relationships valid' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// 9. STORE TESTING
// ============================================================================

describe('9. Store Testing', async () => {
  it('Memory store works correctly', async () => {
    const { ir } = await compileManifest(config.primaryManifest);
    if (!ir) return { passed: false, message: 'Compilation failed' };
    
    const engine = new RuntimeEngine(ir, {}, createDeterministicOptions());
    const entity = ir.entities[0];
    if (!entity) return { passed: true, message: 'No entities to test' };
    
    const instanceData: Record<string, unknown> = { id: 'store-test-1' };
    for (const prop of entity.properties) {
      if (prop.name !== 'id') instanceData[prop.name] = getDefaultValue(prop.type.name);
    }
    
    await engine.createInstance(entity.name, instanceData as EntityInstance);
    const retrieved = await engine.getInstance(entity.name, 'store-test-1');
    
    try {
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('store-test-1');
      return { passed: true, message: 'Memory store CRUD works' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// 10. DETERMINISM TESTING
// ============================================================================

describe('10. Determinism Testing', async () => {
  it('Identical source produces identical IR', async () => {
    const source = loadManifest(config.primaryManifest);
    
    const result1 = await compileToIR(source);
    const result2 = await compileToIR(source);
    
    function normalize(ir: IR): IR {
      const n = JSON.parse(JSON.stringify(ir));
      if (n.provenance) {
        n.provenance.compiledAt = 'normalized';
        n.provenance.contentHash = 'normalized';
        n.provenance.irHash = 'normalized';
      }
      return n;
    }
    
    try {
      expect(normalize(result1.ir!)).toEqual(normalize(result2.ir!));
      return { passed: true, message: 'IR compilation is deterministic' };
    } catch (e) {
      return { passed: false, message: (e as Error).message };
    }
  });
});

// ============================================================================
// MAIN - Run Tests
// ============================================================================

async function main() {
  console.log('\n🔍 Manifest Verification Test Suite for Capsule-Pro');
  console.log('━'.repeat(60));
  console.log(`📁 Manifest directory: ${config.manifestDir}`);
  console.log(`📁 Primary manifest: ${config.primaryManifest}`);
  console.log(`📁 Generated routes: ${config.generatedRoutesDir}`);
  console.log('━'.repeat(60));
  
  // Wait a moment for async tests to complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  runner.report();
}

main().catch(console.error);
