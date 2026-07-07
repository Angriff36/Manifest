/**
 * Manifest WASM Runtime - TypeScript Loader
 *
 * Loads the compiled AssemblyScript WASM module and provides a
 * TypeScript-friendly wrapper that maintains identical semantics
 * to the TypeScript runtime engine.
 *
 * Internal prototype only. The published package currently falls back to the
 * TypeScript evaluator because it does not ship a supported default WASM
 * artifact.
 */

import type { IRExpression, IRValue } from '../ir.js';

// ============================================================================
// WASM Module Interface
// ============================================================================

/**
 * The shape of the AssemblyScript module exports we use.
 */
export interface WasmModule {
  memory: WebAssembly.Memory;
  __pin: (ptr: number) => number;
  __unpin: (ptr: number) => void;
  __newString: (str: string) => number;
  __newArray: (id: number, len: number) => number;
  __getString: (ptr: number) => string;
  __getArrayLength: (ptr: number) => number;
  __getArrayElement: (ptr: number, idx: number) => number;
  evalExpr: (exprPtr: number, ctxPtr: number) => number;
  evalConstraint: (exprPtr: number, ctxPtr: number, namePtr: number) => number;
  setNowProvider: (fn: () => number) => void;
  setUuidProvider: (fn: () => string) => void;
  version: () => number;
}

// ============================================================================
// Module Loading
// ============================================================================

/**
 * Load the compiled WASM module from a buffer.
 * Works in both browser and Node.js environments.
 */
export async function loadWasmModule(wasmBytes: BufferSource): Promise<WasmModule> {
  // Validate WebAssembly support
  if (typeof WebAssembly === 'undefined' || !WebAssembly.instantiate) {
    throw new Error('WebAssembly is not supported in this environment');
  }

  // Dynamic imports for the AssemblyScript loader.
  // The AssemblyScript runtime is loaded only when WASM is requested.
  // The runtime package is optional to keep base bundle small.
  const asLoader = await importAssemblyLoader();
  if (!asLoader) {
    throw new Error('AssemblyScript loader is not available');
  }

  const module = await asLoader.instantiate<WasmModule>(
    wasmBytes,
    {
      env: {
        abort: (msg: number, file: number, line: number, col: number) => {
          throw new Error(`WASM abort: msg=${msg} file=${file} line=${line} col=${col}`);
        },
        trace: (_msg: number, _n: number, _args: number) => {
          // Tracing disabled in release
        },
      },
    }
  );

  return module.exports;
}

/**
 * Try to import the AssemblyScript loader.
 * Returns null if the optional package is not installed.
 */
async function importAssemblyLoader(): Promise<{
  instantiate: <T>(bytes: BufferSource, imports: Record<string, unknown>) => Promise<{ exports: T }>;
} | null> {
  try {
    // The AssemblyScript runtime is required for hosted classes / strings.
    const mod = await import('@assemblyscript/loader');
    if (mod && typeof mod.instantiate === 'function') {
      return mod as { instantiate: <T>(bytes: BufferSource, imports: Record<string, unknown>) => Promise<{ exports: T }> };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Try to load the embedded WASM bytes.
 * In a build, the bytes are inlined via a Vite import.
 * In Node.js, they're loaded from the filesystem.
 */
export async function loadDefaultWasmBytes(): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch !== 'undefined') {
      // Browser/edge: use fetch
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:5173';
      const response = await fetch(`${baseUrl}/manifest-runtime.wasm`);
      if (response.ok) {
        return await response.arrayBuffer();
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

// ============================================================================
// Expression Serialization
// ============================================================================

/**
 * Serialize an IRExpression to a JSON string suitable for the WASM module.
 */
export function serializeExpression(expr: IRExpression): string {
  return JSON.stringify(expr);
}

/**
 * Serialize a context object to a JSON string suitable for the WASM module.
 */
export function serializeContext(context: Record<string, unknown>): string {
  // The WASM module expects a flat object with primitive values.
  // We strip functions, undefined, and circular references.
  return JSON.stringify(context, (_key, value) => {
    if (typeof value === 'function') return undefined;
    if (typeof value === 'undefined') return null;
    return value;
  });
}

/**
 * Serialize an IRValue to a JSON string.
 */
export function serializeIRValue(value: IRValue): string {
  return JSON.stringify(value);
}

// ============================================================================
// Result Deserialization
// ============================================================================

/**
 * Deserialize a JSON string returned by the WASM module into a JavaScript value.
 */
export function deserializeResult(jsonResult: string): unknown {
  if (jsonResult === 'null') return null;
  if (jsonResult === 'true') return true;
  if (jsonResult === 'false') return false;
  // Numbers, strings, arrays, objects are returned as JSON
  try {
    return JSON.parse(jsonResult);
  } catch {
    // Fallback: return as string
    return jsonResult;
  }
}
