// STATUS: DIAMANT VGT SUPREME — Sovereign Special Document Views (Outline, Reading, Draft)
import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Layers,
  Table as TableIcon,
  Image as ImageIcon,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';
import type {
  Paragraph,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterShapeBlockData,
} from '../../../../shared/contracts/workspace';
import type {
  EquationBlockData,
  ImageBlockData,
  ReviewMode,
  TableBlockData,
  TrackChangeRevision,
  ViewMode,
} from '../../types';
import { WriterParagraphItem } from '../../editor/paragraphs/WriterParagraphItem';
import { WriterAttachedBlocks, WriterUnanchoredBlocks } from '../../editor/blocks/WriterSpecialBlocks';
import type { WriterCollaborationPeer } from '../../collaboration/types/writerCollaborationTypes';

export interface WriterSpecialViewsProps {
  viewMode: ViewMode;
  documentTitle: string;
  paragraphs: Paragraph[];
  pages: readonly { id: string }[];
  zoom: number;
  styles: WriterStyleDefinition[];
  activeParagraphId: string | null;
  draggedPIdx: number | null;
  dragOverPIdx: number | null;
  showNonPrinting: boolean;
  reviewMode: ReviewMode;
  revisions: TrackChangeRevision[];
  remotePeersByParagraph?: Readonly<Record<string, readonly WriterCollaborationPeer[]>>;
  readOnly?: boolean;
  onParagraphChange: (pIdx: number, text: string, inputCaret?: number) => number;
  onTextSelection: (pIdx: number, start: number, end: number) => void;
  onSelectParagraph: (pId: string) => void;
  onAddParagraph: (afterIdx: number, headingLevel?: 1 | 2 | 3) => void;
  onDeleteParagraph: (pIdx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, targetIdx: number) => void;
  onIndentListLevel?: (pIdx: number, delta?: number) => void;
  onOutdentListLevel?: (pIdx: number) => void;
  onExitListMode?: (pIdx: number) => void;
  onParagraphContextMenu?: (e: React.MouseEvent, pIdx: number) => void;

  tables: TableBlockData[];
  images: ImageBlockData[];
  equations: EquationBlockData[];
  shapes?: readonly WriterShapeBlockData[];
  styleCatalog: WriterStyleCatalog;
  onUpdateTable: (table: TableBlockData) => void;
  onDeleteTable: (tableId: string) => void;
  onOpenTableProperties?: (table: TableBlockData) => void;
  onUpdateImage: (imageId: string, patch: Partial<ImageBlockData>) => void;
  onDeleteImage: (imageId: string) => void;
  onOpenImageProperties?: (image: ImageBlockData) => void;
  onUpdateEquation: (equation: EquationBlockData) => void;
  onDeleteEquation: (equationId: string) => void;
  onOpenEquationModal?: (equation: EquationBlockData) => void;
  onUpdateShapes?: (shapes: WriterShapeBlockData[]) => void;
}

export const WriterSpecialViews: React.FC<WriterSpecialViewsProps> = ({
  viewMode,
  documentTitle,
  paragraphs,
  pages,
  zoom,
  styles,
  activeParagraphId,
  draggedPIdx,
  dragOverPIdx,
  showNonPrinting,
  reviewMode,
  revisions,
  remotePeersByParagraph = {},
  readOnly = false,
  onParagraphChange,
  onTextSelection,
  onSelectParagraph,
  onAddParagraph,
  onDeleteParagraph,
  onDragStart,
  onDragOver,
  onDrop,
  onIndentListLevel,
  onOutdentListLevel,
  onExitListMode,
  onParagraphContextMenu,
  tables,
  images,
  equations,
  shapes,
  styleCatalog,
  onUpdateTable,
  onDeleteTable,
  onOpenTableProperties,
  onUpdateImage,
  onDeleteImage,
  onOpenImageProperties,
  onUpdateEquation,
  onDeleteEquation,
  onOpenEquationModal,
  onUpdateShapes,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const isReadingMode = viewMode === 'reading';
  const effectiveReadOnly = readOnly || isReadingMode;

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const blockProps = {
    tables,
    images,
    equations,
    styleCatalog,
    onUpdateTable,
    onDeleteTable,
    onOpenTableProperties,
    onUpdateImage,
    onDeleteImage,
    onOpenImageProperties,
    onUpdateEquation,
    onDeleteEquation,
    onOpenEquationModal,
    readOnly: effectiveReadOnly,
  };

  // Outline View
  if (viewMode === 'outline') {
    const isHeading = (p: Paragraph) =>
      Boolean(p.style.heading_level || p.style.style_name?.startsWith('heading'));

    const sections: Array<{
      id: string;
      heading?: { paragraph: Paragraph; index: number; level: number };
      items: Array<{ paragraph: Paragraph; index: number }>;
    }> = [];

    let currentSection: {
      id: string;
      heading?: { paragraph: Paragraph; index: number; level: number };
      items: Array<{ paragraph: Paragraph; index: number }>;
    } = { id: 'preamble', items: [] };

    paragraphs.forEach((p, idx) => {
      if (isHeading(p)) {
        if (currentSection.heading || currentSection.items.length > 0) {
          sections.push(currentSection);
        }
        const level =
          p.style.heading_level ??
          (parseInt(p.style.style_name?.replace('heading', '') ?? '1', 10) || 1);
        currentSection = {
          id: p.id,
          heading: { paragraph: p, index: idx, level },
          items: [],
        };
      } else {
        currentSection.items.push({ paragraph: p, index: idx });
      }
    });
    if (currentSection.heading || currentSection.items.length > 0) {
      sections.push(currentSection);
    }

    return (
      <div className="w-full max-w-4xl mx-auto p-6 space-y-4 font-sans text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
            <Layers className="w-4 h-4" />
            <span>Gliederungsansicht (Outline Mode)</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded">
              {sections.filter((s) => Boolean(s.heading)).length} Überschriften · {paragraphs.length} Absätze · {tables.length} Tabellen · {images.length} Bilder
            </span>
            <button
              type="button"
              onClick={() => setCollapsedSections({})}
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[0.6875rem] transition-colors"
              aria-label="Alle Gliederungsabschnitte aufklappen"
            >
              <ChevronsDown className="w-3 h-3" />
              <span>Alle aufklappen</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const all: Record<string, boolean> = {};
                sections.forEach((s) => { all[s.id] = true; });
                setCollapsedSections(all);
              }}
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[0.6875rem] transition-colors"
              aria-label="Alle Gliederungsabschnitte zuklappen"
            >
              <ChevronsUp className="w-3 h-3" />
              <span>Alle zuklappen</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {sections.map((sec) => {
            const isCollapsed = Boolean(collapsedSections[sec.id]);
            const h = sec.heading;
            const indentPx = h ? (h.level - 1) * 20 : 0;
            const headingText = h
              ? h.paragraph.spans.map((s) => s.text).join('') || 'Ohne Titel'
              : 'Dokument-Einführung';
            const secTablesCount =
              (h ? tables.filter((t) => t.anchorParagraphId === h.paragraph.id).length : 0) +
              sec.items.reduce((acc, it) => acc + tables.filter((t) => t.anchorParagraphId === it.paragraph.id).length, 0);
            const secImagesCount =
              (h ? images.filter((img) => img.anchorParagraphId === h.paragraph.id).length : 0) +
              sec.items.reduce((acc, it) => acc + images.filter((img) => img.anchorParagraphId === it.paragraph.id).length, 0);

            return (
              <div
                key={sec.id}
                className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden"
                style={{ marginLeft: `${indentPx}px` }}
              >
                <div
                  // GAP-0052, Runde 289: die Kopfzeile eines Gliederungsabschnitts
                  // war ein `<div>` mit `onClick` und `cursor-pointer` — und sonst
                  // nichts. Sie waehlt den Absatz UND klappt den Abschnitt um;
                  // beides war mit der Tastatur unerreichbar.
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  className={`flex items-center gap-2 p-2.5 cursor-pointer select-none transition-colors ${
                    h && activeParagraphId === h.paragraph.id
                      ? 'bg-blue-600/20 border-b border-blue-500/30 text-white'
                      : 'hover:bg-white/5 text-slate-200 border-b border-white/5'
                  }`}
                  onClick={() => {
                    if (h) onSelectParagraph(h.paragraph.id);
                    toggleSection(sec.id);
                  }}
                  onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                    // In der Zeile sitzt der Klapp-Knopf. Dessen Tasten gehoeren
                    // ihm allein; ohne diese Schranke klappte die Zeile ein
                    // zweites Mal um, wenn er mit Enter bedient wird.
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    // Die Leertaste scrollt von sich aus.
                    event.preventDefault();
                    if (h) onSelectParagraph(h.paragraph.id);
                    toggleSection(sec.id);
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection(sec.id);
                    }}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                    aria-expanded={!isCollapsed}
                    aria-label={`${headingText} ${isCollapsed ? 'aufklappen' : 'zuklappen'}`}
                  >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-blue-400" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-400" />}
                  </button>

                  <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold">
                    {h ? `H${h.level}` : 'START'}
                  </span>
                  <span className="text-sm font-semibold truncate flex-1">{headingText}</span>

                  <div className="flex items-center gap-1.5 text-[0.625rem] text-slate-400 font-mono">
                    {sec.items.length > 0 && <span>{sec.items.length} ¶</span>}
                    {secTablesCount > 0 && (
                      <span className="flex items-center gap-0.5 text-emerald-400">
                        <TableIcon className="w-3 h-3" />
                        {secTablesCount}
                      </span>
                    )}
                    {secImagesCount > 0 && (
                      <span className="flex items-center gap-0.5 text-amber-400">
                        <ImageIcon className="w-3 h-3" />
                        {secImagesCount}
                      </span>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-3 space-y-3 bg-slate-950/30">
                    {h && <WriterAttachedBlocks paragraphId={h.paragraph.id} {...blockProps} />}
                    {sec.items.map(({ paragraph: p, index: idx }) => (
                      <div key={p.id} className="relative group">
                        <WriterParagraphItem
                          paragraph={p}
                          paragraphIndex={idx}
                          allParagraphs={paragraphs}
                          styles={styles}
                          isLight={false}
                          activeParagraphId={activeParagraphId}
                          draggedPIdx={draggedPIdx}
                          dragOverPIdx={dragOverPIdx}
                          showNonPrinting={showNonPrinting}
                          reviewMode={reviewMode}
                          revisions={revisions}
                          remotePeers={remotePeersByParagraph[p.id] ?? []}
                                  onParagraphChange={onParagraphChange}
                          onTextSelection={onTextSelection}
                          onSelectParagraph={onSelectParagraph}
                          onAddParagraph={onAddParagraph}
                          onDeleteParagraph={onDeleteParagraph}
                          onDragStart={onDragStart}
                          onDragOver={onDragOver}
                          onDrop={onDrop}
                          onIndentListLevel={onIndentListLevel}
                          onOutdentListLevel={onOutdentListLevel}
                          onExitListMode={onExitListMode}
                          onContextMenu={onParagraphContextMenu}
                          showPageBreakMarker={false}
                        />
                        <WriterAttachedBlocks paragraphId={p.id} {...blockProps} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <WriterUnanchoredBlocks paragraphs={paragraphs} shapes={shapes} onUpdateShapes={onUpdateShapes} {...blockProps} />
        </div>
      </div>
    );
  }

  // Reading Mode
  if (viewMode === 'reading') {
    return (
      <div
        className="flex flex-col items-center gap-6 transition-transform duration-150 origin-top motion-reduce:transition-none"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
        role="region"
        aria-label="Lesemodus, Dokument ist schreibgeschützt"
      >
        <div className="w-full max-w-3xl bg-[#fcf8f2] dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-2xl p-8 md:p-12 border border-black/5 dark:border-white/10">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-black/10 dark:border-white/10 text-xs text-slate-500">
            <div className="flex items-center gap-2 font-serif font-bold text-base text-slate-800 dark:text-slate-200">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>{documentTitle}</span>
            </div>
            <span className="font-mono text-[0.6875rem]">Nur lesen · {pages.length} Seiten</span>
          </div>

          <div className="space-y-6 font-serif leading-relaxed text-[1.0625rem]">
            {paragraphs.map((p, idx) => (
              // GAP-0055, Runde 294: dieses Element trug
              // `focus:outline-none focus-visible:ring-2` — also FOKUS-STILE —
              // aber kein `tabIndex`. Der Fokusring war ein Versprechen, das
              // die Tab-Reihenfolge nicht einloeste: ein Nutzer, der nicht
              // zeigen kann, sah ihn nie. Jetzt liegt der Absatz in der
              // Tab-Reihenfolge und Enter/Leertaste waehlen ihn.
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-pressed={activeParagraphId === p.id}
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                onClick={() => onSelectParagraph(p.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectParagraph(p.id);
                  }
                }}
              >
                <WriterParagraphItem
                  paragraph={p}
                  paragraphIndex={idx}
                  allParagraphs={paragraphs}
                  styles={styles}
                  isLight={false}
                  activeParagraphId={activeParagraphId}
                  draggedPIdx={draggedPIdx}
                  dragOverPIdx={dragOverPIdx}
                  showNonPrinting={false}
                  reviewMode={reviewMode}
                  revisions={revisions}
                  remotePeers={remotePeersByParagraph[p.id] ?? []}
                  readOnly={effectiveReadOnly}
                  onParagraphChange={onParagraphChange}
                  onTextSelection={onTextSelection}
                  onSelectParagraph={onSelectParagraph}
                  onAddParagraph={onAddParagraph}
                  onDeleteParagraph={onDeleteParagraph}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onIndentListLevel={onIndentListLevel}
                  onOutdentListLevel={onOutdentListLevel}
                  onExitListMode={onExitListMode}
                  showPageBreakMarker={false}
                />
                <WriterAttachedBlocks paragraphId={p.id} {...blockProps} />
              </div>
            ))}

            <WriterUnanchoredBlocks paragraphs={paragraphs} shapes={shapes} onUpdateShapes={onUpdateShapes} zoom={zoom} {...blockProps} />
          </div>
        </div>
      </div>
    );
  }

  // Draft Mode
  if (viewMode === 'draft') {
    return (
      <div
        className="w-full max-w-4xl mx-auto p-4 md:p-8 space-y-4 bg-slate-950/80 rounded-xl border border-white/10 text-slate-200 font-mono text-sm"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs text-slate-400">
          <span className="font-bold text-amber-400">ENTWURFSANSICHT (DRAFT MODE)</span>
          <span className="font-mono">{paragraphs.length} Absätze · {tables.length} Tabellen · {images.length} Bilder</span>
        </div>

        <div className="space-y-4">
          {paragraphs.map((p, idx) => (
            <div key={p.id} className="relative group space-y-2">
              {p.style.page_break_before && (
                <div className="flex items-center gap-2 py-1 my-2 border-t border-dashed border-orange-500/50 text-[0.625rem] text-orange-400 font-mono">
                  <span>─── SEITENUMBRUCH ───</span>
                </div>
              )}
              {p.style.column_break_before && (
                <div className="flex items-center gap-2 py-1 my-2 border-t border-dashed border-cyan-500/50 text-[0.625rem] text-cyan-400 font-mono">
                  <span>─── SPALTENUMBRUCH ───</span>
                </div>
              )}
              <WriterParagraphItem
                paragraph={p}
                paragraphIndex={idx}
                allParagraphs={paragraphs}
                styles={styles}
                isLight={false}
                activeParagraphId={activeParagraphId}
                draggedPIdx={draggedPIdx}
                dragOverPIdx={dragOverPIdx}
                showNonPrinting={showNonPrinting}
                reviewMode={reviewMode}
                revisions={revisions}
                remotePeers={remotePeersByParagraph[p.id] ?? []}
                readOnly={effectiveReadOnly}
                onParagraphChange={onParagraphChange}
                onTextSelection={onTextSelection}
                onSelectParagraph={onSelectParagraph}
                onAddParagraph={onAddParagraph}
                onDeleteParagraph={onDeleteParagraph}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onIndentListLevel={onIndentListLevel}
                onOutdentListLevel={onOutdentListLevel}
                onExitListMode={onExitListMode}
                onContextMenu={onParagraphContextMenu}
                showPageBreakMarker={false}
              />
              <WriterAttachedBlocks paragraphId={p.id} {...blockProps} />
            </div>
          ))}

          <WriterUnanchoredBlocks paragraphs={paragraphs} shapes={shapes} onUpdateShapes={onUpdateShapes} {...blockProps} />
        </div>
      </div>
    );
  }

  return null;
};
