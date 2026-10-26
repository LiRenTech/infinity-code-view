import type { ProjectEntry, ProjectSnapshot } from './model';

export interface Point { x: number; y: number }
interface AnchorBase { version: 1; extensions?: Record<string, unknown> }
export type Anchor = AnchorBase & (
  | { kind: 'object'; objectKind: 'file' | 'folder'; path: string; mode: 'full' | 'suffix' }
  | { kind: 'code'; path: string | null; mode: 'full' | 'suffix'; text: string }
);
export interface LineStyle { label: string; color: string; width: number; dashed: boolean }
export interface Annotation {
  id: string;
  text: string;
  target: Anchor;
  style: LineStyle;
  /** World position at save time, so a missing/moved parent cannot lose the note. */
  position?: Point;
}
export interface Connection { id: string; from: Anchor; to: Anchor; style: LineStyle }
export interface Relations { annotations: Annotation[]; connections: Connection[] }
export interface AnchorMatch { nodeId: string; start?: number; end?: number }
export interface Resolution { status: 'resolved' | 'ambiguous' | 'missing'; count: number; matches: AnchorMatch[] }
export interface ResolvedEdge {
  id: string;
  annotationId?: string;
  connectionId?: string;
  from: Resolution;
  to: Resolution;
  style: LineStyle;
}
export const emptyRelations = (): Relations => ({ annotations: [], connections: [] });
export const defaultLineStyle = (): LineStyle => ({ label: '', color: '#73bfa1', width: 2, dashed: false });
// NUL cannot occur in a filesystem path. Virtual identities cannot shadow a file.
export const noteNodeId = (id: string) => `\0annotation:${id}`;
export const normalizeSource = (text: string) => text.replace(/\r\n?/g, '\n');

export function objectAnchor(entry: ProjectEntry): Anchor {
  if (entry.kind === 'note') throw new Error('批注不是项目文件');
  return { version: 1, kind: 'object', objectKind: entry.kind, path: entry.id, mode: 'full' };
}

function matchesPath(id: string, path: string, mode: 'full' | 'suffix') {
  // An empty path always denotes the project root, never every filename.
  return id === path || (path !== '' && mode === 'suffix' && id.endsWith(`/${path}`));
}

export function resolveAnchor(project: ProjectSnapshot, anchor: Anchor): Resolution {
  const matches: AnchorMatch[] = [];
  let count = 0;
  for (const entry of project.entries) {
    if (anchor.kind === 'object') {
      if (entry.kind === anchor.objectKind && matchesPath(entry.id, anchor.path, anchor.mode)) {
        count++;
        if (matches.length < 20) matches.push({ nodeId: entry.id });
      }
      continue;
    }
    if (entry.kind !== 'file' || entry.content === null || !anchor.text ||
      (anchor.path !== null && !matchesPath(entry.id, anchor.path, anchor.mode))) continue;
    const content = normalizeSource(entry.content);
    const text = normalizeSource(anchor.text);
    let offset = content.indexOf(text);
    while (offset !== -1) {
      count++;
      if (matches.length < 20) matches.push({ nodeId: entry.id, start: offset, end: offset + text.length });
      // Count overlapping occurrences as distinct matches too.
      offset = content.indexOf(text, offset + 1);
    }
  }
  return { status: count === 0 ? 'missing' : count === 1 ? 'resolved' : 'ambiguous', count, matches };
}

export function resolveEdges(project: ProjectSnapshot, relations: Relations): ResolvedEdge[] {
  return [
    ...relations.annotations.map(note => ({
      id: `note:${note.id}`, annotationId: note.id, style: note.style,
      from: { status: 'resolved' as const, count: 1, matches: [{ nodeId: noteNodeId(note.id) }] },
      to: resolveAnchor(project, note.target),
    })),
    ...relations.connections.map(connection => ({
      id: `connection:${connection.id}`, connectionId: connection.id, style: connection.style,
      from: resolveAnchor(project, connection.from), to: resolveAnchor(project, connection.to),
    })),
  ];
}

export function edgeStatus(edge: ResolvedEdge): Resolution['status'] {
  if (edge.from.status === 'missing' || edge.to.status === 'missing') return 'missing';
  if (edge.from.status === 'ambiguous' || edge.to.status === 'ambiguous') return 'ambiguous';
  return 'resolved';
}
export const statusLabel = (status: Resolution['status']) => ({ resolved: '当前唯一', ambiguous: '多个匹配', missing: '目标缺失' })[status];
export function anchorLabel(anchor: Anchor) {
  const path = anchor.path === null ? '全项目' : anchor.path || '项目根目录';
  return anchor.kind === 'object' ? path : `${path} · ${anchor.text.slice(0, 40).replace(/\n/g, ' ↵ ')}${anchor.text.length > 40 ? '…' : ''}`;
}

/** A path picker reports file counts independently of the selected snippet. */
export function pathChoices(project: ProjectSnapshot, anchor: Anchor): { path: string | null; mode: Anchor['mode']; count: number }[] {
  const resolved = resolveAnchor(project, anchor);
  const seed = resolved.matches[0]?.nodeId ?? anchor.path;
  const parts = seed?.split('/') ?? [];
  const choices: { path: string | null; mode: Anchor['mode'] }[] = [];
  for (let n = 1; n <= parts.length; n++) choices.push({ path: parts.slice(-n).join('/'), mode: 'suffix' });
  if (seed !== null) choices.push({ path: seed, mode: 'full' });
  else choices.push({ path: '', mode: 'full' });
  if (anchor.kind === 'code') choices.push({ path: null, mode: 'full' });
  if (!choices.some(item => item.path === anchor.path && item.mode === anchor.mode)) choices.unshift({ path: anchor.path, mode: anchor.mode });
  return choices.map(choice => ({ ...choice, count: project.entries.filter(entry =>
    entry.kind === (anchor.kind === 'object' ? anchor.objectKind : 'file') &&
    (choice.path === null ? entry.content !== null : matchesPath(entry.id, choice.path, choice.mode))).length }));
}

export function parseRelations(value: unknown): Relations {
  const invalid = () => { throw new Error('批注或连线数据格式无效，未覆盖原有数据。'); };
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const boundedString = (v: unknown, limit: number) => typeof v === 'string' && v.length <= limit;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e9;
  const validAnchor = (v: unknown) => {
    if (!object(v) || v.version !== 1 || !['full', 'suffix'].includes(String(v.mode)) ||
      (v.extensions !== undefined && !object(v.extensions))) return false;
    if (v.kind === 'object') return ['file', 'folder'].includes(String(v.objectKind)) && boundedString(v.path, 10000) && !(v.path as string).includes('\0');
    return v.kind === 'code' && (v.path === null || (boundedString(v.path, 10000) && !(v.path as string).includes('\0'))) &&
      boundedString(v.text, 4 * 1024 * 1024) && (v.text as string).length > 0;
  };
  const validStyle = (v: unknown) => object(v) && boundedString(v.label, 1000) && typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) &&
    typeof v.width === 'number' && Number.isFinite(v.width) && v.width >= 0.5 && v.width <= 8 && typeof v.dashed === 'boolean';
  const validId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9-]{1,200}$/.test(v);
  if (!object(value) || !Array.isArray(value.annotations) || !Array.isArray(value.connections)) return invalid();
  const ids = new Set<string>();
  for (const note of value.annotations) {
    if (!object(note) || !validId(note.id) || ids.has(`n:${note.id}`) || !boundedString(note.text, 100000) || !validAnchor(note.target) || !validStyle(note.style) ||
      (note.position !== undefined && (!object(note.position) || !finite(note.position.x) || !finite(note.position.y)))) return invalid();
    ids.add(`n:${note.id}`);
  }
  for (const connection of value.connections) {
    if (!object(connection) || !validId(connection.id) || ids.has(`c:${connection.id}`) || !validAnchor(connection.from) || !validAnchor(connection.to) || !validStyle(connection.style)) return invalid();
    ids.add(`c:${connection.id}`);
  }
  return value as unknown as Relations;
}
