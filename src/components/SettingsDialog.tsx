import { useEffect, useRef } from 'react';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '../lib/settings';

interface Props {
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
  onClose: () => void;
}
const options: { key: keyof ViewSettings; title: string; description: string }[] = [
  { key: 'revealFolderOnClick', title: '单击文件夹展开当前层', description: '显示直接子项；文件与子文件夹继续按缩放比例显示大标题或具体内容。框选文件夹不会触发展开。' },
  { key: 'revealFolderRecursivelyOnDoubleClick', title: '双击文件夹递归展开', description: '显示该文件夹内所有层级的文件夹与完整代码，保持当前视野位置和缩放。' },
  { key: 'revealSelectedFiles', title: '选中文件时显示完整代码', description: '点击、Shift 点选、框选均生效，同时展开包含该文件的所有祖先文件夹。' },
];

export function SettingsDialog({ settings, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="settings-heading"><div><h1 id="settings-title">设置</h1><p>画布 · 内容展开</p></div><button onClick={onClose} aria-label="关闭设置" autoFocus>×</button></div>
    <p className="settings-intro">设置自动保存，适用于所有项目。只改变内容展示，不改变布局；取消选中后恢复按缩放层级展示。</p>
    <div className="settings-options">{options.map(option => <label className="settings-option" key={option.key}>
      <input type="checkbox" checked={settings[option.key]} onChange={event => onChange({ ...settings, [option.key]: event.target.checked })} aria-label={option.title} aria-describedby={`setting-${option.key}-description`} />
      <span><strong>{option.title}</strong><small id={`setting-${option.key}-description`}>{option.description}</small></span>
    </label>)}</div>
    <div className="settings-footer"><button onClick={() => onChange({ ...DEFAULT_VIEW_SETTINGS })}>恢复默认设置</button><button className="primary-button" onClick={onClose}>完成</button></div>
  </dialog>;
}
