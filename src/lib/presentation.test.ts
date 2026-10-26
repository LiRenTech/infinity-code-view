import { describe, expect, it } from 'vitest';
import { reconcile, toDocument, type ProjectEntry } from './model';
import { borderWidth, CODE_DETAIL_SCALE, detailLevel, folderRevealScale, selectionRevealIds, visibleNodeIds } from './presentation';

const entry = (id: string, folder = false): ProjectEntry => ({
  id, parentId: id === '' ? null : id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
  name: id || 'project', kind: folder ? 'folder' : 'file',
  content: folder ? null : 'const value = 42;', language: folder ? null : 'typescript', notice: null,
});
const makeScene = () => reconcile({ rootPath: '/project', warnings: [], entries: [entry('', true), entry('src', true), entry('src/core', true), entry('src/core/a.ts')] });

describe('zoom disclosure', () => {
  it('reveals the hierarchy monotonically as the view zooms in', () => {
    const scene = makeScene();
    expect([...visibleNodeIds(scene, 0.001)]).toEqual(['']);
    let previous = new Set<string>();
    const sizes = new Set<number>();
    for (let scale = 0.001; scale <= 8; scale *= 1.06) {
      const current = visibleNodeIds(scene, scale);
      for (const id of previous) expect(current.has(id)).toBe(true);
      sizes.add(current.size);
      previous = current;
    }
    expect(sizes).toEqual(new Set([1, 2, 3, 4]));
  });

  it('does not disclose children beneath a collapsed folder', () => {
    const scene = makeScene();
    const rootThreshold = folderRevealScale(scene[''], 0);
    expect(visibleNodeIds(scene, rootThreshold * 1.001).has('src')).toBe(true);
    expect(visibleNodeIds(scene, rootThreshold * 1.001).has('src/core/a.ts')).toBe(false);
  });

  it('only requests source DOM when the apparent font is readable', () => {
    const node = makeScene()['src/core/a.ts'];
    expect(detailLevel(node, CODE_DETAIL_SCALE - 0.001, 3)).toBe('summary');
    expect(detailLevel(node, CODE_DETAIL_SCALE, 3)).toBe('code');
  });

  it('keeps a selected file and every ancestor disclosed at any zoom without moving nodes', () => {
    const scene = makeScene();
    const before = toDocument('/project', scene, { x: 10, y: 20, scale: 0.001 });
    const revealed = selectionRevealIds(scene, new Set(['src/core/a.ts']));
    for (const scale of [0.001, 0.05, 0.3, 1, 8]) {
      expect(detailLevel(scene['src/core/a.ts'], scale, 3, revealed)).toBe('code');
      for (const [depth, id] of ['', 'src', 'src/core'].entries()) {
        expect(detailLevel(scene[id], scale, depth, revealed)).toBe('contents');
      }
      expect(visibleNodeIds(scene, scale, revealed).has('src/core/a.ts')).toBe(true);
    }
    expect(toDocument('/project', scene, before.viewport)).toEqual(before);
  });

  it('supports multiple selected files while unrelated branches stay collapsed', () => {
    const scene = reconcile({ rootPath: '/project', warnings: [], entries: [
      entry('', true), entry('src', true), entry('src/a.ts'),
      entry('lib', true), entry('lib/b.ts'), entry('other', true), entry('other/c.ts'),
    ] });
    const revealed = selectionRevealIds(scene, new Set(['src/a.ts', 'lib/b.ts']));
    const visible = visibleNodeIds(scene, 0.001, revealed);
    for (const id of ['src/a.ts', 'lib/b.ts']) {
      expect(visible.has(id)).toBe(true);
      expect(detailLevel(scene[id], 0.001, 2, revealed)).toBe('code');
    }
    expect(detailLevel(scene.other, 0.001, 1, revealed)).toBe('summary');
    expect(visible.has('other/c.ts')).toBe(false);
  });

  it('restores normal overview when deselected and does not pin selected folders', () => {
    const scene = makeScene();
    const released = selectionRevealIds(scene, new Set());
    expect([...visibleNodeIds(scene, 0.001, released)]).toEqual(['']);
    expect(detailLevel(scene['src/core/a.ts'], 0.001, 3, released)).toBe('summary');
    expect(selectionRevealIds(scene, new Set(['src/core', 'missing.ts'])).size).toBe(0);
  });

  it('compensates outlines on zoom-out, limits tiny outlines, and never mutates geometry', () => {
    const scene = makeScene();
    const before = toDocument('/project', scene, { x: 0, y: 0, scale: 1 });
    const node = { ...scene['src/core/a.ts'], height: 600 };
    const macro = borderWidth(node, 0.1) * 0.1;
    const close = borderWidth(node, 1);
    expect(macro).toBeGreaterThan(close);
    expect(macro).toBeGreaterThanOrEqual(2);
    expect(borderWidth(node, 0.001)).toBeLessThanOrEqual(Math.min(node.width, node.height) * 0.06);
    for (const scale of [0.001, 0.1, 0.5, 1, 8]) visibleNodeIds(scene, scale);
    expect(toDocument('/project', scene, before.viewport)).toEqual(before);
  });
});

describe('folder click disclosure settings', () => {
  const settings = { revealFolderOnClick: true, revealFolderRecursivelyOnDoubleClick: true, revealSelectedFiles: true };
  const scene = () => reconcile({ rootPath: '/project', warnings: [], entries: [
    entry('', true), entry('src', true), entry('src/a.ts'),
    entry('src/core', true), entry('src/core/b.ts'),
    entry('other', true), entry('other/c.ts'),
  ] });

  it('reveals direct files on a folder click while deeper and unrelated branches follow zoom', () => {
    const project = scene();
    const revealed = selectionRevealIds(project, new Set(['src']), settings, new Map([['src', 'children']]));
    expect([...revealed].sort()).toEqual(['', 'src', 'src/a.ts']);
    expect(detailLevel(project['src/a.ts'], 0.001, 2, revealed)).toBe('code');
    expect(detailLevel(project['src/core'], 0.001, 2, revealed)).toBe('summary');
    expect(visibleNodeIds(project, 0.001, revealed).has('src/core/b.ts')).toBe(false);
  });

  it('recursively reveals every descendant on double-click at any zoom, preserving geometry', () => {
    const project = scene();
    const before = toDocument('/project', project, { x: 50, y: 80, scale: 0.001 });
    const revealed = selectionRevealIds(project, new Set(['src']), settings, new Map([['src', 'recursive']]));
    expect([...revealed].sort()).toEqual(['', 'src', 'src/a.ts', 'src/core', 'src/core/b.ts']);
    expect(detailLevel(project['src/core/b.ts'], 0.001, 3, revealed)).toBe('code');
    expect(visibleNodeIds(project, 0.001, revealed).has('other/c.ts')).toBe(false);
    expect(toDocument('/project', project, before.viewport)).toEqual(before);
  });

  it('does nothing for marquee-selected folders or disclosure entries no longer selected', () => {
    const project = scene();
    expect(selectionRevealIds(project, new Set(['src']), settings).size).toBe(0);
    expect(selectionRevealIds(project, new Set(), settings, new Map([['src', 'recursive']])).size).toBe(0);
  });

  it('treats each option independently and updates selected content immediately', () => {
    const project = scene();
    const selected = new Set(['src']);
    const shallow = new Map([['src', 'children']] as const);
    const deep = new Map([['src', 'recursive']] as const);
    expect(selectionRevealIds(project, selected, { ...settings, revealFolderOnClick: false }, shallow).size).toBe(0);
    expect(selectionRevealIds(project, selected, { ...settings, revealFolderOnClick: false, revealSelectedFiles: false }, deep).has('src/core/b.ts')).toBe(true);
    const oneLayer = selectionRevealIds(project, selected, { ...settings, revealFolderRecursivelyOnDoubleClick: false }, deep);
    expect(oneLayer.has('src/a.ts')).toBe(true);
    expect(oneLayer.has('src/core/b.ts')).toBe(false);
    expect(selectionRevealIds(project, new Set(['src/a.ts']), { ...settings, revealSelectedFiles: false }).size).toBe(0);
    expect(selectionRevealIds(project, new Set(['src/a.ts']), { ...settings, revealFolderOnClick: false }).has('src/a.ts')).toBe(true);
  });
});

describe('disclosure while drilling into a folder', () => {
  const settings = { revealFolderOnClick: true, revealFolderRecursivelyOnDoubleClick: true, revealSelectedFiles: true };

  it('keeps parent and child frames mounted between pointerdown and pointerup without revealing a dragged folder', () => {
    const scene = makeScene();
    const before = toDocument('/project', scene, { x: 50, y: 80, scale: 0.001 });
    const parent = selectionRevealIds(scene, new Set(['src']), settings, new Map([['src', 'children']]));
    // Pointerdown selects the child and prunes the previous parent's click state.
    const pressed = selectionRevealIds(scene, new Set(['src/core']), settings, new Map(), parent);
    expect(detailLevel(scene.src, 0.001, 1, pressed)).toBe('contents');
    expect(visibleNodeIds(scene, 0.001, pressed).has('src/core')).toBe(true);
    expect(detailLevel(scene['src/core'], 0.001, 2, pressed)).toBe('summary');
    expect(visibleNodeIds(scene, 0.001, pressed).has('src/core/a.ts')).toBe(false);
    // Pointerup commits the child click and releases the temporary disclosure in one update.
    const released = selectionRevealIds(scene, new Set(['src/core']), settings, new Map([['src/core', 'children']]));
    expect(detailLevel(scene.src, 0.001, 1, released)).toBe('contents');
    expect(detailLevel(scene['src/core'], 0.001, 2, released)).toBe('contents');
    expect(detailLevel(scene['src/core/a.ts'], 0.001, 3, released)).toBe('code');
    // A drag or cancellation commits no folder click; temporary retention must end.
    const cancelled = selectionRevealIds(scene, new Set(['src/core']), settings);
    expect([...visibleNodeIds(scene, 0.001, cancelled)]).toEqual(['']);
    expect(toDocument('/project', scene, before.viewport)).toEqual(before);
  });

  it('preserves the displayed branch during marquee gestures without making box-selected folders expand afterward', () => {
    const scene = makeScene();
    const previous = selectionRevealIds(scene, new Set(['src']), settings, new Map([['src', 'recursive']]));
    const during = selectionRevealIds(scene, new Set(['src/core']), settings, new Map(), previous);
    expect(detailLevel(scene['src/core/a.ts'], 0.001, 3, during)).toBe('code');
    const after = selectionRevealIds(scene, new Set(['src/core']), settings);
    expect(after.size).toBe(0);
  });
});
