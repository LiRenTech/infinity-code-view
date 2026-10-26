import { describe, expect, it } from 'vitest';
import { ACTIVITY_BAR_WIDTH, clampSidebarWidth, DEFAULT_SIDEBAR, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, parseSidebarPreferences } from './sidebar';

describe('sidebar preferences and width limits', () => {
  it('restores the panel, collapsed state, and width independently of project layout', () => {
    const saved = { panel: 'relations', open: false, width: 372 };
    expect(parseSidebarPreferences(JSON.stringify(saved))).toEqual(saved);
  });
  it('recovers from invalid preferences and bounds persisted widths', () => {
    for (const value of [null, '{bad json', '[]', '{"panel":"future","open":"yes","width":null}']) {
      expect(parseSidebarPreferences(value)).toEqual(DEFAULT_SIDEBAR);
    }
    expect(parseSidebarPreferences('{"width":-100}').width).toBe(MIN_SIDEBAR_WIDTH);
    expect(parseSidebarPreferences('{"width":100000}').width).toBe(MAX_SIDEBAR_WIDTH);
  });
  it('keeps the sidebar usable while reserving canvas space at narrow window sizes', () => {
    for (const workspace of [760, 900, 1280, 1920]) {
      for (const requested of [-500, 0, 260, 400, 10000]) {
        const width = clampSidebarWidth(requested, workspace);
        expect(width).toBeGreaterThanOrEqual(MIN_SIDEBAR_WIDTH);
        expect(width).toBeLessThanOrEqual(MAX_SIDEBAR_WIDTH);
        expect(workspace - ACTIVITY_BAR_WIDTH - width).toBeGreaterThanOrEqual(360);
      }
    }
  });
});
