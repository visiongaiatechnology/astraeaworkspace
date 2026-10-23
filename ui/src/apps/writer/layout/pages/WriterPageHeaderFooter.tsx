// STATUS: PLATIN — Quiet header & footer that only become editable on request
//
// ASTRAEA WRITER 50 V2, WR-003/WR-004: a fresh DIN A4 sheet must show no
// permanent technical header field — no blue frame, no label chip, no paper-format
// badge, no separator line across the writing area. The header is a *zone*, not a
// command bar, and it becomes editable **only** through a deliberate double-click
// in that zone. `Esc` or a click into the running text leaves it again.
//
// Everything the document already stores is preserved: the `default`/`first`/`even`
// variants, the field templates (`{PAGE}`, `{NUMPAGES}`, …), odd/even separation and
// the "linked to previous section" switch. This component only decides *how much
// chrome* is visible, never what is stored.
import React, { useEffect, useRef } from 'react';
import { Link, Unlink } from 'lucide-react';
import type { PageSetupConfig } from '../../types';
import { evaluateFields, hasWriterFields } from '../../utils/writerUtils';
import { formatWriterPageNumber } from '../pagination/writerPagination';
import { resolveWriterHeaderFooter } from '../../../../shared/writer/layout/headerFooter';

interface WriterPageHeaderFooterProps {
  type: 'header' | 'footer';
  pageIndex: number;
  displayPageNumberString?: string;
  physicalPageIndex?: number;
  sectionPageIndex?: number;
  totalPages: number;
  documentTitle: string;
  wordCount: number;
  pageSetup: PageSetupConfig;
  isSection?: boolean;
  /**
   * True only while the user explicitly opened this zone with a double-click.
   * In the passive state the component renders the *content* of the header and
   * nothing else, so the writing flow is never blocked by editor chrome.
   */
  editing?: boolean;
  readOnly?: boolean;
  /** Emitted on double-click in the zone; the owner decides whether to enter edit mode. */
  onRequestEdit?: () => void;
  onExitEdit?: () => void;
  onUpdateHeader?: (text: string, target?: 'default' | 'first' | 'even') => void;
  onUpdateFooter?: (text: string, target?: 'default' | 'first' | 'even') => void;
  onToggleLinkToPrevious?: (type: 'header' | 'footer') => void;
}

function pageNumberPositionClass(position: NonNullable<PageSetupConfig['pageNumberPosition']>): string {
  if (position.endsWith('-left')) return 'left-0';
  if (position.endsWith('-center')) return 'left-1/2 -translate-x-1/2';
  return 'right-0';
}

export const WriterPageHeaderFooter: React.FC<WriterPageHeaderFooterProps> = ({
  type,
  pageIndex,
  displayPageNumberString,
  physicalPageIndex = pageIndex,
  sectionPageIndex = pageIndex,
  totalPages,
  documentTitle,
  wordCount,
  pageSetup,
  isSection = false,
  editing = false,
  readOnly = false,
  onRequestEdit,
  onExitEdit,
  onUpdateHeader,
  onUpdateFooter,
  onToggleLinkToPrevious,
}) => {
  const isEven = physicalPageIndex % 2 === 0;
  const resolved = resolveWriterHeaderFooter(pageSetup, physicalPageIndex, sectionPageIndex);
  const target = resolved.variant;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isLinked = type === 'header'
    ? (pageSetup.linkToPreviousHeader ?? true)
    : (pageSetup.linkToPreviousFooter ?? true);

  const formattedPageNum = displayPageNumberString
    ?? formatWriterPageNumber(pageIndex, pageSetup.pageNumberFormat);

  const isHeader = type === 'header';
  /**
   * The editable field holds the **template** (`{PAGE}`, `{NUMPAGES}`, `{TITLE}` …),
   * never the evaluated text. Writing the substituted values back would freeze the
   * first page's numbers into every page on the first keystroke.
   */
  const template = isHeader ? resolved.headerText : resolved.footerText;
  const label = isHeader ? resolved.headerLabel : resolved.footerLabel;
  const evaluated = evaluateFields(template, {
    pageNumber: pageIndex,
    totalPages,
    title: documentTitle,
    words: wordCount,
  });
  const headerHasFields = isHeader && hasWriterFields(template);
  const footerHasFields = !isHeader && hasWriterFields(template);
  const showPageNumber = pageSetup.showPageNumbers
    && (isHeader
      ? Boolean(pageSetup.pageNumberPosition?.startsWith('header'))
      : (!pageSetup.pageNumberPosition || pageSetup.pageNumberPosition.startsWith('footer')));
  const numberPosition = pageSetup.pageNumberPosition ?? (isHeader ? 'header-right' : 'footer-right');
  const isAlternate = pageSetup.oddEvenDifferent && isEven;

  useEffect(() => {
    if (!editing) return;
    /**
     * Native round 6 — focusing the field must not move the viewport.
     *
     * `focus()` scrolls the element into view. While every page rendered an active field,
     * the last page's effect focused *its* input and the document jumped to the end. The
     * renderer now addresses one page, and `preventScroll` keeps the click position even if
     * the focused field sits slightly outside the viewport.
     */
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      inputRef.current?.focus();
    }
    inputRef.current?.select();
  }, [editing]);

  const zoneAttributes = isHeader
    ? { 'data-writer-header-zone': 'true' }
    : { 'data-writer-footer-zone': 'true' };

  const handleZoneDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    // A double-click on an already active input must not re-enter edit mode.
    const target_ = event.target;
    if (target_ instanceof HTMLElement && target_.closest('[data-writer-header-editor], [data-writer-footer-editor]')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onRequestEdit?.();
  };

  /**
   * Passive state. Nothing here is an input, nothing is clickable in the sense of
   * a form control: only text that the document already carries, plus the page
   * number the page setup asks for. The zone keeps a small reserved height so the
   * double-click target exists on a document without a header.
   */
  if (!editing) {
    return (
      <div
        {...zoneAttributes}
        data-writer-header-footer-state="passive"
        // WR-002: the header zone lives inside the one contentEditable root. It is a
        // non-editable island, otherwise a click into the header area could drop the
        // caret into chrome and a "select everything" would sweep it up.
        contentEditable={false}
        onDoubleClick={handleZoneDoubleClick}
        className={`relative z-10 min-h-[1.35rem] select-none text-xs ${
          isHeader ? 'mb-3' : 'mt-3'
        } ${isAlternate ? 'text-right' : 'text-left'}`}
      >
        {evaluated.trim().length > 0 ? (
          <span
            data-writer-header-footer-content="passive"
            className="whitespace-pre-wrap text-slate-500/90 dark:text-slate-400/90"
          >
            {evaluated}
          </span>
        ) : null}
        {showPageNumber && (
          <span
            data-writer-page-number="passive"
            className={`pointer-events-none absolute text-[0.6875rem] font-semibold text-slate-500 dark:text-slate-400 ${pageNumberPositionClass(numberPosition)}`}
            title={`Seite ${formattedPageNum} von ${formatWriterPageNumber(totalPages, pageSetup.pageNumberFormat)}`}
          >
            {formattedPageNum}
          </span>
        )}
      </div>
    );
  }

  /**
   * Edit state. The marking is deliberately temporary: it exists only while the
   * user is inside the zone, and never leaks into the passive view, the PDF or a
   * reopened document.
   */
  return (
    <div
      {...zoneAttributes}
      data-writer-header-footer-state="editing"
      // A form control inside a `contentEditable` root: the island keeps the
      // browser's caret model out of the header while the field itself stays
      // fully usable (its own `input` events are isolated by the surface).
      contentEditable={false}
      className={`relative z-10 flex items-center gap-2 rounded-md border border-blue-400/60 bg-blue-500/10 px-2 py-1 text-xs ${
        isHeader ? 'mb-3' : 'mt-3'
      } ${isAlternate ? 'flex-row-reverse' : ''}`}
    >
      <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 font-sans text-[0.5625rem] font-semibold text-blue-700 dark:text-blue-200">
        {label}
      </span>
      <input
        ref={inputRef}
        {...(isHeader
          ? { 'data-writer-header-editor': 'true' }
          : { 'data-writer-footer-editor': 'true' })}
        aria-label={isHeader ? 'Kopfzeilentext' : 'Fußzeilentext'}
        // The field holds the *template* so that editing keeps `{PAGE}` and
        // friends intact. Writing the evaluated text back would freeze the first
        // page's values into every page.
        value={template}
        onChange={(event) => {
          if (isHeader) onUpdateHeader?.(event.target.value, target);
          else onUpdateFooter?.(event.target.value, target);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onExitEdit?.();
        }}
        placeholder={isHeader ? 'Kopfzeile …' : 'Fußzeile …'}
        className={`w-full min-w-0 flex-1 bg-transparent font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
          isAlternate ? 'text-right' : 'text-left'
        }`}
      />
      {headerHasFields && (
        <span
          data-writer-header-preview="true"
          title="Vorschau mit den Werten dieser Seite"
          className="shrink-0 font-sans text-[0.625rem] text-slate-500 dark:text-slate-400"
        >
          {evaluated}
        </span>
      )}
      {footerHasFields && (
        <span
          data-writer-footer-preview="true"
          title="Vorschau mit den Werten dieser Seite"
          className="shrink-0 font-sans text-[0.625rem] text-slate-500 dark:text-slate-400"
        >
          {evaluated}
        </span>
      )}
      {isSection && onToggleLinkToPrevious && (
        <button
          type="button"
          onClick={() => onToggleLinkToPrevious(type)}
          className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[0.625rem] transition-colors ${
            isLinked
              ? 'border-blue-400/30 text-blue-600 hover:bg-blue-400/10 dark:text-blue-300'
              : 'border-amber-400/30 text-amber-600 hover:bg-amber-400/10 dark:text-amber-300'
          }`}
          title={isLinked ? 'Mit vorherigem Abschnitt verknüpft' : 'Entkoppelt von vorherigem Abschnitt'}
        >
          {isLinked ? <Link className="h-2.5 w-2.5" /> : <Unlink className="h-2.5 w-2.5" />}
          <span>{isLinked ? 'Verknüpft' : 'Eigenständig'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onExitEdit?.()}
        className="shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] text-slate-600 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 dark:text-slate-300"
        title="Kopf-/Fußzeile schließen (Esc)"
      >
        Fertig
      </button>
      <span className="shrink-0 text-[0.625rem] text-slate-500 dark:text-slate-400">
        {pageSetup.paperSize} · {pageSetup.orientation === 'portrait' ? 'Hochformat' : 'Querformat'}
      </span>
      {showPageNumber && (
        <span
          className={`pointer-events-none absolute text-[0.6875rem] font-semibold text-slate-600 dark:text-slate-400 ${pageNumberPositionClass(numberPosition)}`}
        >
          {formattedPageNum}
        </span>
      )}
    </div>
  );
};
