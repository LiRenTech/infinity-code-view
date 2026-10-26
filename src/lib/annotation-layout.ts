import { cloneScene, normalize, overlaps, worldRect, GAP, HEADER, PAD, type LayoutDocument, type ProjectSnapshot, type Scene } from './model';
import { noteNodeId, resolveAnchor, statusLabel, type Relations } from './relations';

/** Attach independently stored annotations as virtual siblings of their targets. */
export function attachAnnotations(scene: Scene, relations: Relations, project: ProjectSnapshot, previous: Scene = scene, saved?: LayoutDocument | null): Scene {
  const next = cloneScene(scene);
  for (const node of Object.values(next)) {
    node.children = node.children.filter(id => next[id]?.entry.kind !== 'note');
  }
  for (const [id, node] of Object.entries(next)) if (node.entry.kind === 'note') delete next[id];
  for (const note of relations.annotations) {
    const id = noteNodeId(note.id);
    const resolution = resolveAnchor(project, note.target);
    const target = resolution.status === 'resolved' ? next[resolution.matches[0].nodeId] : undefined;
    const old = previous[id];
    const parentId = target?.entry.parentId ?? (target ? '' : old && next[old.entry.parentId ?? '']?.entry.kind === 'folder' ? old.entry.parentId! : '');
    const parent = next[parentId];
    if (!parent) continue;
    const width = old?.width ?? saved?.nodes[id]?.width ?? 320;
    const height = old && old.entry.content === note.text ? old.height : 18 + note.text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(1, (width - 24) / 8))), 0) * 22;
    const position = old ? worldRect(previous, id) : note.position;
    const parentWorld = worldRect(next, parentId);
    let x = position ? position.x - parentWorld.x : target && target.entry.id !== '' ? target.x + target.width + GAP : parent.width + GAP;
    let y = position ? position.y - parentWorld.y : target && target.entry.id !== '' ? target.y : HEADER;
    if (!position) {
      x = Math.max(PAD, x);
      for (let n = 0; n <= parent.children.length; n++) {
        const collisions = parent.children.map(child => next[child]).filter(rect => overlaps({ x, y, width, height }, rect, GAP - 1));
        if (!collisions.length) break;
        y = Math.max(...collisions.map(rect => rect.y + rect.height + GAP));
      }
    }
    next[id] = {
      x, y, width, height, children: [],
      entry: { id, parentId, kind: 'note', name: '批注', content: note.text, language: null, notice: resolution.status === 'resolved' ? null : statusLabel(resolution.status) },
    };
    parent.children.push(id);
  }
  return normalize(next);
}
