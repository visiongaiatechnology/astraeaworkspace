import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GridFormulaBar } from '../../toolbar/GridFormulaBar';

const renderFormulaBar = () => renderToStaticMarkup(createElement(GridFormulaBar, {
  selectedRange: 'A1:B4',
  selectedCell: 'A1',
  formulaInput: '=SUM(A1:A4)',
  namedRanges: [],
  professionalPanelOpen: false,
  onChangeFormula: vi.fn(),
  onCommitFormula: vi.fn(),
  onApplyFormat: vi.fn(),
  onSelectNamedRange: vi.fn(),
  onOpenChartModal: vi.fn(),
  onOpenWhatIfModal: vi.fn(),
  onOpenFindReplaceModal: vi.fn(),
  onOpenCommentsModal: vi.fn(),
  onOpenSlicerModal: vi.fn(),
  onOpenAuditModal: vi.fn(),
  onOpenDataTableModal: vi.fn(),
  onToggleProfessionalPanel: vi.fn(),
  onExportCsv: vi.fn(),
}));

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

describe('Grid formula toolbar layout', () => {
  it('keeps the name box, formula, apply, common formatting, and frequent actions in the primary row', () => {
    const html = renderFormulaBar();

    expect(html).toContain('data-grid-formula-toolbar="true"');
    expect(html).toContain('aria-label="Name box, selected range A1:B4"');
    // Runde 41: the formula field names its edit target explicitly.
    expect(html).toContain('aria-label="Formula or selected cell value: A1"');
    expect(html).toContain('data-grid-formula-target="true"');
    expect(html).toContain('>A1</span>');
    expect(html).toContain('>Apply</button>');
    expect(html).toContain('data-grid-format-action="bold"');
    expect(html).toContain('data-grid-format-action="align-left"');
    expect(html).toContain('data-grid-format-action="currency"');
    expect(html).toContain('data-grid-primary-action="chart"');
    expect(html).toContain('data-grid-primary-action="find-replace"');
    expect(html).toContain('data-grid-primary-action="layout"');
    expect(html).toContain('aria-label="More actions"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('overflow-x-auto');
  });

  // A `toContain` check cannot see a duplicate: one redundant Apply button satisfies every
  // `toContain('>Apply</button>')`. This counts, so a second button fails the suite.
  it('renders exactly one Apply control and exactly one commit action in the toolbar row', () => {
    const html = renderFormulaBar();
    const source = readFileSync(new URL('../../toolbar/GridFormulaBar.tsx', import.meta.url), 'utf8');
    const applyButtons = countOccurrences(html, 'vgt-grid-apply-button');
    const applyLabels = countOccurrences(html, '>Apply</button>');
    expect(applyButtons, 'the rendered toolbar carries exactly one Apply button').toBe(1);
    expect(applyLabels, 'the rendered toolbar labels exactly one Apply button').toBe(1);
    // The specific defect: two consecutive byte-identical <button onClick={onCommitFormula}> tags.
    expect(countOccurrences(source, '<button type="button" onClick={onCommitFormula}'), 'exactly one commit button in the source').toBe(1);
  });

  it('retains every existing advanced Grid action and its original callback wiring in the disclosure', () => {
    const source = readFileSync(new URL('../../toolbar/GridFormulaBar.tsx', import.meta.url), 'utf8');
    for (const action of [
      ['copy.whatIf', 'onOpenWhatIfModal'],
      ['copy.dataTable', 'onOpenDataTableModal'],
      ['copy.slicer', 'onOpenSlicerModal'],
      ['copy.audit', 'onOpenAuditModal'],
      ['copy.powerQuery', 'onOpenPowerQuery'],
      ['copy.solver', 'onOpenSolver'],
      ['copy.monteCarlo', 'onOpenMonteCarlo'],
      ['copy.roundtrip', 'onOpenRoundtrip'],
      ['copy.comments', 'onOpenCommentsModal'],
      ['copy.findReplace', 'onOpenFindReplaceModal'],
      ['onToggleProfessionalPanel', 'onToggleProfessionalPanel'],
      ['copy.csv', 'onExportCsv'],
    ]) {
      expect(source, `missing ${action[0]} action`).toContain(action[0]);
      expect(source, `missing ${action[1]} callback`).toContain(action[1]);
    }
    expect(source).toContain('createPortal(');
    expect(source).toContain('document.body');
    expect(source).toContain('onClick={runMenuAction(onExportCsv)}');
  });
});
