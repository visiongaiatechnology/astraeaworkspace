// STATUS: PLATIN — rendered locale coverage for Grid professional and specialized controls.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { GridCellContextMenu } from '../../interactions/GridCellContextMenu';
import { GridProfessionalPanel } from '../../panels/GridProfessionalPanel';
import { GridPasteSpecialModal } from '../../clipboard/GridPasteSpecialModal';
import { GridGoalSeekModal } from '../../what-if/GridGoalSeekModal';
import { GridScenarioManagerModal } from '../../what-if/GridScenarioManagerModal';
import { GridSlicerModal } from '../../filters/GridSlicerModal';
import { GridWhatIfModal } from '../../what-if/GridWhatIfModal';
import { GRID_OFFICE_COPY, gridGoalSeekFailureCopy } from '../gridOfficeLocale';
import { GRID_ANALYSIS_COPY } from '../gridAnalysisLocale';
import { GRID_WHAT_IF_COPY, gridWhatIfFailureCopy } from '../gridWhatIfLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const localeHook = (locale: (typeof WORKSPACE_LOCALES)[number]) => {
  vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
};

const professionalProps = {
  sheet: { id: 'sheet-1', name: 'Quarterly plan', tableObjectId: 'table-1' },
  selectedCell: 'A1', selectedRange: 'A1:A1', namedRanges: [], onUpdateSheet: noop, cells: {}, dataModelTables: [],
  onCreatePivot: noop, onUpdatePivot: noop, onUpdateDataModel: noop, onCreateNamedRange: noop, onDeleteNamedRange: noop,
  onSelectNamedRange: noop, onApplyFormat: () => null, onApplyNumberFormat: noop, onApplyTableStyle: noop, onFillSelection: noop, formatPainterActive: false, onApplyCellStyle: noop,
  onToggleFormatPainter: noop, onApplyFormatPainter: noop, onAutoFitSelection: noop, onTableCreate: noop, onTableRename: noop,
  onTablePatch: noop, onTableToggleTotals: noop, onTableSetTotalFunction: noop, onTableSetCalculatedColumn: noop,
  onTableExport: noop, onTableImport: noop, onTablePublishDataset: async () => '', onOpenValidation: noop, onOpenSlicers: noop,
  onToggleCircleInvalid: noop, isCirclingInvalid: false, charts: [], chartPublishTargets: [], onOpenChartStudio: noop,
  onApplySparkline: noop, onPublishChart: noop, onPrint: noop, onExportPdf: noop, onExportPortable: noop,
  workspaceDocuments: [], publishObjects: [], publishTargets: [], onCreatePublishObject: noop, onDeletePublishObject: noop,
  onPublishObject: noop, onProtectToVault: async () => '', selectionRanges: ['A1'], workbookLocale: 'en-US',
  workbookCalculationMode: 'automatic', onPatchWorkbook: noop, onStructureEdit: noop, onSetAxisHidden: noop,
  onGroupAxis: noop, onGoTo: () => true, onGoToSpecial: () => 0, onTransferSelection: () => true,
  onFlashFill: () => 0, onAddDisjoint: noop, onClearDisjoint: noop, onSetRichTextCell: noop, onClose: noop,
} satisfies ComponentProps<typeof GridProfessionalPanel>;

const menuProps = {
  x: 8, y: 8, onClose: noop, onCopy: noop, onCut: noop, onPaste: noop, onOpenPasteSpecial: noop,
  onOpenGoalSeek: noop, onMergeCells: noop, onUnmergeCells: noop, onClearContents: noop,
  onOpenComments: noop, onOpenFindReplace: noop,
} satisfies ComponentProps<typeof GridCellContextMenu>;

const pasteProps = { isOpen: true, onClose: noop, onApply: noop } satisfies ComponentProps<typeof GridPasteSpecialModal>;
const goalSeekProps = { isOpen: true, onClose: noop, cells: {}, onApplyResult: noop } satisfies ComponentProps<typeof GridGoalSeekModal>;
const slicerProps = {
  isOpen: true, cells: {}, colCount: 1, rowCount: 10,
  slicers: [{ id: 'slicer-1', title: 'User authored region filter', column: 'A', selectedValues: ['North'] }],
  onClose: noop, onUpdateSlicers: noop,
} satisfies ComponentProps<typeof GridSlicerModal>;
const scenarioProps = {
  isOpen: true, scenarios: [{ id: 'scenario-1', name: 'Forecast baseline', sheetId: 'sheet-1', changingCells: ['B1'], values: { B1: 12 } }],
  cells: {}, sheetId: 'sheet-1', onClose: noop, onUpdateScenarios: noop, onApplyScenario: () => true, onAddSummarySheet: () => true,
} satisfies ComponentProps<typeof GridScenarioManagerModal>;
const whatIfProps = {
  isOpen: true, cells: {}, selectedCell: 'C1', onClose: noop, onApplyGoalSeekSolution: noop, onApplyScenario: async () => true,
} satisfies ComponentProps<typeof GridWhatIfModal>;

describe('Grid Office localization', () => {
  it('keeps all seven catalogs structurally complete and interpolation user-safe', () => {
    const expected = Object.keys(GRID_OFFICE_COPY['en-US']).sort();
    const subkeys = Object.fromEntries(Object.entries(GRID_OFFICE_COPY['en-US']).map(([section, copy]) => [section, Object.keys(copy).sort()]));
    for (const locale of WORKSPACE_LOCALES) {
      const copy = GRID_OFFICE_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expected);
      for (const [section, keys] of Object.entries(subkeys)) {
        expect(Object.keys(copy[section as keyof typeof copy]).sort(), `${locale}.${section}`).toEqual(keys);
      }
      expect(copy.goalSeek.newValue('C5'), `${locale}.newValue`).toContain('C5');
      expect(gridGoalSeekFailureCopy(locale, new Error('private engine token path')), locale).toBe(copy.goalSeek.genericFailure);
      expect(gridGoalSeekFailureCopy(locale, new Error('private engine token path'))).not.toContain('private engine');
      const analysis = GRID_ANALYSIS_COPY[locale];
      expect(Object.keys(analysis.slicer).sort(), `${locale}.slicer`).toEqual(Object.keys(GRID_ANALYSIS_COPY['en-US'].slicer).sort());
      expect(Object.keys(analysis.scenario).sort(), `${locale}.scenario`).toEqual(Object.keys(GRID_ANALYSIS_COPY['en-US'].scenario).sort());
      expect(analysis.slicer.clear(4), `${locale}.slicerCount`).toContain('4');
      expect(analysis.scenario.defaultName(2), `${locale}.scenarioIndex`).toContain('2');
      expect(Object.keys(GRID_WHAT_IF_COPY[locale]).sort(), `${locale}.whatIf`).toEqual(Object.keys(GRID_WHAT_IF_COPY['en-US']).sort());
      expect(gridWhatIfFailureCopy(locale, new Error('private engine token')), locale).toBe(GRID_WHAT_IF_COPY[locale].genericCalculationFailure);
    }
  });

  it('renders professional chrome, context actions, and dialogs in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeHook(locale);
      const copy = GRID_OFFICE_COPY[locale];
      const panel = renderToStaticMarkup(<GridProfessionalPanel {...professionalProps} />);
      expect(panel).toContain(copy.professional.title);
      expect(panel).toContain(`aria-label="${copy.professional.close}"`);
      for (const tab of Object.values(copy.professional.tabs)) expect(panel).toContain(tab);
      expect(panel).toContain('max-w-[360px]');
      expect(panel).toContain('break-words');

      const menu = renderToStaticMarkup(<GridCellContextMenu {...menuProps} />);
      expect(menu).toContain(`aria-label="${copy.contextMenu.accessibleName}"`);
      for (const label of Object.values(copy.contextMenu)) expect(menu).toContain(label);
      expect(menu).toContain('max-w-[min(18rem,calc(100vw-1rem))]');

      const paste = renderToStaticMarkup(<GridPasteSpecialModal {...pasteProps} />);
      expect(paste).toContain(`role="dialog"`);
      expect(paste).toContain(`aria-label="${copy.pasteSpecial.close}"`);
      for (const label of [copy.pasteSpecial.title, copy.pasteSpecial.modeLegend, copy.pasteSpecial.operationLegend, ...Object.values(copy.pasteSpecial.modes), ...Object.values(copy.pasteSpecial.operations), copy.pasteSpecial.skipBlanks, copy.pasteSpecial.transpose, copy.pasteSpecial.cancel, copy.pasteSpecial.apply]) {
        expect(paste, `${locale}: ${label}`).toContain(label);
      }
      expect(paste).toContain('break-words');
      expect(paste).toContain('max-h-[calc(100vh-2rem)]');

      const goalSeek = renderToStaticMarkup(<GridGoalSeekModal {...goalSeekProps} />);
      expect(goalSeek).toContain(`aria-label="${copy.goalSeek.close}"`);
      for (const label of [copy.goalSeek.targetCell, copy.goalSeek.targetValue, copy.goalSeek.changingCell, copy.goalSeek.cellPlaceholder, copy.goalSeek.valuePlaceholder, copy.goalSeek.cancel, copy.goalSeek.solve]) {
        expect(goalSeek, `${locale}: ${label}`).toContain(label);
      }
      expect(goalSeek).toContain('max-h-[calc(100vh-2rem)]');

      const slicer = renderToStaticMarkup(<GridSlicerModal {...slicerProps} />);
      expect(slicer).toContain(`aria-label="${GRID_ANALYSIS_COPY[locale].slicer.close}"`);
      expect(slicer).toContain(GRID_ANALYSIS_COPY[locale].slicer.title);
      expect(slicer).toContain(GRID_ANALYSIS_COPY[locale].slicer.clear(1));
      expect(slicer).toContain(GRID_ANALYSIS_COPY[locale].slicer.remove);
      // Leere Zellen werden als **eine Gruppe** gezeigt (richtiger als „keine Werte": man kann danach
      // filtern). Der Slicer übergibt dafür das übersetzte Etikett — vorher stand dort hartkodiertes Englisch.
      expect(slicer).toContain(GRID_ANALYSIS_COPY[locale].slicer.blanks);
      expect(slicer).toContain('flex-wrap');
      expect(slicer).toContain('max-h-[calc(100vh-2rem)]');
      expect(slicer).toContain('User authored region filter');

      const scenario = renderToStaticMarkup(<GridScenarioManagerModal {...scenarioProps} />);
      expect(scenario).toContain(`aria-label="${GRID_ANALYSIS_COPY[locale].scenario.close}"`);
      expect(scenario).toContain(GRID_ANALYSIS_COPY[locale].scenario.title);
      expect(scenario).toContain(GRID_ANALYSIS_COPY[locale].scenario.existing);
      expect(scenario).toContain(GRID_ANALYSIS_COPY[locale].scenario.changing);
      expect(scenario).toContain(GRID_ANALYSIS_COPY[locale].scenario.apply);
      expect(scenario).toContain(GRID_ANALYSIS_COPY[locale].scenario.delete);
      expect(scenario).toContain(GRID_ANALYSIS_COPY[locale].scenario.resultCells);
      expect(scenario).toContain('sm:grid-cols-12');
      expect(scenario).toContain('max-h-[calc(100vh-2rem)]');
      expect(scenario).toContain('Forecast baseline');

      const whatIf = renderToStaticMarkup(<GridWhatIfModal {...whatIfProps} />);
      expect(whatIf).toContain(`aria-label="${GRID_WHAT_IF_COPY[locale].close}"`);
      expect(whatIf).toContain(GRID_WHAT_IF_COPY[locale].title);
      expect(whatIf).toContain(GRID_WHAT_IF_COPY[locale].goalSeek);
      expect(whatIf).toContain(GRID_WHAT_IF_COPY[locale].description);
      expect(whatIf).toContain(GRID_WHAT_IF_COPY[locale].setCell);
      expect(whatIf).toContain('max-h-[calc(100vh-2rem)]');
    }
  });

  it('maps engine errors to localized fallback copy without exposing diagnostic details', () => {
    const engineError = new Error('internal token path: SECRET');
    for (const locale of WORKSPACE_LOCALES) {
      const fallback = gridGoalSeekFailureCopy(locale, engineError);
      expect(fallback, locale).toBe(GRID_OFFICE_COPY[locale].goalSeek.genericFailure);
      expect(fallback).not.toMatch(/SECRET|internal token path/);
      const whatIfFallback = gridWhatIfFailureCopy(locale, engineError);
      expect(whatIfFallback).toBe(GRID_WHAT_IF_COPY[locale].genericCalculationFailure);
      expect(whatIfFallback).not.toMatch(/SECRET|internal token path/);
    }
  });
});
