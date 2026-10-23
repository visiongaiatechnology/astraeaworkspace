// STATUS: DIAMANT VGT SUPREME — WR-038: a real comment composer instead of canned text
//
// The Comment button used to insert the fixed sentence "Review comment on selected passage."
// into the model and then open the navigation pane — the user could neither write a comment
// nor see the one that had just been created. `window.prompt` is not an option in Tauri, so
// the composer is a real dialog: multiline text, author field, Ctrl+Enter to save, Esc to
// cancel, and the focus returns to the writing surface afterwards.
import React, { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { writerCommentModalCopy } from './writerCommentModalLocale';

export interface WriterCommentModalProps {
  readonly isOpen: boolean;
  /** Text the comment refers to, shown read-only so the author knows what they mark. */
  readonly selectionPreview?: string;
  readonly onClose: () => void;
  readonly onSave: (text: string, author: string) => boolean;
}

const MAX_COMMENT_LENGTH = 4_000;

export const WriterCommentModal: React.FC<WriterCommentModalProps> = ({
  isOpen,
  selectionPreview,
  onClose,
  onSave,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = writerCommentModalCopy(locale);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('Reviewer');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setError(null);
    const frame = globalThis.requestAnimationFrame?.(() => textareaRef.current?.focus());
    return () => {
      if (frame !== undefined) globalThis.cancelAnimationFrame?.(frame);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const save = (): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError(copy.empty);
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setError(copy.tooLong);
      return;
    }
    if (!onSave(trimmed, author.trim() || 'Reviewer')) {
      setError(copy.blocked);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      data-writer-comment-dialog="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-white/15 bg-slate-900 p-5 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquarePlus className="h-4 w-4 text-blue-400" aria-hidden="true" />
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label={copy.cancel}
            data-writer-comment-action="cancel"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {selectionPreview && selectionPreview.trim().length > 0 && (
          <p className="max-h-20 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs italic text-slate-400" data-writer-comment-selection="true">
            „{selectionPreview.trim().slice(0, 200)}“
          </p>
        )}

        <label className="block space-y-1 text-xs text-slate-300">
          <span>{copy.textLabel}</span>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => { setText(event.target.value); setError(null); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
            }}
            rows={4}
            maxLength={MAX_COMMENT_LENGTH}
            data-writer-comment-input="true"
            className="w-full resize-none rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          />
        </label>

        <label className="block space-y-1 text-xs text-slate-300">
          <span>{copy.authorLabel}</span>
          <input
            type="text"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-rose-300" data-writer-comment-error="true">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
            data-writer-comment-action="cancel"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            data-writer-comment-action="save"
          >
            {copy.save}
          </button>
        </div>
      </div>
    </div>
  );
};
