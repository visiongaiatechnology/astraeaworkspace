// STATUS: GOLD — checks Whiteboard object palette and mini-map locale coverage.
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { WHITEBOARD_OBJECTS_COPY, whiteboardMiniMapCount } from '../../whiteboardObjectsLocale';
import { WhiteboardObjectPalette } from '../../tools/WhiteboardObjectPalette';
import { WhiteboardMiniMap } from '../../minimap/WhiteboardMiniMap';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';

const noop = (): void => undefined;
const paletteProps = { onClose: noop, onInsert: noop, onRequestImage: noop, onRequestMedia: noop } satisfies ComponentProps<typeof WhiteboardObjectPalette>;
const mapProps = { items: [], viewportBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, onNavigate: noop } satisfies ComponentProps<typeof WhiteboardMiniMap>;

describe('Whiteboard object locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const keys = Object.keys(WHITEBOARD_OBJECTS_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(WHITEBOARD_OBJECTS_COPY[locale]).sort(), locale).toEqual(keys);
      for (const key of keys as (keyof typeof WHITEBOARD_OBJECTS_COPY['en-US'])[]) expect(WHITEBOARD_OBJECTS_COPY[locale][key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized palette controls and mini-map accessibility text', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WHITEBOARD_OBJECTS_COPY[locale];
      const paletteMarkup = renderWithWhiteboardLocale(<WhiteboardObjectPalette {...paletteProps} />, locale);
      const miniMapMarkup = renderWithWhiteboardLocale(<WhiteboardMiniMap {...mapProps} />, locale);
      for (const key of ['objects', 'shape', 'taskCard', 'chartData', 'imageSvg', 'localMedia'] as const) expect(paletteMarkup).toContain(copy[key]);
      expect(paletteMarkup).toContain(`aria-label="${copy.palette}"`);
      expect(paletteMarkup).toContain(`aria-label="${copy.closePalette}"`);
      expect(miniMapMarkup).toContain(`aria-label="${copy.miniMap}"`);
      expect(miniMapMarkup).toContain(whiteboardMiniMapCount(0, locale));
    }
  });
});
