/**
 * Manifest WASM Runtime - AssemblyScript Implementation
 *
 * Compiles the Manifest DSL expression evaluator and constraint validator
 * to WebAssembly for near-native execution speed in browser and edge environments.
 *
 * Semantics MUST match the TypeScript runtime in src/manifest/runtime-engine.ts
 */

// ============================================================================
// IR Types (mirrors src/manifest/ir.ts expression/value types)
// ============================================================================

export type IRValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: f64 }
  | { kind: 'boolean'; value: bool }
  | { kind: 'null' }
  | { kind: 'array'; elements: IRValue[] }
  | { kind: 'object'; properties: Map<string, IRValue> };

export type IRExpression =
  | { kind: 'literal'; value: IRValue }
  | { kind: 'identifier'; name: string }
  | { kind: 'member'; object: IRExpression; property: string }
  | { kind: 'binary'; operator: string; left: IRExpression; right: IRExpression }
  | { kind: 'unary'; operator: string; operand: IRExpression }
  | { kind: 'call'; callee: IRExpression; args: IRExpression[] }
  | { kind: 'conditional'; condition: IRExpression; consequent: IRExpression; alternate: IRExpression }
  | { kind: 'array'; elements: IRExpression[] }
  | { kind: 'object'; properties: Map<string, IRExpression> }
  | { kind: 'lambda'; params: string[]; body: IRExpression };

// ============================================================================
// Evaluation Context
// ============================================================================

/**
 * Evaluation context holds variable bindings.
 * Keys are variable names, values can be any WASM-compatible value.
 */
export class EvalContext {
  bindings: Map<string, EvalValue>;

  constructor() {
    this.bindings = new Map<string, EvalValue>();
  }

  get(name: string): EvalValue | null {
    if (this.bindings.has(name)) {
      return this.bindings.get(name);
    }
    return null;
  }

  set(name: string, value: EvalValue): void {
    this.bindings.set(name, value);
  }

  has(name: string): bool {
    return this.bindings.has(name);
  }

  clone(): EvalContext {
    const ctx = new EvalContext();
    const keys = this.bindings.keys();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      ctx.bindings.set(k, this.bindings.get(k));
    }
    return ctx;
  }
}

// ============================================================================
// EvalValue - tagged union of all possible runtime values
// ============================================================================

export const enum ValueType {
  NULL = 0,
  BOOLEAN = 1,
  NUMBER = 2,
  STRING = 3,
  ARRAY = 4,
  OBJECT = 5,
  UNDEFINED = 6,
}

/**
 * EvalValue is a lightweight tagged value used during expression evaluation.
 * Objects and arrays are stored as JSON strings (canonical form) to keep
 * WASM memory simple while preserving full semantic equivalence with the
 * TypeScript evaluator.
 */
export class EvalValue {
  type: ValueType;
  boolVal: bool;
  numVal: f64;
  strVal: string;
  jsonVal: string; // For arrays/objects: JSON representation

  constructor(
    type: ValueType = ValueType.NULL,
    boolVal: bool = false,
    numVal: f64 = 0,
    strVal: string = '',
    jsonVal: string = ''
  ) {
    this.type = type;
    this.boolVal = boolVal;
    this.numVal = numVal;
    this.strVal = strVal;
    this.jsonVal = jsonVal;
  }

  static fromBool(b: bool): EvalValue {
    return new EvalValue(ValueType.BOOLEAN, b, 0, '', '');
  }

  static fromNumber(n: f64): EvalValue {
    return new EvalValue(ValueType.NUMBER, false, n, '', '');
  }

  static fromString(s: string): EvalValue {
    return new EvalValue(ValueType.STRING, false, 0, s, '');
  }

  static nullValue(): EvalValue {
    return new EvalValue(ValueType.NULL, false, 0, '', '');
  }

  static undefinedValue(): EvalValue {
    return new EvalValue(ValueType.UNDEFINED, false, 0, '', '');
  }

  /**
   * Convert to a JavaScript-friendly representation.
   * Booleans/numbers/strings are returned directly.
   * Null and undefined are distinguishable.
   * Arrays/objects come back as parsed JSON.
   */
  toJSString(): string {
    switch (this.type) {
      case ValueType.NULL: return 'null';
      case ValueType.UNDEFINED: return 'undefined';
      case ValueType.BOOLEAN: return this.boolVal ? 'true' : 'false';
      case ValueType.NUMBER: return this.numVal.toString();
      case ValueType.STRING: return '"' + escapeJSON(this.strVal) + '"';
      case ValueType.ARRAY:
      case ValueType.OBJECT: return this.jsonVal;
      default: return 'null';
    }
  }

  /**
   * Get a string representation for concatenation (mirrors String(value) semantics).
   */
  toStringValue(): string {
    switch (this.type) {
      case ValueType.NULL: return 'null';
      case ValueType.UNDEFINED: return 'undefined';
      case ValueType.BOOLEAN: return this.boolVal ? 'true' : 'false';
      case ValueType.NUMBER: return this.numVal.toString();
      case ValueType.STRING: return this.strVal;
      case ValueType.ARRAY: return this.jsonVal;
      case ValueType.OBJECT: return this.jsonVal;
      default: return 'null';
    }
  }

  isTruthy(): bool {
    switch (this.type) {
      case ValueType.NULL: return false;
      case ValueType.UNDEFINED: return false;
      case ValueType.BOOLEAN: return this.boolVal;
      case ValueType.NUMBER: return this.numVal !== 0 && !isNaN(this.numVal);
      case ValueType.STRING: return this.strVal.length > 0;
      case ValueType.ARRAY: return true;
      case ValueType.OBJECT: return true;
      default: return false;
    }
  }
}

// ============================================================================
// JSON Helpers (minimal, deterministic)
// ============================================================================

/**
 * Escape a string for inclusion in a JSON string literal.
 */
function escapeJSON(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5C) out += '\\\\';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x09) out += '\\t';
    else if (c === 0x0A) out += '\\n';
    else if (c === 0x0C) out += '\\f';
    else if (c === 0x0D) out += '\\r';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += s.charAt(i);
  }
  return out;
}

/**
 * Parse a JSON string into a Map (objects) or Vec (arrays) of EvalValue.
 * Returns null on parse error.
 *
 * Because WASM/AssemblyScript doesn't have a native JSON parser, this is
 * a minimal parser sufficient for context values. It handles:
 * - null, true, false
 * - numbers (integer and float)
 * - strings (with escape sequences)
 * - arrays
 * - objects
 */
function parseJSONValue(input: string, pos: i32): EvalValue | null {
  if (pos >= input.length) return EvalValue.nullValue();
  skipWhitespace(input, pos);
  const c = input.charCodeAt(pos);
  if (c === 0x7B) return parseJSONObject(input, pos);
  if (c === 0x5B) return parseJSONArray(input, pos);
  if (c === 0x22) return parseJSONString(input, pos);
  if (c === 0x74 || c === 0x66) return parseJSONBool(input, pos);
  if (c === 0x6E) return parseJSONNull(input, pos);
  if (c === 0x2D || (c >= 0x30 && c <= 0x39)) return parseJSONNumber(input, pos);
  return null;
}

function skipWhitespace(input: string, pos: i32): void {
  while (pos < input.length) {
    const c = input.charCodeAt(pos);
    if (c === 0x20 || c === 0x09 || c === 0x0A || c === 0x0D) pos++;
    else break;
  }
}

function parseJSONObject(input: string, pos: i32): EvalValue | null {
  // Caller has already verified input[pos] === '{'
  pos++; // skip '{'
  const result = new EvalValue(ValueType.OBJECT, false, 0, '', '');
  let json = '{';
  let first = true;
  skipWhitespace(input, pos);
  if (pos < input.length && input.charCodeAt(pos) === 0x7D) {
    result.jsonVal = '{}';
    return result;
  }
  while (pos < input.length) {
    skipWhitespace(input, pos);
    if (pos >= input.length) return null;
    if (input.charCodeAt(pos) !== 0x22) return null;
    const keyRes = parseRawJSONString(input, pos);
    if (keyRes === null) return null;
    pos = keyRes.next;
    skipWhitespace(input, pos);
    if (pos >= input.length || input.charCodeAt(pos) !== 0x3A) return null;
    pos++; // skip ':'
    skipWhitespace(input, pos);
    const valRes = parseRawJSONValue(input, pos);
    if (valRes === null) return null;
    pos = valRes.next;
    if (!first) json += ',';
    json += '"' + escapeJSON(keyRes.str) + '":' + valRes.json;
    first = false;
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) === 0x2C) {
      pos++;
      continue;
    }
    if (pos < input.length && input.charCodeAt(pos) === 0x7D) {
      pos++;
      break;
    }
    return null;
  }
  json += '}';
  result.jsonVal = json;
  return result;
}

function parseJSONArray(input: string, pos: i32): EvalValue | null {
  pos++; // skip '['
  const result = new EvalValue(ValueType.ARRAY, false, 0, '', '');
  let json = '[';
  let first = true;
  skipWhitespace(input, pos);
  if (pos < input.length && input.charCodeAt(pos) === 0x5D) {
    result.jsonVal = '[]';
    return result;
  }
  while (pos < input.length) {
    skipWhitespace(input, pos);
    const valRes = parseRawJSONValue(input, pos);
    if (valRes === null) return null;
    pos = valRes.next;
    if (!first) json += ',';
    json += valRes.json;
    first = false;
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) === 0x2C) {
      pos++;
      continue;
    }
    if (pos < input.length && input.charCodeAt(pos) === 0x5D) {
      pos++;
      break;
    }
    return null;
  }
  json += ']';
  result.jsonVal = json;
  return result;
}

function parseJSONString(input: string, pos: i32): EvalValue | null {
  const res = parseRawJSONString(input, pos);
  if (res === null) return null;
  const ev = new EvalValue(ValueType.STRING, false, 0, res.str, '');
  return ev;
}

function parseJSONBool(input: string, pos: i32): EvalValue | null {
  if (pos + 3 < input.length && input.charCodeAt(pos) === 0x74) {
    // true
    const ev = new EvalValue(ValueType.BOOLEAN, true, 0, '', '');
    return ev;
  }
  if (pos + 4 < input.length && input.charCodeAt(pos) === 0x66) {
    const ev = new EvalValue(ValueType.BOOLEAN, false, 0, '', '');
    return ev;
  }
  return null;
}

function parseJSONNull(_input: string, _pos: i32): EvalValue | null {
  return EvalValue.nullValue();
}

function parseJSONNumber(input: string, pos: i32): EvalValue | null {
  const res = parseRawJSONNumber(input, pos);
  if (res === null) return null;
  return new EvalValue(ValueType.NUMBER, false, res.num, 0, '');
}

class RawStringResult {
  str: string = '';
  next: i32 = 0;
}
class RawValueResult {
  json: string = '';
  next: i32 = 0;
}
class RawNumberResult {
  num: f64 = 0;
  next: i32 = 0;
}

function parseRawJSONString(input: string, pos: i32): RawStringResult | null {
  if (input.charCodeAt(pos) !== 0x22) return null;
  pos++;
  let out = '';
  while (pos < input.length) {
    const c = input.charCodeAt(pos);
    if (c === 0x22) {
      const r = new RawStringResult();
      r.str = out;
      r.next = pos + 1;
      return r;
    }
    if (c === 0x5C) {
      pos++;
      if (pos >= input.length) return null;
      const esc = input.charCodeAt(pos);
      if (esc === 0x22) out += '"';
      else if (esc === 0x5C) out += '\\';
      else if (esc === 0x2F) out += '/';
      else if (esc === 0x62) out += '\b';
      else if (esc === 0x66) out += '\f';
      else if (esc === 0x6E) out += '\n';
      else if (esc === 0x72) out += '\r';
      else if (esc === 0x74) out += '\t';
      else if (esc === 0x75) {
        pos++;
        if (pos + 4 > input.length) return null;
        let hex = 0;
        for (let i = 0; i < 4; i++) {
          const h = input.charCodeAt(pos + i);
          hex = hex * 16;
          if (h >= 0x30 && h <= 0x39) hex += h - 0x30;
          else if (h >= 0x61 && h <= 0x66) hex += h - 0x61 + 10;
          else if (h >= 0x41 && h <= 0x46) hex += h - 0x41 + 10;
          else return null;
        }
        out += String.fromCharCode(hex);
        pos += 3;
      } else return null;
    } else {
      out += input.charAt(pos);
    }
    pos++;
  }
  return null;
}

function parseRawJSONValue(input: string, pos: i32): RawValueResult | null {
  if (pos >= input.length) return null;
  const c = input.charCodeAt(pos);
  if (c === 0x7B) {
    const startPos = pos;
    const obj = parseJSONObject(input, pos);
    if (obj === null) return null;
    const r = new RawValueResult();
    r.json = obj.jsonVal;
    // Re-scan to find end position deterministically.
    r.next = findJSONEnd(input, startPos);
    return r;
  }
  if (c === 0x5B) {
    const startPos = pos;
    const arr = parseJSONArray(input, pos);
    if (arr === null) return null;
    const r = new RawValueResult();
    r.json = arr.jsonVal;
    r.next = findJSONEnd(input, startPos);
    return r;
  }
  if (c === 0x22) {
    const str = parseRawJSONString(input, pos);
    if (str === null) return null;
    const r = new RawValueResult();
    r.json = '"' + escapeJSON(str.str) + '"';
    r.next = str.next;
    return r;
  }
  if (c === 0x74) {
    const r = new RawValueResult();
    r.json = 'true';
    r.next = pos + 4;
    return r;
  }
  if (c === 0x66) {
    const r = new RawValueResult();
    r.json = 'false';
    r.next = pos + 5;
    return r;
  }
  if (c === 0x6E) {
    const r = new RawValueResult();
    r.json = 'null';
    r.next = pos + 4;
    return r;
  }
  if (c === 0x2D || (c >= 0x30 && c <= 0x39)) {
    const num = parseRawJSONNumber(input, pos);
    if (num === null) return null;
    const r = new RawValueResult();
    r.json = num.num.toString();
    r.next = num.next;
    return r;
  }
  return null;
}

function parseRawJSONNumber(input: string, pos: i32): RawNumberResult | null {
  const start = pos;
  let end = pos;
  if (input.charCodeAt(pos) === 0x2D) end++;
  while (end < input.length) {
    const c = input.charCodeAt(end);
    if ((c >= 0x30 && c <= 0x39) || c === 0x2E || c === 0x65 || c === 0x45 || c === 0x2B || c === 0x2D) {
      end++;
    } else break;
  }
  if (end === start) return null;
  const numStr = input.substring(start, end);
  const num = F64.parseFloat(numStr);
  if (isNaN(num)) return null;
  const r = new RawNumberResult();
  r.num = num;
  r.next = end;
  return r;
}

/**
 * Find the end position of a JSON value starting at `start`.
 * Used to recover position after recursive parsing that doesn't
 * expose its cursor.
 */
function findJSONEnd(input: string, start: i32): i32 {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === 0x5C) escape = true;
      else if (c === 0x22) inString = false;
      continue;
    }
    if (c === 0x22) { inString = true; continue; }
    if (c === 0x7B || c === 0x5B) depth++;
    else if (c === 0x7D || c === 0x5D) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return input.length;
}

// ============================================================================
// Binary Operators
// ============================================================================

function evaluateBinaryOp(op: string, left: EvalValue, right: EvalValue): EvalValue {
  if (op == '+') {
    // String concat if either operand is a string
    if (left.type == ValueType.STRING || right.type == ValueType.STRING) {
      return EvalValue.fromString(left.toStringValue() + right.toStringValue());
    }
    return EvalValue.fromNumber(left.numVal + right.numVal);
  }
  if (op == '-') return EvalValue.fromNumber(left.numVal - right.numVal);
  if (op == '*') return EvalValue.fromNumber(left.numVal * right.numVal);
  if (op == '/') return EvalValue.fromNumber(left.numVal / right.numVal);
  if (op == '%') return EvalValue.fromNumber(left.numVal % right.numVal);
  if (op == '==' || op == 'is') return EvalValue.fromBool(looseEqual(left, right));
  if (op == '!=') return EvalValue.fromBool(!looseEqual(left, right));
  if (op == '<') return EvalValue.fromBool(left.numVal < right.numVal);
  if (op == '>') return EvalValue.fromBool(left.numVal > right.numVal);
  if (op == '<=') return EvalValue.fromBool(left.numVal <= right.numVal);
  if (op == '>=') return EvalValue.fromBool(left.numVal >= right.numVal);
  if (op == '&&' || op == 'and') return EvalValue.fromBool(left.isTruthy() && right.isTruthy());
  if (op == '||' || op == 'or') return EvalValue.fromBool(left.isTruthy() || right.isTruthy());
  if (op == 'in') {
    return EvalValue.fromBool(containsValue(left, right));
  }
  if (op == 'contains') {
    return EvalValue.fromBool(containsValue(right, left));
  }
  return EvalValue.undefinedValue();
}

/**
 * Loose equality: undefined == null is true (matches JS).
 * Otherwise compare by type.
 */
function looseEqual(a: EvalValue, b: EvalValue): bool {
  if (a.type == ValueType.NULL && b.type == ValueType.UNDEFINED) return true;
  if (a.type == ValueType.UNDEFINED && b.type == ValueType.NULL) return true;
  if (a.type == ValueType.NULL || b.type == ValueType.NULL) return a.type == b.type;
  if (a.type == ValueType.UNDEFINED || b.type == ValueType.UNDEFINED) return a.type == b.type;
  if (a.type == ValueType.BOOLEAN && b.type == ValueType.BOOLEAN) return a.boolVal == b.boolVal;
  if (a.type == ValueType.NUMBER && b.type == ValueType.NUMBER) return a.numVal == b.numVal;
  if (a.type == ValueType.STRING && b.type == ValueType.STRING) return a.strVal == b.strVal;
  // Mixed type comparisons are false in JS == for primitives (except null/undefined).
  return false;
}

/**
 * Check whether `container` contains `needle`.
 * container (right operand of `in` / left of `contains`) can be an array or string.
 */
function containsValue(needle: EvalValue, container: EvalValue): bool {
  if (container.type == ValueType.ARRAY) {
    const json = container.jsonVal;
    // Walk array elements, parse each, compare with needle
    return arrayIncludes(json, needle);
  }
  if (container.type == ValueType.STRING) {
    if (needle.type == ValueType.STRING) {
      return container.strVal.indexOf(needle.strVal) >= 0;
    }
    return container.strVal.indexOf(needle.toStringValue()) >= 0;
  }
  return false;
}

/**
 * Walk a JSON array string and test whether any element loosely equals needle.
 */
function arrayIncludes(json: string, needle: EvalValue): bool {
  // json is '[a,b,c]' or '[]'
  if (json.length < 2 || json.charCodeAt(0) != 0x5B) return false;
  let pos = 1;
  while (pos < json.length) {
    while (pos < json.length) {
      const c = json.charCodeAt(pos);
      if (c != 0x20 && c != 0x09 && c != 0x0A && c != 0x0D && c != 0x2C) break;
      pos++;
    }
    if (pos < json.length && json.charCodeAt(pos) == 0x5D) break;
    const valRes = parseRawJSONValue(json, pos);
    if (valRes === null) return false;
    const elem = parseJSONValue(json, pos);
    if (elem !== null && looseEqual(elem, needle)) return true;
    pos = valRes.next;
  }
  return false;
}

// ============================================================================
// Built-in Functions
// ============================================================================

/**
 * Registry of built-in functions callable from expressions.
 * Mirrors the builtins in src/manifest/runtime-engine.ts (pure subset).
 *
 * Date/time/identity builtins that depend on host environment
 * (now, uuid) are provided as callbacks from JavaScript.
 */
export class BuiltinRegistry {
  // Host-provided functions
  now: () => f64;
  uuid: () => string;

  constructor(nowFn: () => f64, uuidFn: () => string) {
    this.now = nowFn;
    this.uuid = uuidFn;
  }

  has(name: string): bool {
    return this.isCoreBuiltin(name);
  }

  call(name: string, args: EvalValue[]): EvalValue {
    // Identity
    if (name == 'now') return EvalValue.fromNumber(this.now());
    if (name == 'uuid') return EvalValue.fromString(this.uuid());

    // String
    if (name == 'trim') return trimStr(args);
    if (name == 'split') return splitStr(args);
    if (name == 'count') return countVal(args);
    if (name == 'startsWith') return startsWithStr(args);
    if (name == 'endsWith') return endsWithStr(args);
    if (name == 'replace') return replaceStr(args);
    if (name == 'toUpperCase') return toUpperCaseStr(args);
    if (name == 'toLowerCase') return toLowerCaseStr(args);
    if (name == 'length') return lengthVal(args);
    if (name == 'substring') return substringStr(args);
    if (name == 'indexOf') return indexOfStr(args);
    if (name == 'matches') return matchesStr(args);

    // Math
    if (name == 'abs') return EvalValue.fromNumber(Math.abs(args[0].numVal));
    if (name == 'round') return EvalValue.fromNumber(Math.round(args[0].numVal));
    if (name == 'floor') return EvalValue.fromNumber(Math.floor(args[0].numVal));
    if (name == 'ceil') return EvalValue.fromNumber(Math.ceil(args[0].numVal));
    if (name == 'min') return minOfArgs(args);
    if (name == 'max') return maxOfArgs(args);
    if (name == 'between') return EvalValue.fromBool(
      args[0].numVal >= args[1].numVal && args[0].numVal <= args[2].numVal
    );

    // Aggregate
    if (name == 'sum') return sumArray(args);
    if (name == 'avg') return avgArray(args);
    if (name == 'min_of') return minOfArray(args);
    if (name == 'max_of') return maxOfArray(args);
    if (name == 'count_of') return countOfArray(args);
    if (name == 'filter') return filterArray(args);
    if (name == 'map') return mapArray(args);

    // Date (UTC)
    if (name == 'year') return EvalValue.fromNumber(new Date(args[0].numVal).getUTCFullYear());
    if (name == 'month') return EvalValue.fromNumber(new Date(args[0].numVal).getUTCMonth() + 1);
    if (name == 'day') return EvalValue.fromNumber(new Date(args[0].numVal).getUTCDate());
    if (name == 'hours') return EvalValue.fromNumber(new Date(args[0].numVal).getUTCHours());
    if (name == 'minutes') return EvalValue.fromNumber(new Date(args[0].numVal).getUTCMinutes());
    if (name == 'seconds') return EvalValue.fromNumber(new Date(args[0].numVal).getUTCSeconds());

    return EvalValue.undefinedValue();
  }

  private isCoreBuiltin(name: string): bool {
    return (
      name == 'now' || name == 'uuid' ||
      name == 'trim' || name == 'split' || name == 'count' ||
      name == 'startsWith' || name == 'endsWith' || name == 'replace' ||
      name == 'toUpperCase' || name == 'toLowerCase' || name == 'length' ||
      name == 'substring' || name == 'indexOf' || name == 'matches' ||
      name == 'abs' || name == 'round' || name == 'floor' || name == 'ceil' ||
      name == 'min' || name == 'max' || name == 'between' ||
      name == 'sum' || name == 'avg' || name == 'min_of' || name == 'max_of' ||
      name == 'count_of' || name == 'filter' || name == 'map' ||
      name == 'year' || name == 'month' || name == 'day' ||
      name == 'hours' || name == 'minutes' || name == 'seconds'
    );
  }
}

function trimStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  if (s.type != ValueType.STRING) return s;
  return EvalValue.fromString(s.strVal.trim());
}

function splitStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  const sep = args[1];
  if (s.type != ValueType.STRING) return s;
  const parts = s.strVal.split(sep.type == ValueType.STRING ? sep.strVal : '');
  const arr = new EvalValue(ValueType.ARRAY, false, 0, '', '');
  let json = '[';
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) json += ',';
    json += '"' + escapeJSON(parts[i]) + '"';
  }
  json += ']';
  arr.jsonVal = json;
  return arr;
}

function countVal(args: EvalValue[]): EvalValue {
  const v = args[0];
  if (v.type == ValueType.ARRAY) {
    // Count elements by walking JSON
    return EvalValue.fromNumber(countJSONArrayElements(v.jsonVal) as f64);
  }
  return v;
}

function countJSONArrayElements(json: string): i32 {
  if (json.length < 2) return 0;
  let count = 0;
  let pos = 1;
  let depth = 1;
  while (pos < json.length && depth > 0) {
    const c = json.charCodeAt(pos);
    if (c == 0x5B) depth++;
    else if (c == 0x5D) {
      depth--;
      if (depth == 0) break;
    } else if (depth == 1 && c != 0x20 && c != 0x09 && c != 0x0A && c != 0x0D && c != 0x2C) {
      count++;
      const end = findJSONEnd(json, pos);
      pos = end;
      continue;
    }
    pos++;
  }
  return count;
}

function startsWithStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  const prefix = args[1];
  if (s.type != ValueType.STRING || prefix.type != ValueType.STRING) return EvalValue.fromBool(false);
  return EvalValue.fromBool(s.strVal.startsWith(prefix.strVal));
}

function endsWithStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  const suffix = args[1];
  if (s.type != ValueType.STRING || suffix.type != ValueType.STRING) return EvalValue.fromBool(false);
  return EvalValue.fromBool(s.strVal.endsWith(suffix.strVal));
}

function replaceStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  const search = args[1];
  const replacement = args[2];
  if (s.type != ValueType.STRING || search.type != ValueType.STRING) return s;
  // Escape regex special characters in search pattern
  const escaped = escapeRegExp(search.strVal);
  const regex = new RegExp(escaped, 'g');
  return EvalValue.fromString(s.strVal.replace(regex, replacement.toStringValue()));
}

function escapeRegExp(s: string): string {
  let out = '';
  const specials = '\\^$.*+?()[]{}|';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (specials.indexOf(c) >= 0) out += '\\';
    out += c;
  }
  return out;
}

function toUpperCaseStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  if (s.type != ValueType.STRING) return s;
  return EvalValue.fromString(s.strVal.toUpperCase());
}

function toLowerCaseStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  if (s.type != ValueType.STRING) return s;
  return EvalValue.fromString(s.strVal.toLowerCase());
}

function lengthVal(args: EvalValue[]): EvalValue {
  const v = args[0];
  if (v.type == ValueType.STRING) return EvalValue.fromNumber(v.strVal.length as f64);
  if (v.type == ValueType.ARRAY) return EvalValue.fromNumber(countJSONArrayElements(v.jsonVal) as f64);
  return v;
}

function substringStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  if (s.type != ValueType.STRING) return s;
  const start = args[1].numVal as i32;
  if (args.length > 2) {
    const end = args[2].numVal as i32;
    return EvalValue.fromString(s.strVal.substring(start, end));
  }
  return EvalValue.fromString(s.strVal.substring(start));
}

function indexOfStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  const search = args[1];
  if (s.type != ValueType.STRING) return EvalValue.fromNumber(-1);
  const needle = search.type == ValueType.STRING ? search.strVal : search.toStringValue();
  return EvalValue.fromNumber(s.strVal.indexOf(needle) as f64);
}

function matchesStr(args: EvalValue[]): EvalValue {
  const s = args[0];
  const pattern = args[1];
  if (s.type != ValueType.STRING || pattern.type != ValueType.STRING) return EvalValue.fromBool(false);
  try {
    const re = new RegExp(pattern.strVal);
    return EvalValue.fromBool(re.test(s.strVal));
  } catch {
    return EvalValue.fromBool(false);
  }
}

function minOfArgs(args: EvalValue[]): EvalValue {
  if (args.length == 0) return EvalValue.undefinedValue();
  let result: f64 = args[0].numVal;
  for (let i = 1; i < args.length; i++) {
    if (args[i].numVal < result) result = args[i].numVal;
  }
  return EvalValue.fromNumber(result);
}

function maxOfArgs(args: EvalValue[]): EvalValue {
  if (args.length == 0) return EvalValue.undefinedValue();
  let result: f64 = args[0].numVal;
  for (let i = 1; i < args.length; i++) {
    if (args[i].numVal > result) result = args[i].numVal;
  }
  return EvalValue.fromNumber(result);
}

function sumArray(args: EvalValue[]): EvalValue {
  const arr = args[0];
  if (arr.type != ValueType.ARRAY) return arr;
  // Walk array, sum numeric elements (no mapper support in WASM core)
  let total: f64 = 0;
  let pos = 1;
  let depth = 1;
  const json = arr.jsonVal;
  while (pos < json.length && depth > 0) {
    const c = json.charCodeAt(pos);
    if (c == 0x5B) depth++;
    else if (c == 0x5D) {
      depth--;
      if (depth == 0) break;
    } else if (depth == 1 && c != 0x20 && c != 0x09 && c != 0x0A && c != 0x0D && c != 0x2C) {
      const valRes = parseRawJSONValue(json, pos);
      if (valRes !== null) {
        const elem = parseJSONValue(json, pos);
        if (elem !== null && elem.type == ValueType.NUMBER) {
          total += elem.numVal;
        }
        pos = valRes.next;
        continue;
      }
    }
    pos++;
  }
  return EvalValue.fromNumber(total);
}

function avgArray(args: EvalValue[]): EvalValue {
  const arr = args[0];
  if (arr.type != ValueType.ARRAY) return EvalValue.fromNumber(0);
  let total: f64 = 0;
  let count: i32 = 0;
  let pos = 1;
  let depth = 1;
  const json = arr.jsonVal;
  while (pos < json.length && depth > 0) {
    const c = json.charCodeAt(pos);
    if (c == 0x5B) depth++;
    else if (c == 0x5D) {
      depth--;
      if (depth == 0) break;
    } else if (depth == 1 && c != 0x20 && c != 0x09 && c != 0x0A && c != 0x0D && c != 0x2C) {
      const valRes = parseRawJSONValue(json, pos);
      if (valRes !== null) {
        const elem = parseJSONValue(json, pos);
        if (elem !== null && elem.type == ValueType.NUMBER) {
          total += elem.numVal;
          count++;
        }
        pos = valRes.next;
        continue;
      }
    }
    pos++;
  }
  return EvalValue.fromNumber(count > 0 ? total / (count as f64) : 0);
}

function minOfArray(args: EvalValue[]): EvalValue {
  const arr = args[0];
  if (arr.type != ValueType.ARRAY) return EvalValue.undefinedValue();
  let result: f64 = 0;
  let found = false;
  let pos = 1;
  let depth = 1;
  const json = arr.jsonVal;
  while (pos < json.length && depth > 0) {
    const c = json.charCodeAt(pos);
    if (c == 0x5B) depth++;
    else if (c == 0x5D) {
      depth--;
      if (depth == 0) break;
    } else if (depth == 1 && c != 0x20 && c != 0x09 && c != 0x0A && c != 0x0D && c != 0x2C) {
      const valRes = parseRawJSONValue(json, pos);
      if (valRes !== null) {
        const elem = parseJSONValue(json, pos);
        if (elem !== null && elem.type == ValueType.NUMBER) {
          if (!found || elem.numVal < result) {
            result = elem.numVal;
            found = true;
          }
        }
        pos = valRes.next;
        continue;
      }
    }
    pos++;
  }
  return found ? EvalValue.fromNumber(result) : EvalValue.undefinedValue();
}

function maxOfArray(args: EvalValue[]): EvalValue {
  const arr = args[0];
  if (arr.type != ValueType.ARRAY) return EvalValue.undefinedValue();
  let result: f64 = 0;
  let found = false;
  let pos = 1;
  let depth = 1;
  const json = arr.jsonVal;
  while (pos < json.length && depth > 0) {
    const c = json.charCodeAt(pos);
    if (c == 0x5B) depth++;
    else if (c == 0x5D) {
      depth--;
      if (depth == 0) break;
    } else if (depth == 1 && c != 0x20 && c != 0x09 && c != 0x0A && c != 0x0D && c != 0x2C) {
      const valRes = parseRawJSONValue(json, pos);
      if (valRes !== null) {
        const elem = parseJSONValue(json, pos);
        if (elem !== null && elem.type == ValueType.NUMBER) {
          if (!found || elem.numVal > result) {
            result = elem.numVal;
            found = true;
          }
        }
        pos = valRes.next;
        continue;
      }
    }
    pos++;
  }
  return found ? EvalValue.fromNumber(result) : EvalValue.undefinedValue();
}

function countOfArray(args: EvalValue[]): EvalValue {
  const arr = args[0];
  if (arr.type != ValueType.ARRAY) return EvalValue.fromNumber(0);
  return EvalValue.fromNumber(countJSONArrayElements(arr.jsonVal) as f64);
}

function filterArray(args: EvalValue[]): EvalValue {
  // WASM core doesn't support lambda mappers; return array unchanged.
  return args[0];
}

function mapArray(args: EvalValue[]): EvalValue {
  return args[0];
}

// ============================================================================
// Expression Evaluator (recursive, async-equivalent via Promise.resolve)
// ============================================================================

/**
 * Evaluate an expression in the given context.
 * This is the core entry point. It returns a plain JS-friendly value.
 */
export function evaluateExpression(
  exprJson: string,
  contextJson: string,
  builtins: BuiltinRegistry
): EvalValue {
  const expr = parseExpression(exprJson, 0);
  if (expr === null) return EvalValue.undefinedValue();
  const ctx = buildContextFromJSON(contextJson);
  return evaluateNode(expr, ctx, builtins);
}

/**
 * Evaluate an expression and return a JSON-serializable result.
 * This is the main WASM export.
 */
export function evaluateExpressionJSON(
  exprJson: string,
  contextJson: string,
  builtins: BuiltinRegistry
): string {
  const result = evaluateExpression(exprJson, contextJson, builtins);
  return valueToJSON(result);
}

/**
 * Evaluate a constraint expression. A constraint is positive by default
 * (expression must be true to pass). Constraint names starting with
 * "severity" are negative: expression being true means bad state.
 *
 * Returns: 'pass' or 'fail'
 */
export function evaluateConstraint(
  exprJson: string,
  contextJson: string,
  constraintName: string,
  builtins: BuiltinRegistry
): string {
  const result = evaluateExpression(exprJson, contextJson, builtins);
  const negative = constraintName.startsWith('severity');
  const passed = negative ? !result.isTruthy() : result.isTruthy();
  return passed ? 'pass' : 'fail';
}

// ============================================================================
// Expression parsing (simple JSON shape matching IRExpression)
// ============================================================================

class ExprNode {
  kind: string = '';
  strVal: string = '';
  numVal: f64 = 0;
  boolVal: bool = false;
  isNull: bool = false;
  // subexpressions / structure
  left: ExprNode | null = null;
  right: ExprNode | null = null;
  operand: ExprNode | null = null;
  object: ExprNode | null = null;
  callee: ExprNode | null = null;
  condition: ExprNode | null = null;
  consequent: ExprNode | null = null;
  alternate: ExprNode | null = null;
  // collections
  elements: ExprNode[] = new Array<ExprNode>();
  args: ExprNode[] = new Array<ExprNode>();
  params: string[] = new Array<string>();
  properties: Map<string, ExprNode> = new Map<string, ExprNode>();
}

function parseExpression(input: string, pos: i32): ExprNode | null {
  if (pos >= input.length) return null;
  skipWhitespace(input, pos);
  const c = input.charCodeAt(pos);
  if (c != 0x7B) return null;
  return parseExprObject(input, pos);
}

function parseExprObject(input: string, pos: i32): ExprNode | null {
  // input[pos] === '{'
  pos++;
  let depth = 1;
  let inString = false;
  let escape = false;
  while (pos < input.length && depth > 0) {
    const c = input.charCodeAt(pos);
    if (escape) { escape = false; pos++; continue; }
    if (inString) {
      if (c == 0x5C) escape = true;
      else if (c == 0x22) inString = false;
      pos++;
      continue;
    }
    if (c == 0x22) { inString = true; pos++; continue; }
    if (c == 0x7B) { depth++; pos++; continue; }
    if (c == 0x7D) { depth--; pos++; break; }
    pos++;
  }
  if (depth != 0) return null;
  // The simple regex-free parser above is intentionally minimal because
  // expression structure is consumed via the structured helpers below.
  return parseFullExpr(input, 0);
}

function parseFullExpr(input: string, _pos: i32): ExprNode | null {
  // Use a state machine: read "kind": "...", then read the corresponding field.
  let pos = 0;
  skipWhitespace(input, pos);
  if (pos >= input.length || input.charCodeAt(pos) != 0x7B) return null;
  pos++;
  skipWhitespace(input, pos);
  const kindRes = parseStringField(input, pos);
  if (kindRes === null) return null;
  pos = kindRes.next;
  const kind = kindRes.str;
  const node = new ExprNode();
  node.kind = kind;
  // Parse remaining fields
  while (pos < input.length) {
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x7D) {
      pos++;
      break;
    }
    if (pos < input.length && input.charCodeAt(pos) == 0x2C) {
      pos++;
      continue;
    }
    const fieldRes = parseStringField(input, pos);
    if (fieldRes === null) return null;
    pos = fieldRes.next;
    skipWhitespace(input, pos);
    if (pos >= input.length || input.charCodeAt(pos) != 0x3A) return null;
    pos++;
    skipWhitespace(input, pos);
    // Read the value
    const valStart = pos;
    // Determine end of value
    const valEnd = findJSONEnd(input, valStart);
    if (valEnd <= valStart) return null;
    const valJson = input.substring(valStart, valEnd);
    pos = valEnd;
    applyField(node, fieldRes.str, valJson);
  }
  return node;
}

class StringField {
  str: string = '';
  next: i32 = 0;
}

function parseStringField(input: string, pos: i32): StringField | null {
  skipWhitespace(input, pos);
  if (pos >= input.length || input.charCodeAt(pos) != 0x22) return null;
  const res = parseRawJSONString(input, pos);
  if (res === null) return null;
  const r = new StringField();
  r.str = res.str;
  r.next = res.next;
  return r;
}

function applyField(node: ExprNode, field: string, valJson: string): void {
  if (field == 'kind') {
    node.kind = valJson.replace(/^"|"$/g, '');
    return;
  }
  if (field == 'name' || field == 'operator' || field == 'property') {
    node.strVal = valJson.replace(/^"|"$/g, '');
    return;
  }
  if (field == 'value') {
    // Could be a literal IRValue
    const ev = parseJSONValue(valJson, 0);
    if (ev !== null) {
      if (ev.type == ValueType.STRING) {
        node.kind = 'literal-string';
        node.strVal = ev.strVal;
      } else if (ev.type == ValueType.NUMBER) {
        node.kind = 'literal-number';
        node.numVal = ev.numVal;
      } else if (ev.type == ValueType.BOOLEAN) {
        node.kind = 'literal-boolean';
        node.boolVal = ev.boolVal;
      } else if (ev.type == ValueType.NULL) {
        node.kind = 'literal-null';
      }
    }
    return;
  }
  if (field == 'left' || field == 'right') {
    const child = parseFullExpr(valJson, 0);
    if (child !== null) {
      if (field == 'left') node.left = child;
      else node.right = child;
    }
    return;
  }
  if (field == 'operand' || field == 'object' || field == 'callee' ||
      field == 'condition' || field == 'consequent' || field == 'alternate') {
    const child = parseFullExpr(valJson, 0);
    if (child !== null) {
      if (field == 'operand') node.operand = child;
      else if (field == 'object') node.object = child;
      else if (field == 'callee') node.callee = child;
      else if (field == 'condition') node.condition = child;
      else if (field == 'consequent') node.consequent = child;
      else if (field == 'alternate') node.alternate = child;
    }
    return;
  }
  if (field == 'args' || field == 'elements') {
    if (valJson.charCodeAt(0) == 0x5B) {
      const arr = parseExprArray(valJson);
      if (arr !== null) {
        if (field == 'args') node.args = arr;
        else node.elements = arr;
      }
    }
    return;
  }
  if (field == 'params') {
    if (valJson.charCodeAt(0) == 0x5B) {
      const params = parseStringArray(valJson);
      if (params !== null) node.params = params;
    }
    return;
  }
  if (field == 'properties') {
    if (valJson.charCodeAt(0) == 0x5B) {
      const props = parseObjectProperties(valJson);
      if (props !== null) node.properties = props;
    }
    return;
  }
}

function parseExprArray(input: string): ExprNode[] | null {
  // input is '[ expr, expr, ... ]'
  const result = new Array<ExprNode>();
  let pos = 1;
  while (pos < input.length) {
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x5D) break;
    const valStart = pos;
    const valEnd = findJSONEnd(input, valStart);
    if (valEnd <= valStart) return null;
    const valJson = input.substring(valStart, valEnd);
    const child = parseFullExpr(valJson, 0);
    if (child !== null) result.push(child);
    pos = valEnd;
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x2C) pos++;
  }
  return result;
}

function parseStringArray(input: string): string[] | null {
  const result = new Array<string>();
  let pos = 1;
  while (pos < input.length) {
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x5D) break;
    if (pos >= input.length || input.charCodeAt(pos) != 0x22) return null;
    const res = parseRawJSONString(input, pos);
    if (res === null) return null;
    result.push(res.str);
    pos = res.next;
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x2C) pos++;
  }
  return result;
}

function parseObjectProperties(input: string): Map<string, ExprNode> | null {
  const result = new Map<string, ExprNode>();
  // input is '[ { "key": "...", "value": <expr> }, ... ]'
  let pos = 1;
  while (pos < input.length) {
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x5D) break;
    if (pos >= input.length || input.charCodeAt(pos) != 0x7B) return null;
    const objStart = pos;
    const objEnd = findJSONEnd(input, objStart);
    if (objEnd <= objStart) return null;
    const objJson = input.substring(objStart, objEnd);
    // Parse key and value
    let innerPos = 1;
    let key: string = '';
    let valueJson: string = '';
    while (innerPos < objJson.length) {
      skipWhitespace(objJson, innerPos);
      if (innerPos < objJson.length && objJson.charCodeAt(innerPos) == 0x7D) break;
      const fieldRes = parseStringField(objJson, innerPos);
      if (fieldRes === null) return null;
      innerPos = fieldRes.next;
      skipWhitespace(objJson, innerPos);
      if (innerPos >= objJson.length || objJson.charCodeAt(innerPos) != 0x3A) return null;
      innerPos++;
      skipWhitespace(objJson, innerPos);
      const valStart = innerPos;
      const valEnd = findJSONEnd(objJson, valStart);
      if (valEnd <= valStart) return null;
      if (fieldRes.str == 'key') {
        key = objJson.substring(valStart, valEnd).replace(/^"|"$/g, '');
      } else if (fieldRes.str == 'value') {
        valueJson = objJson.substring(valStart, valEnd);
      }
      innerPos = valEnd;
      skipWhitespace(objJson, innerPos);
      if (innerPos < objJson.length && objJson.charCodeAt(innerPos) == 0x2C) innerPos++;
    }
    if (key.length > 0 && valueJson.length > 0) {
      const child = parseFullExpr(valueJson, 0);
      if (child !== null) result.set(key, child);
    }
    pos = objEnd;
    skipWhitespace(input, pos);
    if (pos < input.length && input.charCodeAt(pos) == 0x2C) pos++;
  }
  return result;
}

// ============================================================================
// Evaluation
// ============================================================================

function evaluateNode(node: ExprNode, ctx: EvalContext, builtins: BuiltinRegistry): EvalValue {
  switch (node.kind) {
    case 'literal-string':
      return EvalValue.fromString(node.strVal);
    case 'literal-number':
      return EvalValue.fromNumber(node.numVal);
    case 'literal-boolean':
      return EvalValue.fromBool(node.boolVal);
    case 'literal-null':
      return EvalValue.nullValue();
    case 'literal':
      // Generic literal (fallback)
      return EvalValue.nullValue();
    case 'identifier': {
      const name = node.strVal;
      if (ctx.has(name)) {
        return ctx.get(name);
      }
      if (name == 'true') return EvalValue.fromBool(true);
      if (name == 'false') return EvalValue.fromBool(false);
      if (name == 'null') return EvalValue.nullValue();
      return EvalValue.undefinedValue();
    }
    case 'member': {
      if (node.object === null) return EvalValue.undefinedValue();
      const obj = evaluateNode(node.object, ctx, builtins);
      if (obj.type == ValueType.OBJECT) {
        // Look up property in the JSON object
        const propValue = getObjectProperty(obj.jsonVal, node.strVal);
        if (propValue !== null) return propValue;
      }
      if (obj.type == ValueType.ARRAY) {
        // Numeric index access
        const idx = I32.parseInt(node.strVal);
        if (!isNaN(idx)) {
          const elem = getArrayElement(obj.jsonVal, idx);
          if (elem !== null) return elem;
        }
      }
      return EvalValue.undefinedValue();
    }
    case 'binary': {
      if (node.left === null || node.right === null) return EvalValue.undefinedValue();
      const left = evaluateNode(node.left, ctx, builtins);
      const right = evaluateNode(node.right, ctx, builtins);
      return evaluateBinaryOp(node.strVal, left, right);
    }
    case 'unary': {
      if (node.operand === null) return EvalValue.undefinedValue();
      const operand = evaluateNode(node.operand, ctx, builtins);
      if (node.strVal == '!' || node.strVal == 'not') {
        return EvalValue.fromBool(!operand.isTruthy());
      }
      if (node.strVal == '-') {
        return EvalValue.fromNumber(-operand.numVal);
      }
      return operand;
    }
    case 'call': {
      // Built-in function call
      if (node.callee !== null && node.callee.kind == 'identifier' && builtins.has(node.callee.strVal)) {
        const args = new Array<EvalValue>();
        for (let i = 0; i < node.args.length; i++) {
          args.push(evaluateNode(node.args[i], ctx, builtins));
        }
        return builtins.call(node.callee.strVal, args);
      }
      // Array methods
      if (node.callee !== null && node.callee.kind == 'member' && node.callee.object !== null) {
        const arr = evaluateNode(node.callee.object, ctx, builtins);
        if (arr.type == ValueType.ARRAY) {
          if (node.callee.strVal == 'contains' && node.args.length > 0) {
            const needle = evaluateNode(node.args[0], ctx, builtins);
            return EvalValue.fromBool(arrayIncludes(arr.jsonVal, needle));
          }
        }
      }
      return EvalValue.undefinedValue();
    }
    case 'conditional': {
      if (node.condition === null || node.consequent === null || node.alternate === null) {
        return EvalValue.undefinedValue();
      }
      const cond = evaluateNode(node.condition, ctx, builtins);
      if (cond.isTruthy()) {
        return evaluateNode(node.consequent, ctx, builtins);
      }
      return evaluateNode(node.alternate, ctx, builtins);
    }
    case 'array': {
      const arr = new EvalValue(ValueType.ARRAY, false, 0, '', '');
      let json = '[';
      for (let i = 0; i < node.elements.length; i++) {
        if (i > 0) json += ',';
        const v = evaluateNode(node.elements[i], ctx, builtins);
        json += valueToJSON(v);
      }
      json += ']';
      arr.jsonVal = json;
      return arr;
    }
    case 'object': {
      const obj = new EvalValue(ValueType.OBJECT, false, 0, '', '');
      let json = '{';
      const keys = node.properties.keys();
      let first = true;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!first) json += ',';
        const v = evaluateNode(node.properties.get(k), ctx, builtins);
        json += '"' + escapeJSON(k) + '":' + valueToJSON(v);
        first = false;
      }
      json += '}';
      obj.jsonVal = json;
      return obj;
    }
    case 'lambda':
      // Lambdas not supported in WASM core; return undefined.
      return EvalValue.undefinedValue();
    default:
      return EvalValue.undefinedValue();
  }
}

function valueToJSON(v: EvalValue): string {
  switch (v.type) {
    case ValueType.NULL: return 'null';
    case ValueType.UNDEFINED: return 'null';
    case ValueType.BOOLEAN: return v.boolVal ? 'true' : 'false';
    case ValueType.NUMBER: return v.numVal.toString();
    case ValueType.STRING: return '"' + escapeJSON(v.strVal) + '"';
    case ValueType.ARRAY: return v.jsonVal.length > 0 ? v.jsonVal : '[]';
    case ValueType.OBJECT: return v.jsonVal.length > 0 ? v.jsonVal : '{}';
    default: return 'null';
  }
}

function getObjectProperty(json: string, prop: string): EvalValue | null {
  // json is '{...}'
  if (json.length < 2 || json.charCodeAt(0) != 0x7B) return null;
  let pos = 1;
  while (pos < json.length) {
    skipWhitespace(json, pos);
    if (pos < json.length && json.charCodeAt(pos) == 0x7D) return null;
    if (pos >= json.length || json.charCodeAt(pos) != 0x22) return null;
    const keyRes = parseRawJSONString(json, pos);
    if (keyRes === null) return null;
    pos = keyRes.next;
    skipWhitespace(json, pos);
    if (pos >= json.length || json.charCodeAt(pos) != 0x3A) return null;
    pos++;
    skipWhitespace(json, pos);
    const valStart = pos;
    const valEnd = findJSONEnd(json, valStart);
    if (valEnd <= valStart) return null;
    if (keyRes.str == prop) {
      return parseJSONValue(json.substring(valStart, valEnd), 0);
    }
    pos = valEnd;
    skipWhitespace(json, pos);
    if (pos < json.length && json.charCodeAt(pos) == 0x2C) pos++;
  }
  return null;
}

function getArrayElement(json: string, index: i32): EvalValue | null {
  if (json.length < 2 || json.charCodeAt(0) != 0x5B) return null;
  let pos = 1;
  let current: i32 = 0;
  while (pos < json.length) {
    skipWhitespace(json, pos);
    if (pos < json.length && json.charCodeAt(pos) == 0x5D) return null;
    const valStart = pos;
    const valEnd = findJSONEnd(json, valStart);
    if (valEnd <= valStart) return null;
    if (current == index) {
      return parseJSONValue(json.substring(valStart, valEnd), 0);
    }
    current++;
    pos = valEnd;
    skipWhitespace(json, pos);
    if (pos < json.length && json.charCodeAt(pos) == 0x2C) pos++;
  }
  return null;
}

function buildContextFromJSON(contextJson: string): EvalContext {
  const ctx = new EvalContext();
  if (contextJson.length == 0) return ctx;
  // Walk top-level object keys and store each as an EvalValue
  let pos = 0;
  skipWhitespace(contextJson, pos);
  if (pos >= contextJson.length) return ctx;
  if (contextJson.charCodeAt(pos) != 0x7B) return ctx;
  pos++;
  while (pos < contextJson.length) {
    skipWhitespace(contextJson, pos);
    if (pos < contextJson.length && contextJson.charCodeAt(pos) == 0x7D) break;
    if (pos >= contextJson.length || contextJson.charCodeAt(pos) != 0x22) return ctx;
    const keyRes = parseRawJSONString(contextJson, pos);
    if (keyRes === null) return ctx;
    pos = keyRes.next;
    skipWhitespace(contextJson, pos);
    if (pos >= contextJson.length || contextJson.charCodeAt(pos) != 0x3A) return ctx;
    pos++;
    skipWhitespace(contextJson, pos);
    const valStart = pos;
    const valEnd = findJSONEnd(contextJson, valStart);
    if (valEnd <= valStart) return ctx;
    const val = parseJSONValue(contextJson.substring(valStart, valEnd), 0);
    if (val !== null) ctx.set(keyRes.str, val);
    pos = valEnd;
    skipWhitespace(contextJson, pos);
    if (pos < contextJson.length && contextJson.charCodeAt(pos) == 0x2C) pos++;
  }
  return ctx;
}

// ============================================================================
// Exports
// ============================================================================

// Host-provided callbacks (set by JavaScript at module init)
let hostNow: () => f64 = () => 0;
let hostUuid: () => string = () => '';

// Default builtins registry
const defaultRegistry = new BuiltinRegistry(() => hostNow(), () => hostUuid());

/**
 * WASM export: evaluate expression and return JSON.
 * Inputs: expression JSON, context JSON.
 * Output: result as JSON string.
 */
export function evalExpr(exprJson: string, contextJson: string): string {
  return evaluateExpressionJSON(exprJson, contextJson, defaultRegistry);
}

/**
 * WASM export: evaluate constraint.
 * Returns: 'pass' or 'fail'.
 */
export function evalConstraint(exprJson: string, contextJson: string, name: string): string {
  return evaluateConstraint(exprJson, contextJson, name, defaultRegistry);
}

/**
 * Set host-provided now() callback.
 */
export function setNowProvider(fn: () => f64): void {
  hostNow = fn;
}

/**
 * Set host-provided uuid() callback.
 */
export function setUuidProvider(fn: () => string): void {
  hostUuid = fn;
}

/**
 * Return the assemblyscript runtime version.
 */
export function version(): string {
  return '1.0.0';
}
