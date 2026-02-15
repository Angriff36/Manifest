// Profiler trace types — used by FlameChart and profiler tabs
// The old fake timing code has been removed. All data now comes from real IPC profiling.

export interface FlameNode {
  name: string;
  start: number;
  duration: number;
  selfTime: number;
  category: 'guard' | 'expression' | 'function' | 'io' | 'match' | 'binding' | 'compile' | 'policy' | 'action' | 'constraint';
  children: FlameNode[];
}

export interface ProfileStats {
  totalTime: number;
  peakMemoryKB: number;
  functionCount: number;
  guardCount: number;
  deepestStack: number;
  hotPath: string[];
}
