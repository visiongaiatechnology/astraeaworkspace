// STATUS: DIAMANT VGT SUPREME
import type { GridCell } from '../../../shared/contracts/workspace';
import type { ParsedSheetRef } from './gridFormulaEngineTypes';

export function parseSheetReference(refStr: string): ParsedSheetRef | null {
  const match = refStr.match(/^(?:'([^']+)'|([^!]+))!(.+)$/);
  if (!match) return null;
  const sheetPart = match[1] ?? match[2];
  const cellOrRange = match[3].trim();

  // Check for 3D range across multiple sheets: Sheet1:Sheet3 or 'Sheet 1:Sheet 3'
  const multiSheetMatch = sheetPart.match(/^(?:'([^']+)'|([^:]+)):(?:'([^']+)'|([^:]+))$/);
  if (multiSheetMatch) {
    const startSheet = multiSheetMatch[1] ?? multiSheetMatch[2];
    const endSheet = multiSheetMatch[3] ?? multiSheetMatch[4];
    return { startSheet: startSheet.trim(), endSheet: endSheet.trim(), cellOrRange };
  }

  return { startSheet: sheetPart.trim(), cellOrRange };
}

export function findSheetCells(
  sheetName: string,
  allSheets?: Record<string, Record<string, GridCell>>
): Record<string, GridCell> | null {
  if (!allSheets) return null;
  const clean = sheetName.replace(/^'|'$/g, '').toLowerCase();
  for (const [k, v] of Object.entries(allSheets)) {
    if (k.toLowerCase() === clean) return v;
  }
  return null;
}

export function getSheetsInRange(
  startSheet: string,
  endSheet: string,
  allSheets?: Record<string, Record<string, GridCell>>
): Array<{ name: string; cells: Record<string, GridCell> }> {
  if (!allSheets) return [];
  const sheetKeys = Object.keys(allSheets);
  const startLower = startSheet.toLowerCase().replace(/^'|'$/g, '');
  const endLower = endSheet.toLowerCase().replace(/^'|'$/g, '');

  const startIdx = sheetKeys.findIndex((k) => k.toLowerCase() === startLower);
  const endIdx = sheetKeys.findIndex((k) => k.toLowerCase() === endLower);

  if (startIdx === -1 || endIdx === -1) return [];

  const minIdx = Math.min(startIdx, endIdx);
  const maxIdx = Math.max(startIdx, endIdx);

  const result: Array<{ name: string; cells: Record<string, GridCell> }> = [];
  for (let i = minIdx; i <= maxIdx; i++) {
    result.push({ name: sheetKeys[i], cells: allSheets[sheetKeys[i]] });
  }
  return result;
}

