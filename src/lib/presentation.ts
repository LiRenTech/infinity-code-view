import type { Scene, SceneNode } from './model';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from './settings';

export type FolderDisclosure = 'children' | 'recursive';

export type DetailLevel = 'summary' | 'contents' | 'code';
export const CODE_DETAIL_SCALE = 8 / 12; // Do not mount source below an apparent 8px font.

/** A deeper folder needs a little more screen space before revealing its next layer. */
export function folderRevealScale(node: SceneNode, depth: number): number {
  const level = Math.min(depth, 12);
  return Math.max((260 + level * 24) / node.width, (140 + level * 16) / node.height);
}

/** Only pointer-clicked folders disclose; marquee-selected folders have no disclosure entry. */
export function selectionRevealIds(
  scene: Scene,
  selected: ReadonlySet<string>,
  settings: ViewSettings = DEFAULT_VIEW_SETTINGS,
  folderDisclosures: ReadonlyMap<string, FolderDisclosure> = new Map(),
  retainedDuringGesture?: ReadonlySet<string>,
): Set<string> {
  const revealed = new Set<string>();
  const revealAncestors = (id: string) => {
    let current: string | null = id;
    while (current !== null && scene[current] && !revealed.has(current)) {
      revealed.add(current);
      current = scene[current].entry.parentId;
    }
  };
  const revealTree = (id: string) => {
    revealed.add(id);
    for (const child of scene[id].children) revealTree(child);
  };
  for (const id of selected) {
    const node = scene[id];
    if (!node) continue;
    if (node.entry.kind === 'file') {
      if (settings.revealSelectedFiles) revealAncestors(id);
      continue;
    }
    const disclosure = folderDisclosures.get(id);
    if (!disclosure) continue;
    if (disclosure === 'recursive' && settings.revealFolderRecursivelyOnDoubleClick) {
      revealAncestors(id);
      revealTree(id);
    } else if (settings.revealFolderOnClick) {
      revealAncestors(id);
      for (const child of node.children) {
        if (scene[child].entry.kind === 'file') revealed.add(child);
      }
    }
  }
  // Selection changes on pointerdown, but a folder click is committed on
  // pointerup. Keep the previous disclosure mounted across that transition.
  for (const id of retainedDuringGesture ?? []) {
    if (scene[id]) revealed.add(id);
  }
  return revealed;
}

export function detailLevel(node: SceneNode, scale: number, depth: number, revealed?: ReadonlySet<string>): DetailLevel {
  if (revealed?.has(node.entry.id)) return node.entry.kind === 'folder' ? 'contents' : 'code';
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
export function visibleNodeIds(scene: Scene, scale: number, revealed?: ReadonlySet<string>): Set<string> {
  const visible = new Set<string>();
  const visit = (id: string, depth: number) => {
    const node = scene[id];
    if (!node) return;
    visible.add(id);
    if (detailLevel(node, scale, depth, revealed) === 'contents') {
      for (const child of node.children) visit(child, depth + 1);
    }
  };
  visit('', 0);
  return visible;
}
