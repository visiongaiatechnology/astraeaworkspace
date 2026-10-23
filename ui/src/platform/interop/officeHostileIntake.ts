// STATUS: DIAMANT VGT SUPREME — hostile OOXML intake boundary.
import type { GridSheetModel, WorkspaceDocument } from '../../shared/contracts/workspace';

const ACTIVE_OFFICE_PART = /(?:^|\/)(?:vbaProject(?:Signature)?\.bin|activeX(?:\/|$)|embeddings(?:\/|$)|oleObject[^/]*|ctrlProps(?:\/|$)|externalLinks(?:\/|$)|customUI(?:\/|$))/iu;
const MAX_ACTIVE_PART_AUDIT = 256;

export interface OfficeActivePartStripResult {
  entries: Map<string, Uint8Array>;
  removedParts: string[];
}

export function isActiveOfficePackagePart(name: string): boolean {
  return ACTIVE_OFFICE_PART.test(name.replace(/\\/gu, '/'));
}

export function stripActiveOfficePackageParts(entries: ReadonlyMap<string, Uint8Array>): OfficeActivePartStripResult {
  const clean = new Map<string, Uint8Array>();
  const removedParts: string[] = [];
  for (const [name, bytes] of entries) {
    if (isActiveOfficePackagePart(name)) {
      if (removedParts.length < MAX_ACTIVE_PART_AUDIT) removedParts.push(name);
      continue;
    }
    clean.set(name, bytes);
  }
  return { entries: clean, removedParts };
}

interface FormulaNode {
  key: string;
  sheetName: string;
  coord: string;
  formula: string;
}

const FORMULA_REF = /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!)?\$?([A-Z]{1,4})\$?([1-9]\d*)/giu;

function canonicalSheet(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function formulaReferences(formula: string, currentSheet: string): string[] {
  const refs = new Set<string>();
  FORMULA_REF.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FORMULA_REF.exec(formula)) !== null) {
    const quoted = match[1]?.replace(/''/gu, "'");
    const sheet = canonicalSheet(quoted ?? match[2] ?? currentSheet);
    refs.add(`${sheet}!${match[3].toUpperCase()}${match[4]}`);
    if (match[0].length === 0) FORMULA_REF.lastIndex += 1;
  }
  return [...refs];
}

/**
 * Removes imported formulas that participate in a dependency cycle. Cached values remain intact,
 * so hostile circular workbooks cannot trigger recursive evaluation after import.
 */
export function stripCircularImportedGridFormulas(
  sheets: readonly GridSheetModel[],
  objects: WorkspaceDocument['objects'],
): number {
  const nodes = new Map<string, FormulaNode>();
  const sheetByName = new Map<string, GridSheetModel>();
  for (const sheet of sheets) sheetByName.set(canonicalSheet(sheet.name), sheet);

  for (const sheet of sheets) {
    const object = objects[sheet.tableObjectId];
    if (!object || object.type !== 'Table') continue;
    const sheetName = canonicalSheet(sheet.name);
    for (const [coord, cell] of Object.entries(object.data.cells)) {
      const formula = cell.formula?.trim();
      if (!formula) continue;
      const upperCoord = coord.toUpperCase();
      nodes.set(`${sheetName}!${upperCoord}`, { key: `${sheetName}!${upperCoord}`, sheetName, coord: upperCoord, formula });
    }
  }

  const edges = new Map<string, string[]>();
  for (const node of nodes.values()) {
    edges.set(node.key, formulaReferences(node.formula, node.sheetName).filter((ref) => nodes.has(ref)));
  }

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const stackIndex = new Map<string, number>();
  const cyclic = new Set<string>();

  const visit = (key: string): void => {
    const current = state.get(key) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const index = stackIndex.get(key);
      if (index !== undefined) for (let i = index; i < stack.length; i += 1) cyclic.add(stack[i]);
      cyclic.add(key);
      return;
    }
    state.set(key, 1);
    stackIndex.set(key, stack.length);
    stack.push(key);
    for (const dependency of edges.get(key) ?? []) visit(dependency);
    stack.pop();
    stackIndex.delete(key);
    state.set(key, 2);
  };

  for (const key of nodes.keys()) visit(key);

  for (const key of cyclic) {
    const node = nodes.get(key);
    if (!node) continue;
    const sheet = sheetByName.get(node.sheetName);
    if (!sheet) continue;
    const object = objects[sheet.tableObjectId];
    if (!object || object.type !== 'Table') continue;
    const cell = object.data.cells[node.coord];
    if (cell?.formula) cell.formula = undefined;
  }
  return cyclic.size;
}
