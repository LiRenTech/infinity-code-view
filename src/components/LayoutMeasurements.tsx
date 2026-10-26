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
    {Object.values(scene).filter(node => node.entry.kind === 'file').map(node => <article
      key={node.entry.id} data-measure-id={node.entry.id}
      className={`scene-node measurement-card ${node.entry.content !== null ? 'code-node' : 'asset-node'}`}
      style={{ width: node.width }}
    >
      <NodeHeader node={node} />
      {node.entry.content !== null ? <pre className="source"><code>{node.entry.content}</code></pre>
        : node.entry.notice && <div className="file-notice">{node.entry.notice}</div>}
    </article>)}
  </div>;
}
