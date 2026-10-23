// Contract test: the visible Grid entry points for the name box, the sheet tab
// strip and the Paste Special preview must be real and wired.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GridFormulaBar } from '../../toolbar/GridFormulaBar';
import { GridBottomBar } from '../../toolbar/GridBottomBar';
import { GridPasteSpecialModal } from '../../clipboard/GridPasteSpecialModal';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const formulaBarProps = {
  selectedRange: 'A1:B4',
  selectedCell: 'A1',
  formulaInput: '',
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

describe('Grid name box entry point', () => {
  it('renders an editable name box instead of a static range badge', () => {
    const html = renderToStaticMarkup(createElement(GridFormulaBar, formulaBarProps));
    expect(html).toContain('data-grid-name-box="true"');
    expect(html).toContain('value="A1:B4"');
    expect(html).toContain('aria-label="Name box, selected range A1:B4"');
  });

  it('navigates from the name box instead of only opening the named-range list', () => {
    const source = read('../../toolbar/GridFormulaBar.tsx');
    expect(source).toContain('onGoToSelection(');
    expect(source).toContain("event.key === 'Enter'");
  });

  it('routes the name box through the Grid go-to handler', () => {
    const sheet = read('../../GridSheet.tsx');
    expect(sheet).toContain('onGoToSelection={handleGoTo}');
  });
});

describe('Grid sheet tab strip keyboard entry point', () => {
  const sheets = [
    { id: 'a', name: 'Alpha', tableObjectId: 'grid-table-1' },
    { id: 'b', name: 'Beta', tableObjectId: 'grid-table-2' },
  ];

  it('renders an accessible tab list with roving focus', () => {
    const html = renderToStaticMarkup(createElement(GridBottomBar, {
      sheets,
      activeSheetId: 'a',
      onSelectSheet: vi.fn(),
      onAddSheet: vi.fn(),
      onRenameSheet: vi.fn(),
      onDuplicateSheet: vi.fn(),
      onDeleteSheet: vi.fn(),
      onReorderSheet: vi.fn(),
      onChangeTabColor: vi.fn(),
      onSetSheetVisibility: vi.fn(),
      onUpdateActiveSheet: vi.fn(),
    }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it('switches sheets by keyboard', () => {
    const source = read('../../toolbar/GridBottomBar.tsx');
    expect(source).toContain('resolveGridWorkbookTabKey');
    expect(source).toContain('onKeyDown={handleTabStripKeyDown}');
  });
});

describe('Grid Paste Special preview entry point', () => {
  it('renders the preview produced by the applying planner', () => {
    const html = renderToStaticMarkup(createElement(GridPasteSpecialModal, {
      isOpen: true,
      onClose: vi.fn(),
      onApply: vi.fn(),
      onPreview: () => ({
        rows: [{ coord: 'C3', before: 'alt', after: 'neu', changed: true }],
        totalChanges: 1,
        truncated: false,
        mode: 'all',
        rejectedReason: null,
      }),
    }));
    expect(html).toContain('data-grid-paste-preview="true"');
    expect(html).toContain('C3');
    expect(html).toContain('neu');
    expect(html).toContain('1 Änderung(en)');
  });

  it('blocks applying a rejected plan instead of silently doing nothing', () => {
    const html = renderToStaticMarkup(createElement(GridPasteSpecialModal, {
      isOpen: true,
      onClose: vi.fn(),
      onApply: vi.fn(),
      onPreview: () => ({
        rows: [],
        totalChanges: 0,
        truncated: false,
        mode: 'all',
        rejectedReason: 'Die Zwischenablage ist leer – zuerst Zellen kopieren oder ausschneiden.',
      }),
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Zwischenablage ist leer');
    expect(html).toContain('disabled=""');
  });

  it('is wired from the Grid sheet down to the modal', () => {
    expect(read('../../GridSheetBottomLayer.tsx')).toContain('onPreviewPasteSpecial={state.previewPasteSpecial}');
    expect(read('../../overlays/GridModals.tsx')).toContain('onPreview={onPreviewPasteSpecial}');
  });
});
