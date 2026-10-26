import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import hljs from 'highlight.js/lib/common';
import type { Scene, SceneNode as Node } from '../lib/model';
import { borderWidth, detailLevel } from '../lib/presentation';
import { SummaryTitle } from './SummaryTitle';

interface Props {
  node: Node;
  scene: Scene;
  scale: number;
  depth?: number;
  selected: Set<string>;
  onDrag: (event: PointerEvent, id: string) => void;
  onResize: (event: PointerEvent, id: string) => void;
  onMeasure: (id: string, height: number) => void;
  onFocus: (id: string) => void;
}

const Code = memo(function Code({ content, language }: { content: string; language: string | null }) {
  const html = useMemo(() => language && hljs.getLanguage(language)
    ? hljs.highlight(content, { language, ignoreIllegals: true }).value
    : hljs.highlight(content, { language: 'plaintext' }).value, [content, language]);
  return <pre className="source"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>;
});

export function NodeHeader({ node, onDrag }: { node: Node; onDrag?: (event: PointerEvent, id: string) => void }) {
  const { entry } = node;
  const folder = entry.kind === 'folder';
  return <header className="node-header" onPointerDown={onDrag ? event => onDrag(event, entry.id) : undefined} title={`${entry.id || entry.name} · 拖动标题移动，Shift 多选`}>
    <span className={`node-icon ${folder ? 'folder-icon' : ''}`}>{folder ? '▱' : entry.language === 'typescript' ? 'TS' : entry.language === 'javascript' ? 'JS' : entry.language === 'rust' ? 'RS' : '↳'}</span>
    <span className="node-name">{entry.name}</span>
    {folder ? <span className="node-meta">{node.children.length}</span> : entry.content !== null && <span className="node-meta">{entry.content.split('\n').length} 行</span>}
  </header>;
}

export function SceneNode({ node, scene, scale, depth = 0, selected, onDrag, onResize, onMeasure, onFocus }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { entry } = node;
  const folder = entry.kind === 'folder';
  const detail = detailLevel(node, scale, depth);
  const summary = detail === 'summary';
  useLayoutEffect(() => {
    if (folder || summary || !contentRef.current) return;
    const element = contentRef.current;
    // Observe natural content, not the fixed outer frame. Hiding code cannot shrink it.
    const observer = new ResizeObserver(() => onMeasure(entry.id, element.offsetHeight + 2));
    observer.observe(element);
    return () => observer.disconnect();
  }, [folder, summary, entry.id, onMeasure]);
  return <article
    className={`scene-node ${folder ? 'folder-node' : entry.content !== null ? 'code-node' : 'asset-node'} ${summary ? 'summary-node' : ''} ${selected.has(entry.id) ? 'selected' : ''}`}
    style={{
      left: node.x, top: node.y, width: node.width, height: node.height,
      '--node-stroke': `${borderWidth(node, scale)}px`,
      '--selection-stroke': `${2 / scale}px`,
      '--selection-offset': `${2 / scale}px`,
    } as CSSProperties}
    data-node-id={entry.id} data-detail={detail} data-depth={depth}
  >
    {summary ? <div className="summary-cover" onPointerDown={event => onDrag(event, entry.id)} onDoubleClick={() => onFocus(entry.id)}
      title={`${entry.id || entry.name} · 拖动移动，双击展开`}>
      <SummaryTitle name={entry.name} width={node.width} height={node.height} />
    </div> : folder ? <>
      <NodeHeader node={node} onDrag={onDrag} />
      {node.children.map(id => <SceneNode key={id} node={scene[id]} scene={scene} scale={scale} depth={depth + 1} selected={selected} onDrag={onDrag} onResize={onResize} onMeasure={onMeasure} onFocus={onFocus} />)}
    </> : <>
      <div className="file-contents" ref={contentRef}>
        <NodeHeader node={node} onDrag={onDrag} />
        {entry.content !== null ? <Code content={entry.content} language={entry.language} />
          : entry.notice && <div className="file-notice">{entry.notice}</div>}
      </div>
      {entry.content !== null && <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label={`调整 ${entry.name} 宽度`} onPointerDown={event => onResize(event, entry.id)} title="拖动右侧边缘调整宽度" />}
    </>}
  </article>;
}
