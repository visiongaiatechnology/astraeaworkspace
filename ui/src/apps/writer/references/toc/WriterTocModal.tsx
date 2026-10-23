// STATUS: DIAMANT VGT SUPREME — Sovereign Table of Contents (TOC) Modal
import React, { useState } from 'react';
import { X, ListTree, Check } from 'lucide-react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import {
  generateTableOfContentsParagraphs,
  updateOrInsertTableOfContents,
  TocOptions,
} from './writerTocEngine';

export interface WriterTocModalProps {
  isOpen: boolean;
  onClose: () => void;
  paragraphs: readonly Paragraph[];
  /**
   * The pagination of the current document.
   *
   * **Required on purpose.** Without it `resolveParagraphPageNumber` answers `1` for
   * every heading, so the inserted directory showed "1" on each line and the user had
   * to run a field update to get real numbers — the manual rework the acceptance
   * excludes. It used to be optional and the caller silently omitted it.
   */
  pages: readonly WriterPaginationPage[];
  onInsertToc: (updatedParagraphs: Paragraph[]) => void;
}

export const WriterTocModal: React.FC<WriterTocModalProps> = ({
  isOpen,
  onClose,
  paragraphs,
  pages,
  onInsertToc,
}) => {
  const [maxLevel, setMaxLevel] = useState<number>(3);
  const [tabLeader, setTabLeader] = useState<'.' | '-' | '_' | 'none'>('.');
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(true);
  const [tocTitle, setTocTitle] = useState<string>('Inhaltsverzeichnis');

  if (!isOpen) return null;

  const options: TocOptions = {
    title: tocTitle.trim() || 'Inhaltsverzeichnis',
    maxLevel,
    tabLeader,
    showPageNumbers,
  };

  const previewParagraphs = generateTableOfContentsParagraphs(paragraphs, pages, options);

  const handleApply = () => {
    const updated = updateOrInsertTableOfContents(paragraphs, pages, options);
    onInsertToc(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <ListTree className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-100">
              Inhaltsverzeichnis einfügen & anpassen
            </h3>
          </div>
          <button aria-label="Close Inhaltsverzeichnis einfügen & anpassen dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Titel des Verzeichnisses</label>
            <input
              type="text"
              value={tocTitle}
              onChange={(e) => setTocTitle(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Überschriften-Tiefe</label>
            <select
              value={maxLevel}
              onChange={(e) => setMaxLevel(Number(e.target.value))}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            >
              <option value={1}>Ebene 1 (Nur Hauptüberschriften)</option>
              <option value={2}>Ebenen 1–2</option>
              <option value={3}>Ebenen 1–3 (Standard)</option>
              <option value={4}>Ebenen 1–4</option>
              <option value={5}>Ebenen 1–5 (Maximal)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Füllzeichen (Tab Leader)</label>
            <select
              value={tabLeader}
              onChange={(e) => setTabLeader(e.target.value as '.' | '-' | '_' | 'none')}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 font-mono"
            >
              <option value=".">Gepunktet (. . . . . .)</option>
              <option value="-">Gestrichelt (- - - - - -)</option>
              <option value="_">Unterstrich (_ _ _ _ _ _)</option>
              <option value="none">Keine Füllzeichen</option>
            </select>
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={showPageNumbers}
                onChange={(e) => setShowPageNumbers(e.target.checked)}
                className="rounded text-blue-600 bg-slate-950 border-white/20 focus:ring-0"
              />
              <span>Seitenzahlen anzeigen</span>
            </label>
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Live-Vorschau</span>
            <span className="text-[0.6875rem] font-mono text-slate-500">
              {previewParagraphs.length - 1} Einträge
            </span>
          </div>
          <div className="max-h-44 overflow-y-auto bg-slate-950/80 border border-white/10 rounded-xl p-3 space-y-1 font-sans text-xs">
            {previewParagraphs.map((p) => {
              const fullText = p.spans.map((s) => s.text).join('');
              return (
                <div
                  key={p.id}
                  className="truncate text-slate-300 font-mono text-[0.6875rem]"
                  style={{ paddingLeft: `${(p.style.left_indent_mm || 0) * 2}px` }}
                >
                  {fullText}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 flex items-center space-x-1.5 transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Inhaltsverzeichnis einfügen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
