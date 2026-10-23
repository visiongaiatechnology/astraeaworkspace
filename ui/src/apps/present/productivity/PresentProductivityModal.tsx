// STATUS: DIAMANT VGT SUPREME — Present search/reuse/duplicate/master productivity UI
import React, { useMemo, useState } from 'react';
import type { PresentDocumentModel } from '../../../shared/contracts/workspace';
import { Search, Replace, CopyPlus, Sparkles, Trash2, X, Accessibility } from 'lucide-react';
import { cleanupUnusedPresentMasters, findDuplicatePresentSlides, replacePresentDeckText, reusePresentSlides, searchPresentDeck } from './presentProductivity';
import { inspectForeignFile } from '../../../platform/import-sandbox/importExportSandbox';
import {
  PRESENT_OFFICE_FIDELITY_LIMITS,
  PRESENT_OFFICE_IMPORT_MAX_BYTES,
  assertPresentOfficeImportBounds,
  importPresentDeckBytes,
  presentOfficeFormatFromFileName,
  type PresentOfficeFormat,
} from '../interchange/office/presentOfficeRoundTrip';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { resolvePresentSlideDesign } from '../design/presentDesign';
import { auditPresentAltText, auditPresentContrast, buildPresentReadingOrder } from '../canvas/model/presentAccessibility';
import { isPlainPresentRecord } from '../canvas/model/presentScene';
import { PRESENT_OFFICE_COPY, presentProductivityFailureCopy } from '../locale/presentOfficeLocale';

interface Props {
  isOpen: boolean;
  model: PresentDocumentModel;
  onClose: () => void;
  onUpdateModel: (model: PresentDocumentModel) => void;
  onSelectSlide: (index: number) => void;
  /** Slide the reading-order audit describes; defaults to the first slide. */
  activeSlideIndex?: number;
}

/**
 * What the canonical readers map from a *foreign* package. Kept next to the import action so the
 * statement cannot drift from the module that owns it: the first three limits are the PPTX/ODP
 * mapping statements, the fourth is the foreign-PPTX text fallback.
 */
export function presentImportFidelityNote(format: PresentOfficeFormat): string {
  return `Imported as ${format.toUpperCase()}. Not mapped from foreign packages: ${PRESENT_OFFICE_FIDELITY_LIMITS[2]} ${PRESENT_OFFICE_FIDELITY_LIMITS[3]}`;
}

/**
 * Round 16 (malformed document): a slide's `sceneObjects`/`images` can be non-array hostile values.
 * Round 24: entries inside the arrays can be null/primitives. The accessibility audits below run in
 * this always-mounted modal, so they only ever see real objects — read-only, the document is not
 * touched.
 */
function presentAuditObjectsOf(slide: { sceneObjects?: unknown } | undefined): unknown[] {
  return Array.isArray(slide?.sceneObjects) ? slide.sceneObjects.filter(isPlainPresentRecord) : [];
}

function presentAuditImagesOf(slide: { images?: unknown } | undefined): unknown[] {
  return Array.isArray(slide?.images) ? slide.images.filter(isPlainPresentRecord) : [];
}

export const PresentProductivityModal: React.FC<Props> = ({ isOpen, model, onClose, onUpdateModel, onSelectSlide, activeSlideIndex = 0 }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_OFFICE_COPY[locale].productivity;
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [status, setStatus] = useState('');
  const hits = useMemo(() => searchPresentDeck(model, query, caseSensitive), [model, query, caseSensitive]);
  const duplicates = useMemo(() => findDuplicatePresentSlides(model.slides), [model.slides]);
  // Paket 29: reading order for the active slide, alternative-text coverage and contrast for the
  // whole deck (an audit that only looked at one slide would miss exactly the slides nobody opens).
  const activeIndex = Math.min(Math.max(0, activeSlideIndex), Math.max(0, model.slides.length - 1));
  const activeSlide = model.slides[activeIndex];
  const readingOrder = useMemo(
    () => buildPresentReadingOrder([...presentAuditObjectsOf(activeSlide), ...presentAuditImagesOf(activeSlide)] as never, { includeHidden: false }),
    [activeSlide],
  );
  const altTextReport = useMemo(
    () => auditPresentAltText(model.slides.flatMap((slide) => [...presentAuditObjectsOf(slide), ...presentAuditImagesOf(slide)]) as never),
    [model.slides],
  );
  const contrastFindings = useMemo(
    () => model.slides.flatMap((slide) =>
      auditPresentContrast(
        presentAuditObjectsOf(slide) as never,
        resolvePresentSlideDesign(slide, model).backgroundColor,
      ),
    ),
    [model.slides, model],
  );
  if (!isOpen) return null;

  const replaceAll = () => {
    try {
      const result = replacePresentDeckText(model, query, replacement, caseSensitive);
      onUpdateModel(result.model);
      setStatus(copy.occurrencesReplaced(result.replacements));
    } catch (cause) {
      setStatus(presentProductivityFailureCopy(locale, cause, 'replace'));
    }
  };

  const cleanup = () => {
    try {
      const result = cleanupUnusedPresentMasters(model);
      onUpdateModel(result.model);
      setStatus(result.removedMasterIds.length ? copy.removedMasters(result.removedMasterIds.length) : copy.noUnusedMasters);
    } catch (cause) {
      setStatus(presentProductivityFailureCopy(locale, cause, 'cleanup'));
    }
  };

  const importDeck = async (file: File) => {
    // Bounded, fail-closed intake: the shared bounds rule decides size/extension/name, and the
    // sandbox probe decides that the extension matches the real container. The previous inline copy
    // of the 64 MiB constant could drift away from the platform readers' bound (PRES-D003).
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertPresentOfficeImportBounds(bytes, file.name);
    const sandbox = await inspectForeignFile(file, bytes);
    const expected = presentOfficeFormatFromFileName(file.name);
    if (!expected || sandbox.report.format !== expected) {
      throw new Error(`Deck extension does not match sandbox-detected ${String(sandbox.report.format).toUpperCase()} format.`);
    }
    const imported = await importPresentDeckBytes(bytes, file.name);
    const importedSlides = imported.model.slides ?? [];
    const slides = reusePresentSlides(importedSlides, new Set(model.slides.map((slide) => slide.id)));
    if (!slides.length) throw new Error('Imported deck contained no reusable slides.');
    onUpdateModel({ ...model, slides: [...model.slides, ...slides] });
    setStatus(`${copy.reusedSlides(slides.length, file.name)} ${presentImportFidelityNote(imported.format)}`);
  };

  /**
   * Paket 23: "Fremddecks mit Folien, Bildern, Text und Notes **korrekt** öffnen". A foreign package
   * is opened through the canonical readers, but the honest statement of what those readers map has
   * to be visible at the moment of import - not only in the export centre.
   */
  const replaceDeck = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertPresentOfficeImportBounds(bytes, file.name);
    const sandbox = await inspectForeignFile(file, bytes);
    const expected = presentOfficeFormatFromFileName(file.name);
    if (!expected || sandbox.report.format !== expected) {
      throw new Error(`Deck extension does not match sandbox-detected ${String(sandbox.report.format).toUpperCase()} format.`);
    }
    const imported = await importPresentDeckBytes(bytes, file.name);
    // Replaces the deck through the canonical document path; the editor's history makes it undoable.
    onUpdateModel(imported.model);
    setStatus(`Opened ${imported.model.slides?.length ?? 0} slide(s) from ${file.name} (undo restores the previous deck). ${presentImportFidelityNote(imported.format)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="present-productivity-title">
      <div className="max-h-[94vh] w-full max-w-5xl space-y-5 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-2xl sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 id="present-productivity-title" className="break-words text-lg font-bold text-white">{copy.title}</h2><p className="break-words text-xs text-slate-400">{copy.subtitle}</p></div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400" aria-label={copy.close} title={copy.close}><X aria-hidden="true" className="w-4 h-4" /></button>
        </div>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Search aria-hidden="true" className="w-4 h-4" /> {copy.searchReplace}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input aria-label={copy.findPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={512} placeholder={copy.findPlaceholder} className="min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none" />
            <input aria-label={copy.replacementPlaceholder} value={replacement} onChange={(event) => setReplacement(event.target.value)} maxLength={8192} placeholder={copy.replacementPlaceholder} className="min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none" />
            <button type="button" onClick={replaceAll} disabled={!query} className="whitespace-normal break-words rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Replace aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />{copy.replaceAll}</button>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-400"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /><span className="break-words">{copy.caseSensitive}</span></label>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-black/20">
            {hits.length === 0 ? <div className="break-words p-3 text-xs text-slate-500">{copy.noMatches}</div> : hits.map((hit, index) => (
              <button key={`${hit.slideId}-${hit.field}-${hit.objectId ?? index}`} type="button" onClick={() => { onSelectSlide(hit.slideIndex); onClose(); }} className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 last:border-0">
                <span className="min-w-0 break-words">{copy.searchSlide(hit.slideIndex + 1)} · {copy.searchFields[hit.field]}</span><span className="shrink-0 font-mono text-blue-300">{hit.matchCount}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><CopyPlus aria-hidden="true" className="w-4 h-4" /> {copy.reuseSlides}</div>
            <p className="break-words text-xs text-slate-400">{copy.importDescription}</p>
            <label className="block cursor-pointer break-words rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 p-3 text-center text-xs text-blue-300 hover:bg-blue-500/10">{copy.chooseDeck}
              <input aria-label={copy.chooseDeck} type="file" accept=".pptx,.odp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDeck(file).catch((cause: unknown) => setStatus(presentProductivityFailureCopy(locale, cause, 'import'))); event.currentTarget.value = ''; }} />
            </label>
            <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="break-words text-[0.625rem] text-slate-300">
                Open a PPTX or ODP package as this deck. The current slides are replaced; undo restores them.
                Limit: {Math.round(PRESENT_OFFICE_IMPORT_MAX_BYTES / (1024 * 1024))} MiB per package, and the
                package is rejected - never truncated - when it exceeds it.
              </div>
              <label className="block cursor-pointer break-words rounded-lg border border-dashed border-purple-500/30 bg-purple-500/5 p-2 text-center text-[0.625rem] text-purple-200 hover:bg-purple-500/10">
                Open PPTX/ODP as this deck
                <input
                  aria-label="Open PPTX or ODP file as this deck"
                  data-present-import-open="true"
                  type="file"
                  accept=".pptx,.odp"
                  className="hidden"
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceDeck(file).catch((cause: unknown) => setStatus(presentProductivityFailureCopy(locale, cause, 'import'))); event.currentTarget.value = ''; }}
                />
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Sparkles aria-hidden="true" className="w-4 h-4" /> {copy.deckHygiene}</div>
            <div className="break-words text-xs text-slate-400">{copy.duplicateGroups(duplicates.length)}</div>
            {duplicates.slice(0, 8).map((group, index) => <div key={index} className="break-words text-[0.6875rem] text-slate-400">{copy.duplicateSlideIndexes(group.slideIndexes.map((item) => item + 1).join(', '))}</div>)}
            <button type="button" onClick={cleanup} className="whitespace-normal break-words rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300"><Trash2 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />{copy.removeUnusedMasters}</button>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3" data-present-a11y-audit="true">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Accessibility aria-hidden="true" className="w-4 h-4" /> {`Accessibility check`}</div>
          <div className="break-words text-xs text-slate-400">
            {`Reading order: ${readingOrder.length} object(s) on slide ${activeIndex + 1} in the order a screen reader announces them.`}
          </div>
          <div className="break-words text-xs" data-present-alt-text-findings={altTextReport.missing.length}>
            {altTextReport.missing.length === 0
              ? 'All images, charts, tables, diagrams and links have an alternative text.'
              : `Missing alternative text (${altTextReport.missing.length}):`}
          </div>
          {altTextReport.missing.length > 0 && (
            <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[0.625rem] text-amber-200">
              {altTextReport.missing.slice(0, 12).map((entry) => (
                <li key={entry.id} className="break-words">• {entry.kind}: {entry.label}</li>
              ))}
            </ul>
          )}
          <div className="break-words text-xs" data-present-contrast-findings={contrastFindings.filter((finding) => !finding.passes).length}>
            {contrastFindings.length === 0
              ? 'No text object on the active slide to check for contrast.'
              : contrastFindings.filter((finding) => !finding.passes).length === 0
                ? `Contrast is sufficient for all ${contrastFindings.length} text object(s) on this slide.`
                : `Contrast too low for ${contrastFindings.filter((finding) => !finding.passes).length} text object(s):`}
          </div>
          {contrastFindings.filter((finding) => !finding.passes).length > 0 && (
            <ul className="space-y-0.5 text-[0.625rem] text-amber-200">
              {contrastFindings.filter((finding) => !finding.passes).slice(0, 8).map((finding) => (
                <li key={finding.objectId} className="break-words">• {finding.message}</li>
              ))}
            </ul>
          )}
          <div className="break-words text-[0.625rem] text-slate-500">
            Reading order is back-to-front by layer position, ties in document order; hidden objects are skipped. An unparseable colour is reported as “could not be checked”, never as a pass.
          </div>
        </section>

        {status && <div className="break-words rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300" role="status" aria-live="polite">{status}</div>}
      </div>
    </div>
  );
};
