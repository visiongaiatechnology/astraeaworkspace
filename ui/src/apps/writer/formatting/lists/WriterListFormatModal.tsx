// STATUS: DIAMANT VGT SUPREME — Sovereign Multilevel List & Outline Configuration Modal
import React, { useState } from 'react';
import { X, ListTree, Sliders, Sparkles, BookOpen, Check } from 'lucide-react';
import type { Paragraph, ParagraphStyle } from '../../../../shared/contracts/workspace';
import type { WriterListNumberFormat, WriterListTemplate } from '../../../../shared/contracts/writer/workspaceWriterList';
import {
  BUILTIN_LIST_TEMPLATES,
  formatOrdinalNumber,
  resolveWriterListLevelGeometry,
} from './writerMultilevelList';

interface WriterListFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeParagraph?: Paragraph;
  allParagraphs: Paragraph[];
  onUpdateParagraphStyle: (patch: Partial<ParagraphStyle>) => void;
  onApplyListTemplate: (template: WriterListTemplate, isHeadingLinked?: boolean) => void;
  onToggleHeadingOutlineNumbering: (enabled: boolean) => void;
}

const QUICK_GLYPHS = ['•', '◦', '▪', '▫', '‣', '➢', '✓', '✔', '◆', '◇', '✦', '★', '➔', '➜', '※'];

export const WriterListFormatModal: React.FC<WriterListFormatModalProps> = ({
  isOpen,
  onClose,
  activeParagraph,
  allParagraphs,
  onUpdateParagraphStyle,
  onApplyListTemplate,
  onToggleHeadingOutlineNumbering,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'levels' | 'glyphs' | 'headings'>('presets');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('hierarchical_numeric');
  const [activeLevel, setActiveLevel] = useState<number>(activeParagraph?.style.list_level ?? 0);

  // Level config local state
  const currentFormat = (activeParagraph?.style.list_number_format ?? 'arabic') as WriterListNumberFormat;
  const currentStartValue = activeParagraph?.style.list_start_value ?? 1;
  const currentRestart = Boolean(activeParagraph?.style.list_restart_numbering);
  const currentListId = activeParagraph?.style.list_id ?? '';
  const currentGlyph = activeParagraph?.style.list_override_glyph ?? '';
  const currentLeftIndent = activeParagraph?.style.left_indent_mm ?? resolveWriterListLevelGeometry(activeLevel).leftIndentMm;
  const currentHangingIndent = activeParagraph?.style.hanging_indent_mm ?? resolveWriterListLevelGeometry(activeLevel).hangingIndentMm;

  const headingOutlineActive = Boolean(
    activeParagraph?.style.heading_outline_numbered ||
    allParagraphs.some((p) => p.style.heading_level && p.style.heading_outline_numbered)
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ListTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">
                Listenformatierung & Mehrstufige Hierarchie (Paket B)
              </h2>
              <p className="text-[0.6875rem] text-slate-400 font-mono">
                9 Ebenen · DIN / ISO Gliederung · Eigene Glyphen · Kapitelnummerierung
              </p>
            </div>
          </div>
          <button aria-label="Close Listenformatierung & Mehrstufige Hierarchie (Paket B) dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-white/10 bg-slate-950/40 px-6 pt-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'presets'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Vorlagen-Katalog</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('levels')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'levels'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Ebenen & Geometrie (0–8)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('glyphs')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'glyphs'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>•</span>
            <span>Benutzerdefinierte Glyphen</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headings')}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === 'headings'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Kapitelnummerierung</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto max-h-[420px] space-y-4">
          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Wählen Sie eine sovereign Vorlage für mehrstufige Listen oder wissenschaftliche Gliederungen:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {BUILTIN_LIST_TEMPLATES.map((tmpl) => {
                  const isSelected = selectedTemplateId === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      // GAP-0051, Runde 280: die Vorlage trug `cursor-pointer`
                      // und ein `onClick`, aber keinen Tastaturweg.
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTemplateId(tmpl.id);
                        }
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                          : 'border-white/10 bg-slate-950/40 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-xs text-white">{tmpl.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <p className="text-[0.6875rem] text-slate-400 font-mono mb-2">{tmpl.description}</p>
                      <div className="text-[0.625rem] text-amber-300/80 font-mono bg-slate-900/80 px-2 py-1 rounded border border-white/5 flex items-center justify-between">
                        <span>L1: {formatOrdinalNumber(1, tmpl.levels[0].numberFormat)}</span>
                        <span>L2: {formatOrdinalNumber(1, tmpl.levels[1].numberFormat)}</span>
                        <span>L3: {formatOrdinalNumber(1, tmpl.levels[2].numberFormat)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const tmpl = BUILTIN_LIST_TEMPLATES.find((t) => t.id === selectedTemplateId);
                    if (tmpl) onApplyListTemplate(tmpl, false);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                >
                  Vorlage auf aktiven Absatz anwenden
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: LEVELS & GEOMETRY */}
          {activeTab === 'levels' && (
            <div className="space-y-4">
              {/* Level Selector */}
              <div>
                <label className="block text-[0.6875rem] font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Listenebene wählen (0–8, DIN 9 Ebenen)
                </label>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setActiveLevel(lvl);
                        onUpdateParagraphStyle({ list_level: lvl });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                        activeLevel === lvl
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      Ebene {lvl + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Number Format Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.6875rem] text-slate-400 mb-1">Nummernformat</label>
                  <select
                    value={currentFormat}
                    onChange={(e) => onUpdateParagraphStyle({ list_number_format: e.target.value as WriterListNumberFormat })}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 hover:border-amber-500/40"
                  >
                    <option value="arabic">Arabisch (1, 2, 3)</option>
                    <option value="leading_zero">Führende Null (01, 02, 03)</option>
                    <option value="alpha_lower">Kleinbuchstaben (a, b, c)</option>
                    <option value="alpha_upper">Großbuchstaben (A, B, C)</option>
                    <option value="roman_lower">Römisch klein (i, ii, iii)</option>
                    <option value="roman_upper">Römisch groß (I, II, III)</option>
                    <option value="bullet_disc">Bullet: Vollkreis (•)</option>
                    <option value="bullet_circle">Bullet: Hohlkreis (◦)</option>
                    <option value="bullet_square">Bullet: Quadrat (▪)</option>
                    <option value="bullet_arrow">Bullet: Pfeil (‣)</option>
                    <option value="bullet_check">Bullet: Häkchen (✓)</option>
                    <option value="bullet_diamond">Bullet: Diamant (◆)</option>
                    <option value="custom_glyph">Benutzerdefinierte Glyphe</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[0.6875rem] text-slate-400 mb-1">Startwert (Beliebige Zahl)</label>
                  <input
                    type="number"
                    min={1}
                    max={999999}
                    value={currentStartValue}
                    onChange={(e) => onUpdateParagraphStyle({ list_start_value: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 font-mono"
                  />
                </div>
              </div>

              {/* Restart Numbering & List ID */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="restart-cb"
                    checked={currentRestart}
                    onChange={(e) => onUpdateParagraphStyle({ list_restart_numbering: e.target.checked })}
                    className="rounded bg-slate-950 border-white/20 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="restart-cb" className="text-xs text-slate-300 cursor-pointer">
                    Nummerierung neu starten (Reset)
                  </label>
                </div>

                <div>
                  <label className="block text-[0.6875rem] text-slate-400 mb-1">Listen-ID (Scoping)</label>
                  <input
                    type="text"
                    placeholder="e.g. list_main"
                    value={currentListId}
                    onChange={(e) => onUpdateParagraphStyle({ list_id: e.target.value.trim() || undefined })}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 font-mono"
                  />
                </div>
              </div>

              {/* Geometry Controls (mm) */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <div>
                  <label className="block text-[0.6875rem] text-slate-400 mb-1">
                    Linker Einzug ({currentLeftIndent.toFixed(2)} mm)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={1}
                    value={currentLeftIndent}
                    onChange={(e) => onUpdateParagraphStyle({ left_indent_mm: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[0.6875rem] text-slate-400 mb-1">
                    Hängender Einzug ({currentHangingIndent.toFixed(2)} mm)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={0.5}
                    value={currentHangingIndent}
                    onChange={(e) => onUpdateParagraphStyle({ hanging_indent_mm: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM GLYPHS */}
          {activeTab === 'glyphs' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-400">
                Wählen Sie ein Unicode-Symbol oder tippen Sie ein beliebiges Zeichen als Aufzählungszeichen ein:
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_GLYPHS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onUpdateParagraphStyle({ list_override_glyph: g, list_style: 'bullet' })}
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base transition-all ${
                      currentGlyph === g
                        ? 'border-amber-400 bg-amber-400/20 text-white font-bold'
                        : 'border-white/10 bg-slate-950/60 hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-white/10">
                <label className="block text-[0.6875rem] text-slate-400 mb-1">
                  Eigenes Unicode-Zeichen oder Text-Glyphe
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={10}
                    value={currentGlyph}
                    onChange={(e) => onUpdateParagraphStyle({ list_override_glyph: e.target.value, list_style: 'bullet' })}
                    placeholder="z.B. ✦, ➤, ➔ oder 01"
                    className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 w-48 font-mono"
                  />
                  <span className="text-xs text-slate-400 font-mono">
                    Vorschau: {currentGlyph || '•'} Beispieltext
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HEADINGS OUTLINE */}
          {activeTab === 'headings' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-slate-300 space-y-2">
                <span className="font-semibold text-blue-300 block">
                  Wissenschaftliche & Dokumentenweite Kapitelnummerierung
                </span>
                <p className="text-slate-400 text-[0.6875rem] leading-relaxed">
                  Verknüpft Überschriften (Heading 1 bis Heading 6) automatisch mit einer hierarchischen Zählung
                  (z. B. 1. Einleitung, 1.1 Methodik, 1.1.1 Versuchsaufbau).
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-slate-950/40">
                <div>
                  <div className="text-xs font-medium text-white">Kapitelnummerierung aktivieren</div>
                  <div className="text-[0.6875rem] text-slate-400">Gilt für alle Überschriften des Dokuments</div>
                </div>
                <input
                  type="checkbox"
                  checked={headingOutlineActive}
                  onChange={(e) => onToggleHeadingOutlineNumbering(e.target.checked)}
                  className="rounded bg-slate-950 border-white/20 text-blue-500 focus:ring-0 cursor-pointer w-4 h-4"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const tmpl = BUILTIN_LIST_TEMPLATES[0];
                    onApplyListTemplate(tmpl, true);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                >
                  DIN Kapitelgliederung (1., 1.1., 1.1.1.) anwenden
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-slate-950/60 text-xs">
          <span className="text-slate-500 font-mono text-[0.6875rem]">
            Paket B · VGT Diamant Supreme Architecture
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
