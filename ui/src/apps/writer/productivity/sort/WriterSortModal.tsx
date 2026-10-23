// STATUS: DIAMANT VGT SUPREME — Accessible paragraph and list sorting workflow
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, X } from 'lucide-react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import {
  resolveWriterSortRange,
  type WriterSortDataType,
  type WriterSortDirection,
  type WriterSortKeySeparator,
  type WriterSortOptions,
} from '../../formatting/sorting/writerSort';

interface WriterSortModalProps {
  isOpen: boolean;
  paragraphs: Paragraph[];
  activeParagraphId: string | null;
  boundaryParagraphIds: string[];
  locale: string;
  onClose: () => void;
  onApply: (options: WriterSortOptions) => void;
}

export const WriterSortModal: React.FC<WriterSortModalProps> = ({
  isOpen,
  paragraphs,
  activeParagraphId,
  boundaryParagraphIds,
  locale,
  onClose,
  onApply,
}) => {
  const [dataType, setDataType] = useState<WriterSortDataType>('text');
  const [direction, setDirection] = useState<WriterSortDirection>('ascending');
  const [keySeparator, setKeySeparator] = useState<WriterSortKeySeparator>('whole');
  const [keyIndex, setKeyIndex] = useState(1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const range = useMemo(
    () => resolveWriterSortRange(paragraphs, activeParagraphId, boundaryParagraphIds),
    [activeParagraphId, boundaryParagraphIds, paragraphs],
  );

  useEffect(() => {
    if (!isOpen) return;
    setDataType('text');
    setDirection('ascending');
    setKeySeparator('whole');
    setKeyIndex(1);
    setCaseSensitive(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const apply = () => {
    if (!range.sortable) return;
    onApply({ dataType, direction, keySeparator, keyIndex, caseSensitive, locale });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="writer-sort-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d1424] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <ArrowDownAZ className="h-4 w-4 text-cyan-400" />
            <h3 id="writer-sort-title" className="text-sm font-semibold text-white">Absätze und Listen sortieren</h3>
          </div>
          <button type="button" aria-label="Sortierdialog schließen" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
            <p className="text-[0.625rem] font-bold uppercase tracking-wider text-cyan-400">Erkannter Bereich</p>
            <p className="mt-1 text-sm text-slate-100">{range.label}</p>
            <p className="mt-1 text-xs text-slate-400">
              {range.sortable
                ? `${range.unitCount} Sortiereinheiten · ${range.paragraphCount} Absätze. Untergeordnete Listeneinträge bleiben bei ihrem Elterneintrag.`
                : range.reason}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[0.6875rem] text-slate-400">Datentyp
              <select value={dataType} onChange={(event) => setDataType(event.target.value as WriterSortDataType)} className="block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70">
                <option value="text">Text</option>
                <option value="number">Zahl</option>
                <option value="date">Datum</option>
              </select>
            </label>
            <label className="space-y-1 text-[0.6875rem] text-slate-400">Reihenfolge
              <select value={direction} onChange={(event) => setDirection(event.target.value as WriterSortDirection)} className="block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70">
                <option value="ascending">Aufsteigend</option>
                <option value="descending">Absteigend</option>
              </select>
            </label>
            <label className="space-y-1 text-[0.6875rem] text-slate-400">Sortierschlüssel
              <select value={keySeparator} onChange={(event) => setKeySeparator(event.target.value as WriterSortKeySeparator)} className="block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70">
                <option value="whole">Gesamter Absatz</option>
                <option value="tab">Tabulator-Feld</option>
                <option value="comma">Komma-Feld</option>
                <option value="semicolon">Semikolon-Feld</option>
              </select>
            </label>
            <label className="space-y-1 text-[0.6875rem] text-slate-400">Feldnummer
              <input type="number" min={1} max={16} step={1} value={keyIndex} disabled={keySeparator === 'whole'} onChange={(event) => setKeyIndex(Math.max(1, Math.min(16, Math.trunc(Number(event.target.value) || 1))))} className="block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-40 focus:border-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70" />
            </label>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-white/5 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
            <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} className="accent-cyan-500" />
            Groß-/Kleinschreibung unterscheiden
          </label>
          <p className="text-[0.6875rem] leading-relaxed text-slate-500">
            Leere oder für den gewählten Datentyp ungültige Werte bleiben stabil am Ende. Überschriften, Seitenumbrüche und Abschnittsanfänge werden nie verschoben.
          </p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Abbrechen</button>
          <button type="button" onClick={apply} disabled={!range.sortable} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Sortieren</button>
        </footer>
      </section>
    </div>
  );
};
