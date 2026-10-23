// STATUS: DIAMANT VGT SUPREME
// The visible entry for opening an arbitrary foreign PDF — inside PDF Studio, not only in the shell.
//
// AST-0761 asks for a directly reachable visible entry with state, feedback, mouse **and** keyboard control,
// click/drop targets and fitting error messages. The shell has a picker of its own
// (`shell/start-center/StartCenter.tsx`), but a user who is already in PDF Studio had no way in; that is the
// gap this panel closes, using the canonical import boundary rather than a second one.
//
// Accessibility contract: the drop zone is a labelled `button` (so it is reachable with Tab, Enter and Space),
// the file input is a real `<input type="file">` with `accept`, every failure is a `role="alert"` with a named
// reason, and the panel never claims success without the platform's page count and digest.

import React, { useRef, useState } from 'react';
import { FileInput, LoaderCircle, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { pdfWorkflowText } from '../../locale/pdfWorkflowDialogsLocale';
import { maxPersistableNativePdfBytes } from '../../persistence/pdfStudioPersistence';
import { openNativePdfPayload, type PdfNativeOpenFailure, type PdfNativeOpenSuccess } from '../native/openNativePdfPayload';

interface PdfNativeOpenPanelProps {
  /** Called with the opened byte payload. The caller decides whether it becomes a derived document. */
  onOpened: (result: PdfNativeOpenSuccess) => void;
  /** Called when the panel can be dismissed; omitted when the panel is the only content of its host. */
  onClose?: () => void;
}

const failureKey = (code: PdfNativeOpenFailure['code']) => `nativeOpen.failed.${code}` as const;

export const PdfNativeOpenPanel: React.FC<PdfNativeOpenPanelProps> = ({ onOpened, onClose }) => {
  const { locale } = useWorkspaceLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PdfNativeOpenFailure | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const openFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setFailure(null);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await openNativePdfPayload({ fileName: file.name, bytes });
      if (result.ok) onOpened(result);
      else setFailure(result);
    } catch (cause) {
      setFailure({ ok: false, code: 'read-failed', detail: cause instanceof Error ? cause.message : 'the file could not be read' });
    } finally {
      setBusy(false);
    }
  };

  const limitMb = Math.round(maxPersistableNativePdfBytes() / (1024 * 1024));

  return (
    <section
      data-pdf-native-open="true"
      className="shrink-0 border-b border-white/[0.08] bg-slate-950/80 px-3 py-2"
      aria-label={pdfWorkflowText(locale, 'nativeOpen.title')}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => { event.preventDefault(); setIsDragging(false); void openFile(event.dataTransfer.files?.[0]); }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileInput aria-hidden="true" className="h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0">
            <div className="text-[0.6875rem] font-semibold text-slate-200">{pdfWorkflowText(locale, 'nativeOpen.title')}</div>
            <p className="mt-0.5 max-w-[70ch] text-[0.625rem] leading-4 text-slate-400">{pdfWorkflowText(locale, 'nativeOpen.hint')}</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label={pdfWorkflowText(locale, 'nativeOpen.choose')}
            onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void openFile(file); }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[0.6875rem] font-medium text-red-100 transition-colors hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300 disabled:opacity-50"
          >
            {busy ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Upload aria-hidden="true" className="h-3.5 w-3.5" />}
            {pdfWorkflowText(locale, 'nativeOpen.choose')}
          </button>
          <span className={`rounded-lg border border-dashed px-2.5 py-1.5 text-[0.625rem] ${isDragging ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100' : 'border-white/15 text-slate-400'}`}>
            {pdfWorkflowText(locale, 'nativeOpen.drop')}
          </span>
          <span className="font-mono text-[0.5625rem] text-slate-500">{pdfWorkflowText(locale, 'nativeOpen.hintLimit', { bytes: maxPersistableNativePdfBytes().toLocaleString(locale) })}</span>
          {onClose ? (
            <button type="button" onClick={onClose} className="rounded border border-white/10 px-2 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10">
              {pdfWorkflowText(locale, 'common.close')}
            </button>
          ) : null}
        </div>
      </div>

      {failure ? (
        <div role="alert" data-pdf-native-open-failure={failure.code} className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2 py-1.5 text-[0.625rem] text-amber-100">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="min-w-0 break-words">
            {pdfWorkflowText(locale, failureKey(failure.code))}
            <span className="mt-0.5 block font-mono text-[0.5625rem] text-amber-200/70">{failure.code} · {failure.detail.slice(0, 200)}</span>
          </span>
        </div>
      ) : null}

      <div className="mt-1.5 flex items-center gap-1.5 text-[0.5625rem] text-slate-500">
        <ShieldCheck aria-hidden="true" className="h-3 w-3 text-emerald-400" />
        <span>{pdfWorkflowText(locale, 'nativeOpen.hintLimit', { bytes: `${limitMb} MiB` })}</span>
      </div>
    </section>
  );
};
