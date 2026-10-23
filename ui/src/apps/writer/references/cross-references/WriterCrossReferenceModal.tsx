// STATUS: DIAMANT VGT SUPREME — Sovereign Cross-Reference Dialog
import React, { useState } from 'react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import { BookmarkItem, FootnoteItem, ImageBlockData, TableBlockData } from '../../types';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import { X, Link2, Search, FileText, Bookmark, Hash, Image, Table } from 'lucide-react';
import {
  extractCrossReferenceTargets,
  resolveCrossReferenceText,
} from './writerCrossReferenceEngine';

export type CrossRefType = 'heading' | 'bookmark' | 'footnote' | 'figure' | 'table';
export type CrossRefFormat = 'text' | 'page' | 'text_and_page' | 'full';

export interface WriterCrossReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  paragraphs: Paragraph[];
  bookmarks: BookmarkItem[];
  footnotes: FootnoteItem[];
  tables: TableBlockData[];
  images: ImageBlockData[];
  pages?: readonly WriterPaginationPage[];
  onInsertCrossReference: (refText: string) => void;
}

export const WriterCrossReferenceModal: React.FC<WriterCrossReferenceModalProps> = ({
  isOpen,
  onClose,
  paragraphs,
  bookmarks,
  footnotes,
  tables,
  images,
  pages,
  onInsertCrossReference,
}) => {
  const [refType, setRefType] = useState<CrossRefType>('heading');
  const [format, setFormat] = useState<CrossRefFormat>('full');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  if (!isOpen) return null;

  const allTargets = extractCrossReferenceTargets({
    paragraphs,
    bookmarks,
    footnotes,
    tables,
    images,
    pages,
  });

  const typeFilteredTargets = allTargets.filter((t) => {
    if (refType === 'footnote') return t.type === 'footnote' || t.type === 'endnote';
    return t.type === refType;
  });

  const filteredTargets = search.trim()
    ? typeFilteredTargets.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.subtitle.toLowerCase().includes(search.toLowerCase())
      )
    : typeFilteredTargets;

  const handleInsert = () => {
    const target =
      typeFilteredTargets.find((t) => t.id === selectedId) || filteredTargets[0];
    if (!target) return;

    const refText = resolveCrossReferenceText(
      {
        type: 'cross_reference',
        targetType: target.type,
        targetId: target.id,
        format,
        cachedText: '',
      },
      { paragraphs, bookmarks, footnotes, tables, images, pages }
    );

    onInsertCrossReference(refText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Link2 className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Querverweis einfügen (Cross-Reference)</h3>
          </div>
          <button aria-label="Close Querverweis einfügen (Cross-Reference) dialog" type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reference Type Buttons */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-white/5">
          {[
            { id: 'heading' as const, label: 'Überschrift', icon: FileText },
            { id: 'bookmark' as const, label: 'Textmarke', icon: Bookmark },
            { id: 'footnote' as const, label: 'Fuß-/Endnote', icon: Hash },
            { id: 'table' as const, label: 'Tabelle', icon: Table },
            { id: 'figure' as const, label: 'Abbildung', icon: Image },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setRefType(tab.id);
                  setSelectedId('');
                }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-all ${
                  refType === tab.id
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Format Selector & Search */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[0.6875rem] font-medium text-slate-400 block mb-1">Verweistext-Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as CrossRefFormat)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            >
              <option value="full">Vollständig ([Siehe „Titel“, S. X])</option>
              <option value="text_and_page">Text und Seite („Titel auf Seite X“)</option>
              <option value="text">Nur Titel/Bezeichnung („Titel“)</option>
              <option value="page">Nur Seitenzahl (Seite X)</option>
            </select>
          </div>
          <div>
            <label className="text-[0.6875rem] font-medium text-slate-400 block mb-1">Ziel filtern</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-lg pl-7 pr-2.5 py-1.5 text-slate-200 text-xs focus:border-blue-500 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" />
            </div>
          </div>
        </div>

        {/* Target Items List */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 border border-white/5 rounded-xl p-1.5 bg-slate-950/50">
          {filteredTargets.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 italic">
              Keine Ziele vom Typ „{refType}“ gefunden.
            </div>
          ) : (
            filteredTargets.map((item) => {
              const isSelected = (selectedId || filteredTargets[0]?.id) === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left p-2 rounded-lg flex items-center justify-between text-xs transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border border-blue-500/40 text-blue-200'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="font-medium text-slate-100">{item.title}</span>
                    <span className="text-[0.625rem] text-slate-400 ml-2 font-mono">({item.subtitle})</span>
                  </div>
                  <span className="text-[0.625rem] font-mono text-slate-400 shrink-0">S. {item.pageNumber}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={filteredTargets.length === 0}
            onClick={handleInsert}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shadow-md transition-all"
          >
            Querverweis einfügen
          </button>
        </div>
      </div>
    </div>
  );
};
