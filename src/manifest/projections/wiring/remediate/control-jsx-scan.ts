/**
 * Brace-aware JSX button scanning for wire-existing-control.
 * `=>` inside onClick must not truncate attribute parsing.
 */

export interface JsxButtonMatch {
  full: string;
  attrs: string;
  body: string;
  index: number;
}

export function findJsxButtons(content: string): JsxButtonMatch[] {
  const out: JsxButtonMatch[] = [];
  const startRe = /<(button|Button)\b/g;
  let start: RegExpExecArray | null;
  while ((start = startRe.exec(content)) !== null) {
    const tag = start[1]!;
    const openStart = start.index;
    const afterName = openStart + start[0].length;
    const openEnd = findJsxTagEnd(content, afterName);
    if (openEnd < 0) continue;
    const attrs = content.slice(afterName, openEnd);
    const closeTag = `</${tag}>`;
    const closeIdx = content.indexOf(closeTag, openEnd + 1);
    if (closeIdx < 0) continue;
    const inner = content.slice(openEnd + 1, closeIdx);
    const full = content.slice(openStart, closeIdx + closeTag.length);
    const body = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ full, attrs, body, index: openStart });
    startRe.lastIndex = closeIdx + closeTag.length;
  }
  return out;
}

function findJsxTagEnd(content: string, from: number): number {
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  for (let i = from; i < content.length; i++) {
    const ch = content[i]!;
    if (quote) {
      if (ch === '\\' && quote !== '`') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === '>' && depth === 0) return i;
  }
  return -1;
}
