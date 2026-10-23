// STATUS: DIAMANT VGT SUPREME — visible Notes mutation feedback
//
// AST-0664/AST-0679: every Notes mutation that used to be a silent no-op (checklist → task, tag add/remove,
// backlink insert, rejected attachment) reports here. Extracted so the contract is server-renderable and can
// be counter-checked, instead of being buried in the editor body.
import React from 'react';

export interface NotesEditorNoticeProps {
  message: string | null;
  onDismiss: () => void;
}

export const NotesEditorNotice: React.FC<NotesEditorNoticeProps> = ({ message, onDismiss }) => {
  if (!message) return null;
  return (
    <div
      data-notes-mutation-notice="true"
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-2 border-t border-[var(--vgt-control-border)] bg-[var(--vgt-control-surface)] px-4 py-1 text-[0.6875rem] text-[var(--vgt-control-text)] shrink-0"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-1 text-[var(--vgt-control-muted)] hover:text-[var(--vgt-control-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--vgt-focus)]"
        aria-label="Dismiss message"
      >
        Dismiss
      </button>
    </div>
  );
};
