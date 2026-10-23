// STATUS: DIAMANT VGT SUPREME — centralized bounded/export-interoperability surface
import React, { useMemo, useState } from 'react';
import { Check, FileArchive, FileDown, FileText, KeyRound, Package, X } from 'lucide-react';
import type { PresentDocumentModel, PresentPackagedFont, PresentSlide, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_WORKFLOW_COPY, presentExportFailureCopy } from '../locale/presentWorkflowLocale';
import {
  PRESENT_OFFICE_FIDELITY_LIMITS,
  PRESENT_OFFICE_MAX_SLIDES,
  exportPresentDeck,
  verifyPresentRoundTrip,
  type PresentFidelityComparison,
  type PresentOfficeFormat,
} from './office/presentOfficeRoundTrip';
import {
  downloadPresentBlob,
  downloadPresentPdf,
  downloadPresentSlideJpeg,
  downloadPresentSlidePng,
  downloadPresentSlideSvg,
  resolvePresentSlideSelection,
  safePresentFileName,
} from './render/presentExport';
import { downloadPresentHandoutPdf, downloadPresentNotesPdf } from './document-export/presentDocumentExport';
import {
  downloadNativeVpresent,
  downloadPresentPortablePackage,
  listPresentExternalMedia,
  presentPackagedFontFromFile,
} from './package/presentPackageExport';
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { presentExportDeliveryText, presentExportFailureText } from './presentExportStatus';

interface PresentExportCenterModalProps {
  isOpen: boolean;
  document: WorkspaceDocument;
  model: PresentDocumentModel;
  /**
   * The active slide, or nothing at all: an authored empty deck stays empty (`DEF-RE-004`), so a deck
   * with nought slides is a real state and there is no "current slide" to render to a file. The three
   * single-slide exports below are therefore disabled instead of being handed `undefined`.
   */
  currentSlide?: PresentSlide;
  onClose: () => void;
}

type BusyAction = 'pdf' | 'notes' | 'handout' | 'png' | 'jpeg' | 'native' | 'package' | 'verify' | null;

export const PresentExportCenterModal: React.FC<PresentExportCenterModalProps> = ({ isOpen, document, model, currentSlide, onClose }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_WORKFLOW_COPY[locale].export;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const [fonts, setFonts] = useState<PresentPackagedFont[]>([]);
  const [error, setError] = useState('');
  /** Release Beta 0.1: states whether an export was written to a file or only downloaded. */
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<BusyAction>(null);
  /** Result of the in-process round trip ("PPTX exportieren und vergleichen"). */
  const [verification, setVerification] = useState<{ format: PresentOfficeFormat; comparison: PresentFidelityComparison; bytes: number } | null>(null);
  const externalMedia = useMemo(() => listPresentExternalMedia(document), [document]);

  if (!isOpen) return null;
  const exportIds = selectedIds.length ? selectedIds : undefined;
  const selectedSlideCount = resolvePresentSlideSelection(model, exportIds).length;
  const overInteropLimit = selectedSlideCount > PRESENT_OFFICE_MAX_SLIDES;

  const run = async (action: Exclude<BusyAction, null>, task: () => Promise<ExportDeliveryResult | void>) => {
    setError('');
    setNotice('');
    setBusy(action);
    try {
      const result = await task();
      if (result) setNotice(presentExportDeliveryText(locale, result));
    } catch (cause) { setError(presentExportFailureText(locale, cause)); } finally { setBusy(null); }
  };

  /** For paths that only produce bytes (Office interop, SVG): same delivery statement, no busy label. */
  const runSync = async (task: () => Promise<ExportDeliveryResult>) => {
    setError('');
    setNotice('');
    try { setNotice(presentExportDeliveryText(locale, await task())); } catch (cause) { setError(presentExportFailureText(locale, cause)); }
  };

  const toggleSlide = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="present-export-title">
    <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 shadow-2xl text-xs text-slate-200">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="min-w-0"><div id="present-export-title" className="text-sm font-bold text-white break-words">{copy.title}</div><div className="text-[0.625rem] text-slate-500 break-words">{copy.subtitle}</div></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={copy.close}><X className="h-4 w-4" /></button>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4" aria-labelledby="present-export-office">
          <h3 id="present-export-office" className="font-bold text-blue-200 flex items-center gap-2"><FileArchive className="h-4 w-4" />{copy.officeNative}</h3>
          <div className="grid grid-cols-2 gap-2">
            {/* Exports go through `exportPresentDeck`, which enforces the 512-slide interop ceiling
                and the Present-document check. Calling `exportPptx`/`exportOdp` directly (as this
                button used to) silently bypassed that bound. */}
            <button
              type="button"
              disabled={overInteropLimit}
              onClick={() => { void runSync(() => downloadPresentBlob(new Blob([exportPresentDeck(document, 'pptx') as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${safePresentFileName(document.title)}.pptx`)); }}
              className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-200 disabled:opacity-40"
              data-present-export="pptx"
            >PPTX</button>
            <button
              type="button"
              disabled={overInteropLimit}
              onClick={() => { void runSync(() => downloadPresentBlob(new Blob([exportPresentDeck(document, 'odp') as unknown as BlobPart], { type: 'application/vnd.oasis.opendocument.presentation' }), `${safePresentFileName(document.title)}.odp`)); }}
              className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-200 disabled:opacity-40"
              data-present-export="odp"
            >ODP</button>
          </div>
          {overInteropLimit && (
            <div role="alert" data-present-export-limit="true" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[0.625rem] text-amber-100">
              This deck has {selectedSlideCount} slides; the interoperable ceiling is {PRESENT_OFFICE_MAX_SLIDES}. The export is refused instead of truncated - split the deck first.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy !== null || overInteropLimit}
              onClick={() => void run('verify', async () => {
                const result = await verifyPresentRoundTrip(document, 'pptx');
                setVerification({ format: 'pptx', comparison: result.comparison, bytes: result.bytes });
              })}
              className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-[0.625rem] text-cyan-200 disabled:opacity-40"
              data-present-export-verify="pptx"
            >Verify PPTX round trip</button>
            <button
              type="button"
              disabled={busy !== null || overInteropLimit}
              onClick={() => void run('verify', async () => {
                const result = await verifyPresentRoundTrip(document, 'odp');
                setVerification({ format: 'odp', comparison: result.comparison, bytes: result.bytes });
              })}
              className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-[0.625rem] text-cyan-200 disabled:opacity-40"
              data-present-export-verify="odp"
            >Verify ODP round trip</button>
          </div>
          {verification && (
            <div data-present-fidelity-report={verification.format} className="space-y-1 rounded-lg border border-white/10 bg-black/25 p-2 text-[0.625rem]">
              <div className="font-semibold text-slate-200">
                Round trip {verification.format.toUpperCase()} · {Math.round(verification.bytes / 1024)} KiB ·
                slides {verification.comparison.slideCountBefore} → {verification.comparison.slideCountAfter} ·
                identical: {String(verification.comparison.identical)}
              </div>
              <div className="text-emerald-200">Preserved ({verification.comparison.preservedFields.length}): {verification.comparison.preservedFields.join(', ') || '—'}</div>
              <div className="text-amber-200">Changed ({verification.comparison.changedFields.length}): {verification.comparison.changedFields.join(', ') || '—'}</div>
              <div className="text-rose-200">Lost ({verification.comparison.lostFields.length}): {verification.comparison.lostFields.join(', ') || '—'}</div>
              <ul className="list-disc space-y-0.5 pl-4 text-slate-400">
                {PRESENT_OFFICE_FIDELITY_LIMITS.map((limit) => <li key={limit}>{limit}</li>)}
              </ul>
            </div>
          )}
          <label className="block text-[0.625rem] text-slate-400"><span className="mb-1 block">{copy.password}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" aria-label={copy.password} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-slate-100 outline-none" /></label>
          <button type="button" disabled={busy !== null} onClick={() => void run('native', () => downloadNativeVpresent(document, password))} className="w-full whitespace-normal rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 font-semibold text-emerald-200 disabled:opacity-50"><KeyRound className="mr-1 inline h-3.5 w-3.5" />{copy.encryptedNative}</button>
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4" aria-labelledby="present-export-rendered">
          <h3 id="present-export-rendered" className="font-bold text-cyan-200 flex items-center gap-2"><FileDown className="h-4 w-4" />{copy.renderedOutputs}</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void run('pdf', () => downloadPresentPdf(document.title, model, exportIds, locale))} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2">{copy.pdf} {selectedIds.length ? `(${selectedIds.length})` : copy.deck}</button>
            <button type="button" disabled={busy !== null} onClick={() => void run('notes', () => downloadPresentNotesPdf(document.title, model, exportIds, locale))} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2">{copy.speakerNotes}</button>
            <button type="button" disabled={busy !== null} onClick={() => void run('handout', () => downloadPresentHandoutPdf(document.title, model, exportIds, locale))} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2">{copy.handout}</button>
            <button type="button" disabled={!currentSlide} onClick={() => { if (currentSlide) void runSync(() => downloadPresentSlideSvg(document.title, currentSlide, model, locale)); }} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 disabled:opacity-50">{copy.currentSvg}</button>
            <button type="button" disabled={busy !== null || !currentSlide} onClick={() => currentSlide && void run('png', () => downloadPresentSlidePng(document.title, currentSlide, model, locale))} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 disabled:opacity-50">{copy.currentPng}</button>
            <button type="button" disabled={busy !== null || !currentSlide} onClick={() => currentSlide && void run('jpeg', () => downloadPresentSlideJpeg(document.title, currentSlide, model, locale))} className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 disabled:opacity-50">{copy.currentJpeg}</button>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="mb-2 text-[0.625rem] font-semibold text-slate-400 break-words">{copy.slideSelection}</div><div className="mb-1 text-[0.625rem] text-slate-500" aria-live="polite">{copy.slideCount(selectedIds.length)}</div><div className="max-h-28 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">{model.slides.map((slide, index) => <label key={slide.id} className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5"><input type="checkbox" checked={selectedIds.includes(slide.id)} onChange={() => toggleSlide(slide.id)} /><span className="truncate">{index + 1}. {slide.title}</span></label>)}</div></div>
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 lg:col-span-2" aria-labelledby="present-export-package">
          <h3 id="present-export-package" className="font-bold text-purple-200 flex items-center gap-2"><Package className="h-4 w-4" />{copy.packageTitle}</h3>
          <p className="text-[0.625rem] leading-5 text-slate-400 break-words">{copy.packageDescription}</p>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="rounded-lg border border-dashed border-purple-500/30 bg-purple-500/5 p-3 text-purple-200 cursor-pointer"><FileText className="mr-1 inline h-3.5 w-3.5" />{copy.addFonts}<input type="file" multiple accept=".ttf,.otf,.woff,.woff2" className="hidden" aria-label={copy.addFonts} onChange={(event) => { const chosen = Array.from(event.target.files ?? []) as File[]; event.currentTarget.value = ''; void Promise.all(chosen.map((file) => presentPackagedFontFromFile(file, licenseConfirmed))).then((next) => setFonts((current) => [...current, ...next].slice(0, 12))).catch((cause: unknown) => setError(presentExportFailureCopy(locale, cause, 'font'))); }} /></label>
            <label className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[0.625rem] text-amber-100"><input type="checkbox" checked={licenseConfirmed} onChange={(event) => setLicenseConfirmed(event.target.checked)} /><span>{copy.redistribution}</span></label>
          </div>
          {fonts.length > 0 && <div className="flex flex-wrap gap-1">{fonts.map((font) => <span key={font.id} className="rounded-full bg-purple-500/10 px-2 py-1 text-[0.625rem] text-purple-200">{font.name} · {Math.round(font.sizeBytes / 1024)} KiB</span>)}</div>}
          {externalMedia.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[0.625rem] text-amber-200 break-words"><b>{copy.externalMedia(externalMedia.length)}:</b> {copy.externalMediaDetail}</div>}
          <button type="button" disabled={busy !== null} onClick={() => void run('package', () => downloadPresentPortablePackage(document, password, fonts))} className="rounded-lg bg-purple-600 px-4 py-2 font-bold text-white whitespace-normal disabled:opacity-50"><Package className="mr-1 inline h-3.5 w-3.5" />{copy.buildPackage}</button>
        </section>
      </div>
      {error && <div role="alert" className="mx-5 mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-200">{error}</div>}
      {notice && <div role="status" data-present-export-notice="true" className="mx-5 mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">{notice}</div>}
      {busy && <div aria-live="polite" className="mx-5 mb-5 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-blue-200">{copy.busy(busy)}</div>}
      <div className="flex justify-end border-t border-white/10 px-5 py-3"><button type="button" onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 font-semibold text-white"><Check className="mr-1 inline h-3.5 w-3.5" />{copy.done}</button></div>
    </div>
  </div>;
};
