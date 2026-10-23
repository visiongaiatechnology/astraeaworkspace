// STATUS: GOLD — verifies Notes residual catalogs and all-locale rendering of the embed/history/security/OCR panels.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { NotesWorkspaceEmbedModal } from '../../integrations/NotesWorkspaceEmbedModal';
import { NotesVersionHistoryModal } from '../../history/NotesVersionHistoryModal';
import { NotesSecurityModal } from '../../security/NotesSecurityModal';
import { NotesOcrModal } from '../../media/ocr/NotesOcrModal';
import { NotesCollaborationModal } from '../../collaboration/NotesCollaborationModal';
import { NOTES_EXTENDED_COPY, notesExtendedText } from '../../notesExtendedLocale';
import type { NotePage } from '../../../../shared/contracts/workspace';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;');
const page = { id: 'page-1', title: 'User page', content: 'User content', tags: [], backlinks: [], last_modified: 0, revisions: [] } satisfies NotePage;
const embedProps = { isOpen: true, currentDocumentId: 'current', workspaceDocuments: [], onClose: noop, onInsert: noop } satisfies ComponentProps<typeof NotesWorkspaceEmbedModal>;
const historyProps = { isOpen: true, page, onClose: noop, onRestoreVersion: noop } satisfies ComponentProps<typeof NotesVersionHistoryModal>;
const securityProps = { isOpen: true, notebook: { id: 'n', title: 'User notebook', sections: [] }, section: null, page: null, isLocked: false, onSetPolicy: async () => undefined, onUnlock: async () => true, onLockAll: noop, onToggleSensitive: noop, onClose: noop } satisfies ComponentProps<typeof NotesSecurityModal>;
const ocrProps = { isOpen: true, onClose: noop, onInsertOcrText: noop } satisfies ComponentProps<typeof NotesOcrModal>;
const collaborationProps = { isOpen: true, page, authorId: 'author-1', displayName: 'Local User', onDisplayNameChange: noop, supported: true, enabled: false, onEnabledChange: noop, peers: [], conflictCount: 0, lastError: null, authorAttributionEnabled: false, onAuthorAttributionChange: noop, onAddComment: noop, onResolveComment: noop, onCreateSnapshot: noop, onClose: noop } satisfies ComponentProps<typeof NotesCollaborationModal>;

describe('Notes extended locale coverage', () => {
  it('keeps every translation row complete and populated', () => {
    for (const [message, values] of Object.entries(NOTES_EXTENDED_COPY)) {
      expect(values).toHaveLength(6);
      for (const [index, value] of values.entries()) expect(value.trim(), `${message}[${index}]`).not.toBe('');
    }
  });

  it('renders localized residual panel headings, controls, and empty states in all supported locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const embed = renderToStaticMarkup(<NotesWorkspaceEmbedModal {...embedProps} />);
      const history = renderToStaticMarkup(<NotesVersionHistoryModal {...historyProps} />);
      const security = renderToStaticMarkup(<NotesSecurityModal {...securityProps} />);
      const ocr = renderToStaticMarkup(<NotesOcrModal {...ocrProps} />);
      const collaboration = renderToStaticMarkup(<NotesCollaborationModal {...collaborationProps} />);
      expect(embed).toContain(notesExtendedText('Insert local Workspace reference', locale));
      expect(embed).toContain(notesExtendedText('Source document', locale));
      expect(history).toContain(notesExtendedText('Persisted Revision History', locale));
      expect(history).toContain(notesExtendedText('No prior revisions yet. Notes creates bounded persisted revisions while the page changes.', locale));
      expect(security).toContain(notesExtendedText('Protection policy', locale));
      expect(security).toContain(notesExtendedText('Apply policy', locale));
      expect(ocr).toContain(htmlText(notesExtendedText('Local OCR & Scan Recognition', locale)));
      expect(ocr).toContain(notesExtendedText('Extracted text', locale));
      expect(collaboration).toContain(htmlText(notesExtendedText('Collaboration & Comments', locale)));
      expect(collaboration).toContain(htmlText(notesExtendedText('Page comments & @mentions', locale)));
      expect(collaboration).toContain(notesExtendedText('Enable BroadcastChannel transport', locale));
    }
  });
});
