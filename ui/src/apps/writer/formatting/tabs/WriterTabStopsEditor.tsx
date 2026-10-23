// STATUS: DIAMANT VGT SUPREME — Modular tab-stop configuration editor
import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WriterTabAlignment, WriterTabLeader, WriterTabStop } from '../../../../shared/contracts/workspace';
import {
  createWriterTabStop,
  normalizeWriterTabStops,
  WRITER_MAX_TAB_STOPS,
} from './writerTabStops';

interface WriterTabStopsEditorProps {
  value: WriterTabStop[];
  onChange: (value: WriterTabStop[]) => void;
}

export const WriterTabStopsEditor: React.FC<WriterTabStopsEditorProps> = ({ value, onChange }) => {
  const stops = useMemo(() => normalizeWriterTabStops(value), [value]);
  const [newPositionMm, setNewPositionMm] = useState(25);
  const update = (id: string, patch: Partial<WriterTabStop>) => {
    onChange(normalizeWriterTabStops(stops.map((stop) => stop.id === id ? { ...stop, ...patch } : stop)));
  };

  return (
    <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.625rem] font-bold uppercase tracking-wider text-cyan-400">Tabstopps</span>
        <div className="flex items-center gap-1.5">
          <label className="text-[0.625rem] text-slate-400">Position (mm)
            <input type="number" min={1} max={500} step={1} value={newPositionMm}
              onChange={(event) => setNewPositionMm(Number(event.target.value))}
              className="ml-1.5 w-16 bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-slate-100" />
          </label>
          <button type="button" disabled={stops.length >= WRITER_MAX_TAB_STOPS}
            onClick={() => onChange(normalizeWriterTabStops([...stops, createWriterTabStop(newPositionMm)]))}
            className="inline-flex items-center gap-1 rounded bg-cyan-500/15 border border-cyan-400/20 px-2 py-1 text-[0.625rem] text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40">
            <Plus className="w-3 h-3" /> Hinzufügen
          </button>
        </div>
      </div>
      {stops.length === 0 ? (
        <p className="text-[0.625rem] text-slate-500">Keine eigenen Stopps; Tab verwendet 12,7-mm-Standardintervalle.</p>
      ) : (
        <div className="space-y-1.5">
          {stops.map((stop) => (
            <div key={stop.id} className="grid grid-cols-[72px_1fr_1fr_58px_auto] items-center gap-1.5">
              <input aria-label="Tabstoppposition" type="number" min={1} max={500} step={0.5} value={stop.positionMm}
                onChange={(event) => update(stop.id, { positionMm: Number(event.target.value) })}
                className="bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-100" />
              <select aria-label="Tabstoppausrichtung" value={stop.alignment}
                onChange={(event) => update(stop.id, { alignment: event.target.value as WriterTabAlignment })}
                className="bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-100">
                <option value="left">Links</option><option value="right">Rechts</option>
                <option value="center">Zentriert</option><option value="decimal">Dezimal</option>
              </select>
              <select aria-label="Tabstoppfüllzeichen" value={stop.leader}
                onChange={(event) => update(stop.id, { leader: event.target.value as WriterTabLeader })}
                className="bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-100">
                <option value="none">Ohne</option><option value="dots">Punkte</option>
                <option value="dashes">Striche</option><option value="underline">Linie</option>
              </select>
              <select aria-label="Dezimaltrennzeichen" value={stop.decimalCharacter ?? '.'} disabled={stop.alignment !== 'decimal'}
                onChange={(event) => update(stop.id, { decimalCharacter: event.target.value === ',' ? ',' : '.' })}
                className="bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-[0.625rem] text-slate-100 disabled:opacity-40">
                <option value=".">Punkt</option><option value=",">Komma</option>
              </select>
              <button type="button" aria-label={`Tabstopp ${stop.positionMm} mm löschen`}
                onClick={() => onChange(stops.filter((candidate) => candidate.id !== stop.id))}
                className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
