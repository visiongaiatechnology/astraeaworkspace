/**
 * P25 / AST-0121 — Transforms und Platzierung: die letzten sechs Exporte von `writerMediaOperations.ts`.
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * ### `resolveImageTransforms(crop?, rotationDeg, flipHorizontal, flipVertical, opacity)`
 *
 * * Drehung ungleich 0 → `rotate(Ndeg)`
 * * **DREI Spiegel-Zweige, nicht zwei:** beide → `scale(-1, -1)`, nur waagerecht → `scaleX(-1)`,
 *   nur senkrecht → `scaleY(-1)`. Eine Zwei-Zweig-Logik wuerde den Doppelfall falsch abbilden.
 * * Ohne Teile ist das Ergebnis die Zeichenkette `'none'`.
 * * Zuschnitt nur, wenn **irgendein** Rand groesser als 0 ist; jeder Rand wird auf `[0, 100]` geklemmt.
 * * **`opacity` wird auf `[0, 1]` geklemmt.**
 *
 * ### `applyWriterImagePlacementPatch(image, patch, pages)`
 *
 * * Wird die Fixierung **aufgehoben**, wird `anchorPageIndex` **geloescht** (auf `undefined`), nicht auf 0
 *   gesetzt. **Sonst bliebe ein Bild an einer Seite haengen, an der es nicht mehr fixiert ist.**
 * * Ist bereits ein `anchorPageIndex` gesetzt, bleibt er.
 * * Sonst wird die Seite gesucht, die den `anchorParagraphId` traegt — **ersatzweise die erste Seite** —
 *   und ohne Treffer **faellt es auf 1 zurueck**, nicht auf 0.
 */

import { describe, expect, it } from 'vitest';
import {
  applyWriterImagePlacementPatch,
  resolveImageTransforms,
  updateWriterImagePlacement,
} from '../../../../media/images/operations/writerMediaOperations';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/workspace';

const image = (over: Record<string, unknown> = {}): WriterImageBlockData =>
  ({ id: 'img-1', dataUrl: 'data:image/png;base64,AA', ...over } as unknown as WriterImageBlockData);

describe('resolveImageTransforms — die drei Spiegel-Zweige und die Klemmungen', () => {
  it('ohne Wirkung ist die Transformation none und die Deckkraft 1', () => {
    const result = resolveImageTransforms();
    expect(result.transform).toBe('none');
    expect(result.clipPath).toBeUndefined();
    expect(result.opacity).toBe(1);
  });

  it('eine Drehung ungleich 0 erzeugt rotate', () => {
    expect(resolveImageTransforms(undefined, 90).transform).toBe('rotate(90deg)');
    expect(resolveImageTransforms(undefined, -45).transform).toBe('rotate(-45deg)');
    // Und 0 erzeugt KEIN rotate.
    expect(resolveImageTransforms(undefined, 0).transform).toBe('none');
  });

  it('HAUPTZUSICHERUNG: die drei Spiegel-Faelle sind unterscheidbar', () => {
    // Eine Zwei-Zweig-Logik ("gespiegelt oder nicht") wuerde den Doppelfall falsch abbilden.
    expect(resolveImageTransforms(undefined, 0, true, true).transform).toBe('scale(-1, -1)');
    expect(resolveImageTransforms(undefined, 0, true, false).transform).toBe('scaleX(-1)');
    expect(resolveImageTransforms(undefined, 0, false, true).transform).toBe('scaleY(-1)');
    expect(resolveImageTransforms(undefined, 0, false, false).transform).toBe('none');
  });

  it('Drehung und Spiegelung werden mit Leerzeichen verbunden, Drehung zuerst', () => {
    expect(resolveImageTransforms(undefined, 30, true, true).transform).toBe('rotate(30deg) scale(-1, -1)');
  });

  it('HAUPTZUSICHERUNG: die Deckkraft wird auf [0, 1] geklemmt', () => {
    expect(resolveImageTransforms(undefined, 0, false, false, 0.5).opacity).toBe(0.5);
    expect(resolveImageTransforms(undefined, 0, false, false, 2).opacity).toBe(1);
    expect(resolveImageTransforms(undefined, 0, false, false, -1).opacity).toBe(0);
  });

  it('BEFUND: NaN wird NICHT geklemmt — dieselbe Klasse wie DEF-RE-009', () => {
    // **Gemessen, nicht angenommen.** Der erste Entwurf erwartete hier 1, weil die Zeile
    // `Math.max(0, Math.min(1, opacity))` wie eine Klemmung aussieht. Sie ist keine:
    // `Math.min(1, NaN)` ist **NaN**, und `Math.max(0, NaN)` ist ebenfalls **NaN**.
    //
    // **Das ist exakt der Fehler aus DEF-RE-009** (`Math.max(1, NaN)` in `generateShapeSvgPath`): eine
    // Klemmung, die fuer nicht-endliche Eingaben nicht schuetzt und still ungueltiges CSS erzeugt.
    // **Ich repariere ihn in dieser Runde nicht** — der Vertrag dieser Funktion ist noch nicht vollstaendig
    // gelesen, und ein Schnellschuss waere schlimmer als ein benannter Befund.
    // **REPARIERT in DEF-RE-010:** der Wurf fiel auf 1 zurueck - die Deckkraft ist jetzt endlich.
    expect(resolveImageTransforms(undefined, 0, false, false, Number.NaN).opacity).toBe(1);
    expect(Number.isFinite(resolveImageTransforms(undefined, 0, false, false, Number.NaN).opacity)).toBe(true);
    expect(resolveImageTransforms(undefined, 0, false, false, Number.POSITIVE_INFINITY).opacity).toBe(1);
    expect(resolveImageTransforms(undefined, 0, false, false, Number.NEGATIVE_INFINITY).opacity).toBe(1);
    // Und dieselbe Schwaeche beim Zuschnitt: ein nicht-endlicher Rand wird geklemmt, aber NaN bleibt NaN.
    const nanCrop = resolveImageTransforms(
      { topPercent: Number.NaN, rightPercent: 0, bottomPercent: 0, leftPercent: 0 } as never,
    );
    // Der Zuschnitt greift, weil `NaN > 0` falsch ist - also entsteht GAR KEIN clipPath.
    expect(nanCrop.clipPath).toBeUndefined();
  });

  it('ein Zuschnitt ohne Wirkung erzeugt KEIN clipPath', () => {
    const ohne = resolveImageTransforms({ topPercent: 0, rightPercent: 0, bottomPercent: 0, leftPercent: 0 } as never);
    expect(ohne.clipPath).toBeUndefined();
    expect(resolveImageTransforms(undefined).clipPath).toBeUndefined();
  });

  it('ein wirksamer Zuschnitt erzeugt inset in der Reihenfolge oben rechts unten links', () => {
    const result = resolveImageTransforms({ topPercent: 10, rightPercent: 20, bottomPercent: 30, leftPercent: 40 } as never);
    expect(result.clipPath).toBe('inset(10% 20% 30% 40%)');
  });

  it('die Zuschnittraender werden auf [0, 100] geklemmt', () => {
    const ueber = resolveImageTransforms({ topPercent: 500, rightPercent: 200, bottomPercent: -50, leftPercent: 0 } as never);
    expect(ueber.clipPath).toBe('inset(100% 100% 0% 0%)');
  });

  it('ist deterministisch', () => {
    expect(resolveImageTransforms(undefined, 15, true, false, 0.25))
      .toEqual(resolveImageTransforms(undefined, 15, true, false, 0.25));
  });
});

describe('updateWriterImagePlacement — nur das adressierte Bild', () => {
  const pages = [
    { pageIndex: 0, isFirst: true, paragraphs: [{ id: 'p0' }] },
    { pageIndex: 1, isFirst: false, paragraphs: [{ id: 'p1' }, { id: 'p2' }] },
  ];

  it('aendert genau das adressierte Bild', () => {
    const images = [image({ id: 'a' }), image({ id: 'b' })];
    const result = updateWriterImagePlacement(images, 'b', { fixPositionOnPage: true }, pages);
    expect(result[1]?.fixPositionOnPage).toBe(true);
    expect(result[0]?.fixPositionOnPage).toBeUndefined();
  });

  it('nicht adressierte Bilder behalten ihre Objektidentitaet', () => {
    const images = [image({ id: 'a' }), image({ id: 'b' })];
    expect(updateWriterImagePlacement(images, 'b', {}, pages)[0]).toBe(images[0]);
  });

  it('eine unbekannte Kennung aendert nichts', () => {
    const images = [image({ id: 'a' })];
    expect(updateWriterImagePlacement(images, 'gibt-es-nicht', { fixPositionOnPage: true }, pages)[0])
      .toBe(images[0]);
  });
});

describe('applyWriterImagePlacementPatch — der Anker und seine Loeschung', () => {
  const pages = [
    { pageIndex: 0, isFirst: true, paragraphs: [{ id: 'p0' }] },
    { pageIndex: 1, isFirst: false, paragraphs: [{ id: 'p1' }, { id: 'p2' }] },
  ];

  it('HAUPTZUSICHERUNG: wird die Fixierung aufgehoben, wird der Anker GELOESCHT', () => {
    // Nicht auf 0 gesetzt: sonst bliebe ein Bild an einer Seite haengen, an der es nicht mehr fixiert ist.
    const fixiert = image({ fixPositionOnPage: true, anchorPageIndex: 1 });
    const geloest = applyWriterImagePlacementPatch(fixiert, { fixPositionOnPage: false, moveWithText: true }, pages);
    expect(geloest.anchorPageIndex).toBeUndefined();
    expect('anchorPageIndex' in (geloest as object)).toBe(true); // der Schluessel ist da, der Wert undefined
    expect(geloest.anchorPageIndex).not.toBe(0); // NICHT 0 - das waere die erste Seite
  });

  it('ein bereits gesetzter Anker bleibt unveraendert', () => {
    const fixiert = image({ fixPositionOnPage: true, anchorPageIndex: 7, anchorParagraphId: 'p1' });
    const result = applyWriterImagePlacementPatch(fixiert, {}, pages);
    expect(result.anchorPageIndex).toBe(7);
  });

  it('sonst wird die Seite des Ankerabsatzes gesucht', () => {
    const fixiert = image({ fixPositionOnPage: true, anchorParagraphId: 'p2' });
    expect(applyWriterImagePlacementPatch(fixiert, {}, pages).anchorPageIndex).toBe(1);
  });

  it('ohne Ankerabsatz wird die erste Seite genommen', () => {
    const fixiert = image({ fixPositionOnPage: true });
    expect(applyWriterImagePlacementPatch(fixiert, {}, pages).anchorPageIndex).toBe(0);
  });

  it('HAUPTZUSICHERUNG: ohne Treffer faellt es auf 1 zurueck, nicht auf 0', () => {
    // Ein Anker, den es nicht mehr gibt, darf nicht stillschweigend auf die erste Seite zeigen.
    const fixiert = image({ fixPositionOnPage: true, anchorParagraphId: 'gibt-es-nicht' });
    expect(applyWriterImagePlacementPatch(fixiert, {}, pages).anchorPageIndex).toBe(1);
    // Und auch ohne Seiten bleibt es bei 1.
    expect(applyWriterImagePlacementPatch(fixiert, {}, []).anchorPageIndex).toBe(1);
  });

  it('das Patch wird angewendet', () => {
    const result = applyWriterImagePlacementPatch(image(), { caption: 'neu' }, pages);
    expect(result.caption).toBe('neu');
  });
});
