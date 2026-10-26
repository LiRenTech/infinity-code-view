export type SidebarPanel = 'explorer' | 'relations';
export interface SidebarPreferences { panel: SidebarPanel; open: boolean; width: number }

export const SIDEBAR_KEY = 'icv:sidebar:v1';
export const ACTIVITY_BAR_WIDTH = 48;
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 560;
const MIN_CANVAS_WIDTH = 360;
export const DEFAULT_SIDEBAR: Readonly<SidebarPreferences> = { panel: 'explorer', open: true, width: 280 };

export function sidebarMaxWidth(workspaceWidth: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, workspaceWidth - ACTIVITY_BAR_WIDTH - MIN_CANVAS_WIDTH));
}

export function clampSidebarWidth(width: number, workspaceWidth = Infinity): number {
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(sidebarMaxWidth(workspaceWidth), width)));
}

export function parseSidebarPreferences(value: string | null): SidebarPreferences {
  const result = { ...DEFAULT_SIDEBAR };
  try {
    const saved: unknown = JSON.parse(value ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const record = saved as Record<string, unknown>;
      if (record.panel === 'explorer' || record.panel === 'relations') result.panel = record.panel;
      if (typeof record.open === 'boolean') result.open = record.open;
      if (typeof record.width === 'number' && Number.isFinite(record.width)) result.width = clampSidebarWidth(record.width);
    }
  } catch { /* Malformed UI preferences must not prevent opening a project. */ }
  return result;
}
