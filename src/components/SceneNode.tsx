import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent } from 'react';
import hljs from 'highlight.js/lib/common';
import type { Scene, SceneNode as Node } from '../lib/model';

interface Props {
  node: Node;
  scene: Scene;
  selected: Set<string>;
  onDrag: (event: PointerEvent, id: string) => void;
  onResize: (event: PointerEvent, id: string) => void;
  onMeasure: (id: string, height: number) => void;
}

const Code = memo(function Code({ content, language }: { content: string; language: string | null }) {
  const html = useMemo(() => language && hljs.getLanguage(language)
    ? hljs.highlight(content, { language, ignoreIllegals: true }).value
    : hljs.highlight(content, { language: 'plaintext' }).value, [content, language]);
  return <pre className="source"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>;
});

export function SceneNode({ node, scene, selected, onDrag, onResize, onMeasure }: Props) {
  const ref = useRef<HTMLElement>(null);
  const { entry } = node;
  const folder = entry.kind === 'folder';
  useLayoutEffect(() => {
    if (folder || !ref.current) return;
    const element = ref.current;
    const observer = new ResizeObserver(() => onMeasure(entry.id, element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [folder, entry.id, onMeasure]);
  return <article ref={ref}
    className={`scene-node ${folder ? 'folder-node' : entry.content !== null ? 'code-node' : 'asset-node'} ${selected.has(entry.id) ? 'selected' : ''}`}
    style={{ left: node.x, top: node.y, width: node.width, ...(folder ? { height: node.height } : {}) }}
    data-node-id={entry.id}
  >
    <header className="node-header" onPointerDown={event => onDrag(event, entry.id)} title={`${entry.id || entry.name} · 拖动标题移动，Shift 多选`}>
      <span className={`node-icon ${folder ? 'folder-icon' : ''}`}>{folder ? '▱' : entry.language === 'typescript' ? 'TS' : entry.language === 'javascript' ? 'JS' : entry.language === 'rust' ? 'RS' : '↳'}</span>
      <span className="node-name">{entry.name}</span>
      {folder ? <span className="node-meta">{node.children.length}</span> : entry.content !== null && <span className="node-meta">{entry.content.split('\n').length} 行</span>}
    </header>
    {folder ? node.children.map(id => <SceneNode key={id} node={scene[id]} scene={scene} selected={selected} onDrag={onDrag} onResize={onResize} onMeasure={onMeasure} />)
      : entry.content !== null ? <Code content={entry.content} language={entry.language} />
      : entry.notice && <div className="file-notice">{entry.notice}</div>}
    {!folder && entry.content !== null && <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label={`调整 ${entry.name} 宽度`} onPointerDown={event => onResize(event, entry.id)} title="拖动右侧边缘调整宽度" />}
  </article>;
}
