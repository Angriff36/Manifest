/**
 * Manifest WASM Runtime - Internal prototype entrypoint
 *
 * The published package does not currently expose a supported `./wasm`
 * subpath or ship a default `.wasm` artifact. This module remains internal
 * source for future bring-up work.
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
