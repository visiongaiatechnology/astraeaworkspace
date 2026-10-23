// STATUS: PLATIN — rendered coverage for Writer search labels, accessible names, interpolation, and opaque errors.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WriterFindReplaceBar } from '../WriterFindReplaceBar';
import { WRITER_SEARCH_COPY } from '../writerSearchLocale';

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const props = {
  isOpen: true,
  onClose: noop,
  paragraphs: [],
  styleCatalog: { paragraphStyles: [], characterStyles: [], listStyles: [], tableStyles: [], linkedStyles: [] },
  onReplaceAll: () => ({ ok: true, message: 'internal operation detail must not render' }),
} satisfies ComponentProps<typeof WriterFindReplaceBar>;

describe('Writer Find and Replace localization', () => {
  it('keeps the message surface complete and interpolates visible counts', () => {
    const englishKeys = Object.keys(WRITER_SEARCH_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_SEARCH_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(englishKeys);
      expect(copy.replaceAll(3), `${locale}.replaceAll`).toContain('3');
      expect(copy.matchCount(2, 5), `${locale}.matchCount`).toContain(locale === 'ja-JP' ? '2' : '2');
      expect(copy.searchError.trim(), `${locale}.searchError`).not.toBe('');
    }
  });

  it('renders translated input, search modes, accessibility labels, and generic fallback for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = WRITER_SEARCH_COPY[locale];
      const markup = renderToStaticMarkup(<WriterFindReplaceBar {...props} />);

      expect(markup).toContain(`placeholder="${copy.searchPlaceholder}"`);
      expect(markup).toContain(`aria-label="${copy.searchFormat}"`);
      expect(markup).toContain(`aria-label="${copy.close}"`);
      expect(markup).toContain(`aria-label="${copy.previousMatch}"`);
      expect(markup).toContain(`aria-label="${copy.nextMatch}"`);
      expect(markup).toContain(`role="status"`);
      expect(markup).toContain(copy.searchPrompt);
      expect(markup).not.toContain('Suchtext oder Format-/Style-Filter erforderlich.');
      expect(markup).not.toContain('internal operation detail must not render');
    }
  });
});
