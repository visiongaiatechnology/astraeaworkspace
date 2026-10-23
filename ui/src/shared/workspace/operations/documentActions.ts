import {
  WorkspaceDocument,
  TextBlockObject,
  TableObject,
  GridCell,
  WorkspaceObject,
  ChartObject,
} from '../../contracts/workspace';
import type { PresentChartSceneObject, PresentShapeSceneObject } from '../../contracts/present/workspacePresentScene';
import { parseA1, toA1 } from '../../../apps/grid/formulas/formula';

/**
 * PR-003 (M1) — the shell toolbar speaks its own shape vocabulary; the slide scene speaks exactly
 * ten shapes. The mapping is explicit so an unknown shell name cannot invent a scene type.
 */
function mapShellShapeToPresentShape(shape: string): PresentShapeSceneObject['shape'] {
  switch (shape) {
    case 'circle': return 'ellipse';
    case 'ellipse': return 'ellipse';
    case 'rounded-rectangle': return 'rounded-rectangle';
    case 'triangle': return 'triangle';
    case 'diamond': return 'diamond';
    case 'star': return 'star';
    case 'line': return 'line';
    case 'arrow-right': return 'arrow-right';
    case 'arrow-left': return 'arrow-left';
    case 'callout': return 'callout';
    default: return 'rectangle';
  }
}

/**
 * Apply rich text formatting (bold, italic, underline, heading, align) to a document.
 */
export function applyTextFormat(
  doc: WorkspaceDocument,
  cmd: string,
  val?: any
): { updatedDoc: WorkspaceDocument; message: string } {
  if (doc.kind === 'Writer') {
    const primaryTextBlockId =
      doc.root_object_ids.find((id) => doc.objects[id]?.type === 'TextBlock') ||
      doc.root_object_ids[0];
    const textBlockObj = primaryTextBlockId
      ? (doc.objects[primaryTextBlockId]?.data as TextBlockObject)
      : null;

    if (textBlockObj && primaryTextBlockId) {
      const paragraphs = [...textBlockObj.paragraphs];
      if (paragraphs.length > 0) {
        const lastIdx = paragraphs.length - 1;
        const p = paragraphs[lastIdx];

        if (cmd === 'bold') {
          paragraphs[lastIdx] = {
            ...p,
            spans: p.spans.map((s) => ({ ...s, bold: !s.bold })),
          };
        } else if (cmd === 'italic') {
          paragraphs[lastIdx] = {
            ...p,
            spans: p.spans.map((s) => ({ ...s, italic: !s.italic })),
          };
        } else if (cmd === 'underline') {
          paragraphs[lastIdx] = {
            ...p,
            spans: p.spans.map((s) => ({ ...s, underline: !s.underline })),
          };
        } else if (cmd === 'heading') {
          const level = (val as 1 | 2 | 3) || 1;
          paragraphs[lastIdx] = {
            ...p,
            style: { ...p.style, heading_level: level },
            spans: p.spans.map((s) => ({
              ...s,
              bold: true,
              font_size_pt: level === 1 ? 22 : 16,
            })),
          };
        } else if (cmd === 'align') {
          paragraphs[lastIdx] = {
            ...p,
            style: { ...p.style, alignment: val || 'left' },
          };
        } else if (cmd === 'list') {
          paragraphs[lastIdx] = {
            ...p,
            style: {
              ...p.style,
              list_style: p.style.list_style === 'bullet' ? undefined : 'bullet',
              list_level: 0,
            },
          };
        }

        const updatedDoc: WorkspaceDocument = {
          ...doc,
          version: doc.version + 1,
          modified_at: Date.now(),
          objects: {
            ...doc.objects,
            [primaryTextBlockId]: {
              type: 'TextBlock',
              data: { ...textBlockObj, paragraphs },
            },
          },
        };
        return { updatedDoc, message: `Writer: Applied ${cmd} formatting` };
      }
    }
  }

  return { updatedDoc: doc, message: `Applied ${cmd} format` };
}

/**
 * Apply cell number formatting (currency, percent, number) to all numeric cells in Grid.
 */
export function applyCellFormat(
  doc: WorkspaceDocument,
  format: 'currency' | 'percent' | 'number'
): { updatedDoc: WorkspaceDocument; message: string } {
  if (doc.kind !== 'Grid') return { updatedDoc: doc, message: 'Not a Grid document' };

  const primaryTableId = doc.root_object_ids.find(
    (id) => doc.objects[id]?.type === 'Table'
  );
  const tableObj = primaryTableId
    ? (doc.objects[primaryTableId].data as TableObject)
    : null;

  if (!tableObj || !primaryTableId) return { updatedDoc: doc, message: 'No Table object found' };

  const updatedCells: Record<string, GridCell> = { ...tableObj.cells };
  let count = 0;
  for (const [k, cell] of Object.entries(updatedCells)) {
    if (typeof cell.value === 'number') {
      updatedCells[k] = { ...cell, format };
      count++;
    }
  }

  const updatedDoc: WorkspaceDocument = {
    ...doc,
    version: doc.version + 1,
    modified_at: Date.now(),
    objects: {
      ...doc.objects,
      [primaryTableId]: {
        type: 'Table',
        data: { ...tableObj, cells: updatedCells },
      },
    },
  };

  return {
    updatedDoc,
    message: `Formatted ${count} numeric cell(s) as ${format}`,
  };
}

/**
 * Insert visual shape or card block into the active document.
 *
 * The result states **whether the document was changed** (`changed`). A caller must not report an
 * insertion for `changed: false`: for a document kind without a shape surface here this function
 * refuses with a named reason instead of naming an insertion it did not perform. Writer inserts
 * shapes through its own domain path (`useWriterState.handleInsertShape` -> `persistWriterData`),
 * not through this shared operation.
 */
export function insertShapeToDoc(
  doc: WorkspaceDocument,
  shape: string
): { updatedDoc: WorkspaceDocument; changed: boolean; message: string } {
  if (doc.kind === 'Present') {
    const currentSlides = doc.presentData?.slides ?? [];
    if (currentSlides.length === 0) {
      return {
        updatedDoc: doc,
        changed: false,
        message: `Shape insert rejected: the presentation has no slide to place the ${shape} on.`,
      };
    }
    /**
     * PR-003 (M1) — **one authority per object family.**
     *
     * This used to append a legacy `cards` entry: a second model family that the free canvas does
     * not render as an object, is invisible to the scene selection, and never passes through the
     * Present history. The document keeps exactly one shape authority — `sceneObjects` — so a
     * shape inserted from the shell looks and behaves like one created in the slide editor.
     * The slide stays the first one (the shell has no active-slide knowledge); that limitation is
     * the same one the old path had and does not create a second authority.
     */
    const presentShape = mapShellShapeToPresentShape(shape);
    const sceneObject: PresentShapeSceneObject = {
      id: `present-shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'shape',
      shape: presentShape,
      xPercent: 48,
      yPercent: 32,
      widthPercent: 24,
      heightPercent: 18,
      fillColor: '#38bdf8',
      strokeColor: '#0f172a',
      strokeWidth: 2,
      opacity: 1,
      zIndex: 20,
    };
    const updatedSlides = currentSlides.map((slide, index) =>
      index === 0 ? { ...slide, sceneObjects: [...(slide.sceneObjects ?? []), sceneObject] } : slide
    );
    const updatedDoc: WorkspaceDocument = {
      ...doc,
      version: doc.version + 1,
      modified_at: Date.now(),
      presentData: {
        ...doc.presentData,
        slides: updatedSlides,
        theme: doc.presentData?.theme ?? 'dark',
        aspectRatio: doc.presentData?.aspectRatio ?? '16:9',
      },
    };
    return { updatedDoc, changed: true, message: `Added ${presentShape} shape to the slide` };
  }

  // No shape surface for this document kind: report the refusal, never a success for a document
  // that was not touched. (`Draw` and `Present` are the kinds the shell toolbar offers this action
  // for; for both of them the document is returned unchanged here.)
  return {
    updatedDoc: doc,
    changed: false,
    message: `Shape insert rejected: this toolbar action has no shape surface for ${doc.kind} documents.`,
  };
}

export function extractChartDataFromGridRange(
  tableObj: TableObject,
  range: string,
): { categories: string[]; series: Array<{ name: string; values: number[]; color?: string }> } | null {
  const normalized = range.trim().toUpperCase();
  const parts = normalized.split(':');
  if (parts.length > 2 || !/^[A-Z]+[1-9]\d*$/.test(parts[0]) || (parts[1] && !/^[A-Z]+[1-9]\d*$/.test(parts[1]))) return null;
  const start = parseA1(parts[0]);
  const end = parseA1(parts[1] || parts[0]);
  if (!start || !end) return null;

  const minCol = Math.min(start.col, end.col), maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row);
  const width = maxCol - minCol + 1, height = maxRow - minRow + 1;
  const palette = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4'];
  const valueAt = (col: number, row: number) => tableObj.cells[toA1(col, row)]?.value;
  const numeric = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  if (width === 1 && height === 1) {
    return {
      categories: [toA1(minCol, minRow)],
      series: [{ name: 'Series 1', values: [numeric(valueAt(minCol, minRow))], color: palette[0] }],
    };
  }

  if (width === 1) {
    const first = valueAt(minCol, minRow);
    const hasHeader = typeof first === 'string' && first.trim() !== '' && !Number.isFinite(Number(first));
    const dataStartRow = hasHeader ? minRow + 1 : minRow;
    const categories = Array.from({ length: maxRow - dataStartRow + 1 }, (_, i) => String(dataStartRow + i + 1));
    const values = Array.from({ length: maxRow - dataStartRow + 1 }, (_, i) => numeric(valueAt(minCol, dataStartRow + i)));
    return { categories, series: [{ name: hasHeader ? String(first) : toA1(minCol, minRow).replace(/\d+$/, ''), values, color: palette[0] }] };
  }

  if (height === 1) {
    const first = valueAt(minCol, minRow);
    const hasSeriesName = typeof first === 'string' && first.trim() !== '' && !Number.isFinite(Number(first));
    const dataStartCol = hasSeriesName ? minCol + 1 : minCol;
    const categories = Array.from({ length: maxCol - dataStartCol + 1 }, (_, i) => toA1(dataStartCol + i, minRow).replace(/\d+$/, ''));
    const values = Array.from({ length: maxCol - dataStartCol + 1 }, (_, i) => numeric(valueAt(dataStartCol + i, minRow)));
    return { categories, series: [{ name: hasSeriesName ? String(first) : 'Series 1', values, color: palette[0] }] };
  }

  // Standard tabular chart interpretation: first row = series headers,
  // first column = category labels, body = numeric values.
  const categories = Array.from({ length: height - 1 }, (_, rowOffset) => {
    const row = minRow + rowOffset + 1;
    const value = valueAt(minCol, row);
    return String(value ?? `Row ${row + 1}`);
  });
  const series = Array.from({ length: width - 1 }, (_, colOffset) => {
    const col = minCol + colOffset + 1;
    const header = valueAt(col, minRow);
    const values = Array.from({ length: height - 1 }, (_, rowOffset) => numeric(valueAt(col, minRow + rowOffset + 1)));
    return {
      name: String(header ?? `Series ${colOffset + 1}`),
      values,
      color: palette[colOffset % palette.length],
    };
  });

  return { categories, series };
}

export function insertChartToDoc(
  doc: WorkspaceDocument,
  input?: string | ChartObject,
): { updatedDoc: WorkspaceDocument; chartId: string; message: string } {
  const suppliedChart = typeof input === 'object' && input !== null ? input : null;
  const sourceRange = typeof input === 'string' ? input : undefined;
  const chartId = suppliedChart?.id || `chart-${Date.now()}`;
  let categories = ['Q1', 'Q2', 'Q3', 'Q4'];
  let series: Array<{ name: string; values: number[]; color?: string }> = [{ name: 'Series 1', values: [25, 50, 75, 100], color: '#3b82f6' }];
  let dataSourceLink: string | undefined;

  if (!suppliedChart && doc.kind === 'Grid') {
    const sheet = doc.gridData?.sheets.find((item) => item.id === doc.gridData?.activeSheetId) ?? doc.gridData?.sheets[0];
    const tableId = sheet?.tableObjectId ?? doc.root_object_ids.find((id) => doc.objects[id]?.type === 'Table');
    const tableObj = tableId && doc.objects[tableId]?.type === 'Table' ? (doc.objects[tableId].data as TableObject) : null;
    if (tableObj) {
      const requestedRange = sourceRange || 'B1:E2';
      const extracted = extractChartDataFromGridRange(tableObj, requestedRange);
      if (extracted) {
        categories = extracted.categories;
        series = extracted.series;
        dataSourceLink = `vgt://workspace/document/${doc.id}/object/${tableId}?range=${encodeURIComponent(requestedRange)}`;
      }
    }
  }

  const chartData: ChartObject = suppliedChart ? {
    ...suppliedChart,
    id: chartId,
    categories: suppliedChart.categories.slice(0, 2_048),
    series: suppliedChart.series.slice(0, 64).map((item) => ({ ...item, values:item.values.slice(0,2_048) })),
  } : {
    id: chartId,
    chart_type: 'column',
    title: doc.kind === 'Grid' ? `Chart · ${sourceRange || 'Active Sheet'}` : 'Workspace Chart',
    categories,
    series,
    data_source_link: dataSourceLink,
  };

  const chart: WorkspaceObject = { type: 'Chart', data: chartData };
  const alreadyRoot = doc.root_object_ids.includes(chartId);
  let updatedDoc: WorkspaceDocument = {
    ...doc,
    version: doc.version + 1,
    modified_at: Date.now(),
    root_object_ids: alreadyRoot ? doc.root_object_ids : [...doc.root_object_ids, chartId],
    objects: { ...doc.objects, [chartId]: chart },
  };

  if (doc.kind === 'Present' && doc.presentData?.slides.length) {
    /**
     * PR-003 (M1, second authority) — a chart on a slide is a **scene object**, not a legacy
     * slide layout.
     *
     * This wrote `layout: 'chart'` and `chartReferenceId` into `presentData.slides[0]`: a legacy
     * model family that the free canvas never rendered as an object, that switched the slide out
     * of its layout, and that bypassed the Present history. The chart is appended to
     * `sceneObjects` like every other object; the legacy layout fields stay untouched so an
     * existing document keeps whatever it stored.
     */
    const chartSceneObject: PresentChartSceneObject = {
      id: `present-chart-${chartId}`,
      kind: 'chart',
      chart: chartData,
      linked: Boolean(chartData.data_source_link),
      xPercent: 55,
      yPercent: 22,
      widthPercent: 40,
      heightPercent: 52,
      opacity: 1,
      zIndex: 20,
    };
    const slides = doc.presentData.slides.map((slide, index) => (index === 0
      ? { ...slide, sceneObjects: [...(slide.sceneObjects ?? []), chartSceneObject] }
      : slide));
    updatedDoc = { ...updatedDoc, presentData: { ...doc.presentData, slides } };
  }

  const sourceLabel = suppliedChart?.source?.range || sourceRange || suppliedChart?.source?.kind || 'active sheet';
  return { updatedDoc, chartId, message: doc.kind === 'Grid' ? `Inserted ${chartData.chart_type} chart from ${sourceLabel}` : `Inserted chart ${chartId}` };
}
