// STATUS: DIAMANT VGT SUPREME
// Astraea Grid workbook tab keyboard semantics. Pure: it only decides which sheet
// becomes active for a key press on the sheet tab strip.

import type { GridKeyDescriptor } from '../editing/gridNavigation';

export interface GridWorkbookTab {
  readonly id: string;
  readonly hidden?: boolean;
  readonly veryHidden?: boolean;
}

export type GridWorkbookTabAction =
  | { readonly kind: 'activate'; readonly sheetId: string }
  | { readonly kind: 'none' };

const NONE: GridWorkbookTabAction = { kind: 'none' };

function isSelectable(tab: GridWorkbookTab): boolean {
  return !tab.hidden && !tab.veryHidden;
}

/** Next selectable tab in `step` direction, or -1 when the edge is reached (Excel does not wrap). */
export function nextGridWorkbookTabIndex(tabs: readonly GridWorkbookTab[], activeIndex: number, step: number): number {
  if (step === 0 || tabs.length === 0) return -1;
  let index = activeIndex;
  for (let guard = 0; guard < tabs.length + 1; guard += 1) {
    index += step > 0 ? 1 : -1;
    if (index < 0 || index >= tabs.length) return -1;
    if (isSelectable(tabs[index])) return index;
  }
  return -1;
}

export function resolveGridWorkbookTabKey(
  key: GridKeyDescriptor,
  tabs: readonly GridWorkbookTab[],
  activeSheetId: string,
): GridWorkbookTabAction {
  if (key.isComposing) return NONE;
  const ctrl = key.ctrlKey === true || key.metaKey === true;
  const activeIndex = tabs.findIndex((tab) => tab.id === activeSheetId);

  const activateAt = (index: number): GridWorkbookTabAction =>
    index >= 0 && index < tabs.length ? { kind: 'activate', sheetId: tabs[index].id } : NONE;

  switch (key.key) {
    case 'PageDown':
      if (!ctrl) return NONE;
      return activateAt(activeIndex < 0 ? tabs.findIndex(isSelectable) : nextGridWorkbookTabIndex(tabs, activeIndex, 1));
    case 'PageUp':
      if (!ctrl) return NONE;
      return activateAt(activeIndex < 0 ? tabs.findIndex(isSelectable) : nextGridWorkbookTabIndex(tabs, activeIndex, -1));
    case 'ArrowRight':
      return activateAt(activeIndex < 0 ? tabs.findIndex(isSelectable) : nextGridWorkbookTabIndex(tabs, activeIndex, 1));
    case 'ArrowLeft':
      return activateAt(activeIndex < 0 ? tabs.findIndex(isSelectable) : nextGridWorkbookTabIndex(tabs, activeIndex, -1));
    case 'Home':
      return activateAt(tabs.findIndex(isSelectable));
    case 'End': {
      for (let index = tabs.length - 1; index >= 0; index -= 1) if (isSelectable(tabs[index])) return activateAt(index);
      return NONE;
    }
    default:
      return NONE;
  }
}
