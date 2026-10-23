import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NoteAttachment, NotePropertyValue, NoteTagDefinition } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import type { PageFlatItem } from '../../contracts/notesEditor';
import { NOTES_TOOLBAR_COPY } from '../../editor/toolbar/notesToolbarLocale';
import { NotesEditorToolbar } from '../../editor/toolbar/NotesEditorToolbar';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: vi.fn(),
}));

describe('Notes formatting toolbar layout', () => {
  it('keeps common formatting visible and groups advanced tools in an accessible disclosure', () => {
    const noop = () => undefined;
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: noop });
    const copy = NOTES_TOOLBAR_COPY['en-US'];
    const markup = renderToStaticMarkup(
      <NotesEditorToolbar
        title="Release notes"
        onUpdateTitle={noop}
        tags={[]}
        tagDefinitions={[] as NoteTagDefinition[]}
        aliases={[]}
        onAddTag={noop}
        onRemoveTag={noop}
        onAddAlias={noop}
        onRemoveAlias={noop}
        allPagesList={[] as PageFlatItem[]}
        activePageId="page-1"
        onInsertBacklink={noop}
        onInsertFormatting={noop}
        onInsertText={noop}
        pinned={false}
        favorite={false}
        archived={false}
        attachments={[] as NoteAttachment[]}
        onTogglePinned={noop}
        onToggleFavorite={noop}
        onToggleArchived={noop}
        onAddAttachment={noop}
        onRemoveAttachment={noop}
        properties={{} as Record<string, NotePropertyValue>}
        onSetProperty={noop}
        onRemoveProperty={noop}
        showFormattingToolbar
      />,
    );

    expect(markup).toContain(`role="group" aria-label="${copy.textFormatting}"`);
    expect(markup).toContain(`aria-label="${copy.bold}"`);
    expect(markup).toContain(`aria-label="${copy.checklistTask}"`);
    expect(markup).toContain('<summary');
    expect(markup).toContain(copy.moreFormatting);
    expect(markup).toContain(`aria-label="${copy.heading3}"`);
    expect(markup).toContain(`title="${copy.markdownTable}"`);
    expect(markup).toContain('var(--vgt-control-surface)');
    expect(markup).toContain('var(--vgt-focus)');
    expect(markup).toContain(`placeholder="${copy.addTagPlaceholder}"`);
    expect(markup).toContain('notes-tag-entry-input w-32 min-w-32 max-w-full');
  });
});
