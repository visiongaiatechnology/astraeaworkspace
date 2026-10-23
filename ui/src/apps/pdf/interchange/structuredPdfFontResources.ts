// STATUS: DIAMANT VGT SUPREME — bounded Base-14 font resource planning.
import type { PdfBase14Font, PdfPageModel } from '../../../shared/contracts/workspace';
import { resolvePdfBase14Font } from '../editing/pdfDirectContentEditing';

export interface StructuredPdfFontResources {
  fontRegular: number;
  fontBold: number;
  fontTimes: number;
  fontCourier: number;
  dictionary: string;
}

export function addStructuredPdfFontResources(
  sourcePages: readonly PdfPageModel[],
  add: (body: string) => number,
): StructuredPdfFontResources {
  const usedFonts = new Set<PdfBase14Font>(['Helvetica', 'Helvetica-Bold']);
  for (const page of sourcePages) {
    for (const section of page.sections) {
      const bold = section.type === 'header' || section.type === 'key-value';
      usedFonts.add(resolvePdfBase14Font(section.style?.requestedFont ?? section.style?.resolvedFont, bold).resolved);
    }
  }
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontTimes = usedFonts.has('Times-Roman') ? add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>') : 0;
  const fontCourier = usedFonts.has('Courier') ? add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>') : 0;
  const dictionary = [
    `/F1 ${fontRegular} 0 R`,
    `/F2 ${fontBold} 0 R`,
    fontTimes ? `/F3 ${fontTimes} 0 R` : '',
    fontCourier ? `/F4 ${fontCourier} 0 R` : '',
  ].filter(Boolean).join(' ');
  return { fontRegular, fontBold, fontTimes, fontCourier, dictionary };
}
