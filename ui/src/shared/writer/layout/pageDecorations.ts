// STATUS: DIAMANT VGT SUPREME — Canonical Writer page-decoration domain
import type { WriterPageSetupConfig } from '../../contracts/workspace';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/u;

/**
 * W-314: the watermark text bound, named. Measured before: `validateWriterPageDecorations` compared against a
 * literal `120` while the DOCX importer **cut** the text with `slice(0, 120)` — the same number in two places,
 * one of them a silent truncation the user never learned about.
 */
export const MAX_WRITER_WATERMARK_CHARACTERS = 120;

const PAPER_COLORS = {
  white: '#FFFFFF',
  cream: '#FCF8F2',
  dark: '#0F121A',
} as const;

export function isWriterHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function normalizeWriterHexColor(value: string): string {
  if (!isWriterHexColor(value)) throw new Error('Writer color must use #RRGGBB notation.');
  return value.toUpperCase();
}

export function resolveWriterPageBackgroundColor(setup: WriterPageSetupConfig): string {
  return isWriterHexColor(setup.backgroundColor)
    ? normalizeWriterHexColor(setup.backgroundColor)
    : PAPER_COLORS[setup.paperColor] ?? PAPER_COLORS.white;
}

export function writerPageBackgroundIsLight(setup: WriterPageSetupConfig): boolean {
  const color = resolveWriterPageBackgroundColor(setup);
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const linear = (channel: number): number => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue) >= 0.42;
}

export function writerPageDecorationSignature(setup: WriterPageSetupConfig): string {
  const border = setup.pageBorders;
  const watermark = setup.watermark?.enabled ? setup.watermark : undefined;
  return JSON.stringify({
    background: resolveWriterPageBackgroundColor(setup),
    border: border ? {
      style: border.style,
      widthPt: border.widthPt,
      color: isWriterHexColor(border.color) ? border.color.toUpperCase() : 'INVALID',
      paddingMm: border.paddingMm,
    } : null,
    watermark: watermark ? {
      text: watermark.text,
      opacity: watermark.opacity,
      rotationDeg: watermark.rotationDeg,
      color: isWriterHexColor(watermark.color) ? watermark.color.toUpperCase() : 'INVALID',
    } : null,
  });
}

export function validateWriterPageDecorations(setup: WriterPageSetupConfig): string | null {
  if (!Object.hasOwn(PAPER_COLORS, setup.paperColor)) {
    return 'Die Papieroberfläche ist ungültig.';
  }
  if (setup.backgroundColor !== undefined && !isWriterHexColor(setup.backgroundColor)) {
    return 'Die benutzerdefinierte Hintergrundfarbe muss das Format #RRGGBB verwenden.';
  }
  if (setup.pageBorders) {
    if (!['solid', 'dashed', 'dotted', 'double'].includes(setup.pageBorders.style)) {
      return 'Der Seitenrahmenstil ist ungültig.';
    }
    if (!isWriterHexColor(setup.pageBorders.color)) {
      return 'Die Seitenrahmenfarbe muss das Format #RRGGBB verwenden.';
    }
    if (!Number.isFinite(setup.pageBorders.widthPt) || setup.pageBorders.widthPt < 0 || setup.pageBorders.widthPt > 36) {
      return 'Seitenrahmen-Werte müssen in gültigen Grenzen liegen (0–36 pt Breite, 0–50 mm Abstand).';
    }
    if (!Number.isFinite(setup.pageBorders.paddingMm) || setup.pageBorders.paddingMm < 0 || setup.pageBorders.paddingMm > 50) {
      return 'Seitenrahmen-Werte müssen in gültigen Grenzen liegen (0–36 pt Breite, 0–50 mm Abstand).';
    }
  }
  if (setup.watermark) {
    if (typeof setup.watermark.enabled !== 'boolean') {
      return 'Der Wasserzeichenstatus ist ungültig.';
    }
    if (!isWriterHexColor(setup.watermark.color)) {
      return 'Die Wasserzeichenfarbe muss das Format #RRGGBB verwenden.';
    }
    if (!Number.isFinite(setup.watermark.opacity) || setup.watermark.opacity < 0.02 || setup.watermark.opacity > 0.3) {
      return 'Die Wasserzeichendeckkraft muss zwischen 2 und 30 Prozent liegen.';
    }
    if (!Number.isFinite(setup.watermark.rotationDeg) || setup.watermark.rotationDeg < -180 || setup.watermark.rotationDeg > 180) {
      return 'Die Wasserzeichendrehung muss zwischen -180 und 180 Grad liegen.';
    }
    if (typeof setup.watermark.text !== 'string' || setup.watermark.text.length > MAX_WRITER_WATERMARK_CHARACTERS || (setup.watermark.enabled && setup.watermark.text.trim().length === 0)) {
      return `Ein aktives Wasserzeichen benötigt 1 bis ${MAX_WRITER_WATERMARK_CHARACTERS} Zeichen.`;
    }
  }
  return null;
}
