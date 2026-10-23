// STATUS: DIAMANT VGT SUPREME — Sovereign Footnote & Endnote Modal
import React, { useState } from 'react';
import { X, Hash } from 'lucide-react';
import type { WriterFootnoteType, WriterNoteNumberFormat } from '../../types';

export interface WriterFootnoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertFootnote: (
    text: string,
    options?: {
      noteType?: WriterFootnoteType;
      numberFormat?: WriterNoteNumberFormat;
      customMark?: string;
    }
  ) => void;
}

export const WriterFootnoteModal: React.FC<WriterFootnoteModalProps> = ({
  isOpen,
  onClose,
  onInsertFootnote,
}) => {
  const [footnoteText, setFootnoteText] = useState('');
  const [noteType, setNoteType] = useState<WriterFootnoteType>('footnote');
  const [numberFormat, setNumberFormat] = useState<WriterNoteNumberFormat>('arabic');
  const [customMark, setCustomMark] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Hash className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">
              {noteType === 'footnote' ? 'Fußnote einfügen (Seitenende)' : 'Endnote einfügen (Dokumentende)'}
            </h3>
          </div>
          <button aria-label="Close Writer Footnote dialog" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Note Type Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => {
              setNoteType('footnote');
              setNumberFormat('arabic');
            }}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              noteType === 'footnote'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Fußnote (Seitenende)
          </button>
          <button
            type="button"
            onClick={() => {
              setNoteType('endnote');
              setNumberFormat('roman');
            }}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              noteType === 'endnote'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Endnote (Dokumentende)
          </button>
        </div>

        {/* Number Format & Custom Mark */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[0.6875rem] font-semibold text-slate-400">Nummerierungsformat</label>
            <select
              value={numberFormat}
              onChange={(e) => setNumberFormat(e.target.value as WriterNoteNumberFormat)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 font-mono"
            >
              <option value="arabic">Arabisch (1, 2, 3...)</option>
              <option value="roman">Römisch (i, ii, iii...)</option>
              <option value="alpha">Buchstaben (a, b, c...)</option>
              <option value="symbol">Symbole (*, †, ‡...)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[0.6875rem] font-semibold text-slate-400">Benutzerdefiniertes Symbol</label>
            <input
              type="text"
              maxLength={4}
              value={customMark}
              onChange={(e) => setCustomMark(e.target.value)}
              placeholder="z.B. *"
              className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 font-mono text-center"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Inhalt / Erläuterung der Note</label>
          <textarea
            rows={3}
            value={footnoteText}
            onChange={(e) => setFootnoteText(e.target.value)}
            placeholder="Details, Beleg oder Referenztext..."
            className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          />
        </div>
        <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white">
            Abbrechen
          </button>
          <button
            onClick={() => {
              if (footnoteText.trim()) {
                onInsertFootnote(footnoteText.trim(), {
                  noteType,
                  numberFormat,
                  customMark: customMark.trim() || undefined,
                });
                setFootnoteText('');
                setCustomMark('');
                onClose();
              }
            }}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md"
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  );
};
