import { useRef, useCallback } from 'react';
import { highlightCode } from '../lib/highlighter';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: string;
  showLineNumbers?: boolean;
}

export default function CodeEditor({
  value,
  onChange,
  placeholder = 'Enter code...',
  readOnly = false,
  height = '200px',
  showLineNumbers = true,
}: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const lines = value.split('\n');
  const lineCount = lines.length;
  const gutterWidth = Math.max(String(lineCount).length * 10 + 20, 40);
  const highlighted = highlightCode(value);

  return (
    <div className="relative rounded-md overflow-hidden border border-surface-border bg-surface" style={{ height }}>
      {showLineNumbers && (
        <div
          className="absolute top-0 left-0 h-full code-font text-xs text-slate-600 select-none pointer-events-none z-10 border-r border-surface-border bg-surface-light/50"
          style={{ width: gutterWidth }}
        >
          <div className="py-3 px-2 text-right">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="leading-5">
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}

      <pre
        ref={preRef}
        className="absolute inset-0 overflow-auto code-font text-sm leading-5 text-slate-200 whitespace-pre-wrap break-words pointer-events-none py-3"
        style={{ paddingLeft: showLineNumbers ? gutterWidth + 12 : 12, paddingRight: 12 }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlighted || '<span class="text-slate-600">' + placeholder + '</span>' }}
      />

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="absolute inset-0 w-full h-full code-font text-sm leading-5 text-transparent caret-accent bg-transparent resize-none outline-none py-3"
        style={{ paddingLeft: showLineNumbers ? gutterWidth + 12 : 12, paddingRight: 12 }}
        placeholder={!value ? placeholder : undefined}
      />
    </div>
  );
}
