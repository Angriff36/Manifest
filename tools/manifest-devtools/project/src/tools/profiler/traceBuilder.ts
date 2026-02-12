export interface FlameNode {
  name: string;
  start: number;
  duration: number;
  selfTime: number;
  category: 'guard' | 'expression' | 'function' | 'io' | 'match' | 'binding';
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

interface CodeBlock {
  type: 'function' | 'guard' | 'let' | 'match' | 'call' | 'return';
  name: string;
  depth: number;
}

function extractBlocks(code: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = code.split('\n');
  let depth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const fnMatch = trimmed.match(/^(?:fn|def)\s+(\w+)/);
    if (fnMatch) {
      blocks.push({ type: 'function', name: fnMatch[1], depth });
      depth++;
      continue;
    }

    const guardMatch = trimmed.match(/^(?:guard|when)\s+(.+)/);
    if (guardMatch) {
      blocks.push({ type: 'guard', name: `guard: ${guardMatch[1].slice(0, 40)}`, depth });
      continue;
    }

    const letMatch = trimmed.match(/^(?:let|val)\s+(\w+)/);
    if (letMatch) {
      blocks.push({ type: 'let', name: `${letMatch[1]}`, depth });
      continue;
    }

    if (trimmed.startsWith('match')) {
      blocks.push({ type: 'match', name: 'match', depth });
      depth++;
      continue;
    }

    if (trimmed.startsWith('return')) {
      blocks.push({ type: 'return', name: 'return', depth });
      continue;
    }

    const callMatch = trimmed.match(/(\w+)\s*\(/);
    if (callMatch && !fnMatch) {
      blocks.push({ type: 'call', name: callMatch[1], depth });
      continue;
    }

    if (trimmed === '}') {
      depth = Math.max(0, depth - 1);
    }
  }

  return blocks;
}

const CATEGORY_MAP: Record<string, FlameNode['category']> = {
  function: 'function',
  guard: 'guard',
  let: 'binding',
  match: 'match',
  call: 'expression',
  return: 'expression',
};

const BASE_TIMINGS: Record<string, number> = {
  function: 2,
  guard: 3,
  let: 1.5,
  match: 4,
  call: 5,
  return: 0.5,
};

export function buildTrace(code: string): { root: FlameNode; stats: ProfileStats } {
  const blocks = extractBlocks(code);
  if (blocks.length === 0) {
    const empty: FlameNode = {
      name: 'main',
      start: 0,
      duration: 1,
      selfTime: 1,
      category: 'function',
      children: [],
    };
    return {
      root: empty,
      stats: { totalTime: 1, peakMemoryKB: 64, functionCount: 0, guardCount: 0, deepestStack: 0, hotPath: ['main'] },
    };
  }

  const rng = seedRandom(code.length);
  let currentTime = 0;
  const stack: FlameNode[] = [];

  const root: FlameNode = {
    name: blocks[0]?.type === 'function' ? blocks[0].name : 'main',
    start: 0,
    duration: 0,
    selfTime: 0,
    category: 'function',
    children: [],
  };
  stack.push(root);
  currentTime += 0.5;

  let guardCount = 0;
  let functionCount = 0;
  let deepestStack = 0;

  const startIdx = blocks[0]?.type === 'function' ? 1 : 0;

  for (let i = startIdx; i < blocks.length; i++) {
    const block = blocks[i];
    const baseTime = BASE_TIMINGS[block.type] || 2;
    const jitter = baseTime * (0.5 + rng() * 1.5);
    const duration = Math.round(jitter * 100) / 100;

    if (block.type === 'guard') guardCount++;
    if (block.type === 'function') functionCount++;

    const node: FlameNode = {
      name: block.name,
      start: currentTime,
      duration,
      selfTime: duration,
      category: CATEGORY_MAP[block.type] || 'expression',
      children: [],
    };

    if (block.type === 'function') {
      const parent = stack[stack.length - 1];
      parent.children.push(node);
      stack.push(node);
      currentTime += 0.2;
      deepestStack = Math.max(deepestStack, stack.length);
    } else if (block.type === 'call') {
      const callNode: FlameNode = {
        name: block.name,
        start: currentTime,
        duration: duration + 2,
        selfTime: 1,
        category: 'function',
        children: [node],
      };
      const parent = stack[stack.length - 1];
      parent.children.push(callNode);
      currentTime += callNode.duration + 0.3;
    } else {
      const parent = stack[stack.length - 1];
      parent.children.push(node);
      currentTime += duration + 0.1;
    }
  }

  while (stack.length > 1) stack.pop();
  root.duration = currentTime + 0.5;
  root.selfTime = root.duration - root.children.reduce((sum, c) => sum + c.duration, 0);

  const hotPath = findHotPath(root);
  const stats: ProfileStats = {
    totalTime: Math.round(root.duration * 100) / 100,
    peakMemoryKB: Math.round(64 + blocks.length * 12 + rng() * 200),
    functionCount: functionCount + 1,
    guardCount,
    deepestStack: Math.max(deepestStack, 1),
    hotPath,
  };

  return { root, stats };
}

function findHotPath(node: FlameNode): string[] {
  const path = [node.name];
  if (node.children.length === 0) return path;
  const slowest = node.children.reduce((a, b) => (a.duration > b.duration ? a : b));
  return [...path, ...findHotPath(slowest)];
}

function seedRandom(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
