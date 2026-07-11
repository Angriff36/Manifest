import { useState } from 'react';
import { Code2, Server, TestTube, TreeDeciduous, Share2, Braces } from 'lucide-react';
import { SourceEditor } from './SourceEditor';
import { IRGraphPanel } from '../../artifacts';
import { TreeNode } from './TreeNode';
import type { ManifestProgram } from '../../manifest/types';
import type { IR } from '../../manifest/ir';

type OutputTab = 'ir' | 'client' | 'server' | 'tests' | 'ast' | 'graph';

interface OutputTabsProps {
  ir: IR | null;
  clientCode: string;
  serverCode: string;
  testCode: string;
  ast: ManifestProgram | null;
  source: string;
  hasErrors: boolean;
}

const TABS: { id: OutputTab; icon: typeof Code2; label: string }[] = [
  { id: 'ir', icon: Braces, label: 'IR' },
  { id: 'client', icon: Code2, label: 'Client' },
  { id: 'server', icon: Server, label: 'Server' },
  { id: 'tests', icon: TestTube, label: 'Tests' },
  { id: 'ast', icon: TreeDeciduous, label: 'AST' },
  { id: 'graph', icon: Share2, label: 'Graph' },
];

export function OutputTabs({
  ir,
  clientCode,
  serverCode,
  testCode,
  ast,
  source,
  hasErrors,
}: OutputTabsProps) {
  const [tab, setTab] = useState<OutputTab>('ir');

  const irJson = ir ? JSON.stringify(ir, null, 2) : '';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/50 flex overflow-x-auto">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === id
                ? 'text-sky-400 bg-gray-800/50 border-b-2 border-sky-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden bg-gray-900">
        {tab === 'ir' && (
          <SourceEditor
            value={irJson}
            onChange={() => {}}
            lang="json"
            readOnly
            placeholder="Compile a program to see IR output..."
          />
        )}
        {tab === 'client' && (
          <SourceEditor
            value={clientCode}
            onChange={() => {}}
            lang="ts"
            readOnly
            placeholder="Generated client code..."
          />
        )}
        {tab === 'server' && (
          <SourceEditor
            value={serverCode}
            onChange={() => {}}
            lang="ts"
            readOnly
            placeholder="Generated server routes (add 'server' keyword to expose)..."
          />
        )}
        {tab === 'tests' && (
          <SourceEditor
            value={testCode}
            onChange={() => {}}
            lang="ts"
            readOnly
            placeholder="Generated tests from constraints..."
          />
        )}
        {tab === 'ast' && (
          <div className="h-full overflow-auto p-4 font-mono text-sm">
            {ast ? (
              <TreeNode label="program" value={ast} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">No AST</div>
            )}
          </div>
        )}
        {tab === 'graph' && <IRGraphPanel source={source} disabled={hasErrors} />}
      </div>
    </div>
  );
}
