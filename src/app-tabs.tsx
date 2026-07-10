import {
  BookOpen,
  Code2,
  Flame,
  Layers,
  Server,
  Share2,
  Shield,
  TestTube,
  TreeDeciduous,
  type LucideIcon,
} from 'lucide-react';
import type { ManifestProgram } from './manifest/compiler';
import {
  FlameGraphPanel,
  IRGraphPanel,
  PolicyMatrixPanel,
  TutorialPanel,
} from './artifacts';
import { ASTViewer, Docs, Editor } from './app-panels';

export type Tab =
  | 'output'
  | 'server'
  | 'tests'
  | 'ast'
  | 'graph'
  | 'docs'
  | 'tutorial'
  | 'policies'
  | 'profiler';

interface TabDefinition {
  id: Tab;
  icon: LucideIcon;
  label: string;
}

export const APP_TABS: readonly TabDefinition[] = [
  { id: 'output', icon: Code2, label: 'Client' },
  { id: 'server', icon: Server, label: 'Server' },
  { id: 'tests', icon: TestTube, label: 'Tests' },
  { id: 'ast', icon: TreeDeciduous, label: 'AST' },
  { id: 'graph', icon: Share2, label: 'Graph' },
  { id: 'docs', icon: Layers, label: 'Docs' },
  { id: 'tutorial', icon: BookOpen, label: 'Tutorial' },
  { id: 'policies', icon: Shield, label: 'Policies' },
  { id: 'profiler', icon: Flame, label: 'Profiler' },
];

export interface CenterPanelProps {
  output: string;
  serverCode: string;
  testCode: string;
  ast: ManifestProgram | null;
  source: string;
  hasErrors: boolean;
  onSourceChange: (source: string) => void;
}

export function renderCenterPanel(tab: Tab, props: CenterPanelProps) {
  switch (tab) {
    case 'output':
      return <Editor value={props.output} onChange={() => {}} lang="ts" readOnly placeholder="Generated client code..." />;
    case 'server':
      return <Editor value={props.serverCode} onChange={() => {}} lang="ts" readOnly placeholder="Generated server routes (add 'server' keyword to expose)..." />;
    case 'tests':
      return <Editor value={props.testCode} onChange={() => {}} lang="ts" readOnly placeholder="Generated tests from constraints..." />;
    case 'ast':
      return <ASTViewer ast={props.ast} />;
    case 'graph':
      return <IRGraphPanel source={props.source} disabled={props.hasErrors} />;
    case 'docs':
      return <Docs />;
    case 'tutorial':
      return <TutorialPanel source={props.source} onSourceChange={props.onSourceChange} />;
    case 'policies':
      return <PolicyMatrixPanel source={props.source} disabled={props.hasErrors} />;
    case 'profiler':
      return <FlameGraphPanel source={props.source} disabled={props.hasErrors} />;
  }
}
