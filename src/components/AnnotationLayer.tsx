import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { worldRect, type Scene, type SceneNode, type Viewport } from '../lib/model';
import { borderWidth, CODE_DETAIL_SCALE, detailLevel, nodeDepth } from '../lib/presentation';
import { nodeColorStyle } from '../lib/node-colors';
import { SummaryTitle } from './SummaryTitle';

interface Props {
  scene: Scene;
  viewport: Viewport;
  visibleIds: ReadonlySet<string>;
  revealedIds: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onDrag: (event: PointerEvent, id: string) => void;
  onResize: (event: PointerEvent, id: string) => void;
  onMeasure: (id: string, height: number) => void;
  onFocus: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
}

function AnnotationCard({ node, scene, viewport, revealedIds, selected, onDrag, onResize, onMeasure, onFocus, onTextChange }: Omit<Props, 'visibleIds'> & { node: SceneNode }) {
  const [editing, setEditing] = useState(false);
  const originalText = useRef('');
  const card = useRef<HTMLElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { entry } = node;
  const text = entry.content ?? '';
  const rect = worldRect(scene, entry.id);
  const depth = nodeDepth(scene, entry.id);
  const summary = !editing && detailLevel(node, viewport.scale, depth, revealedIds) === 'summary';

  useLayoutEffect(() => {
    if (summary || !content.current) return;
    const element = content.current;
    const observer = new ResizeObserver(() => onMeasure(entry.id, element.offsetHeight + 2));
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry.id, summary, onMeasure]);

  useLayoutEffect(() => {
    if (!editing || !editor.current) return;
    editor.current.focus({ preventScroll: true });
    editor.current.setSelectionRange(editor.current.value.length, editor.current.value.length);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const finishOutside = (event: globalThis.PointerEvent) => {
      if (event.button === 0 && !card.current?.contains(event.target as globalThis.Node)) setEditing(false);
    };
    // Canvas drag handlers prevent the default focus change, so blur alone
    // cannot finish editing when the user clicks a file header or blank canvas.
    document.addEventListener('pointerdown', finishOutside, true);
    return () => document.removeEventListener('pointerdown', finishOutside, true);
  }, [editing]);

  return <article ref={card}
    className={`scene-node typed-node annotation-node ${summary ? 'summary-node' : ''} ${selected.has(entry.id) ? 'selected' : ''} ${editing ? 'annotation-editing' : ''}`}
    style={{
      ...nodeColorStyle('yellow'),
      left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      '--node-stroke': `${borderWidth(node, viewport.scale)}px`,
      '--selection-stroke': `${2 / viewport.scale}px`,
      '--selection-offset': `${2 / viewport.scale}px`,
    } as CSSProperties}
    data-node-id={entry.id} data-tone="yellow" data-detail={summary ? 'summary' : 'code'} data-depth={depth}
    title={editing ? undefined : '拖动移动 · 双击编辑 · Shift 多选'}
    onPointerDown={event => {
      if (editing) {
        // Keep native caret placement and text selection; middle-button panning
        // still bubbles to the viewport.
        if (event.button === 0) event.stopPropagation();
      } else onDrag(event, entry.id);
    }}
    onDoubleClick={event => {
      event.stopPropagation();
      if (editing || (event.target as Element).closest('.resize-handle')) return;
      event.preventDefault();
      originalText.current = text;
      if (viewport.scale < CODE_DETAIL_SCALE) onFocus(entry.id);
      setEditing(true);
    }}
  >
    {summary ? <div className="summary-cover"><SummaryTitle name={text || '批注'} width={node.width} height={node.height} /></div> : <div ref={content}>
      {editing ? <div className="annotation-editor-wrap">
        <div className="annotation-text annotation-editor-mirror" aria-hidden="true">{text + '\u200b'}</div>
        <textarea ref={editor} className="annotation-text annotation-editor" aria-label="批注内容" value={text} rows={1} maxLength={100000}
          placeholder="写下批注…" spellCheck={false}
          onChange={event => onTextChange(entry.id, event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.stopPropagation();
              onTextChange(entry.id, originalText.current);
              setEditing(false);
            } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              setEditing(false);
            }
          }} />
      </div> : <div className="annotation-text">{text || <span className="annotation-placeholder">双击添加批注…</span>}</div>}
      {entry.notice && <div className="file-notice reference-warning">{entry.notice}</div>}
    </div>}
    {!summary && <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label="调整批注宽度" onPointerDown={event => onResize(event, entry.id)} title="拖动右侧边缘调整宽度" />}
  </article>;
}

/** Logical parents still own geometry; one world layer keeps every note above
 * all folder stacking contexts, including selected folders and their files. */
export function AnnotationLayer(props: Props) {
  const { viewport, visibleIds, scene } = props;
  return <div className="world annotation-layer" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
    {[...visibleIds].filter(id => scene[id].entry.kind === 'note').map(id => <AnnotationCard key={id} node={scene[id]} {...props} />)}
  </div>;
}
