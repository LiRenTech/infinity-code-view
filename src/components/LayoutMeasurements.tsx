import { useLayoutEffect, useRef } from 'react';
import { cloneScene, type Scene } from '../lib/model';
import { NodeHeader } from './SceneNode';

/** A short-lived, unscaled text-only pass. Overview rendering never needs code DOM. */
export function LayoutMeasurements({ scene, onComplete }: { scene: Scene; onComplete: (scene: Scene) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const measuredScene = useRef<Scene | null>(null);
  useLayoutEffect(() => {
    if (!ref.current || measuredScene.current === scene) return;
    measuredScene.current = scene;
    const measured = cloneScene(scene);
    for (const element of ref.current.querySelectorAll<HTMLElement>('[data-measure-id]')) {
      const id = element.dataset.measureId!;
      measured[id].height = element.offsetHeight;
    }
    onComplete(measured);
  }, [scene, onComplete]);
  return <div className="layout-measurements" ref={ref} aria-hidden="true" inert>
    {Object.values(scene).filter(node => node.entry.kind !== 'folder').map(node => <article
      key={node.entry.id} data-measure-id={node.entry.id}
      className={`scene-node measurement-card ${node.entry.kind === 'note' ? 'annotation-node' : node.entry.content !== null ? 'code-node' : 'asset-node'}`}
      style={{ width: node.width }}
    >
      {node.entry.kind !== 'note' && <NodeHeader node={node} />}
      {node.entry.kind === 'note' ? <><div className="annotation-text">{node.entry.content || '\u200b'}</div>{node.entry.notice && <div className="file-notice reference-warning">{node.entry.notice}</div>}</> : node.entry.content !== null ? <pre className="source"><code>{node.entry.content}</code></pre>
        : node.entry.notice && <div className="file-notice">{node.entry.notice}</div>}
    </article>)}
  </div>;
}
