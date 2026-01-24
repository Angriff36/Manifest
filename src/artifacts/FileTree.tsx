import { useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, Copy, Check } from 'lucide-react';
import { copyToClipboard } from './zipExporter';

interface FileTreeProps {
  files: Record<string, string>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

interface TreeStructure {
  [key: string]: TreeStructure | string;
}

function buildTree(files: Record<string, string>): TreeStructure {
  const tree: TreeStructure = {};

  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part] as TreeStructure;
    }

    current[parts[parts.length - 1]] = path;
  }

  return tree;
}

function TreeFolder({
  name,
  children,
  files,
  selectedFile,
  onSelectFile,
  depth
}: {
  name: string;
  children: TreeStructure;
  files: Record<string, string>;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-2 py-1 hover:bg-gray-800 rounded text-sm text-gray-300"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        <Folder size={14} className="text-amber-400" />
        <span>{name}</span>
      </button>
      {open && (
        <div>
          {Object.entries(children).map(([key, value]) => {
            if (typeof value === 'string') {
              return (
                <TreeFile
                  key={key}
                  name={key}
                  path={value}
                  content={files[value]}
                  selected={selectedFile === value}
                  onSelect={onSelectFile}
                  depth={depth + 1}
                />
              );
            }
            return (
              <TreeFolder
                key={key}
                name={key}
                children={value}
                files={files}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TreeFile({
  name,
  path,
  content,
  selected,
  onSelect,
  depth
}: {
  name: string;
  path: string;
  content: string;
  selected: boolean;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = () => {
    if (name.endsWith('.ts')) return 'text-sky-400';
    if (name.endsWith('.json')) return 'text-amber-400';
    if (name.endsWith('.md')) return 'text-emerald-400';
    if (name.endsWith('.manifest')) return 'text-purple-400';
    return 'text-gray-400';
  };

  return (
    <button
      onClick={() => onSelect(path)}
      className={`flex items-center gap-2 w-full px-2 py-1 rounded text-sm group ${
        selected ? 'bg-sky-500/20 text-sky-300' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
      }`}
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      <File size={14} className={getFileIcon()} />
      <span className="flex-1 text-left truncate">{name}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-opacity"
        title="Copy file contents"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </button>
  );
}

export function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  const tree = buildTree(files);

  return (
    <div className="py-2">
      {Object.entries(tree).map(([key, value]) => {
        if (typeof value === 'string') {
          return (
            <TreeFile
              key={key}
              name={key}
              path={value}
              content={files[value]}
              selected={selectedFile === value}
              onSelect={onSelectFile}
              depth={0}
            />
          );
        }
        return (
          <TreeFolder
            key={key}
            name={key}
            children={value}
            files={files}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            depth={0}
          />
        );
      })}
    </div>
  );
}
