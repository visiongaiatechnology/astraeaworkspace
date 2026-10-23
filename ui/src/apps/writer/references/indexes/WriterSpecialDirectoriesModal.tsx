// STATUS: DIAMANT VGT SUPREME — Sovereign Special Directories Modal (Tables & Index)
import React, { useState } from 'react';
import { X, Table, BookMarked, Plus, Trash2, Check, FileText } from 'lucide-react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { TableBlockData, WriterIndexEntry } from '../../types';
import type { WriterPaginationPage } from '../../layout/pagination/writerPagination';
import {
  generateTableOfTablesParagraphs,
  generateSubjectIndexParagraphs,
  extractTableIndexItems,
} from './writerSpecialIndexesEngine';

export interface WriterSpecialDirectoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: readonly TableBlockData[];
  indexEntries: readonly WriterIndexEntry[];
  pages?: readonly WriterPaginationPage[];
  onUpdateIndexEntries: (entries: WriterIndexEntry[]) => void;
  onInsertParagraphs: (paragraphs: Paragraph[]) => void;
}

export const WriterSpecialDirectoriesModal: React.FC<WriterSpecialDirectoriesModalProps> = ({
  isOpen,
  onClose,
  tables,
  indexEntries,
  pages,
  onUpdateIndexEntries,
  onInsertParagraphs,
}) => {
  const [activeTab, setActiveTab] = useState<'tables' | 'index'>('tables');
  const [newTerm, setNewTerm] = useState('');
  const [newSubTerm, setNewSubTerm] = useState('');
  const [newPageStr, setNewPageStr] = useState('1');

  if (!isOpen) return null;

  const tableItems = extractTableIndexItems(tables, pages);

  const handleAddIndexEntry = () => {
    if (!newTerm.trim()) return;
    const pageNum = parseInt(newPageStr, 10) || 1;
    const existing = indexEntries.find(
      (e) => e.term.toLowerCase() === newTerm.trim().toLowerCase()
    );

    if (existing) {
      if (newSubTerm.trim()) {
        const updatedSubs = existing.subEntries ? [...existing.subEntries] : [];
        updatedSubs.push({
          id: `sub_${Date.now()}`,
          subTerm: newSubTerm.trim(),
          pageNumbers: [pageNum],
        });
        const updatedEntries = indexEntries.map((e) =>
          e.id === existing.id ? { ...e, subEntries: updatedSubs } : e
        );
        onUpdateIndexEntries(updatedEntries);
      } else {
        const pagesSet = new Set([...existing.pageNumbers, pageNum]);
        const updatedEntries = indexEntries.map((e) =>
          e.id === existing.id ? { ...e, pageNumbers: Array.from(pagesSet).sort((a, b) => a - b) } : e
        );
        onUpdateIndexEntries(updatedEntries);
      }
    } else {
      const newEntry: WriterIndexEntry = {
        id: `idx_${Date.now()}`,
        term: newTerm.trim(),
        pageNumbers: newSubTerm.trim() ? [] : [pageNum],
        subEntries: newSubTerm.trim()
          ? [{ id: `sub_${Date.now()}`, subTerm: newSubTerm.trim(), pageNumbers: [pageNum] }]
          : [],
      };
      onUpdateIndexEntries([...indexEntries, newEntry]);
    }

    setNewTerm('');
    setNewSubTerm('');
  };

  const handleDeleteIndexEntry = (id: string) => {
    onUpdateIndexEntries(indexEntries.filter((e) => e.id !== id));
  };

  const handleInsertTablesDirectory = () => {
    const pars = generateTableOfTablesParagraphs(tables, pages);
    onInsertParagraphs(pars);
    onClose();
  };

  const handleInsertSubjectIndex = () => {
    const pars = generateSubjectIndexParagraphs(indexEntries);
    onInsertParagraphs(pars);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <BookMarked className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-100">Spezialverzeichnisse & Index</h3>
          </div>
          <button aria-label="Close Spezialverzeichnisse & Index dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-slate-950/80 rounded-xl border border-white/5 space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('tables')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'tables'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tabellenverzeichnis ({tableItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('index')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
              activeTab === 'index'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Stichwortindex ({indexEntries.length})</span>
          </button>
        </div>

        {/* Tab 1: Tabellenverzeichnis */}
        {activeTab === 'tables' && (
          <div className="space-y-4">
            <div className="max-h-52 overflow-y-auto bg-slate-950/60 border border-white/10 rounded-xl p-3 space-y-1.5">
              {tableItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 italic">
                  Keine Tabellen im Dokument vorhanden.
                </div>
              ) : (
                tableItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/5 border border-white/5 text-slate-200"
                  >
                    <div>
                      <span className="font-bold text-blue-400">{item.label}</span>
                      <span className="ml-2 text-slate-300">{item.title}</span>
                    </div>
                    <span className="font-mono text-slate-400 text-[0.6875rem]">Seite {item.pageNumber}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleInsertTablesDirectory}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Tabellenverzeichnis einfügen</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Stichwortindex */}
        {activeTab === 'index' && (
          <div className="space-y-4">
            {/* Add new entry form */}
            <div className="p-3 bg-slate-950/70 border border-white/10 rounded-xl space-y-2">
              <span className="text-[0.6875rem] font-bold text-slate-300 uppercase tracking-wider block">
                Neuen Index-Eintrag festlegen
              </span>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Haupteintrag (z.B. Algorithmus)"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Untereintrag (optional)"
                  value={newSubTerm}
                  onChange={(e) => setNewSubTerm(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
                />
                <div className="flex space-x-1">
                  <input
                    type="number"
                    min={1}
                    value={newPageStr}
                    onChange={(e) => setNewPageStr(e.target.value)}
                    className="w-16 bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 font-mono text-center"
                  />
                  <button
                    type="button"
                    onClick={handleAddIndexEntry}
                    disabled={!newTerm.trim()}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center space-x-1 shadow"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Hinzufügen</span>
                  </button>
                </div>
              </div>
            </div>

            {/* List existing entries */}
            <div className="max-h-40 overflow-y-auto bg-slate-950/60 border border-white/10 rounded-xl p-2 space-y-1">
              {indexEntries.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 italic">
                  Keine Indexeinträge angelegt.
                </div>
              ) : (
                indexEntries.map((e) => (
                  <div
                    key={e.id}
                    className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs text-slate-200"
                  >
                    <div>
                      <span className="font-bold">{e.term}</span>
                      {e.pageNumbers.length > 0 && (
                        <span className="ml-2 text-slate-400 font-mono text-[0.6875rem]">
                          (S. {e.pageNumbers.join(', ')})
                        </span>
                      )}
                      {e.subEntries && e.subEntries.length > 0 && (
                        <div className="ml-3 text-[0.6875rem] text-slate-400">
                          {e.subEntries.map((s: import('../../types').WriterIndexSubEntry) => `${s.subTerm} (S. ${s.pageNumbers.join(', ')})`).join('; ')}
                        </div>
                      )}
                    </div>
                    <button aria-label="Delete index entry"
                      type="button"
                      onClick={() => handleDeleteIndexEntry(e.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleInsertSubjectIndex}
                disabled={indexEntries.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shadow-lg flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Stichwortindex einfügen</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
