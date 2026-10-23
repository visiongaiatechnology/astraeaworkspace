// STATUS: DIAMANT VGT SUPREME — which text the PDF writes as text (W-198, P1)
//
// The finding: the rule used to be `/[^\x20-\x7E]/` — every non-ASCII character sent the whole line to the
// raster path, so a German business letter became a picture: not searchable, not selectable, not readable
// by a screen reader. Measured on the acceptance letter, `Mit freundlichen Grüßen` could not be found in
// the exported PDF while `Sehr geehrte Frau Beispiel` could, and every German line left an `/ImageMask`
// object behind.
//
// The rule is now "can WinAnsi (CP1252) carry it?" — answered by one encoder that the decision and the
// writer both call. These tests pin the boundary of that encoding: what a German letter needs must fit,
// and what genuinely cannot be carried must still be rasterised.
import { describe, expect, it } from 'vitest';
import {
  encodeWriterPdfWinAnsi,
  isWriterPdfWinAnsiRepresentable,
  resolveWriterPdfFontDecision,
} from '../../../../interchange/export/pdf/writerPdfFontPolicy';

const byteOf = (text: string, index = 0): number => encodeWriterPdfWinAnsi(text)!.charCodeAt(index);

describe('what a German letter needs fits into WinAnsi', () => {
  it('carries the umlauts as their Latin-1 bytes', () => {
    expect(byteOf('ä')).toBe(0xE4);
    expect(byteOf('ö')).toBe(0xF6);
    expect(byteOf('ü')).toBe(0xFC);
    expect(byteOf('ß')).toBe(0xDF);
    expect(byteOf('Ä')).toBe(0xC4);
    expect(byteOf('Ü')).toBe(0xDC);
  });

  it('carries the punctuation a German letter uses', () => {
    // The code points where CP1252 differs from Latin-1 — the reason a naive "Latin-1 only" rule would
    // still have failed on a real letter.
    expect(byteOf('€')).toBe(0x80);
    expect(byteOf('„')).toBe(0x84);
    expect(byteOf('“')).toBe(0x93);
    expect(byteOf('”')).toBe(0x94);
    expect(byteOf('–')).toBe(0x96);
    expect(byteOf('—')).toBe(0x97);
    expect(byteOf('•')).toBe(0x95);
    expect(byteOf('…')).toBe(0x85);
    expect(byteOf('’')).toBe(0x92);
  });

  it('leaves plain ASCII alone', () => {
    expect(encodeWriterPdfWinAnsi('Rechnung 2026 (Anlage 1)')).toBe('Rechnung 2026 (Anlage 1)');
  });

  it('encodes one byte per character, which is what the font encoding expects', () => {
    const encoded = encodeWriterPdfWinAnsi('Grüße')!;
    expect(encoded.length).toBe(5);
    expect([...encoded].map((character) => character.charCodeAt(0))).toEqual([0x47, 0x72, 0xFC, 0xDF, 0x65]);
  });
});

describe('what WinAnsi cannot carry is still rasterised', () => {
  it('refuses scripts outside CP1252', () => {
    expect(encodeWriterPdfWinAnsi('日本語')).toBeNull();
    expect(encodeWriterPdfWinAnsi('Привет')).toBeNull();
    expect(encodeWriterPdfWinAnsi('Ελλάδα')).toBeNull();
    expect(encodeWriterPdfWinAnsi('שלום')).toBeNull();
    expect(encodeWriterPdfWinAnsi('🙂')).toBeNull();
  });

  it('refuses a line that mixes German with something unrepresentable', () => {
    // One unrepresentable character is enough: a half-written line would be worse than a picture.
    expect(isWriterPdfWinAnsiRepresentable('Grüße 日本')).toBe(false);
  });

  it('decides per text, not per document', () => {
    expect(resolveWriterPdfFontDecision('Grüße', 'standard')).toEqual({
      handling: 'builtin-substitution',
      reason: 'portable-builtin-substitution',
    });
    expect(resolveWriterPdfFontDecision('日本語', 'standard')).toEqual({
      handling: 'native-shaped-raster-substitution',
      reason: 'unicode-shaping-required',
    });
  });

  it('keeps rasterising everything for the archive profile', () => {
    // `pdfa-2b` requires embedded fonts and the licence rule forbids embedding local OS fonts, so text
    // there is shaped in the browser. That decision is not weakened by this change.
    expect(resolveWriterPdfFontDecision('Rechnung', 'pdfa-2b').handling).toBe('native-shaped-raster-substitution');
    expect(resolveWriterPdfFontDecision('Grüße', 'pdfa-2b').reason).toBe('archive-font-embedding-unproven');
  });

  it('treats the empty string as text, not as a picture', () => {
    expect(isWriterPdfWinAnsiRepresentable('')).toBe(true);
  });
});
