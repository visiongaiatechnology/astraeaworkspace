// STATUS: PLATIN — Persisted Writer AutoCorrect configuration surface
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { WriterAutoCorrectConfig } from '../../../../shared/contracts/workspace';
import {
  normalizeWriterAutoCorrectConfig,
  WRITER_AUTOCORRECT_MAX_RULES,
  WRITER_AUTOCORRECT_MAX_REPLACEMENT_LENGTH,
  WRITER_AUTOCORRECT_MAX_TRIGGER_LENGTH,
  writerAutoCorrectRuleError,
} from '../../formatting/autocorrect/writerAutoCorrect';

interface WriterAutoCorrectModalProps {
  isOpen: boolean;
  config: WriterAutoCorrectConfig;
  onClose: () => void;
  onSave: (config: WriterAutoCorrectConfig) => void;
}

export const WriterAutoCorrectModal: React.FC<WriterAutoCorrectModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<WriterAutoCorrectConfig>(() => normalizeWriterAutoCorrectConfig(config));
  const [trigger, setTrigger] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(normalizeWriterAutoCorrectConfig(config));
    setTrigger('');
    setReplacement('');
    setCaseSensitive(false);
  }, [config, isOpen]);

  const validationError = useMemo(
    () => trigger ? writerAutoCorrectRuleError(trigger, replacement, draft.replacements) : null,
    [draft.replacements, replacement, trigger],
  );
  const ruleLimitReached = draft.replacements.length >= WRITER_AUTOCORRECT_MAX_RULES;

  if (!isOpen) return null;

  const addRule = () => {
    const error = writerAutoCorrectRuleError(trigger, replacement, draft.replacements);
    if (error || ruleLimitReached) return;
    setDraft((current) => ({
      ...current,
      replacements: [
        ...current.replacements,
        { id: crypto.randomUUID(), trigger, replacement, caseSensitive },
      ],
    }));
    setTrigger('');
    setReplacement('');
    setCaseSensitive(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="writer-autocorrect-title"
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="writer-autocorrect-title" className="text-base font-semibold text-white">AutoCorrect & AutoFormat</h2>
            <p className="mt-1 text-xs text-slate-400">Dokumentbezogene, lokal gespeicherte Eingaberegeln</p>
          </div>
          <button type="button" onClick={onClose} aria-label="AutoCorrect schließen" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:ring-2 focus:ring-blue-500">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto p-5">
          <fieldset className="grid gap-3 rounded-xl border border-white/10 bg-slate-900/55 p-4 md:grid-cols-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-300">Automatik</legend>
            {[
              ['enabled', 'AutoCorrect aktiv', 'Regeln während der Texteingabe anwenden'],
              ['smartQuotes', 'Intelligente Anführungszeichen', 'Öffnende und schließende Zeichen kontextabhängig setzen'],
              ['autoFormat', 'Typografisches AutoFormat', '…, ©, ®, ™ und Pfeile automatisch erzeugen'],
            ].map(([key, label, description]) => (
              <label key={key} className="flex cursor-pointer gap-3 rounded-lg border border-white/5 bg-slate-950/50 p-3 hover:border-blue-500/40">
                <input
                  type="checkbox"
                  checked={draft[key as 'enabled' | 'smartQuotes' | 'autoFormat']}
                  onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-blue-500"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-200">{label}</span>
                  <span className="mt-1 block text-[0.625rem] leading-relaxed text-slate-500">{description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="block max-w-xs text-xs font-semibold text-slate-300">
            Sprache der Anführungszeichen
            <select
              value={draft.locale}
              onChange={(event) => setDraft((current) => ({ ...current, locale: event.target.value as WriterAutoCorrectConfig['locale'] }))}
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="de-DE">Deutsch („…“ / ‚…‘)</option>
              <option value="en-US">English (“…” / ‘…’)</option>
            </select>
          </label>

          <section aria-labelledby="writer-replacements-title" className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 id="writer-replacements-title" className="text-sm font-semibold text-white">Konfigurierbare Ersetzungen</h3>
                <p className="text-[0.6875rem] text-slate-500">Wortregeln werden am Wortende, Symbolregeln direkt nach dem Auslöser angewendet.</p>
              </div>
              <span className="font-mono text-[0.625rem] text-slate-500">{draft.replacements.length}/{WRITER_AUTOCORRECT_MAX_RULES}</span>
            </div>

            <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/55 p-3 md:grid-cols-[1fr_1.4fr_auto]">
              <input
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
                maxLength={WRITER_AUTOCORRECT_MAX_TRIGGER_LENGTH}
                aria-label="AutoCorrect-Auslöser"
                placeholder="Auslöser, z. B. mfg"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 placeholder:text-slate-600 focus:border-blue-500"
              />
              <input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                maxLength={WRITER_AUTOCORRECT_MAX_REPLACEMENT_LENGTH}
                aria-label="AutoCorrect-Ersetzung"
                placeholder="Ersetzung"
                className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 placeholder:text-slate-600 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={addRule}
                disabled={!trigger || Boolean(validationError) || ruleLimitReached}
                className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Regel
              </button>
              <label className="flex items-center gap-2 text-[0.6875rem] text-slate-400 md:col-span-3">
                <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} className="h-3.5 w-3.5 accent-blue-500" />
                Groß-/Kleinschreibung beachten
              </label>
              {validationError && <p role="alert" className="text-[0.6875rem] text-amber-300 md:col-span-3">{validationError}</p>}
            </div>

            <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10">
              {draft.replacements.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">Keine benutzerdefinierten Ersetzungen gespeichert.</p>
              ) : draft.replacements.map((rule) => (
                <div key={rule.id} className="grid grid-cols-[1fr_auto_1.4fr_auto] items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0">
                  <code className="truncate text-xs text-cyan-300">{rule.trigger}</code>
                  <span className="text-slate-600" aria-hidden="true">→</span>
                  <span className="truncate text-xs text-slate-200">{rule.replacement || '∅'}</span>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, replacements: current.replacements.filter((candidate) => candidate.id !== rule.id) }))}
                    aria-label={`Ersetzungsregel ${rule.trigger} löschen`}
                    className="rounded p-1.5 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 focus:ring-2 focus:ring-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:ring-2 focus:ring-slate-500">Abbrechen</button>
          <button type="button" onClick={() => { onSave(normalizeWriterAutoCorrectConfig(draft)); onClose(); }} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:ring-2 focus:ring-blue-400">Einstellungen speichern</button>
        </footer>
      </section>
    </div>
  );
};
