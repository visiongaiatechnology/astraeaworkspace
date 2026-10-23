/**
 * P25 / AST-0121 — das Bildbudget und die Textgrenzen: `writerImageBoundary.ts`.
 *
 * ## Warum diese Funktionen zaehlen
 *
 * Der Kommentar nennt den Befund selbst: *"was answered in the import path, in the layout and in the save
 * path, each with its own rules"* — **dieselbe Frage an drei Stellen, dreimal beantwortet.** Und:
 * *"without it the sum was unbounded."*
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * * `WRITER_IMAGE_MAX_OUTPUT_BYTES` = 24 MiB · **`WRITER_IMAGE_MAX_DOCUMENT_BYTES` = 3 x 24 MiB** —
 *   *"Three maximum-sized images fit; a fourth is refused."*
 * * `WRITER_IMAGE_MAX_ALT_TEXT_LENGTH` = 250 · `WRITER_IMAGE_MAX_CAPTION_LENGTH` = 1024.
 * * `measureWriterImageBytes` **dekodiert NICHT** — es schaetzt aus der Laenge:
 *   `ceil(payload * 3/4) + max(0, commaIndex + 1)`. Die `3/4` ist das Base64-Verhaeltnis.
 * * `wouldExceedWriterImageBudget` ist eine **Vorhersage**: *"nothing already in the document is removed,
 *   so the check can never destroy existing content."* **Der Test prueft, dass das stimmt.**
 */

import { describe, expect, it } from 'vitest';
import {
  WRITER_IMAGE_MAX_ALT_TEXT_LENGTH,
  WRITER_IMAGE_MAX_CAPTION_LENGTH,
  WRITER_IMAGE_MAX_DOCUMENT_BYTES,
  WRITER_IMAGE_MAX_OUTPUT_BYTES,
  measureWriterDocumentImageBytes,
  measureWriterImageBytes,
  resolveWriterImageBudget,
  validateWriterImageAltText,
  validateWriterImageCaption,
  wouldExceedWriterImageBudget,
} from '../../../../media/images/operations/writerImageBoundary';
import type { WriterImageBlockData } from '../../../../../../shared/contracts/workspace';

const MIB = 1024 * 1024;

/** Ein Daten-URL mit exakt `payloadChars` Zeichen base64 nach dem Komma. */
function dataUrl(payloadChars: number): string {
  return `data:image/png;base64,${'A'.repeat(payloadChars)}`;
}

const image = (payloadChars: number): WriterImageBlockData =>
  ({ dataUrl: dataUrl(payloadChars) } as unknown as WriterImageBlockData);

describe('die Grenzen', () => {
  it('sind genau 24 MiB je Bild und 3 x 24 MiB je Dokument', () => {
    expect(WRITER_IMAGE_MAX_OUTPUT_BYTES).toBe(24 * MIB);
    expect(WRITER_IMAGE_MAX_DOCUMENT_BYTES).toBe(3 * 24 * MIB);
    expect(WRITER_IMAGE_MAX_DOCUMENT_BYTES).toBe(3 * WRITER_IMAGE_MAX_OUTPUT_BYTES);
  });

  it('Alt-Text ist auf 250 Zeichen begrenzt, die Beschriftung auf 1024', () => {
    expect(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH).toBe(250);
    expect(WRITER_IMAGE_MAX_CAPTION_LENGTH).toBe(1024);
    // Der Kommentar nennt den Grund fuer die Kuerze des Alt-Textes: "a description, not a paragraph".
    expect(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH).toBeLessThan(WRITER_IMAGE_MAX_CAPTION_LENGTH);
  });
});

describe('measureWriterImageBytes — die Schaetzung aus der Laenge', () => {
  it('rechnet base64 in Bytes um: drei Viertel der Nutzlast plus den Kopf', () => {
    // 400 Zeichen Nutzlast -> ceil(400 * 3/4) = 300 Bytes. Der Kopf 'data:image/png;base64,' ist 22 Zeichen,
    // also kommt commaIndex + 1 = 22 dazu.
    const url = dataUrl(400);
    const commaIndex = url.indexOf(',');
    expect(measureWriterImageBytes({ dataUrl: url })).toBe(Math.ceil(400 * 0.75) + commaIndex + 1);
  });

  it('OHNE Komma wird die ganze Zeichenkette als Nutzlast gezaehlt', () => {
    // Kein Daten-URL, sondern ein nackter base64-Block.
    expect(measureWriterImageBytes({ dataUrl: 'A'.repeat(400) })).toBe(300);
  });

  it('ist monoton: mehr Zeichen bedeuten mehr Bytes', () => {
    expect(measureWriterImageBytes({ dataUrl: dataUrl(1000) }))
      .toBeGreaterThan(measureWriterImageBytes({ dataUrl: dataUrl(100) }));
  });

  it('ein fehlender oder leerer Daten-URL ergibt einen kleinen, nicht-negativen Wert', () => {
    expect(measureWriterImageBytes({ dataUrl: '' })).toBe(0);
    expect(measureWriterImageBytes({ dataUrl: undefined as unknown as string })).toBeGreaterThanOrEqual(0);
  });

  it('die Summe ist die Summe der Einzelwerte', () => {
    const images = [image(400), image(800), image(1200)];
    const einzel = images.reduce((t, i) => t + measureWriterImageBytes(i), 0);
    expect(measureWriterDocumentImageBytes(images)).toBe(einzel);
  });

  it('eine leere Liste ergibt 0', () => {
    expect(measureWriterDocumentImageBytes([])).toBe(0);
  });
});

describe('resolveWriterImageBudget — der verbleibende Rest', () => {
  it('meldet den verbrauchten und den verbleibenden Betrag', () => {
    const budget = resolveWriterImageBudget([image(400)], 10_000);
    expect(budget.limitBytes).toBe(10_000);
    expect(budget.usedBytes).toBeGreaterThan(0);
    expect(budget.remainingBytes).toBe(10_000 - budget.usedBytes);
    expect(budget.overBudget).toBe(false);
  });

  it('HAUPTZUSICHERUNG: der Rest wird NIE negativ, auch wenn das Budget ueberschritten ist', () => {
    // Ein negativer Rest waere in einer Anzeige ein stiller Fehler.
    const budget = resolveWriterImageBudget([image(4000)], 10);
    expect(budget.remainingBytes).toBe(0);
    expect(budget.overBudget).toBe(true);
    expect(budget.usedBytes).toBeGreaterThan(budget.limitBytes);
  });

  it('benutzt standardmaessig das Dokumentbudget', () => {
    expect(resolveWriterImageBudget([]).limitBytes).toBe(WRITER_IMAGE_MAX_DOCUMENT_BYTES);
  });

  it('genau auf der Grenze ist NICHT darueber', () => {
    const leer = resolveWriterImageBudget([], 0);
    expect(leer.overBudget).toBe(false);
    expect(leer.remainingBytes).toBe(0);
  });
});

describe('wouldExceedWriterImageBudget — die Vorhersage ohne Nebenwirkung', () => {
  it('sagt true, wenn die Summe die Grenze ueberschreitet', () => {
    expect(wouldExceedWriterImageBudget([], image(400), 10)).toBe(true);
  });

  it('sagt false, wenn sie die Grenze genau trifft', () => {
    // Die Bedingung ist `> limitBytes`, nicht `>=`.
    const exakt = measureWriterImageBytes(image(400));
    expect(wouldExceedWriterImageBudget([], image(400), exakt)).toBe(false);
    expect(wouldExceedWriterImageBudget([], image(400), exakt - 1)).toBe(true);
  });

  it('HAUPTZUSICHERUNG: der Aufruf veraendert das vorhandene Dokument NICHT', () => {
    // Der Kommentar sagt: "nothing already in the document is removed, so the check can never destroy
    // existing content." Das ist die Zusicherung, die zaehlt - eine Vorhersage darf keine Nebenwirkung haben.
    const vorhanden = [image(400), image(400)];
    const vorher = JSON.stringify(vorhanden);
    const laengeVorher = vorhanden.length;
    wouldExceedWriterImageBudget(vorhanden, image(100_000));
    expect(JSON.stringify(vorhanden)).toBe(vorher);
    expect(vorhanden).toHaveLength(laengeVorher);
  });

  it('rechnet das vorhandene Dokument mit ein', () => {
    const vorhanden = [image(400), image(400)];
    const kandidat = image(400);
    const einer = measureWriterImageBytes(kandidat);
    // Zwei plus Kandidat passt; zwei plus Kandidat bei knapper Grenze nicht.
    expect(wouldExceedWriterImageBudget(vorhanden, kandidat, einer * 3)).toBe(false);
    expect(wouldExceedWriterImageBudget(vorhanden, kandidat, einer * 3 - 1)).toBe(true);
  });

  it('ein leeres Dokument mit leerem Kandidaten ueberschreitet nichts', () => {
    expect(wouldExceedWriterImageBudget([], { dataUrl: '' }, 0)).toBe(false);
  });
});

describe('validateWriterImageAltText und validateWriterImageCaption', () => {
  it('nimmt gueltigen Text an', () => {
    expect(validateWriterImageAltText('Ein Diagramm').ok).toBe(true);
    expect(validateWriterImageCaption('Eine laengere Beschreibung.').ok).toBe(true);
  });

  it('HAUPTZUSICHERUNG: die Laengengrenzen werden eingehalten', () => {
    // Genau an der Grenze angenommen, ein Zeichen darueber abgewiesen.
    expect(validateWriterImageAltText('a'.repeat(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH)).ok).toBe(true);
    expect(validateWriterImageAltText('a'.repeat(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH + 1)).ok).toBe(false);

    expect(validateWriterImageCaption('a'.repeat(WRITER_IMAGE_MAX_CAPTION_LENGTH)).ok).toBe(true);
    expect(validateWriterImageCaption('a'.repeat(WRITER_IMAGE_MAX_CAPTION_LENGTH + 1)).ok).toBe(false);
  });

  it('ein leeres Feld ist gueltig — ein Bild darf unbeschriftet sein', () => {
    expect(validateWriterImageAltText('').ok).toBe(true);
    expect(validateWriterImageCaption('').ok).toBe(true);
    expect(validateWriterImageAltText(undefined).ok).toBe(true);
  });

  it('bei einem Fehlschlag wird eine Begruendung mitgeliefert, kein blosses false', () => {
    const verdict = validateWriterImageAltText('a'.repeat(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH + 1));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(typeof verdict.message).toBe('string');
      expect(verdict.message.length).toBeGreaterThan(0);
      expect(verdict.message).toContain(String(WRITER_IMAGE_MAX_ALT_TEXT_LENGTH));
    }
  });
});
