// STATUS: DIAMANT VGT SUPREME — fail-closed PDF font handling policy.
// Local OS font binaries are never extracted or embedded without an explicit, auditable license grant.
//
// W-198, the finding this file now answers: the rule used to be `/[^\x20-\x7E]/` — **every** non-ASCII
// character forced the raster path. A German business letter is made of umlauts, so its text was turned
// into pictures: not searchable, not selectable, not readable by a screen reader. Measured on the
// acceptance letter, `Mit freundlichen Grüßen` could not be found in the exported PDF while
// `Sehr geehrte Frau Beispiel` could.
//
// The built-in PDF fonts do not need rasterising for that. They are standard Type1 fonts and support
// `/Encoding /WinAnsiEncoding` (CP1252), which covers Latin-1 letters (ä ö ü ß é à ñ …), the euro sign,
// the typographic quotes, the dashes, the bullet and the ellipsis — everything a German letter uses.
// What CP1252 genuinely cannot carry (CJK, Cyrillic, Greek, emoji, maths) still takes the raster path.
//
// So the rule is no longer "is it ASCII?" but "can WinAnsi carry it?" — and that question is answered in
// **one** place, by the encoder, which the decision and the writer both call.

import { encodePdfWinAnsi } from '../../../../../platform/interop/pdf/pdfTextStrings';

export type WriterPdfProfile = 'standard' | 'pdfa-2b';
export type WriterPdfFontHandling = 'builtin-substitution' | 'native-shaped-raster-substitution';

export interface WriterPdfFontDecision {
  handling: WriterPdfFontHandling;
  reason: 'archive-font-embedding-unproven' | 'unicode-shaping-required' | 'portable-builtin-substitution';
}

// The CP1252 table and the encoder live in one place for the whole application
// (`platform/interop/pdf/pdfTextStrings`), because six other PDF writers carried their own copy of the
// same mistake (W-298). These two names stay so the Writer's callers and tests keep their vocabulary.
export {
  encodePdfWinAnsi as encodeWriterPdfWinAnsi,
  isPdfWinAnsiRepresentable as isWriterPdfWinAnsiRepresentable,
} from '../../../../../platform/interop/pdf/pdfTextStrings';
/**
 * Whether this text has to be drawn as a picture.
 *
 * `pdfa-2b` keeps rasterising everything: the archive profile demands embedded fonts, and embedding a
 * local OS font is exactly what the licence rule at the top forbids, so text there is shaped in the
 * browser and rasterised. For the standard profile the question is the encoder's.
 */
export function resolveWriterPdfFontDecision(text: string, profile: WriterPdfProfile): WriterPdfFontDecision {
  if (profile === 'pdfa-2b') {
    return {
      handling: 'native-shaped-raster-substitution',
      reason: 'archive-font-embedding-unproven',
    };
  }
  if (encodePdfWinAnsi(text) === null) {
    return {
      handling: 'native-shaped-raster-substitution',
      reason: 'unicode-shaping-required',
    };
  }
  return {
    handling: 'builtin-substitution',
    reason: 'portable-builtin-substitution',
  };
}
