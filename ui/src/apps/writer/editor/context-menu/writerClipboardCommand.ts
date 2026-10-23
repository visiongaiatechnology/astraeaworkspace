// STATUS: GOLD — Writer: eine verweigerte Zwischenablage ist SICHTBAR und FAIL-CLOSED
//
// GOLD und nicht PLATIN, weil der Klickpfad der Komponenten ohne DOM nicht fahrbar ist: bewiesen sind die
// Entscheidung und die Fail-closed-Eigenschaft (Zeuge + drei Mutationen), nicht die Bedienung. Upgrade-Pfad:
// ein Browsertest (Playwright/CDP) gegen einen echten Berechtigungsdialog, der den Klick auslöst.
//
// ## Die Krankheit, die hier geschlossen wird (AST-0099)
//
// Das Absatzkontextmenü schrieb die Zwischenablage **ohne `await`**
// (`navigator.clipboard?.writeText(text);`) und umschloss `readText` mit `catch {}`. Der Nutzer klickte
// "Kopieren", es geschah nichts, und er erfuhr nicht, warum. Beim **Ausschneiden** war die Folge schärfer
// als ein fehlender Hinweis: `handleDeleteParagraph` lief **sofort nach** dem nicht abgewarteten Schreiben,
// also wurde der Absatz gelöscht, obwohl nichts in der Zwischenablage gelandet war — stiller Datenverlust.
//
// ## Warum die Logik hier liegt und nicht in der Komponente
//
// Die Komponente kann ihre Wirkung ohne DOM nicht fahren (`renderToStaticMarkup` rendert nie neu und löst
// keine Ereignisse aus). Ein `await`-Pfad und ein Fehlerzustand sind aber **ohne DOM ausführbar**, wenn die
// Logik aus der Komponente gezogen wird. Genau das ist hier geschehen: die drei Befehle des
// Kontextmenüs sind **eine** Funktion mit **einem** Rückgabetyp, und der Port
// (`navigator.clipboard`) ist ein Parameter statt eines globalen Zugriffs.
//
// ## Fail-closed, wörtlich
//
// * Kein Port ⇒ `clipboard-unavailable`, nicht Stille.
// * Ablehnung ⇒ `clipboard-denied` / `clipboard-failed`, nicht Stille.
// * Leere Zwischenablage ⇒ `clipboard-empty`, sichtbar als **Zustand** (kein Fehler der Anwendung).
// * `runWriterClipboardCut` ruft `commit` **nur** nach einem gelungenen Schreiben auf.
// * `runWriterClipboardPaste` ruft `insert` **nur** bei nicht-leerem, erfolgreich gelesenem Text auf.
// * Ein Fehler beim Übernehmen in das Dokument wird als `document-refused` gemeldet, nicht verschluckt.
//
// ## Was hier bewusst NICHT hindurchgeht
//
// Der Fehlertext wird aus einem **geschlossenen Vokabular** gebaut. Weder `error.message` noch der Inhalt
// der Zwischenablage noch der Absatztext werden jemals in eine Meldung interpoliert — nur die Ursache.
// Das ist keine Stilfrage: eine Zwischenablage kann Ausweise, Schlüssel oder Entsperrtoken tragen, und ein
// Fehlertext landet in einem Log, in einem Screenshot oder in einem Support-Ticket.

/** Der Zwischenablage-Zugriff, den die Oberfläche besitzt (`navigator.clipboard`). */
export interface WriterClipboardPort {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

/** Die drei Befehle, die das Absatzkontextmenü auf die Zwischenablage richtet. */
export type WriterClipboardCommand = 'copy' | 'cut' | 'paste';

/**
 * Geschlossene Ursachenliste. Sie ist bewusst **nicht** aus dem Ausnahmetext abgeleitet: nur der *Name*
 * einer `DOMException` entscheidet zwischen "verweigert" und "fehlgeschlagen", nie die Botschaft.
 */
export type WriterClipboardRefusal =
  | 'clipboard-unavailable'
  | 'clipboard-denied'
  | 'clipboard-failed'
  | 'clipboard-empty'
  | 'document-refused';

export interface WriterClipboardReport {
  readonly command: WriterClipboardCommand;
  readonly ok: boolean;
  /** Genau dann gesetzt, wenn `ok` falsch ist. */
  readonly refusal: WriterClipboardRefusal | null;
  /** Zeichen, die übergeben (Schreiben) oder übernommen (Lesen) wurden. Bei einer Verweigerung `0`. */
  readonly characters: number;
}

export interface WriterClipboardNotice {
  readonly refusal: WriterClipboardRefusal;
  /**
   * `alert` für einen Vorgang, den der Nutzer verlangt hat und der **nicht** geschehen ist.
   * `status` für eine leere Zwischenablage: ein Zustand, kein Fehler der Anwendung — dieselbe
   * Unterscheidung, die `WriterSaveAndRestoreNotice` zwischen fehlgeschlagenem Speichern und
   * zurückgesetztem Cursor zieht.
   */
  readonly role: 'alert' | 'status';
  readonly message: string;
}

const CLIPBOARD_VERB: Readonly<Record<WriterClipboardCommand, string>> = {
  copy: 'Der Absatz wurde nicht kopiert',
  cut: 'Der Absatz wurde nicht ausgeschnitten',
  paste: 'Es wurde nichts eingefügt',
};

const CLIPBOARD_CAUSE: Readonly<Record<Exclude<WriterClipboardRefusal, 'document-refused'>, string>> = {
  'clipboard-unavailable': 'diese Umgebung keinen Zugriff auf die Zwischenablage erlaubt',
  'clipboard-denied': 'der Zugriff auf die Zwischenablage verweigert wurde',
  'clipboard-failed': 'der Zugriff auf die Zwischenablage fehlgeschlagen ist',
  'clipboard-empty': 'die Zwischenablage keinen Text enthält',
};

/**
 * Der Schreib- bzw. Lesevorgang ist gelungen, das Dokument hat die Änderung aber nicht angenommen. Eigener
 * Satz, weil der Nutzer hier etwas anderes wissen muss: sein Text **ist** in der Zwischenablage.
 */
const DOCUMENT_REFUSED_MESSAGE: Readonly<Record<WriterClipboardCommand, string>> = {
  copy: 'Das Kopieren im Dokument wurde nicht abgeschlossen.',
  cut: 'Der Absatz liegt in der Zwischenablage, konnte aber nicht gelöscht werden.',
  paste: 'Der Text wurde aus der Zwischenablage gelesen, konnte aber nicht in das Dokument übernommen werden.',
};

/**
 * "Verweigert" gegen "fehlgeschlagen" entscheidet der **Name** der Ausnahme, nicht ihr Text. Ein
 * Berechtigungsfehler des Browsers ist `NotAllowedError` (oder `SecurityError` in einem unsicheren
 * Kontext); alles andere ist ein Fehler ohne Berechtigungsbezug. Beide werden gemeldet — nur mit
 * unterschiedlichem Satz.
 */
function classifyClipboardRejection(error: unknown): WriterClipboardRefusal {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'NotAllowedError' || error.name === 'SecurityError'
      ? 'clipboard-denied'
      : 'clipboard-failed';
  }
  return 'clipboard-failed';
}

function refusal(
  command: WriterClipboardCommand,
  cause: WriterClipboardRefusal,
): WriterClipboardReport {
  return { command, ok: false, refusal: cause, characters: 0 };
}

/** Der eine Schreibvorgang. Kein `await`-freier Pfad, kein `catch {}`. */
async function runWriterClipboardWrite(
  command: 'copy' | 'cut',
  port: WriterClipboardPort | null | undefined,
  text: string,
): Promise<WriterClipboardReport> {
  if (!port) return refusal(command, 'clipboard-unavailable');
  try {
    await port.writeText(text);
  } catch (error) {
    return refusal(command, classifyClipboardRejection(error));
  }
  return { command, ok: true, refusal: null, characters: text.length };
}

/** Der eine Fehlerpfad für das Übernehmen in das Dokument — gemeldet, nicht verschluckt. */
function commitOrRefuse(
  report: WriterClipboardReport,
  commit: () => void,
): WriterClipboardReport {
  if (!report.ok) return report;
  try {
    commit();
  } catch {
    return refusal(report.command, 'document-refused');
  }
  return report;
}

/**
 * Kopieren: schreibt und sagt, was geschehen ist. Die Länge im Bericht ist die Menge, die der
 * Zwischenablage übergeben wurde — **nicht** das, was der Browser daraus gemacht hat.
 */
export async function runWriterClipboardCopy(
  port: WriterClipboardPort | null | undefined,
  text: string,
): Promise<WriterClipboardReport> {
  return runWriterClipboardWrite('copy', port, text);
}

/**
 * Ausschneiden, fail-closed: `commit` (das Löschen des Absatzes) läuft **nur**, wenn das Schreiben
 * gelungen ist. Zuvor lief es danach — ohne `await` — und löschte den Absatz auch bei verweigerter
 * Zwischenablage.
 */
export async function runWriterClipboardCut(
  port: WriterClipboardPort | null | undefined,
  text: string,
  commit: () => void,
): Promise<WriterClipboardReport> {
  return commitOrRefuse(await runWriterClipboardWrite('cut', port, text), commit);
}

/**
 * Einfügen, fail-closed: `insert` läuft **nur**, wenn das Lesen gelungen ist **und** Text geliefert hat.
 * Eine leere Zwischenablage ist ein sichtbarer Zustand (`clipboard-empty`), kein stilles Nichts.
 */
export async function runWriterClipboardPaste(
  port: WriterClipboardPort | null | undefined,
  insert: (text: string) => void,
): Promise<WriterClipboardReport> {
  if (!port) return refusal('paste', 'clipboard-unavailable');
  let clipText: string;
  try {
    clipText = await port.readText();
  } catch (error) {
    return refusal('paste', classifyClipboardRejection(error));
  }
  if (clipText.length === 0) return refusal('paste', 'clipboard-empty');
  return commitOrRefuse(
    { command: 'paste', ok: true, refusal: null, characters: clipText.length },
    () => insert(clipText),
  );
}

/**
 * Die sichtbare Hälfte: welcher Satz, und mit welcher Dringlichkeit.
 *
 * `null` bei Erfolg — Stille ist dann die ehrliche Antwort. Genau diese Stille war vorher die Antwort auf
 * **jeden** Ausgang, weil `ok` nie falsch werden konnte.
 */
export function resolveWriterClipboardNotice(report: WriterClipboardReport): WriterClipboardNotice | null {
  const cause = report.refusal;
  if (report.ok || cause === null) return null;
  switch (cause) {
    case 'document-refused':
      return { refusal: cause, role: 'alert', message: DOCUMENT_REFUSED_MESSAGE[report.command] };
    case 'clipboard-unavailable':
    case 'clipboard-denied':
    case 'clipboard-failed':
      return {
        refusal: cause,
        role: 'alert',
        message: `${CLIPBOARD_VERB[report.command]}, weil ${CLIPBOARD_CAUSE[cause]}.`,
      };
    case 'clipboard-empty':
      return {
        refusal: cause,
        role: 'status',
        message: `${CLIPBOARD_VERB[report.command]}, weil ${CLIPBOARD_CAUSE[cause]}.`,
      };
    default: {
      const unhandled: never = cause;
      return unhandled;
    }
  }
}
