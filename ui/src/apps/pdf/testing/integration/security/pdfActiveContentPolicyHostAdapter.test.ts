// STATUS: PLATIN — proves the shell-facing Core port invokes the real PDF byte assertion.
import { afterEach, expect, it } from 'vitest';
import { assertPdfActiveContentEliminated } from '../../../../../platform/interop/pdfActiveContentPolicy';
import { installPdfActiveContentPolicyHost } from '../../../interchange/security/pdfActiveContentPolicyHostAdapter';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('routes passive and active PDF probes through the existing PDF implementation', () => {
  release = installPdfActiveContentPolicyHost();

  const passivePdf = new TextEncoder().encode('%PDF-1.7\n/Type /Catalog\n%%EOF');
  const activePdf = new TextEncoder().encode('%PDF-1.7\n/OpenAction\n%%EOF');
  expect(() => assertPdfActiveContentEliminated(passivePdf)).not.toThrow();
  expect(() => assertPdfActiveContentEliminated(activePdf))
    .toThrow('PDF active-content elimination failed closed.');
});
