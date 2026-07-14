/**
 * Manifest WASM Expression Evaluator
 *
 * Drop-in replacement for the TypeScript expression evaluator that uses
 * the compiled WASM module for execution. Maintains identical semantics
 * to the TypeScript runtime engine (src/manifest/runtime-engine.ts).
 *
 * Internal prototype only. The published package does not expose a supported
 * WASM surface today, so callers should expect TypeScript fallback unless
 * they inject their own bytes explicitly in repo/dev scenarios.
 */

import type { IRExpression } from '../ir.js';
import {
  constraintExpressionPasses,
  type ConstraintPolarityOptions,
} from '../constraint-polarity.js';
import {
  deserializeResult,
  loadDefaultWasmBytes,
  loadWasmModule,
  serializeContext,
  serializeExpression,
  type WasmModule,
} from './wasm-loader.js';

export type { ConstraintPolarityOptions };

// ============================================================================
// Types
// ============================================================================

export type WasmStatus = 'uninitialized' | 'loading' | 'ready' | 'failed' | 'unsupported';

export interface WasmEvaluatorOptions {
  /**
   * Path to the WASM bytes, or a function returning the bytes.
   * If omitted, the evaluator will try to load from default locations.
   */
  wasmBytes?: ArrayBuffer | (() => Promise<ArrayBuffer>);

  /**
   * If true, do not fall back to TypeScript on WASM failure.
   * The error will be thrown to the caller. Default: false.
   */
  strict?: boolean;

  /**
   * If true, log debug information to the console. Default: false.
   */
  debug?: boolean;
}

// ============================================================================
// Evaluator Class
// ============================================================================

/**
 * WASM-backed expression evaluator.
 *
 * Usage:
 *   const evaluator = new WasmExpressionEvaluator();
 *   await evaluator.init();
 *   const result = await evaluator.evaluate(expr, context);
 */
export class WasmExpressionEvaluator {
  private module: WasmModule | null = null;
  private status: WasmStatus = 'uninitialized';
  private initPromise: Promise<void> | null = null;
  private options: WasmEvaluatorOptions;
  private hostNow: () => number = () => Date.now();
  private hostUuid: () => string = () => crypto.randomUUID();

  constructor(options: WasmEvaluatorOptions = {}) {
    this.options = options;
  }

  /**
   * Initialize the WASM module. Safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.status === 'ready') return;
    if (this.initPromise) return this.initPromise;
    this.status = 'loading';
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      let bytes: ArrayBuffer | null = null;
      if (this.options.wasmBytes) {
        bytes =
          typeof this.options.wasmBytes === 'function'
            ? await this.options.wasmBytes()
            : this.options.wasmBytes;
      } else {
        bytes = await loadDefaultWasmBytes();
      }
      if (!bytes) {
        this.status = 'unsupported';
        if (this.options.debug) {
          console.warn('[WASM] No WASM bytes available, falling back to TypeScript');
        }
        return;
      }
      this.module = await loadWasmModule(bytes);
      // Wire up host callbacks
      this.module.setNowProvider(this.hostNow);
      this.module.setUuidProvider(this.hostUuid);
      this.status = 'ready';
      if (this.options.debug) {
        console.log('[WASM] Manifest runtime initialized, version:', this.getVersion());
      }
    } catch (err) {
      this.status = 'failed';
      if (this.options.debug) {
        console.warn('[WASM] Failed to load WASM module:', err);
      }
    }
  }

  /**
   * Get the current status of the WASM evaluator.
   */
  getStatus(): WasmStatus {
    return this.status;
  }

  /**
   * Check whether WASM is available and ready.
   */
  isReady(): boolean {
    return this.status === 'ready' && this.module !== null;
  }

  /**
   * Get the WASM module version string.
   */
  getVersion(): string {
    if (!this.module) return 'uninitialized';
    try {
      const ptr = this.module.version();
      if (ptr) {
        return this.module.__getString(ptr);
      }
    } catch {
      // ignore
    }
    return 'unknown';
  }

  /**
   * Set the host now() provider.
   * Mirrors the now() built-in semantics from the TypeScript runtime.
   */
  setNowProvider(fn: () => number): void {
    this.hostNow = fn;
    if (this.module) this.module.setNowProvider(fn);
  }

  /**
   * Set the host uuid() provider.
   * Mirrors the uuid() built-in semantics from the TypeScript runtime.
   */
  setUuidProvider(fn: () => string): void {
    this.hostUuid = fn;
    if (this.module) this.module.setUuidProvider(fn);
  }

  /**
   * Evaluate an expression. Falls back to TypeScript on WASM failure.
   */
  async evaluate(expr: IRExpression, context: Record<string, unknown>): Promise<unknown> {
    if (!this.isReady()) {
      if (this.options.strict) {
        throw new Error('WASM module is not ready');
      }
      return this.fallbackEvaluate(expr, context);
    }
    try {
      const exprJson = serializeExpression(expr);
      const ctxJson = serializeContext(context);
      const resultPtr = this.module!.evalExpr(
        this.module!.__pin(this.module!.__newString(exprJson)),
        this.module!.__pin(this.module!.__newString(ctxJson)),
      );
      const resultJson = this.module!.__getString(resultPtr);
      return deserializeResult(resultJson);
    } catch (err) {
      if (this.options.strict) {
        throw err;
      }
      if (this.options.debug) {
        console.warn('[WASM] Evaluation failed, falling back to TypeScript:', err);
      }
      return this.fallbackEvaluate(expr, context);
    }
  }

  /**
   * Evaluate a constraint expression.
   * Returns true if the constraint passes, false otherwise.
   * Polarity uses explicit `failWhen` + severity (semantics.md) — never name heuristics.
   * Expression evaluation may use WASM when available; polarity is always applied in TS
   * so both evaluators agree with RuntimeEngine.
   */
  async evaluateConstraint(
    expr: IRExpression,
    context: Record<string, unknown>,
    options: ConstraintPolarityOptions = {},
  ): Promise<boolean> {
    const result = await this.evaluate(expr, context);
    return constraintExpressionPasses(result, options);
  }

  // ============================================================================
  // TypeScript Fallback (delegates to runtime-engine)
  // ============================================================================

  private async fallbackEvaluate(
    expr: IRExpression,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    const { RuntimeEngine } = await import('../runtime-engine.js');
    const dummyIR = createDummyIR();
    const engine = new RuntimeEngine(dummyIR, {});
    return await engine.evaluateExpression(expr, context);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function createDummyIR(): import('../ir.js').IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'wasm-fallback',
      compilerVersion: 'wasm-fallback',
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
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
}

// ============================================================================
// Singleton
// ============================================================================

/**
 * Default singleton evaluator instance.
 * Shared across the application for efficiency.
 */
let defaultEvaluator: WasmExpressionEvaluator | null = null;

/**
 * Get the default WASM evaluator, creating it if necessary.
 */
export function getDefaultWasmEvaluator(): WasmExpressionEvaluator {
  if (!defaultEvaluator) {
    defaultEvaluator = new WasmExpressionEvaluator();
  }
  return defaultEvaluator;
}

/**
 * Reset the default evaluator (mainly for testing).
 */
export function resetDefaultWasmEvaluator(): void {
  defaultEvaluator = null;
}
