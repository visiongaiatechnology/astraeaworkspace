// STATUS: DIAMANT VGT SUPREME — PDF-owned active-content check installed at the trusted shell boundary.
import { registerPdfActiveContentAssertion } from '../../../../platform/interop/pdfActiveContentPolicy';
import { assertPdfActiveContentEliminated } from './pdfActiveContentElimination';

export function installPdfActiveContentPolicyHost(): () => void {
  return registerPdfActiveContentAssertion(assertPdfActiveContentEliminated);
}
