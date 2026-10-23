import React, { useEffect, useRef } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellChromeCopy } from '../i18n/shellChromeLocale';

type DirtyCloseAction = 'save' | 'discard' | 'cancel';

interface DirtyCloseDialogProps {
  document: WorkspaceDocument | null;
  onResolve: (action: DirtyCloseAction) => void;
}

export const DirtyCloseDialog: React.FC<DirtyCloseDialogProps> = ({ document, onResolve }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellChromeCopy(locale).dirtyClose;
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!document) return;
    const frame = requestAnimationFrame(() => cancelRef.current?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onResolve('cancel'); }
    };
    window.addEventListener('keydown', keydown, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown, true); };
  }, [document, onResolve]);
  if (!document) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="dirty-close-title" aria-describedby="dirty-close-description">
      <section className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-[#0a0714] p-5 shadow-2xl">
        <h2 id="dirty-close-title" className="text-sm font-semibold text-slate-100">{copy.title}</h2>
        <p id="dirty-close-description" className="mt-2 text-xs leading-5 text-slate-400">
          {copy.description(document.title)}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => onResolve('cancel')} className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">{copy.cancel}</button>
          <button type="button" onClick={() => onResolve('discard')} className="rounded-md border border-rose-500/30 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/10">{copy.discard}</button>
          <button type="button" onClick={() => onResolve('save')} className="rounded-md border border-purple-400/30 bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500">{copy.save}</button>
        </div>
      </section>
    </div>
  );
};
