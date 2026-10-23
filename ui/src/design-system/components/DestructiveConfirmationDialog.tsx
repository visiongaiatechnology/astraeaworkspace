import React, { useEffect, useId, useRef, useState } from 'react';

interface DestructiveConfirmationDialogProps {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  requiredText?: string;
  requiredTextLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DestructiveConfirmationDialog: React.FC<DestructiveConfirmationDialogProps> = ({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  requiredText,
  requiredTextLabel = 'Type the confirmation phrase',
  onCancel,
  onConfirm,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const requiredTextId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  const phraseMatches = requiredText === undefined || typedText === requiredText;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md space-y-4 rounded-2xl border border-rose-400/30 bg-slate-950 p-5 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        <div>
          <h2 id={titleId} className="text-sm font-semibold text-slate-100">{title}</h2>
          <p id={descriptionId} role="alert" className="mt-2 text-xs leading-5 text-slate-300">{description}</p>
        </div>
        {requiredText !== undefined && (
          <label htmlFor={requiredTextId} className="block text-[11px] text-slate-300">
            {requiredTextLabel}
            <input
              id={requiredTextId}
              type="text"
              autoComplete="off"
              value={typedText}
              onChange={(event) => setTypedText(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-rose-400/25 bg-black/40 px-3 py-2 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            />
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-initial-focus="cancel"
            onClick={onCancel}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!phraseMatches}
            onClick={onConfirm}
            className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
