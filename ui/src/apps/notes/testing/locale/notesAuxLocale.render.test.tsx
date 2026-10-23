// STATUS: GOLD — checks complete Notes locale parity and translated initial renders.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { NOTES_AUX_COPY } from '../../notesAuxLocale';
import { NotesPropertiesPopover } from '../../editor/toolbar/NotesPropertiesPopover';
import { NotesAttachmentPreviewModal } from '../../media/NotesAttachmentPreviewModal';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const attachment = { id: 'note-file', name: 'source.txt', mimeType: 'text/plain', sizeBytes: 12, dataUrl: 'data:text/plain;base64,SGVsbG8=', createdAt: 0, sha256: 'a'.repeat(64) };
const propertyProps = { properties: { owner: 'local' }, onSetProperty: noop, onRemoveProperty: noop } satisfies ComponentProps<typeof NotesPropertiesPopover>;

describe('Notes auxiliary locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(NOTES_AUX_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = NOTES_AUX_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized Properties and attachment-preview controls in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = NOTES_AUX_COPY[locale];
      const propertiesMarkup = renderToStaticMarkup(<NotesPropertiesPopover {...propertyProps} />);
      const previewMarkup = renderToStaticMarkup(<NotesAttachmentPreviewModal attachment={attachment} onClose={noop} />);
      expect(propertiesMarkup).toContain(copy.properties);
      expect(previewMarkup).toContain(`aria-label="${copy.attachmentPreview}"`);
      expect(previewMarkup).toContain(copy.integrityChecking);
      expect(previewMarkup).toContain(copy.integrityBlocked);
      expect(previewMarkup).toContain(copy.saveAs);
      expect(previewMarkup).toContain(copy.close);
    }
  });
});
