// STATUS: PLATIN — verifies exact diagnostic JSON compatibility and bounded failure behavior.
import { describe, expect, it } from 'vitest';
import type { DiagnosticBundle } from '../../../platform/diagnostics/diagnostics';
import { serializeDiagnosticBundleExact } from '../../../platform/diagnostics/diagnostics';

function createBundle(overrides: Record<string, unknown> = {}): DiagnosticBundle {
  return {
    schema: 'astraea-workspace-repro-bundle/v1',
    generated_at: '2026-10-04T12:00:00.000Z',
    report: { safe: true, entries: ['alpha', 'beta'] },
    logs: [],
    selected_document: null,
    selected_document_inclusion: 'not_requested',
    sharing: { automatic_upload: false, authorized: false, requires_explicit_opt_in: true },
    ...overrides,
  } as unknown as DiagnosticBundle;
}

describe('serializeDiagnosticBundleExact', () => {
  it('keeps the canonical pretty JSON bytes and one final newline', () => {
    const bundle = createBundle();
    const expected = `${JSON.stringify(bundle, null, 2)}\n`;

    expect(serializeDiagnosticBundleExact(bundle)).toBe(expected);
    expect(new TextEncoder().encode(serializeDiagnosticBundleExact(bundle)).byteLength).toBe(
      new TextEncoder().encode(expected).byteLength,
    );
  });

  it('rejects an oversized bundle while serializing and fails closed for accessors', () => {
    expect(() => serializeDiagnosticBundleExact(createBundle({ payload: 'x'.repeat(5 * 1024 * 1024) }))).toThrow(
      'DIAGNOSTIC_EXPORT_SIZE_REJECTED',
    );

    const report = Object.defineProperty({}, 'sensitive', {
      enumerable: true,
      get: () => { throw new Error('accessor must not execute'); },
    });
    expect(() => serializeDiagnosticBundleExact(createBundle({ report }))).toThrow(
      'DIAGNOSTIC_EXPORT_SERIALIZATION_REJECTED',
    );
  });
});
