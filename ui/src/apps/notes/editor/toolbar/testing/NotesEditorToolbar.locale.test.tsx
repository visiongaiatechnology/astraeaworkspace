// STATUS: PLATIN — verifies Notes toolbar locale parity and accessible rendered copy.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { NOTES_TOOLBAR_COPY } from '../notesToolbarLocale';
import { NotesEditorToolbar } from '../NotesEditorToolbar';

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: vi.fn(),
}));

const noop = (): void => undefined;

const toolbarProps = {
  title: 'Example note',
  onUpdateTitle: noop,
  tags: ['planning'],
  tagDefinitions: [],
  aliases: ['roadmap'],
  onAddTag: noop,
  onRemoveTag: noop,
  onAddAlias: noop,
  onRemoveAlias: noop,
  allPagesList: [],
  activePageId: 'active',
  onInsertBacklink: noop,
  onInsertFormatting: noop,
  onInsertText: noop,
  pinned: false,
  favorite: false,
  archived: false,
  attachments: [{
    id: 'attachment-1',
    name: 'reference.txt',
    mimeType: 'text/plain',
    sizeBytes: 12,
    dataUrl: 'data:text/plain;base64,',
    createdAt: 0,
  }],
  onTogglePinned: noop,
  onToggleFavorite: noop,
  onToggleArchived: noop,
  onAddAttachment: noop,
  onRemoveAttachment: noop,
  properties: {},
  onSetProperty: noop,
  onRemoveProperty: noop,
  showFormattingToolbar: true,
} satisfies ComponentProps<typeof NotesEditorToolbar>;

describe('Notes editor toolbar locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(NOTES_TOOLBAR_COPY['en-US']).sort();

    for (const locale of WORKSPACE_LOCALES) {
      const copy = NOTES_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) {
        expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('renders translated metadata, attachment, and Markdown controls in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({
        preference: locale,
        locale,
        setPreference: noop,
      });

      const copy = NOTES_TOOLBAR_COPY[locale];
      const markup = renderToStaticMarkup(<NotesEditorToolbar {...toolbarProps} />);

      expect(markup).toContain(`placeholder="${copy.titlePlaceholder}"`);
      expect(markup).toContain(copy.tags);
      expect(markup).toContain(`aria-label="${copy.pinNote}"`);
      expect(markup).toContain(`aria-label="${copy.attachLocalFile}"`);
      expect(markup).toContain(`aria-label="${copy.openSafePreview}"`);
      expect(markup).toContain(`aria-label="${copy.textFormatting}"`);
      expect(markup).toContain(`title="${copy.checklistTask}"`);
      expect(markup).toContain(copy.moreFormatting);
      expect(markup).toContain(`title="${copy.footnoteDefinition}"`);
    }
  });
});
