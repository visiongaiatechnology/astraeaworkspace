// STATUS: GOLD — checks Notes Find/Replace catalog parity and all-locale dialog rendering.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { NOTES_SEARCH_COPY } from '../../notesSearchLocale';
import { NotesFindReplaceModal } from '../../search/NotesFindReplaceModal';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;');
const props = { isOpen: true, content: 'Alpha alpha', onClose: noop, onUpdateContent: noop } satisfies ComponentProps<typeof NotesFindReplaceModal>;

describe('Notes find-and-replace locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const keys = Object.keys(NOTES_SEARCH_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(NOTES_SEARCH_COPY[locale]).sort(), locale).toEqual(keys);
      for (const key of keys as (keyof typeof NOTES_SEARCH_COPY['en-US'])[]) expect(NOTES_SEARCH_COPY[locale][key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized placeholders, actions, and accessible names', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = NOTES_SEARCH_COPY[locale];
      const markup = renderToStaticMarkup(<NotesFindReplaceModal {...props} />);
      for (const key of ['title', 'replace', 'replaceAll'] as const) expect(markup).toContain(htmlText(copy[key]));
      expect(markup).toContain(`placeholder="${copy.find}"`);
      expect(markup).toContain(`placeholder="${copy.replaceWith}"`);
      expect(markup).toContain(`aria-label="${copy.close}"`);
      expect(markup).toContain(`title="${copy.matchCase}"`);
      expect(markup).toContain(`aria-label="${copy.nextMatch}"`);
    }
  });
});
