import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Rect, Scene, Viewport } from '../lib/model';
import { sourceRange } from '../lib/dom-ranges';
import { edgeStatus, type AnchorMatch, type Point, type ResolvedEdge } from '../lib/relations';

interface Pin { rect: Rect; frame: Rect; nodeId: string; proxyId: string; highlights: Rect[] }
interface Geometry { id: string; path: string; start: Point; label: Point; highlights: Rect[]; collapsed: boolean }

function rectangle(rect: DOMRect, origin: DOMRect): Rect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}
function pinFor(match: AnchorMatch, scene: Scene, visible: ReadonlySet<string>, frames: Map<string, Element>, sources: Map<string, Element>, origin: DOMRect): Pin | null {
  let id = match.nodeId;
  if (!scene[id]) return null;
  while (!visible.has(id)) {
    const parent = scene[id]?.entry.parentId;
    if (parent === null || parent === undefined) return null;
    id = parent;
  }
  const frame = frames.get(id);
  if (!frame) return null;
  const frameRect = rectangle(frame.getBoundingClientRect(), origin);
  const source = id === match.nodeId ? sources.get(id) : undefined;
  const range = source && match.start !== undefined && match.end !== undefined ? sourceRange(source, match.start, match.end) : null;
  const rects = range ? [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0) : [];
  const first = rects[0];
  const firstLine = first ? rects.filter(rect => Math.abs(rect.y - first.y) < first.height * .5) : [];
  const line = first ? { x: Math.min(...firstLine.map(rect => rect.x)) - origin.x, y: first.y - origin.y,
    width: Math.max(...firstLine.map(rect => rect.right)) - Math.min(...firstLine.map(rect => rect.x)), height: first.height } : frameRect;
  return { rect: line, frame: frameRect, nodeId: match.nodeId, proxyId: id,
    highlights: rects.slice(0, 100).map(rect => rectangle(rect, origin)) };
}

function curve(from: Pin, to: Pin): Omit<Geometry, 'id' | 'highlights' | 'collapsed'> {
  const same = from.proxyId === to.proxyId;
  const direction = to.frame.x + to.frame.width / 2 >= from.frame.x + from.frame.width / 2 ? 1 : -1;
  const a = { x: same || direction > 0 ? from.rect.x + from.rect.width : from.rect.x, y: from.rect.y + from.rect.height / 2 };
  const b = { x: same || direction < 0 ? to.rect.x + to.rect.width : to.rect.x, y: to.rect.y + to.rect.height / 2 };
  const bend = Math.max(48, Math.abs(a.x - b.x) * .45);
  let c: Point, d: Point;
  if (same) {
    const outside = Math.max(from.frame.x + from.frame.width, to.frame.x + to.frame.width) + 80;
    const edge = Math.max(from.frame.x + from.frame.width, to.frame.x + to.frame.width) + 8;
    const loop = Math.abs(a.y - b.y) < 8 ? 65 : 0;
    return { path: `M ${a.x} ${a.y} L ${edge} ${a.y} C ${outside} ${a.y - loop}, ${outside} ${b.y + loop}, ${edge} ${b.y} L ${b.x} ${b.y}`,
      start: a, label: { x: (edge + 3 * outside) / 4, y: (a.y + b.y) / 2 } };
  } else {
    c = { x: a.x + direction * bend, y: a.y }; d = { x: b.x - direction * bend, y: b.y };
  }
  return { path: `M ${a.x} ${a.y} C ${c.x} ${c.y}, ${d.x} ${d.y}, ${b.x} ${b.y}`, start: a,
    label: { x: (a.x + 3 * c.x + 3 * d.x + b.x) / 8, y: (a.y + 3 * c.y + 3 * d.y + b.y) / 8 } };
}

export function ConnectionLayer({ host, scene, viewport, visibleIds, edges, selectedId, onSelect }: {
  host: RefObject<HTMLDivElement | null>; scene: Scene; viewport: Viewport; visibleIds: ReadonlySet<string>;
  edges: ResolvedEdge[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const [geometry, setGeometry] = useState<Geometry[]>([]);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => {
      const origin = element.getBoundingClientRect();
      const frames = new Map([...element.querySelectorAll<HTMLElement>('[data-node-id]')].map(node => [node.dataset.nodeId!, node]));
      const sources = new Map([...element.querySelectorAll<HTMLElement>('.source code[data-source-id]')].map(node => [node.dataset.sourceId!, node]));
      const next: Geometry[] = [];
      for (const edge of edges) {
        if (edgeStatus(edge) !== 'resolved') continue;
        const from = pinFor(edge.from.matches[0], scene, visibleIds, frames, sources, origin);
        const to = pinFor(edge.to.matches[0], scene, visibleIds, frames, sources, origin);
        if (!from || !to) continue;
        next.push({ id: edge.id, ...curve(from, to), highlights: [...from.highlights, ...to.highlights],
          collapsed: from.proxyId !== from.nodeId || to.proxyId !== to.nodeId ||
            (edge.from.matches[0].start !== undefined && !from.highlights.length) || (edge.to.matches[0].start !== undefined && !to.highlights.length) });
      }
      setGeometry(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    // A code font can finish loading after a disclosure mounts its source DOM.
    for (const source of element.querySelectorAll('.source')) observer.observe(source);
    return () => observer.disconnect();
  }, [host, scene, viewport, visibleIds, edges]);
  const edgeMap = new Map(edges.map(edge => [edge.id, edge]));
  return <svg className="connection-layer" aria-label="画布连线">
    {geometry.map(item => {
      // Geometry is measured after commit; deletion can render once with the
      // previous frame's cache. Never render a stale or newly invalid edge.
      const edge = edgeMap.get(item.id);
      if (!edge || edgeStatus(edge) !== 'resolved') return null;
      const active = item.id === selectedId;
      const markerId = `arrow-${item.id.replace(/[^a-zA-Z0-9-]/g, '-')}`;
      const label = edge.style.label.length > 42 ? `${edge.style.label.slice(0, 42)}…` : edge.style.label;
      return <g key={item.id} className={`connection ${active ? 'active' : ''}`} data-edge-id={item.id}
        onPointerDown={event => { if (event.button === 0) event.stopPropagation(); }}
        onClick={event => { event.stopPropagation(); onSelect(item.id); }}
        role="button" aria-label={edge.style.label || (edge.annotationId ? '批注连线' : '未命名连线')} tabIndex={0}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(item.id); } }}>
        <title>{edge.style.label || '连线'}{item.collapsed ? ' · 锚点位于折叠内容中，暂连接到可见外框' : ''}</title>
        <defs><marker id={markerId} markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={edge.style.color} /></marker></defs>
        {active && item.highlights.map((rect, index) => <rect key={index} {...rect} fill={edge.style.color} opacity="0.2" className="anchor-highlight" />)}
        {active && <path d={item.path} stroke={edge.style.color} strokeWidth={edge.style.width + 6} opacity="0.18" fill="none" className="connection-halo" />}
        <path d={item.path} className="connection-hit" fill="none" stroke="transparent" strokeWidth={Math.max(14, edge.style.width + 8)} />
        <path d={item.path} className="connection-stroke" fill="none" stroke={edge.style.color} strokeWidth={edge.style.width} strokeDasharray={edge.style.dashed ? '8 6' : undefined} markerEnd={`url(#${markerId})`} />
        <circle cx={item.start.x} cy={item.start.y} r="3" fill={edge.style.color} className="connection-stroke" />
        {label && <g className="connection-label" transform={`translate(${item.label.x}, ${item.label.y})`}><rect x={-Math.max(40, label.length * 9 + 16) / 2} y={-13} width={Math.max(40, label.length * 9 + 16)} height="26" rx="5" /><text fill={edge.style.color} textAnchor="middle" dominantBaseline="middle">{label}</text></g>}
      </g>;
    })}
  </svg>;
}
