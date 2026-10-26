import { anchorLabel, edgeStatus, statusLabel, type Relations, type ResolvedEdge, type Resolution } from '../lib/relations';

export function RelationsPanel({ relations, edges, selectedId, invalidOnly, onFilter, onSelect, onEdit, onFocus, onFrame, onClose }: {
  relations: Relations; edges: ResolvedEdge[]; selectedId: string | null; invalidOnly: boolean;
  onFilter: (invalid: boolean) => void; onSelect: (id: string) => void; onEdit: (id: string) => void; onFocus: (resolution: Resolution) => void; onFrame: (edge: ResolvedEdge) => void; onClose: () => void;
}) {
  const invalid = edges.filter(edge => edgeStatus(edge) !== 'resolved');
  const renderEdge = (edge: ResolvedEdge) => {
    const note = relations.annotations.find(note => note.id === edge.annotationId);
    const connection = relations.connections.find(item => item.id === edge.connectionId);
    const status = edgeStatus(edge);
    return <article key={edge.id} className={`relation-row ${selectedId === edge.id ? 'active' : ''}`}>
      <button className="relation-row-title" onClick={() => onSelect(edge.id)}><span style={{ color: edge.style.color }}>{note ? '▤' : '↗'}</span><strong>{note ? note.text.slice(0, 80) : edge.style.label || '未命名连线'}</strong></button>
      {note ? <p title={anchorLabel(note.target)}>{anchorLabel(note.target)}</p> : connection && <><p title={anchorLabel(connection.from)}>起点：{anchorLabel(connection.from)}</p><p title={anchorLabel(connection.to)}>终点：{anchorLabel(connection.to)}</p></>}
      <small className={`anchor-result ${status}`}>{statusLabel(status)}{edge.from.count > 1 || edge.to.count > 1 ? ` · 起点 ${edge.from.count} / 终点 ${edge.to.count}` : ''}</small>
      <div className="relation-row-actions"><button onClick={() => onEdit(edge.id)}>编辑</button>{<button disabled={edge.from.status !== 'resolved'} onClick={() => { onSelect(edge.id); onFocus(edge.from); }}>{note ? '定位批注' : '定位起点'}</button>}<button disabled={edge.to.status !== 'resolved'} onClick={() => { onSelect(edge.id); onFocus(edge.to); }}>{note ? '定位目标' : '定位终点'}</button><button disabled={status !== 'resolved'} onClick={() => onFrame(edge)}>查看两端</button></div>
    </article>;
  };
  return <aside className="relations-panel" aria-label="批注与连线">
    <div className="relations-heading"><div><h2>批注与连线</h2><small>{relations.annotations.length} 条批注 · {relations.connections.length} 条连线</small></div><button onClick={onClose} aria-label="关闭批注与连线侧栏">×</button></div>
    <div className="relations-tabs"><button className={!invalidOnly ? 'active' : ''} onClick={() => onFilter(false)}>全部 {edges.length}</button><button className={invalidOnly ? 'active' : ''} onClick={() => onFilter(true)}>失效连线 {invalid.length}</button></div>
    <div className="relations-list">{invalidOnly ? <>{(['ambiguous', 'missing'] as const).map(status => <section key={status}><h3>{statusLabel(status)} <span>{invalid.filter(edge => edgeStatus(edge) === status).length}</span></h3>{invalid.filter(edge => edgeStatus(edge) === status).map(renderEdge)}</section>)}{invalid.length === 0 && <p className="relations-empty">所有锚点均能唯一定位。</p>}</> : <>{edges.map(renderEdge)}{edges.length === 0 && <p className="relations-empty">选中文件、文件夹或一段代码，创建第一条批注或连线。</p>}</>}</div>
    <p className="relations-footnote">刷新项目时重新匹配锚点。多个匹配或目标缺失的连线暂不绘制；修复锚点后自动恢复。</p>
  </aside>;
}
