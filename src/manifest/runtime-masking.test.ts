/**
 * Runtime property masking (docs/spec/semantics.md, "Property Masking").
 *
 * Masking is a read-projection transform applied in getInstance/getAllInstances
 * after decryption and tenant filtering:
 * - every strategy transforms the plaintext value
 * - unmaskWhen truthy ⇒ real value; falsy / no user / error ⇒ masked
 * - an unmaskWhen evaluation error also surfaces a console.warn diagnostic
 *   but never changes the masked outcome
 * - null/undefined pass through; private wins over masked (excluded entirely)
 * - guards, computed properties, and command actions always see real values
 */

import { describe, it, expect, vi } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, EntityInstance, EncryptionProvider } from './runtime-engine';

const source = `
entity Patient {
  property required id: string
  property masked(partial, 0, 4) ssn: string
  property masked(email) contact: string unmask when user.role == "admin"
  property masked(phone) phone: string
  property masked(last4) card: string
  property masked notes: string
  property masked(redact) diagnosis: string?
  property private masked(email) shadowEmail: string
  property name: string

  computed contactCopy: string = self.contact

  command checkSsn() {
    guard self.ssn == "123-45-6789"
    mutate name = "guard-saw-real-value"
  }
}

store Patient in memory
`;

const patientData = {
  id: 'p1',
  ssn: '123-45-6789',
  contact: 'alice@example.com',
  phone: '555-867-5309',
  card: '4111111111111111',
  notes: 'sensitive notes',
  diagnosis: null,
  shadowEmail: 'shadow@example.com',
  name: 'Alice',
};

async function makeEngine(context: Record<string, unknown> = {}, options = {}) {
  const { ir, diagnostics } = await compileToIR(source);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const engine = new RuntimeEngine(ir!, context, options);
  await engine.createInstance('Patient', { ...patientData } as EntityInstance);
  return engine;
}

describe('Runtime property masking', () => {
  describe('strategies via getInstance', () => {
    it('masks every strategy on read', async () => {
      const engine = await makeEngine();
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst?.ssn).toBe('*******6789'); // partial(0, 4)
      expect(inst?.contact).toBe('a***@example.com'); // email (no user => masked)
      expect(inst?.phone).toBe('***-***-5309'); // phone
      expect(inst?.card).toBe('****1111'); // last4
      expect(inst?.notes).toBe('***'); // bare masked = redact
      expect(inst?.name).toBe('Alice'); // unmasked property untouched
    });

    it('masks all instances in getAllInstances', async () => {
      const engine = await makeEngine();
      await engine.createInstance('Patient', { ...patientData, id: 'p2' } as EntityInstance);
      const all = await engine.getAllInstances('Patient');
      expect(all).toHaveLength(2);
      for (const inst of all) {
        expect(inst.ssn).toBe('*******6789');
        expect(inst.notes).toBe('***');
      }
    });
  });

  describe('unmaskWhen', () => {
    it('returns the real value when unmaskWhen is truthy', async () => {
      const engine = await makeEngine({ user: { id: 'u1', role: 'admin' } });
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst?.contact).toBe('alice@example.com');
      // other masked properties (no unmaskWhen) stay masked
      expect(inst?.ssn).toBe('*******6789');
    });

    it('stays masked when unmaskWhen is falsy', async () => {
      const engine = await makeEngine({ user: { id: 'u1', role: 'viewer' } });
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst?.contact).toBe('a***@example.com');
    });

    it('stays masked with no user in context (secure by default)', async () => {
      const engine = await makeEngine({});
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst?.contact).toBe('a***@example.com');
    });

    it('supports self.* bindings against the raw instance', async () => {
      const selfSource = `
entity Doc {
  property required id: string
  property ownerId: string
  property masked(redact) body: string unmask when self.ownerId == user.id
}

store Doc in memory
`;
      const { ir } = await compileToIR(selfSource);
      const owner = new RuntimeEngine(ir!, { user: { id: 'u1' } });
      await owner.createInstance('Doc', {
        id: 'd1',
        ownerId: 'u1',
        body: 'secret',
      } as EntityInstance);
      expect((await owner.getInstance('Doc', 'd1'))?.body).toBe('secret');

      const stranger = new RuntimeEngine(ir!, { user: { id: 'u2' } });
      await stranger.createInstance('Doc', {
        id: 'd1',
        ownerId: 'u1',
        body: 'secret',
      } as EntityInstance);
      expect((await stranger.getInstance('Doc', 'd1'))?.body).toBe('***');
    });

    it('stays masked AND surfaces a diagnostic when unmaskWhen throws', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // Force a deterministic evaluation error: a 1-deep budget makes the
        // nested member access in `user.role == "admin"` exceed the limit.
        const engine = await makeEngine(
          { user: { id: 'u1', role: 'admin' } },
          { evaluationLimits: { maxExpressionDepth: 1 } },
        );
        const inst = await engine.getInstance('Patient', 'p1');
        // Error ⇒ masked, even though the role WOULD have allowed unmasking
        expect(inst?.contact).toBe('a***@example.com');
        const maskingWarning = warnSpy.mock.calls.find((call) =>
          String(call[0]).includes("unmaskWhen evaluation error for 'Patient.contact'"),
        );
        expect(maskingWarning).toBeDefined();
        const payload = maskingWarning![1] as { expression: string; error: string };
        expect(payload.expression).toContain('user.role');
        expect(payload.error).toBeTruthy();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('null passthrough and private-wins', () => {
    it('passes null values through unmasked', async () => {
      const engine = await makeEngine();
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst?.diagnosis).toBeNull();
    });

    it('excludes private+masked properties entirely', async () => {
      const engine = await makeEngine();
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst).toBeDefined();
      expect('shadowEmail' in inst!).toBe(false);
      const all = await engine.getAllInstances('Patient');
      expect('shadowEmail' in all[0]).toBe(false);
    });
  });

  describe('masked + encrypted ordering', () => {
    it('masks the decrypted plaintext, not the ciphertext envelope', async () => {
      const provider: EncryptionProvider = {
        encrypt: async (plaintext: string) => ({
          ciphertext: Buffer.from(plaintext, 'utf-8').toString('base64'),
          keyId: 'k1',
        }),
        decrypt: async (ciphertext: string) => Buffer.from(ciphertext, 'base64').toString('utf-8'),
      };
      const encSource = `
entity Vault {
  property required id: string
  property encrypted masked(partial, 0, 4) secret: string
}

store Vault in memory
`;
      const { ir } = await compileToIR(encSource);
      const engine = new RuntimeEngine(ir!, {}, { encryptionProvider: provider });
      await engine.createInstance('Vault', { id: 'v1', secret: '123-45-6789' } as EntityInstance);
      const inst = await engine.getInstance('Vault', 'v1');
      // Mask applied AFTER decryption: shape matches the plaintext, tail leaks last 4 only
      expect(inst?.secret).toBe('*******6789');
    });
  });

  describe('execution sees real values (read-projection only)', () => {
    it('guards evaluate against the real value', async () => {
      const engine = await makeEngine();
      const result = await engine.runCommand(
        'checkSsn',
        {},
        { entityName: 'Patient', instanceId: 'p1' },
      );
      expect(result.success).toBe(true);
      // The mutation went through; reads still mask
      const inst = await engine.getInstance('Patient', 'p1');
      expect(inst?.name).toBe('guard-saw-real-value');
      expect(inst?.ssn).toBe('*******6789');
    });

    it('computed properties evaluate against the real value', async () => {
      const engine = await makeEngine();
      const value = await engine.evaluateComputed('Patient', 'p1', 'contactCopy');
      expect(value).toBe('alice@example.com');
    });

    it('createInstance returns the unmasked created instance', async () => {
      const engine = await makeEngine();
      const created = await engine.createInstance('Patient', {
        ...patientData,
        id: 'p3',
      } as EntityInstance);
      // Masking is scoped to getInstance/getAllInstances; the create result is the real instance
      expect(created?.ssn).toBe('123-45-6789');
    });
  });
});
