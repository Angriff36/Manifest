/**
 * Binary IR serialization using MessagePack.
 *
 * Provides a compact binary alternative to JSON for storing and transporting
 * Manifest IR. Binary IR files use the `.mir` extension and include a
 * format version header so the layout can evolve safely.
 *
 * File layout:
 *   bytes 0-2 : magic "MIR"  (3 bytes)
 *   byte  3   : format version (currently 0x01)
 *   bytes 4+  : MessagePack-encoded IR payload
 *
 * Typical size reduction vs JSON: 40-60% for non-trivial IR.
 * Round-trip is lossless: pack(unpack(buf)) === unpack(pack(ir)).
 */

import { encode, decode } from '@msgpack/msgpack';
import type { IR } from './ir.js';

/** Magic prefix for `.mir` files: "MIR" */
export const MIR_MAGIC = [0x4d, 0x49, 0x52] as const;

/** Current binary format version. Bump when the on-disk layout changes. */
export const MIR_FORMAT_VERSION = 1;

/** Total header size in bytes (3 magic + 1 version). */
export const MIR_HEADER_SIZE = 4;

/** Default output extension for binary IR files. */
export const MIR_EXTENSION = '.mir';

/** Information about a packed binary file. */
export interface BinaryIRInfo {
  formatVersion: number;
  payloadSize: number;
  totalSize: number;
}

/** Comparison statistics between JSON and binary representations. */
export interface CompressionStats {
  jsonBytes: number;
  binaryBytes: number;
  ratio: number;
  savingsPercent: number;
}

/** Error thrown when a `.mir` file cannot be decoded. */
export class BinaryIRError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinaryIRError';
  }
}

/**
 * Encode an IR object into a `.mir` binary buffer.
 *
 * The buffer is prefixed with the 4-byte `MIR`+version header, followed by
 * a MessagePack payload that round-trips losslessly.
 */
export function packIR(ir: IR): Uint8Array {
  const payload = encode(ir);
  const buf = new Uint8Array(MIR_HEADER_SIZE + payload.length);
  buf[0] = MIR_MAGIC[0];
  buf[1] = MIR_MAGIC[1];
  buf[2] = MIR_MAGIC[2];
  buf[3] = MIR_FORMAT_VERSION;
  buf.set(payload, MIR_HEADER_SIZE);
  return buf;
}

/**
 * Decode a `.mir` binary buffer back into an IR object.
 *
 * Throws {@link BinaryIRError} if the header is missing, the magic bytes
 * don't match, or the format version is unsupported.
 */
export function unpackIR(buf: Uint8Array): IR {
  if (buf.length < MIR_HEADER_SIZE) {
    throw new BinaryIRError(
      `Buffer too short: expected at least ${MIR_HEADER_SIZE} header bytes, got ${buf.length}`,
    );
  }
  if (buf[0] !== MIR_MAGIC[0] || buf[1] !== MIR_MAGIC[1] || buf[2] !== MIR_MAGIC[2]) {
    throw new BinaryIRError('Invalid magic bytes: not a .mir file (expected "MIR" prefix)');
  }
  const version = buf[3];
  if (version !== MIR_FORMAT_VERSION) {
    throw new BinaryIRError(
      `Unsupported format version: ${version} (expected ${MIR_FORMAT_VERSION})`,
    );
  }
  const payload = buf.subarray(MIR_HEADER_SIZE);
  try {
    return decode(payload) as IR;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new BinaryIRError(`Failed to decode MessagePack payload: ${msg}`);
  }
}

/**
 * Return structural info about a `.mir` buffer without fully decoding it.
 */
export function inspectBinaryIR(buf: Uint8Array): BinaryIRInfo {
  if (buf.length < MIR_HEADER_SIZE) {
    throw new BinaryIRError(
      `Buffer too short: expected at least ${MIR_HEADER_SIZE} header bytes, got ${buf.length}`,
    );
  }
  if (buf[0] !== MIR_MAGIC[0] || buf[1] !== MIR_MAGIC[1] || buf[2] !== MIR_MAGIC[2]) {
    throw new BinaryIRError('Invalid magic bytes: not a .mir file');
  }
  return {
    formatVersion: buf[3],
    payloadSize: buf.length - MIR_HEADER_SIZE,
    totalSize: buf.length,
  };
}

/**
 * Compute size comparison between JSON and binary representations of the
 * same IR. Useful for reporting compression ratios in CLI output.
 */
export function compareSizes(ir: IR): CompressionStats {
  const jsonBytes = Buffer.byteLength(JSON.stringify(ir), 'utf-8');
  const binaryBytes = packIR(ir).length;
  const ratio = jsonBytes === 0 ? 0 : binaryBytes / jsonBytes;
  const savingsPercent = Math.round((1 - ratio) * 1000) / 10;
  return { jsonBytes, binaryBytes, ratio, savingsPercent };
}

/**
 * Derive a `.mir` output path from a source path by replacing the extension.
 * If the source already has `.mir` extension, returns it unchanged.
 * Strips `.ir.json` as a compound extension, then appends `.mir`.
 */
export function deriveMirPath(sourcePath: string): string {
  if (sourcePath.endsWith(MIR_EXTENSION)) return sourcePath;
  if (sourcePath.endsWith('.ir.json')) {
    return sourcePath.slice(0, -'.ir.json'.length) + MIR_EXTENSION;
  }
  return sourcePath.replace(/\.[^./\\]+$/, '') + MIR_EXTENSION;
}

/**
 * Derive a `.ir.json` output path from a `.mir` source path.
 * If the source does not end in `.mir`, the `.ir.json` suffix is appended.
 */
export function deriveJsonPath(sourcePath: string): string {
  if (sourcePath.endsWith(MIR_EXTENSION)) {
    return sourcePath.slice(0, -MIR_EXTENSION.length) + '.ir.json';
  }
  return sourcePath + '.ir.json';
}
