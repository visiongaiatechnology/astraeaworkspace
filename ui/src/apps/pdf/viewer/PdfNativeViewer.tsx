// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — hardened native-byte viewer shell for arbitrary foreign PDFs.

import React, { useEffect, useRef, useState } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import {
  BadgeCheck,
  BadgeX,
  Clock3,
  Columns2,
  Contrast,
  Download,
  FileSearch,
  Fullscreen,
  KeyRound,
  LoaderCircle,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PdfNativeInspectionSnapshot } from '../../../shared/contracts/workspace';
import { decodePdfDataUrl } from '../security/pdfNativeDataUrl';
import { validatePdfSignatures, type PdfSignatureValidationResult } from '../signatures/validation/pdfSignatureValidation';
import { PdfSecurityInspector } from '../security/inspection/PdfSecurityInspector';
import { deliverExportDataUrl } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';
import { pdfExportDeliveryText, pdfExportFailureText } from '../interchange/pdfExportStatus';
import { AnimatedAccordion } from '../../../design-system/components/AnimatedAccordion';
import { inspectNativePdfAcroFormFields, type PdfNativeAcroFormInspection } from '../forms/nativeAcroFormInspection';
import { openPdfJsWorkerDocument, type PdfJsDocumentSnapshot, type PdfJsWorkerDocument } from '../../../platform/documents/pdfjs/pdfJsWorkerClient';
import { PdfJsDocumentNavigator } from './navigation/PdfJsDocumentNavigator';
import { PdfJsDisplayViewer } from './display/PdfJsDisplayViewer';
import {
  clampNativePdfZoom,
  nextNativePdfRotation,
  type NativeContrastMode,
  type NativeFitMode,
  type NativeRotation,
} from './contracts/pdfNativeViewerState';
import { PDF_VIEWER_COPY, pdfViewerFailureCopy } from './pdfViewerLocale';
import { resolvePdfStudioShortcut } from '../studio/interactions/pdfStudioKeyboard';

type NativeViewMode = 'continuous' | 'page' | 'two-page';

interface PdfNativeViewerProps {
  title: string;
  dataUrl: string;
  fileName: string;
  byteLength: number;
  inspection?: PdfNativeInspectionSnapshot;
  onOpenWorkspaceIntegration?: () => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
}

const Capability: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <div className={`rounded-lg border px-2 py-1.5 text-[0.625rem] ${ok ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-200' : 'border-white/10 bg-white/[0.025] text-slate-500'}`}>
    {children}
  </div>
);

export const PdfNativeViewer: React.FC<PdfNativeViewerProps> = ({
  title,
  dataUrl,
  fileName,
  byteLength,
  inspection,
  onOpenWorkspaceIntegration,
  onOpenExternalUrl,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PDF_VIEWER_COPY[locale].native;
  const rootRef = useRef<HTMLDivElement>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState<NativeFitMode>('width');
  const [mode, setMode] = useState<NativeViewMode>('continuous');
  const [contrast, setContrast] = useState<NativeContrastMode>('normal');
  const [rotation, setRotation] = useState<NativeRotation>(0);
  const [showInspection, setShowInspection] = useState(false);
  const [signatureResults, setSignatureResults] = useState<PdfSignatureValidationResult[] | null>(null);
  const [signatureValidationError, setSignatureValidationError] = useState<string | null>(null);
  const [isValidatingSignatures, setIsValidatingSignatures] = useState(false);
  const [formInspection, setFormInspection] = useState<PdfNativeAcroFormInspection | null>(null);
  const [formInspectionError, setFormInspectionError] = useState<string | null>(null);
  const [pdfJsSnapshot, setPdfJsSnapshot] = useState<PdfJsDocumentSnapshot | null>(null);
  const [pdfJsError, setPdfJsError] = useState<string | null>(null);
  const [isPdfJsLoading, setIsPdfJsLoading] = useState(true);
  const [pdfPassword, setPdfPassword] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  /** Release Beta 0.1: the original-byte export states saved/download/failure instead of a silent anchor. */
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const pdfJsDocumentRef = useRef<PdfJsWorkerDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    let openedDocument: PdfJsWorkerDocument | null = null;
    setPdfJsSnapshot(null);
    setPdfJsError(null);
    setIsPdfJsLoading(true);
    try {
      const bytes = decodePdfDataUrl(dataUrl, byteLength);
      void openPdfJsWorkerDocument(bytes, pdfPassword || undefined).then((document) => {
        openedDocument = document;
        if (cancelled) {
          void document.destroy();
          return;
        }
        pdfJsDocumentRef.current = document;
        setPdfJsSnapshot(document.snapshot);
        setPage((current) => Math.min(Math.max(1, current), document.snapshot.pageCount));
      }).catch((error) => {
        if (!cancelled) setPdfJsError(pdfViewerFailureCopy(localeRef.current, 'parse', error));
      }).finally(() => {
        if (!cancelled) setIsPdfJsLoading(false);
      });
    } catch (error) {
      setPdfJsError(pdfViewerFailureCopy(localeRef.current, 'parse', error));
      setIsPdfJsLoading(false);
    }
    return () => {
      cancelled = true;
      pdfJsDocumentRef.current = null;
      if (openedDocument) void openedDocument.destroy();
    };
  }, [dataUrl, byteLength, pdfPassword]);

  const pageLimit = Math.max(1, pdfJsSnapshot?.pageCount || inspection?.estimatedPageObjects || 1);

  const changeZoom = (delta: number) => {
    setFit('custom');
    setZoom((current) => clampNativePdfZoom(current + delta));
  };

  // Keyboard parity for the byte-viewer shell (AST-0761/0766/0771/0781/0786/…): the same pure resolver the
  // structured studio uses, so both PDF surfaces answer the same keys with the same semantics.
  const keyboardStateRef = useRef({ page, pageLimit, zoom });
  keyboardStateRef.current = { page, pageLimit, zoom };
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const command = resolvePdfStudioShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editableTarget: Boolean(target?.closest('input, textarea, select, [contenteditable="true"]')),
      });
      if (command.kind === 'none') return;
      const state = keyboardStateRef.current;
      switch (command.kind) {
        case 'page-next':
          event.preventDefault();
          setPage(Math.min(state.pageLimit, state.page + 1));
          return;
        case 'page-previous':
          event.preventDefault();
          setPage(Math.max(1, state.page - 1));
          return;
        case 'page-first':
          event.preventDefault();
          setPage(1);
          return;
        case 'page-last':
          event.preventDefault();
          setPage(state.pageLimit);
          return;
        case 'zoom-in':
          event.preventDefault();
          setFit('custom');
          setZoom(clampNativePdfZoom(state.zoom + 25));
          return;
        case 'zoom-out':
          event.preventDefault();
          setFit('custom');
          setZoom(clampNativePdfZoom(state.zoom - 25));
          return;
        case 'zoom-reset':
          event.preventDefault();
          setFit('custom');
          setZoom(100);
          return;
        case 'focus-search': {
          const input = rootRef.current?.querySelector<HTMLInputElement>('[data-pdf-search-input]');
          if (input) {
            event.preventDefault();
            input.focus();
            input.select();
          }
          return;
        }
        default:
          return;
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  /** Release Beta 0.1: the original bytes are written through the native save dialog on the desktop. */
  const exportOriginal = async () => {
    const rawName = fileName || title || 'document.pdf';
    const suggestedName = /\.[A-Za-z0-9]{1,12}$/u.test(rawName) ? rawName : `${rawName}.pdf`;
    try {
      const delivery = await deliverExportDataUrl(dataUrl, {
        suggestedName,
        extensions: ['pdf'],
        mimeType: 'application/pdf',
        assertArtifact: assertPdfExportArtifact,
      });
      setExportNotice(pdfExportDeliveryText(locale, delivery));
    } catch (error) {
      setExportNotice(pdfExportFailureText(locale, error));
    }
  };

  const requestFullscreen = async () => {
    const root = rootRef.current;
    if (!root) return;
    if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
    else await root.requestFullscreen();
  };

  const handleValidateSignatures = async () => {
    setSignatureValidationError(null);
    setSignatureResults(null);
    setIsValidatingSignatures(true);
    try {
      const bytes = decodePdfDataUrl(dataUrl, byteLength);
      const results = await validatePdfSignatures(bytes);
      setSignatureResults(results);
      if (results.length === 0) setSignatureValidationError(copy.noSignatures);
    } catch (error) {
      setSignatureValidationError(pdfViewerFailureCopy(locale, 'signature', error));
    } finally {
      setIsValidatingSignatures(false);
    }
  };

  const handleInspectFormFields = () => {
    setFormInspectionError(null);
    try {
      const bytes = decodePdfDataUrl(dataUrl, byteLength);
      setFormInspection(inspectNativePdfAcroFormFields(bytes));
    } catch (error) {
      setFormInspection(null);
      setFormInspectionError(pdfViewerFailureCopy(locale, 'form', error));
    }
  };

  return (
    <div ref={rootRef} className="flex-1 flex flex-col min-h-0 bg-[#080b11] text-slate-100" data-pdf-native-viewer="true" data-vgt-pdf-root="true">
      <header className="shrink-0 border-b border-white/[0.08] bg-slate-950/95 px-3 py-2 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{fileName || title}</div>
              <div className="text-[0.5625rem] font-mono text-slate-500">
                {copy.nativeByteMode} · {byteLength.toLocaleString()} {copy.bytes}{inspection ? ` · PDF ${inspection.version} · SHA-256 ${inspection.sha256.slice(0, 12)}…` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button aria-label={copy.inspectToggle} type="button" onClick={() => setShowInspection((open) => !open)} className="native-control p-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]" title={copy.inspectTitle}>
              {showInspection ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => { void exportOriginal(); }} className="native-control flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-200 text-[0.625rem] hover:bg-blue-500/20">
              <Download className="w-3.5 h-3.5" /> {copy.original}
            </button>
            {onOpenWorkspaceIntegration && (
              <button type="button" onClick={onOpenWorkspaceIntegration} className="native-control flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-200 text-[0.625rem] hover:bg-cyan-500/20">
                <Network className="w-3.5 h-3.5" /> {copy.workspace}
              </button>
            )}
          </div>
        </div>
        {exportNotice && <div role="status" data-pdf-native-export="true" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[0.625rem] text-emerald-200 break-words">{exportNotice}</div>}

        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={copy.controls}>
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.025] p-0.5">
            {(['continuous', 'page', 'two-page'] as NativeViewMode[]).map((value) => (
              <button key={value} type="button" onClick={() => setMode(value)} className={`native-control px-2 py-1 rounded-md text-[0.625rem] ${mode === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {value === 'continuous' ? copy.modeContinuous : value === 'page' ? copy.modePage : <span className="flex items-center gap-1"><Columns2 className="w-3 h-3" />{copy.modeTwoPage}</span>}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.025] p-0.5">
            <button type="button" onClick={() => changeZoom(-25)} className="native-control p-1 text-slate-400 hover:text-white" aria-label={copy.zoomOut} title={copy.zoomOut}><ZoomOut className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => { setFit('custom'); setZoom(100); }} className="native-control px-1.5 text-[0.625rem] font-mono text-slate-300" aria-label={fit === 'page' ? copy.fitPage : copy.fitWidth}>{fit === 'custom' ? `${zoom}%` : fit === 'page' ? copy.fit : copy.width}</button>
            <button type="button" onClick={() => changeZoom(25)} className="native-control p-1 text-slate-400 hover:text-white" aria-label={copy.zoomIn} title={copy.zoomIn}><ZoomIn className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setFit('page')} className={`native-control px-1.5 py-1 rounded text-[0.625rem] ${fit === 'page' ? 'text-blue-200 bg-blue-500/15' : 'text-slate-400'}`}>{copy.fitPage}</button>
            <button type="button" onClick={() => setFit('width')} className={`native-control px-1.5 py-1 rounded text-[0.625rem] ${fit === 'width' ? 'text-blue-200 bg-blue-500/15' : 'text-slate-400'}`}>{copy.fitWidth}</button>
            <button type="button" onClick={() => setRotation((current) => nextNativePdfRotation(current))} className="native-control flex items-center gap-1 px-1.5 py-1 rounded text-[0.625rem] text-slate-400 hover:text-white" title={copy.rotate} aria-label={copy.rotateAria(rotation)}>
              <RotateCw className="w-3 h-3" /> {rotation}°
            </button>
          </div>

          {(pdfJsSnapshot?.pageCount || inspection?.estimatedPageObjects) ? (
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.025] px-1.5 py-1 text-[0.625rem]">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="native-control px-1 disabled:opacity-30" aria-label={copy.previous}>‹</button>
              <input aria-label={copy.page} value={page} min={1} max={pageLimit} type="number" onChange={(event) => setPage(Math.max(1, Math.min(pageLimit, Number(event.target.value) || 1)))} className="w-10 bg-transparent text-center outline-none font-mono" />
              <span className="text-slate-600">/ {pdfJsSnapshot ? pageLimit : `~${pageLimit}`}</span>
              {pdfJsSnapshot?.pages[page - 1]?.label ? <span className="max-w-24 truncate border-l border-white/10 pl-1.5 text-[0.5625rem] text-cyan-300" title={pdfJsSnapshot.pages[page - 1].label}>{pdfJsSnapshot.pages[page - 1].label}</span> : null}
              <button type="button" onClick={() => setPage((current) => Math.min(pageLimit, current + 1))} disabled={page >= pageLimit} className="native-control px-1 disabled:opacity-30" aria-label={copy.next}>›</button>
            </div>
          ) : null}

          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.025] p-0.5">
            <Contrast className="w-3.5 h-3.5 mx-1 text-slate-500" />
            {(['normal', 'high-contrast', 'grayscale', 'invert'] as NativeContrastMode[]).map((value) => (
              <button key={value} type="button" onClick={() => setContrast(value)} aria-pressed={contrast === value} className={`native-control px-1.5 py-1 rounded text-[0.5625rem] ${contrast === value ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-300'}`}>{value === 'normal' ? copy.contrastNormal : value === 'high-contrast' ? copy.contrastHigh : value === 'grayscale' ? copy.contrastGray : copy.contrastInvert}</button>
            ))}
          </div>

          <button type="button" onClick={requestFullscreen} className="native-control flex items-center gap-1 px-2 py-1.5 rounded-lg border border-white/10 text-[0.625rem] text-slate-300 hover:text-white hover:bg-white/[0.05]" title="Fullscreen / presentation mode">
            <Presentation className="w-3.5 h-3.5" /> {copy.present}
          </button>
          <button type="button" onClick={requestFullscreen} className="native-control p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white" aria-label={copy.fullscreen} title={copy.fullscreen}><Fullscreen className="w-3.5 h-3.5" /></button>
        </div>

        {pdfJsError && /password|encrypted/iu.test(pdfJsError) ? (
          <form onSubmit={(event) => { event.preventDefault(); setPdfPassword(passwordDraft); }} className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2 py-1.5" aria-label={copy.unlockForm}>
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <input type="password" autoComplete="off" value={passwordDraft} onChange={(event) => setPasswordDraft(event.target.value.slice(0, 127))} placeholder={copy.passwordPlaceholder} aria-label={copy.passwordPlaceholder} className="min-w-0 flex-1 bg-transparent text-[0.625rem] text-slate-200 outline-none placeholder:text-slate-600" />
            <button type="submit" disabled={!passwordDraft} className="native-control rounded border border-amber-400/20 px-2 py-1 text-[0.5625rem] text-amber-200 disabled:opacity-30">{copy.unlock}</button>
          </form>
        ) : null}

        {inspection?.warnings.map((warning) => (
          <div key={warning} className="flex items-start gap-1.5 text-[0.5625rem] text-amber-200 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg px-2 py-1.5">
            <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" /> {warning}
          </div>
        ))}
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 bg-[#11151d] overflow-hidden" aria-label={copy.documentViewport}>
          <PdfJsDisplayViewer
            dataUrl={dataUrl}
            byteLength={byteLength}
            page={page}
            pageLabels={pdfJsSnapshot?.pageLabels}
            mode={mode}
            fit={fit}
            zoom={zoom}
            rotation={rotation}
            contrast={contrast}
            onPageChange={setPage}
            onOpenExternalUrl={onOpenExternalUrl}
            password={pdfPassword || undefined}
          />
        </main>

        {showInspection && inspection ? (
          <aside className="w-72 shrink-0 border-l border-white/[0.08] bg-slate-950 p-3 overflow-y-auto" aria-label={copy.inspectTitle}>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-2"><FileSearch className="w-3.5 h-3.5 text-cyan-400" />{copy.inspectTitle}</div>
            <section className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-2" aria-label="Local PDF.js parser status">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[0.625rem] font-semibold text-cyan-200">Local PDF.js parser</div>
                <div className="font-mono text-[0.5625rem] text-cyan-300">6.3.289</div>
              </div>
              {isPdfJsLoading ? (
                <div className="mt-1.5 flex items-center gap-1.5 text-[0.5625rem] text-slate-400"><LoaderCircle className="h-3 w-3 animate-spin" />Parsing isolated bytes…</div>
              ) : pdfJsError ? (
                <div className="mt-1.5 rounded border border-amber-500/20 bg-amber-500/[0.05] p-1.5 text-[0.5625rem] text-amber-200">{pdfJsError}</div>
              ) : pdfJsSnapshot ? (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[0.5625rem]">
                  <div className="contents"><dt className="text-slate-500">Pages</dt><dd className="text-right font-mono text-slate-300">{pdfJsSnapshot.pageCount}</dd></div>
                  <div className="contents"><dt className="text-slate-500">Page labels</dt><dd className="text-right font-mono text-slate-300">{pdfJsSnapshot.pageLabels?.length ?? 0}</dd></div>
                  <div className="contents"><dt className="text-slate-500">Outline roots</dt><dd className="text-right font-mono text-slate-300">{pdfJsSnapshot.outline?.length ?? 0}</dd></div>
                  <div className="contents"><dt className="text-slate-500">Attachments</dt><dd className="text-right font-mono text-slate-300">{pdfJsSnapshot.attachments ? Object.keys(pdfJsSnapshot.attachments).length : 0}</dd></div>
                  <div className="contents"><dt className="text-slate-500">Form fields</dt><dd className="text-right font-mono text-slate-300">{pdfJsSnapshot.fieldObjects ? Object.keys(pdfJsSnapshot.fieldObjects).length : 0}</dd></div>
                  <div className="contents"><dt className="text-slate-500">JS actions</dt><dd className={`text-right font-mono ${pdfJsSnapshot.hasJavaScriptActions ? 'text-amber-300' : 'text-emerald-300'}`}>{pdfJsSnapshot.hasJavaScriptActions ? 'detected' : 'none'}</dd></div>
                </dl>
              ) : null}
              <div className="mt-1.5 text-[0.5rem] leading-relaxed text-slate-600">The vendored worker receives only the already-bounded local byte array. Worker-side network/resource fetch callbacks are denied.</div>
            </section>
            {pdfJsSnapshot ? (
              <PdfJsDocumentNavigator
                document={pdfJsDocumentRef.current}
                snapshot={pdfJsSnapshot}
                currentPage={page}
                onNavigatePage={(targetPage) => setPage(Math.max(1, Math.min(pageLimit, targetPage)))}
                onOpenExternalUrl={onOpenExternalUrl}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-1.5">
              <Capability ok={inspection.hasOutlines}>Outlines</Capability>
              <Capability ok={inspection.hasPageLabels}>Page labels</Capability>
              <Capability ok={inspection.hasLinksOrDestinations}>Links / destinations</Capability>
              <Capability ok={inspection.hasEmbeddedFiles}>Embedded files</Capability>
              <Capability ok={inspection.hasOptionalContentGroups}>Layers / OCG</Capability>
              <Capability ok={inspection.hasAcroForm}>AcroForm</Capability>
              <Capability ok={inspection.hasAnnotations}>Annotations</Capability>
              <Capability ok={inspection.tagged}>Tagged structure</Capability>
              <Capability ok={inspection.hasSignatures}>Signatures</Capability>
              <Capability ok={inspection.encrypted}>Encrypted</Capability>
            </div>
            <dl className="mt-3 space-y-1.5 text-[0.625rem]">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Object headers</dt><dd className="font-mono text-slate-300">{inspection.objectHeaders.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Stream markers</dt><dd className="font-mono text-slate-300">{inspection.streamMarkers.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">XRef markers</dt><dd className="font-mono text-slate-300">{inspection.xrefMarkers.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Largest declared stream</dt><dd className="font-mono text-slate-300">{inspection.maxDeclaredStreamLength.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">External references</dt><dd className="font-mono text-slate-300">{inspection.externalUrlCount.toLocaleString()}</dd></div>
            </dl>
            <PdfSecurityInspector dataUrl={dataUrl} byteLength={byteLength} />

            {inspection.hasAcroForm ? (
              <section className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-2" aria-label="AcroForm field inventory">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[0.625rem] font-semibold text-blue-200">AcroForm fields</div>
                  <button type="button" onClick={handleInspectFormFields} className="native-control rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[0.5625rem] text-blue-100 hover:bg-blue-500/20">Inspect fields</button>
                </div>
                {formInspectionError ? <div className="mt-2 text-[0.5625rem] text-amber-200">{formInspectionError}</div> : null}
                {formInspection ? (
                  <div className="mt-2 space-y-1 text-[0.5625rem]">
                    <div className="text-slate-400">Status: <span className="font-mono text-slate-300">{formInspection.status}</span> · {formInspection.fieldCount} field(s)</div>
                    {formInspection.warnings.map((warning) => <div key={warning} className="text-amber-200/80">{warning}</div>)}
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {formInspection.fields.map((field) => (
                        <div key={field.objectId} className="rounded border border-white/[0.06] bg-black/10 p-1.5">
                          <div className="font-semibold text-slate-300">{field.name}</div>
                          <div className="text-slate-500">{field.kind} · object {field.objectId}{field.required ? ' · required' : ''}{field.readOnly ? ' · read-only' : ''}{field.hasValue ? ' · value present' : ''}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[0.5rem] leading-relaxed text-slate-600">Field values are never emitted into the inspection log. Encrypted or compressed-object cases remain fail-closed/partial rather than guessed.</div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {(inspection.externalUrlHosts.length > 0 || inspection.actionTypes.length > 0) ? (
              <section className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-2 text-[0.5625rem]">
                <div className="font-semibold text-amber-200">External URLs / actions report</div>
                {inspection.actionTypes.length > 0 ? <div className="mt-1 text-slate-400">Actions: {inspection.actionTypes.join(', ')}</div> : <div className="mt-1 text-slate-500">No action dictionaries detected by the bounded inspector.</div>}
                {inspection.externalUrlHosts.length > 0 ? (
                  <div className="mt-1">
                    <div className="text-slate-400">Hosts ({inspection.externalUrlHosts.length} shown):</div>
                    <div className="mt-0.5 break-words font-mono text-slate-500">{inspection.externalUrlHosts.join(' · ')}</div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {inspection.hasSignatures ? (
              <section className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-2" aria-label="PDF signature validation">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold text-emerald-200"><KeyRound className="w-3.5 h-3.5" />Digital signatures</div>
                  <button type="button" onClick={handleValidateSignatures} disabled={isValidatingSignatures} className="native-control rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[0.5625rem] text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50">
                    {isValidatingSignatures ? <span className="flex items-center gap-1"><LoaderCircle className="w-3 h-3 animate-spin" />Validating</span> : 'Validate bytes'}
                  </button>
                </div>
                {signatureValidationError ? <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-1.5 text-[0.5625rem] text-amber-200">{signatureValidationError}</div> : null}
                {signatureResults?.map((result) => (
                  <div key={`${result.objectId}-${result.index}`} className={`mt-2 rounded-lg border p-2 text-[0.5625rem] ${result.valid ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-red-500/20 bg-red-500/[0.05]'}`}>
                    <div className="flex items-start gap-1.5">
                      {result.valid ? <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <BadgeX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-200">{result.fieldName}</div>
                        <div className="truncate text-slate-400">{result.signer.subject}</div>
                        <div className="mt-1 font-mono text-slate-500">{result.signatureAlgorithm} · {result.status}</div>
                        <div className="mt-1 flex items-center gap-1 text-slate-500"><Clock3 className="h-3 w-3" />{result.signingTime ? new Date(result.signingTime).toLocaleString() : 'Signing time unavailable'}</div>
                        <div className="mt-1 break-all font-mono text-[0.5rem] text-slate-600">SHA-256 {result.signer.fingerprintSha256}</div>
                        {result.certificateChain.length > 0 ? (
                          <AnimatedAccordion className="mt-1 rounded border border-white/[0.06] bg-black/10 p-1.5" title={`Embedded certificate chain · ${result.certificateChain.length}`} headingLevel={6} triggerClassName="cursor-pointer text-slate-400" contentClassName="mt-1 space-y-1">
                            <ol className="mt-1 space-y-1">
                              {result.certificateChain.map((certificate, certificateIndex) => (
                                <li key={certificate.fingerprintSha256 || `${certificate.subject}-${certificateIndex}`} className="rounded border border-white/[0.05] bg-white/[0.02] p-1">
                                  <div className="font-semibold text-slate-300">{certificateIndex + 1}. {certificate.subject}{certificate.isSigner ? ' · signer' : ''}</div>
                                  <div className="text-slate-500">Issuer: {certificate.issuer}</div>
                                  <div className="break-all font-mono text-[0.5rem] text-slate-600">SHA-256 {certificate.fingerprintSha256}</div>
                                </li>
                              ))}
                            </ol>
                            <div className="mt-1 text-[0.5rem] text-amber-200/70">Embedded chain is displayed for inspection; OS/enterprise trust and revocation are not inferred here.</div>
                          </AnimatedAccordion>
                        ) : null}
                        {result.modifiedAfterSigning ? <div className="mt-1 text-amber-300">Later incremental revision(s) exist after this valid signed revision.</div> : null}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-2 text-[0.5rem] leading-relaxed text-slate-500">A valid CMS/ByteRange proves cryptographic integrity for the signed revision. Certificate trust and revocation remain separate trust-store decisions.</div>
              </section>
            ) : null}

            <div className="mt-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.05] p-2 text-[0.5625rem] leading-relaxed text-cyan-100/80">
              The local PDF.js worker now performs standards-aware foreign-PDF parsing for page geometry, labels, outlines, attachments, OCG inventory, forms, annotations, text and tagged structure. Pixel rendering and DOM text-layer rendering are still delegated to the isolated host renderer until the matching PDF.js display module is vendored; Astraea does not claim those remaining renderer-dependent gates yet.
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};
