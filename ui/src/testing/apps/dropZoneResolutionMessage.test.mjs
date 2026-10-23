// STATUS: PLATIN — Waechter gegen eine unbelegte Platzierungszusage.
//
// WARUM .mjs UND NICHT .ts: dieser Test liest Dateien und braucht dafuer
// `node:fs`. Der Vertrag `apps/vault/testing/contract/vaultImportDepth.contract.test.mjs`
// verlangt, dass Node-Module NUR in `.mjs` stehen — in `.ts`/`.tsx` fehlen die
// Typdeklarationen. Deshalb ist diese Datei reines JavaScript ohne
// Typannotationen; als `.ts` wuerde sie am Rollup-Parser scheitern
// (gemessen: `Parse failure: Expression expected`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Gemessen am 2026-10-16 und in Runde 263 auf die letzte offene Grenze
 * geschlossen: von vier Ablagezonen melden DREI eine Platzierung, ohne zu
 * platzieren. Die Messung zaehlt je Modul die Lesezugriffe auf die Zustellung
 * UND die Schreibstellen:
 *
 *   Publish     26 Lesezugriffe · 39 Schreibstellen, davon ZWEI in Produktion
 *               (`PublishView.tsx:358 acceptPublishTableDrop`,
 *                `:367 acceptPublishStoryDrop`)            ==> VERBRAUCHT
 *   Notes       34 Lesezugriffe ·  3 Schreibstellen, ALLE IN TESTS
 *               (`testing/integration/workspace/notesWriterDragDropRouteGap.
 *                ast0737.test.ts`)                          ==> kein Verbraucher
 *   Writer      30 Lesezugriffe ·  0 Schreibstellen          ==> kein Verbraucher
 *   Whiteboard  23 Lesezugriffe ·  0 Schreibstellen          ==> kein Verbraucher
 *
 * Die drei Ansichten meldeten darum eine HANDLUNG, wo nur eine ROUTE
 * stattfindet: „Placed via …" und „Zugestellt über …". Paragraf 1 verbietet
 * die unbelegte Erfolgsmeldung. Sie lauten jetzt „Routed via …" und
 * „Weitergeleitet über …" — die Zusage ist zurueckgenommen, ohne eine neue zu
 * machen.
 *
 * WARUM DIESER TEST DIE DATEI LIEST: die Meldung ist ein FESTER TEXT im JSX,
 * kein Verhalten. Ein DOM-Test wuerde denselben Text pruefen. Die Messung aus
 * GAP-0045 — die Suite laeuft ohne DOM — aendert daran nichts: hier gibt es
 * nichts auszufuehren, nur etwas zu lesen. Der sauberere Weg waere, die
 * Formatierung in eine reine Funktion zu ziehen und sie direkt zu pruefen;
 * das ist als offene Aufgabe im Register vermerkt.
 */
const ZIELE = [
  { datei: 'apps/whiteboard/drop-zone/WhiteboardDropZoneOverlay.tsx', sprache: 'en' },
  { datei: 'apps/notes/drop-zone/NotesWorkspaceDropZoneOverlay.tsx', sprache: 'en' },
  {
    datei: 'apps/writer/integrations/workspace-drop/WriterWorkspaceDropZoneOverlay.tsx',
    sprache: 'de',
  },
];

/** Die Woerter, mit denen die drei Ansichten eine HANDLUNG behauptet haben. */
const ZUSAGEN = ['Placed via', 'Zugestellt über', 'Zugestellt ueber', 'Delivered via'];

/** Die Woerter, die eine ROUTE nennen — was tatsaechlich stattfindet. */
const ROUTE = ['Routed via', 'Weitergeleitet über'];

function quelle(datei) {
  return readFileSync(new URL(`../../${datei}`, import.meta.url), 'utf8');
}

describe('die Ablagezonen behaupten keine Platzierung', () => {
  it('nennt in keiner der drei Zonen eine Platzierung oder Zustellung', () => {
    for (const { datei, sprache } of ZIELE) {
      const text = quelle(datei);
      for (const zusage of ZUSAGEN) {
        expect(
          text.includes(zusage),
          `${datei} (${sprache}): "${zusage}" darf nicht vorkommen`,
        ).toBe(false);
      }
    }
  });

  it('nennt in jeder der drei Zonen die Route', () => {
    for (const { datei } of ZIELE) {
      const text = quelle(datei);
      expect(
        ROUTE.some((wort) => text.includes(wort)),
        `${datei}: die Meldung muss die Route nennen`,
      ).toBe(true);
    }
  });

  /**
   * GAP-0042, Runde 321: DIESER TEST HIESS BIS HIER „haelt fest, dass Publish der EINZIGE Verbraucher ist"
   * — UND DAS WAR ZU STARK. Er prueft `PublishView.tsx` auf zwei Funktionsnamen und sieht keine andere
   * App an. Seit den Runden 315-318 gibt es einen ZWEITEN Verbraucher (Whiteboard:
   * `acceptWhiteboardTableDrop` im `WhiteboardCanvas`), und der Test blieb gruen, WEIL ER IHN NICHT
   * ANSEHET. Ein Waechter, dessen Name mehr behauptet als er prueft, ist eine unbelegte Erfolgsmeldung
   * in Kleinformat — und er war durch die eigene Arbeit sachlich falsch geworden.
   *
   * JETZT PRUEFT ER BEIDE, UND DER NAME SAGT, WAS ER TUT: dass die Verbraucher dort sind, WO ES EINEN
   * GIBT. Notes und Writer haben bewusst KEINEN automatischen Verbraucher — ihre Einfuegung hat EINE
   * Definition (der Nutzer-Dialog), und ein zweiter Pfad ist ausdruecklich abgelehnt
   * (`notesDropZoneModeConnection.test.ts`, Kopfkommentar).
   */
  it('haelt fest, wo die Zusage zurueckgenommen ist und wo verbraucht wird', () => {
    // Publish verbraucht — dort bleibt die Zustellung eine Zustellung, und das darf dieser Waechter
    // nicht einebnen.
    const publish = quelle('apps/publish/PublishView.tsx');
    expect(
      publish.includes('acceptPublishTableDrop') &&
        publish.includes('acceptPublishStoryDrop'),
      'Publish muss die Zustellung weiterhin verbrauchen',
    ).toBe(true);

    // WHITEBOARD verbraucht seit Runde 316 ebenfalls — und der Grund ist gemessen: sein Ziel ist
    // EINDEUTIG (die Tabelle selbst; es gibt dort kein Bereichskonzept), also kann die Zone es ohne
    // Frage bestimmen. Ohne diese Zeile waere der zweite Verbraucher ungeschuetzt.
    const whiteboard = quelle('apps/whiteboard/app/WhiteboardCanvas.tsx');
    expect(
      whiteboard.includes('acceptWhiteboardTableDrop') && whiteboard.includes('updateItems([...items, step.item])'),
      'Das Whiteboard muss die Zustellung verbrauchen',
    ).toBe(true);

    // NOTES UND WRITER VERBRAUCHEN NICHT AUTOMATISCH, UND DAS IST EINE ENTSCHEIDUNG MIT GRUND:
    // ihre Einfuegung hat EINE Definition (der Nutzer-Dialog), und ein zweiter Pfad waere ein
    // heimlicher Default bei mehrdeutigem Ziel. Der Nachweis liegt in ihren eigenen Vertraegen.
    for (const [app, datei] of [
      ['Notes', 'apps/notes/drop-zone/NotesWorkspaceDropZoneOverlay.tsx'],
      ['Writer', 'apps/writer/integrations/workspace-drop/WriterWorkspaceDropZoneOverlay.tsx'],
    ]) {
      const zone = quelle(datei);
      expect(
        zone.includes('acceptNotesTableDrop') || zone.includes('acceptWriterTableDrop'),
        `${app}: die Ablagezone darf keinen zweiten Einfuege-Pfad bauen`,
      ).toBe(false);
    }
  });
});
