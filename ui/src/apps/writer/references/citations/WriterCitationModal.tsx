// STATUS: DIAMANT VGT SUPREME
import React, { useState } from 'react';
import { WriterCitationSource, CitationStyle } from '../../types';
import { X, Plus, BookOpen } from 'lucide-react';
import { formatCitationText, formatBibliographyEntry } from '../../utils/writerUtils';

export interface WriterCitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: WriterCitationSource[];
  onAddSource: (src: WriterCitationSource) => void;
  onInsertCitation: (citationText: string, sourceId: string) => void;
  onGenerateBibliography: (entries: string[]) => void;
}

export const WriterCitationModal: React.FC<WriterCitationModalProps> = ({
  isOpen,
  onClose,
  sources,
  onAddSource,
  onInsertCitation,
  onGenerateBibliography,
}) => {
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('APA');
  const [selectedSourceId, setSelectedSourceId] = useState<string>(sources[0]?.id || '');
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [newAuthor, setNewAuthor] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newJournal, setNewJournal] = useState('');

  if (!isOpen) return null;

  const handleSaveSource = () => {
    if (!newAuthor.trim() || !newTitle.trim()) return;
    const src: WriterCitationSource = {
      id: `src_${Date.now()}`,
      type: 'article',
      author: newAuthor.trim(),
      title: newTitle.trim(),
      year: newYear.trim() || String(new Date().getFullYear()),
      journal: newJournal.trim() || undefined,
    };
    onAddSource(src);
    setSelectedSourceId(src.id);
    setIsAddingSource(false);
    setNewAuthor('');
    setNewTitle('');
    setNewYear('');
    setNewJournal('');
  };

  const handleInsert = () => {
    const src = sources.find((s) => s.id === selectedSourceId);
    if (!src) return;
    const text = formatCitationText({ id: `cit_${Date.now()}`, sourceId: src.id }, src, citationStyle);
    onInsertCitation(text, src.id);
    onClose();
  };

  const handleGenerateBib = () => {
    const entries = sources.map((s, idx) => formatBibliographyEntry(s, citationStyle, idx + 1));
    onGenerateBibliography(entries);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <BookOpen className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Citations & Scientific References</h3>
          </div>
          <button aria-label="Close Citations & Scientific References dialog" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Style Selector */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-white/10 text-xs">
          <span className="text-slate-400">Citation Style:</span>
          <div className="flex space-x-1">
            {(['APA', 'MLA', 'Chicago', 'IEEE', 'ISO690'] as CitationStyle[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setCitationStyle(st)}
                className={`px-2 py-1 rounded text-[0.6875rem] font-medium transition-colors ${
                  citationStyle === st ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Source List or Add Form */}
        {isAddingSource ? (
          <div className="space-y-2.5 p-3 rounded-xl bg-slate-950/70 border border-white/10">
            <h4 className="text-xs font-bold text-blue-300">Add New Bibliographic Source</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Author (e.g. Shannon, C. E.)"
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Year (e.g. 1948)"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
              />
            </div>
            <input
              type="text"
              placeholder="Title of Work / Article"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Journal / Publisher / Book Title"
              value={newJournal}
              onChange={(e) => setNewJournal(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            />
            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingSource(false)}
                className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSource}
                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Save Source
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Document Sources ({sources.length})</label>
              <button
                type="button"
                onClick={() => setIsAddingSource(true)}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Source</span>
              </button>
            </div>

            {/* GAP-0052, Runde 289: die Quellenliste ist eine Auswahlliste. Ohne
                `role="listbox"` waeren die Zeilen darunter fuer einen Screenreader
                zusammenhanglos und ihr `aria-selected` ohne Bezug. */}
            <div role="listbox" aria-label="Document sources" className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {sources.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No citation sources yet. Click "Add Source" to add references.
                </div>
              ) : (
                sources.map((src) => (
                  <div
                    key={src.id}
                    // GAP-0052, Runde 289: die Quellenzeile war ein `<div>` mit
                    // `onClick` — `cursor-pointer` und sonst nichts. Welche Quelle
                    // in die Literaturliste geht, war damit Maus-only.
                    role="option"
                    tabIndex={0}
                    aria-selected={selectedSourceId === src.id}
                    onClick={() => setSelectedSourceId(src.id)}
                    onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      // Die Leertaste scrollt von sich aus.
                      event.preventDefault();
                      setSelectedSourceId(src.id);
                    }}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedSourceId === src.id
                        ? 'border-blue-500 bg-blue-500/15 text-white'
                        : 'border-white/5 bg-slate-950/60 text-slate-300 hover:border-white/10'
                    }`}
                  >
                    <div className="font-semibold text-slate-100">{src.author} ({src.year})</div>
                    <div className="text-[0.6875rem] text-slate-400 italic truncate">{src.title}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={handleGenerateBib}
            disabled={sources.length === 0}
            className="px-3 py-1.5 rounded-xl border border-white/10 bg-slate-950 text-xs text-slate-300 hover:text-white disabled:opacity-50"
          >
            Insert Bibliography
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!selectedSourceId}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
          >
            Insert In-text Citation
          </button>
        </div>
      </div>
    </div>
  );
};
