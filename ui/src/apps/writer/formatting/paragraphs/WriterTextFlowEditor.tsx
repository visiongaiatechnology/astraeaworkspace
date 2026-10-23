// STATUS: DIAMANT VGT SUPREME — Accessible paragraph direction and line-flow controls
import React from 'react';
import type {
  WriterHyphenationMode,
  WriterLineBreakMode,
  WriterParagraphDirection,
} from '../../../../shared/contracts/workspace';
import type { WriterTextFlowSettings } from '../../layout/text-flow/writerTextFlow';

interface WriterTextFlowEditorProps {
  value: WriterTextFlowSettings;
  onChange: (value: WriterTextFlowSettings) => void;
}

export const WriterTextFlowEditor: React.FC<WriterTextFlowEditorProps> = ({ value, onChange }) => (
  <div className="space-y-3 rounded-xl border border-white/5 bg-slate-950/60 p-3">
    <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-teal-400">
      Schreibrichtung & Zeilenfluss
    </span>
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <label className="text-[0.625rem] text-slate-400">Absatzrichtung
        <select
          aria-label="Absatzrichtung"
          value={value.textDirection}
          onChange={(event) => onChange({ ...value, textDirection: event.target.value as WriterParagraphDirection })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 focus:border-teal-400"
        >
          <option value="auto">Automatisch</option>
          <option value="ltr">Links nach rechts</option>
          <option value="rtl">Rechts nach links</option>
        </select>
      </label>
      <label className="text-[0.625rem] text-slate-400">Zeilenumbruch
        <select
          aria-label="Zeilenumbruchregel"
          value={value.lineBreakMode}
          onChange={(event) => onChange({ ...value, lineBreakMode: event.target.value as WriterLineBreakMode })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 focus:border-teal-400"
        >
          <option value="break-word">Lange Wörter umbrechen</option>
          <option value="normal">Nur Wortgrenzen</option>
          <option value="anywhere">An jeder Position</option>
          <option value="keep-all">CJK zusammenhalten</option>
        </select>
      </label>
      <label className="text-[0.625rem] text-slate-400">Trennstellen
        <select
          aria-label="Trennstellenregel"
          value={value.hyphenationMode}
          onChange={(event) => onChange({ ...value, hyphenationMode: event.target.value as WriterHyphenationMode })}
          className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 focus:border-teal-400"
        >
          <option value="auto">Automatisch sprachabhängig</option>
          <option value="manual">Manuelle Soft-Hyphens</option>
          <option value="none">Keine Trennung</option>
        </select>
      </label>
    </div>
    <p className="text-[0.625rem] leading-relaxed text-slate-500">
      „Automatisch“ nutzt das erste starke Unicode-Zeichen. Steuerzeichen werden nicht erzeugt; gemischter Text bleibt als isolierter Klartextabsatz behandelt.
    </p>
  </div>
);
