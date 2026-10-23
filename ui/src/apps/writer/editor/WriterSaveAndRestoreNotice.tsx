// STATUS: DIAMANT VGT SUPREME — two things that happened and nobody said so
//
// Findings closed here (one disease, two sources):
//
//   W-229  a failed save showed only the status `error`, with no explanation of what happened or what to
//          do. The **shell** owns the status and classifies the reason (`saveStatus`, `saveFailure.code`);
//          this surface renders it. The shell catalogue carries the sentence per reason — this file does
//          not translate anything, so there is one vocabulary and not two.
//   W-225  the caret restore was not announced: `resolveWriterCursorRestore` answered `null` for every
//          refusal, so "the caret is back" and "the caret could not come back" looked identical.
//
// Both are the same rule the interchange batch applied: an operation that did not fully succeed has to say
// so, in the same place the user is looking.
import React from 'react';
import type { WriterCursorRestoreDecision } from '../../../platform/workspace/persistence/workspaceCursorState';

export interface WriterSaveAndRestoreNoticeProps {
  /** Pushed in by the shell (W-229). `undefined` means the surface was not told — then it stays silent. */
  saveStatus?: 'saved' | 'saved-with-warning' | 'saving' | 'unsaved' | 'error';
  saveFailure?: { code: 'storage-full' | 'save-blocked' | 'native-unavailable' | 'unknown'; at: number } | null;
  /** What the caret restore decided (W-225). */
  cursorRestoreNotice?: WriterCursorRestoreDecision | null;
}

/**
 * The sentences for the restore's refusal reasons.
 *
 * Separate from the save reasons on purpose: `saveFailure` is the **shell's** vocabulary and its catalogue
 * is the one source for it. The caret is the Writer's own state, so its wording lives here — and it names
 * a way to continue, not only the fault.
 *
 * `no-marker` is deliberately absent: a document that simply has no stored caret is not a failure and must
 * not produce a message, or every first open would show a warning.
 */
const CURSOR_DECLINE_MESSAGE: Readonly<Record<string, string>> = {
  'other-document': 'Der gespeicherte Cursor gehört zu einem anderen Dokument und wurde nicht angewendet.',
  'paragraph-missing': 'Der gespeicherte Cursor zeigte auf einen Absatz, den es nicht mehr gibt; der Cursor beginnt am Dokumentanfang.',
  'expired-or-unreadable': 'Der gespeicherte Cursor war zu alt oder unlesbar und wurde nicht angewendet.',
};

/** Why a failed save is shown, phrased as the way out. Used when the shell sends no catalogue text. */
const SAVE_FAILURE_FALLBACK: Readonly<Record<string, string>> = {
  'storage-full': 'Der Speicher ist voll. Bitte Platz freigeben und erneut speichern.',
  'save-blocked': 'Das Speichern wurde blockiert. Bitte die Berechtigung prüfen und erneut speichern.',
  'native-unavailable': 'Der native Speicher ist nicht erreichbar. Bitte einen Moment warten — es wird erneut versucht.',
  unknown: 'Das Speichern ist fehlgeschlagen. Bitte erneut versuchen.',
};

export const WriterSaveAndRestoreNotice: React.FC<WriterSaveAndRestoreNoticeProps> = ({
  saveStatus,
  saveFailure = null,
  cursorRestoreNotice = null,
}) => {
  const saveMessage = saveStatus === 'error' && saveFailure
    ? (SAVE_FAILURE_FALLBACK[saveFailure.code] ?? SAVE_FAILURE_FALLBACK.unknown!)
    : null;
  // The decision is a discriminated union; `restored === false` narrows it to the reason variant. Declaring
  // the narrowed value as its own type keeps the compiler (and a reader) from having to re-derive it.
  const declined: { readonly restored: false; readonly reason: string } | null =
    cursorRestoreNotice !== null && cursorRestoreNotice.restored === false ? cursorRestoreNotice : null;
  const cursorMessage = declined === null ? null : CURSOR_DECLINE_MESSAGE[declined.reason] ?? null;
  // `no-marker` and an unmapped reason are not failures: silence is the honest answer.
  const cursorReason = cursorMessage === null || declined === null ? null : declined.reason;

  if (saveMessage === null && cursorMessage === null) return null;

  return (
    <div className="w-full flex-shrink-0 z-30 px-3 pt-2 space-y-1" data-writer-status-notice="true">
      {saveMessage === null ? null : (
        // `role="alert"` because a failed save is not something to discover later (W-229).
        <p
          role="alert"
          data-writer-save-notice="error"
          className="rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-1.5 text-[0.6875rem] text-red-100"
        >
          {saveMessage}
        </p>
      )}
      {cursorMessage === null ? null : (
        // `role="status"` rather than `alert`: the caret position is a courtesy, not a failure of the work.
        <p
          role="status"
          data-writer-cursor-notice={cursorReason}
          className="rounded-lg border border-amber-400/30 bg-amber-950/30 px-3 py-1.5 text-[0.6875rem] text-amber-100"
        >
          {cursorMessage}
        </p>
      )}
    </div>
  );
};
