import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { clampSidebarWidth, DEFAULT_SIDEBAR, MIN_SIDEBAR_WIDTH, sidebarMaxWidth, type SidebarPanel, type SidebarPreferences } from '../lib/sidebar';

const panels: { id: SidebarPanel; label: string; icon: 'files' | 'relations' }[] = [
  { id: 'explorer', label: '项目文件', icon: 'files' },
  { id: 'relations', label: '批注与连线', icon: 'relations' },
];

function SidebarIcon({ name }: { name: 'files' | 'relations' | 'settings' }) {
  return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'files' ? <><path d="M8 3h8l4 4v14H8zM16 3v5h4M4 17H3V3h1" /><path d="M11 12h6m-6 4h6" /></>
      : name === 'relations' ? <><rect x="3" y="3" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /><path d="M6.5 9v5a4 4 0 0 0 4 4H14m-2-12h4a2 2 0 0 1 2 2v4m-2-2 2 2 2-2" /></>
      : <><path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3z" /><circle cx="12" cy="11" r="3" /></>}
  </svg>;
}

export function WorkspaceSidebar({ preferences, onToggle, onResize, onSettings, relationCount, invalidCount, children }: {
  preferences: SidebarPreferences;
  onToggle: (panel: SidebarPanel) => void;
  onResize: (width: number) => void;
  onSettings: () => void;
  relationCount: number;
  invalidCount: number;
  children: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(() => window.innerWidth);
  const [resizing, setResizing] = useState(false);
  const width = clampSidebarWidth(preferences.width, workspaceWidth);
  const maximum = sidebarMaxWidth(workspaceWidth);
  useLayoutEffect(() => {
    const workspace = shell.current?.parentElement;
    if (!workspace) return;
    const update = () => setWorkspaceWidth(workspace.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!resizing) return;
    document.documentElement.classList.add('resizing-sidebar');
    return () => document.documentElement.classList.remove('resizing-sidebar');
  }, [resizing]);
  useEffect(() => {
    if (!preferences.open) { drag.current = null; setResizing(false); }
  }, [preferences.open]);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, width };
    setResizing(true);
  };
  const finishResize = () => { drag.current = null; setResizing(false); };
  const resizeWithKeyboard = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 32 : 16;
    const next = event.key === 'ArrowLeft' ? width - step : event.key === 'ArrowRight' ? width + step
      : event.key === 'Home' ? MIN_SIDEBAR_WIDTH : event.key === 'End' ? maximum : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onResize(clampSidebarWidth(next, workspaceWidth));
  };

  return <div ref={shell} className="workspace-sidebar">
    <nav className="activity-bar" aria-label="工作区面板">
      <div className="activity-panels">{panels.map(panel => {
        const active = preferences.open && preferences.panel === panel.id;
        return <button key={panel.id} className={`activity-button ${active ? 'active' : ''}`} title={`${panel.label} · 再次点击收起`} aria-label={panel.label} aria-pressed={active} aria-expanded={active} aria-controls="workspace-side-panel" onClick={() => onToggle(panel.id)}>
          <SidebarIcon name={panel.icon} />
          {panel.id === 'relations' && relationCount > 0 && <span aria-hidden="true" className={`activity-badge ${invalidCount ? 'has-invalid' : ''}`} title={`${relationCount} 项，${invalidCount} 项失效`}>{invalidCount || (relationCount > 99 ? '99+' : relationCount)}</span>}
        </button>;
      })}</div>
      <button className="activity-button activity-settings" onClick={onSettings} aria-label="打开设置" title="设置"><SidebarIcon name="settings" /></button>
    </nav>
    {preferences.open && <section id="workspace-side-panel" className="workspace-side-panel" aria-label={panels.find(panel => panel.id === preferences.panel)!.label} style={{ width }}>
      {children}
      <div className={`sidebar-sash ${resizing ? 'resizing' : ''}`} role="separator" tabIndex={0} aria-orientation="vertical" aria-label="调整左侧栏宽度" aria-valuemin={MIN_SIDEBAR_WIDTH} aria-valuemax={maximum} aria-valuenow={width} aria-valuetext={`${width} 像素`} title="拖动调整宽度；双击恢复默认宽度" onPointerDown={startResize}
        onPointerMove={event => { if (drag.current?.pointerId === event.pointerId) onResize(clampSidebarWidth(drag.current.width + event.clientX - drag.current.x, workspaceWidth)); }}
        onPointerUp={event => { finishResize(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={finishResize} onLostPointerCapture={finishResize} onKeyDown={resizeWithKeyboard} onDoubleClick={() => onResize(clampSidebarWidth(DEFAULT_SIDEBAR.width, workspaceWidth))} />
    </section>}
  </div>;
}
