/**
 * Top-level object-literal key scanning for wiring inspect.
 * Recognizes both `name: value` and ES property shorthand `name`.
 * Does not treat identifiers nested inside property values as keys.
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
      const afterName = skipWs(objectLiteral, i);

      if (objectLiteral[afterName] === ':') {
        const valueStart = skipWs(objectLiteral, afterName + 1);
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
  const keys: ObjectLiteralKey[] = [];
  const re = /\b([A-Za-z_][\w]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(objectLiteral)) !== null) {
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

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i++;
  return i;
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
