// STATUS: DIAMANT VGT SUPREME — Linguistic Intelligence & Hyphenation Modal
import React, { useState, useMemo } from 'react';
import { SpellCheck, X, BookPlus, Trash2, Split, CheckCircle2 } from 'lucide-react';
import {
  addWriterCustomWord,
  analyzeParagraphLinguisticsDetailed,
  writerHyphenationPatternLanguage,
  removeWriterCustomWord,
  type LinguisticIssue,
} from './writerLinguistics';
import { hyphenateText } from '../../layout/typography/hyphenation/writerHyphenation';
import type {
  Paragraph,
  WriterHyphenationMode,
  WriterLanguageTag,
  WriterLinguisticsConfig,
} from '../../../../shared/contracts/workspace';

export interface WriterLinguisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  paragraphs: Paragraph[];
  linguistics: WriterLinguisticsConfig;
  activeParagraphId?: string;
  hasTextSelection?: boolean;
  onUpdateParagraphText: (paragraphId: string, newText: string) => void;
  onUpdateLinguistics: (config: WriterLinguisticsConfig) => void;
  onApplyLanguage: (language: WriterLanguageTag) => void;
  onSetHyphenationMode: (mode: WriterHyphenationMode) => void;
}

export const WriterLinguisticsModal: React.FC<WriterLinguisticsModalProps> = ({
  isOpen,
  onClose,
  paragraphs,
  linguistics,
  activeParagraphId,
  hasTextSelection = false,
  onUpdateParagraphText,
  onUpdateLinguistics,
  onApplyLanguage,
  onSetHyphenationMode,
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'dictionary' | 'hyphenation'>('audit');
  const [lang, setLang] = useState<WriterLanguageTag>(linguistics.defaultLanguage);
  const [newWord, setNewWord] = useState('');

  // Scan every contiguous language range with the persisted document dictionary.
  // The audit also reports which languages it could **not** check, so a clean result
  // is never presented as a check that never happened.
  const auditResults = useMemo(() => {
    const list: { paragraphId: string; paragraphIndex: number; text: string; issues: LinguisticIssue[] }[] = [];
    const unchecked = new Set<WriterLanguageTag>();
    const previewConfig: WriterLinguisticsConfig = { ...linguistics, defaultLanguage: lang };
    paragraphs.forEach((paragraph, index) => {
      const fullText = paragraph.spans.map((span) => span.text).join('');
      if (!fullText.trim()) return;
      const audit = analyzeParagraphLinguisticsDetailed(paragraph, previewConfig);
      for (const language of audit.uncheckedLanguages) unchecked.add(language);
      if (audit.issues.length > 0) list.push({ paragraphId: paragraph.id, paragraphIndex: index + 1, text: fullText, issues: audit.issues });
    });
    return { list, uncheckedLanguages: [...unchecked] };
  }, [paragraphs, lang, linguistics]);
  const auditList = auditResults.list;
  const uncheckedLanguages = auditResults.uncheckedLanguages;

  const customDict = linguistics.customDictionary;

  if (!isOpen) return null;

  const handleApplyFix = (paragraphId: string, fullText: string, issue: LinguisticIssue, replacement: string) => {
    const updated = fullText.slice(0, issue.startIndex) + replacement + fullText.slice(issue.endIndex);
    onUpdateParagraphText(paragraphId, updated);
  };

  const handleAddToDict = (word: string) => {
    onUpdateLinguistics({ ...linguistics, customDictionary: addWriterCustomWord(customDict, word) });
  };

  const handleRemoveFromDict = (word: string) => {
    onUpdateLinguistics({ ...linguistics, customDictionary: removeWriterCustomWord(customDict, word) });
  };

  const handleApplyHyphenationAll = () => {
    paragraphs.forEach((p) => {
      const fullText = p.spans.map((span) => span.text).join('');
      if (fullText.trim()) {
        const hyphenated = p.spans.map((span) => {
          // Only hyphenate with patterns that exist for the span's language. The
          // previous mapping sent everything non-German to the English patterns,
          // which is worse than leaving the text alone.
          const patternLanguage = writerHyphenationPatternLanguage(span.language ?? lang);
          if (!patternLanguage) return span.text;
          return hyphenateText(span.text, {
          language: patternLanguage,
          minLeft: 2,
          minRight: 2,
          hyphenChar: '\u00AD',
          });
        }).join('');
        onUpdateParagraphText(p.id, hyphenated);
      }
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <SpellCheck className="w-5 h-5" />
            <h3 className="text-sm font-bold text-slate-100">Linguistic Analysis & TeX Hyphenation</h3>
          </div>
          <button aria-label="Close Linguistic Analysis & TeX Hyphenation dialog"
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 border-b border-white/10 w-full pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === 'audit'
                  ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Auditergebnisse ({auditList.reduce((acc, r) => acc + r.issues.length, 0)})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dictionary')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === 'dictionary'
                  ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Benutzer-Wörterbuch ({customDict.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hyphenation')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === 'hyphenation'
                  ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Silbentrennung (TeX Liang)
            </button>
          </div>

          <div className="flex items-center space-x-1.5 ml-4">
            <span className="text-[0.6875rem] text-slate-400">Sprache:</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as WriterLanguageTag)}
              className="bg-slate-800 border border-white/10 rounded px-2 py-0.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            >
              <option value="de-DE">Deutsch (DE)</option>
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="fr-FR">Français (Tag only)</option>
            </select>
            <button
              type="button"
              onClick={() => onUpdateLinguistics({ ...linguistics, defaultLanguage: lang })}
              className="rounded bg-white/5 px-2 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              title="Standardsprache für Bereiche ohne eigenes Sprach-Tag"
            >
              Dokument
            </button>
            <button
              type="button"
              disabled={!activeParagraphId}
              onClick={() => onApplyLanguage(lang)}
              className="rounded bg-blue-600/30 px-2 py-1 text-[0.625rem] text-blue-200 hover:bg-blue-600/50 disabled:cursor-not-allowed disabled:opacity-40"
              title={hasTextSelection ? 'Sprache auf die aktuelle Auswahl anwenden' : 'Sprache auf den aktiven Absatz anwenden'}
            >
              {hasTextSelection ? 'Auswahl' : 'Absatz'} markieren
            </button>
          </div>
        </div>

        {/* Tab 1: Audit List */}
        {activeTab === 'audit' && (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {uncheckedLanguages.length > 0 && (
              <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[0.6875rem] text-amber-100 space-y-1">
                <p className="font-semibold">
                  {uncheckedLanguages.length === 1
                    ? `Für ${uncheckedLanguages[0]} gibt es kein Wörterbuch.`
                    : `Für ${uncheckedLanguages.join(', ')} gibt es kein Wörterbuch.`}
                </p>
                <p className="text-amber-200/80">
                  Diese Bereiche wurden <strong>nicht</strong> geprüft. Das Sprach-Tag bleibt erhalten und wird
                  exportiert — Rechtschreibung und Grammatik laufen dort aber nicht.
                </p>
              </div>
            )}
            {auditList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className={`w-8 h-8 mx-auto ${uncheckedLanguages.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
                <p className="text-xs font-medium text-slate-300">
                  {uncheckedLanguages.length > 0
                    ? 'Keine Auffälligkeiten in den geprüften Bereichen.'
                    : 'Keine orthographischen oder grammatischen Auffälligkeiten gefunden.'}
                </p>
                <p className="text-[0.6875rem] text-slate-500">
                  {uncheckedLanguages.length > 0
                    ? 'Die genannten Sprachen sind nicht abgedeckt, deshalb sagt dieses Ergebnis nichts über sie aus.'
                    : 'Das Dokument entspricht den linguistischen Standards der gewählten Sprache.'}
                </p>
              </div>
            ) : (
              auditList.map((res) => (
                <div key={res.paragraphId} className="p-3 bg-slate-800/60 border border-white/10 rounded-xl space-y-2">
                  <span className="text-[0.625rem] font-mono uppercase tracking-wider text-slate-400">
                    Absatz #{res.paragraphIndex}
                  </span>
                  {res.issues.map((iss, iIdx) => (
                    <div key={iIdx} className="flex items-start justify-between bg-slate-900/60 p-2.5 rounded-lg border border-white/5">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[0.625rem] font-semibold uppercase ${
                              iss.type === 'spelling' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {iss.type === 'spelling' ? 'Rechtschreibung' : 'Grammatik'}
                          </span>
                          <span className="text-xs font-semibold text-rose-300 underline decoration-rose-500/50">
                            {iss.word}
                          </span>
                        </div>
                        <p className="text-[0.6875rem] text-slate-400">{iss.message}</p>
                        {iss.suggestions.length > 0 && (
                          <div className="flex items-center space-x-1 pt-1">
                            <span className="text-[0.625rem] text-slate-500">Vorschläge:</span>
                            {iss.suggestions.map((sug: string) => (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => handleApplyFix(res.paragraphId, res.text, iss, sug)}
                                className="px-2 py-0.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-[0.6875rem] rounded transition-colors"
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddToDict(iss.word)}
                        className="px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-[0.625rem] flex items-center space-x-1"
                        title="Zu Wörterbuch hinzufügen"
                      >
                        <BookPlus className="w-3 h-3" />
                        <span>Hinzufügen</span>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Custom Dictionary */}
        {activeTab === 'dictionary' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Neues Fachwort hinzufügen..."
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (newWord.trim()) {
                    handleAddToDict(newWord.trim());
                    setNewWord('');
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
              >
                <BookPlus className="w-3.5 h-3.5" />
                <span>Wort speichern</span>
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {customDict.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Das Benutzerwörterbuch enthält noch keine Einträge.</p>
              ) : (
                customDict.map((word) => (
                  <div
                    key={word}
                    className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-xs"
                  >
                    <span className="font-mono text-slate-300">{word}</span>
                    <button aria-label="Remove dictionary word"
                      type="button"
                      onClick={() => handleRemoveFromDict(word)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Hyphenation */}
        {activeTab === 'hyphenation' && (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-slate-800/50 border border-white/10 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-blue-400">
                <Split className="w-4 h-4" />
                <h4 className="text-xs font-bold text-slate-200">TeX Liang Silbentrennungsalgorithmus</h4>
              </div>
              <p className="text-[0.6875rem] text-slate-400 leading-relaxed">
                Fügt bedingte Trennstriche (Soft-Hyphens &shy;) an den exakten morphologischen Wortfugen ein.
                Textumbruch im Blocksatz wird dadurch harmonischer und optisch ausgeglichen.
              </p>
            </div>

            <button
              type="button"
              disabled={!activeParagraphId}
              onClick={() => onSetHyphenationMode('auto')}
              className="w-full py-2.5 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2"
            >
              <Split className="w-4 h-4" />
              <span>Aktiven Absatz automatisch sprachabhängig trennen</span>
            </button>

            <button
              type="button"
              onClick={handleApplyHyphenationAll}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20"
            >
              <Split className="w-4 h-4" />
              <span>Silbentrennung auf gesamtes Dokument anwenden</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
