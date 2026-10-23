// STATUS: DIAMANT VGT SUPREME
// Astraea Grid Data operations UI: bounded filters, multi-key sorting, advanced filters, filter views and validation access.

import React, { useMemo, useState } from 'react';
import {
  GridCell,
  GridFilterOperator,
  GridFilterRule,
  GridNamedRange,
  GridSheetModel,
  GridSortRule,
} from '../../../shared/contracts/grid/workspaceGrid';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { ArrowDown, ArrowUp, Filter, Layers3, ListFilter, Plus, Save, Trash2 } from 'lucide-react';
import { createGridSecureId } from '../security/gridWebCryptoIntegrity';
import { gridDataCopy, gridSortByCopy } from '../locale/gridDataLocale';
import {
  describeGridSortPreview,
  moveGridSortLevel,
  previewGridSort,
  removeGridSortLevel,
  setGridSortLevelDirection,
  validateGridSortLevels,
  type GridSortIssue,
} from '../data/gridSortDialog';

interface GridDataPanelProps {
  sheet: GridSheetModel;
  selectedRange: string;
  namedRanges: GridNamedRange[];
  onUpdateSheet: (patch: Partial<GridSheetModel>) => void;
  onCreateNamedRange: (name: string) => void;
  onDeleteNamedRange: (id: string) => void;
  onSelectNamedRange: (range: GridNamedRange) => void;
  onFillSelection: () => void;
  onOpenValidation: () => void;
  onOpenSlicers: () => void;
  onToggleCircleInvalid: () => void;
  isCirclingInvalid: boolean;
  /** Cell map of the active sheet; enables the "what will the sort do" preview. */
  cells?: Record<string, GridCell>;
  /** Column count of the active sheet; used to reject levels outside the sheet. */
  columnCount?: number;
  /** Row count of the active sheet; bounds the preview. */
  rowCount?: number;
}

const FILTER_OPERATOR_VALUES: readonly GridFilterOperator[] = [
  'contains', 'not-contains', 'starts-with', 'ends-with', 'equals', 'not-equals',
  'greater-than', 'greater-than-or-equal', 'less-than', 'less-than-or-equal',
  'between', 'before', 'after', 'on-date', 'empty', 'not-empty',
];

export const GridDataPanel: React.FC<GridDataPanelProps> = ({
  sheet,
  selectedRange,
  namedRanges,
  onUpdateSheet,
  onCreateNamedRange,
  onDeleteNamedRange,
  onSelectNamedRange,
  onFillSelection,
  onOpenValidation,
  onOpenSlicers,
  onToggleCircleInvalid,
  isCirclingInvalid,
  cells,
  columnCount,
  rowCount,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = gridDataCopy(locale);
  const [filterColumn, setFilterColumn] = useState('A');
  const [filterOperator, setFilterOperator] = useState<GridFilterOperator>('contains');
  const [filterValue, setFilterValue] = useState('');
  const [filterValue2, setFilterValue2] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [sortColumn, setSortColumn] = useState('A');
  const [sortDirection, setSortDirection] = useState<GridSortRule['direction']>('asc');
  const [sortBy, setSortBy] = useState<NonNullable<GridSortRule['sortBy']>>('value');
  const [customList, setCustomList] = useState('');
  const [namedRangeName, setNamedRangeName] = useState('');
  const [viewName, setViewName] = useState('');
  const [sortIssues, setSortIssues] = useState<readonly GridSortIssue[]>([]);

  const filters = sheet.filters ?? [];
  const sorts = sheet.sort ?? [];
  const namedViews = sheet.namedViews ?? [];
  const noValue = filterOperator === 'empty' || filterOperator === 'not-empty';
  const sortColumnCount = columnCount ?? 16_384;

  // Preview only when the caller can supply the cell map; otherwise the structural validation above
  // is the whole answer and no behaviour is claimed.
  const sortPreview = useMemo(() => {
    if (!cells || !rowCount || sorts.length === 0) return null;
    const result = previewGridSort({
      cells,
      rowCount,
      columnCount: sortColumnCount,
      headerRowIndex: 0,
      levels: sorts,
      filters,
      advancedFilter: sheet.advancedFilter,
    });
    return result.ok ? result.preview : null;
  }, [cells, rowCount, sortColumnCount, sorts, filters, sheet.advancedFilter]);

  const addFilter = () => {
    const column = filterColumn.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(column)) return;
    const rule: GridFilterRule = {
      id: createGridSecureId('filter'),
      column,
      operator: filterOperator,
      value: noValue ? undefined : filterValue,
      value2: filterOperator === 'between' ? filterValue2 : undefined,
      caseSensitive,
    };
    onUpdateSheet({ filters: [...filters, rule] });
  };

  const addSort = () => {
    const column = sortColumn.trim().toUpperCase();
    const candidate = [
      ...sorts,
      {
        column,
        direction: sortDirection,
        sortBy,
        customList: sortBy === 'value' && customList.trim()
          ? customList.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 512)
          : undefined,
      } satisfies GridSortRule,
    ];
    // Fail-closed with named reasons: an unusable level is reported instead of silently dropped.
    const issues = validateGridSortLevels(candidate, sortColumnCount);
    if (issues.length > 0) {
      setSortIssues(issues);
      return;
    }
    setSortIssues([]);
    onUpdateSheet({ sort: candidate });
  };

  const captureAdvancedGroup = () => {
    if (!filters.length) return;
    const groups = sheet.advancedFilter?.groups ?? [];
    if (groups.length >= 32) return;
    onUpdateSheet({
      advancedFilter: {
        groups: [...groups, filters.map((rule) => ({ ...rule, id: createGridSecureId('advanced-filter') }))],
        uniqueOnly: sheet.advancedFilter?.uniqueOnly ?? false,
      },
    });
  };

  const saveFilterView = () => {
    const name = viewName.trim();
    if (!name || namedViews.some((view) => view.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    const nextView = {
      id: createGridSecureId('filter-view'),
      name,
      sheetId: sheet.id,
      filters: filters.map((rule) => ({ ...rule })),
      sort: sorts.map((rule) => ({ ...rule, customList: rule.customList ? [...rule.customList] : undefined })),
      zoom: sheet.zoom,
    };
    onUpdateSheet({ namedViews: [...namedViews, nextView], activeNamedViewId: nextView.id });
    setViewName('');
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-200 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5"/>{copy.autoFilter}</h3>
          {filters.length > 0 && <button type="button" onClick={() => onUpdateSheet({ filters: [] })} className="text-[0.625rem] text-slate-400 hover:text-white">{copy.clear}</button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input aria-label={`${copy.autoFilter}: ${copy.column}`} value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)} className="vgt-input" placeholder={copy.column} />
          <select aria-label={`${copy.autoFilter}: ${copy.condition}`} value={filterOperator} onChange={(e) => setFilterOperator(e.target.value as GridFilterOperator)} className="vgt-input">
            {FILTER_OPERATOR_VALUES.map((operator) => <option key={operator} value={operator}>{copy.filterOperators[operator]}</option>)}
          </select>
          {!noValue && <input aria-label={`${copy.autoFilter}: ${copy.value}`} value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="vgt-input" placeholder={copy.value} />}
          {filterOperator === 'between' && <input aria-label={`${copy.autoFilter}: ${copy.valueTwo}`} value={filterValue2} onChange={(e) => setFilterValue2(e.target.value)} className="vgt-input" placeholder={copy.valueTwo} />}
        </div>
        <label className="flex items-center gap-2 text-[0.625rem] text-slate-400"><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />{copy.caseSensitiveTextMatch}</label>
        <button type="button" onClick={addFilter} className="vgt-button-primary">{copy.addFilter}</button>
        <div className="space-y-1">{filters.map((filter) => (
          <div key={filter.id} className="flex items-center justify-between bg-white/5 px-2 py-1 rounded gap-2">
            <span className="truncate">{filter.column} {copy.filterOperators[filter.operator]} {String(filter.value ?? '')}{filter.value2 !== undefined ? ` … ${String(filter.value2)}` : ''}</span>
            <button aria-label={copy.deleteFilter} type="button" onClick={() => onUpdateSheet({ filters: filters.filter((item) => item.id !== filter.id) })}><Trash2 className="w-3 h-3 text-rose-400"/></button>
          </div>
        ))}</div>
      </section>

      <section className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-200 flex items-center gap-1.5"><Layers3 className="w-3.5 h-3.5"/>{copy.multiKeySort}</h3><span className="text-[0.625rem] text-slate-500">{copy.sortLevelCount(sorts.length)}</span></div>
        <div className="grid grid-cols-2 gap-2">
          <input aria-label={`${copy.multiKeySort}: ${copy.column}`} value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} className="vgt-input" placeholder={copy.column}/>
          <select aria-label={`${copy.multiKeySort}: ${copy.ascending}`} value={sortDirection} onChange={(e) => setSortDirection(e.target.value as GridSortRule['direction'])} className="vgt-input"><option value="asc">{copy.ascending}</option><option value="desc">{copy.descending}</option></select>
          <select aria-label={`${copy.multiKeySort}: ${copy.sortByValue}`} value={sortBy} onChange={(e) => setSortBy(e.target.value as NonNullable<GridSortRule['sortBy']>)} className="vgt-input"><option value="value">{copy.sortByValue}</option><option value="cell-color">{copy.sortByCellColor}</option><option value="font-color">{copy.sortByFontColor}</option><option value="icon">{copy.sortByConditionalIcon}</option></select>
          <input aria-label={`${copy.multiKeySort}: ${copy.customListPlaceholder}`} value={customList} onChange={(e) => setCustomList(e.target.value)} disabled={sortBy !== 'value'} className="vgt-input" placeholder={copy.customListPlaceholder}/>
        </div>
        <div className="flex gap-2"><button type="button" onClick={addSort} className="vgt-button-primary flex items-center gap-1"><Plus className="w-3 h-3"/>{copy.addSortLevel}</button>{sorts.length > 0 && <button type="button" onClick={() => { setSortIssues([]); onUpdateSheet({ sort: [] }); }} className="vgt-button-secondary">{copy.clear}</button>}</div>
        {sortIssues.length > 0 && (
          <ul role="alert" aria-label={copy.sortRejected} className="space-y-0.5 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-[0.625rem] text-rose-200">
            <li className="font-semibold">{copy.sortRejected}</li>
            {sortIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
          </ul>
        )}
        <div className="space-y-1">{sorts.map((sort, index) => (
          <div key={`${sort.column}-${index}`} className="flex items-center justify-between gap-1 rounded bg-white/5 px-2 py-1">
            <span className="min-w-0 flex-1 truncate">{index + 1}. {sort.column} · {gridSortByCopy(copy, sort.sortBy ?? 'value')} · {sort.direction === 'asc' ? copy.ascending : copy.descending}</span>
            <button type="button" aria-label={`${copy.moveSortLevelUp}: ${index + 1}`} disabled={index === 0} onClick={() => { setSortIssues([]); onUpdateSheet({ sort: [...moveGridSortLevel(sorts, index, -1)] }); }} className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-30"><ArrowUp className="w-3 h-3" aria-hidden="true"/></button>
            <button type="button" aria-label={`${copy.moveSortLevelDown}: ${index + 1}`} disabled={index === sorts.length - 1} onClick={() => { setSortIssues([]); onUpdateSheet({ sort: [...moveGridSortLevel(sorts, index, 1)] }); }} className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-30"><ArrowDown className="w-3 h-3" aria-hidden="true"/></button>
            <button type="button" aria-label={`${copy.descending}: ${index + 1}`} aria-pressed={sort.direction === 'desc'} onClick={() => { setSortIssues([]); onUpdateSheet({ sort: [...setGridSortLevelDirection(sorts, index, sort.direction === 'asc' ? 'desc' : 'asc')] }); }} className="rounded px-1 text-[0.625rem] font-mono text-slate-300 hover:bg-white/10">{sort.direction === 'asc' ? '↑' : '↓'}</button>
            <button aria-label={`${copy.deleteSortRule}: ${index + 1}`} type="button" onClick={() => { setSortIssues([]); onUpdateSheet({ sort: [...removeGridSortLevel(sorts, index)] }); }}><Trash2 className="w-3 h-3 text-rose-400"/></button>
          </div>
        ))}</div>
        <p role="status" aria-live="polite" className="text-[0.625rem] text-slate-400">
          {sortPreview
            ? describeGridSortPreview(sortPreview)
            : sorts.length > 0
              ? `${sorts.length}/${64} · ${copy.sortLevelCount(sorts.length)}`
              : copy.multiKeySort}
        </p>
      </section>

      <section className="space-y-2 border-t border-white/10 pt-3">
        <h3 className="font-semibold text-slate-200 flex items-center gap-1.5"><ListFilter className="w-3.5 h-3.5"/>{copy.advancedFilter}</h3>
        <div className="text-[0.625rem] text-slate-500">{copy.advancedFilterDescription}</div>
        <div className="flex gap-2"><button type="button" onClick={captureAdvancedGroup} disabled={!filters.length} className="vgt-button-secondary">{copy.captureFiltersAsOrGroup}</button><button type="button" onClick={() => onUpdateSheet({ advancedFilter: undefined })} className="vgt-button-secondary">{copy.clear}</button></div>
        <label className="flex items-center justify-between bg-white/5 rounded px-2 py-2"><span>{copy.uniqueRecordsOnly}</span><input type="checkbox" checked={sheet.advancedFilter?.uniqueOnly ?? false} onChange={(e) => onUpdateSheet({ advancedFilter: { groups: sheet.advancedFilter?.groups ?? [], uniqueOnly: e.target.checked } })}/></label>
        <div className="space-y-1">{(sheet.advancedFilter?.groups ?? []).map((group, index) => <div key={index} className="flex items-center justify-between bg-white/5 px-2 py-1 rounded"><span>{copy.orGroup} {index + 1}: {copy.conditionCount(group.length)}</span><button aria-label={copy.deleteAdvancedFilterGroup} type="button" onClick={() => onUpdateSheet({ advancedFilter: { ...sheet.advancedFilter!, groups: sheet.advancedFilter!.groups.filter((_, i) => i !== index) } })}><Trash2 className="w-3 h-3 text-rose-400"/></button></div>)}</div>
      </section>

      <section className="space-y-2 border-t border-white/10 pt-3">
        <h3 className="font-semibold text-slate-200">{copy.filterViews}</h3>
        <div className="flex gap-2"><input aria-label={`${copy.filterViews}: ${copy.filterViewPlaceholder}`} value={viewName} onChange={(e) => setViewName(e.target.value)} className="vgt-input flex-1" placeholder={copy.filterViewPlaceholder}/><button aria-label={copy.saveCurrentFilterView} type="button" onClick={saveFilterView} className="vgt-button-primary"><Save className="w-3 h-3"/></button></div>
        <button type="button" onClick={() => onUpdateSheet({ activeNamedViewId: undefined })} className="vgt-button-secondary">{copy.normalView}</button>
        <div className="space-y-1">{namedViews.map((view) => <div key={view.id} className={`flex items-center justify-between px-2 py-1 rounded ${sheet.activeNamedViewId === view.id ? 'bg-blue-500/15 border border-blue-500/20' : 'bg-white/5'}`}><button type="button" className="text-left flex-1" onClick={() => onUpdateSheet({ activeNamedViewId: view.id })}>{view.name}</button><button aria-label={copy.deleteSavedView} type="button" onClick={() => onUpdateSheet({ namedViews: namedViews.filter((item) => item.id !== view.id), activeNamedViewId: sheet.activeNamedViewId === view.id ? undefined : sheet.activeNamedViewId })}><Trash2 className="w-3 h-3 text-rose-400"/></button></div>)}</div>
      </section>

      <section className="space-y-2 border-t border-white/10 pt-3">
        <h3 className="font-semibold text-slate-200">{copy.dataValidationAndSlicers}</h3>
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onOpenValidation} className="vgt-button-primary">{copy.validation}</button><button type="button" onClick={onOpenSlicers} className="vgt-button-secondary">{copy.slicers}</button></div>
        <button type="button" onClick={onToggleCircleInvalid} className={isCirclingInvalid ? 'vgt-button-primary' : 'vgt-button-secondary'}>{isCirclingInvalid ? copy.stopCirclingInvalid : copy.circleInvalid}</button>
        <div className="text-[0.625rem] text-slate-500">{copy.validationRuleCount((sheet.validations ?? []).length)} · {copy.slicerCount((sheet.slicers ?? []).length)}</div>
      </section>

      <section className="space-y-2 border-t border-white/10 pt-3">
        <h3 className="font-semibold text-slate-200">{copy.namedRanges}</h3>
        <div className="text-[0.625rem] text-slate-500">{copy.currentSelection}: {selectedRange}</div>
        <div className="flex gap-2"><input aria-label={`${copy.namedRanges}: ${copy.nameRange}`} value={namedRangeName} onChange={(e) => setNamedRangeName(e.target.value)} className="vgt-input flex-1" placeholder={copy.namedRangePlaceholder}/><button type="button" onClick={() => { onCreateNamedRange(namedRangeName); setNamedRangeName(''); }} className="vgt-button-primary">{copy.nameRange}</button></div>
        <div className="space-y-1">{namedRanges.map((range) => <div key={range.id} className="flex items-center justify-between bg-white/5 px-2 py-1 rounded"><button type="button" onClick={() => onSelectNamedRange(range)} className="text-left flex-1"><span className="text-blue-300">{range.name}</span> <span className="text-slate-500">{range.range}</span></button><button aria-label={copy.deleteNamedRange} type="button" onClick={() => onDeleteNamedRange(range.id)}><Trash2 className="w-3 h-3 text-rose-400"/></button></div>)}</div>
        <button type="button" onClick={onFillSelection} className="vgt-button-secondary">{copy.fillSelectionFromActiveCell}</button>
      </section>
    </div>
  );
};
