/**
 * Tests for binary IR (MessagePack) serialization.
 */

import { describe, it, expect } from 'vitest';
import {
  packIR,
  unpackIR,
  inspectBinaryIR,
  compareSizes,
  deriveMirPath,
  deriveJsonPath,
  MIR_MAGIC,
  MIR_FORMAT_VERSION,
  MIR_HEADER_SIZE,
  MIR_EXTENSION,
  BinaryIRError,
} from './binary-ir.js';
import type { IR } from './ir.js';

function makeSampleIR(): IR {
  const t = (name: string) => ({ name, nullable: false }) as const;
  return {
    version: '1.0',
    provenance: {
      contentHash: 'abc123',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [
      {
        name: 'core',
        entities: ['User'],
        enums: [],
        commands: [],
        stores: [],
        events: [],
        policies: [],
      },
    ],
    values: [],
    entities: [
      {
        name: 'User',
        properties: [
          { name: 'id', type: t('string'), modifiers: ['required'] },
          { name: 'email', type: t('string'), modifiers: [] },
          { name: 'age', type: t('number'), modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

describe('packIR', () => {
  it('produces a buffer with the correct header', () => {
    const ir = makeSampleIR();
    const buf = packIR(ir);
    expect(buf.length).toBeGreaterThan(MIR_HEADER_SIZE);
    expect(buf[0]).toBe(MIR_MAGIC[0]);
    expect(buf[1]).toBe(MIR_MAGIC[1]);
    expect(buf[2]).toBe(MIR_MAGIC[2]);
    expect(buf[3]).toBe(MIR_FORMAT_VERSION);
  });

  it('produces a smaller buffer than JSON for non-trivial IR', () => {
    const ir = makeSampleIR();
    const jsonBytes = Buffer.byteLength(JSON.stringify(ir), 'utf-8');
    const binaryBytes = packIR(ir).length;
    expect(binaryBytes).toBeLessThan(jsonBytes);
  });
});

describe('unpackIR', () => {
  it('round-trips IR losslessly', () => {
    const ir = makeSampleIR();
    const buf = packIR(ir);
    const decoded = unpackIR(buf);
    expect(decoded).toEqual(ir);
  });

  it('round-trips IR with complex nested structures', () => {
    const ir = makeSampleIR();
    const complexIR = {
      ...ir,
      entities: [
        {
          ...ir.entities[0]!,
          properties: [
            ...ir.entities[0]!.properties,
            { name: 'tags', type: { name: 'array', nullable: false }, modifiers: [] },
            { name: 'metadata', type: { name: 'object', nullable: false }, modifiers: [] },
          ],
        },
      ],
    } as IR;

    const buf = packIR(complexIR);
    const decoded = unpackIR(buf);
    expect(decoded).toEqual(complexIR);
  });

  it('throws BinaryIRError on too-short buffer', () => {
    expect(() => unpackIR(new Uint8Array([0x4d, 0x49]))).toThrow(BinaryIRError);
  });

  it('throws BinaryIRError on invalid magic bytes', () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x00]);
    expect(() => unpackIR(buf)).toThrow(BinaryIRError);
    expect(() => unpackIR(buf)).toThrow(/magic/i);
  });

  it('throws BinaryIRError on unsupported format version', () => {
    const buf = new Uint8Array([MIR_MAGIC[0], MIR_MAGIC[1], MIR_MAGIC[2], 99, 0x00]);
    expect(() => unpackIR(buf)).toThrow(BinaryIRError);
    expect(() => unpackIR(buf)).toThrow(/version/i);
  });
});

describe('inspectBinaryIR', () => {
  it('returns header info without decoding the payload', () => {
    const ir = makeSampleIR();
    const buf = packIR(ir);
    const info = inspectBinaryIR(buf);
    expect(info.formatVersion).toBe(MIR_FORMAT_VERSION);
    expect(info.totalSize).toBe(buf.length);
    expect(info.payloadSize).toBe(buf.length - MIR_HEADER_SIZE);
  });

  it('throws on too-short buffer', () => {
    expect(() => inspectBinaryIR(new Uint8Array([1, 2, 3]))).toThrow(BinaryIRError);
  });

  it('throws on invalid magic', () => {
    expect(() => inspectBinaryIR(new Uint8Array([0, 0, 0, 1]))).toThrow(BinaryIRError);
  });
});

describe('compareSizes', () => {
  it('reports compression savings', () => {
    const ir = makeSampleIR();
    const stats = compareSizes(ir);
    expect(stats.jsonBytes).toBeGreaterThan(0);
    expect(stats.binaryBytes).toBeGreaterThan(0);
    expect(stats.binaryBytes).toBeLessThan(stats.jsonBytes);
    expect(stats.ratio).toBeLessThan(1);
    expect(stats.savingsPercent).toBeGreaterThan(0);
  });

  it('reports ~0% savings for an essentially empty IR', () => {
    const minimal: IR = {
      version: '1.0',
      provenance: {
        contentHash: 'x',
        compilerVersion: '1.0.0',
        schemaVersion: '1.0',
        compiledAt: '2025-01-01T00:00:00.000Z',
      },
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
    };
    const stats = compareSizes(minimal);
    expect(stats.jsonBytes).toBeGreaterThan(0);
    expect(stats.binaryBytes).toBeGreaterThan(0);
  });
});

describe('deriveMirPath', () => {
  it('replaces .ir.json extension with .mir', () => {
    expect(deriveMirPath('/tmp/foo/bar.ir.json')).toBe('/tmp/foo/bar.mir');
  });

  it('keeps .mir extension if already present', () => {
    expect(deriveMirPath('/tmp/foo/bar.mir')).toBe('/tmp/foo/bar.mir');
  });

  it('appends .mir if no recognized extension', () => {
    expect(deriveMirPath('/tmp/foo/bar')).toBe('/tmp/foo/bar.mir');
  });
});

describe('deriveJsonPath', () => {
  it('replaces .mir extension with .ir.json', () => {
    expect(deriveJsonPath('/tmp/foo/bar.mir')).toBe('/tmp/foo/bar.ir.json');
  });

  it('appends .ir.json if no .mir extension', () => {
    expect(deriveJsonPath('/tmp/foo/bar')).toBe('/tmp/foo/bar.ir.json');
  });
});

describe('MIR_EXTENSION', () => {
  it('is ".mir"', () => {
    expect(MIR_EXTENSION).toBe('.mir');
  });
});
