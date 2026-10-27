import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { SceneNode } from './components/SceneNode';
import { AnnotationLayer } from './components/AnnotationLayer';
import { ConnectionLayer } from './components/ConnectionLayer';
import { RelationDialog, type RelationDraft } from './components/RelationDialog';
import { RelationsPanel } from './components/RelationsPanel';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { parseSidebarPreferences, SIDEBAR_KEY, type SidebarPanel } from './lib/sidebar';
import { attachAnnotations } from './lib/annotation-layout';
import { sourceRange } from './lib/dom-ranges';
import { anchorLabel, defaultLineStyle, edgeStatus, emptyRelations, noteNodeId, objectAnchor, resolveEdges, type Anchor, type AnchorMatch, type Relations, type ResolvedEdge, type Resolution } from './lib/relations';
import { SettingsDialog } from './components/SettingsDialog';
import { parseViewSettings, VIEW_SETTINGS_KEY } from './lib/settings';
import { LayoutMeasurements } from './components/LayoutMeasurements';
import { demo } from './lib/demo';
import { arrange, arrangeTree, cloneScene, MAX_SCALE, MIN_SCALE, MAX_WIDTH, MIN_WIDTH, moveNodes, normalize, overlaps, parseDocument, reconcile, toDocument, topLevelSelection, worldRect, type LayoutDocument, type ProjectSnapshot, type Rect, type Scene, type Viewport } from './lib/model';
import { CODE_DETAIL_SCALE, detailLevel, folderRevealScale, nodeDepth, selectionRevealIds, visibleNodeIds, type FolderDisclosure } from './lib/presentation';
import './App.css';

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; viewport: Viewport }
  | { kind: 'move'; startX: number; startY: number; scene: Scene; ids: string[]; scale: number; clickedId: string; moved: boolean }
  | { kind: 'resize'; startX: number; scene: Scene; id: string; scale: number }
  | { kind: 'select'; startX: number; startY: number; clientX: number; clientY: number; additive: string[]; folderId: string | null; moved: boolean };
interface LayoutPass {
  project: ProjectSnapshot;
  scene: Scene;
  arrange: boolean;
  persist: boolean;
  message: string;
  relations: Relations;
}
interface LayoutBackup { rootPath: string; scene: Scene; viewport: Viewport; relations: Relations }

async function persistLayout(rootPath: string, scene: Scene, viewport: Viewport, relations: Relations) {
  const document = toDocument(rootPath, scene, viewport, relations);
  if (rootPath.startsWith('demo:')) localStorage.setItem('icv:demo-layout', JSON.stringify(document));
  else await invoke('save_layout', { rootPath, document });
}

const initialViewport: Viewport = { x: 80, y: 80, scale: 0.65 };

function App() {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [scene, setScene] = useState<Scene>({});
  const [relations, setRelations] = useState<Relations>(emptyRelations);
  const [relationDraft, setRelationDraft] = useState<RelationDraft | null>(null);
  const [sidebar, setSidebar] = useState(() => parseSidebarPreferences(localStorage.getItem(SIDEBAR_KEY)));
  const relationsOpen = sidebar.open && sidebar.panel === 'relations';
  const togglePanel = useCallback((panel: SidebarPanel) => {
    setSidebar(old => ({ ...old, panel, open: !(old.open && old.panel === panel) }));
  }, []);
  const showRelations = () => setSidebar(old => ({ ...old, panel: 'relations', open: true }));
  const [invalidOnly, setInvalidOnly] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  const [codeChoice, setCodeChoice] = useState<Anchor | null>(null);
  const [focusMatch, setFocusMatch] = useState<AnchorMatch | null>(null);
  const [deletedRelation, setDeletedRelation] = useState<Relations | null>(null);
  const [viewport, setViewport] = useState(initialViewport);
  const [selection, setSelection] = useState<string[]>([]);
  const [gestureRevealIds, setGestureRevealIds] = useState<ReadonlySet<string>>(new Set());
  const [folderDisclosures, setFolderDisclosures] = useState<ReadonlyMap<string, FolderDisclosure>>(new Map());
  const [settings, setSettings] = useState(() => parseViewSettings(localStorage.getItem(VIEW_SETTINGS_KEY)));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectNodes = useCallback((ids: string[]) => {
    setCodeChoice(null);
    setSelection(ids);
    setFolderDisclosures(old => new Map([...old].filter(([id]) => ids.includes(id))));
  }, []);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [layoutPass, setLayoutPass] = useState<LayoutPass | null>(null);
  const [layoutBackup, setLayoutBackup] = useState<LayoutBackup | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('你的代码，可以有自己的位置。');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('icv:theme') || 'dark');
  const host = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const saving = useRef(false);
  const selectingSource = useRef(false);
  const folderClick = useRef<{ id: string; time: number; x: number; y: number } | null>(null);
  const state = useRef({ viewport, scene, project, dirty, busy, relations });
  state.current = { viewport, scene, project, dirty, busy, relations };
  const selected = useMemo(() => new Set(selection), [selection]);
  const revealedIds = useMemo(() => selectionRevealIds(scene, selected, settings, folderDisclosures, gestureRevealIds), [scene, selected, settings, folderDisclosures, gestureRevealIds]);
  const visibleIds = useMemo(() => visibleNodeIds(scene, viewport.scale, revealedIds), [scene, viewport.scale, revealedIds]);

  const edges = useMemo(() => project ? resolveEdges(project, relations) : [], [project, relations]);
  const invalidCount = edges.filter(edge => edgeStatus(edge) !== 'resolved').length;
  const activeAnchor = codeChoice ?? (selection.length === 1 && scene[selection[0]] && scene[selection[0]].entry.kind !== 'note' ? objectAnchor(scene[selection[0]].entry) : null);
  const connectable = selection.filter(id => scene[id] && scene[id].entry.kind !== 'note');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('icv:theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebar)); }, [sidebar]);

  const fit = useCallback((next: Scene) => {
    const root = next[''];
    if (!host.current || !root) return;
    const { width, height } = host.current.getBoundingClientRect();
    const scale = Math.max(MIN_SCALE, Math.min(1, (width - 120) / root.width, (height - 120) / root.height));
    if (state.current.project) setDirty(true);
    const nextViewport = { x: (width - root.width * scale) / 2 - root.x * scale, y: (height - root.height * scale) / 2 - root.y * scale, scale };
    setViewport(nextViewport);
    return nextViewport;
  }, []);

  const load = useCallback(async (rootPath: string, refresh = false) => {
    setBusy(true);
    setError('');
    try {
      const next = rootPath.startsWith('demo:') ? demo : await invoke<ProjectSnapshot>('read_project', { rootPath });
      let saved: LayoutDocument | null = null;
      if (!refresh) {
        const document = rootPath.startsWith('demo:')
          ? JSON.parse(localStorage.getItem('icv:demo-layout') || 'null')
          : await invoke<unknown>('load_layout', { rootPath: next.rootPath });
        saved = parseDocument(document, next.rootPath);
      }
      const nextRelations = refresh ? state.current.relations : saved?.relations ?? emptyRelations();
      const previous = refresh ? state.current.scene : {};
      const nextScene = attachAnnotations(reconcile(next, previous, saved), nextRelations, next, previous, saved);
      setRelations(nextRelations);
      setPendingAnchor(null);
      setCodeChoice(null);
      setSelectedEdgeId(null);
      setDeletedRelation(null);
      setGestureRevealIds(new Set());
      setProject(next);
      setScene(nextScene);
      selectNodes([]);
      setLayoutBackup(null);
      setDirty(refresh || !saved);
      setQuery('');
      if (!refresh) {
        if (saved) setViewport(saved.viewport);
        else fit(nextScene);
      }
      setLayoutPass({
        project: next, scene: nextScene, relations: nextRelations, arrange: !refresh && !saved, persist: false,
        message: refresh ? '项目已刷新，保留已有布局' : saved ? '已恢复保存的布局' : '已生成初始布局',
      });
    } catch (e) { setError(String(e)); setBusy(false); }
  }, [fit, selectNodes]);

  const completeLayoutPass = useCallback((measured: Scene) => {
    if (!layoutPass) return;
    const next = layoutPass.arrange ? arrangeTree(measured) : normalize(measured);
    setScene(next);
    setLayoutPass(null);
    const nextViewport = layoutPass.arrange ? fit(next) ?? state.current.viewport : state.current.viewport;
    if (!layoutPass.persist) {
      setMessage(layoutPass.message);
      setBusy(false);
      return;
    }
    void persistLayout(layoutPass.project.rootPath, next, nextViewport, layoutPass.relations)
      .then(() => { setDirty(false); setMessage(layoutPass.message); })
      .catch(e => { setError(String(e)); setDirty(true); })
      .finally(() => setBusy(false));
  }, [layoutPass, fit]);

  const resetLayout = () => {
    if (!project || busy) return;
    setLayoutBackup({ rootPath: project.rootPath, scene, viewport, relations });
    setBusy(true);
    setError('');
    selectNodes([]);
    setDirty(true);
    const next = attachAnnotations(reconcile(project), relations, project, {});
    setScene(next);
    setLayoutPass({ project, relations, scene: next, arrange: true, persist: true, message: '已重置整个布局并保存，可撤销此次重置' });
  };

  const undoReset = async () => {
    if (!layoutBackup || layoutBackup.rootPath !== project?.rootPath || busy) return;
    setBusy(true);
    setError('');
    selectNodes([]);
    setScene(layoutBackup.scene);
    setRelations(layoutBackup.relations);
    setViewport(layoutBackup.viewport);
    setDirty(true);
    try {
      await persistLayout(layoutBackup.rootPath, layoutBackup.scene, layoutBackup.viewport, layoutBackup.relations);
      setLayoutBackup(null);
      setDirty(false);
      setMessage('已恢复重置前的布局并保存');
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const save = useCallback(async () => {
    const current = state.current;
    if (!current.project || saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await persistLayout(current.project.rootPath, current.scene, current.viewport, current.relations);
      // Do not clear the dirty flag if another gesture happened while saving.
      if (state.current.scene === current.scene && state.current.viewport === current.viewport && state.current.relations === current.relations) setDirty(false);
      setMessage('布局已保存');
      return true;
    } catch (e) { setError(String(e)); return false; }
    finally { saving.current = false; setBusy(false); }
  }, []);

  const openProject = async () => {
    if (!isTauri()) { setError('本地项目读取需要在 Tauri 桌面应用中运行。可以先体验示例画布。'); return; }
    setBusy(true);
    setError('');
    try {
      // Save before switching; a save failure leaves the current project open.
      if (state.current.dirty && !await save()) return;
      setBusy(true);
      const rootPath = await invoke<string | null>('choose_project');
      if (rootPath) await load(rootPath);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('dialog')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!state.current.busy) void save(); }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebar(old => ({ ...old, open: !old.open }));
        return;
      }
      if (target.closest('input, textarea')) return;
      if (event.key === 'Escape') { setCodeChoice(null); setPendingAnchor(null); setSelectedEdgeId(null); setGestureRevealIds(new Set()); selectNodes([]); setMarquee(null); gesture.current = null; folderClick.current = null; }
      if (event.key.toLowerCase() === 'f' && !state.current.busy) fit(state.current.scene);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (state.current.dirty) event.preventDefault(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('beforeunload', beforeUnload); };
  }, [save, fit, selectNodes]);

  const zoomAt = useCallback((factor: number, x?: number, y?: number) => {
    const bounds = host.current?.getBoundingClientRect();
    if (!bounds || state.current.busy) return;
    const px = x ?? bounds.width / 2, py = y ?? bounds.height / 2;
    setViewport(old => {
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, old.scale * factor));
      return { scale, x: px - (px - old.x) * scale / old.scale, y: py - (py - old.y) * scale / old.scale };
    });
    if (state.current.project) setDirty(true);
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current || event.deltaY === 0) return;
      const rect = element.getBoundingClientRect();
      zoomAt(event.deltaY > 0 ? 1 / 1.12 : 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const capture = (event: ReactPointerEvent) => {
    // The frame survives when selecting a summary replaces it with source content.
    const owner = event.currentTarget.closest('[data-node-id]') ?? event.currentTarget;
    owner.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const startDrag = (event: ReactPointerEvent, id: string) => {
    if (event.button !== 0 || busy) return;
    event.stopPropagation();
    setCodeChoice(null);
    let ids = selection;
    if (event.shiftKey) {
      ids = selected.has(id) ? selection.filter(value => value !== id) : [...selection, id];
      selectNodes(ids);
      if (!ids.includes(id)) { folderClick.current = null; return; }
    } else if (!selected.has(id)) {
      ids = [id];
      selectNodes(ids);
    }
    // Retain the current disclosure until click/drag completion so selecting a
    // descendant cannot unmount its ancestor (or lose pointer capture) mid-press.
    setGestureRevealIds(revealedIds);
    capture(event);
    if (scene[id].entry.kind !== 'folder') folderClick.current = null;
    gesture.current = { kind: 'move', startX: event.clientX, startY: event.clientY, scene, ids, scale: viewport.scale, clickedId: id, moved: false };
  };
  const startResize = (event: ReactPointerEvent, id: string) => {
    if (event.button !== 0 || busy) return;
    event.stopPropagation();
    capture(event);
    gesture.current = { kind: 'resize', startX: event.clientX, scene, id, scale: viewport.scale };
  };
  const captureRepeatedFolderPress = (event: ReactPointerEvent) => {
    selectingSource.current = event.button === 0 && !!(event.target as Element).closest('.source');
    if ((event.target as Element).closest('.connection-layer, .annotation-node')) return;
    const previous = folderClick.current;
    // The first click can remove a summary cover and expose a child under the
    // pointer. Route the second press to the original folder's stable gesture.
    if (event.button === 0 && !event.shiftKey && previous && selected.has(previous.id)
      && event.timeStamp - previous.time <= 500
      && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 6) {
      startDrag(event, previous.id);
    }
  };
  const toWorld = (clientX: number, clientY: number) => {
    const bounds = host.current!.getBoundingClientRect();
    return { x: (clientX - bounds.left - viewport.x) / viewport.scale, y: (clientY - bounds.top - viewport.y) / viewport.scale };
  };
  const pointerDown = (event: ReactPointerEvent) => {
    if (busy) return;
    if (event.button === 1) {
      capture(event);
      gesture.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, viewport };
    } else if (event.button === 0 && !(event.target as HTMLElement).closest('.code-node, .asset-node, .annotation-node, .node-header, .summary-cover, .connection-layer')) {
      capture(event);
      setCodeChoice(null);
      const point = toWorld(event.clientX, event.clientY);
      const id = (event.target as HTMLElement).closest('[data-node-id]')?.getAttribute('data-node-id');
      gesture.current = { kind: 'select', startX: point.x, startY: point.y, clientX: event.clientX, clientY: event.clientY, additive: event.shiftKey ? selection : [], folderId: id !== undefined && id !== null && scene[id]?.entry.kind === 'folder' ? id : null, moved: false };
      setGestureRevealIds(revealedIds);
      if (!event.shiftKey) selectNodes([]);
      setMarquee({ ...point, width: 0, height: 0 });
    }
  };
  const pointerMove = (event: ReactPointerEvent) => {
    const active = gesture.current;
    if (!active) return;
    if (active.kind === 'pan') {
      setViewport({ ...active.viewport, x: active.viewport.x + event.clientX - active.startX, y: active.viewport.y + event.clientY - active.startY });
      if (project) setDirty(true);
    } else if (active.kind === 'move') {
      if (!active.moved && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 4) return;
      active.moved = true;
      folderClick.current = null;
      setScene(moveNodes(active.scene, active.ids, (event.clientX - active.startX) / active.scale, (event.clientY - active.startY) / active.scale));
      setDirty(true);
    } else if (active.kind === 'resize') {
      const next = cloneScene(state.current.scene);
      next[active.id].width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, active.scene[active.id].width + (event.clientX - active.startX) / active.scale));
      setScene(normalize(next));
      setDirty(true);
    } else {
      if (!active.moved && Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) < 4) return;
      active.moved = true;
      folderClick.current = null;
      const end = toWorld(event.clientX, event.clientY);
      const rect = { x: Math.min(active.startX, end.x), y: Math.min(active.startY, end.y), width: Math.abs(end.x - active.startX), height: Math.abs(end.y - active.startY) };
      setMarquee(rect);
      // Expanded folders need full enclosure; summary cards select by intersection.
      const ids = [...visibleIds].filter(id => {
        if (id === '') return false;
        const node = worldRect(scene, id);
        return scene[id].entry.kind === 'folder' && detailLevel(scene[id], viewport.scale, nodeDepth(scene, id), revealedIds) !== 'summary'
          ? node.x >= rect.x && node.y >= rect.y && node.x + node.width <= rect.x + rect.width && node.y + node.height <= rect.y + rect.height
          : overlaps(rect, node);
      });
      selectNodes([...new Set([...active.additive, ...ids])]);
    }
  };
  const endGesture = (event: ReactPointerEvent) => {
    setGestureRevealIds(new Set());
    const active = gesture.current;
    gesture.current = null;
    setMarquee(null);
    let folderId: string | null = null;
    if (active?.kind === 'move' && !active.moved && scene[active.clickedId]?.entry.kind === 'folder') {
      folderId = active.clickedId;
    } else if (active?.kind === 'select' && !active.moved && active.folderId !== null) {
      const id = active.folderId;
      const ids = active.additive.includes(id) ? active.additive.filter(value => value !== id) : [...active.additive, id];
      selectNodes(ids);
      if (ids.includes(id)) folderId = id;
    }
    if (folderId !== null) revealClickedFolder(folderId, event);
    else if (active) folderClick.current = null;
  };
  const revealClickedFolder = (id: string, event: { timeStamp: number; clientX: number; clientY: number }) => {
    const previous = folderClick.current;
    const double = previous?.id === id && event.timeStamp - previous.time <= 500
      && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 6;
    folderClick.current = double ? null : { id, time: event.timeStamp, x: event.clientX, y: event.clientY };
    setFolderDisclosures(old => new Map(old).set(id, double ? 'recursive' : old.get(id) ?? 'children'));
  };
  const cancelGesture = () => { selectingSource.current = false; setGestureRevealIds(new Set()); gesture.current = null; folderClick.current = null; setMarquee(null); };

  const measure = useCallback((id: string, height: number) => {
    setScene(old => {
      if (!old[id] || height < 1 || Math.abs(old[id].height - height) < 1) return old;
      const next = cloneScene(old);
      next[id].height = height;
      return normalize(next);
    });
  }, []);

  const focus = (id: string) => {
    if (busy) return;
    const bounds = host.current?.getBoundingClientRect();
    if (!bounds) return;
    const rect = worldRect(scene, id);
    let scale = Math.max(MIN_SCALE, Math.min(1, (bounds.width - 140) / rect.width, (bounds.height - 120) / Math.min(rect.height, 900)));
    if (scene[id].entry.kind !== 'folder') scale = Math.max(scale, CODE_DETAIL_SCALE * 1.05);
    let ancestor: string | null = id;
    while (ancestor !== null) {
      const node: Scene[string] = scene[ancestor];
      if (node.entry.kind === 'folder' && node.children.length) {
        scale = Math.max(scale, folderRevealScale(node, nodeDepth(scene, ancestor)) * 1.05);
      }
      ancestor = node.entry.parentId;
    }
    scale = Math.min(MAX_SCALE, scale);
    setViewport({ x: Math.max(40, (bounds.width - rect.width * scale) / 2) - rect.x * scale, y: 120 - rect.y * scale, scale });
    selectNodes([id]);
    setDirty(true);
  };
  const applyRelations = (next: Relations, text: string) => {
    if (!project) return;
    setScene(attachAnnotations(scene, next, project));
    setRelations(next);
    setDirty(true);
    setLayoutBackup(null);
    setDeletedRelation(null);
    setMessage(text);
  };
  const selectEdge = (id: string) => {
    setSelectedEdgeId(id);
    if (edges.some(edge => edge.id === id && edgeStatus(edge) === 'resolved')) setInvalidOnly(false);
    showRelations();
  };
  const editEdge = (id: string) => {
    if (busy) return;
    const edge = edges.find(edge => edge.id === id);
    if (!edge) return;
    setSelectedEdgeId(id);
    setCodeChoice(null);
    const annotation = relations.annotations.find(note => note.id === edge.annotationId);
    const connection = relations.connections.find(item => item.id === edge.connectionId);
    if (annotation) setRelationDraft({ kind: 'annotation', value: annotation });
    else if (connection) setRelationDraft({ kind: 'connection', value: connection });
  };
  const changeAnnotationText = (nodeId: string, text: string) => {
    if (busy || scene[nodeId]?.entry.content === text) return;
    const next = { ...relations, annotations: relations.annotations.map(note => noteNodeId(note.id) === nodeId ? { ...note, text } : note) };
    // Update text in place: measuring its natural height adjusts its parent
    // without reattaching the note or moving it while typing.
    setRelations(next);
    setScene(old => {
      if (!old[nodeId]) return old;
      const nextScene = cloneScene(old);
      nextScene[nodeId].entry = { ...nextScene[nodeId].entry, content: text };
      return nextScene;
    });
    setDirty(true);
    setLayoutBackup(null);
    setDeletedRelation(null);
    setMessage('批注已更新，记得保存布局');
  };
  const newAnnotation = () => {
    if (!activeAnchor || busy) return;
    cancelGesture();
    setRelationDraft({ kind: 'annotation', value: { id: crypto.randomUUID(), text: '', target: activeAnchor, style: { ...defaultLineStyle(), color: '#c5a65e' } } });
  };
  const newConnection = () => {
    if (busy) return;
    const from = pendingAnchor ?? (connectable.length === 2 ? objectAnchor(scene[connectable[0]].entry) : activeAnchor);
    const to = pendingAnchor ? activeAnchor : connectable.length === 2 ? objectAnchor(scene[connectable[1]].entry) : null;
    if (!from || !to) return;
    cancelGesture();
    setRelationDraft({ kind: 'connection', value: { id: crypto.randomUUID(), from, to, style: defaultLineStyle() } });
  };
  const saveRelation = (draft: RelationDraft) => {
    const next = draft.kind === 'annotation'
      ? { ...relations, annotations: [...relations.annotations.filter(note => note.id !== draft.value.id), draft.value] }
      : { ...relations, connections: [...relations.connections.filter(item => item.id !== draft.value.id), draft.value] };
    applyRelations(next, draft.kind === 'annotation' ? '批注已加入画布，记得保存布局' : '连线已创建，记得保存布局');
    setSelectedEdgeId(`${draft.kind === 'annotation' ? 'note' : 'connection'}:${draft.value.id}`);
    setRelationDraft(null);
    setPendingAnchor(null);
    setCodeChoice(null);
    showRelations();
    setInvalidOnly(false);
    if (draft.kind === 'annotation') {
      selectNodes([noteNodeId(draft.value.id)]);
      if (!relations.annotations.some(note => note.id === draft.value.id)) setFocusMatch({ nodeId: noteNodeId(draft.value.id) });
    }
  };
  const deleteDraft = () => {
    if (!relationDraft) return;
    const backup = toDocument(project!.rootPath, scene, viewport, relations).relations;
    const next = relationDraft.kind === 'annotation'
      ? { ...relations, annotations: relations.annotations.filter(note => note.id !== relationDraft.value.id) }
      : { ...relations, connections: relations.connections.filter(item => item.id !== relationDraft.value.id) };
    applyRelations(next, '已删除，可撤销此次删除');
    setDeletedRelation(backup);
    setRelationDraft(null);
    setSelectedEdgeId(null);
    selectNodes([]);
  };
  const readCodeSelection = (event: ReactPointerEvent) => {
    const beganOnSource = selectingSource.current;
    selectingSource.current = false;
    if (event.button !== 0 || (!beganOnSource && !(event.target as Element).closest('.source'))) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) { setCodeChoice(null); return; }
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement;
    const source = start?.closest<HTMLElement>('code[data-source-id]');
    if (!source || end?.closest('code[data-source-id]') !== source || !range.toString().trim()) { setCodeChoice(null); return; }
    setCodeChoice({ version: 1, kind: 'code', mode: 'full', path: source.dataset.sourceId!, text: range.toString() });
  };
  const focusResolution = (resolution: Resolution) => {
    if (busy || resolution.status !== 'resolved') return;
    const match = resolution.matches[0];
    if (!scene[match.nodeId]) return;
    focus(match.nodeId);
    if (match.start !== undefined) setFocusMatch(match);
  };
  const frameEdge = (edge: ResolvedEdge) => {
    if (busy || edgeStatus(edge) !== 'resolved' || !host.current) return;
    const ids = [...new Set([edge.from.matches[0].nodeId, edge.to.matches[0].nodeId])];
    if (ids.some(id => !scene[id])) return;
    const rects = ids.map(id => worldRect(scene, id));
    const x = Math.min(...rects.map(rect => rect.x)), y = Math.min(...rects.map(rect => rect.y));
    const width = Math.max(...rects.map(rect => rect.x + rect.width)) - x;
    const height = Math.max(...rects.map(rect => rect.y + rect.height)) - y;
    const bounds = host.current.getBoundingClientRect();
    const scale = Math.max(MIN_SCALE, Math.min(1, (bounds.width - 80) / width, (bounds.height - 220) / height));
    selectNodes(ids);
    setViewport({ x: (bounds.width - width * scale) / 2 - x * scale, y: 120 - y * scale, scale });
    setSelectedEdgeId(edge.id);
    setDirty(true);
  };
  useLayoutEffect(() => {
    if (!focusMatch || !host.current) return;
    if (focusMatch.start === undefined) {
      const edge = edges.find(item => item.from.matches[0]?.nodeId === focusMatch.nodeId);
      if (edge && edgeStatus(edge) === 'resolved') frameEdge(edge);
      else focus(focusMatch.nodeId);
      setFocusMatch(null);
      return;
    }
    const source = [...host.current.querySelectorAll<HTMLElement>('code[data-source-id]')].find(element => element.dataset.sourceId === focusMatch.nodeId);
    const range = source && sourceRange(source, focusMatch.start!, focusMatch.end!);
    if (range) {
      const target = [...range.getClientRects()].find(rect => rect.width > 0 && rect.height > 0);
      const bounds = host.current.getBoundingClientRect();
      if (target) setViewport(old => ({ ...old, x: old.x + bounds.width / 2 - (target.x + target.width / 2 - bounds.x), y: old.y + 160 - (target.y - bounds.y) }));
    }
    setFocusMatch(null);
  }, [focusMatch]);

  const organize = () => {
    const id = selection.length === 1 && scene[selection[0]]?.entry.kind === 'folder' ? selection[0] : null;
    if (id === null) return;
    setScene(arrange(scene, id));
    setDirty(true);
    setMessage(`已整理 ${scene[id].entry.name} 的直接子项`);
  };
  const files = project?.entries.filter(entry => entry.kind === 'file') ?? [];
  const visibleFiles = files.filter(entry => entry.id.toLowerCase().includes(query.toLowerCase()));
  const directorySelected = selection.length === 1 && scene[selection[0]]?.entry.kind === 'folder';
  const demoMode = project?.rootPath.startsWith('demo:');

  return <main className="app-shell">
    <header className="app-toolbar">
      <div className="brand"><img className="brand-logo" src="/logo.svg" width="34" height="34" alt="" /><strong>Infinity<span>CodeView</span></strong><span className="version">PREVIEW 01</span></div>
      <div className="toolbar-actions">
        <button onClick={() => void openProject()} disabled={busy} className="primary-button">＋ 打开项目</button>
        <button onClick={() => project && void load(project.rootPath, true)} disabled={!project || busy} title="重新读取磁盘内容，保留已有位置">↻ 刷新</button>
        <button onClick={resetLayout} disabled={!project || busy} title="清除当前位置与自定义宽度，按最新默认值重新排布整个项目并保存">重置布局</button>
        {layoutBackup && <button onClick={() => void undoReset()} disabled={busy}>撤销重置</button>}
        <button onClick={() => void save()} disabled={!project || busy}>保存布局{dirty && <span className="dirty-dot" />}</button>
        <span className="toolbar-divider" />
        <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="切换明暗主题" aria-label="切换明暗主题">{theme === 'dark' ? '☼' : '☾'}</button>
      </div>
    </header>
    <div className="workspace">
      <WorkspaceSidebar preferences={sidebar} onToggle={panel => { cancelGesture(); togglePanel(panel); }} onResize={width => setSidebar(old => ({ ...old, width }))} onSettings={() => { cancelGesture(); setSettingsOpen(true); }} relationCount={edges.length} invalidCount={invalidCount}>
        {sidebar.panel === 'explorer' ? (
          <aside className="sidebar">
            <div className="sidebar-caption"><span>项目文件</span><button className="sidebar-collapse" onClick={() => setSidebar(old => ({ ...old, open: false }))} aria-label="收起侧栏" title="收起侧栏 (Cmd/Ctrl+B)">‹</button></div>
            <div className="project-heading"><span className="project-avatar">{project ? '▱' : '∞'}</span><div><strong>{scene['']?.entry.name || '未打开项目'}</strong><small>{demoMode ? '交互示例 · 不读取本地文件' : project ? '本地项目 · 只读' : '建立你的代码地图'}</small></div></div>
            <label className="search-box"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="查找文件…" aria-label="查找文件" disabled={!project} /><kbd>⌕</kbd></label>
            <div className="file-list">
              {project && <button className={`tree-item root-item ${selected.has('') ? 'active' : ''}`} onClick={event => { if (!busy) { selectNodes(['']); revealClickedFolder('', event); } }}><span>▱</span><strong>{scene[''].entry.name}</strong></button>}
              {visibleFiles.map(entry => <button key={entry.id} className={`tree-item ${selected.has(entry.id) ? 'active' : ''}`} onClick={() => focus(entry.id)} title={entry.id}><span className="file-type">{entry.language === 'typescript' ? 'TS' : '·'}</span><span className="tree-file"><span>{entry.name}</span><small>{entry.parentId || '/'}</small></span></button>)}
              {project && visibleFiles.length === 0 && <p className="muted sidebar-empty">没有匹配的文件</p>}
            </div>
            <div className="sidebar-bottom"><span className="readonly-dot" /> 源码只读<span>{files.length} 个文件</span></div>
          </aside>
        ) : (<RelationsPanel relations={relations} edges={edges} selectedId={selectedEdgeId} invalidOnly={invalidOnly} onFilter={setInvalidOnly} onSelect={selectEdge} onEdit={editEdge} onFocus={focusResolution} onFrame={frameEdge} onClose={() => setSidebar(old => ({ ...old, open: false }))} />)}
      </WorkspaceSidebar>
      <section className="canvas-shell">
        <div className="canvas-label"><span className="live-dot" /><span>{demoMode ? '示例空间' : '项目空间'}</span><span className="label-separator">/</span><span>{project ? viewport.scale < CODE_DETAIL_SCALE ? '分层概览' : '代码视图' : '等待探索'}</span></div>
        {project && <div className="selection-tools"><span>{selection.length ? `已选择 ${topLevelSelection(scene, selection).length} 项` : viewport.scale < CODE_DETAIL_SCALE ? '单击文件夹展开一层，双击递归展开' : '拖动标题，摆放代码'}</span><button disabled={!directorySelected || busy} onClick={organize} title="选择单个文件夹后，整理其直接子项">整理这个文件夹</button></div>}
        {project && <div className="relation-tools" onPointerDown={event => event.preventDefault()}>
          <button disabled={!activeAnchor || busy} onClick={newAnnotation}>{codeChoice ? '批注选中代码' : '添加批注'}</button>
          {pendingAnchor ? <><button className="primary-button" disabled={!activeAnchor || busy} onClick={newConnection}>连接到当前目标</button><button onClick={() => setPendingAnchor(null)}>取消连线</button></> : <><button disabled={!activeAnchor || busy} onClick={() => { if (activeAnchor) { setPendingAnchor(activeAnchor); setMessage('已记录起点，再选择一个文件、目录或代码片段作为终点'); } }}>设为连线起点</button><button disabled={connectable.length !== 2 || busy} onClick={newConnection}>连接所选两项</button></>}
          <button className={relationsOpen ? 'tool-active' : ''} onClick={() => togglePanel('relations')}>批注与连线 {edges.length}{invalidCount > 0 && <span className="invalid-count">{invalidCount} 失效</span>}</button>
          {deletedRelation && <button onClick={() => applyRelations(deletedRelation, '已撤销删除')}>撤销删除</button>}
          {codeChoice && <span className="code-choice" title={anchorLabel(codeChoice)}>已选 {codeChoice.kind === 'code' ? codeChoice.text.length : 0} 字符<button onClick={() => { setCodeChoice(null); window.getSelection()?.removeAllRanges(); }} aria-label="清除代码锚点选择">×</button></span>}
          {pendingAnchor && <span className="pending-anchor" title={anchorLabel(pendingAnchor)}>起点：{anchorLabel(pendingAnchor)}</span>}
        </div>}
        <div ref={host} className="canvas-viewport" onPointerDownCapture={captureRepeatedFolderPress} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => { endGesture(event); readCodeSelection(event); }} onPointerCancel={cancelGesture} onLostPointerCapture={() => { if (gesture.current) cancelGesture(); }} onAuxClick={event => event.preventDefault()} style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${32 * Math.max(0.3, viewport.scale)}px ${32 * Math.max(0.3, viewport.scale)}px` }}>
          {project && <div className="world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
            <SceneNode node={scene['']} scene={scene} scale={viewport.scale} onFocus={focus} selected={selected} revealedIds={revealedIds} onDrag={startDrag} onResize={startResize} onMeasure={measure} />
            {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
          </div>}
          {project && <ConnectionLayer host={host} scene={scene} viewport={viewport} visibleIds={visibleIds} edges={edges} selectedId={selectedEdgeId} onSelect={selectEdge} />}
          {project && <AnnotationLayer scene={scene} viewport={viewport} visibleIds={visibleIds} revealedIds={revealedIds} selected={selected} onDrag={startDrag} onResize={startResize} onMeasure={measure} onFocus={focus} onTextChange={changeAnnotationText} />}
        </div>
        {!project && <div className="welcome"><div className="welcome-eyebrow">A SPATIAL HOME FOR YOUR CODE</div><div className="welcome-visual"><div>src<span>▱</span><div>app.tsx<i /><i /><i /></div><div>utils.ts<i /><i /></div></div><span className="orbit-mark">∞</span></div><h1>让代码，留在你记得的位置。</h1><p>展开整个项目，自由摆放文件。<br />用空间记忆理解代码，在项目变化时保留你的布局。</p><div className="welcome-actions"><button className="primary-button" onClick={() => void openProject()} disabled={busy}>选择项目文件夹 <span>↗</span></button><button onClick={() => void load(demo.rootPath)} disabled={busy}>体验示例</button></div><small>DOM 画布 · 只读浏览 · 布局独立保存</small></div>}
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}
        {project && project.warnings.length > 0 && <details className="warning-panel"><summary>{project.warnings.length} 条读取提示</summary>{project.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
        <div className="canvas-help"><kbd>滚轮</kbd> 缩放 <span>·</span> <kbd>中键</kbd> 平移 <span>·</span> <kbd>左键</kbd> 空白处框选 <span>·</span> <kbd>Shift</kbd> 多选</div>
        <div className="zoom-controls"><button disabled={busy} onClick={() => zoomAt(1 / 1.25)} aria-label="缩小">−</button><button disabled={busy} className="zoom-value" onClick={() => { setViewport(old => ({ ...old, scale: 1 })); if (project) setDirty(true); }} title="重置为 100%">{Number((viewport.scale * 100).toFixed(viewport.scale < 0.1 ? 1 : 0))}%</button><button disabled={busy} onClick={() => zoomAt(1.25)} aria-label="放大">＋</button><span /><button disabled={busy} onClick={() => { fit(scene); if (project) setDirty(true); }} title="适应全图 (F)" aria-label="适应全图">⛶</button></div>
      </section>
    </div>
    {project && relationDraft && <RelationDialog key={`${relationDraft.kind}:${relationDraft.value.id}`} draft={relationDraft} project={project} existing={relationDraft.kind === 'annotation' ? relations.annotations.some(note => note.id === relationDraft.value.id) : relations.connections.some(item => item.id === relationDraft.value.id)} onSave={saveRelation} onDelete={deleteDraft} onClose={() => setRelationDraft(null)} />}
    {settingsOpen && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    {layoutPass && <LayoutMeasurements scene={layoutPass.scene} onComplete={completeLayoutPass} />}
    <footer className="statusbar"><div><span className={`status-dot ${busy ? 'busy' : ''}`} /><span role="status">{busy ? '正在处理…' : message}</span></div><div>{dirty ? '布局有未保存的更改' : project ? '布局已同步' : 'InfinityCodeView'}<span className="status-separator" />{demoMode ? 'DEMO' : 'READ ONLY'}</div></footer>
  </main>;
}

export default App;
