// Astraea Grid — Frontend/UX contract tests for the two surfaces that carry the formatting
// entry points. Rendering is checked with `renderToStaticMarkup` (headless Node, no jsdom),
// because the *contract* that matters here is which controls exist, what they announce to a
// screen reader, and that a rejected input is visible.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GridCell, GridSheetModel, GridStructuredTable } from '../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { GRID_TOOLBAR_COPY } from '../../locale/gridToolbarLocale';
import { GridFormattingPanel } from '../../formatting/GridFormattingPanel';
import { GridFormulaBar } from '../../toolbar/GridFormulaBar';
import { GRID_NUMBER_FORMAT_PRESETS, GRID_TOOLBAR_NUMBER_FORMAT_IDS } from '../../formatting/gridNumberFormat';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'de-DE', locale: 'de-DE', setPreference: vi.fn() });

const sheet: GridSheetModel = {
  id: 'sheet-1',
  name: 'Sheet 1',
  tableObjectId: 'table-1',
  tables: [{
    id: 'table-1', name: 'Umsatz', sheetId: 'sheet-1', range: 'A1:B4',
    hasHeaders: true, hasTotalsRow: false, styleTheme: 'blue',
    columns: [{ name: 'Region' }, { name: 'Wert' }],
  } satisfies GridStructuredTable],
};

const cells: Record<string, GridCell> = { A1: { value: 10 }, A2: { value: 50 } };

function panel(overrides: Partial<Parameters<typeof GridFormattingPanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(GridFormattingPanel, {
    sheet,
    selectedRange: 'A1:A2',
    selectedCell: 'A1',
    activeCell: cells.A1,
    cells,
    formatPainterActive: false,
    onUpdateSheet: vi.fn(),
    onApplyFormat: vi.fn(() => null),
    onApplyNumberFormat: vi.fn(),
    onApplyCellStyle: vi.fn(),
    onToggleFormatPainter: vi.fn(),
    onApplyFormatPainter: vi.fn(),
    onAutoFitSelection: vi.fn(),
    onApplyTableStyle: vi.fn(),
    ...overrides,
  }));
}

function formulaBar(overrides: Partial<Parameters<typeof GridFormulaBar>[0]> = {}) {
  return renderToStaticMarkup(createElement(GridFormulaBar, {
    selectedRange: 'A1:B8',
    selectedCell: 'A1',
    formulaInput: '',
    namedRanges: [],
    activeCell: { value: 1234.5 },
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
    ...overrides,
  }));
}

describe('Grid formula bar — standard number-format entry (Paket 15/AST-0311)', () => {
  it('renders one labelled button per canonical toolbar format, including date', () => {
    const html = formulaBar();
    for (const id of GRID_TOOLBAR_NUMBER_FORMAT_IDS) {
      expect(html, id).toContain(`data-grid-format-action="${id}"`);
    }
    expect(html).toContain('data-grid-format-action="date"');
    const copy = GRID_TOOLBAR_COPY['de-DE'];
    // The German catalog is active: the new date label must be reachable, not hard-coded English.
    expect(html).toContain(`aria-label="${copy.dateFormat}"`);
    expect(html).toContain(`aria-label="${copy.currencyFormat}"`);
    expect(html).toContain(`aria-label="${copy.percentageFormat}"`);
    expect(html).toContain(`aria-label="${copy.numberFormat}"`);
  });

  it('announces the active state from the same fact the preset defines', () => {
    const active = formulaBar({ activeCell: { value: 1, format: 'currency', numberFormatCode: '$#,##0.00' } });
    expect(active).toMatch(new RegExp(`data-grid-format-action="currency"[^>]*aria-pressed="true"`));
    expect(active).toMatch(new RegExp(`data-grid-format-action="date"[^>]*aria-pressed="false"`));
    // Without an explicit handler the button still applies the semantic type, not nothing.
    expect(formulaBar({ onApplyNumberFormat: undefined })).toContain('data-grid-format-action="currency"');
  });

  it('exposes the format code in the button title so the operation is auditable', () => {
    const html = formulaBar();
    const currency = GRID_NUMBER_FORMAT_PRESETS.find((preset) => preset.id === 'currency');
    expect(html).toContain(currency?.code ?? 'MISSING');
  });
});

describe('Grid formatting panel — visible entry points (Paket 15/16/17/18/19)', () => {
  it('offers every canonical number format in the select and a custom code field', () => {
    const html = panel();
    expect(html).toContain('id="grid-number-format-preset"');
    for (const preset of GRID_NUMBER_FORMAT_PRESETS) {
      expect(html).toContain(`>${preset.label}</option>`);
    }
    expect(html).toContain('aria-label="Custom number format code"');
    expect(html).toContain('aria-label="Border style"');
    expect(html).toContain('aria-label="Font colour"');
    expect(html).toContain('aria-label="Fill colour"');
  });

  it('shows the invalid custom code instead of offering to apply it', () => {
    // No stored code: the field starts empty and the action is blocked, not silently applied.
    const empty = panel();
    expect(empty).toContain('aria-label="Custom number format code" aria-invalid="true"');
    expect(empty).toContain('<button disabled="" class="vgt-button-secondary disabled:opacity-40">Custom</button>');
    // A stored, valid code is seeded so the user can re-apply or edit it.
    const seeded = panel({ activeCell: { value: 1, numberFormatCode: '#,##0.00' } });
    expect(seeded).toContain('value="#,##0.00"');
    expect(seeded).toContain('aria-invalid="false"');
  });

  it('lists the structured tables with an accessible style control per theme (Paket 19)', () => {
    const html = panel();
    expect(html).toContain('Table styles');
    expect(html).toContain('aria-label="Apply blue table style to Umsatz"');
    expect(html).toContain('aria-label="Apply amber table style to Umsatz"');
    expect(html).toMatch(/aria-label="Apply blue table style to Umsatz"[^>]*aria-pressed="true"|aria-pressed="true" aria-label="Apply blue table style to Umsatz"/);
  });

  it('shows an empty state when the sheet has no structured table', () => {
    const html = panel({ sheet: { ...sheet, tables: [] } });
    expect(html).toContain('No structured table on this sheet yet.');
  });

  it('renders the conditional-format dialog state: rule type, preview and disabled add button', () => {
    const invalid = panel({ selectedRange: 'not-a-range' });
    expect(invalid).toContain('Conditional Formatting Rules Manager');
    expect(invalid).toContain('id="grid-cf-range"');
    expect(invalid).toContain('data-grid-cf-preview="blocked"');
    // An unreadable range must block the action and be announced, not silently ignored.
    expect(invalid).toMatch(/<button[^>]*disabled=""[^>]*>Add rule<\/button>/);
    expect(invalid).toContain('role="alert"');
    expect(invalid).toContain('is not a valid A1 range');

    const valid = panel();
    expect(valid).toContain('data-grid-cf-preview="available"');
    expect(valid).toContain('data-grid-cf-sample="A1"');
    expect(valid).not.toMatch(/<button[^>]*disabled=""[^>]*>Add rule<\/button>/);
  });

  it('announces existing rules and their priority and keeps them editable', () => {
    const html = panel({
      sheet: {
        ...sheet,
        conditionalFormatting: [{ id: 'cf-1', range: 'A1:A2', kind: 'cell', operator: 'greater-than', value: 10, priority: 1 }],
      },
    });
    expect(html).toContain('A1:A2 · cell');
    expect(html).toContain('aria-label="Move conditional formatting rule A1:A2 up"');
    expect(html).toContain('aria-label="Delete conditional formatting rule A1:A2"');
  });

  it('shows the rule count empty state', () => {
    expect(panel()).toContain('No conditional-format rules on this sheet.');
  });
});
