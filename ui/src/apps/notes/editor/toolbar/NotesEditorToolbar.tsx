import React, { useState } from 'react';
import { PageFlatItem } from '../../contracts/notesEditor';
import type { NoteAttachment, NotePropertyValue, NoteTagDefinition } from '../../../../shared/contracts/workspace';
import { NotesPropertiesPopover } from './NotesPropertiesPopover';
import { NotesAttachmentPreviewModal } from '../../media/NotesAttachmentPreviewModal';
import { insertMarkdownTable } from '../markdown/notesMarkdownEditing';
import { downloadNoteAttachment, fileToNoteAttachment } from '../../media/noteAttachments';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { notesToolbarText } from './notesToolbarLocale';
import {
  Tag,
  X,
  Link2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Pin,
  Heart,
  Archive,
  Paperclip,
  Download,
  Eye,
  ChevronDown,
} from 'lucide-react';

interface NotesEditorToolbarProps {
  title: string;
  onUpdateTitle: (title: string) => void;
  tags: string[];
  tagDefinitions: NoteTagDefinition[];
  aliases: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onAddAlias: (alias: string) => void;
  onRemoveAlias: (alias: string) => void;
  allPagesList: PageFlatItem[];
  activePageId: string;
  onInsertBacklink: (targetPageTitle: string) => void;
  onInsertFormatting: (prefix: string, suffix?: string) => void;
  onInsertText: (text: string) => void;
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  attachments: NoteAttachment[];
  onTogglePinned: () => void;
  onToggleFavorite: () => void;
  onToggleArchived: () => void;
  onAddAttachment: (attachment: NoteAttachment) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  properties: Record<string, NotePropertyValue>;
  onSetProperty: (key: string, value: NotePropertyValue) => void;
  onRemoveProperty: (key: string) => void;
  showFormattingToolbar: boolean;
}

export const NotesEditorToolbar: React.FC<NotesEditorToolbarProps> = ({
  title,
  onUpdateTitle,
  tags,
  tagDefinitions,
  aliases,
  onAddTag,
  onRemoveTag,
  onAddAlias,
  onRemoveAlias,
  allPagesList,
  activePageId,
  onInsertBacklink,
  onInsertFormatting,
  onInsertText,
  pinned,
  favorite,
  archived,
  attachments,
  onTogglePinned,
  onToggleFavorite,
  onToggleArchived,
  onAddAttachment,
  onRemoveAttachment,
  properties,
  onSetProperty,
  onRemoveProperty,
  showFormattingToolbar,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof notesToolbarText>[0]): string => notesToolbarText(message, locale);
  const [newTagInput, setNewTagInput] = useState('');
  const [newAliasInput, setNewAliasInput] = useState('');
  const [isBacklinkPickerOpen, setIsBacklinkPickerOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachment | null>(null);
  const tagDefinitionByKey = new Map(tagDefinitions.map((definition) => [definition.name.normalize('NFKC').trim().toLocaleLowerCase(), definition]));

  const handleAddTagSubmit = () => {
    if (!newTagInput.trim()) return;
    const cleanTag = newTagInput.trim().replace(/^#/, '').toLowerCase();
    onAddTag(cleanTag);
    setNewTagInput('');
  };

  return (
    <>
      {/* Note Metadata Header (Title, Tags, Backlinks) */}
      <div className="vgt-app-toolbar-band px-6 py-4 border-b border-white/[0.06] bg-slate-900/30 space-y-3 shrink-0" data-vgt-app-toolbar-band="notes-metadata">
        {/* Title input */}
        <input
          type="text"
          value={title}
          data-vgt-app-guide-anchor="Notes:first"
          onChange={(e) => onUpdateTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          className="w-full text-2xl font-black text-slate-100 bg-transparent outline-none placeholder-slate-600 tracking-tight select-text no-scrollbar"
        />

        {/* Tags & Backlink Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.6875rem] text-slate-500 font-medium flex items-center space-x-1 mr-1">
            <Tag className="w-3 h-3" />
            <span>{t('tags')}</span>
          </span>
          {tags.map((tag) => {
            const definition = tagDefinitionByKey.get(tag.normalize('NFKC').trim().toLocaleLowerCase());
            return (
            <span
              key={tag}
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-500/10 border text-blue-300 text-xs font-medium"
              style={{ borderColor: definition?.color ?? 'rgba(59,130,246,0.2)' }}
            >
              <span>{definition?.icon ?? '#'} {tag}</span>
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="hover:text-red-400 ml-1"
                aria-label={t('removeTag')} title={t('removeTag')}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          );})}

          {/* Add Tag Inline Input */}
          <div className="flex items-center">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTagSubmit();
                }
              }}
              list="notes-tag-definitions"
              placeholder={t('addTagPlaceholder')}
              className="notes-tag-entry-input w-32 min-w-32 max-w-full px-2 py-0.5 text-xs bg-slate-950/60 border border-white/10 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
            <datalist id="notes-tag-definitions">{tagDefinitions.map((definition) => <option key={definition.id} value={definition.name}>{definition.icon} {definition.name}</option>)}</datalist>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <NotesPropertiesPopover properties={properties} onSetProperty={onSetProperty} onRemoveProperty={onRemoveProperty} />
            <button type="button" onClick={onTogglePinned} className={`p-1.5 rounded-lg border ${pinned ? 'border-blue-500/40 bg-blue-500/15 text-blue-300' : 'border-white/10 text-slate-500 hover:text-blue-300'}`} aria-label={pinned ? t('unpinNote') : t('pinNote')} title={pinned ? t('unpinNote') : t('pinNote')}><Pin className="w-3.5 h-3.5" fill={pinned ? 'currentColor' : 'none'} /></button>
            <button type="button" onClick={onToggleFavorite} className={`p-1.5 rounded-lg border ${favorite ? 'border-rose-500/40 bg-rose-500/15 text-rose-300' : 'border-white/10 text-slate-500 hover:text-rose-300'}`} aria-label={favorite ? t('removeFromFavorites') : t('addToFavorites')} title={favorite ? t('removeFromFavorites') : t('addToFavorites')}><Heart className="w-3.5 h-3.5" fill={favorite ? 'currentColor' : 'none'} /></button>
            <button type="button" onClick={onToggleArchived} className={`p-1.5 rounded-lg border ${archived ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' : 'border-white/10 text-slate-500 hover:text-amber-300'}`} aria-label={archived ? t('restoreFromArchive') : t('archiveNote')} title={archived ? t('restoreFromArchive') : t('archiveNote')}><Archive className="w-3.5 h-3.5" /></button>
            <label className="p-1.5 rounded-lg border border-white/10 text-slate-500 hover:text-purple-300 cursor-pointer" title={t('attachLocalFile')}>
              <Paperclip className="w-3.5 h-3.5" />
              <input type="file" aria-label={t('attachLocalFile')} className="hidden" onChange={async (event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                try {
                  setAttachmentError(null);
                  onAddAttachment(await fileToNoteAttachment(file, attachments));
                } catch {
                  setAttachmentError(t('attachmentAddFailed'));
                }
              }} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1 ml-1">
            <span className="text-[0.625rem] text-slate-500">{t('aliases')}</span>
            {aliases.map((alias) => (
              <span key={alias} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[0.625rem] text-purple-200">
                {alias}
                <button type="button" onClick={() => onRemoveAlias(alias)} className="hover:text-red-300" aria-label={`${t('removeAlias')}: ${alias}`}><X className="w-2.5 h-2.5" /></button>
              </span>
            ))}
            <input
              value={newAliasInput}
              onChange={(event) => setNewAliasInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const alias = newAliasInput.trim();
                  if (alias) onAddAlias(alias);
                  setNewAliasInput('');
                }
              }}
              placeholder={t('addPageAlias')}
              className="w-20 px-1.5 py-0.5 text-[0.625rem] bg-slate-950/60 border border-white/10 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/40"
              aria-label={t('addPageAlias')}
            />
          </div>

          {/* Insert Backlink Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsBacklinkPickerOpen(!isBacklinkPickerOpen)}
              className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-300 transition-colors"
            >
              <Link2 className="w-3 h-3 text-blue-400" />
              <span>{t('insertBacklink')}</span>
            </button>

            {/* Backlink Picker Dropdown */}
            {isBacklinkPickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsBacklinkPickerOpen(false)}
                />
                <div className="absolute right-0 top-8 z-50 w-64 glass-dropdown rounded-xl p-2 space-y-1 shadow-2xl border border-white/15">
                  <span className="text-[0.625rem] font-bold text-slate-400 uppercase tracking-wider block px-1 mb-1">
                    {t('linkToPage')}
                  </span>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {allPagesList
                      .filter((p) => p.id !== activePageId)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onInsertBacklink(p.title);
                            setIsBacklinkPickerOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-blue-600/20 text-slate-200 hover:text-blue-300 flex items-center justify-between transition-colors"
                        >
                          <span className="truncate">{p.title}</span>
                          <span className="text-[0.5625rem] text-slate-500 truncate ml-2">
                            {p.notebookTitle}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {(attachments.length > 0 || attachmentError) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[0.625rem]">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-200">
                <Paperclip className="w-3 h-3" />
                <span className="max-w-44 truncate" title={attachment.name}>{attachment.name}</span>
                <span className="text-purple-400">{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</span>
                <button type="button" onClick={() => setPreviewAttachment(attachment)} aria-label={t('openSafePreview')} title={t('openSafePreview')} className="hover:text-white"><Eye className="w-3 h-3" /></button>
                <button type="button" onClick={() => { void downloadNoteAttachment(attachment).catch(() => setAttachmentError(t('saveAsBlocked'))); }} aria-label={t('saveAs')} title={t('saveAs')} className="hover:text-white"><Download className="w-3 h-3" /></button>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={t('removeAttachment')} title={t('removeAttachment')} className="hover:text-red-300"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {attachmentError && <span className="text-red-300">{attachmentError}</span>}
          </div>
        )}
      </div>

      {/* Markdown Formatting Toolbar */}
      {showFormattingToolbar && (
        <div className="vgt-app-toolbar-band min-h-10 bg-[var(--vgt-control-surface)] border-b border-[var(--vgt-control-border)] px-3 py-1 flex flex-wrap items-center gap-1 text-xs shrink-0" data-vgt-app-toolbar-band="notes-formatting" role="group" aria-label={t('textFormatting')}>
          <button
            type="button"
            onClick={() => onInsertFormatting('**', '**')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('bold')} title={t('bold')}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('*', '*')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('italic')} title={t('italic')}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('<u>', '</u>')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('underline')} title={t('underline')}
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('~~', '~~')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('strikethrough')} title={t('strikethrough')}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <div aria-hidden="true" className="mx-1 h-4 w-px bg-[var(--vgt-control-border)]" />

          <button
            type="button"
            onClick={() => onInsertFormatting('# ')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('heading1')} title={t('heading1')}
          >
            <Heading1 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('## ')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('heading2')} title={t('heading2')}
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('- ')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('bulletList')} title={t('bulletList')}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('1. ')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('numberedList')} title={t('numberedList')}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onInsertFormatting('- [ ] ')}
            className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
            aria-label={t('checklistTask')} title={t('checklistTask')}
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>

          <details className="relative ml-auto shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--vgt-control-border)] px-2 py-1.5 text-[0.6875rem] font-medium text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)] [&::-webkit-details-marker]:hidden">
              {t('moreFormatting')}
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 flex w-max max-w-[min(90vw,28rem)] flex-wrap items-center gap-1 rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl">
              <button type="button" onClick={() => onInsertFormatting('### ')} className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label={t('heading3')} title={t('heading3')}><Heading3 className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onInsertFormatting('`', '`')} className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label={t('inlineCode')} title={t('inlineCode')}><Code className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onInsertFormatting('> ')} className="rounded-md p-1.5 text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]" aria-label={t('quote')} title={t('quote')}><Quote className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => onInsertFormatting('> [!NOTE] ')} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('callout')}>{t('callout')}</button>
              <button type="button" onClick={() => onInsertText(`\n${insertMarkdownTable()}\n`)} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('markdownTable')}>{t('table')}</button>
              <button type="button" onClick={() => onInsertText('\n---\n')} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('horizontalRule')}>{t('horizontalRuleShort')}</button>
              <button type="button" onClick={() => onInsertFormatting('[', '](https://example.com)')} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('externalLink')}>{t('link')}</button>
              <button type="button" onClick={() => onInsertFormatting('==', '==')} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('highlight')}>{t('highlightShort')}</button>
              <button type="button" onClick={() => onInsertFormatting('{color:#60a5fa}', '{/color}')} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('textColor')}>{t('textColorShort')}</button>
              <button type="button" onClick={() => onInsertText('\n[^1]: Footnote text\n')} className="rounded-md px-2 py-1.5 text-[0.6875rem] text-[var(--vgt-control-muted)] transition-colors hover:bg-[var(--vgt-control-hover)] hover:text-[var(--vgt-control-text)]" title={t('footnoteDefinition')}>{t('footnote')}</button>
            </div>
          </details>
        </div>
      )}
      <NotesAttachmentPreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </>
  );
};
