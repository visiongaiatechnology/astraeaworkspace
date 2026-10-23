// STATUS: PLATIN — Astraea Publish: der sichtbare Einstieg „Neues Layoutdokument"
//
// Befund vor dieser Datei (gemessen, Runde Publish-1): Es gab **keinen** sichtbaren Einstieg, der ein neues
// Dokument erzeugt. Der einzige Weg zu einem Publish-Dokument war ein bereits vorhandenes `publishData`; ohne
// das erschien die hartkodierte Beispielbroschuere aus `DEFAULT_PUBLISH_MODEL`.
//
// Dieser Dialog ist der Einstieg. Er sammelt die Angaben, laesst die Logik pruefen
// (`validatePublishCreationSpec`) und zeigt den Fehler **mit Grund** an, statt den Dialog wortlos zu leeren.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FilePlus2, X } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { publishPaperText, publishWorkspaceFormat, publishWorkspaceText } from '../publishWorkspaceLocale';
import { PUBLISH_CREATION_LIMITS, PUBLISH_PAPER_SIZES, type PublishCreationSpec, type PublishPaperStandard } from '../model/publishDocumentFactory';

export interface PublishNewDocumentDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  /** Wirft `PublishModelError`, wenn die Angaben ungueltig sind — der Dialog zeigt den Grund an. */
  onCreate: (spec: PublishCreationSpec) => void;
}

const PAPER_CHOICES: readonly PublishPaperStandard[] = ['A4', 'A3', 'A5', 'Letter', 'Custom'];

export const PublishNewDocumentDialog: React.FC<PublishNewDocumentDialogProps> = ({ isOpen, onCancel, onCreate }) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof publishWorkspaceText>[0]) => publishWorkspaceText(message, locale);
  const format = (message: Parameters<typeof publishWorkspaceFormat>[0], values: Record<string, string | number>) => publishWorkspaceFormat(message, locale, values);
  const [title, setTitle] = useState('Untitled publication');
  const [paper, setPaper] = useState<PublishPaperStandard>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pages, setPages] = useState(2);
  const [marginMm, setMarginMm] = useState(15);
  const [bleedMm, setBleedMm] = useState(3);
  const [widthMm, setWidthMm] = useState(210);
  const [heightMm, setHeightMm] = useState(297);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  /**
   * **Der Fokus kehrt zurueck, woher er kam** (`AST-1449`).
   *
   * Gemessen vorher: der Dialog hatte `autoFocus`, aber **keine** Rueckgabe. Nach dem Schliessen stand der Fokus
   * auf `<body>`, und die Tastaturbedienung begann wieder am Anfang der Seite — *fuer einen Nutzer ohne Zeiger ist
   * das ein Riss in der Fuehrung, kein Schoenheitsfehler.*
   */
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { returnFocusRef.current?.focus(); };
  }, [isOpen]);
  const preview = useMemo(() => {
    if (paper === 'Custom') return `${widthMm} × ${heightMm} mm`;
    const size = PUBLISH_PAPER_SIZES[paper];
    return orientation === 'landscape' ? `${size.heightMm} × ${size.widthMm} mm` : `${size.widthMm} × ${size.heightMm} mm`;
  }, [paper, orientation, widthMm, heightMm]);

  if (!isOpen) return null;
  const submit = (): void => {
    try {
      onCreate({ title, paper, orientation, pages, marginMm, bleedMm, widthMm, heightMm });
      setError(null);
    } catch (cause) {
      // Der Grund wird angezeigt. Ein Dialog, der bei ungueltigen Angaben nichts sagt, zwingt den Nutzer zum Raten.
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" data-publish-new-document-dialog="true">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} className="relative w-full max-w-lg bg-[#0c0817] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onCancel(); return; }
          /**
           * **Die Fokusfalle** (`AST-1449`, Fehler/Sicherheit/A11y).
           *
           * Gemessen vorher: der Dialog trug `aria-modal="true"` und `autoFocus` — aber **nichts** hielt den Fokus
           * darin. Mit `Tab` wanderte er in die Seite **hinter** dem Dialog, und ein `aria-modal`, das die Seite
           * nicht wirklich abschirmt, sagt einem Screenreader die Unwahrheit. *Ein Zustand, der behauptet wird und
           * nicht gilt, ist genau das, was dieses Projekt nicht liefern darf.*
           *
           * Umgebrochen wird **wirklich** (vom letzten zum ersten Feld und zurueck), nicht nur „nichts tun".
           */
          if (event.key !== 'Tab') return;
          const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          );
          if (!focusables || focusables.length === 0) return;
          const first = focusables[0]!;
          const last = focusables[focusables.length - 1]!;
          const active = document.activeElement;
          if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-500/20">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20"><FilePlus2 className="w-4 h-4 text-purple-300" /></span>
            <div>
              <h2 id={titleId} className="text-sm font-bold text-white">{t('newDocumentTitle')}</h2>
              <p className="text-[0.6875rem] text-slate-400">{t('newDocumentDescription')}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label={t('cancel')} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-purple-900/30">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label htmlFor={`${titleId}-title`} className="block text-slate-400 mb-1">{t('documentTitle')}</label>
            <input id={`${titleId}-title`} type="text" value={title} maxLength={512} autoFocus onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }}
              className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${titleId}-paper`} className="block text-slate-400 mb-1">{t('paper')}</label>
              <select id={`${titleId}-paper`} value={paper} onChange={(event) => setPaper(event.target.value as PublishPaperStandard)}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100">
                {PAPER_CHOICES.map((choice) => <option key={choice} value={choice}>{publishPaperText(choice, locale)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${titleId}-orientation`} className="block text-slate-400 mb-1">{t('orientation')}</label>
              <select id={`${titleId}-orientation`} value={orientation} onChange={(event) => setOrientation(event.target.value === 'landscape' ? 'landscape' : 'portrait')}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100">
                <option value="portrait">{t('portrait')}</option>
                <option value="landscape">{t('landscape')}</option>
              </select>
            </div>
          </div>

          {paper === 'Custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${titleId}-width`} className="block text-slate-400 mb-1">Width (mm)</label>
                <input id={`${titleId}-width`} type="number" min={PUBLISH_CREATION_LIMITS.minMarginMm + 10} value={widthMm}
                  onChange={(event) => setWidthMm(Number(event.target.value))} className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100" />
              </div>
              <div>
                <label htmlFor={`${titleId}-height`} className="block text-slate-400 mb-1">Height (mm)</label>
                <input id={`${titleId}-height`} type="number" min={PUBLISH_CREATION_LIMITS.minMarginMm + 10} value={heightMm}
                  onChange={(event) => setHeightMm(Number(event.target.value))} className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={`${titleId}-pages`} className="block text-slate-400 mb-1">{t('pageCount')}</label>
              <input id={`${titleId}-pages`} type="number" min={PUBLISH_CREATION_LIMITS.minPages} max={PUBLISH_CREATION_LIMITS.maxPages} value={pages}
                onChange={(event) => setPages(Number(event.target.value))} className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100" />
            </div>
            <div>
              <label htmlFor={`${titleId}-margin`} className="block text-slate-400 mb-1">{t('margin')}</label>
              <input id={`${titleId}-margin`} type="number" min={0} max={PUBLISH_CREATION_LIMITS.maxMarginMm} value={marginMm}
                onChange={(event) => setMarginMm(Number(event.target.value))} className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100" />
            </div>
            <div>
              <label htmlFor={`${titleId}-bleed`} className="block text-slate-400 mb-1">{t('bleed')}</label>
              <input id={`${titleId}-bleed`} type="number" min={0} max={PUBLISH_CREATION_LIMITS.maxBleedMm} value={bleedMm}
                onChange={(event) => setBleedMm(Number(event.target.value))} className="w-full bg-[#150f24] border border-purple-500/30 rounded px-2 py-1.5 text-slate-100" />
            </div>
          </div>

          <p data-publish-new-document-preview={preview} className="text-[0.6875rem] text-slate-400">{preview} · {pages} ×</p>

          {error !== null && (
            <p role="alert" data-publish-new-document-error={error} className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[0.6875rem] text-rose-200">
              {format('creationFailed', { reason: error })}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-purple-500/20">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-purple-500/30 text-slate-300 text-xs hover:bg-purple-900/30">{t('cancel')}</button>
          <button type="button" onClick={submit} data-publish-new-document-submit="true"
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold hover:from-purple-500 hover:to-indigo-500">
            {t('create')}
          </button>
        </div>
      </div>
    </div>
  );
};
