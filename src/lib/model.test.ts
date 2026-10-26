import { describe, expect, it } from 'vitest';
import { arrange, arrangeTree, moveNodes, normalize, overlaps, parseDocument, reconcile, toDocument, worldRect, type ProjectEntry, type ProjectSnapshot } from './model';

const entry = (id: string, kind: 'folder' | 'file' = 'file', content: string | null = null): ProjectEntry => ({
  id, parentId: id === '' ? null : id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '',
  kind, name: id.split('/').pop() || 'project', content, language: content === null ? null : 'typescript', notice: null,
});
const project = (...entries: ProjectEntry[]): ProjectSnapshot => ({ rootPath: '/project', entries: [entry('', 'folder'), ...entries], warnings: [] });

describe('spatial layout', () => {
  it('packs initial siblings without overlap and wraps folders around their contents', () => {
    const scene = reconcile(project(entry('src', 'folder'), entry('src/a.ts', 'file', 'const a = 1;'), entry('src/b.ts', 'file', 'x\n'.repeat(40)), entry('empty', 'folder')));
    expect(overlaps(scene['src/a.ts'], scene['src/b.ts'])).toBe(false);
    expect(scene.empty.width).toBe(240);
    expect(scene['src/a.ts'].x).toBeGreaterThanOrEqual(24);
    expect(scene.src.height).toBeGreaterThan(scene['src/b.ts'].height);
  });
  it('uses measured card heights for the first layout', () => {
    const scene = reconcile(project(entry('src', 'folder'), entry('src/a', 'file', 'a'), entry('src/b', 'file', 'b')));
    scene['src/a'].height = 1900;
    const measured = arrangeTree(scene);
    expect(overlaps(measured['src/a'], measured['src/b'])).toBe(false);
    expect(measured.src.height).toBeGreaterThan(1900);
  });
  it('moving a child beyond the old boundary expands its folder and preserves sibling world positions', () => {
    const scene = reconcile(project(entry('src', 'folder'), entry('src/a'), entry('src/b')));
    const before = worldRect(scene, 'src/b');
    const moved = moveNodes(scene, ['src/a'], -900, -500);
    expect(worldRect(moved, 'src/b')).toEqual(before);
    expect(worldRect(moved, 'src/a').x).toBe(worldRect(scene, 'src/a').x - 900);
    expect(moved['src/a'].x).toBeGreaterThanOrEqual(24);
    expect(moved['src/a'].y).toBeGreaterThanOrEqual(52);
  });
  it('moves selected descendants only once when their parent is also selected', () => {
    const scene = reconcile(project(entry('src', 'folder'), entry('src/a')));
    const moved = moveNodes(scene, ['src', 'src/a'], 123, -88);
    expect(worldRect(moved, 'src/a').x).toBe(worldRect(scene, 'src/a').x + 123);
    expect(worldRect(moved, 'src/a').y).toBe(worldRect(scene, 'src/a').y - 88);
  });
  it('preserves surviving world positions across additions, deletions and code growth', () => {
    const original = project(entry('src', 'folder'), entry('src/a', 'file', 'a'), entry('src/b'));
    const scene = moveNodes(reconcile(original), ['src/b'], 800, 200);
    const before = worldRect(scene, 'src/b');
    const added = reconcile(project(entry('src', 'folder'), entry('src/a', 'file', 'a\n'.repeat(200)), entry('src/b'), entry('src/c')), scene);
    expect(worldRect(added, 'src/b')).toEqual(before);
    expect(added['src/a'].height).toBeGreaterThan(scene['src/a'].height);
    expect(overlaps(added['src/c'], added['src/a'])).toBe(false);
    const removed = reconcile(project(entry('src', 'folder'), entry('src/b')), added);
    expect(worldRect(removed, 'src/b')).toEqual(before);
  });
  it('arranges only the chosen folder and normalizing twice is stable', () => {
    const scene = moveNodes(reconcile(project(entry('src', 'folder'), entry('src/a'), entry('src/b'), entry('readme'))), ['src/a'], 900, 500);
    const result = arrange(scene, 'src');
    expect(worldRect(result, 'readme')).toEqual(worldRect(scene, 'readme'));
    expect(normalize(structuredClone(result))).toEqual(result);
  });
  it('handles filenames that are also JavaScript object property names', () => {
    const scene = reconcile(project(entry('__proto__'), entry('constructor')));
    expect(scene['__proto__'].entry.id).toBe('__proto__');
    expect(scene['constructor' as string].entry.id).toBe('constructor');
    expect(Number.isFinite(scene['__proto__'].x)).toBe(true);
  });
  it('round trips saved geometry and rejects corrupt saved data', () => {
    const p = project(entry('a'), entry('b'));
    const scene = moveNodes(reconcile(p), ['b'], -300, 200);
    const doc = toDocument(p.rootPath, scene, { x: 10, y: -20, scale: 0.7 });
    const restored = reconcile(p, {}, parseDocument(JSON.parse(JSON.stringify(doc)), p.rootPath));
    expect(worldRect(restored, 'b')).toEqual(worldRect(scene, 'b'));
    expect(() => parseDocument({ ...doc, viewport: { x: 0, y: 0, scale: -1 } }, p.rootPath)).toThrow();
  });
});
