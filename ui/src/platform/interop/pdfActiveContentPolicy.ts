// STATUS: DIAMANT VGT SUPREME — fail-closed Core port for PDF active-content policy.
export type PdfActiveContentAssertion = (bytes: Uint8Array) => void;

export class PdfActiveContentPolicyUnavailableError extends Error {
  constructor() {
    super('pdf_active_content_policy_unavailable');
    this.name = 'PdfActiveContentPolicyUnavailableError';
  }
}

let activeAssertion: PdfActiveContentAssertion | undefined;
let activeRegistration: symbol | undefined;

export function registerPdfActiveContentAssertion(assertion: PdfActiveContentAssertion): () => void {
  if (typeof assertion !== 'function') throw new TypeError('pdf_active_content_assertion_invalid');
  if (activeAssertion) throw new Error('pdf_active_content_assertion_already_registered');

  const registration = Symbol('pdf-active-content-assertion');
  activeAssertion = assertion;
  activeRegistration = registration;
  return () => {
    if (activeRegistration !== registration) return;
    activeAssertion = undefined;
    activeRegistration = undefined;
  };
}

export function assertPdfActiveContentEliminated(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError('pdf_active_content_input_invalid');
  }
  const assertion = activeAssertion;
  if (!assertion) throw new PdfActiveContentPolicyUnavailableError();
  assertion(bytes);
}
