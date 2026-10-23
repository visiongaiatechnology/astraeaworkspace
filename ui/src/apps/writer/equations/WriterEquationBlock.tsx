// STATUS: DIAMANT VGT SUPREME — Sovereign Typographic Equation Block with Native MathML Rendering
import React, { useState } from 'react';
import { Sigma, Trash2, Edit3, Code2, Copy, Check } from 'lucide-react';
import type { WriterEquationBlockData } from '../../../shared/contracts/workspace';
import { latexToMathML } from '../editor/blocks/equations/writerEquationEngine';
import { renderEquationReact } from './WriterEquationRender';
import {
  resolveWriterClipboardNotice,
  runWriterClipboardCopy,
  type WriterClipboardReport,
} from '../editor/context-menu/writerClipboardCommand';
import { resolveWriterClipboardPort } from '../editor/context-menu/writerClipboardPort';

interface WriterEquationBlockProps {
  equation: WriterEquationBlockData;
  onUpdateEquation: (eq: WriterEquationBlockData) => void;
  onDeleteEquation: (id: string) => void;
  onOpenEditor?: (eq: WriterEquationBlockData) => void;
  readOnly?: boolean;
}

export const WriterEquationBlock: React.FC<WriterEquationBlockProps> = ({
  equation,
  onUpdateEquation: _onUpdateEquation,
  onDeleteEquation,
  onOpenEditor,
  readOnly = false,
}) => {
  const [showMathML, setShowMathML] = useState(false);
  const [copied, setCopied] = useState(false);
  /** AST-0099: der Ausgang des letzten Kopiervorgangs. `null` heißt "noch nichts versucht". */
  const [copyReport, setCopyReport] = useState<WriterClipboardReport | null>(null);
  const copyNotice = copyReport === null ? null : resolveWriterClipboardNotice(copyReport);

  const rendered = (() => {
    try {
      return {
        view: renderEquationReact(equation.latex),
        mathml: equation.mathml || latexToMathML(equation.latex, equation.displayMode !== false),
        error: null as string | null,
      };
    } catch (error) {
      return {
        view: <span className="text-red-300">Ungültige Gleichung</span>,
        mathml: '',
        error: error instanceof Error ? error.message : 'Ungültige Gleichungsdaten.',
      };
    }
  })();

  const handleCopyLatex = async (e: React.MouseEvent) => {
    e.stopPropagation();
    /**
     * AST-0099: derselbe Befehl wie im Absatzkontextmenü, nur über eine andere Oberfläche.
     *
     * Vorher stand hier `navigator.clipboard.writeText(equation.latex);` ohne `await` und danach
     * unbedingt `setCopied(true)`: das Häkchen erschien auch dann, wenn die Zwischenablage den Text nie
     * bekommen hatte. Jetzt entscheidet der Bericht, und ein verweigerter Zugriff wird benannt.
     *
     * Der Aufruf kann nicht ablehnen: die Befehlsfunktion fängt jeden Pfad und liefert einen Bericht.
     * Deshalb ist der Aufruf an dieser Stelle ein dokumentierter, kein schwebender Vorgang.
     */
    const report = await runWriterClipboardCopy(resolveWriterClipboardPort(), equation.latex);
    setCopyReport(report);
    setCopied(report.ok);
    if (!report.ok) return;
    setTimeout(() => setCopied(false), 1500);
  };

  /**
   * GAP-0052, Runde 289: die Renderflaeche ist nur dann ein Bedienelement, wenn
   * es etwas zu oeffnen gibt. `readOnly` und ein fehlendes `onOpenEditor` machen
   * aus ihr Dekoration — dann gibt es weder Tab-Stopp noch Rolle noch Taste.
   */
  const editorOeffenbar = !readOnly && onOpenEditor !== undefined;
  const oeffneEditor = () => {
    onOpenEditor?.(equation);
  };

  return (
    <div
      data-writer-equation-id={equation.id}
      className={`my-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-blue-500/40 transition-all group relative ${
        equation.displayMode !== false ? 'mx-auto max-w-2xl text-center' : 'inline-block my-1'
      }`}
    >
      {/* Top Action Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-xs">
        <div className="flex items-center space-x-2 text-blue-400">
          <Sigma className="w-4 h-4" />
          <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-300">
            Gleichung (LaTeX & MathML)
          </span>
        </div>

        <div className="flex items-center space-x-1 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button aria-label="LaTeX kopieren"
            type="button"
            onClick={handleCopyLatex}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            title="LaTeX kopieren"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>          <button
            type="button"
            onClick={() => setShowMathML(!showMathML)}
            className={`p-1 rounded ${showMathML ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            aria-label="MathML umschalten" title="MathML umschalten"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          {onOpenEditor && !readOnly ? (
            <button
              type="button"
              onClick={() => onOpenEditor(equation)}
              className="p-1 rounded text-slate-400 hover:text-blue-300 hover:bg-slate-800"
              aria-label="Formel bearbeiten" title="Formel bearbeiten"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          ) : null}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onDeleteEquation(equation.id)}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800"
              aria-label="Gleichung löschen" title="Gleichung löschen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/*
        AST-0099: die sichtbare Hälfte des Kopierbefehls. Vorher gab es sie nicht — das Häkchen stand
        auch dann, wenn die Zwischenablage den Text nie bekommen hatte. `role="status"` mit
        `aria-live`, weil ein Fehlerzustand ohne Rolle für Screenreader nicht existiert.
      */}
      {copyNotice && (
        <p
          role={copyNotice.role}
          aria-live={copyNotice.role === 'alert' ? 'assertive' : 'polite'}
          aria-atomic="true"
          data-writer-clipboard-notice={copyNotice.refusal}
          className={`mb-2 rounded-lg border px-3 py-1.5 text-[0.6875rem] ${
            copyNotice.role === 'alert'
              ? 'border-red-400/40 bg-red-950/40 text-red-100'
              : 'border-amber-400/30 bg-amber-950/30 text-amber-100'
          }`}
        >
          {copyNotice.message}
        </p>
      )}

      {/* Typographic Equation Render */}
      {/*
        GAP-0052, Runde 289: die Renderflaeche war ein `<div>` mit `onClick` —
        `cursor-pointer`, aber OHNE `role`, OHNE `tabIndex` und OHNE `onKeyDown`.
        Mit der Maus liess sich der Formeleditor von hier oeffnen, mit der
        Tastatur nicht. Die Flaeche ist nur dann ein Bedienelement, wenn es
        wirklich etwas zu oeffnen gibt: im Nur-Lese-Modus und ohne
        `onOpenEditor` bleibt sie dekoriert und belegt keinen Tab-Stopp.
      */}
      <div
        data-writer-equation-surface="render"
        role={editorOeffenbar ? 'button' : undefined}
        tabIndex={editorOeffenbar ? 0 : undefined}
        aria-label={editorOeffenbar ? 'Formel bearbeiten' : undefined}
        onClick={editorOeffenbar ? oeffneEditor : undefined}
        onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
          if (!editorOeffenbar) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          // Die Leertaste scrollt von sich aus. Wird sie nicht abgefangen,
          // springt die Seite statt den Editor zu oeffnen.
          event.preventDefault();
          oeffneEditor();
        }}
        className={`py-2 px-3 rounded-lg transition-colors flex items-center justify-center overflow-x-auto min-h-[44px] ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-white/[0.02]'}`}
      >
        <div>{rendered.view}</div>
      </div>

      {rendered.error && (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.625rem] text-red-200">
          {rendered.error}
        </div>
      )}

      {/* Caption Display */}
      {equation.caption && (
        <p className="text-[0.6875rem] text-slate-400 mt-2 italic text-center">
          {equation.caption}
        </p>
      )}

      {/* MathML Code Inspection */}
      {showMathML && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-left">
          <div className="text-[0.625rem] text-slate-400 mb-1 font-mono">W3C MathML Payload:</div>
          <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[0.625rem] font-mono text-emerald-400 overflow-x-auto select-all leading-relaxed">
            {rendered.mathml}
          </pre>
        </div>
      )}
    </div>
  );
};
