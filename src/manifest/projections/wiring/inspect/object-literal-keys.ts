/**
 * Top-level object-literal key scanning for wiring inspect.
 * Recognizes both `name: value` and ES property shorthand `name`.
 * Does not treat identifiers nested inside property values as keys.
 * Ignores line (`//`) and block comments so comment text cannot fabricate keys.
 */

export interface ObjectLiteralKey {
  name: string;
  /** True when written as ES shorthand (`dropOff` not `dropOff: dropOff`). */
  shorthand: boolean;
  /** Start index of the value expression (same as name start for shorthand). */
  valueStart: number;
  /** End index (exclusive) of the value expression. */
  valueEnd: number;
}

export function scanObjectLiteralKeys(objectLiteral: string): ObjectLiteralKey[] {
  const open = objectLiteral.indexOf('{');
  if (open < 0) return scanColonOnlyKeys(objectLiteral);

  const keys: ObjectLiteralKey[] = [];
  let i = open + 1;
  let depthBrace = 0;
  let depthParen = 0;
  let depthBracket = 0;
  let inStr: string | null = null;

  const atTopLevel = () =>
    depthBrace === 0 && depthParen === 0 && depthBracket === 0;

  while (i < objectLiteral.length) {
    const ch = objectLiteral[i]!;

    if (inStr) {
      if (ch === inStr && objectLiteral[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }

    // Comments never contribute keys, nesting, or value terminators.
    const afterComment = skipComment(objectLiteral, i);
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '{') {
      depthBrace++;
      i++;
      continue;
    }
    if (ch === '}') {
      if (atTopLevel()) break;
      depthBrace--;
      i++;
      continue;
    }
    if (ch === '(') {
      depthParen++;
      i++;
      continue;
    }
    if (ch === ')') {
      depthParen--;
      i++;
      continue;
    }
    if (ch === '[') {
      depthBracket++;
      i++;
      continue;
    }
    if (ch === ']') {
      depthBracket--;
      i++;
      continue;
    }

    if (!atTopLevel()) {
      i++;
      continue;
    }

    if (ch === ',' || /\s/.test(ch)) {
      i++;
      continue;
    }

    // Spread: ...expr — skip until next top-level comma/}
    if (ch === '.' && objectLiteral.slice(i, i + 3) === '...') {
      i = skipTopLevelValue(objectLiteral, i + 3);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const nameStart = i;
      i++;
      while (i < objectLiteral.length && /[\w]/.test(objectLiteral[i]!)) i++;
      const name = objectLiteral.slice(nameStart, i);
      const afterName = skipWsAndComments(objectLiteral, i);

      if (objectLiteral[afterName] === ':') {
        const valueStart = skipWsAndComments(objectLiteral, afterName + 1);
        const valueEnd = skipTopLevelValue(objectLiteral, valueStart);
        keys.push({ name, shorthand: false, valueStart, valueEnd });
        i = valueEnd;
        continue;
      }

      // Shorthand: ident followed by `,` or `}`
      if (
        objectLiteral[afterName] === ',' ||
        objectLiteral[afterName] === '}'
      ) {
        keys.push({
          name,
          shorthand: true,
          valueStart: nameStart,
          valueEnd: nameStart + name.length,
        });
        i = afterName;
        continue;
      }

      continue;
    }

    i++;
  }

  return keys;
}

function scanColonOnlyKeys(objectLiteral: string): ObjectLiteralKey[] {
  // Strip comments first so `// ms:` cannot fabricate colon-form keys.
  const cleaned = stripCommentsForColonScan(objectLiteral);
  const keys: ObjectLiteralKey[] = [];
  const re = /\b([A-Za-z_][\w]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const name = m[1]!;
    const valueStart = m.index + m[0].length;
    keys.push({
      name,
      shorthand: false,
      valueStart,
      valueEnd: valueStart,
    });
  }
  return keys;
}

/**
 * Advance past a `//` or block comment starting at `i`.
 * Returns `i` unchanged when no comment starts there.
 */
export function skipComment(s: string, i: number): number {
  if (s[i] !== '/') return i;
  const next = s[i + 1];
  if (next === '/') {
    i += 2;
    while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
    return i;
  }
  if (next === '*') {
    i += 2;
    while (i < s.length) {
      if (s[i] === '*' && s[i + 1] === '/') return i + 2;
      i++;
    }
    return i;
  }
  return i;
}

function skipWsAndComments(s: string, i: number): number {
  while (i < s.length) {
    if (/\s/.test(s[i]!)) {
      i++;
      continue;
    }
    const after = skipComment(s, i);
    if (after !== i) {
      i = after;
      continue;
    }
    break;
  }
  return i;
}

/** Replace comment spans with spaces (preserve indices for colon-only path). */
function stripCommentsForColonScan(s: string): string {
  const out: string[] = [];
  let i = 0;
  let inStr: string | null = null;
  while (i < s.length) {
    const ch = s[i]!;
    if (inStr) {
      out.push(ch);
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out.push(ch);
      i++;
      continue;
    }
    const after = skipComment(s, i);
    if (after !== i) {
      while (i < after) {
        out.push(s[i] === '\n' || s[i] === '\r' ? s[i]! : ' ');
        i++;
      }
      continue;
    }
    out.push(ch);
    i++;
  }
  return out.join('');
}

/** Advance from value start to the next top-level `,` or `}` (exclusive). */
function skipTopLevelValue(s: string, start: number): number {
  let i = start;
  let depthBrace = 0;
  let depthParen = 0;
  let depthBracket = 0;
  let inStr: string | null = null;
  while (i < s.length) {
    const ch = s[i]!;
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    const afterComment = skipComment(s, i);
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '{') depthBrace++;
    else if (ch === '}') {
      if (depthBrace === 0 && depthParen === 0 && depthBracket === 0) return i;
      depthBrace--;
    } else if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket--;
    else if (
      (ch === ',' || ch === '}') &&
      depthBrace === 0 &&
      depthParen === 0 &&
      depthBracket === 0
    ) {
      return i;
    }
    i++;
  }
  return i;
}

export function extractObjectFieldNames(objectLiteral: string): string[] {
  const fields: string[] = [];
  for (const key of scanObjectLiteralKeys(objectLiteral)) {
    if (key.name === 'data' || key.name === 'where' || key.name === 'select') {
      continue;
    }
    fields.push(key.name);
  }
  return [...new Set(fields)];
}

/** True when `key` is a top-level property (explicit `key:` or shorthand `key`). */
export function objectLiteralHasKey(objectLiteral: string, key: string): boolean {
  return scanObjectLiteralKeys(objectLiteral).some(k => k.name === key);
}

/**
 * Value expression for a top-level field. Shorthand resolves to the identifier.
 */
export function readObjectLiteralFieldExpression(
  objectLiteral: string,
  key: string,
): string | undefined {
  const hit = scanObjectLiteralKeys(objectLiteral).find(k => k.name === key);
  if (!hit) return undefined;
  if (hit.shorthand) return hit.name;
  return objectLiteral.slice(hit.valueStart, hit.valueEnd).trim();
}
