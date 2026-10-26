export interface ViewSettings {
  revealFolderOnClick: boolean;
  revealFolderRecursivelyOnDoubleClick: boolean;
  revealSelectedFiles: boolean;
}

export const DEFAULT_VIEW_SETTINGS: Readonly<ViewSettings> = {
  revealFolderOnClick: true,
  revealFolderRecursivelyOnDoubleClick: true,
  revealSelectedFiles: true,
};
export const VIEW_SETTINGS_KEY = 'icv:view-settings:v1';

/** Ignore malformed and future fields, and default newly added options to enabled. */
export function parseViewSettings(value: string | null): ViewSettings {
  const settings = { ...DEFAULT_VIEW_SETTINGS };
  try {
    const saved: unknown = JSON.parse(value ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const key of Object.keys(settings) as (keyof ViewSettings)[]) {
        const option = (saved as Record<string, unknown>)[key];
        if (typeof option === 'boolean') settings[key] = option;
      }
    }
  } catch { /* An invalid preference must not prevent opening the canvas. */ }
  return settings;
}
