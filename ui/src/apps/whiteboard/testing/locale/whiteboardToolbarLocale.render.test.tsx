// STATUS: GOLD — checks complete Whiteboard toolbar locale parity and rendered controls.
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { WHITEBOARD_TOOLBAR_COPY } from '../../whiteboardToolbarLocale';
import { WhiteboardToolbar } from '../../toolbar/WhiteboardToolbar';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';

const noop = (): void => undefined;
const props = {
  activeTool: 'select', setActiveTool: noop, selectedStickyColor: 'yellow', setSelectedStickyColor: noop,
  selectedItemId: 'shape-1', onDeleteSelected: noop, onExportPNG: noop, onRequestImage: noop,
  onOpenObjectPalette: noop, onExportToSlide: noop, onOpenInteropModal: noop, onOpenDrawModal: noop,
  canUndo: true, canRedo: false, onUndo: noop, onRedo: noop, setConnectorStartId: noop, showToast: noop,
} satisfies ComponentProps<typeof WhiteboardToolbar>;

describe('Whiteboard toolbar locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(WHITEBOARD_TOOLBAR_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WHITEBOARD_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized toolbar controls and accessible names in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WHITEBOARD_TOOLBAR_COPY[locale];
      const markup = renderWithWhiteboardLocale(<WhiteboardToolbar {...props} />, locale);
      for (const key of ['undo', 'redo', 'select', 'pan', 'sticky', 'text', 'ink', 'connect', 'delete', 'drawStudio', 'exportPng', 'exportSlide'] as const) {
        expect(markup).toContain(copy[key]);
      }
      expect(markup).toContain(`aria-label="${copy.drawingTools}"`);
      expect(markup).toContain(`title="${copy.yellowNote}"`);
      expect(markup).toContain(`aria-label="${copy.exportTools}"`);
    }
  });
});
