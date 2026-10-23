/**
 * P25 / AST-0121 — Bilder per Drop oder Dateiwahl: der dedizierte Unit-Test fuer `writerImageImport.ts`.
 *
 * ## Warum dieses Modul zaehlt
 *
 * **Ein Bildimport ist eine feindliche Grenze.** Der Auftrag verlangt an jeder Vertrauensgrenze:
 * *"Groesse begrenzen. Syntax parsen. Struktur validieren. Semantik validieren."* Genau das tut dieses Modul —
 * und bis jetzt tat es das **ohne einen Test, der diese Grenzen festhaelt.**
 *
 * ## Die Vertraege, aus dem Quelltext gelesen
 *
 * * `SUPPORTED_WRITER_IMAGE_MIMES` = `['image/jpeg', 'image/png', 'image/webp']` — **eine Whitelist, keine
 *   Blacklist.**
 * * `MAX_SOURCE_BYTES` = 20 MiB · `MAX_DECODE_BYTES` = 256 MiB · `MAX_OUTPUT_BYTES` = 24 MiB ·
 *   `MAX_OUTPUT_EDGE_PX` = 4096.
 * * **`MAX_PIXEL_COUNT` ist ABGELEITET**, nicht danebengestellt:
 *   `floor(MAX_DECODE_BYTES / (BYTES_PER_RGBA_PIXEL * DECODE_WORKING_COPY_FACTOR))` = `floor(268435456 / 6)`.
 *   Der Kommentar nennt den Grund: *"The old code carried `MAX_PIXEL_COUNT = 40_000_000` next to
 *   `MAX_DECODE_BYTES`; the two could drift apart and neither explained the other."*
 * * `validateWriterImageEnvelope` verlangt eine **sichere ganze Zahl** zwischen 1 und 20 MiB und wirft sonst
 *   einen `WriterImageImportError`.
 * * **`detectWriterImageMime` liest die MAGIC BYTES**, nicht den deklarierten Typ — eine umbenannte Datei
 *   wird deshalb nicht durchgelassen.
 */

import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_WRITER_IMAGE_MIMES,
  WRITER_IMAGE_ACCEPT_ATTRIBUTE,
  WriterImageImportError,
  detectWriterImageMime,
  isSupportedWriterImageMime,
  validateWriterImageEnvelope,
} from '../../../../media/images/import/writerImageImport';

/**
 * Echte Dateianfaenge - die Funktion prueft Magic Bytes, nicht den Namen.
 *
 * **Und die Abmessungen muessen mitgeliefert werden.** `probeMediaBoundary` wirft
 * `dimension-unavailable-before-decode`, wenn ein Bildanfang keine parsebaren Masse traegt - ein
 * 8-Byte-PNG-Signaturblock allein genuegt also NICHT. Der erste Entwurf dieses Tests benutzte genau den und
 * scheiterte viermal an `null`. Die Anfänge hier sind die bewaehrten aus
 * `testing/security/media/images/writerImageImport.test.ts`.
 */
const PNG_HEADER = (() => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // Signatur
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  bytes.set([0, 0, 0, 1, 0, 0, 0, 1], 16); // 1 x 1 Pixel
  return bytes;
})();
const JPEG_HEADER = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);
const WEBP_HEADER = (() => {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  return bytes;
})();
const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

const MIB = 1024 * 1024;

describe('die Whitelist', () => {
  it('kennt genau drei Formate — und keine mehr', () => {
    expect([...SUPPORTED_WRITER_IMAGE_MIMES]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(SUPPORTED_WRITER_IMAGE_MIMES).toHaveLength(3);
  });

  it('HAUPTZUSICHERUNG: GIF ist NICHT unterstuetzt — die Liste ist eine Whitelist', () => {
    // Eine Blacklist haette hier bestanden, sobald jemand ein neues Format vergisst.
    expect(isSupportedWriterImageMime('image/gif')).toBe(false);
    expect(isSupportedWriterImageMime('image/svg+xml')).toBe(false);
    expect(isSupportedWriterImageMime('image/bmp')).toBe(false);
    expect(isSupportedWriterImageMime('image/tiff')).toBe(false);
  });

  it('weist leere, fehlende und erfundene Werte ab', () => {
    expect(isSupportedWriterImageMime(undefined)).toBe(false);
    expect(isSupportedWriterImageMime('')).toBe(false);
    expect(isSupportedWriterImageMime('image/png ')).toBe(false);
    expect(isSupportedWriterImageMime(' image/png')).toBe(false);
  });

  it('die accept-Attribut-Zeichenkette passt zur Whitelist', () => {
    // Der Kommentar nennt den Grund: das `accept`-Attribut und der Drop-Filter muessen dieselbe Menge sein,
    // "so a file cannot be offered by the picker and refused on drop".
    expect(WRITER_IMAGE_ACCEPT_ATTRIBUTE).toBe('image/jpeg,image/png,image/webp');
    for (const mime of SUPPORTED_WRITER_IMAGE_MIMES) {
      expect(WRITER_IMAGE_ACCEPT_ATTRIBUTE).toContain(mime);
    }
  });
});

describe('detectWriterImageMime — Magic Bytes, nicht der Name', () => {
  it('erkennt PNG, JPEG und WebP am Dateianfang', () => {
    expect(detectWriterImageMime(PNG_HEADER)).toBe('image/png');
    expect(detectWriterImageMime(JPEG_HEADER)).toBe('image/jpeg');
    expect(detectWriterImageMime(WEBP_HEADER)).toBe('image/webp');
  });

  it('HAUPTZUSICHERUNG: ein nicht unterstuetztes Format liefert null, statt zu werfen', () => {
    expect(detectWriterImageMime(GIF_HEADER)).toBeNull();
  });

  it('ein leerer oder erfundener Anfang liefert null', () => {
    expect(detectWriterImageMime(new Uint8Array([]))).toBeNull();
    expect(detectWriterImageMime(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it('ein abgeschnittener PNG-Anfang liefert null — die Signatur muss vollstaendig sein', () => {
    expect(detectWriterImageMime(PNG_HEADER.slice(0, 3))).toBeNull();
  });
});

describe('validateWriterImageEnvelope — die Groessengrenze und die Typgrenze', () => {
  it('nimmt ein gueltiges PNG an und gibt den ERKANNTEN Typ zurueck', () => {
    expect(validateWriterImageEnvelope('image/png', 1024, PNG_HEADER)).toBe('image/png');
  });

  it('HAUPTZUSICHERUNG 1: die Groessengrenze von 20 MiB wird eingehalten', () => {
    // Genau an der Grenze noch angenommen.
    expect(validateWriterImageEnvelope('image/png', 20 * MIB, PNG_HEADER)).toBe('image/png');
    // Ein Byte darueber abgewiesen.
    expect(() => validateWriterImageEnvelope('image/png', 20 * MIB + 1, PNG_HEADER)).toThrow(WriterImageImportError);
  });

  it('HAUPTZUSICHERUNG 2: Groesse 0, negativ und nicht-ganzzahlig werden abgewiesen', () => {
    // Ein `sizeBytes` aus einer feindlichen Quelle ist keine verlaessliche Zahl.
    for (const size of [0, -1, -1024, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => validateWriterImageEnvelope('image/png', size, PNG_HEADER), `Groesse ${size}`)
        .toThrow(WriterImageImportError);
    }
  });

  it('HAUPTZUSICHERUNG 3: ein nicht unterstuetztes Format wird abgewiesen, auch wenn es sich als PNG ausgibt', () => {
    // Das ist der Polyglot-Fall: deklarierter Typ und tatsaechlicher Inhalt stimmen nicht ueberein.
    expect(() => validateWriterImageEnvelope('image/png', 1024, GIF_HEADER)).toThrow(WriterImageImportError);
    // Und ohne erkennbare Signatur ebenso.
    expect(() => validateWriterImageEnvelope('image/png', 1024, new Uint8Array([1, 2, 3, 4]))).toThrow(WriterImageImportError);
  });

  it('die Fehlerart ist benannt und unterscheidbar', () => {
    try {
      validateWriterImageEnvelope('image/png', 0, PNG_HEADER);
      expect.unreachable('haette werfen muessen');
    } catch (error) {
      expect(error).toBeInstanceOf(WriterImageImportError);
      expect((error as Error).name).toBe('WriterImageImportError');
    }
  });

  it('nimmt JPEG und WebP ebenso an', () => {
    expect(validateWriterImageEnvelope('image/jpeg', 2048, JPEG_HEADER)).toBe('image/jpeg');
    expect(validateWriterImageEnvelope('image/webp', 4096, WEBP_HEADER)).toBe('image/webp');
  });
});
