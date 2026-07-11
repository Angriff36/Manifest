import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  GitBranch,
  Shield,
  Zap,
  Database,
  Box,
} from 'lucide-react';
import { compileToIR } from '../manifest/ir-compiler';
import type { IR, IREntity, IRCommand, IRPolicy, IREvent, IRExpression } from '../manifest/ir';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  kind: 'entity' | 'event' | 'command';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  entity?: IREntity;
  event?: IREvent;
  command?: IRCommand;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  kind: 'relationship' | 'command' | 'event' | 'computed-dep' | 'policy';
  relKind?: string;
  color: string;
  dashed?: boolean;
}

interface InspectorData {
  nodeId: string;
  kind: GraphNode['kind'];
  entity?: IREntity;
  event?: IREvent;
  command?: IRCommand;
  policies?: IRPolicy[];
}

// ─── Color palette ──────────────────────────────────────────────────────────

const COLORS = {
  entity: '#38bdf8', // sky-400
  event: '#a78bfa', // violet-400
  command: '#fb923c', // orange-400
  relationship: '#6ee7b7', // emerald-300
  computedDep: '#fbbf24', // amber-400
  policy: '#f472b6', // pink-400
  eventEdge: '#a78bfa',
  commandEdge: '#fb923c',
  bg: '#030712', // gray-950
  gridLine: '#111827', // gray-900
  text: '#e2e8f0', // slate-200
  textMuted: '#94a3b8', // slate-400
};

// ─── Force simulation helpers ───────────────────────────────────────────────

function forceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  iterations: number = 300,
): void {
  const centerX = width / 2;
  const centerY = height / 2;

  // Initial placement in circle
  const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1);
  const spreadRadius = Math.min(width, height) * 0.3;
  nodes.forEach((n, i) => {
    n.x = centerX + Math.cos(i * angleStep) * spreadRadius;
    n.y = centerY + Math.sin(i * angleStep) * spreadRadius;
    n.vx = 0;
    n.vy = 0;
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const alpha0 = 1;
  const alphaDecay = 1 - Math.pow(0.001, 1 / iterations);
  let alpha = alpha0;

  for (let iter = 0; iter < iterations; iter++) {
    alpha *= 1 - alphaDecay;

    // Repulsion (all pairs)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = -800 / (dist * dist);
        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction (edges)
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const idealDist = 180;
      const force = (dist - idealDist) * 0.05 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const n of nodes) {
      n.vx += (centerX - n.x) * 0.01 * alpha;
      n.vy += (centerY - n.y) * 0.01 * alpha;
    }

    // Apply velocity with damping
    for (const n of nodes) {
      n.vx *= 0.6;
      n.vy *= 0.6;
      n.x += n.vx;
      n.y += n.vy;
      // Bounds
      n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y));
    }
  }
}

// ─── IR → Graph extraction ──────────────────────────────────────────────────

function expressionToString(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal': {
      const v = expr.value;
      if (v.kind === 'string') return `"${v.value}"`;
      if (v.kind === 'null') return 'null';
      return String((v as { value: unknown }).value ?? '');
    }
    case 'identifier':
      return expr.name;
    case 'member':
      return `${expressionToString(expr.object)}.${expr.property}`;
    case 'binary':
      return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
    case 'unary':
      return `${expr.operator}${expressionToString(expr.operand)}`;
    case 'call':
      return `${expressionToString(expr.callee)}(${expr.args.map(expressionToString).join(', ')})`;
    case 'conditional':
      return `${expressionToString(expr.condition)} ? ${expressionToString(expr.consequent)} : ${expressionToString(expr.alternate)}`;
    default:
      return '...';
  }
}

function extractGraph(ir: IR): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const entityNames = new Set(ir.entities.map((e) => e.name));

  // Entity nodes
  for (const entity of ir.entities) {
    const propCount = entity.properties.length + entity.computedProperties.length;
    const radius = Math.max(28, Math.min(50, 20 + propCount * 2));
    nodes.push({
      id: entity.name,
      label: entity.name,
      kind: 'entity',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius,
      color: COLORS.entity,
      entity,
    });
  }

  // Event nodes
  for (const event of ir.events) {
    nodes.push({
      id: `event:${event.name}`,
      label: event.name,
      kind: 'event',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 22,
      color: COLORS.event,
      event,
    });
  }

  // Relationship edges (entity → entity)
  for (const entity of ir.entities) {
    for (const rel of entity.relationships) {
      if (entityNames.has(rel.target)) {
        edges.push({
          source: entity.name,
          target: rel.target,
          label: `${rel.kind}: ${rel.name}`,
          kind: 'relationship',
          relKind: rel.kind,
          color: COLORS.relationship,
        });
      }
    }
  }

  // Command → entity edges and command → event edges
  for (const cmd of ir.commands) {
    if (cmd.entity && entityNames.has(cmd.entity)) {
      edges.push({
        source: cmd.entity,
        target: cmd.entity,
        label: cmd.name,
        kind: 'command',
        color: COLORS.commandEdge,
      });
    }
    // Command emits → events
    for (const emitName of cmd.emits) {
      const eventNodeId = `event:${emitName}`;
      if (nodes.some((n) => n.id === eventNodeId)) {
        const sourceEntity = cmd.entity || cmd.name;
        if (nodes.some((n) => n.id === sourceEntity)) {
          edges.push({
            source: sourceEntity,
            target: eventNodeId,
            label: `emits ${emitName}`,
            kind: 'event',
            color: COLORS.eventEdge,
            dashed: true,
          });
        }
      }
    }
  }

  // Computed property dependency edges (cross-entity are interesting)
  for (const entity of ir.entities) {
    for (const comp of entity.computedProperties) {
      for (const dep of comp.dependencies) {
        // Check if dep references another entity via relationship
        const rel = entity.relationships.find((r) => r.name === dep);
        if (rel && entityNames.has(rel.target)) {
          edges.push({
            source: entity.name,
            target: rel.target,
            label: `computed: ${comp.name} → ${dep}`,
            kind: 'computed-dep',
            color: COLORS.computedDep,
            dashed: true,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── Canvas drawing ─────────────────────────────────────────────────────────

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  targetRadius: number,
  color: string,
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 10;
  const endX = toX - Math.cos(angle) * targetRadius;
  const endY = toY - Math.sin(angle) * targetRadius;

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLen * Math.cos(angle - Math.PI / 6),
    endY - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    endX - headLen * Math.cos(angle + Math.PI / 6),
    endY - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  pan: { x: number; y: number },
  zoom: number,
  hoveredNode: string | null,
  selectedNode: string | null,
  dpr: number,
): void {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);

  const gridSize = 40;
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5 / zoom;
  const startX = Math.floor(-pan.x / zoom / gridSize) * gridSize;
  const startY = Math.floor(-pan.y / zoom / gridSize) * gridSize;
  const endX = startX + width / zoom + gridSize * 2;
  const endY = startY + height / zoom + gridSize * 2;
  for (let x = startX; x < endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }
  for (let y = startY; y < endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    // Self-referencing edge (command on same entity)
    if (edge.source === edge.target) {
      ctx.strokeStyle = edge.color + '80';
      ctx.lineWidth = 1.5 / zoom;
      const r = source.radius + 15;
      ctx.beginPath();
      ctx.arc(source.x + r * 0.7, source.y - r * 0.7, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      // Label
      ctx.font = `${9 / zoom}px ui-monospace, monospace`;
      ctx.fillStyle = edge.color + 'cc';
      ctx.textAlign = 'center';
      ctx.fillText(edge.label, source.x + r * 0.7, source.y - r * 0.7 - r * 0.5 - 4 / zoom);
      continue;
    }

    ctx.strokeStyle = edge.color + '80';
    ctx.lineWidth = 1.5 / zoom;
    if (edge.dashed) {
      ctx.setLineDash([5 / zoom, 3 / zoom]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    drawArrowhead(
      ctx,
      source.x,
      source.y,
      target.x,
      target.y,
      target.radius + 3,
      edge.color + 'cc',
    );

    // Edge label
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2;
    ctx.font = `${9 / zoom}px ui-monospace, monospace`;
    ctx.fillStyle = edge.color + 'cc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(edge.label, mx, my - 4 / zoom);
  }

  // Nodes
  for (const node of nodes) {
    const isHovered = node.id === hoveredNode;
    const isSelected = node.id === selectedNode;

    // Glow for hover/selected
    if (isHovered || isSelected) {
      ctx.shadowColor = node.color;
      ctx.shadowBlur = 20 / zoom;
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bg;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#fff' : node.color;
    ctx.lineWidth = (isHovered || isSelected ? 2.5 : 1.5) / zoom;
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Icon indicator
    const iconSize = 10 / zoom;
    ctx.fillStyle = node.color + 'aa';
    ctx.font = `${iconSize}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = node.kind === 'entity' ? '\u25A1' : node.kind === 'event' ? '\u26A1' : '\u25B6';
    ctx.fillText(icon, node.x, node.y - 4 / zoom);

    // Label
    ctx.font = `bold ${11 / zoom}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x, node.y + 6 / zoom);

    // Kind badge
    ctx.font = `${8 / zoom}px ui-monospace, monospace`;
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(node.kind, node.x, node.y + 18 / zoom);
  }

  ctx.restore();
  ctx.restore();
}

// ─── SVG export ─────────────────────────────────────────────────────────────

function exportToSVG(nodes: GraphNode[], edges: GraphEdge[]): string {
  const padding = 40;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  const vw = maxX - minX + padding * 2;
  const vh = maxY - minY + padding * 2;
  const ox = -minX + padding;
  const oy = -minY + padding;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}">`;
  svg += `<rect width="${vw}" height="${vh}" fill="${COLORS.bg}"/>`;
  svg += `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${COLORS.textMuted}"/></marker></defs>`;

  // Edges
  for (const edge of edges) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t || edge.source === edge.target) continue;
    const sx = s.x + ox,
      sy = s.y + oy,
      tx = t.x + ox,
      ty = t.y + oy;
    const dashAttr = edge.dashed ? ` stroke-dasharray="5,3"` : '';
    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="${edge.color}88" stroke-width="1.5"${dashAttr} marker-end="url(#arrowhead)"/>`;
    const mx = (sx + tx) / 2,
      my = (sy + ty) / 2;
    svg += `<text x="${mx}" y="${my - 6}" text-anchor="middle" fill="${edge.color}cc" font-size="9" font-family="monospace">${escapeXml(edge.label)}</text>`;
  }

  // Nodes
  for (const node of nodes) {
    const nx = node.x + ox,
      ny = node.y + oy;
    svg += `<circle cx="${nx}" cy="${ny}" r="${node.radius}" fill="${COLORS.bg}" stroke="${node.color}" stroke-width="1.5"/>`;
    svg += `<text x="${nx}" y="${ny + 4}" text-anchor="middle" fill="${COLORS.text}" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">${escapeXml(node.label)}</text>`;
    svg += `<text x="${nx}" y="${ny + 16}" text-anchor="middle" fill="${COLORS.textMuted}" font-size="8" font-family="monospace">${node.kind}</text>`;
  }

  svg += '</svg>';
  return svg;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Inspector panel ────────────────────────────────────────────────────────

function Inspector({ data, ir, onClose }: { data: InspectorData; ir: IR; onClose: () => void }) {
  const entity = data.entity;
  const event = data.event;

  // Find related policies for entity
  const relatedPolicies = ir.policies.filter(
    (p) => p.entity === data.nodeId || (!p.entity && !p.module),
  );
  // Find related commands for entity
  const relatedCommands = ir.commands.filter((c) => c.entity === data.nodeId);

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-700 overflow-y-auto z-10"
      data-testid="graph-inspector"
    >
      <div className="flex items-center justify-between p-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          {data.kind === 'entity' && <Box size={14} className="text-sky-400" />}
          {data.kind === 'event' && <Zap size={14} className="text-violet-400" />}
          {data.kind === 'command' && <GitBranch size={14} className="text-orange-400" />}
          <span className="font-semibold text-white text-sm">
            {data.nodeId.replace('event:', '')}
          </span>
          <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {data.kind}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={14} />
        </button>
      </div>

      {entity && (
        <div className="p-3 space-y-4 text-sm">
          {/* Properties */}
          <section>
            <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
              <Database size={12} /> Properties ({entity.properties.length})
            </h4>
            <div className="space-y-1">
              {entity.properties.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between bg-gray-800/50 px-2 py-1 rounded"
                >
                  <span className="text-gray-300">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sky-400 text-xs">
                      {p.type.name}
                      {p.type.nullable ? '?' : ''}
                    </span>
                    {p.modifiers.map((m) => (
                      <span key={m} className="text-[10px] bg-gray-700 text-gray-400 px-1 rounded">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Computed Properties */}
          {entity.computedProperties.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <Zap size={12} className="text-amber-400" /> Computed (
                {entity.computedProperties.length})
              </h4>
              <div className="space-y-1">
                {entity.computedProperties.map((cp) => (
                  <div key={cp.name} className="bg-gray-800/50 px-2 py-1.5 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-300">{cp.name}</span>
                      <span className="text-sky-400 text-xs">{cp.type.name}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      = {expressionToString(cp.expression)}
                    </div>
                    {cp.dependencies.length > 0 && (
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        deps: {cp.dependencies.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Relationships */}
          {entity.relationships.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <GitBranch size={12} className="text-emerald-400" /> Relationships (
                {entity.relationships.length})
              </h4>
              <div className="space-y-1">
                {entity.relationships.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between bg-gray-800/50 px-2 py-1 rounded"
                  >
                    <span className="text-gray-300">{r.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-1 rounded">
                        {r.kind}
                      </span>
                      <span className="text-emerald-300 text-xs">{r.target}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Commands */}
          {relatedCommands.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <GitBranch size={12} className="text-orange-400" /> Commands (
                {relatedCommands.length})
              </h4>
              <div className="space-y-1">
                {relatedCommands.map((c) => (
                  <div key={c.name} className="bg-gray-800/50 px-2 py-1.5 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-orange-300">{c.name}</span>
                      {c.returns && <span className="text-sky-400 text-xs">{c.returns.name}</span>}
                    </div>
                    {c.parameters.length > 0 && (
                      <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
                        ({c.parameters.map((p) => `${p.name}: ${p.type.name}`).join(', ')})
                      </div>
                    )}
                    {c.guards.length > 0 && (
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        {c.guards.length} guard{c.guards.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    {c.emits.length > 0 && (
                      <div className="text-[10px] text-violet-400 mt-0.5">
                        emits: {c.emits.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Policies */}
          {(relatedPolicies.length > 0 || entity.policies.length > 0) && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <Shield size={12} className="text-pink-400" /> Policies (
                {relatedPolicies.length || entity.policies.length})
              </h4>
              <div className="space-y-1">
                {relatedPolicies.map((p) => (
                  <div key={p.name} className="bg-gray-800/50 px-2 py-1.5 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-pink-300">{p.name}</span>
                      <span className="text-[10px] bg-pink-900/50 text-pink-400 px-1 rounded">
                        {p.action}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      {expressionToString(p.expression)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Constraints */}
          {entity.constraints.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                Constraints ({entity.constraints.length})
              </h4>
              <div className="space-y-1">
                {entity.constraints.map((c) => (
                  <div key={c.name} className="bg-gray-800/50 px-2 py-1.5 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300">{c.name}</span>
                      <span
                        className={`text-[10px] px-1 rounded ${
                          c.severity === 'block'
                            ? 'bg-rose-900/50 text-rose-400'
                            : c.severity === 'warn'
                              ? 'bg-amber-900/50 text-amber-400'
                              : 'bg-emerald-900/50 text-emerald-400'
                        }`}
                      >
                        {c.severity || 'block'}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      {expressionToString(c.expression)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {event && (
        <div className="p-3 space-y-3 text-sm">
          <div className="bg-gray-800/50 px-2 py-1.5 rounded">
            <span className="text-gray-500 text-xs">Channel</span>
            <div className="text-violet-300 font-mono">{event.channel}</div>
          </div>
          {Array.isArray(event.payload) && (
            <section>
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                Payload Fields
              </h4>
              <div className="space-y-1">
                {event.payload.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between bg-gray-800/50 px-2 py-1 rounded"
                  >
                    <span className="text-gray-300">{f.name}</span>
                    <span className="text-sky-400 text-xs">{f.type.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { color: COLORS.entity, label: 'Entity', shape: 'circle' },
    { color: COLORS.event, label: 'Event', shape: 'circle' },
    { color: COLORS.relationship, label: 'Relationship', shape: 'line' },
    { color: COLORS.commandEdge, label: 'Command', shape: 'line' },
    { color: COLORS.eventEdge, label: 'Event flow', shape: 'dashed' },
    { color: COLORS.computedDep, label: 'Computed dep', shape: 'dashed' },
  ];

  return (
    <div className="absolute bottom-3 left-3 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 flex items-center gap-3 text-[10px] text-gray-400 z-10">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.shape === 'circle' && (
            <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: item.color }} />
          )}
          {item.shape === 'line' && (
            <div className="w-4 h-0 border-t" style={{ borderColor: item.color }} />
          )}
          {item.shape === 'dashed' && (
            <div className="w-4 h-0 border-t border-dashed" style={{ borderColor: item.color }} />
          )}
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function IRGraphPanel({ source, disabled }: { source: string; disabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ir, setIr] = useState<IR | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [inspectorData, setInspectorData] = useState<InspectorData | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [dragNode, setDragNode] = useState<string | null>(null);

  // Compile IR
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (disabled || !source.trim()) {
        // Microtask defer keeps state resets out of the synchronous effect
        // body (react-hooks/set-state-in-effect).
        await Promise.resolve();
        if (cancelled) return;
        setIr(null);
        setGraphData({ nodes: [], edges: [] });
        return;
      }
      try {
        const result = await compileToIR(source);
        if (!cancelled && result.ir) {
          setIr(result.ir);
        }
      } catch {
        // Compilation error - ignore silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, disabled]);

  // Build graph from IR
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Microtask defer keeps state resets out of the synchronous effect
      // body (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      if (!ir) {
        setGraphData({ nodes: [], edges: [] });
        return;
      }
      const { nodes, edges } = extractGraph(ir);
      forceSimulation(nodes, edges, size.width, size.height);
      setGraphData({ nodes, edges });
      setSelectedNode(null);
      setInspectorData(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ir, size.width, size.height]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    drawGraph(
      ctx,
      graphData.nodes,
      graphData.edges,
      size.width,
      size.height,
      pan,
      zoom,
      hoveredNode,
      selectedNode,
      dpr,
    );
  }, [graphData, pan, zoom, hoveredNode, selectedNode, size]);

  // Hit test
  const hitTest = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = (clientX - rect.left - pan.x) / zoom;
      const my = (clientY - rect.top - pan.y) / zoom;
      for (let i = graphData.nodes.length - 1; i >= 0; i--) {
        const n = graphData.nodes[i];
        const dx = mx - n.x,
          dy = my - n.y;
        if (dx * dx + dy * dy <= n.radius * n.radius) return n;
      }
      return null;
    },
    [graphData.nodes, pan, zoom],
  );

  // Mouse events
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) {
        setDragNode(hit.id);
        setDragStart({ x: e.clientX, y: e.clientY });
      } else {
        setDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [hitTest, pan],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragNode) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const node = graphData.nodes.find((n) => n.id === dragNode);
        if (node) {
          node.x = (e.clientX - rect.left - pan.x) / zoom;
          node.y = (e.clientY - rect.top - pan.y) / zoom;
          // Force re-render
          setGraphData({ ...graphData });
        }
        return;
      }
      if (dragging) {
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        return;
      }
      const hit = hitTest(e.clientX, e.clientY);
      setHoveredNode(hit?.id || null);
    },
    [dragging, dragStart, hitTest, dragNode, graphData, pan, zoom],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragNode) {
        // If we barely moved, treat it as a click
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
          const node = graphData.nodes.find((n) => n.id === dragNode);
          if (node) {
            setSelectedNode(node.id);
            setInspectorData({
              nodeId: node.id,
              kind: node.kind,
              entity: node.entity,
              event: node.event,
              command: node.command,
            });
          }
        }
        setDragNode(null);
        return;
      }
      setDragging(false);
    },
    [dragNode, dragStart, graphData.nodes],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, zoom * factor));
      // Zoom toward cursor
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const newPanX = mx - (mx - pan.x) * (newZoom / zoom);
        const newPanY = my - (my - pan.y) * (newZoom / zoom);
        setPan({ x: newPanX, y: newPanY });
      }
      setZoom(newZoom);
    },
    [zoom, pan],
  );

  // Fit to view
  const fitToView = useCallback(() => {
    if (graphData.nodes.length === 0) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of graphData.nodes) {
      minX = Math.min(minX, n.x - n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const graphW = maxX - minX;
    const graphH = maxY - minY;
    const scaleX = (size.width - 80) / graphW;
    const scaleY = (size.height - 80) / graphH;
    const newZoom = Math.min(scaleX, scaleY, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setPan({
      x: size.width / 2 - centerX * newZoom,
      y: size.height / 2 - centerY * newZoom,
    });
    setZoom(newZoom);
  }, [graphData.nodes, size]);

  // Export handlers
  const exportSVG = useCallback(() => {
    if (graphData.nodes.length === 0) return;
    const svgStr = exportToSVG(graphData.nodes, graphData.edges);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest-ir-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [graphData]);

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || graphData.nodes.length === 0) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manifest-ir-graph.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [graphData]);

  if (disabled) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Fix compilation errors to view the IR graph
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        {ir ? 'No entities or events in IR' : 'Compiling...'}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative" data-testid="ir-graph-panel">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-800 bg-gray-900/50">
        <button
          onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={fitToView}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Fit to view"
        >
          <Maximize2 size={14} />
        </button>
        <div className="text-[10px] text-gray-600 mx-1">{Math.round(zoom * 100)}%</div>
        <div className="flex-1" />
        <span className="text-[10px] text-gray-600 mr-2">
          {graphData.nodes.length} nodes / {graphData.edges.length} edges
        </span>
        <button
          onClick={exportSVG}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Export SVG"
          data-testid="export-svg"
        >
          <Download size={10} /> SVG
        </button>
        <button
          onClick={exportPNG}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800 rounded"
          title="Export PNG"
          data-testid="export-png"
        >
          <Download size={10} /> PNG
        </button>
      </div>

      {/* Canvas + Inspector */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ cursor: dragging ? 'grabbing' : hoveredNode ? 'pointer' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            setDragging(false);
            setDragNode(null);
            setHoveredNode(null);
          }}
          onWheel={onWheel}
          data-testid="graph-canvas"
        />
        <Legend />
        {inspectorData && ir && (
          <Inspector
            data={inspectorData}
            ir={ir}
            onClose={() => {
              setInspectorData(null);
              setSelectedNode(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
