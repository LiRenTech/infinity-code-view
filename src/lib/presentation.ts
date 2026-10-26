import type { Scene, SceneNode } from './model';

export type DetailLevel = 'summary' | 'contents' | 'code';
export const CODE_DETAIL_SCALE = 8 / 12; // Do not mount source below an apparent 8px font.

/** A deeper folder needs a little more screen space before revealing its next layer. */
export function folderRevealScale(node: SceneNode, depth: number): number {
  const level = Math.min(depth, 12);
  return Math.max((260 + level * 24) / node.width, (140 + level * 16) / node.height);
}

export function detailLevel(node: SceneNode, scale: number, depth: number): DetailLevel {
  if (node.entry.kind === 'folder') {
    return node.children.length > 0 && scale >= folderRevealScale(node, depth) ? 'contents' : 'summary';
  }
  return scale >= CODE_DETAIL_SCALE ? 'code' : 'summary';
}

/** Compensate for world scaling without changing any node's layout dimensions. */
export function borderWidth(node: SceneNode, scale: number): number {
  const screenPixels = Math.min(3.2, (node.entry.kind === 'folder' ? 1.4 : 1) + Math.max(0, Math.log2(1 / scale)) * 0.4);
  return Math.min(screenPixels / scale, Math.min(node.width, node.height) * 0.06);
}

export function nodeDepth(scene: Scene, id: string): number {
  let depth = 0;
  let parent = scene[id].entry.parentId;
  while (parent !== null) {
    depth++;
    parent = scene[parent].entry.parentId;
  }
  return depth;
}

/** Hidden descendants cannot accidentally be picked by a marquee in overview mode. */
export function visibleNodeIds(scene: Scene, scale: number): Set<string> {
  const visible = new Set<string>();
  const visit = (id: string, depth: number) => {
    const node = scene[id];
    if (!node) return;
    visible.add(id);
    if (detailLevel(node, scale, depth) === 'contents') {
      for (const child of node.children) visit(child, depth + 1);
    }
  };
  visit('', 0);
  return visible;
}
