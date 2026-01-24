import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from './zipExporter';

interface FileViewerProps {
  path: string;
  content: string;
}

export function FileViewer({ path, content }: FileViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLanguage = (path: string): string => {
    if (path.endsWith('.ts')) return 'typescript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.manifest')) return 'manifest';
    return 'text';
  };

  const lang = getLanguage(path);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/50">
        <span className="text-sm text-gray-400 font-mono">{path}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-sm font-mono text-gray-300 whitespace-pre-wrap">
          <code className={`language-${lang}`}>{content}</code>
        </pre>
      </div>
    </div>
  );
}
