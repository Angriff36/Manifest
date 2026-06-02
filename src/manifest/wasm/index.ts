/**
 * Manifest WASM Runtime - Public API
 *
 * Provides a WebAssembly-compiled expression evaluator and constraint
 * validator for the Manifest DSL runtime engine.
 *
 * Usage:
 *   import { getDefaultWasmEvaluator } from '@angriff36/manifest/wasm';
 *   const evaluator = getDefaultWasmEvaluator();
 *   await evaluator.init();
 *   const result = await evaluator.evaluate(expression, context);
 */

export {
  WasmExpressionEvaluator,
  getDefaultWasmEvaluator,
  resetDefaultWasmEvaluator,
  type WasmStatus,
  type WasmEvaluatorOptions,
} from './wasm-evaluator.js';

export {
  loadWasmModule,
  loadDefaultWasmBytes,
  serializeExpression,
  serializeContext,
  serializeIRValue,
  deserializeResult,
  type WasmModule,
} from './wasm-loader.js';
