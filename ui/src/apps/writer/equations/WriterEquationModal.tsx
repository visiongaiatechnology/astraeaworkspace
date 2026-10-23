// STATUS: DIAMANT VGT SUPREME — Sovereign Mathematical Formula Editor Modal with MathML & Symbol Palettes
import React, { useEffect, useMemo, useState } from 'react';
import { X, Sigma, Check, Sparkles, Code2 } from 'lucide-react';
import type { WriterEquationBlockData } from '../../../shared/contracts/workspace';
import {
  EQUATION_SYMBOL_PALETTES,
  equationMarkupToLatex,
  latexToMathML,
} from '../editor/blocks/equations/writerEquationEngine';
import { renderEquationReact } from './WriterEquationRender';

interface WriterEquationModalProps {
  isOpen: boolean;
  equation: WriterEquationBlockData | null;
  onClose: () => void;
  onSave: (equation: WriterEquationBlockData) => void;
}

const COMMON_PRESETS = [
  { label: 'Relativität', latex: 'E = mc^2' },
  { label: 'Mitternachtsformel', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Eulersche Identität', latex: 'e^{i\\pi} + 1 = 0' },
  { label: 'Gauß-Integral', latex: '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}' },
  { label: 'Pythagoras', latex: 'a^2 + b^2 = c^2' },
  { label: 'Taylor-Reihe', latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x-a)^n' },
];

export const WriterEquationModal: React.FC<WriterEquationModalProps> = ({
  isOpen,
  equation,
  onClose,
  onSave,
}) => {
  const [latexInput, setLatexInput] = useState('');
  const [captionInput, setCaptionInput] = useState('');
  const [displayMode, setDisplayMode] = useState(true);
  const [showMathML, setShowMathML] = useState(false);
  const [showMarkupImport, setShowMarkupImport] = useState(false);
  const [markupInput, setMarkupInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'structure' | 'greek' | 'operator' | 'calculus'>('all');

  useEffect(() => {
    if (!isOpen || !equation) return;
    setLatexInput(equation.latex);
    setCaptionInput(equation.caption || '');
    setDisplayMode(equation.displayMode ?? true);
    setMarkupInput('');
    setValidationError(null);
  }, [equation, isOpen]);

  const preview = useMemo(() => {
    try {
      const latex = latexInput.trim() || 'f(x) = y';
      return { view: renderEquationReact(latex), mathml: latexToMathML(latex), error: null as string | null };
    } catch (error) {
      return {
        view: <span className="text-red-300">Ungültige Formel</span>,
        mathml: '',
        error: error instanceof Error ? error.message : 'Ungültige Formelstruktur.',
      };
    }
  }, [latexInput]);

  if (!isOpen || !equation) return null;

  const handleInsertSymbol = (latexCmd: string) => {
    setLatexInput((prev) => `${prev} ${latexCmd}`.trim());
    setValidationError(null);
  };

  const handleImportMarkup = () => {
    try {
      const imported = equationMarkupToLatex(markupInput.trim());
      if (!imported) throw new Error('Formel-Markup enthält keinen unterstützten mathematischen Inhalt.');
      setLatexInput(imported);
      setValidationError(null);
      setShowMarkupImport(false);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'MathML/OMML konnte nicht importiert werden.');
    }
  };

  const handleApply = () => {
    try {
      const latex = latexInput.trim() || 'f(x) = y';
      const mathml = latexToMathML(latex, displayMode);
      onSave({
        ...equation,
        latex,
        caption: captionInput.trim() || undefined,
        displayMode,
        mathml,
      });
      setValidationError(null);
      onClose();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Formel konnte nicht gespeichert werden.');
    }
  };

  const filteredSymbols = activeCategory === 'all'
    ? EQUATION_SYMBOL_PALETTES
    : EQUATION_SYMBOL_PALETTES.filter((s) => s.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <Sigma className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Formeleditor (LaTeX & MathML)</h2>
          </div>
          <button aria-label="Close Formeleditor (LaTeX & MathML) dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5 text-xs">
          {/* Typographic Live Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-semibold text-slate-300">Typografische Vorschau (Native Rendering)</span>
              <button
                type="button"
                onClick={() => setShowMathML(!showMathML)}
                className="text-[0.6875rem] text-blue-400 hover:text-blue-300 flex items-center space-x-1"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{showMathML ? 'MathML ausblenden' : 'MathML anzeigen'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowMarkupImport((value) => !value); setValidationError(null); }}
                className="text-[0.6875rem] text-violet-400 hover:text-violet-300 flex items-center space-x-1"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>MathML/OMML importieren</span>
              </button>
            </div>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 min-h-[70px] flex items-center justify-center shadow-inner">
              <div>{preview.view}</div>
            </div>
            {showMathML && (
              <pre className="p-3 bg-slate-950/90 border border-slate-800 rounded-xl text-[0.625rem] font-mono text-emerald-400 overflow-x-auto select-all">
                {preview.mathml}
              </pre>
            )}
            {showMarkupImport && (
              <div className="space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <label className="block text-[0.6875rem] font-semibold text-violet-200">W3C MathML oder Office MathML (OMML)</label>
                <textarea
                  rows={4}
                  value={markupInput}
                  onChange={(event: { target: { value: string } }) => setMarkupInput(event.target.value.slice(0, 262_144))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-[0.625rem] text-violet-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-violet-500"
                  placeholder="<math ...>...</math> oder <m:oMath ...>...</m:oMath>"
                />
                <div className="flex justify-end">
                  <button type="button" onClick={handleImportMarkup} className="rounded-lg bg-violet-600 px-3 py-1.5 text-[0.625rem] font-semibold text-white hover:bg-violet-500">
                    Markup übernehmen
                  </button>
                </div>
              </div>
            )}
            {(validationError || preview.error) && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.6875rem] text-red-200">
                {validationError ?? preview.error}
              </div>
            )}
          </div>

          {/* Symbol Palettes Filter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">Mathematische Symbolpalette</span>
              <div className="flex items-center space-x-1 text-[0.6875rem]">
                {(['all', 'structure', 'calculus', 'greek', 'operator'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2 py-0.5 rounded capitalize transition-colors ${
                      activeCategory === cat ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {cat === 'all' ? 'Alle' : cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded-xl max-h-36 overflow-y-auto">
              {filteredSymbols.map((sym) => (
                <button
                  key={sym.label}
                  type="button"
                  onClick={() => handleInsertSymbol(sym.latex)}
                  className="p-1.5 rounded-lg border border-slate-800 hover:border-blue-500/50 bg-slate-900 hover:bg-blue-500/10 text-slate-200 hover:text-white flex flex-col items-center justify-center transition-all group"
                  title={`${sym.label} (${sym.latex})`}
                >
                  <span className="font-serif text-sm font-semibold">{sym.glyph}</span>
                  <span className="text-[0.5rem] text-slate-500 group-hover:text-blue-300 truncate w-full text-center">
                    {sym.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* LaTeX Input */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300 block">LaTeX-Ausdruck</label>
            <textarea
              rows={3}
              value={latexInput}
              onChange={(event: { target: { value: string } }) => { setLatexInput(event.target.value.slice(0, 16_384)); setValidationError(null); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-blue-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500 transition-colors"
              placeholder="z.B. \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 flex items-center space-x-1 text-[0.6875rem] mr-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Vorlagen:</span>
            </span>
            {COMMON_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setLatexInput(p.latex)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[0.625rem] transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Caption and Layout Options */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">Beschriftung (Caption)</label>
              <input
                type="text"
                value={captionInput}
                onChange={(event: { target: { value: string } }) => setCaptionInput(event.target.value.slice(0, 512))}
                placeholder="z.B. Formel 1: Relativitätstheorie"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1.5">Darstellungsmodus</label>
              <div className="flex items-center space-x-3 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="eqMode"
                    checked={displayMode}
                    onChange={() => setDisplayMode(true)}
                    className="text-blue-500 bg-slate-950 border-slate-700"
                  />
                  <span>Block (Zentriert)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="eqMode"
                    checked={!displayMode}
                    onChange={() => setDisplayMode(false)}
                    className="text-blue-500 bg-slate-950 border-slate-700"
                  />
                  <span>Inline im Text</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={Boolean(preview.error)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Formel einfügen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
