// STATUS: PLATIN — Formula Core requests contain only the strict native DTO fields.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridCell } from '../../../../shared/contracts/workspace';
import { invokeNative, isNativeDesktop } from '../../../../platform/native/nativeBridge';
import { evaluateFormula } from '../../formulas/formula';

vi.mock('../../../../platform/native/nativeBridge', () => ({
  invokeNative: vi.fn(),
  isNativeDesktop: vi.fn(),
}));

vi.mock('../../../../platform/native/ipcAuth', () => ({
  authenticatedIpcFetch: vi.fn(),
}));

describe('Grid Formula Core request projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNativeDesktop).mockReturnValue(true);
    vi.mocked(invokeNative).mockImplementation(async <T>() => ({ success: true, result: 21 } as T));
  });

  it('strips UI-only GridCell metadata before native deserialization', async () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'Widget', dataType: 'text', bold: true, richTextRuns: [{ text: 'Widget', bold: true }] },
      B2: { value: 3, dataType: 'integer', format: 'number' },
      C2: { value: 7, dataType: 'integer', format: 'number' },
      D2: { value: '#CALC!', formula: '=B2*C2', dataType: 'formula', format: 'number', bold: true },
    };

    await expect(evaluateFormula('=B2*C2', cells)).resolves.toBe(21);
    expect(invokeNative).toHaveBeenCalledWith('vgt_formula_evaluate', {
      request: {
        formula: '=B2*C2',
        cells: {
          A1: { value: 'Widget' },
          B2: { value: 3 },
          C2: { value: 7 },
          D2: { value: '#CALC!', formula: '=B2*C2' },
        },
        volatile_policy: 'disabled',
        external_reference_policy: 'deny',
        contract: 'VGT-FORMULA-CORE-1',
      },
    });
  });

  it('fails closed when a persisted cell value is not representable by Formula Core', async () => {
    const malformedCells = {
      A1: { value: { nested: 'unsupported' } },
    } as unknown as Record<string, GridCell>;

    await expect(evaluateFormula('=SUM(A1)', malformedCells)).resolves.toBe('#CALC!');
    expect(invokeNative).not.toHaveBeenCalled();
  });
});
