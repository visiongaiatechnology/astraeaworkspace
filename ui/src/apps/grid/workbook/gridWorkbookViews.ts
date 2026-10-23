// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded workbook/sheet view operations.

import { GridAxisGroup, GridNamedView, GridSheetModel, WorkspaceDocument } from '../../../shared/contracts/workspace';

const MAX_AXIS_INDEX = 1_048_575;

export function setGridAxisHidden(sheet: GridSheetModel, axis: 'row'|'col', indices: readonly number[], hidden: boolean): GridSheetModel {
  const valid = indices.filter((v)=>Number.isInteger(v)&&v>=0&&v<=MAX_AXIS_INDEX).slice(0,10_000);
  const key = axis === 'row' ? 'hiddenRows' : 'hiddenCols';
  const next = new Set(sheet[key] ?? []);
  for (const index of valid) hidden ? next.add(index) : next.delete(index);
  return { ...sheet, [key]: [...next].sort((a,b)=>a-b) };
}

export function groupGridAxis(sheet: GridSheetModel, axis: 'row'|'col', start: number, end: number, collapsed = false): GridSheetModel {
  const lo=Math.max(0,Math.min(start,end)); const hi=Math.max(lo,Math.max(start,end));
  if (hi-lo>100_000) throw new Error('Axis group exceeds bounded range.');
  const key = axis === 'row' ? 'rowGroups' : 'colGroups';
  const group: GridAxisGroup={start:lo,end:hi,collapsed};
  const existing=(sheet[key] ?? []).filter(g=>!(g.start===lo&&g.end===hi));
  return { ...sheet, [key]: [...existing,group] };
}

export function saveGridNamedView(sheet: GridSheetModel, name: string): GridSheetModel {
  const trimmed=name.trim().slice(0,96); if(!trimmed) throw new Error('Named view requires a name.');
  const view: GridNamedView={id:crypto.randomUUID(),name:trimmed,sheetId:sheet.id,filters:sheet.filters?.map(f=>({...f})),sort:sheet.sort?.map(r=>({...r})),zoom:sheet.zoom};
  return {...sheet,namedViews:[...(sheet.namedViews??[]).filter(v=>v.name.toLocaleLowerCase()!==trimmed.toLocaleLowerCase()),view]};
}

export function applyGridNamedView(sheet: GridSheetModel, viewId: string): GridSheetModel {
  const view=(sheet.namedViews??[]).find(v=>v.id===viewId); if(!view) return sheet;
  return {...sheet,filters:view.filters?.map(f=>({...f}))??[],sort:view.sort?.map(r=>({...r}))??[],zoom:view.zoom??sheet.zoom};
}

export function patchGridWorkbook(document: WorkspaceDocument, patch: {locale?:string;calculationMode?:'automatic'|'manual'|'automatic-except-data-tables';properties?:Record<string,string>;iterativeCalculation?:{enabled:boolean;maxIterations:number;maxChange:number}}): WorkspaceDocument {
  if(!document.gridData) return document;
  const locale=patch.locale?.trim().slice(0,32);
  const properties=patch.properties ? {...(document.gridData.properties??{}),...Object.fromEntries(Object.entries(patch.properties).slice(0,64).map(([k,v])=>[k.slice(0,64),String(v).slice(0,512)]))} : document.gridData.properties;
  return {...document,version:document.version+1,modified_at:Date.now(),gridData:{...document.gridData,locale:locale||document.gridData.locale,calculationMode:patch.calculationMode??document.gridData.calculationMode,properties,iterativeCalculation:patch.iterativeCalculation??document.gridData.iterativeCalculation}};
}

/**
 * Per-sheet view-state index used by the virtualization hot path.
 *
 * `isGridAxisIndexVisible` is called once per visible *cell* by the canvas renderer, i.e. ~1,500
 * times per frame for a typical viewport. Building `new Set(hiddenAxis)` and filtering the collapsed
 * groups on every one of those calls dominated the redraw cost of a large imported table
 * (Grid Paket 42). The index is derived purely from the sheet, is cached per sheet object in a
 * `WeakMap` (so it is garbage collected with the sheet), and is invalidated as soon as any of the
 * four underlying arrays is replaced by an edit.
 */
interface GridAxisVisibilityIndex {
  hiddenRows: ReadonlySet<number>;
  hiddenCols: ReadonlySet<number>;
  collapsedRows: readonly GridAxisGroup[];
  collapsedCols: readonly GridAxisGroup[];
  source: readonly [ readonly number[] | undefined, readonly number[] | undefined, readonly GridAxisGroup[] | undefined, readonly GridAxisGroup[] | undefined ];
}

const GRID_AXIS_VISIBILITY_CACHE = new WeakMap<GridSheetModel, GridAxisVisibilityIndex>();

function axisVisibilityIndex(sheet: GridSheetModel): GridAxisVisibilityIndex {
  const cached = GRID_AXIS_VISIBILITY_CACHE.get(sheet);
  const hiddenRows = sheet.hiddenRows;
  const hiddenCols = sheet.hiddenCols;
  const rowGroups = sheet.rowGroups;
  const colGroups = sheet.colGroups;
  if (cached
    && cached.source[0] === hiddenRows && cached.source[1] === hiddenCols
    && cached.source[2] === rowGroups && cached.source[3] === colGroups) {
    return cached;
  }
  const next: GridAxisVisibilityIndex = {
    hiddenRows: new Set(hiddenRows ?? []),
    hiddenCols: new Set(hiddenCols ?? []),
    collapsedRows: (rowGroups ?? []).filter((group) => group.collapsed),
    collapsedCols: (colGroups ?? []).filter((group) => group.collapsed),
    source: [hiddenRows, hiddenCols, rowGroups, colGroups],
  };
  GRID_AXIS_VISIBILITY_CACHE.set(sheet, next);
  return next;
}

export function isGridAxisIndexVisible(sheet: GridSheetModel, axis: 'row'|'col', index: number): boolean {
  const index_ = axisVisibilityIndex(sheet);
  if (axis === 'row') {
    if (index_.hiddenRows.has(index)) return false;
    for (const group of index_.collapsedRows) if (index >= group.start && index <= group.end) return false;
    return true;
  }
  if (index_.hiddenCols.has(index)) return false;
  for (const group of index_.collapsedCols) if (index >= group.start && index <= group.end) return false;
  return true;
}

/**
 * Batch variant for windowed renderers: answers the whole visible window with one cache lookup
 * instead of one lookup per cell, and returns a plain array the caller can index.
 */
export function buildGridAxisVisibility(sheet: GridSheetModel, axis: 'row'|'col', indices: readonly number[]): boolean[] {
  const index = axisVisibilityIndex(sheet);
  const hidden = axis === 'row' ? index.hiddenRows : index.hiddenCols;
  const collapsed = axis === 'row' ? index.collapsedRows : index.collapsedCols;
  const out = new Array<boolean>(indices.length);
  for (let slot = 0; slot < indices.length; slot += 1) {
    const value = indices[slot]!;
    if (hidden.has(value)) { out[slot] = false; continue; }
    let visible = true;
    for (const group of collapsed) if (value >= group.start && value <= group.end) { visible = false; break; }
    out[slot] = visible;
  }
  return out;
}

