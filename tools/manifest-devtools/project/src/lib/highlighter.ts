interface Token {
  type: 'keyword' | 'string' | 'number' | 'operator' | 'comment' | 'punctuation' | 'identifier' | 'whitespace';
  text: string;
}

const KEYWORDS = new Set([
  'when', 'guard', 'and', 'or', 'not', 'true', 'false', 'null',
  'fn', 'def', 'let', 'val', 'if', 'else', 'return', 'match',
  'typeof', 'isEmpty', 'contains', 'startsWith', 'endsWith',
  'import', 'export', 'from', 'as', 'type',
]);

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '/') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = code.length;
      tokens.push({ type: 'comment', text: code.slice(i, end) });
      i = end;
      continue;
    }

    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      let end = i + 1;
      while (end < code.length && code[end] !== quote) {
        if (code[end] === '\\') end++;
        end++;
      }
      end = Math.min(end + 1, code.length);
      tokens.push({ type: 'string', text: code.slice(i, end) });
      i = end;
      continue;
    }

    if (/\d/.test(code[i])) {
      let end = i;
      while (end < code.length && /[\d.]/.test(code[end])) end++;
      tokens.push({ type: 'number', text: code.slice(i, end) });
      i = end;
      continue;
    }

    if (/[a-zA-Z_]/.test(code[i])) {
      let end = i;
      while (end < code.length && /[a-zA-Z_0-9]/.test(code[end])) end++;
      const word = code.slice(i, end);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'identifier', text: word });
      i = end;
      continue;
    }

    if (i + 1 < code.length && '=!<>'.includes(code[i]) && code[i + 1] === '=') {
      tokens.push({ type: 'operator', text: code.slice(i, i + 2) });
      i += 2;
      continue;
    }

    if ('=!<>+-*/%&|^~'.includes(code[i])) {
      tokens.push({ type: 'operator', text: code[i] });
      i++;
      continue;
    }

    if ('(){}[],.;:'.includes(code[i])) {
      tokens.push({ type: 'punctuation', text: code[i] });
      i++;
      continue;
    }

    if (/\s/.test(code[i])) {
      let end = i;
      while (end < code.length && /\s/.test(code[end])) end++;
      tokens.push({ type: 'whitespace', text: code.slice(i, end) });
      i = end;
      continue;
    }

    tokens.push({ type: 'identifier', text: code[i] });
    i++;
  }

  return tokens;
}

const COLOR_MAP: Record<Token['type'], string> = {
  keyword: 'text-cyan-400',
  string: 'text-amber-300',
  number: 'text-emerald-400',
  operator: 'text-slate-400',
  comment: 'text-slate-600 italic',
  punctuation: 'text-slate-500',
  identifier: 'text-slate-200',
  whitespace: '',
};

export function highlightCode(code: string): string {
  const tokens = tokenize(code);
  return tokens
    .map((token) => {
      const escaped = token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const cls = COLOR_MAP[token.type];
      if (!cls) return escaped;
      return `<span class="${cls}">${escaped}</span>`;
    })
    .join('');
}
