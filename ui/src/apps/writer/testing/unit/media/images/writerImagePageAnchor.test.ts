/**
 * P25 / AST-0121 — der Seitenanker: `resolveWriterImagePageAnchor`.
 *
 * ## Der Vertrag, aus dem Quelltext gelesen
 *
 * ```ts
 * if (!isWriterImageFixedToPage(image)) return undefined;   // das TOR
 * const xMm = safeMm(image.horizontalOffsetMm);
 * const target = image.anchorTarget ?? 'page';
 * if (!geometry || target === 'page') return { left: `${xMm}mm`, top: `${yMm}mm` };
 * if (target === 'margin') return { left: `calc(${marginsPx.left}px + ${xMm}mm)`, ... };
 * if (target === 'column') { /* Spaltenbreiten aufsummieren *\/ }
 * ```
 *
 * * **Das Tor zuerst:** ein nicht fixiertes Bild hat **gar keinen** Anker — `undefined`, kein Objekt mit
 *   Nullen. Eine Anzeige muss diesen Unterschied sehen koennen.
 * * `safeMm` klemmt auf `[-1000, 1000]` und ersetzt nicht-endliche Werte durch 0.
 * * **Drei verschiedene Ergebnisse je nach `anchorTarget`** — und ohne Geometrie faellt alles auf
 *   Millimeter zurueck, weil es dann nichts zu rechnen gibt.
 * * Bei `column` werden die Breiten der VORHERIGEN Spalten plus die Abstaende aufsummiert.
 */

import { describe, expect, it } from 'vitest';
import { resolveWriterImagePageAnchor } from '../../../../media/images/operations/writerMediaOperations';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/workspace';

const image = (over: Record<string, unknown> = {}): WriterImageBlockData =>
  ({ id: 'img-1', dataUrl: 'data:image/png;base64,AA', fixPositionOnPage: true, ...over } as unknown as WriterImageBlockData);

const geometry = (over: Record<string, unknown> = {}) => ({
  marginsPx: { left: 50, top: 40, right: 50, bottom: 40 },
  columnCount: 3,
  columnWidthPx: 200,
  columnGapPx: 20,
  ...over,
} as never);

describe('resolveWriterImagePageAnchor — das Tor und die drei Ziele', () => {
  it('HAUPTZUSICHERUNG: ein NICHT fixiertes Bild hat gar keinen Anker', () => {
    // `undefined`, nicht `{left: '0mm', top: '0mm'}` - der Unterschied ist fuer die Anzeige wesentlich.
    expect(resolveWriterImagePageAnchor(image({ fixPositionOnPage: false, anchorTarget: undefined }))).toBeUndefined();
    // Und jede der fuenf Fixierungsbedingungen oeffnet das Tor.
    expect(resolveWriterImagePageAnchor(image({ moveWithText: false }))).toBeDefined();
    expect(resolveWriterImagePageAnchor(image({ anchorTarget: 'page' }))).toBeDefined();
  });

  it('ohne Geometrie faellt alles auf Millimeter zurueck', () => {
    const result = resolveWriterImagePageAnchor(image({ horizontalOffsetMm: 30, verticalOffsetMm: 45 }));
    expect(result).toEqual({ left: '30mm', top: '45mm' });
  });

  it('das Ziel page ergibt Millimeter, auch MIT Geometrie', () => {
    const result = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'page', horizontalOffsetMm: 10, verticalOffsetMm: 20 }),
      geometry(),
    );
    expect(result).toEqual({ left: '10mm', top: '20mm' });
  });

  it('das Ziel margin addiert die Seitenraender in Pixeln', () => {
    const result = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'margin', horizontalOffsetMm: 5, verticalOffsetMm: 7 }),
      geometry(),
    );
    expect(result).toEqual({ left: 'calc(50px + 5mm)', top: 'calc(40px + 7mm)' });
  });

  it('das Ziel column summiert die Breiten der vorherigen Spalten — EINS-basierter Index', () => {
    // **GEMESSEN und zunaechst falsch angenommen:** die Formel lautet
    //   `Math.max(0, Math.min(widths.length - 1, Math.trunc((anchorColumnIndex ?? 1) - 1)))`
    // `anchorColumnIndex` ist also **eins-basiert**, und der Standard ist 1 - die erste Spalte.
    // Ich hatte null-basiert gerechnet und drei Tests damit falsch erwartet.
    //
    // Spalte 2 (eins-basiert) -> interner Index 1 -> EINE Iteration: 50 + (200 + 20) = 270.
    const result = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'column', anchorColumnIndex: 2, horizontalOffsetMm: 0, verticalOffsetMm: 0 }),
      geometry(),
    );
    expect(result?.left).toBe('calc(270px + 0mm)');
    expect(result?.top).toBe('calc(40px + 0mm)');
  });

  it('der Spaltenindex 1 und ein fehlender Index ergeben dieselbe Position', () => {
    // Der Standard ist 1, nicht 0.
    const explizit = resolveWriterImagePageAnchor(image({ anchorTarget: 'column', anchorColumnIndex: 1 }), geometry());
    const ohne = resolveWriterImagePageAnchor(image({ anchorTarget: 'column' }), geometry());
    expect(explizit?.left).toBe('calc(50px + 0mm)');
    expect(ohne?.left).toBe(explizit?.left);
  });

  it('HAUPTZUSICHERUNG: ein Spaltenindex ausserhalb wird geklemmt, nicht verrechnet', () => {
    // Der letzte gueltige eins-basierte Index ist die Spaltenzahl (3) -> interner Index 2.
    const letzte = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'column', anchorColumnIndex: 3 }),
      geometry(),
    );
    expect(letzte?.left).toBe('calc(490px + 0mm)'); // 50 + 220 + 220

    // Ein Index weit darueber landet auf derselben Position - nicht dahinter.
    const weit = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'column', anchorColumnIndex: 99 }),
      geometry(),
    );
    expect(weit?.left).toBe(letzte?.left);

    // Und ein Index unter 1 faellt auf die erste Spalte.
    const unterEins = resolveWriterImagePageAnchor(image({ anchorTarget: 'column', anchorColumnIndex: 0 }), geometry());
    const negativ = resolveWriterImagePageAnchor(image({ anchorTarget: 'column', anchorColumnIndex: -5 }), geometry());
    expect(unterEins?.left).toBe('calc(50px + 0mm)');
    expect(negativ?.left).toBe(unterEins?.left);
  });

  it('fehlende Spaltenbreiten werden aus der Anzahl und der Einzelbreite gebildet', () => {
    const ohneBreiten = geometry({ columnWidthsPx: undefined, columnCount: 2, columnWidthPx: 100 });
    // Eins-basierter Index 2 -> interner Index 1 -> EINE Iteration: 50 + (100 + 20) = 170.
    const zweite = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'column', anchorColumnIndex: 2 }),
      ohneBreiten,
    );
    expect(zweite?.left).toBe('calc(170px + 0mm)');
    // Und die erste Spalte bleibt am Rand.
    const erste = resolveWriterImagePageAnchor(
      image({ anchorTarget: 'column', anchorColumnIndex: 1 }),
      ohneBreiten,
    );
    expect(erste?.left).toBe('calc(50px + 0mm)');
  });

  it('HAUPTZUSICHERUNG: nicht-endliche Versaetze vergiften die Position nicht', () => {
    // `safeMm` klemmt auf [-1000, 1000] und ersetzt Nicht-Endliches durch 0.
    const nan = resolveWriterImagePageAnchor(image({ horizontalOffsetMm: Number.NaN, verticalOffsetMm: Number.NaN }));
    expect(nan?.left).toBe('0mm');
    expect(nan?.top).toBe('0mm');

    const unendlich = resolveWriterImagePageAnchor(image({ horizontalOffsetMm: Number.POSITIVE_INFINITY }));
    expect(unendlich?.left).toBe('0mm');

    const zuGross = resolveWriterImagePageAnchor(image({ horizontalOffsetMm: 999_999 }));
    expect(zuGross?.left).toBe('1000mm');
    const zuKlein = resolveWriterImagePageAnchor(image({ horizontalOffsetMm: -999_999 }));
    expect(zuKlein?.left).toBe('-1000mm');
  });

  it('ist deterministisch', () => {
    const einmal = resolveWriterImagePageAnchor(image({ anchorTarget: 'margin' }), geometry());
    expect(resolveWriterImagePageAnchor(image({ anchorTarget: 'margin' }), geometry())).toEqual(einmal);
  });
});
