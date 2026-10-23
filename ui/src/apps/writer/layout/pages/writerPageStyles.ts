// STATUS: DIAMANT VGT SUPREME — Page Dimension, Margin and Border Style Resolvers
import React from 'react';
import type { PageSetupConfig, ViewMode } from '../../types';
import { getMargins } from '../pagination/writerPagination';
import { resolveWriterPaperDimensionsMm } from '../../../../platform/document-layout/writerPaperSizes';

export function getPageDimensionStyle(setup: PageSetupConfig, viewMode: ViewMode): React.CSSProperties {
  if (viewMode !== 'print' && viewMode !== 'reading') {
    return { width: '100%', maxWidth: '850px', minHeight: '800px' };
  }
  const dims = resolveWriterPaperDimensionsMm(setup);

  const baseW = setup.orientation === 'landscape' ? dims.height : dims.width;
  const baseH = setup.orientation === 'landscape' ? dims.width : dims.height;
  const scale = 3.7795;
  /**
   * Native regression (Runde 4) — a sheet is exactly one sheet.
   *
   * Only a `minHeight` let the paper grow with its content: with many paragraphs the sheet
   * stretched past the 30-cm ruler instead of breaking to page 2. `height` plus `maxHeight`
   * bound the sheet to the paper format; the page root already clips its content, and the
   * paginator is responsible for never putting more on a page than fits.
   */
  const heightPx = Math.round(baseH * scale);
  return {
    width: `${Math.round(baseW * scale)}px`,
    height: `${heightPx}px`,
    minHeight: `${heightPx}px`,
    maxHeight: `${heightPx}px`,
  };
}

export function getMarginPadding(setup: PageSetupConfig, pageIndex: number): React.CSSProperties {
  const margins = getMargins(setup, pageIndex);
  return {
    paddingTop: `${margins.top}mm`,
    paddingBottom: `${margins.bottom}mm`,
    paddingLeft: `${margins.left}mm`,
    paddingRight: `${margins.right}mm`,
  };
}

export function getPageBorderStyle(setup: PageSetupConfig): React.CSSProperties {
  if (!setup.pageBorders) return {};
  return {
    position: 'absolute',
    inset: `${setup.pageBorders.paddingMm}mm`,
    border: `${setup.pageBorders.widthPt}pt ${setup.pageBorders.style} ${setup.pageBorders.color}`,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };
}
