import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_SETTINGS, parseViewSettings } from './settings';

describe('saved view settings', () => {
  it('enables all effects on first use or after invalid data', () => {
    for (const value of [null, '', '{broken', 'null', 'false', '[]']) {
      expect(parseViewSettings(value)).toEqual(DEFAULT_VIEW_SETTINGS);
    }
  });
  it('preserves each disabled option and defaults missing options for upgrades', () => {
    const disabled = { revealSelectedFiles: false, revealFolderOnClick: false, revealFolderRecursivelyOnDoubleClick: false };
    expect(parseViewSettings(JSON.stringify(disabled))).toEqual(disabled);
    expect(parseViewSettings('{"revealSelectedFiles":false,"futureOption":true}')).toEqual({ ...DEFAULT_VIEW_SETTINGS, revealSelectedFiles: false });
    expect(parseViewSettings('{"revealSelectedFiles":"false"}')).toEqual(DEFAULT_VIEW_SETTINGS);
  });
});
