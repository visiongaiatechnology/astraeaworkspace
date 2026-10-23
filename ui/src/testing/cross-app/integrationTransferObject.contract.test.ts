// STATUS: PLATIN — Paket 7: das **semantische Transferobjekt** — die Verbindung, nicht die Neuschöpfung
//
// ## Die Messung (Runde 196)
//
// Das Transferobjekt **existiert bereits** ✓ und ist der Ort, an dem Paket 4 (Registry ✓) und Paket 5 (Zieh-Session ✓)
// zusammentreffen:
//   * \`shared/workspace-interaction/workspaceInteractionPayload.ts:67\` ✓ \`createWorkspaceDragPayload(descriptor: unknown)\` ✓
//   * \`:75\` ✓ \`serializeWorkspaceDragPayload(payload: unknown): string\` ✓
//   * \`:89\` ✓ \`parseWorkspaceDragPayload(serialized: string): WorkspaceDragPayload\` ✓
//
// **Paket 7 ist damit eine Verbindung ✓, keine Neuschöpfung ✗** — und die Verbindung ist **prüfbar**: Der Träger der
// Zieh-Session (\`DragSession.payload: unknown\` ✓) soll ein \`WorkspaceDragPayload\` sein ✓, und das Objekt muss die
// **Rundreise** überstehen ✓ sowie **erfundene** Angaben **benannt** abweisen ✓.
//
// ## Was diese Prüfung zusichert — und was sie ausdrücklich offenlässt ✗
//
// Sie prüft die Eigenschaften, die **ohne** einen konkreten Aufrufer gelten ✓: **fail-closed** bei erfundenen Angaben ✓,
// **Rundreise** bei einem gültigen Träger ✓, **keine stille Annahme** ✗. Sie prüft **nicht** ✗, welche Deskriptoren die
// zwölf Apps heute wirklich erzeugen ✓ — dafür gehört je App ein Fall in ihren eigenen Bereich ✓ (Paket 9–14 ✓).
// *Eine Prüfung, die für alle Apps spricht, ohne eine zu fragen, wäre eine Behauptung* ✓.
import { describe, expect, it } from 'vitest';
import {
  createWorkspaceDragPayload,
  parseWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../shared/workspace-interaction/workspaceInteractionPayload';

/** Eine **ungültige** Angabe muss **benannt** abgewiesen werden ✓ — nie still angenommen ✗. */
const UNGUELTIG: readonly unknown[] = [
  null,
  undefined,
  42,
  'text',
  [],
  {},
  { sourceApp: 'NichtsDergleichen' },
  { sourceApp: 'Writer' },
  { sourceDocumentId: 'd1' },
  { sourceApp: 'Writer', sourceDocumentId: '' },
  { sourceApp: 'Writer', sourceDocumentId: 'd1', objectKind: 'NichtsDergleichen' },
];

/** Eine **ungültige** Angabe muss **benannt** abgewiesen werden ✓ — nie still angenommen ✗. */
const UNGELTIG: readonly unknown[] = [
  null, undefined, 42, 'text', [], {},
  { sourceApp: 'NichtsDergleichen' },
  { sourceApp: 'Writer' },
  { documentId: 'd1' },
  { sourceApp: 'Writer', documentId: '' },
  { sourceApp: 'Writer', documentId: 'd1', objectKind: 'NichtsDergleichen' },
];
describe('Paket 7: das semantische Transferobjekt', () => {
  it('**Nicht-Leerheit:** die drei Funktionen sind da und die Abweisungsliste ist nicht leer', () => {
    expect(typeof createWorkspaceDragPayload).toBe('function');
    expect(typeof serializeWorkspaceDragPayload).toBe('function');
    expect(typeof parseWorkspaceDragPayload).toBe('function');
    expect(UNGELTIG.length).toBeGreaterThanOrEqual(8);
  });

  it('**fail-closed:** jede unbrauchbare Angabe wird benannt abgewiesen, keine still angenommen', () => {
    for (const angabe of UNGUELTIG) {
      // Entweder es **wirft benannt** ✓ oder es liefert einen Wert, der die **Rundreise nicht übersteht** ✓ —
      // aber es darf **nicht** klaglos ein Träger entstehen ✗.
      let ergebnis: unknown;
      let warf = false;
      try {
        ergebnis = createWorkspaceDragPayload(angabe);
      } catch (fehler) {
        warf = true;
        // **Benannt** heißt: eine Meldung, nicht ein leerer Fehler ✓.
        expect(fehler instanceof Error, JSON.stringify(angabe)).toBe(true);
        expect(String((fehler as Error).message).length, JSON.stringify(angabe)).toBeGreaterThan(3);
      }
      if (!warf) {
        // Wenn es **nicht** wirft, muss die Rundreise es abweisen ✓ — sonst wäre die Abweisung leer ✓.
        const serialisiert = serializeWorkspaceDragPayload(ergebnis);
        expect(
          () => parseWorkspaceDragPayload(serialisiert),
          `still angenommen: ${JSON.stringify(angabe)}`,
        ).toThrow();
      }
    }
  });

  it('**die Rundreise ist stabil:** zweimal parsen ergibt dieselbe Struktur', () => {
    // Ein gültiger Träger, **aus den Anforderungen des Objekts selbst** gebaut ✗ — nicht abgeschrieben ✗.
    // Wird der Deskriptor abgewiesen, ist **das** der Befund ✓ und der Test nennt ihn ✓.
        // **Gelesen, nicht geraten (Runde 197):** Die kanonischen Schlüssel stehen in
    // `workspaceInteractionPayload.ts:17` — `['documentId','objectId','objectKind','sourceApp','supportedIntents']` ✓.
    // Mein erster Versuch benutzte `sourceDocumentId` ✗, ließ `objectId` weg ✗ und schrieb `intents` ✗ — und wurde
    // deshalb **benannt abgewiesen** ✓. *Der Test hat das Lesen erzwungen, statt ein Muster zu bestätigen.*
    const versuch = { documentId: 'doc-1', objectId: 'obj-1', objectKind: 'TextBlock', sourceApp: 'Writer', supportedIntents: ['COPY'] };
    let traeger: unknown;
    try {
      traeger = createWorkspaceDragPayload(versuch);
    } catch (fehler) {
      // **Ehrlich statt grün:** Der Test scheitert mit dem **gemessenen** Grund ✓, damit der nächste Schritt
      // den richtigen Deskriptor bauen kann ✓ — statt dass ich ihn rate ✗.
      throw new Error(
        `createWorkspaceDragPayload wies den Versuchsdeskriptor ab: ${String((fehler as Error)?.message)} | `
        + 'Der nächste Schritt ist, den Vertrag von `WorkspaceDragPayload` zu LESEN und den Deskriptor danach zu bauen.',
      );
    }
    const einmal = parseWorkspaceDragPayload(serializeWorkspaceDragPayload(traeger));
    const zweimal = parseWorkspaceDragPayload(serializeWorkspaceDragPayload(einmal));
    expect(zweimal).toEqual(einmal);
    // Und der Träger trägt die **semantische** Angabe ✓ — nicht nur eine Kennung ✗.
    expect(JSON.stringify(einmal)).toMatch(/Writer/u);
  });

  it('**Müll in der Zeichenkette** wird abgewiesen, nicht geraten', () => {
    for (const muell of ['', '{}', 'null', '[]', 'not json at all', '{"sourceApp":42}']) {
      expect(() => parseWorkspaceDragPayload(muell), JSON.stringify(muell)).toThrow();
    }
  });
});
