import { describe, expect, it } from 'vitest';
import { attachAnnotations } from './annotation-layout';
import { moveNodes, parseDocument, reconcile, toDocument, worldRect, type ProjectEntry, type ProjectSnapshot } from './model';
import { defaultLineStyle, emptyRelations, noteNodeId, objectAnchor, parseRelations, pathChoices, resolveAnchor, resolveEdges, edgeStatus, type Anchor, type Relations } from './relations';

const entry = (id: string, kind: 'file' | 'folder' = 'file', content: string | null = null): ProjectEntry => ({
  id, parentId: id === '' ? null : id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '', kind,
  name: id.split('/').pop() || 'project', content, language: content === null ? null : 'typescript', notice: null,
});
const project = (...entries: ProjectEntry[]): ProjectSnapshot => ({ rootPath: '/project', entries: [entry('', 'folder'), ...entries], warnings: [] });
const code = (text: string, path: string | null = null): Anchor => ({ version: 1, kind: 'code', text, path, mode: 'suffix' });
const relations = (target: Anchor): Relations => ({ annotations: [{ id: 'note-1', text: '保持这个位置', target, style: defaultLineStyle() }], connections: [] });

describe('reference anchors', () => {
  it('uses path segments and distinguishes full paths from suffixes', () => {
    const p = project(entry('src/user.ts'), entry('other/src/user.ts'), entry('notuser.ts'));
    const anchor: Anchor = { version: 1, kind: 'object', objectKind: 'file', path: 'user.ts', mode: 'suffix' };
    expect(resolveAnchor(p, anchor).count).toBe(2);
    expect(resolveAnchor(p, { ...anchor, path: 'src/user.ts', mode: 'full' }).count).toBe(1);
    expect(resolveAnchor(p, { ...anchor, path: 'src/user.ts' }).count).toBe(2);
    expect(resolveAnchor(p, { ...anchor, path: 'User.ts' }).status).toBe('missing');
  });
  it('relocates a unique suffix after a move and detects later ambiguity', () => {
    const anchor: Anchor = { version: 1, kind: 'object', objectKind: 'file', path: 'user.ts', mode: 'suffix' };
    expect(resolveAnchor(project(entry('src/modules/account/user.ts')), anchor).matches[0].nodeId).toBe('src/modules/account/user.ts');
    expect(resolveAnchor(project(entry('src/user.ts'), entry('tests/user.ts')), anchor).status).toBe('ambiguous');
  });
  it('counts duplicate and overlapping snippet occurrences, including within one file', () => {
    const p = project(entry('a.ts', 'file', 'ababa\nunique();'), entry('b.ts', 'file', 'unique();'));
    expect(resolveAnchor(p, code('aba', 'a.ts')).count).toBe(2);
    expect(resolveAnchor(p, code('unique();')).status).toBe('ambiguous');
    expect(resolveAnchor(p, code('unique();', 'a.ts')).status).toBe('resolved');
    expect(resolveAnchor(p, code('')) .status).toBe('missing');
  });
  it('normalizes CRLF for DOM selections and ignores non-readable entries', () => {
    const p = project(entry('a.ts', 'file', 'first\r\nsecond\r\nlast'), entry('binary.ts'), entry('folder', 'folder'));
    const result = resolveAnchor(p, code('second\nlast'));
    expect(result.matches).toEqual([{ nodeId: 'a.ts', start: 6, end: 17 }]);
  });
  it('limits candidate details without understating the match count', () => {
    const result = resolveAnchor(project(entry('a.ts', 'file', 'x'.repeat(1000))), code('x'));
    expect(result.count).toBe(1000);
    expect(result.matches).toHaveLength(20);
  });
  it('offers path scopes with independent file match counts', () => {
    const p = project(entry('src/a.ts', 'file', 'unique'), entry('other/a.ts', 'file', 'different'));
    const choices = pathChoices(p, code('unique', 'src/a.ts'));
    expect(choices.find(choice => choice.path === 'a.ts')?.count).toBe(2);
    expect(choices.find(choice => choice.path === null)?.count).toBe(2);
  });
  it('treats project root and folder/file identities separately', () => {
    const p = project(entry('src', 'folder'), entry('src/a'));
    expect(resolveAnchor(p, objectAnchor(p.entries[0])).matches[0].nodeId).toBe('');
    expect(resolveAnchor(p, { version: 1, kind: 'object', path: 'src', mode: 'suffix', objectKind: 'file' }).status).toBe('missing');
  });
});

describe('annotations and persistence', () => {
  it('creates a contained virtual sibling without moving project files', () => {
    const p = project(entry('src', 'folder'), entry('src/a.ts', 'file', 'hello'));
    const base = reconcile(p);
    const before = worldRect(base, 'src/a.ts');
    const data = relations(objectAnchor(p.entries[2]));
    const scene = attachAnnotations(base, data, p);
    const note = scene[noteNodeId('note-1')];
    expect(note.entry.parentId).toBe('src');
    expect(worldRect(scene, 'src/a.ts')).toEqual(before);
    expect(note.x + note.width).toBeLessThan(scene.src.width);
    expect(base.src.children).toEqual(['src/a.ts']); // no shared-array mutation
  });
  it('restores and refreshes note positions even when an earlier file disappears', () => {
    const p = project(entry('src', 'folder'), entry('src/a.ts', 'file', 'hello'), entry('src/b'));
    const data = relations(objectAnchor(p.entries[2]));
    const scene = moveNodes(attachAnnotations(reconcile(p), data, p), [noteNodeId('note-1')], -1000, -900);
    const doc = parseDocument(JSON.parse(JSON.stringify(toDocument(p.rootPath, scene, { x: 0, y: 0, scale: 1 }, data))), p.rootPath)!;
    const restored = attachAnnotations(reconcile(p, {}, doc), doc.relations, p, {}, doc);
    expect(worldRect(restored, noteNodeId('note-1'))).toEqual(worldRect(scene, noteNodeId('note-1')));
    const next = project(entry('src', 'folder'), entry('src/b'));
    const refreshed = attachAnnotations(reconcile(next, scene), data, next, scene);
    expect(worldRect(refreshed, noteNodeId('note-1'))).toEqual(worldRect(scene, noteNodeId('note-1')));
    expect(refreshed[noteNodeId('note-1')].entry.notice).toBe('目标缺失');
  });
  it('keeps notes after their entire parent is removed and can resolve again later', () => {
    const p = project(entry('src', 'folder'), entry('src/a.ts'));
    const data = relations({ ...objectAnchor(p.entries[2]), path: 'a.ts', mode: 'suffix' } as Anchor);
    const scene = attachAnnotations(reconcile(p), data, p);
    const missing = project();
    const refreshed = attachAnnotations(reconcile(missing, scene), data, missing, scene);
    expect(refreshed[noteNodeId('note-1')].entry.parentId).toBe('');
    const moved = project(entry('new', 'folder'), entry('new/a.ts'));
    const recovered = attachAnnotations(reconcile(moved, refreshed), data, moved, refreshed);
    expect(recovered[noteNodeId('note-1')].entry.parentId).toBe('new');
    expect(edgeStatus(resolveEdges(moved, data)[0])).toBe('resolved');
  });
  it('migrates old layouts and validates graph records instead of discarding them', () => {
    const p = project(entry('a'));
    const doc = toDocument(p.rootPath, reconcile(p), { x: 0, y: 0, scale: 1 });
    expect(parseDocument({ ...doc, version: 1, relations: undefined }, p.rootPath)?.relations).toEqual(emptyRelations());
    expect(() => parseRelations({ annotations: [], connections: [{ id: 'bad' }] })).toThrow();
    const data = relations({ ...objectAnchor(p.entries[1]), extensions: { contextBefore: 'future' } });
    expect(parseRelations(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(() => parseRelations({ ...data, annotations: [data.annotations[0], data.annotations[0]] })).toThrow();
  });
});
