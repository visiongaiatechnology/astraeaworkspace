import { describe, expect, it } from 'vitest';
import { GRID_TOOLBAR_COPY } from '../gridToolbarLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';

describe('Grid toolbar localization', () => {
  it('provides the same complete message surface in all seven Workspace locales', () => {
    const expectedKeys = Object.keys(GRID_TOOLBAR_COPY['en-US']).sort();

    expect(Object.keys(GRID_TOOLBAR_COPY).sort()).toEqual([...WORKSPACE_LOCALES].sort());
    for (const locale of WORKSPACE_LOCALES) {
      const copy = GRID_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort()).toEqual(expectedKeys);
      for (const [key, value] of Object.entries(copy)) {
        if (typeof value === 'string') expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
      expect(copy.nameBoxAria('A1')).toContain('A1');
    }
  });

  it('uses distinct German and English toolbar actions', () => {
    expect(GRID_TOOLBAR_COPY['de-DE'].apply).toBe('Anwenden');
    expect(GRID_TOOLBAR_COPY['de-DE'].moreActions).toBe('Weitere Aktionen');
    expect(GRID_TOOLBAR_COPY['en-US'].apply).toBe('Apply');
    expect(GRID_TOOLBAR_COPY['en-US'].moreActions).toBe('More actions');
  });
});
