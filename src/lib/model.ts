import { emptyRelations, noteNodeId, parseRelations, type Relations } from './relations';

export interface ProjectEntry {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'folder' | 'file' | 'note';
  content: string | null;
  language: string | null;
  notice: string | null;
}
export interface ProjectSnapshot {
  rootPath: string;
  entries: ProjectEntry[];
  warnings: string[];
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface SceneNode extends Rect { entry: ProjectEntry; children: string[] }
export type Scene = Record<string, SceneNode>;
export interface Viewport { x: number; y: number; scale: number }
export interface LayoutDocument {
  version: 2;
  relations: Relations;
  rootPath: string;
  nodes: Record<string, Rect>;
  viewport: Viewport;
}
export const PAD = 24;
export const HEADER = 52;
export const GAP = 24;
export const MIN_SCALE = 0.001;
export const MAX_SCALE = 8;
export const MIN_WIDTH = 240;
export const MAX_WIDTH = 1400;
// Enough for 120 monospace characters plus padding, including wider font fallbacks.
export const DEFAULT_CODE_WIDTH = 1024;

export function estimateHeight(entry: ProjectEntry, width: number): number {
  if (entry.kind === 'folder') return 128;
  if (entry.content === null) return 66 + Math.max(0, Math.ceil(entry.name.length * 8 / (width - 32)) - 1) * 19;
  const columns = Math.max(1, Math.floor((width - 42) / 7.23));
  return HEADER + 24 + entry.content.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / columns)), 0) * 20;
}

export function cloneScene(scene: Scene): Scene {
  return Object.fromEntries(Object.entries(scene).map(([id, node]) => [id, { ...node, children: [...node.children] }]));
}

/** Tighten a folder around its children without moving any child in world space. */
export function normalize(scene: Scene, id = ''): Scene {
  const folder = scene[id];
  if (!folder || folder.entry.kind !== 'folder') return scene;
  for (const child of folder.children) normalize(scene, child);
  if (!folder.children.length) {
    folder.width = 240;
    folder.height = 128;
    return scene;
  }
  const children = folder.children.map(child => scene[child]);
  const offsetX = Math.min(...children.map(child => child.x)) - PAD;
  const offsetY = Math.min(...children.map(child => child.y)) - HEADER;
  folder.x += offsetX;
  folder.y += offsetY;
  for (const child of children) {
    child.x -= offsetX;
    child.y -= offsetY;
  }
  folder.width = Math.max(240, ...children.map(child => child.x + child.width + PAD));
  folder.height = Math.max(128, ...children.map(child => child.y + child.height + PAD));
  return scene;
}

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function pack(scene: Scene, ids: string[]) {
  const area = ids.reduce((sum, id) => sum + (scene[id].width + GAP) * (scene[id].height + GAP), 0);
  const target = Math.max(800, Math.sqrt(area) * 1.25);
  let x = PAD, y = HEADER, rowHeight = 0;
  for (const id of ids) {
    const node = scene[id];
    if (x > PAD && x + node.width > target) {
      x = PAD;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    node.x = x;
    node.y = y;
    x += node.width + GAP;
    rowHeight = Math.max(rowHeight, node.height);
  }
}

/** New entries use a free candidate spot; existing siblings never get repacked. */
function placeNew(scene: Scene, node: SceneNode, siblings: string[]) {
  const occupied = siblings.map(id => scene[id]);
  const candidates = [{ x: PAD, y: HEADER }, ...occupied.flatMap(rect => [
    { x: rect.x + rect.width + GAP, y: rect.y },
    { x: rect.x, y: rect.y + rect.height + GAP },
  ])];
  candidates.sort((a, b) => Math.max(a.x + node.width, a.y + node.height) - Math.max(b.x + node.width, b.y + node.height));
  const spot = candidates.find(point => !occupied.some(rect => overlaps({ ...node, ...point }, rect, GAP - 1)));
  node.x = spot?.x ?? PAD;
  node.y = spot?.y ?? Math.max(HEADER, ...occupied.map(rect => rect.y + rect.height + GAP));
}

export function reconcile(project: ProjectSnapshot, previous: Scene = Object.create(null), saved?: LayoutDocument | null): Scene {
  previous = Object.assign(Object.create(null), previous);
  const scene: Scene = Object.create(null);
  for (const entry of project.entries) {
    const old = previous[entry.id];
    const stored = saved?.nodes[entry.id];
    const width = entry.kind === 'folder' ? 240 : entry.content !== null ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, old?.width ?? stored?.width ?? DEFAULT_CODE_WIDTH)) : Math.max(140, Math.min(280, entry.name.length * 8 + 52));
    scene[entry.id] = {
      entry, children: [], x: old?.x ?? stored?.x ?? PAD, y: old?.y ?? stored?.y ?? HEADER, width,
      height: old && old.entry.content === entry.content && old.width === width ? old.height : estimateHeight(entry, width),
    };
  }
  for (const node of Object.values(scene)) {
    if (node.entry.parentId !== null) scene[node.entry.parentId]?.children.push(node.entry.id);
  }
  const visit = (id: string) => {
    const node = scene[id];
    if (node.entry.kind !== 'folder') return;
    node.children.sort((a, b) => scene[a].entry.kind === scene[b].entry.kind ? a.localeCompare(b) : scene[a].entry.kind === 'folder' ? -1 : 1);
    for (const child of node.children) visit(child);
    if (!previous[id] && !saved?.nodes[id]) {
      pack(scene, node.children);
    } else {
      const placed = node.children.filter(child => previous[child] || saved?.nodes[child]);
      for (const child of node.children.filter(child => !previous[child] && !saved?.nodes[child])) {
        placeNew(scene, scene[child], placed);
        placed.push(child);
      }
    }
    normalize(scene, id);
  };
  visit('');
  return scene;
}

export function arrange(scene: Scene, folderId: string): Scene {
  const next = cloneScene(scene);
  pack(next, next[folderId].children);
  return normalize(next);
}

/** Used only on first import, after the DOM has measured wrapped code heights. */
export function arrangeTree(scene: Scene): Scene {
  const next = cloneScene(scene);
  const visit = (id: string) => {
    const node = next[id];
    if (node.entry.kind !== 'folder') return;
    for (const child of node.children) visit(child);
    pack(next, node.children);
    normalize(next, id);
  };
  visit('');
  return next;
}

export function worldRect(scene: Scene, id: string): Rect {
  const node = scene[id];
  let x = node.x, y = node.y, parent = node.entry.parentId;
  while (parent !== null && scene[parent]) {
    x += scene[parent].x;
    y += scene[parent].y;
    parent = scene[parent].entry.parentId;
  }
  return { x, y, width: node.width, height: node.height };
}

export function topLevelSelection(scene: Scene, ids: string[]): string[] {
  const selected = new Set(ids);
  return ids.filter(id => {
    if (!scene[id]) return false;
    let parent = scene[id].entry.parentId;
    while (parent !== null) {
      if (selected.has(parent)) return false;
      parent = scene[parent]?.entry.parentId ?? null;
    }
    return true;
  });
}

export function moveNodes(scene: Scene, ids: string[], dx: number, dy: number): Scene {
  const next = cloneScene(scene);
  for (const id of topLevelSelection(scene, ids)) {
    next[id].x += dx;
    next[id].y += dy;
  }
  return normalize(next);
}

export function toDocument(rootPath: string, scene: Scene, viewport: Viewport, relations: Relations = emptyRelations()): LayoutDocument {
  const nodes = Object.fromEntries(Object.entries(scene).map(([id, { x, y, width, height }]) => [id, { x, y, width, height }]));
  const savedRelations = { ...relations, annotations: relations.annotations.map(note => {
    const id = noteNodeId(note.id);
    const rect = scene[id] && worldRect(scene, id);
    return rect ? { ...note, position: { x: rect.x, y: rect.y } } : note;
  }) };
  return { version: 2, rootPath, nodes, viewport, relations: savedRelations };
}

export function parseDocument(value: unknown, rootPath: string): LayoutDocument | null {
  if (value === null) return null;
  const doc = value as Omit<LayoutDocument, 'version'> & { version: number };
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e9;
  if (!doc || ![1, 2].includes(doc.version) || doc.rootPath !== rootPath || !doc.nodes || !doc.viewport ||
    !number(doc.viewport.x) || !number(doc.viewport.y) || !number(doc.viewport.scale) || doc.viewport.scale < MIN_SCALE || doc.viewport.scale > MAX_SCALE ||
    Object.values(doc.nodes).some(rect => !rect || ![rect.x, rect.y, rect.width, rect.height].every(number) || rect.width <= 0 || rect.height <= 0)) {
    throw new Error('保存的布局格式无效，未覆盖原有布局。');
  }
  return { ...doc, version: 2, relations: doc.version === 1 ? emptyRelations() : parseRelations(doc.relations), nodes: Object.assign(Object.create(null), doc.nodes) };
}
