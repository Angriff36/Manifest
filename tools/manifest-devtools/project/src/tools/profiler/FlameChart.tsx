import { useState, useMemo, useRef } from 'react';
import type { FlameNode } from './traceBuilder';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  function: { bg: '#164e63', text: '#22d3ee', border: '#0891b2' },
  guard: { bg: '#1c3a2a', text: '#34d399', border: '#059669' },
  expression: { bg: '#1e293b', text: '#94a3b8', border: '#475569' },
  io: { bg: '#3b1a1a', text: '#fb923c', border: '#c2410c' },
  match: { bg: '#2a1f3d', text: '#a78bfa', border: '#7c3aed' },
  binding: { bg: '#1a2e3b', text: '#38bdf8', border: '#0284c7' },
};

const ROW_HEIGHT = 28;
const ROW_GAP = 2;
const MIN_WIDTH = 2;

interface FlameChartProps {
  root: FlameNode;
  height?: number;
}

interface FlatNode {
  node: FlameNode;
  depth: number;
  x: number;
  width: number;
}

function flatten(node: FlameNode, depth: number, totalDuration: number): FlatNode[] {
  const result: FlatNode[] = [];
  const x = (node.start / totalDuration) * 100;
  const width = Math.max((node.duration / totalDuration) * 100, 0.5);

  result.push({ node, depth, x, width });

  for (const child of node.children) {
    result.push(...flatten(child, depth + 1, totalDuration));
  }

  return result;
}

export default function FlameChart({ root, height = 300 }: FlameChartProps) {
  const [hoveredNode, setHoveredNode] = useState<FlameNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const flatNodes = useMemo(() => flatten(root, 0, root.duration), [root]);
  const maxDepth = useMemo(() => Math.max(...flatNodes.map((n) => n.depth)) + 1, [flatNodes]);
  const svgHeight = Math.max(maxDepth * (ROW_HEIGHT + ROW_GAP) + 20, height);

  const handleMouseMove = (e: React.MouseEvent, node: FlameNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    setHoveredNode(node);
  };

  return (
    <div ref={containerRef} className="relative tool-panel overflow-auto" style={{ height }}>
      <svg width="100%" height={svgHeight} className="min-w-[600px]">
        {flatNodes.map((flat, i) => {
          const colors = CATEGORY_COLORS[flat.node.category] || CATEGORY_COLORS.expression;
          const y = flat.depth * (ROW_HEIGHT + ROW_GAP) + 4;
          const isHovered = hoveredNode === flat.node;

          return (
            <g
              key={i}
              onMouseMove={(e) => handleMouseMove(e, flat.node)}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer"
            >
              <rect
                x={`${flat.x}%`}
                y={y}
                width={`${Math.max(flat.width, 0.3)}%`}
                height={ROW_HEIGHT}
                rx={3}
                fill={isHovered ? colors.border : colors.bg}
                stroke={colors.border}
                strokeWidth={isHovered ? 1.5 : 0.5}
                opacity={isHovered ? 1 : 0.9}
              />
              {flat.width > 3 && (
                <text
                  x={`${flat.x + 0.3}%`}
                  y={y + ROW_HEIGHT / 2 + 4}
                  fill={colors.text}
                  fontSize={11}
                  fontFamily="'JetBrains Mono', monospace"
                  className="pointer-events-none"
                >
                  {flat.node.name.length > Math.floor(flat.width * 1.5)
                    ? flat.node.name.slice(0, Math.floor(flat.width * 1.2)) + '...'
                    : flat.node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hoveredNode && (
        <div
          className="absolute z-20 pointer-events-none bg-surface-lighter border border-surface-border rounded-md shadow-xl px-3 py-2 text-xs animate-fade-in"
          style={{
            left: Math.min(tooltipPos.x + 12, (containerRef.current?.offsetWidth || 400) - 200),
            top: tooltipPos.y - 60,
          }}
        >
          <p className="font-medium text-slate-200 code-font">{hoveredNode.name}</p>
          <div className="mt-1 space-y-0.5 text-slate-400">
            <p>Duration: <span className="text-accent">{hoveredNode.duration.toFixed(2)}ms</span></p>
            <p>Self Time: <span className="text-amber-300">{hoveredNode.selfTime.toFixed(2)}ms</span></p>
            <p>Category: <span className="text-slate-300">{hoveredNode.category}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}
