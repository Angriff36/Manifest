import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { ManifestProgram } from './manifest/compiler';

const KEYWORDS = [
  'entity',
  'property',
  'behavior',
  'constraint',
  'flow',
  'effect',
  'expose',
  'compose',
  'command',
  'module',
  'policy',
  'store',
  'event',
  'computed',
  'derived',
  'hasMany',
  'hasOne',
  'belongsTo',
  'ref',
  'through',
  'on',
  'when',
  'then',
  'emit',
  'mutate',
  'compute',
  'guard',
  'publish',
  'persist',
  'as',
  'from',
  'to',
  'with',
  'where',
  'connect',
  'returns',
  'string',
  'number',
  'boolean',
  'list',
  'map',
  'any',
  'void',
  'true',
  'false',
  'null',
  'required',
  'unique',
  'indexed',
  'private',
  'readonly',
  'optional',
  'rest',
  'graphql',
  'websocket',
  'function',
  'server',
  'http',
  'storage',
  'timer',
  'custom',
  'memory',
  'postgres',
  'supabase',
  'localStorage',
  'read',
  'write',
  'delete',
  'execute',
  'all',
  'allow',
  'deny',
  'and',
  'or',
  'not',
  'is',
  'in',
  'contains',
  'user',
  'self',
  'context',
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code: string, lang: 'manifest' | 'ts'): string {
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
  } else {
    const tsKw = [
      'class',
      'interface',
      'type',
      'function',
      'const',
      'let',
      'var',
      'return',
      'if',
      'else',
      'for',
      'while',
      'new',
      'this',
      'extends',
      'export',
      'import',
      'async',
      'await',
      'try',
      'catch',
      'throw',
      'private',
      'public',
      'get',
      'set',
      'implements',
    ];
    addTokens(new RegExp(`\\b(${tsKw.join('|')})\\b`, 'g'), 'text-sky-400 font-medium');
    addTokens(
      /\b(string|number|boolean|any|void|null|undefined|true|false|Promise)\b/g,
      'text-orange-400',
    );
  }

  tokens.sort((a, b) => a.start - b.start);

  const filtered: typeof tokens = [];
  for (const token of tokens) {
    const overlaps = filtered.some(
      (t) =>
        (token.start >= t.start && token.start < t.end) ||
        (token.end > t.start && token.end <= t.end),
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

export function Editor({
  value,
  onChange,
  lang,
  readOnly,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  lang: 'manifest' | 'ts';
  readOnly?: boolean;
  placeholder?: string;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const sync = useCallback(() => {
    if (textRef.current && hlRef.current) {
      hlRef.current.scrollTop = textRef.current.scrollTop;
      hlRef.current.scrollLeft = textRef.current.scrollLeft;
    }
  }, []);
  useEffect(sync, [value, sync]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = e.currentTarget.selectionStart,
        end = e.currentTarget.selectionEnd;
      const newValue = value.substring(0, s) + '  ' + value.substring(end);
      onChange(newValue);
      setTimeout(() => {
        if (textRef.current) textRef.current.selectionStart = textRef.current.selectionEnd = s + 2;
      }, 0);
    }
  };

  const displayHtml = value
    ? highlight(value, lang)
    : `<span class="text-gray-600">${placeholder || ''}</span>`;

  return (
    <div className="relative h-full font-mono text-sm">
      <div
        ref={hlRef}
        className="absolute inset-0 p-4 overflow-auto whitespace-pre-wrap break-words pointer-events-none"
        style={{ color: '#e2e8f0' }}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
      <textarea
        ref={textRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onKeyDown={onKey}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none outline-none selection:bg-sky-500/30"
        style={{ caretColor: 'white' }}
      />
    </div>
  );
}

function TreeNode({ label, value, depth = 0 }: { label: string; value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  if (value === null || value === undefined)
    return (
      <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
        <span className="text-gray-400">{label}:</span>
        <span className="text-gray-500">null</span>
      </div>
    );
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return (
      <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
        <span className="text-gray-400">{label}:</span>
        <span
          className={
            typeof value === 'string'
              ? 'text-amber-400'
              : typeof value === 'number'
                ? 'text-cyan-400'
                : 'text-orange-400'
          }
        >
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <div className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
          <span className="text-gray-400">{label}:</span>
          <span className="text-gray-500">[]</span>
        </div>
      );
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left"
          style={{ paddingLeft: depth * 16 }}
        >
          {open ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
          <span className="text-gray-400">{label}</span>
          <span className="text-gray-600 text-xs">Array({value.length})</span>
        </button>
        {open &&
          value.map((item, i) => (
            <TreeNode key={i} label={`[${i}]`} value={item} depth={depth + 1} />
          ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([k]) => k !== 'position');
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left"
          style={{ paddingLeft: depth * 16 }}
        >
          {open ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
          <span className="text-gray-400">{label}</span>
          {/* eslint-disable @typescript-eslint/no-explicit-any */}
          {(value as any).type && (
            <span className="text-emerald-400 text-xs ml-1">{(value as any).type}</span>
          )}
        </button>
        {open &&
          entries.map(([k, v]) => <TreeNode key={k} label={k} value={v} depth={depth + 1} />)}
      </div>
    );
  }
  return null;
}

export function ASTViewer({ ast }: { ast: ManifestProgram | null }) {
  if (!ast)
    return <div className="h-full flex items-center justify-center text-gray-500">No AST</div>;
  return (
    <div className="h-full overflow-auto p-4 font-mono text-sm">
      <TreeNode label="program" value={ast} />
    </div>
  );
}

export function Docs() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <Sparkles className="text-sky-400" />
            Manifest v2.0
          </h2>
          <p className="text-gray-300 leading-relaxed">
            A declarative language for AI to describe software systems. Now with commands, computed
            properties, relationships, policies, stores, modules, and realtime events.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Commands', desc: 'Explicit business operations' },
              { label: 'Computed', desc: 'Auto-updating derived fields' },
              { label: 'Relations', desc: 'hasMany, belongsTo, ref' },
              { label: 'Policies', desc: 'Auth/permission rules' },
              { label: 'Stores', desc: 'Persistence targets' },
              { label: 'Events', desc: 'Realtime pub/sub' },
            ].map(({ label, desc }) => (
              <div key={label} className="p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-sky-400 font-medium text-sm">{label}</div>
                <div className="text-gray-500 text-xs mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-xl font-semibold text-white mb-3">New in v2</h3>
          <div className="space-y-4">
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">command</h4>
              <p className="text-sm text-gray-300 mb-2">
                Explicit business operations with guards, actions, and emits.
              </p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`command claimTask(taskId: string, employeeId: string) {
  guard user.role == "manager" or task.assignedTo == null
  mutate assignedTo = employeeId
  mutate status = "in_progress"
  emit taskClaimed
}`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">computed / derived</h4>
              <p className="text-sm text-gray-300 mb-2">
                Auto-recalculating properties like a spreadsheet.
              </p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`computed total: number = subtotal + tax
computed isOverdue: boolean = dueDate < now()
computed fullName: string = firstName + " " + lastName`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">relationships</h4>
              <p className="text-sm text-gray-300 mb-2">Model connections between entities.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`hasMany orders: Order
hasOne profile: Profile
belongsTo team: Team
ref product: Product`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">policy</h4>
              <p className="text-sm text-gray-300 mb-2">Auth rules - like RLS but in your spec.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`policy canEdit write: user.id == ownerId or user.role == "admin"
policy canView read: user.teamId == self.teamId
policy canDelete delete: user.role == "admin"`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">store</h4>
              <p className="text-sm text-gray-300 mb-2">
                Where data lives - memory, localStorage, Supabase.
              </p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`store User in supabase { table: "users" }
store Cart in memory
store Settings in localStorage { key: "app_settings" }`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">event (outbox)</h4>
              <p className="text-sm text-gray-300 mb-2">Realtime events for pub/sub.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`event TaskClaimed: "kitchen.task.claimed" {
  taskId: string
  employeeId: string
  timestamp: string
}`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">expose ... server</h4>
              <p className="text-sm text-gray-300 mb-2">
                Generate server routes, not just client stubs.
              </p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`expose User as rest server "/api/users" {
  list, get, create, update, delete
}`}</pre>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="font-mono text-sky-400 mb-2">module</h4>
              <p className="text-sm text-gray-300 mb-2">Group related entities and commands.</p>
              <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">{`module kitchen {
  entity PrepTask { ... }
  entity Station { ... }
  command claimTask(...) { ... }
}`}</pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
