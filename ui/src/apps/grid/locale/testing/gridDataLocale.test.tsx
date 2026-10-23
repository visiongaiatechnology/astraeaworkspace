// STATUS: PLATIN — seven-locale rendered coverage for Grid data controls and accessible labels.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { GridNamedRange, GridSheetModel } from '../../../../shared/contracts/grid/workspaceGrid';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { GridDataPanel } from '../../panels/GridDataPanel';
import { GRID_DATA_COPY } from '../gridDataLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const filter = { id: 'filter-1', column: 'B', operator: 'contains', value: 'sample' } as const;
const sheet: GridSheetModel = {
  id: 'sheet-1',
  name: 'Sheet 1',
  tableObjectId: 'table-1',
  filters: [filter],
  sort: [{ column: 'B', direction: 'asc', sortBy: 'cell-color' }],
  advancedFilter: { groups: [[filter]], uniqueOnly: true },
  namedViews: [{ id: 'view-1', name: 'Quarterly view', sheetId: 'sheet-1' }],
  activeNamedViewId: 'view-1',
  validations: [{ id: 'validation-1', range: 'B2:B5', kind: 'whole-number' }],
  slicers: [],
};
const namedRanges: GridNamedRange[] = [{ id: 'range-1', name: 'Revenue_Q1', sheetId: 'sheet-1', range: 'B2:B5' }];

const escapeMarkup = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#x27;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

it('renders localized Grid filter, sort, validation, view, and named-range controls for all locales', () => {
  const expectedKeys = Object.keys(GRID_DATA_COPY['en-US']).sort();
  const expectedOperators = Object.keys(GRID_DATA_COPY['en-US'].filterOperators).sort();

  for (const locale of WORKSPACE_LOCALES) {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
    const copy = GRID_DATA_COPY[locale];
    const markup = renderToStaticMarkup(<GridDataPanel
      sheet={sheet}
      selectedRange="B2:B5"
      namedRanges={namedRanges}
      onUpdateSheet={noop}
      onCreateNamedRange={noop}
      onDeleteNamedRange={noop}
      onSelectNamedRange={noop}
      onFillSelection={noop}
      onOpenValidation={noop}
      onOpenSlicers={noop}
      onToggleCircleInvalid={noop}
      isCirclingInvalid={false}
    />);

    expect(Object.keys(copy).sort(), `${locale} catalog parity`).toEqual(expectedKeys);
    expect(Object.keys(copy.filterOperators).sort(), `${locale} filter-operator parity`).toEqual(expectedOperators);
    const labels = [
      copy.autoFilter, copy.clear, copy.column, copy.condition, copy.value, ...Object.values(copy.filterOperators),
      copy.caseSensitiveTextMatch, copy.addFilter, copy.deleteFilter, copy.multiKeySort, copy.ascending, copy.descending,
      copy.sortByValue, copy.sortByCellColor, copy.sortByFontColor, copy.sortByConditionalIcon, copy.customListPlaceholder,
      copy.addSortLevel, copy.deleteSortRule, copy.advancedFilter, copy.advancedFilterDescription, copy.captureFiltersAsOrGroup,
      copy.orGroup, copy.uniqueRecordsOnly, copy.deleteAdvancedFilterGroup, copy.filterViews, copy.filterViewPlaceholder,
      copy.saveCurrentFilterView, copy.normalView, copy.deleteSavedView, copy.dataValidationAndSlicers, copy.validation,
      copy.slicers, copy.circleInvalid, copy.namedRanges, copy.currentSelection, copy.namedRangePlaceholder, copy.nameRange,
      copy.deleteNamedRange, copy.fillSelectionFromActiveCell, copy.sortLevelCount(1), copy.conditionCount(1),
      copy.validationRuleCount(1), copy.slicerCount(0),
    ];
    for (const label of labels) expect(markup, `${locale}: ${label}`).toContain(escapeMarkup(label));
    expect(markup).toContain('Quarterly view');
    expect(markup).toContain('Revenue_Q1');
    expect(markup).toContain('sample');
    expect(markup).toContain(`B ${escapeMarkup(copy.filterOperators.contains)} sample`);
    expect(markup).toContain('cell-color');

    const circlingMarkup = renderToStaticMarkup(<GridDataPanel
      sheet={sheet}
      selectedRange="B2:B5"
      namedRanges={namedRanges}
      onUpdateSheet={noop}
      onCreateNamedRange={noop}
      onDeleteNamedRange={noop}
      onSelectNamedRange={noop}
      onFillSelection={noop}
      onOpenValidation={noop}
      onOpenSlicers={noop}
      onToggleCircleInvalid={noop}
      isCirclingInvalid
    />);
    expect(circlingMarkup, `${locale}: stop circling label`).toContain(escapeMarkup(copy.stopCirclingInvalid));
  }
});
