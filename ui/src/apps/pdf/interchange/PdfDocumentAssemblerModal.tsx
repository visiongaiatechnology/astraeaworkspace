// STATUS: DIAMANT VGT SUPREME
// Structured PDF page assembler for extraction, labels, page boxes and persistent page decorations.

import React, { useState } from 'react';
import { Check, Combine, Copy, Crop, FileDigit, FileInput, Files, Layers, Scissors, Stamp, X } from 'lucide-react';
import type { PdfDocumentModel, PdfPageBox, PdfPageModel, WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  applyPdfPageDecorations,
  extractPdfPages,
  mergeStructuredPdfModels,
  replaceStructuredPdfPages,
  transferStructuredPdfPages,
  setPdfPageBoxes,
  setPdfPageLabel,
} from '../pages/pdfPageOps';
import { downloadPdfSplitArtifacts, splitStructuredPdf, type PdfSplitMode, type PdfSplitDeliveryResult } from './split/pdfSplit';
import { PdfForeignPageInsertPanel } from './PdfForeignPageInsertPanel';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';
import { classifyPdfAssemblyFailure } from './assemblyFailureCopy';
import { pdfExportDeliveryText, pdfExportFailureText, pdfExportPartialText } from './pdfExportStatus';

interface PdfDocumentAssemblerModalProps {
  isOpen: boolean;
  pdfData: PdfDocumentModel;
  onClose: () => void;
  onUpdatePdfData: (updated: PdfDocumentModel) => void;
  currentDocumentId: string;
  workspaceDocuments: WorkspaceDocument[];
  onUpdateWorkspaceDocument?: (document: WorkspaceDocument) => void;
}

type Tab = 'decorate' | 'extract' | 'split' | 'combine' | 'insert' | 'labels' | 'boxes';
type MultiDocumentOperation = 'merge' | 'replace' | 'copy' | 'move';
type BoxKind = 'mediaBox' | 'cropBox' | 'trimBox' | 'bleedBox' | 'artBox';

const TAB_COPY_KEYS = {
  decorate: 'assembler.tab.decorate', extract: 'assembler.tab.extract', split: 'assembler.tab.split',
  combine: 'assembler.tab.combine', insert: 'assembler.tab.insert', labels: 'assembler.tab.labels', boxes: 'assembler.tab.boxes',
} as const satisfies Record<Tab, PdfWorkflowCopyKey>;
const OPERATION_COPY_KEYS = {
  copy: 'assembler.operation.copy', move: 'assembler.operation.move', replace: 'assembler.operation.replace', merge: 'assembler.operation.merge',
} as const satisfies Record<MultiDocumentOperation, PdfWorkflowCopyKey>;
const SPLIT_COPY_KEYS = {
  pages: 'assembler.split.pages', bookmarks: 'assembler.split.bookmarks', 'file-size': 'assembler.split.fileSize',
} as const satisfies Record<PdfSplitMode, PdfWorkflowCopyKey>;
const BOX_COPY_KEYS = {
  mediaBox: 'assembler.box.media', cropBox: 'assembler.box.crop', trimBox: 'assembler.box.trim', bleedBox: 'assembler.box.bleed', artBox: 'assembler.box.art',
} as const satisfies Record<BoxKind, PdfWorkflowCopyKey>;

function parsePageSelection(input: string, maxPages: number): number[] {
  const selected = new Set<number>();
  for (const token of input.split(',')) {
    const part = token.trim();
    if (!part) continue;
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid page selector: ${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > maxPages) {
      throw new Error(`Page selector outside 1-${maxPages}: ${part}`);
    }
    for (let page = start; page <= end; page += 1) selected.add(page);
  }
  if (selected.size === 0) throw new Error('Select at least one page.');
  return [...selected].sort((a, b) => a - b);
}

function numberField(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const PdfDocumentAssemblerModal: React.FC<PdfDocumentAssemblerModalProps> = ({
  isOpen,
  pdfData,
  onClose,
  onUpdatePdfData,
  currentDocumentId,
  workspaceDocuments,
  onUpdateWorkspaceDocument,
}) => {
  const { locale } = useWorkspaceLocale();
  const [activeTab, setActiveTab] = useState<Tab>('decorate');
  const [pageRange, setPageRange] = useState(`1-${pdfData.pages.length}`);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [batesPrefix, setBatesPrefix] = useState('ASTRAEA-');
  const [batesStart, setBatesStart] = useState('1');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [labelPrefix, setLabelPrefix] = useState('A-');
  const [labelStart, setLabelStart] = useState('1');
  const [boxKind, setBoxKind] = useState<BoxKind>('cropBox');
  const [boxX, setBoxX] = useState('0');
  const [boxY, setBoxY] = useState('0');
  const [boxWidth, setBoxWidth] = useState('595.28');
  const [boxHeight, setBoxHeight] = useState('841.89');
  const [splitMode, setSplitMode] = useState<PdfSplitMode>('pages');
  const [splitPagesPerPart, setSplitPagesPerPart] = useState('1');
  const [splitTargetMiB, setSplitTargetMiB] = useState('4');
  const [sourceDocumentId, setSourceDocumentId] = useState('');
  const [sourcePageRange, setSourcePageRange] = useState('1');
  const [multiDocumentOperation, setMultiDocumentOperation] = useState<MultiDocumentOperation>('copy');
  const [insertAtPage, setInsertAtPage] = useState(String(pdfData.pages.length + 1));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const selectedPages = () => parsePageSelection(pageRange, pdfData.pages.length);
  const showFailure = (cause: unknown) => {
    const failure = classifyPdfAssemblyFailure(cause);
    setNotice('');
    setError(`${pdfWorkflowText(locale, failure.copyKey)} (${failure.code}: ${failure.detail})`);
  };

  const run = (operation: () => PdfDocumentModel, success: PdfWorkflowCopyKey) => {
    try {
      setError('');
      const updated = operation();
      onUpdatePdfData(updated);
      setNotice(pdfWorkflowText(locale, success));
    } catch (cause) {
      // A refusal is shown with a **named, localized reason** and the domain sentence kept as the secondary
      // line. Showing `cause.message` verbatim was an English technical sentence inside a seven-language
      // application, and it named no next step (AST-0814).
      showFailure(cause);
    }
  };

  const handleDecorate = () => {
    const pages = selectedPages();
    const start = Math.max(0, Math.trunc(numberField(batesStart, 1)));
    let updated = pdfData;
    pages.forEach((page, index) => {
      updated = applyPdfPageDecorations(updated, [page], {
        headerText,
        footerText,
        batesLabel: batesPrefix.trim() ? `${batesPrefix}${String(start + index).padStart(6, '0')}` : undefined,
        watermarkText,
        backgroundColor,
      });
    });
    return updated;
  };

  const handleLabels = () => {
    const pages = selectedPages();
    const start = Math.max(0, Math.trunc(numberField(labelStart, 1)));
    const labels = pages.map((_, index) => `${labelPrefix}${start + index}`);
    return setPdfPageLabel(pdfData, pages, labels);
  };

  const handleBoxes = () => {
    const pages = selectedPages();
    const box: PdfPageBox = {
      x: numberField(boxX, 0),
      y: numberField(boxY, 0),
      width: numberField(boxWidth, 595.28),
      height: numberField(boxHeight, 841.89),
    };
    return setPdfPageBoxes(pdfData, pages, { [boxKind]: box } as Partial<Pick<PdfPageModel, BoxKind>>);
  };

  const structuredSources = workspaceDocuments.filter((candidate) =>
    candidate.id !== currentDocumentId && candidate.kind === 'PdfStudio' && candidate.pdfData?.pages?.length && !candidate.pdfData.rawPdfDataUrl
  );
  const selectedSource = structuredSources.find((candidate) => candidate.id === sourceDocumentId) ?? structuredSources[0];

  const handleSplit = async (): Promise<PdfSplitDeliveryResult> => {
    const documentTitle = workspaceDocuments.find((candidate) => candidate.id === currentDocumentId)?.title || 'Document';
    const artifacts = splitStructuredPdf(pdfData, documentTitle, splitMode === 'pages'
      ? { mode: 'pages', pagesPerPart: Math.trunc(numberField(splitPagesPerPart, 1)) }
      : splitMode === 'file-size'
        ? { mode: 'file-size', maxBytesPerPart: Math.trunc(numberField(splitTargetMiB, 4) * 1024 * 1024) }
        : { mode: 'bookmarks' });
    return downloadPdfSplitArtifacts(artifacts);
  };

  /** Release Beta 0.1: split parts are written natively; an abort stops the remaining dialogs. */
  const handleSplitAction = async () => {
    try {
      setError('');
      setNotice('');
      const result = await handleSplit();
      if (result.cancelled) {
        setNotice(pdfExportPartialText(locale, result.written, result.total));
        return;
      }
      setNotice(`${pdfWorkflowText(locale, 'assembler.success.split', { count: result.total })} ${pdfExportDeliveryText(locale, { fileName: result.fileName ?? '', mode: result.mode })}`);
    } catch (cause) {
      setNotice('');
      setError(pdfExportFailureText(locale, cause));
    }
  };

  const handleMultiDocument = () => {
    if (!selectedSource?.pdfData) throw new Error('Choose another structured PDF Studio document first.');
    const namespace = `workspace-${selectedSource.id}`;
    if (multiDocumentOperation === 'merge') {
      return mergeStructuredPdfModels([pdfData, selectedSource.pdfData], namespace);
    }
    const sourcePages = parsePageSelection(sourcePageRange, selectedSource.pdfData.pages.length);
    if (multiDocumentOperation === 'replace') {
      return replaceStructuredPdfPages(pdfData, selectedPages(), selectedSource.pdfData, sourcePages, namespace);
    }
    const insertAt = Math.max(1, Math.min(pdfData.pages.length + 1, Math.trunc(numberField(insertAtPage, pdfData.pages.length + 1))));
    const transferred = transferStructuredPdfPages(selectedSource.pdfData, pdfData, sourcePages, insertAt, multiDocumentOperation, namespace);
    if (multiDocumentOperation === 'move') {
      if (!onUpdateWorkspaceDocument) throw new Error('Moving pages requires Workspace document mutation support.');
      // Persist the target first. If the source update fails, roll the target back so a failed move cannot silently lose pages.
      onUpdatePdfData(transferred.target);
      try {
        onUpdateWorkspaceDocument({ ...selectedSource, pdfData: transferred.source, modified_at: Date.now(), version: selectedSource.version + 1 });
      } catch (cause) {
        onUpdatePdfData(pdfData);
        throw cause;
      }
      return null;
    }
    return transferred.target;
  };

  const tabs: Array<{ id: Tab; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'decorate', icon: Stamp },
    { id: 'extract', icon: Scissors },
    { id: 'split', icon: Files },
    { id: 'combine', icon: Combine },
    { id: 'insert', icon: FileInput },
    { id: 'labels', icon: FileDigit },
    { id: 'boxes', icon: Crop },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none" role="dialog" aria-modal="true" aria-labelledby="pdf-page-assembler-title">
      <div className="vgt-dialog-scroll-surface max-h-[92vh] bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col text-xs">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2"><Layers className="w-4 h-4 text-purple-400" /><span id="pdf-page-assembler-title" className="font-bold text-slate-100 text-sm">{pdfWorkflowText(locale, 'assembler.title')}</span></div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white" aria-label={pdfWorkflowText(locale, 'assembler.close')}><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1 border-b border-white/10 bg-slate-950/50 p-1">
          {tabs.map(({ id, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={activeTab === id} onClick={() => { setActiveTab(id); setError(''); setNotice(''); }} className={`py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors ${activeTab === id ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}><Icon className="w-3.5 h-3.5" /><span>{pdfWorkflowText(locale, TAB_COPY_KEYS[id])}</span></button>
          ))}
        </div>

        <div className="min-h-0 overflow-y-auto p-4 space-y-4">
          {activeTab !== 'split' && activeTab !== 'insert' && <label className="block text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.pageRange')}<input aria-label={pdfWorkflowText(locale, 'assembler.pageRange')} value={pageRange} onChange={(event) => setPageRange(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 font-mono" /></label>}

          {notice && <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2"><Check className="w-4 h-4" />{notice}</div>}
          {error && <div role="alert" data-pdf-assembler-error="true" className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200">{error}</div>}

          {activeTab === 'decorate' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.header')}<input aria-label={pdfWorkflowText(locale, 'assembler.header')} value={headerText} onChange={(event) => setHeaderText(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20" /></label>
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.footer')}<input aria-label={pdfWorkflowText(locale, 'assembler.footer')} value={footerText} onChange={(event) => setFooterText(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20" /></label>
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.batesPrefix')}<input aria-label={pdfWorkflowText(locale, 'assembler.batesPrefix')} value={batesPrefix} onChange={(event) => setBatesPrefix(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 font-mono" /></label>
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.batesStart')}<input aria-label={pdfWorkflowText(locale, 'assembler.batesStart')} type="number" min="0" value={batesStart} onChange={(event) => setBatesStart(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 font-mono" /></label>
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.watermark')}<input aria-label={pdfWorkflowText(locale, 'assembler.watermark')} value={watermarkText} onChange={(event) => setWatermarkText(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20" /></label>
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.background')}<input aria-label={pdfWorkflowText(locale, 'assembler.background')} type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="mt-1 w-full h-8 bg-slate-950 border border-white/10 rounded" /></label>
            </div>
          )}

          {activeTab === 'extract' && <p className="text-slate-400 text-[0.6875rem]">{pdfWorkflowText(locale, 'assembler.extractNote')}</p>}

          {activeTab === 'split' && (
            <div className="space-y-3">
              <label className="block text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.splitMode')}<select aria-label={pdfWorkflowText(locale, 'assembler.splitMode')} value={splitMode} onChange={(event) => setSplitMode(event.target.value as PdfSplitMode)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200">{(['pages','bookmarks','file-size'] as const).map((mode) => <option key={mode} value={mode}>{pdfWorkflowText(locale, SPLIT_COPY_KEYS[mode])}</option>)}</select></label>
              {splitMode === 'pages' && <label className="block text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.pagesPerPart')}<input aria-label={pdfWorkflowText(locale, 'assembler.pagesPerPart')} type="number" min="1" max="1000" value={splitPagesPerPart} onChange={(event) => setSplitPagesPerPart(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded px-2.5 py-1.5 text-slate-200 font-mono" /></label>}
              {splitMode === 'file-size' && <label className="block text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.maxMib')}<input aria-label={pdfWorkflowText(locale, 'assembler.maxMib')} type="number" min="0.016" max="256" step="0.25" value={splitTargetMiB} onChange={(event) => setSplitTargetMiB(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded px-2.5 py-1.5 text-slate-200 font-mono" /></label>}
              <p className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'assembler.splitNote')}</p>
            </div>
          )}

          {activeTab === 'combine' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.operation')}<select aria-label={pdfWorkflowText(locale, 'assembler.operation')} value={multiDocumentOperation} onChange={(event) => setMultiDocumentOperation(event.target.value as MultiDocumentOperation)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200">{(['copy','move','replace','merge'] as const).map((operation) => <option key={operation} value={operation}>{pdfWorkflowText(locale, OPERATION_COPY_KEYS[operation])}</option>)}</select></label>
                <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.sourceDocument')}<select aria-label={pdfWorkflowText(locale, 'assembler.sourceDocument')} value={selectedSource?.id ?? ''} onChange={(event) => { setSourceDocumentId(event.target.value); setSourcePageRange('1'); }} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200">{structuredSources.length === 0 && <option value="">{pdfWorkflowText(locale, 'assembler.noSource')}</option>}{structuredSources.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>
              </div>
              {multiDocumentOperation !== 'merge' && <label className="block text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.sourcePages')}<input aria-label={pdfWorkflowText(locale, 'assembler.sourcePages')} value={sourcePageRange} onChange={(event) => setSourcePageRange(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded px-2.5 py-1.5 text-slate-200 font-mono" /></label>}
              {(multiDocumentOperation === 'copy' || multiDocumentOperation === 'move') && <label className="block text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.insertBefore', { page: pdfData.pages.length + 1 })}<input aria-label={pdfWorkflowText(locale, 'assembler.insertBefore', { page: pdfData.pages.length + 1 })} type="number" min="1" max={pdfData.pages.length + 1} value={insertAtPage} onChange={(event) => setInsertAtPage(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded px-2.5 py-1.5 text-slate-200 font-mono" /></label>}
              {multiDocumentOperation === 'replace' && <p className="text-[0.625rem] text-amber-200">{pdfWorkflowText(locale, 'assembler.replaceNote')}</p>}
              <p className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'assembler.combineNote')}</p>
            </div>
          )}

          {activeTab === 'insert' && (
            <PdfForeignPageInsertPanel pdfData={pdfData} onUpdatePdfData={onUpdatePdfData} />
          )}

          {activeTab === 'labels' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.labelPrefix')}<input aria-label={pdfWorkflowText(locale, 'assembler.labelPrefix')} value={labelPrefix} onChange={(event) => setLabelPrefix(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 font-mono" /></label>
              <label className="text-[0.6875rem] text-slate-400">{pdfWorkflowText(locale, 'assembler.startNumber')}<input aria-label={pdfWorkflowText(locale, 'assembler.startNumber')} type="number" min="0" value={labelStart} onChange={(event) => setLabelStart(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 font-mono" /></label>
            </div>
          )}

          {activeTab === 'boxes' && (
            <div className="space-y-3">
              <label className="text-[0.6875rem] text-slate-400 block">{pdfWorkflowText(locale, 'assembler.boxKind')}<select aria-label={pdfWorkflowText(locale, 'assembler.boxKind')} value={boxKind} onChange={(event) => setBoxKind(event.target.value as BoxKind)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20">{(['mediaBox','cropBox','trimBox','bleedBox','artBox'] as const).map((box) => <option key={box} value={box}>{pdfWorkflowText(locale, BOX_COPY_KEYS[box])}</option>)}</select></label>
              <div className="grid grid-cols-4 gap-2">
                {[['X', 'editor.coordinateX', boxX, setBoxX], ['Y', 'editor.coordinateY', boxY, setBoxY], ['Width', 'editor.width', boxWidth, setBoxWidth], ['Height', 'editor.height', boxHeight, setBoxHeight]].map(([label, copyKey, value, setter]) => (
                  <label key={label as string} className="text-[0.625rem] text-slate-400">{pdfWorkflowText(locale, copyKey as PdfWorkflowCopyKey)}<input aria-label={pdfWorkflowText(locale, copyKey as PdfWorkflowCopyKey)} type="number" step="0.01" value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 font-mono" /></label>
                ))}
              </div>
              <p className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'assembler.pdfPoints')}</p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-950 border-t border-white/10 flex items-center justify-between">
          <span className="text-[0.625rem] text-slate-500">{pdfWorkflowText(locale, 'assembler.pageCount', { count: pdfData.pages.length })}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5">{pdfWorkflowText(locale, 'common.close')}</button>
            {activeTab === 'decorate' && <button type="button" onClick={() => run(handleDecorate, 'assembler.success.decorate')} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/40">{pdfWorkflowText(locale, 'assembler.applyDecorations')}</button>}
            {activeTab === 'extract' && <button type="button" onClick={() => run(() => extractPdfPages(pdfData, selectedPages()), 'assembler.success.extract')} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/40">{pdfWorkflowText(locale, 'assembler.extractPages')}</button>}
            {activeTab === 'split' && <button type="button" onClick={() => { void handleSplitAction(); }} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/40">{pdfWorkflowText(locale, 'assembler.splitAndDownload')}</button>}
            {activeTab === 'combine' && <button type="button" onClick={() => { try { setError(''); const updated = handleMultiDocument(); if (updated) onUpdatePdfData(updated); setNotice(pdfWorkflowText(locale, 'assembler.success.combine', { operation: pdfWorkflowText(locale, OPERATION_COPY_KEYS[multiDocumentOperation]) })); } catch (cause) { showFailure(cause); } }} disabled={!selectedSource} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold transition-colors"><Copy className="w-3.5 h-3.5" />{pdfWorkflowText(locale, 'assembler.applyOperation', { operation: pdfWorkflowText(locale, OPERATION_COPY_KEYS[multiDocumentOperation]) })}</button>}
            {activeTab === 'labels' && <button type="button" onClick={() => run(handleLabels, 'assembler.success.labels')} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/40">{pdfWorkflowText(locale, 'assembler.applyLabels')}</button>}
            {activeTab === 'boxes' && <button type="button" onClick={() => run(handleBoxes, 'assembler.success.boxes')} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/40">{pdfWorkflowText(locale, 'assembler.applyBox')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
};
