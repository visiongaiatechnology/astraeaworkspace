// Measurement of the rendered Grid formula toolbar. This file counts controls rather than
// grepping for their presence: a duplicated Apply button satisfies every `toContain` assertion
// (see GridFormulaBar.layout.test.mjs:37), and was in fact shipped unnoticed by exactly that gap.
//
// Measured before the repair (2026-09-28 checkpoint): APPLY_BUTTON_OCCURRENCES=2, TOTAL_BUTTONS=20
//   with the optional formula-assistant affordance present (TOTAL_BUTTONS=19 without it).
// Measured after the repair: APPLY_BUTTON_OCCURRENCES=1, TOTAL_BUTTONS=19 (with the affordance),
//   18 without it — exactly one control fewer, and the Apply action is still reachable once.
// The two Apply buttons were byte-identical `onClick={onCommitFormula}` tags; one was removed.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GridFormulaBar } from '../../toolbar/GridFormulaBar';

const baseProps = {
  selectedRange: 'A1:B4',
  selectedCell: 'A1',
  formulaInput: '=SUM(A1:A4)',
  namedRanges: [],
  professionalPanelOpen: false,
  onChangeFormula: vi.fn(),
  onCommitFormula: vi.fn(),
  onApplyFormat: vi.fn(),
  onSelectNamedRange: vi.fn(),
  onGoToSelection: vi.fn(),
  onOpenChartModal: vi.fn(),
  onOpenWhatIfModal: vi.fn(),
  onOpenFindReplaceModal: vi.fn(),
  onOpenCommentsModal: vi.fn(),
  onOpenSlicerModal: vi.fn(),
  onOpenAuditModal: vi.fn(),
  onOpenDataTableModal: vi.fn(),
  onToggleProfessionalPanel: vi.fn(),
  onExportCsv: vi.fn(),
};

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

describe('Grid formula toolbar control count', () => {
  it('keeps the tool count stable without the optional formula assistant', () => {
    const html = renderToStaticMarkup(createElement(GridFormulaBar, baseProps));
    expect(countOccurrences(html, 'vgt-grid-apply-button')).toBe(1);
    expect(countOccurrences(html, '>Apply</button>')).toBe(1);
    expect(countOccurrences(html, '<button')).toBe(18);
  });

  it('keeps the tool count stable with the optional formula assistant offered', () => {
    const html = renderToStaticMarkup(createElement(GridFormulaBar, { ...baseProps, cells: {} }));
    expect(countOccurrences(html, 'vgt-grid-apply-button')).toBe(1);
    expect(countOccurrences(html, '<button')).toBe(19);
    expect(countOccurrences(html, 'data-grid-primary-action="formula-assistant"')).toBe(1);
  });
});
