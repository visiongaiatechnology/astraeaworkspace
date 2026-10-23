// STATUS: PLATIN — validates embedded ICC profile length and required signature through the neutral owner.
import { expect, it } from 'vitest';
import { getPdfSrgbIccProfile } from '../../../shared/pdf/output-intents/pdfSrgbIccProfile';

it('returns a complete ICC profile with a valid declared length and acsp signature', () => {
  const profile = getPdfSrgbIccProfile();
  const declaredLength = new DataView(profile.buffer, profile.byteOffset, profile.byteLength).getUint32(0, false);
  const signature = String.fromCharCode(profile[36], profile[37], profile[38], profile[39]);

  expect(declaredLength).toBe(profile.byteLength);
  expect(signature).toBe('acsp');
});
