// @vitest-environment happy-dom
// STATUS: PLATIN — WR-034: all seven vector shapes are insertable from the toolbar
//
// The Insert menu passed a hard-coded `'rectangle'` to `onInsertShape`, so six of the seven
// shape kinds existed in the model, the canvas and the renderer but could not be inserted.
import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WRITER_TOOLBAR_COPY } from '../writerToolbarLocale';
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
  onInsertShape: noop,
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

function useLocale(locale: 'de-DE' | 'en-US'): void {
  vi.mocked(useWorkspaceLocale).mockReturnValue({
    preference: locale,
    locale,
    setPreference: noop,
  } as never);
}

const KINDS = ['rectangle', 'rounded-rectangle', 'ellipse', 'arrow', 'line', 'textbox', 'callout'] as const;

afterEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('WR-034 — the Insert menu offers every supported shape kind', () => {
  it('renders one labelled entry per kind', () => {
    useLocale('de-DE');
    const markup = renderToStaticMarkup(<WriterFormattingToolbar {...toolbarProps} />);
    for (const kind of KINDS) {
      expect(markup, kind).toContain(`data-writer-toolbar-menu-action="insert-shape:${kind}"`);
    }
    // Localised, not hard-coded English inside a German UI.
    expect(markup).toContain(WRITER_TOOLBAR_COPY['de-DE'].shapeRectangle);
    expect(markup).toContain(WRITER_TOOLBAR_COPY['de-DE'].shapeEllipse);
    expect(markup).toContain(WRITER_TOOLBAR_COPY['de-DE'].shapeCallout);
  });

  it('passes the chosen kind to the editor instead of always "rectangle"', async () => {
    useLocale('de-DE');
    const onInsertShape = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<WriterFormattingToolbar {...toolbarProps} onInsertShape={onInsertShape} />);
    });

    const ellipse = container.querySelector<HTMLElement>('[data-writer-toolbar-menu-action="insert-shape:ellipse"]');
    expect(ellipse).not.toBeNull();
    await act(async () => {
      ellipse!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onInsertShape).toHaveBeenCalledWith('ellipse');

    const callout = container.querySelector<HTMLElement>('[data-writer-toolbar-menu-action="insert-shape:callout"]');
    await act(async () => {
      callout!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onInsertShape).toHaveBeenLastCalledWith('callout');
    await act(async () => { root.unmount(); });
  });
});
