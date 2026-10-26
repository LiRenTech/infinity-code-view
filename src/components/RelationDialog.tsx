import { useEffect, useRef, useState } from 'react';
import type { ProjectSnapshot } from '../lib/model';
import { anchorLabel, pathChoices, resolveAnchor, statusLabel, type Anchor, type Annotation, type Connection, type LineStyle } from '../lib/relations';

export type RelationDraft = { kind: 'annotation'; value: Annotation } | { kind: 'connection'; value: Connection };

function AnchorPicker({ anchor, onChange, project, title }: { anchor: Anchor; onChange: (anchor: Anchor) => void; project: ProjectSnapshot; title: string }) {
  const result = resolveAnchor(project, anchor);
  const choices = pathChoices(project, anchor);
  return <fieldset className="anchor-picker"><legend>{title}</legend>
    <label>定位范围<select aria-label="定位范围" value={JSON.stringify({ path: anchor.path, mode: anchor.mode })} onChange={event => onChange({ ...anchor, ...JSON.parse(event.target.value) })}>
      {choices.map(choice => <option key={JSON.stringify([choice.path, choice.mode])} value={JSON.stringify({ path: choice.path, mode: choice.mode })}>
        {choice.path === null ? '全项目代码' : choice.path || (anchor.kind === 'code' ? '自定义路径' : '项目根目录')} · {choice.path === null ? '' : choice.mode === 'full' ? '完整路径 · ' : '路径后缀 · '}匹配 {choice.count} 个{anchor.kind === 'object' && anchor.objectKind === 'folder' ? '目录' : '文件'}
      </option>)}
    </select></label>
    <div className="anchor-path-row"><label>自定义路径<input value={anchor.path ?? ''} disabled={anchor.path === null} onChange={event => onChange({ ...anchor, path: event.target.value })} placeholder="项目相对路径或路径后缀" /></label>
      <label>匹配方式<select aria-label="匹配方式" value={anchor.mode} disabled={anchor.path === null} onChange={event => onChange({ ...anchor, mode: event.target.value as Anchor['mode'] })}><option value="full">完整路径</option><option value="suffix">路径后缀</option></select></label>
      {anchor.kind === 'object' && <label>目标类型<select aria-label="目标类型" value={anchor.objectKind} onChange={event => onChange({ ...anchor, objectKind: event.target.value as 'file' | 'folder' })}><option value="file">文件</option><option value="folder">文件夹</option></select></label>}
    </div>
    {anchor.kind === 'code' && <label>锚定代码<textarea className="anchor-code" value={anchor.text} onChange={event => onChange({ ...anchor, text: event.target.value })} rows={3} required spellCheck={false} /><small>这里修改的是匹配条件，源码保持只读；空格与换行参与精确匹配。</small></label>}
    <div className={`anchor-result ${result.status}`} role="status">{statusLabel(result.status)}{result.count > 0 ? ` · ${result.count} 个${anchor.kind === 'code' ? '位置' : '目标'}` : ''}</div>
  </fieldset>;
}

function StylePicker({ style, onChange }: { style: LineStyle; onChange: (style: LineStyle) => void }) {
  return <fieldset className="line-style-picker"><legend>连线样式</legend><label>连线文字<input value={style.label} maxLength={1000} onChange={event => onChange({ ...style, label: event.target.value })} placeholder="可选，例如：调用 / 依赖 / 待确认" /></label>
    <div className="line-style-row"><label>颜色<input type="color" aria-label="连线颜色" value={/^#[0-9a-f]{6}$/i.test(style.color) ? style.color : '#000000'} onInput={event => onChange({ ...style, color: event.currentTarget.value })} onChange={event => onChange({ ...style, color: event.target.value })} /></label><label>颜色值<input aria-label="颜色值" value={style.color} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={event => onChange({ ...style, color: event.target.value })} /></label><label>粗细<select aria-label="连线粗细" value={style.width} onChange={event => onChange({ ...style, width: Number(event.target.value) })}>{Array.from({ length: 16 }, (_, index) => (index + 1) / 2).map(width => <option key={width} value={width}>{width} px</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={style.dashed} onChange={event => onChange({ ...style, dashed: event.target.checked })} />虚线</label></div>
  </fieldset>;
}

export function RelationDialog({ draft: initial, project, existing, onSave, onDelete, onClose }: {
  draft: RelationDraft; project: ProjectSnapshot; existing: boolean;
  onSave: (draft: RelationDraft) => void; onDelete: () => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); dialog.querySelector('textarea')?.focus(); return () => dialog.close(); }, []);
  const invalidColor = !/^#[0-9a-f]{6}$/i.test(draft.value.style.color);
  const invalid = invalidColor || (draft.kind === 'annotation' ? !draft.value.text.trim() || (draft.value.target.kind === 'code' && !draft.value.target.text)
    : [draft.value.from, draft.value.to].some(anchor => anchor.kind === 'code' && !anchor.text));
  const anchors = draft.kind === 'annotation' ? [draft.value.target] : [draft.value.from, draft.value.to];
  const unresolved = anchors.some(anchor => resolveAnchor(project, anchor).status !== 'resolved');
  return <dialog ref={ref} className="settings-dialog relation-dialog" aria-labelledby="relation-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (!invalid) onSave(draft); }}>
      <div className="settings-heading"><div><h1 id="relation-dialog-title">{existing ? '编辑' : '新建'}{draft.kind === 'annotation' ? '批注' : '连线'}</h1><p>保存在应用数据中，项目源码只读</p></div><button type="button" onClick={onClose} aria-label="关闭编辑窗口">×</button></div>
      {draft.kind === 'annotation' ? <><label className="note-text-label">批注内容<textarea autoFocus value={draft.value.text} maxLength={100000} required rows={5} placeholder="记下你的理解、问题或待办…" onChange={event => setDraft({ ...draft, value: { ...draft.value, text: event.target.value } })} /></label><AnchorPicker title="批注目标" anchor={draft.value.target} project={project} onChange={target => setDraft({ ...draft, value: { ...draft.value, target } })} /></>
        : <><AnchorPicker title="起点" anchor={draft.value.from} project={project} onChange={from => setDraft({ ...draft, value: { ...draft.value, from } })} /><AnchorPicker title="终点" anchor={draft.value.to} project={project} onChange={to => setDraft({ ...draft, value: { ...draft.value, to } })} /></>}
      <StylePicker style={draft.value.style} onChange={style => setDraft(old => old.kind === 'annotation' ? { ...old, value: { ...old.value, style } } : { ...old, value: { ...old.value, style } })} />
      {unresolved && <p className="reference-warning">当前锚点不能唯一定位。保存后会显示在“失效连线”中，不会自动选择某个候选目标。</p>}
      <div className="settings-footer"><div>{existing && <button type="button" className="danger-button" onClick={onDelete}>删除{draft.kind === 'annotation' ? '批注' : '连线'}</button>}</div><div className="dialog-actions"><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={invalid}>保存{draft.kind === 'annotation' ? '批注' : '连线'}</button></div></div>
      <small className="anchor-description" title={anchors.map(anchorLabel).join('\n')}>布局、批注与连线统一通过“保存布局”写入磁盘。</small>
    </form>
  </dialog>;
}
