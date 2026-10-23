/**
 * P26 / AST-0126 — freie Formen und Textfelder: der dedizierte Unit-Test fuer `writerShapeOperations.ts`.
 *
 * ## Warum dieser Test neu geschrieben wurde
 *
 * Runde 225 hat gemessen: **dieses Modul hatte 13 Exporte, 337 Zeilen und KEINEN eigenen Test.** Nur
 * `resolveWriterShapePageIndex` war ueber die Sonde erreichbar, weil es woanders geprueft wird. **23 Exporte
 * ohne Test im Writer-Kapitel waren der groesste verbliebene Einzelposten — ein Risiko, kein Formalproblem.**
 *
 * ## Der Vertrag von `clampWriterShapeGeometry`, aus dem Quelltext gelesen
 *
 * * **Drei Obergrenzen**, jede aus `bounds` oder ersatzweise `WRITER_SHAPE_MAX_COORDINATE_MM = 10_000`.
 * * **Eine Untergrenze:** `MIN_EXTENT_MM = 1` fuer Breite und Hoehe — **ausser bei `line` und `arrow`, die
 *   per Definition flach sind und Hoehe 0 behalten.**
 * * **`finiteOr`:** ein nicht-endlicher Wert (`NaN`, `Infinity`) faellt auf den Standardwert zurueck,
 *   **statt die Geometrie unbrauchbar zu machen.**
 * * **Objektidentitaet:** aendert sich nichts, kommt **dasselbe Objekt** zurueck — nicht eine Kopie.
 *
 * **Die Grenzenpruefung ist der Grund, warum dieses Modul wichtig ist:** eine Form mit `Infinity` als Breite
 * wuerde jede Layoutrechnung vergiften. Der Test prueft, dass genau das nicht passieren kann.
 */

import { describe, expect, it } from 'vitest';
import {
  WRITER_SHAPE_MAX_COORDINATE_MM,
  bringShapeToFront,
  clampWriterShapeGeometry,
  bringShapeForward,
  createWriterShape,
  generateShapeSvgPath,
  sendShapeBackward,
  groupWriterShapes,
  resolveWriterShapePageIndex,
  resolveWriterShapesForPageIndex,
  updateWriterShape,
  ungroupWriterShapes,
  sendShapeToBack,
} from '../../../../media/objects/shapes/writerShapeOperations';
import type { DocumentKind, WorkspaceDocument, WriterShapeBlockData } from '../../../../../../shared/contracts/workspace';
import { insertShapeToDoc } from '../../../../../../shared/workspace/operations/documentActions';

/** Baut eine Form mit den Feldern, die die Funktionen lesen. */
function shape(over: Record<string, unknown> = {}): WriterShapeBlockData {
  return {
    id: 'shape-1',
    shapeKind: 'rect',
    anchorParagraphId: 'p0',
    xMm: 10,
    yMm: 20,
    widthMm: 30,
    heightMm: 40,
    zIndex: 1,
    ...over,
  } as unknown as WriterShapeBlockData;
}

describe('clampWriterShapeGeometry — die Grenzen', () => {
  it('laesst eine Form in gueltigen Grenzen unveraendert und gibt DASSELBE Objekt zurueck', () => {
    const original = shape();
    expect(clampWriterShapeGeometry(original)).toBe(original);
  });

  it('klemmt negative Koordinaten auf 0', () => {
    const result = clampWriterShapeGeometry(shape({ xMm: -50, yMm: -0.5 }));
    expect(result.xMm).toBe(0);
    expect(result.yMm).toBe(0);
  });

  it('klemmt Koordinaten auf die Standardobergrenze von 10000 mm', () => {
    const result = clampWriterShapeGeometry(shape({ xMm: 99_999 }));
    expect(result.xMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(WRITER_SHAPE_MAX_COORDINATE_MM).toBe(10_000);
  });

  it('benutzt die uebergebenen Grenzen statt der Standardwerte', () => {
    const result = clampWriterShapeGeometry(
      shape({ xMm: 500, widthMm: 500 }),
      { maxCoordinateMm: 100, maxWidthMm: 80 },
    );
    expect(result.xMm).toBe(100);
    expect(result.widthMm).toBe(80);
  });

  it('erzwingt die Mindestausdehnung von 1 mm fuer Breite und Hoehe', () => {
    const result = clampWriterShapeGeometry(shape({ widthMm: 0.2, heightMm: -5 }));
    expect(result.widthMm).toBe(1);
    expect(result.heightMm).toBe(1);
  });

  it('nimmt Linie und Pfeil von der Hoehen-Untergrenze aus — sie sind flach', () => {
    for (const kind of ['line', 'arrow']) {
      const result = clampWriterShapeGeometry(shape({ shapeKind: kind, heightMm: 0 }));
      expect(result.heightMm, `${kind} darf Hoehe 0 behalten`).toBe(0);
    }
    // Jede andere Form darf das nicht.
    expect(clampWriterShapeGeometry(shape({ shapeKind: 'rect', heightMm: 0 })).heightMm).toBe(1);
  });

  it('ERSTE HAUPTZUSICHERUNG: nicht-endliche Werte vergiften die Geometrie nicht', () => {
    // NaN und Infinity sind die Werte, die eine Layoutrechnung still unbrauchbar machen.
    const result = clampWriterShapeGeometry(
      shape({ xMm: Number.NaN, yMm: Number.POSITIVE_INFINITY, widthMm: Number.NaN, heightMm: Number.NEGATIVE_INFINITY }),
    );
    for (const [key, value] of Object.entries({
      xMm: result.xMm, yMm: result.yMm, widthMm: result.widthMm, heightMm: result.heightMm,
    })) {
      expect(Number.isFinite(value), `${key} muss endlich sein`).toBe(true);
    }
    // Und innerhalb der Grenzen.
    expect(result.xMm).toBeGreaterThanOrEqual(0);
    expect(result.xMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(result.widthMm).toBeGreaterThanOrEqual(1);
    expect(result.heightMm).toBeGreaterThanOrEqual(1);
  });

  it('behandelt nicht-endliche Grenzen wie fehlende Grenzen', () => {
    const result = clampWriterShapeGeometry(
      shape({ xMm: 50_000 }),
      { maxCoordinateMm: Number.NaN, maxWidthMm: Number.POSITIVE_INFINITY },
    );
    expect(result.xMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(result.widthMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
  });

  it('ZWEITE HAUPTZUSICHERUNG: das Ergebnis verlaesst die Grenzen in keiner Richtung', () => {
    const extremes = [
      { xMm: -1e9, yMm: 1e9, widthMm: -1, heightMm: 1e9 },
      { xMm: 0, yMm: 0, widthMm: 1e9, heightMm: 0 },
      { xMm: 9_999, yMm: 9_999, widthMm: 1, heightMm: 1 },
    ];
    for (const over of extremes) {
      const r = clampWriterShapeGeometry(shape(over));
      expect(r.xMm).toBeGreaterThanOrEqual(0);
      expect(r.xMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
      expect(r.yMm).toBeGreaterThanOrEqual(0);
      expect(r.yMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
      expect(r.widthMm).toBeGreaterThanOrEqual(1);
      expect(r.widthMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
      expect(r.heightMm).toBeGreaterThanOrEqual(0);
      expect(r.heightMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
    }
  });

  it('ist idempotent — zweimal klemmen aendert nichts mehr', () => {
    const once = clampWriterShapeGeometry(shape({ xMm: -10, widthMm: 1e6 }));
    expect(clampWriterShapeGeometry(once)).toBe(once);
  });
});

describe('bringShapeToFront und sendShapeToBack — die Z-Ordnung', () => {
  const stack = () => [
    shape({ id: 'a', zIndex: 1 }),
    shape({ id: 'b', zIndex: 5 }),
    shape({ id: 'c', zIndex: 3 }),
  ];

  it('bringShapeToFront setzt die Zielform ueber das hoechste vorhandene z', () => {
    const result = bringShapeToFront(stack(), 'a');
    const a = result.find((s) => s.id === 'a');
    const maxOther = Math.max(...result.filter((s) => s.id !== 'a').map((s) => s.zIndex ?? 1));
    expect(a?.zIndex).toBeGreaterThan(maxOther);
  });

  it('bringShapeToFront laesst die anderen Formen unveraendert — dieselbe Objektidentitaet', () => {
    const before = stack();
    const result = bringShapeToFront(before, 'a');
    expect(result.find((s) => s.id === 'b')).toBe(before.find((s) => s.id === 'b'));
    expect(result.find((s) => s.id === 'c')).toBe(before.find((s) => s.id === 'c'));
  });

  it('sendShapeToBack setzt die Zielform unter das niedrigste vorhandene z', () => {
    const result = sendShapeToBack(stack(), 'b');
    const b = result.find((s) => s.id === 'b');
    const minOther = Math.min(...result.filter((s) => s.id !== 'b').map((s) => s.zIndex ?? 1));
    expect(b?.zIndex).toBeLessThan(minOther);
  });

  it('GEMESSEN: wiederholtes bringShapeToFront erhoeht z weiter — es ist NICHT idempotent', () => {
    // Der erste Entwurf behauptete Idempotenz. Die Messung widerlegt sie: `maxZ` schliesst den eigenen
    // z-Wert der Zielform ein, also waechst z bei jedem Aufruf um eins weiter (6, dann 7, ...).
    // **Das ist kein Fehler, den dieser Test behebt — es ist Verhalten, das er festhaelt.** Innerhalb eines
    // Dokuments ist z relativ, also bleibt die Ordnung korrekt; wer die Funktion aber als idempotent
    // voraussetzt, irrt. Genau das war mein Irrtum.
    const before = stack();
    const once = bringShapeToFront(before, 'a');
    const twice = bringShapeToFront(once, 'a');
    const zOnce = once.find((s) => s.id === 'a')?.zIndex ?? 0;
    const zTwice = twice.find((s) => s.id === 'a')?.zIndex ?? 0;
    expect(zTwice).toBe(zOnce + 1);
    // Und die Ordnung bleibt in beiden Faellen erhalten: die Zielform liegt vorn.
    expect(zOnce).toBeGreaterThan(Math.max(...before.filter((s) => s.id !== 'a').map((s) => s.zIndex ?? 1)));
    expect(zTwice).toBeGreaterThan(Math.max(...once.filter((s) => s.id !== 'a').map((s) => s.zIndex ?? 1)));
  });

  it('GEMESSEN: sendShapeToBack setzt auf eine Untergrenze und bleibt dort', () => {
    // Zweiter Messfehler dieses Tests: ich erwartete ein Absinken um eins. Tatsaechlich setzt die Funktion
    // z auf eine feste Untergrenze (0) - und ist damit AN DER GRENZE idempotent, nicht wachsend.
    const before = stack();
    const once = sendShapeToBack(before, 'b');
    const twice = sendShapeToBack(once, 'b');
    const zOnce = once.find((s) => s.id === 'b')?.zIndex ?? -1;
    const zTwice = twice.find((s) => s.id === 'b')?.zIndex ?? -1;
    expect(zOnce).toBe(0);
    expect(zTwice).toBe(zOnce);
    // Und die Zielform liegt hinten.
    expect(zOnce).toBeLessThan(Math.min(...before.filter((s) => s.id !== 'b').map((s) => s.zIndex ?? 1)));
  });

  it('ein unbekanntes Ziel aendert nichts an den z-Werten', () => {
    const before = stack();
    const result = bringShapeToFront(before, 'gibt-es-nicht');
    expect(result.map((s) => s.zIndex)).toEqual(before.map((s) => s.zIndex));
    expect(result.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });
});

/**
 * ## Was hier NICHT steht, und warum
 *
 * `resolveWriterShapesForPageIndex` wird von diesem Test **nicht** geprueft. Zwei Entwuerfe versuchten es mit
 * Erwartungen, die aus dem Namen abgeleitet waren statt aus dem Quelltext — **beide scheiterten**, weil die
 * Funktion ihre Seitenzuordnung anders bezieht als angenommen. **Ich habe ihren Vertrag nicht gelesen, also
 * behaupte ich ihn nicht.** Das ist eine offene Aufgabe, kein erledigter Punkt.
 *
 * Dasselbe gilt fuer `createWriterShape`, `updateWriterShape`, `groupWriterShapes`, `ungroupWriterShapes`,
 * `bringShapeForward`, `sendShapeBackward` und `generateShapeSvgPath` — **sieben der dreizehn Exporte dieses
 * Moduls bleiben ungemessen.** Der Test deckt die Grenzenpruefung und die beiden absoluten Z-Operationen.
 */

describe('groupWriterShapes und ungroupWriterShapes — das symmetrische Paar', () => {
  const shapes = () => [
    shape({ id: 'a', zIndex: 1 }),
    shape({ id: 'b', zIndex: 2 }),
    shape({ id: 'c', zIndex: 3 }),
  ];

  it('gruppiert nicht, wenn weniger als zwei Kennungen uebergeben werden', () => {
    // **Eine Gruppe aus einer Form ist keine Gruppe.** Und das Ergebnis ist eine KOPIE, nicht das Original.
    const original = shapes();
    const none = groupWriterShapes(original, [], () => 'G');
    const one = groupWriterShapes(original, ['a'], () => 'G');
    expect(none).toHaveLength(3);
    expect(one).toHaveLength(3);
    expect(none).not.toBe(original);
    for (const s of one) expect(s.groupId).toBeUndefined();
  });

  it('setzt die Gruppenkennung an genau den gewaehlten Formen', () => {
    const grouped = groupWriterShapes(shapes(), ['a', 'c'], () => 'G-1');
    expect(grouped.find((s) => s.id === 'a')?.groupId).toBe('G-1');
    expect(grouped.find((s) => s.id === 'c')?.groupId).toBe('G-1');
    expect(grouped.find((s) => s.id === 'b')?.groupId).toBeUndefined();
  });

  it('nicht gewaehlte Formen behalten ihre Objektidentitaet', () => {
    const original = shapes();
    const grouped = groupWriterShapes(original, ['a', 'b'], () => 'G-1');
    expect(grouped.find((s) => s.id === 'c')).toBe(original.find((s) => s.id === 'c'));
  });

  it('benutzt die injizierte Kennung — deshalb ist groupIdFactory da', () => {
    const grouped = groupWriterShapes(shapes(), ['a', 'b'], () => 'TEST-GRUPPE');
    expect(grouped.find((s) => s.id === 'a')?.groupId).toBe('TEST-GRUPPE');
  });

  it('HAUPTZUSICHERUNG: gruppieren und aufheben heben sich auf', () => {
    const original = shapes();
    const grouped = groupWriterShapes(original, ['a', 'b'], () => 'G-1');
    const ungrouped = ungroupWriterShapes(grouped, 'G-1');

    // Nach dem Aufheben traegt KEINE Form mehr eine Gruppenkennung.
    for (const s of ungrouped) {
      expect(s.groupId, `Form ${s.id}`).toBeUndefined();
    }
    // Und die Formen sind vollstaendig - keine geht beim Aufheben verloren.
    expect(ungrouped.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('das Aufheben ENTFERNT das Feld, es setzt es nicht auf undefined', () => {
    // Ein gesetztes `undefined` waere im JSON ein fehlender Schluessel, aber `in` unterscheidet die Faelle —
    // und ein Serialisierer, der das Feld kopiert, wuerde es weiterreichen.
    const grouped = groupWriterShapes(shapes(), ['a', 'b'], () => 'G-1');
    const ungrouped = ungroupWriterShapes(grouped, 'G-1');
    expect('groupId' in (ungrouped.find((s) => s.id === 'a') as object)).toBe(false);
  });

  it('hebt nur die genannte Gruppe auf', () => {
    const zweiGruppen = [
      shape({ id: 'a', groupId: 'G-1' }),
      shape({ id: 'b', groupId: 'G-1' }),
      shape({ id: 'c', groupId: 'G-2' }),
    ];
    const nachher = ungroupWriterShapes(zweiGruppen, 'G-1');
    expect(nachher.find((s) => s.id === 'a')?.groupId).toBeUndefined();
    expect(nachher.find((s) => s.id === 'c')?.groupId).toBe('G-2');
  });

  it('eine unbekannte Gruppenkennung aendert nichts', () => {
    const original = [shape({ id: 'a', groupId: 'G-1' })];
    const nachher = ungroupWriterShapes(original, 'gibt-es-nicht');
    expect(nachher[0]?.groupId).toBe('G-1');
    // Und die Form behaelt ihre Identitaet.
    expect(nachher[0]).toBe(original[0]);
  });
});

describe('resolveWriterShapePageIndex — die Seitentreue, mit dem richtigen Vertrag', () => {
  // Eine Seite traegt entweder `fragments` (je mit paragraph.id) ODER `paragraphs` (je mit id).
  // **Beide Wege werden gelesen** - und genau das war der Fehler in r228: ich hatte die Signatur nicht
  // gelesen und die Funktion ohne `pages` aufgerufen.
  const pagesUeberFragments = [
    { fragments: [{ paragraph: { id: 'p0' } }] },
    { fragments: [{ paragraph: { id: 'p1' } }, { paragraph: { id: 'p2' } }] },
  ];
  const pagesUeberParagraphs = [
    { paragraphs: [{ id: 'p0' }] },
    { paragraphs: [{ id: 'p1' }] },
  ];

  it('ohne Anker gehoert die Form auf Seite 0', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: undefined }), pagesUeberFragments)).toBe(0);
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: '' }), pagesUeberFragments)).toBe(0);
  });

  it('ohne Seiten gehoert die Form auf Seite 0', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p1' }), [])).toBe(0);
  });

  it('findet die Seite ueber fragments', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p1' }), pagesUeberFragments)).toBe(1);
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p2' }), pagesUeberFragments)).toBe(1);
  });

  it('findet die Seite ueber paragraphs — der zweite Weg wird ebenfalls gelesen', () => {
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'p1' }), pagesUeberParagraphs)).toBe(1);
  });

  it('HAUPTZUSICHERUNG: ein Anker, den es nicht mehr gibt, faellt auf Seite 0 zurueck', () => {
    // Das ist die einzige deterministische Wahl ohne gespeicherte Seitennummer.
    expect(resolveWriterShapePageIndex(shape({ anchorParagraphId: 'gibt-es-nicht' }), pagesUeberFragments)).toBe(0);
  });

  it('resolveWriterShapesForPageIndex filtert nach der aufgeloesten Seite', () => {
    const shapes = [
      shape({ id: 'a', anchorParagraphId: 'p0' }),
      shape({ id: 'b', anchorParagraphId: 'p1' }),
      shape({ id: 'c', anchorParagraphId: 'p2' }),
    ];
    expect(resolveWriterShapesForPageIndex(shapes, pagesUeberFragments, 1).map((s) => s.id)).toEqual(['b', 'c']);
    expect(resolveWriterShapesForPageIndex(shapes, pagesUeberFragments, 0).map((s) => s.id)).toEqual(['a']);
    // Und eine Seite ohne Formen liefert eine leere Liste, keine Ausnahme.
    expect(resolveWriterShapesForPageIndex(shapes, pagesUeberFragments, 9)).toEqual([]);
  });

  it('ohne Seiten landen alle Formen auf Seite 0 — keine geht verloren', () => {
    const shapes = [shape({ id: 'a', anchorParagraphId: 'p1' }), shape({ id: 'b', anchorParagraphId: 'p2' })];
    expect(resolveWriterShapesForPageIndex(shapes, [], 0)).toHaveLength(2);
  });
});

describe('createWriterShape — die artabhaengigen Standardwerte', () => {
  it('Linie und Pfeil sind flach und breiter, andere Formen nicht', () => {
    const linie = createWriterShape('line', {}, 20, () => 'L');
    expect(linie.widthMm).toBe(60);
    expect(linie.heightMm).toBe(0);
    const rechteck = createWriterShape('rectangle', {}, 20, () => 'R');
    expect(rechteck.widthMm).toBe(50);
    expect(rechteck.heightMm).toBe(35);
  });

  it('Linie und Pfeil haben keine Fuellung, andere schon', () => {
    expect(createWriterShape('line', {}, 20, () => 'L').fillColor).toBeUndefined();
    expect(createWriterShape('arrow', {}, 20, () => 'A').fillColor).toBeUndefined();
    expect(createWriterShape('rectangle', {}, 20, () => 'R').fillColor).toBe('#0f172a');
  });

  it('ein Pfeil traegt eine Spitze am Ende, eine Linie nicht', () => {
    expect(createWriterShape('arrow', {}, 20, () => 'A').arrowEndHead).toBe(true);
    expect(createWriterShape('line', {}, 20, () => 'L').arrowEndHead).toBe(false);
  });

  it('Textfeld und Hinweis bekommen einen Vorgabetext, andere nicht', () => {
    expect(createWriterShape('textbox', {}, 20, () => 'T').text).toBe('Text hier eingeben');
    expect(createWriterShape('callout', {}, 20, () => 'C').text).toBe('Hinweis');
    expect(createWriterShape('rectangle', {}, 20, () => 'R').text).toBeUndefined();
  });

  it('die ERSTE Aufrufkonvention: eine Zahl bedeutet x', () => {
    const s = createWriterShape('rectangle', 123, 45, () => 'R');
    expect(s.xMm).toBe(123);
    expect(s.yMm).toBe(45);
  });

  it('die ZWEITE Aufrufkonvention: ein Objekt bedeutet Optionen', () => {
    const s = createWriterShape('rectangle', { xMm: 77, yMm: 88, widthMm: 12 }, 20, () => 'R');
    expect(s.xMm).toBe(77);
    expect(s.yMm).toBe(88);
    expect(s.widthMm).toBe(12);
  });

  it('die injizierte Kennung wird uebernommen', () => {
    expect(createWriterShape('rectangle', {}, 20, () => 'TEST-ID').id).toBe('TEST-ID');
  });

  it('HAUPTZUSICHERUNG: die Grenzen greifen schon beim Erzeugen', () => {
    // createWriterShape laeuft durch clampWriterShapeGeometry - eine Form kann nicht ausserhalb entstehen.
    const s = createWriterShape('rectangle', { xMm: 99_999, widthMm: Number.POSITIVE_INFINITY }, 20, () => 'R');
    expect(s.xMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);
    expect(Number.isFinite(s.widthMm)).toBe(true);
    expect(s.widthMm).toBeLessThanOrEqual(WRITER_SHAPE_MAX_COORDINATE_MM);
  });

  it('eine Linie mit Breite 0 wird auf die Mindestausdehnung gehoben', () => {
    // MIN_EXTENT_MM gilt fuer die BREITE, auch bei einer Linie.
    expect(createWriterShape('line', { widthMm: 0 }, 20, () => 'L').widthMm).toBe(1);
  });
});

describe('updateWriterShape — der Klemmvorgang NACH dem Patch', () => {
  it('wendet den Patch an', () => {
    const updated = updateWriterShape(shape(), { xMm: 120, text: 'neu' });
    expect(updated.xMm).toBe(120);
    expect(updated.text).toBe('neu');
  });

  it('HAUPTZUSICHERUNG: ein Patch mit NaN oder unendlicher Groesse erreicht das Dokument nicht', () => {
    // Das ist der Zweck des Klammerns NACH dem Patch: der Patch selbst ist feindlich.
    const nan = updateWriterShape(shape(), { xMm: Number.NaN, widthMm: Number.NaN });
    expect(Number.isFinite(nan.xMm)).toBe(true);
    expect(Number.isFinite(nan.widthMm)).toBe(true);

    const unendlich = updateWriterShape(shape(), { xMm: Number.POSITIVE_INFINITY, heightMm: 1e12 });
    // **GEMESSEN und zunaechst falsch angenommen:** finiteOr(Infinity, 0) faellt auf **0** zurueck,
    // nicht auf die Obergrenze. Ein nicht-endlicher Wert wird auf den Ursprung gesetzt, nicht an die
    // Grenze geklemmt. Beides waere vertretbar - aber nur eines ist wahr, und der erste Entwurf
    // erwartete 10000. **Die erste Fehlannahme nach sechs Runden Vertraege-zuerst.**
    expect(unendlich.xMm).toBe(0);
    // 1e12 dagegen IST endlich und wird deshalb an die Obergrenze geklemmt.
    expect(unendlich.heightMm).toBe(WRITER_SHAPE_MAX_COORDINATE_MM);

    const negativ = updateWriterShape(shape(), { xMm: -500, widthMm: -5 });
    expect(negativ.xMm).toBe(0);
    expect(negativ.widthMm).toBeGreaterThanOrEqual(1);
  });

  it('ein Patch ohne Geometrie laesst die Geometrie unveraendert', () => {
    const vorher = shape({ xMm: 33, yMm: 44 });
    const nachher = updateWriterShape(vorher, { text: 'nur Text' });
    expect(nachher.xMm).toBe(33);
    expect(nachher.yMm).toBe(44);
    expect(nachher.widthMm).toBe(vorher.widthMm);
  });

  it('ist zweimal angewendet stabil', () => {
    const einmal = updateWriterShape(shape(), { xMm: 99_999 });
    const zweimal = updateWriterShape(einmal, { xMm: 99_999 });
    expect(zweimal.xMm).toBe(einmal.xMm);
  });
});

describe('bringShapeForward und sendShapeBackward — und ihre Asymmetrie', () => {
  const stack = () => [
    shape({ id: 'a', zIndex: 1 }),
    shape({ id: 'b', zIndex: 5 }),
    shape({ id: 'c', zIndex: 3 }),
  ];
  const zOf = (list: WriterShapeBlockData[], id: string) => list.find((s) => s.id === id)?.zIndex;

  it('bringShapeForward erhoeht um genau eins', () => {
    expect(zOf(bringShapeForward(stack(), 'b'), 'b')).toBe(6);
    expect(zOf(bringShapeForward(stack(), 'a'), 'a')).toBe(2);
  });

  it('sendShapeBackward senkt um genau eins', () => {
    expect(zOf(sendShapeBackward(stack(), 'b'), 'b')).toBe(4);
  });

  it('HAUPTZUSICHERUNG: nur sendShapeBackward hat einen Boden', () => {
    // **Die Asymmetrie ist gemessen, nicht angenommen.** Rueckwaerts bleibt bei 0 stehen;
    // vorwaerts gibt es keine Obergrenze - wiederholtes Aufrufen waechst unbeschraenkt.
    let nachVorn = stack();
    for (let i = 0; i < 50; i += 1) nachVorn = bringShapeForward(nachVorn, 'a');
    expect(zOf(nachVorn, 'a')).toBe(51);

    // **Zeile hier entfernt (Runde 277):** sie lautete
    // `let nachHinten = shape([{ id: 'a', zIndex: 2 }]) as unknown as WriterShapeBlockData[];` —
    // **sie uebergab ein ARRAY an `shape()`, das ein Objekt erwartet, und wurde in der naechsten Zeile
    // sofort ueberschrieben.** Toter Code, der erst durch `tsc -b` sichtbar wurde.
    let nachHinten = [shape({ id: 'a', zIndex: 2 })];
    for (let i = 0; i < 50; i += 1) nachHinten = sendShapeBackward(nachHinten, 'a');
    expect(zOf(nachHinten, 'a')).toBe(0);
  });

  it('ZWEITE ZUSICHERUNG: beide sind um eins verschoben zueinander, aber nicht rueckgaengig', () => {
    // Hin und zurueck ergibt den Ausgangswert nur, solange der Boden nicht greift.
    const vor = zOf(bringShapeForward(stack(), 'c'), 'c');
    const zurueck = zOf(sendShapeBackward(bringShapeForward(stack(), 'c'), 'c'), 'c');
    expect(vor).toBe(4);
    expect(zurueck).toBe(3); // Ausgangswert
    // Am Boden dagegen nicht mehr: 0 -> 1 -> 0, aber 1 -> 0 -> 1 -> 0 ist kein Rundlauf.
    const amBoden = [shape({ id: 'x', zIndex: 0 })];
    expect(zOf(bringShapeForward(amBoden, 'x'), 'x')).toBe(1);
    const zurueckVomBoden = sendShapeBackward(sendShapeBackward(bringShapeForward(amBoden, 'x'), 'x'), 'x');
    expect(zOf(zurueckVomBoden, 'x')).toBe(0);
  });

  it('nicht adressierte Formen behalten ihre Objektidentitaet', () => {
    const original = stack();
    expect(bringShapeForward(original, 'a').find((s) => s.id === 'b')).toBe(original.find((s) => s.id === 'b'));
    expect(sendShapeBackward(original, 'a').find((s) => s.id === 'c')).toBe(original.find((s) => s.id === 'c'));
  });

  it('ein unbekanntes Ziel aendert nichts', () => {
    const original = stack();
    expect(bringShapeForward(original, 'gibt-es-nicht').map((s) => s.zIndex)).toEqual(original.map((s) => s.zIndex));
    expect(sendShapeBackward(original, 'gibt-es-nicht').map((s) => s.zIndex)).toEqual(original.map((s) => s.zIndex));
  });
});

describe('generateShapeSvgPath — Pfaddaten je Formart', () => {
  /** Der switch prueft 'rectangle' - NICHT 'rect'. Der Helfer dieser Datei baut 'rect' fuer die anderen Tests. */
  const of = (kind: string, over: Record<string, unknown> = {}) =>
    generateShapeSvgPath(shape({ shapeKind: kind, ...over }), 100, 60);

  it('HAUPTZUSICHERUNG: kein Pfad enthaelt NaN oder Infinity — auch bei unbrauchbaren Massen', () => {
    // Das ist die Zusicherung, die zaehlt: ein NaN im Pfad macht das ganze SVG unbrauchbar.
    for (const [w, h] of [[0, 0], [-10, -10], [Number.NaN, 50], [50, Number.POSITIVE_INFINITY]] as const) {
      for (const kind of ['rectangle', 'rounded-rectangle', 'ellipse', 'line', 'arrow', 'textbox']) {
        const { path } = generateShapeSvgPath(shape({ shapeKind: kind }), w, h);
        expect(path, `${kind} bei ${w}x${h}`).not.toContain('NaN');
        expect(path, `${kind} bei ${w}x${h}`).not.toContain('Infinity');
        expect(path.length).toBeGreaterThan(0);
      }
    }
  });

  it('erzwingt ein Mindestmass von 1', () => {
    // Bei 0x0 muss der Pfad trotzdem ein Rechteck der Groesse 1x1 sein.
    const { path } = generateShapeSvgPath(shape({ shapeKind: 'rectangle' }), 0, 0);
    expect(path).toBe('M 0 0 L 1 0 L 1 1 L 0 1 Z');
  });

  it('Rechteck und Textfeld sind geschlossene Rechtecke', () => {
    for (const kind of ['rectangle', 'textbox']) {
      const { path, isClosed } = of(kind);
      expect(isClosed, kind).toBe(true);
      expect(path.endsWith('Z'), kind).toBe(true);
      expect(path).toContain('M 0 0');
    }
  });

  it('Linie und Pfeil sind NICHT geschlossen und liegen waagerecht in der Mitte', () => {
    for (const kind of ['line', 'arrow']) {
      const { path, isClosed } = of(kind);
      expect(isClosed, kind).toBe(false);
      expect(path, kind).not.toContain('Z');
      // h = 60 -> die Linie liegt auf y = 30.
      expect(path).toBe('M 0 30 L 100 30');
    }
  });

  it('das abgerundete Rechteck hat einen Radius, der nie die halbe Kante ueberschreitet', () => {
    // r = min(16, w/4, h/4) - bei 100x60 also 15.
    const { path, isClosed } = of('rounded-rectangle');
    expect(isClosed).toBe(true);
    expect(path).toContain('Q');
    expect(path).toContain('15');
    // Bei einem winzigen Rechteck schrumpft der Radius mit.
    const klein = generateShapeSvgPath(shape({ shapeKind: 'rounded-rectangle' }), 4, 4);
    expect(klein.path).not.toContain('16');
  });

  it('die Ellipse wird als zwei Boegen gezeichnet und meldet ihr Zusatzelement', () => {
    const { path, isClosed, extraElements } = of('ellipse');
    expect(isClosed).toBe(true);
    expect(extraElements).toBe('ellipse');
    expect((path.match(/A /g) ?? []).length).toBe(2);
  });

  it('ist deterministisch', () => {
    expect(of('rounded-rectangle')).toEqual(of('rounded-rectangle'));
  });
});

/**
 * Der Formen-Einfuegeweg der Shell (Befund N3): `insertShapeToDoc` darf einen Erfolg **nur** melden, wenn
 * es das Dokument wirklich veraendert hat.
 *
 * Gemessen vor der Reparatur: fuer ein Writer- und fuer ein Draw-Dokument gab die Funktion **dasselbe**
 * Dokument zurueck **und** die Meldung `Inserted rectangle`. `shell/workspace/useWorkspaceActions.ts:274`
 * zeigt genau diese Meldung als Toast — ein Erfolg fuer ein unveraendertes Dokument.
 *
 * **Erreichbarkeit, gemessen:** Den Writer erreicht dieser Weg heute nicht, weil die AdaptiveToolbar fuer
 * Writer gar nicht gerendert wird (`app/WorkspaceApplicationFrame.tsx:146`); Writers eigener Weg
 * (`editor/useWriterState.ts:557` -> `persistWriterData`) ist real. Fuer **Draw** und fuer eine
 * **Praesentation ohne Folie** ist der Weg ueber die sichtbare Toolbar dagegen erreichbar. Beide Faelle
 * stehen hier, damit die Funktion fuer *keinen* Dokumentart einen Erfolg erfindet.
 *
 * Die vier Faelle sind vor der Reparatur rot: `changed` existiert nicht (`undefined`) und die Meldung
 * lautet `Inserted rectangle` statt der Verweigerung.
 */
function workspaceDocument(kind: DocumentKind, over: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: `doc-${kind}`,
    title: `Untitled-${kind}`,
    kind,
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    ...over,
  };
}

describe('insertShapeToDoc — Erfolg nur bei wirklicher Aenderung', () => {
  it('gibt fuer ein Writer-Dokument DASSELBE Dokument zurueck und meldet keine Einfuegung', () => {
    const writer = workspaceDocument('Writer');
    const result = insertShapeToDoc(writer, 'rectangle');
    expect(result.updatedDoc).toBe(writer);
    expect(result.updatedDoc.version).toBe(1);
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/^shape insert rejected/i);
  });

  it('gibt fuer ein Draw-Dokument DASSELBE Dokument zurueck und meldet keine Einfuegung', () => {
    // Der ueber die AdaptiveToolbar erreichbare Fall: `Draw` steht in `OPEN_CORE_APP_KINDS`
    // (`edition/contracts.ts:57`) und passiert das Tor in `WorkspaceApplicationFrame.tsx:146`.
    const draw = workspaceDocument('Draw');
    const result = insertShapeToDoc(draw, 'circle');
    expect(result.message).toMatch(/^shape insert rejected/i);
    expect(result.updatedDoc).toBe(draw);
    expect(result.changed).toBe(false);
  });

  it('verweigert fuer eine Praesentation ohne Folie, statt einen Erfolg zu melden', () => {
    const empty = workspaceDocument('Present', { presentData: { slides: [] } });
    const result = insertShapeToDoc(empty, 'rectangle');
    expect(result.updatedDoc).toBe(empty);
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/^shape insert rejected/i);
  });

  it('meldet Erfolg genau dann, wenn es eingefuegt hat (Praesentation mit Folie)', () => {
    const present = workspaceDocument('Present', {
      presentData: {
        slides: [{ id: 'slide-1', title: 'Titel', subtitle: 'Untertitel', layout: 'cards', cards: [] }],
        theme: 'dark',
        aspectRatio: '16:9',
      },
    });
    const result = insertShapeToDoc(present, 'rectangle');
    expect(result.changed).toBe(true);
    expect(result.updatedDoc).not.toBe(present);
    expect(result.updatedDoc.version).toBe(present.version + 1);
    /**
     * PR-003 (Present M1) — the inserted shape is a **scene object**, not a legacy card.
     *
     * The old expectation (`cards.length === 1`) described a second model family that the free
     * canvas never rendered and the Present history never saw. Asserting the new authority keeps
     * this writer-side reachability check meaningful: it still proves "changed means changed",
     * but now on the family the user actually edits.
     */
    expect(result.updatedDoc.presentData?.slides[0]?.cards ?? [], 'keine Legacy-Karte').toHaveLength(0);
    const sceneObjects = result.updatedDoc.presentData?.slides[0]?.sceneObjects ?? [];
    expect(sceneObjects, 'genau eine echte Szenenform').toHaveLength(1);
    expect(sceneObjects[0]!.kind).toBe('shape');
  });
});
