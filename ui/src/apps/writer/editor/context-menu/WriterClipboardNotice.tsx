// STATUS: GOLD — die sichtbare Hälfte von AST-0099
//
// Ein Fehlerzustand, der nur im Zustandsobjekt steht, ist für einen Screenreader nicht vorhanden. Diese
// Oberfläche ist die eine Stelle, an der ein Ausgang des Zwischenablage-Befehls für den Nutzer sichtbar
// wird, und sie folgt dem Muster, das die App für "ein Vorgang ist nicht geschehen" schon hat
// (`WriterSaveAndRestoreNotice`): ein Streifen über der Arbeitsfläche, `role="alert"` für einen Fehlschlag,
// `role="status"` für einen bloßen Zustand, und ein `data-`Attribut, damit ein Zeuge den Grund findet
// statt den Wortlaut.
import React from 'react';
import { resolveWriterClipboardNotice, type WriterClipboardReport } from './writerClipboardCommand';

export interface WriterClipboardNoticeProps {
  /** Der Bericht des letzten Befehls. `null` heißt: kein Befehl gelaufen — dann bleibt es still. */
  report?: WriterClipboardReport | null;
}

export const WriterClipboardNotice: React.FC<WriterClipboardNoticeProps> = ({ report = null }) => {
  if (report === null) return null;
  const notice = resolveWriterClipboardNotice(report);
  // Erfolg erzeugt keine Meldung: Stille ist die ehrliche Antwort, wenn nichts zu sagen ist.
  if (notice === null) return null;

  const isAlert = notice.role === 'alert';
  const tone = isAlert
    ? 'border-red-400/40 bg-red-950/40 text-red-100'
    : 'border-amber-400/30 bg-amber-950/30 text-amber-100';

  return (
    <p
      role={notice.role}
      aria-live={isAlert ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-writer-clipboard-notice={notice.refusal}
      className={`rounded-lg border px-3 py-1.5 text-[0.6875rem] ${tone}`}
    >
      {notice.message}
    </p>
  );
};
