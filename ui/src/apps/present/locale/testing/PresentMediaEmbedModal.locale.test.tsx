// STATUS: PLATIN — rendered seven-locale coverage for Present media controls and opaque validation feedback.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PresentMediaEmbedModal } from '../../media/PresentMediaEmbedModal';
import { PRESENT_MEDIA_COPY, presentMediaErrorMessage } from '../presentMediaLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const props = {
  isOpen: true,
  slide: { id: 'slide-1', title: 'Title', subtitle: '', layout: 'blank' },
  onClose: noop,
  onUpdateMedia: noop,
} satisfies ComponentProps<typeof PresentMediaEmbedModal>;

describe('Present media source localization', () => {
  it('keeps every locale complete and hides internal validation detail', () => {
    const expectedKeys = Object.keys(PRESENT_MEDIA_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PRESENT_MEDIA_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      expect(copy.validationError.trim(), `${locale}.validationError`).not.toBe('');
      const error = presentMediaErrorMessage(locale, new Error('C:\\private\\media-cache\\parser stack'));
      expect(error).toBe(copy.validationError);
      expect(error).not.toContain('private');
      expect(error).not.toContain('parser stack');
    }
  });

  it('renders localized controls, accessible labels, and media guidance for all locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PRESENT_MEDIA_COPY[locale];
      const markup = renderToStaticMarkup(<PresentMediaEmbedModal {...props} />);

      expect(markup).toContain(`role="dialog"`);
      expect(markup).toContain(`aria-label="${copy.dialog}"`);
      expect(markup).toContain(`aria-label="${copy.close}"`);
      expect(markup).toContain(`aria-label="${copy.externalLink}"`);
      expect(markup).toContain(`aria-label="${copy.accessibility}"`);
      expect(markup).toContain(`aria-label="${copy.subtitles}"`);
      expect(markup).toContain(`aria-label="${copy.transcriptAlternative}"`);
      expect(markup).toContain(copy.externalDescription);
      expect(markup).toContain(copy.embeddedDescription);
      expect(markup).toContain(copy.cancel);
      expect(markup).toContain(copy.apply);
      expect(markup).not.toContain('Media validation failed.');
      if (locale !== 'en-US') expect(markup).not.toContain('External link');
    }
  });
});
