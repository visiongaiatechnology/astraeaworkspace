// STATUS: PLATIN — verifies Writer toolbar locale parity and rendered guide anchors.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WRITER_TOOLBAR_COPY, writerToolbarText } from '../writerToolbarLocale';
import { WriterFormattingToolbar } from '../WriterFormattingToolbar';

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: vi.fn(),
}));

const noop = (): void => undefined;

const toolbarProps = {
  styles: [],
  currentTheme: 'default',
  viewMode: 'print',
  zoom: 100,
  canUndo: false,
  canRedo: false,
  onApplyStyle: noop,
  onToggleSpan: noop,
  onSetAlignment: noop,
  onToggleList: noop,
  onUpdateStyle: noop,
  onSetTextColor: noop,
  onSetHighlightColor: noop,
  onClearFormatting: noop,
  onSetLineSpacing: noop,
  onSelectTheme: noop,
  onInsertTable: noop,
  onInsertImage: noop,
  onInsertEquation: noop,
  onOpenPageSetup: noop,
  onOpenCitationModal: noop,
  onOpenSymbolsModal: noop,
  onOpenFootnoteModal: noop,
  onOpenBookmarkModal: noop,
  onOpenMailMergeModal: noop,
  onInsertLineBreak: noop,
  onInsertPageBreak: noop,
  onInsertColumnBreak: noop,
  onInsertSectionBreak: noop,
  onSetViewMode: noop,
  onSetZoom: noop,
  onUndo: noop,
  onRedo: noop,
  onOpenGridEmbed: noop,
} satisfies ComponentProps<typeof WriterFormattingToolbar>;

describe('Writer formatting toolbar locale coverage', () => {
  it('keeps each supported locale complete and populated', () => {
    const englishKeys = Object.keys(WRITER_TOOLBAR_COPY['en-US']).sort();

    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(englishKeys);
      for (const key of englishKeys as (keyof typeof copy)[]) {
        expect(writerToolbarText(key, locale).trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('renders translated view, break, formatting, and guide controls for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({
        preference: locale,
        locale,
        setPreference: noop,
      });

      const copy = WRITER_TOOLBAR_COPY[locale];
      const markup = renderToStaticMarkup(<WriterFormattingToolbar {...toolbarProps} />);

      expect(markup).toContain(`aria-label="${copy.viewModes}"`);
      expect(markup).toContain(`title="${copy.focusViewHint}"`);
      expect(markup).toContain(`aria-label="${copy.insertBreak}"`);
      expect(markup).toContain(`<option value="page">${copy.pageBreak}</option>`);
      expect(markup).toContain(`title="${copy.bold}"`);
      expect(markup).toContain(`title="${copy.embedWorkspaceObject}"`);
      expect(markup.match(/data-vgt-app-guide-anchor="Writer:embed"/g)).toHaveLength(1);
    }
  });
});
