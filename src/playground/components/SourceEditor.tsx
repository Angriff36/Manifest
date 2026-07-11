import { useRef, useCallback, useEffect } from 'react';
import { highlight } from '../lib/highlight';

interface SourceEditorProps {
  value: string;
  onChange: (v: string) => void;
  lang?: 'manifest' | 'ts' | 'json';
  readOnly?: boolean;
  placeholder?: string;
  errorLines?: Set<number>;
}

export function SourceEditor({
  value,
  onChange,
  lang = 'manifest',
  readOnly,
  placeholder,
  errorLines,
}: SourceEditorProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    if (textRef.current && hlRef.current) {
      hlRef.current.scrollTop = textRef.current.scrollTop;
      hlRef.current.scrollLeft = textRef.current.scrollLeft;
    }
    if (textRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textRef.current.scrollTop;
    }
  }, []);

  useEffect(sync, [value, sync]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = value.substring(0, s) + '  ' + value.substring(end);
      onChange(newValue);
      setTimeout(() => {
        if (textRef.current) textRef.current.selectionStart = textRef.current.selectionEnd = s + 2;
      }, 0);
    }
  };

  const lines = value ? value.split('\n') : [''];
  const lineCount = lines.length;
  const displayHtml = value
    ? highlight(value, lang)
    : `<span class="text-gray-600">${placeholder || ''}</span>`;

  return (
    <div className="relative h-full flex font-mono text-sm">
      {/* Line number gutter */}
      <div
        ref={gutterRef}
        className="flex-shrink-0 overflow-hidden select-none text-right pr-3 pl-2 pt-4 pb-4 bg-gray-950/50 border-r border-gray-800"
        style={{ width: '3.5rem' }}
      >
        {Array.from({ length: lineCount }, (_, i) => {
          const lineNum = i + 1;
          const hasError = errorLines?.has(lineNum);
          return (
            <div
              key={i}
              className={`leading-[1.625] ${hasError ? 'text-rose-400' : 'text-gray-600'}`}
              style={{ height: '1.625em' }}
            >
              {hasError && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1 align-middle" />
              )}
              {lineNum}
            </div>
          );
        })}
      </div>
      {/* Editor area */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={hlRef}
          className="absolute inset-0 p-4 overflow-auto whitespace-pre-wrap break-words pointer-events-none leading-[1.625]"
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
          className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none outline-none selection:bg-sky-500/30 leading-[1.625]"
          style={{ caretColor: readOnly ? 'transparent' : 'white' }}
        />
      </div>
    </div>
  );
}
