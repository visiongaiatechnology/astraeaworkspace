// STATUS: PLATIN — the selection surface for "replace only chosen matches"
//
// Paket 30 acceptance: "Über gesamtes Dokument suchen, Treffer hervorheben und nur
// gewählte Treffer ersetzen." The document-wide replace existed; this is the part
// that did not. The engine is unit-tested in
// `testing/unit/productivity/writerSearchSelection.test.ts`; here the rendered
// surface is pinned — a checkbox per match and a button that names the count.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Paragraph } from '../../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WriterFindReplaceBar } from '../WriterFindReplaceBar';
import { WRITER_SEARCH_COPY } from '../writerSearchLocale';

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;

const paragraph = (id: string, text: string): Paragraph => ({
  id,
  spans: [{ text }],
  style: { style_name: 'normal' },
} as unknown as Paragraph);

const props = {
  isOpen: true,
  onClose: noop,
  paragraphs: [paragraph('p1', 'rot und rot')],
  styleCatalog: { paragraphStyles: [], characterStyles: [], listStyles: [], tableStyles: [], linkedStyles: [] },
  onReplaceAll: () => ({ ok: true, message: 'ok' }),
  onReplaceSelection: () => ({ ok: true, message: 'ok' }),
} satisfies ComponentProps<typeof WriterFindReplaceBar>;

describe('Writer Find and Replace selection surface', () => {
  it('names the selected count in the button label for every locale', () => {
    for (const locale of Object.keys(WRITER_SEARCH_COPY) as (keyof typeof WRITER_SEARCH_COPY)[]) {
      const copy = WRITER_SEARCH_COPY[locale];
      expect(copy.replaceSelected(7), locale).toContain('7');
      expect(copy.replaceCurrent.trim(), locale).not.toBe('');
      expect(copy.selectionHint.trim(), locale).not.toBe('');
    }
  });

  it('renders the search surface without leaning on the selection controls', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'de-DE', locale: 'de-DE', setPreference: noop });
    const markup = renderToStaticMarkup(<WriterFindReplaceBar {...props} />);
    // Nothing is searched yet, so no match list and no selection controls.
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).toContain(WRITER_SEARCH_COPY['de-DE'].searchPrompt);
  });

  it('keeps the selection controls out of the way while the replace row is closed', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'de-DE', locale: 'de-DE', setPreference: noop });
    const markup = renderToStaticMarkup(<WriterFindReplaceBar {...props} />);
    expect(markup).not.toContain(WRITER_SEARCH_COPY['de-DE'].replaceCurrent);
    expect(markup).not.toContain(WRITER_SEARCH_COPY['de-DE'].selectionHint);
  });
});
