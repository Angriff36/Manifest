const KEYWORDS = ['entity', 'property', 'behavior', 'constraint', 'flow', 'effect', 'expose', 'compose', 'command', 'module', 'policy', 'store', 'event', 'computed', 'derived', 'hasMany', 'hasOne', 'belongsTo', 'ref', 'through', 'on', 'when', 'then', 'emit', 'mutate', 'compute', 'guard', 'publish', 'persist', 'as', 'from', 'to', 'with', 'where', 'connect', 'returns', 'string', 'number', 'boolean', 'list', 'map', 'any', 'void', 'true', 'false', 'null', 'required', 'unique', 'indexed', 'private', 'readonly', 'optional', 'rest', 'graphql', 'websocket', 'function', 'server', 'http', 'storage', 'timer', 'custom', 'memory', 'postgres', 'supabase', 'localStorage', 'read', 'write', 'delete', 'execute', 'all', 'allow', 'deny', 'and', 'or', 'not', 'is', 'in', 'contains', 'user', 'self', 'context'];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlight(code: string, lang: 'manifest' | 'ts' | 'json'): string {
  const escaped = escapeHtml(code);
  const tokens: { start: number; end: number; className: string }[] = [];

  const addTokens = (regex: RegExp, className: string) => {
    let match;
    while ((match = regex.exec(escaped)) !== null) {
      tokens.push({ start: match.index, end: match.index + match[0].length, className });
    }
  };

  addTokens(/(\/\/[^\n]*)/g, 'text-gray-500');
  addTokens(/(\/\*[\s\S]*?\*\/)/g, 'text-gray-500');
  addTokens(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, 'text-amber-400');
  addTokens(/\b(\d+\.?\d*)\b/g, 'text-cyan-400');

  if (lang === 'manifest') {
    const kwRegex = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');
    addTokens(kwRegex, 'text-sky-400 font-medium');
    addTokens(/\b([A-Z][a-zA-Z0-9]*)\b/g, 'text-emerald-400');
  } else if (lang === 'ts') {
    const tsKw = ['class', 'interface', 'type', 'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'new', 'this', 'extends', 'export', 'import', 'async', 'await', 'try', 'catch', 'throw', 'private', 'public', 'get', 'set', 'implements'];
    addTokens(new RegExp(`\\b(${tsKw.join('|')})\\b`, 'g'), 'text-sky-400 font-medium');
    addTokens(/\b(string|number|boolean|any|void|null|undefined|true|false|Promise)\b/g, 'text-orange-400');
  } else {
    // JSON: highlight keys and values
    addTokens(/\b(true|false|null)\b/g, 'text-orange-400');
  }

  tokens.sort((a, b) => a.start - b.start);

  const filtered: typeof tokens = [];
  for (const token of tokens) {
    const overlaps = filtered.some(t =>
      (token.start >= t.start && token.start < t.end) ||
      (token.end > t.start && token.end <= t.end)
    );
    if (!overlaps) {
      filtered.push(token);
    }
  }

  let result = '';
  let pos = 0;
  for (const token of filtered) {
    if (token.start > pos) {
      result += escaped.slice(pos, token.start);
    }
    result += `<span class="${token.className}">${escaped.slice(token.start, token.end)}</span>`;
    pos = token.end;
  }
  result += escaped.slice(pos);

  return result;
}
