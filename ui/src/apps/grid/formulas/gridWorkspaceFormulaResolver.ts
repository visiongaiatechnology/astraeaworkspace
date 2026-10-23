// STATUS: DIAMANT VGT SUPREME
// Astraea Grid local-only cross-workbook formula reference resolver.

import type { GridCell, TableObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { parseVgtUri } from '../../../shared/workspace-interaction/fabric';
import { parseGridRange } from '../compat/gridProfessional';
import { toA1 } from './formula';
import type { FormulaValue, SingleFormulaValue } from './gridFormulaTypes';

const MAX_CROSS_WORKBOOK_CELLS = 100_000;
const SAFE_REFERENCE = /^\$?[A-Z]+\$?[1-9]\d*(?::\$?[A-Z]+\$?[1-9]\d*)?$/i;

function cellValue(cell: GridCell | undefined): SingleFormulaValue {
  const value = cell?.value;
  return value === undefined ? null : value;
}

export function resolveWorkspaceGridFormulaReference(
  documents: Record<string, WorkspaceDocument>,
  uri: string,
  reference: string
): FormulaValue {
  const parsed = parseVgtUri(uri);
  if (!parsed || !SAFE_REFERENCE.test(reference) || reference.length > 128) return '#REF!';
  const sourceDocument = documents[parsed.docId];
  const sourceObject = sourceDocument?.objects[parsed.objId];
  if (!sourceDocument || sourceDocument.kind !== 'Grid' || !sourceObject || sourceObject.type !== 'Table') return '#REF!';
  const cells = (sourceObject.data as TableObject).cells ?? {};
  const normalized = reference.toUpperCase().replace(/\$/g, '');
  const bounds = parseGridRange(normalized);
  if (!bounds) return cellValue(cells[normalized]);
  const count = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
  if (count <= 0 || count > MAX_CROSS_WORKBOOK_CELLS) return '#CALC!';
  const matrix: SingleFormulaValue[][] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    const values: SingleFormulaValue[] = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col++) values.push(cellValue(cells[toA1(col, row)]));
    matrix.push(values);
  }
  return matrix.length === 1 && matrix[0].length === 1 ? matrix[0][0] : matrix;
}
