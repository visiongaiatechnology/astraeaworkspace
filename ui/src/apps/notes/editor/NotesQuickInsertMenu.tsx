// STATUS: DIAMANT VGT SUPREME — accessible quick-insert (slash) menu for the Notes body
//
// The component only wires the pure model in `notesQuickInsert.ts`: it renders the filtered list, keeps
// the highlight index and reports the chosen item. It owns no trigger rule and no markdown syntax.
import React, { useEffect, useMemo, useRef } from 'react';
import type { NoteAttachment } from '../../../shared/contracts/workspace';
import { fileToNoteAttachment } from '../media/noteAttachments';
import {
  filterQuickInsertItems,
  moveQuickInsertIndex,
  type NotesQuickInsertAction,
  type NotesQuickInsertItem,
} from './notesQuickInsert';

export interface NotesQuickInsertMenuProps {
  query: string;
  onApply: (item: NotesQuickInsertItem) => void;
  onAction: (action: NotesQuickInsertAction) => void;
  onClose: () => void;
  attachments: readonly NoteAttachment[];
  onAddAttachment: (attachment: NoteAttachment) => void;
  onInsertAttachmentReference: (attachment: NoteAttachment) => void;
  onAttachmentError: (message: string) => void;
  /** Highlight index owned by the caller so the textarea key handler can drive it. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  items?: readonly NotesQuickInsertItem[];
}

export const NotesQuickInsertMenu: React.FC<NotesQuickInsertMenuProps> = ({
  query,
  onApply,
  onAction,
  onClose,
  attachments,
  onAddAttachment,
  onInsertAttachmentReference,
  onAttachmentError,
  activeIndex,
  onActiveIndexChange,
  items,
}) => {
  const filtered = useMemo(() => filterQuickInsertItems(query, items), [query, items]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // The highlight must stay inside the filtered list when the query narrows it.
  useEffect(() => {
    if (filtered.length === 0) { onActiveIndexChange(0); return; }
    if (activeIndex >= filtered.length) onActiveIndexChange(0);
  }, [filtered.length, activeIndex, onActiveIndexChange]);

  useEffect(() => { activeItemRef.current?.scrollIntoView({ block: 'nearest' }); }, [activeIndex]);

  const pickFiles = async (files: readonly File[], imageOnly: boolean) => {
    let existing = [...attachments];
    for (const file of files.slice(0, 8)) {
      try {
        const attachment = await fileToNoteAttachment(file, existing);
        onAddAttachment(attachment);
        existing = [...existing, attachment];
        if (!imageOnly || attachment.mimeType.startsWith('image/')) onInsertAttachmentReference(attachment);
      } catch {
        onAttachmentError('The file was rejected by the bounded Notes attachment policy (size, type or integrity).');
      }
    }
    onClose();
  };

  const requestAction = (action: NotesQuickInsertAction) => {
    if (action === 'image') { imageInputRef.current?.click(); return; }
    if (action === 'file') { fileInputRef.current?.click(); return; }
    onAction(action);
  };

  return (
    <div
      data-notes-quick-insert="true"
      role="listbox"
      aria-label="Quick insert"
      aria-activedescendant={filtered[activeIndex] ? `notes-quick-insert-${filtered[activeIndex].id}` : undefined}
      className="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-[min(26rem,80vw)] overflow-y-auto rounded-xl border border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between px-2 py-1 text-[0.625rem] uppercase tracking-wider text-[var(--vgt-control-muted)]">
        <span>{query ? `Insert · ${query}` : 'Insert'}</span>
        <button type="button" onClick={onClose} className="rounded px-1 text-[0.625rem] hover:text-[var(--vgt-control-text)]" aria-label="Close quick insert">Esc</button>
      </div>
      {filtered.length === 0 && <div role="status" className="px-2 py-3 text-[0.6875rem] text-[var(--vgt-control-muted)]">No building block matches “{query}”.</div>}
      {filtered.map((item, index) => (
        <button
          key={item.id}
          id={`notes-quick-insert-${item.id}`}
          ref={index === activeIndex ? activeItemRef : undefined}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => { if (item.action) requestAction(item.action); else onApply(item); }}
          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${index === activeIndex ? 'bg-[var(--vgt-accent-soft)] text-[var(--vgt-accent-strong)]' : 'text-[var(--vgt-control-text)] hover:bg-[var(--vgt-control-hover)]'}`}
        >
          <span className="mt-0.5 shrink-0 rounded border border-[var(--vgt-control-border)] px-1 text-[0.5625rem] uppercase tracking-wider text-[var(--vgt-control-muted)]">{item.group}</span>
          <span className="min-w-0">
            <span className="block truncate text-[0.6875rem] font-medium">{item.label}</span>
            <span className="block truncate text-[0.625rem] text-[var(--vgt-control-muted)]">{item.description}</span>
          </span>
        </button>
      ))}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        aria-label="Insert local image"
        onChange={async (event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; await pickFiles(files, true); }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Insert local file attachment"
        onChange={async (event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; await pickFiles(files, false); }}
      />
    </div>
  );
};

/** Key resolution for the open menu. Returns the consumed command or `null` so the textarea keeps typing. */
export function resolveQuickInsertKey(
  key: string,
  length: number,
  activeIndex: number,
): { type: 'move'; index: number } | { type: 'apply' } | { type: 'close' } | null {
  if (key === 'Escape') return { type: 'close' };
  if (key === 'ArrowDown') return { type: 'move', index: moveQuickInsertIndex(activeIndex, 1, length) };
  if (key === 'ArrowUp') return { type: 'move', index: moveQuickInsertIndex(activeIndex, -1, length) };
  if (key === 'Enter' || key === 'Tab') return length > 0 ? { type: 'apply' } : { type: 'close' };
  return null;
}
