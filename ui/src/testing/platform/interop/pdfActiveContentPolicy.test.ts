// STATUS: PLATIN — registration ownership, fail-closed behavior, input validation, and byte forwarding.
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPdfActiveContentEliminated,
  PdfActiveContentPolicyUnavailableError,
  registerPdfActiveContentAssertion,
} from '../../../platform/interop/pdfActiveContentPolicy';

const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF');
let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

describe('Core PDF active-content policy port', () => {
  it('fails closed until the trusted host registers an assertion', () => {
    expect(() => assertPdfActiveContentEliminated(bytes)).toThrow(PdfActiveContentPolicyUnavailableError);
  });

  it('forwards the original nonempty byte view to the active assertion', () => {
    let received: Uint8Array | undefined;
    release = registerPdfActiveContentAssertion((value) => { received = value; });

    expect(assertPdfActiveContentEliminated(bytes)).toBeUndefined();
    expect(received).toBe(bytes);
  });

  it('rejects a second provider without replacing the registered owner', () => {
    let calls = 0;
    release = registerPdfActiveContentAssertion(() => { calls += 1; });

    expect(() => registerPdfActiveContentAssertion(() => undefined))
      .toThrow('pdf_active_content_assertion_already_registered');
    assertPdfActiveContentEliminated(bytes);
    expect(calls).toBe(1);
  });

  it('rejects malformed or empty byte inputs before provider invocation', () => {
    release = registerPdfActiveContentAssertion(() => { throw new Error('provider_must_not_run'); });

    expect(() => assertPdfActiveContentEliminated(new Uint8Array())).toThrow('pdf_active_content_input_invalid');
    expect(() => assertPdfActiveContentEliminated(null as unknown as Uint8Array)).toThrow('pdf_active_content_input_invalid');
  });
});
