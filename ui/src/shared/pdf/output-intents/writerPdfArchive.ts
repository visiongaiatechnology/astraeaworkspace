// STATUS: DIAMANT VGT SUPREME — bounded PDF/A-2b output-intent material.

import { getPdfSrgbIccProfile } from './pdfSrgbIccProfile';
export { getPdfSrgbIccProfile as writerPdfSrgbIccProfile };

function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0').toUpperCase();
  return output;
}

export function addWriterPdfAOutputIntent(addObject: (body: string) => number): number {
  const profile = getPdfSrgbIccProfile();
  const hex = `${bytesToHex(profile)}>`;
  const profileId = addObject(`<< /N 3 /Alternate /DeviceRGB /Length ${hex.length} /Filter /ASCIIHexDecode >>\nstream\n${hex}\nendstream`);
  return addObject(`<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB) /Info (sRGB IEC61966-2.1 compatible) /DestOutputProfile ${profileId} 0 R >>`);
}
