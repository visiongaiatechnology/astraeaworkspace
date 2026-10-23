// STATUS: DIAMANT VGT SUPREME — Bounded passive cross-workspace snapshot extraction
import type {
  ChartObject,
  TableObject,
  WorkspaceDocument,
  WriterWorkspaceEmbedKind,
  WriterWorkspaceEmbedSnapshot,
} from '../../../../shared/contracts/workspace';
import { evaluateWriterTableFormulas, parseCellNumber } from '../../tables/formulas/writerTableFormula';
import { writerGridCellText } from '../../integrations/grid/writerGridCellText';
import { normalizeCanonicalChart } from '../../../../shared/charts/chartModel';
import { WorkspaceSnapshotError, type WorkspaceSnapshotRequest } from '../../../../platform/workspace/integrations/workspaceSnapshot';
import { parseWriterGridRange as parseWriterGridRangeRule } from '../../../../shared/writer/grid/writerGridRange';

const MAX_TABLE_COLUMNS = 64;
const MAX_TIMELINE_ITEMS = 250;
const MAX_TEXT = 2_048;

export class WriterWorkspaceIntegrationError extends WorkspaceSnapshotError {
  constructor(message: string) {
    super(message);
    this.name = 'WriterWorkspaceIntegrationError';
  }
}

export type WriterWorkspaceSnapshotRequest = WorkspaceSnapshotRequest;

function safeText(value: unknown, max = MAX_TEXT): string {
  return String(value ?? '').normalize('NFKC').slice(0, max);
}


function columnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function gridCellText(table: TableObject, col: number, row: number): string {
  const cell = table.cells[`${columnLabel(col)}${row + 1}`] ?? table.cells[`${row}:${col}`];
  // The same definition the range-link path uses, so one cell cannot read two ways (W-237/W-239).
  return writerGridCellText(cell, { booleanTrue: 'Ja', booleanFalse: 'Nein' });
}

function gridRangeSnapshot(document: WorkspaceDocument, objectId: string, rangeInput: string): WriterWorkspaceEmbedSnapshot {
  const object = document.objects[objectId];
  if (!object || object.type !== 'Table') throw new WriterWorkspaceIntegrationError('Das ausgewählte Grid-Sheet ist nicht verfügbar.');
  // **Eine** Regel für A1-Bereiche (W-240). Der Wortlaut bleibt hier, die Grenzen kommen aus der Regel —
  // und die Meldung nennt jetzt die konkrete Zahl, die der Einbettungspfad vorher verschwieg.
  const parsed = parseWriterGridRangeRule(rangeInput, { cols: object.data.cols, rows: object.data.rows });
  if (!parsed.ok) {
    const limit = parsed.limit;
    const detail = parsed.reason === 'invalid-range'
      ? 'Grid-Bereich muss eine gültige A1-Range sein.'
      : parsed.reason === 'outside-sheet'
        ? 'Grid-Bereich liegt außerhalb des Sheets.'
        : `Grid-Embed überschreitet die erlaubte Range-Größe (höchstens ${
            parsed.reason === 'too-many-columns' ? `${limit} Spalten`
              : parsed.reason === 'too-many-rows' ? `${limit} Zeilen`
                : `${(limit ?? 0).toLocaleString('de-DE')} Zellen`}).`;
    throw new WriterWorkspaceIntegrationError(detail);
  }
  const minCol = parsed.range.start.col;
  const minRow = parsed.range.start.row;
  const columnCount = parsed.range.width;
  const rowCount = parsed.range.height;
  const columns = Array.from({ length: columnCount }, (_, index) => columnLabel(minCol + index));
  const rows = Array.from({ length: rowCount }, (_, rowOffset) =>
    columns.map((_, colOffset) => gridCellText(object.data, minCol + colOffset, minRow + rowOffset))
  );
  return { type: 'table', columns, rows };
}

export function writerTableChartSnapshot(table: NonNullable<WorkspaceDocument['writerData']>['tables'][number]): WriterWorkspaceEmbedSnapshot {
  const evaluated = evaluateWriterTableFormulas(table).table;
  const rows = evaluated.rows.slice(0, 512);
  if (rows.length === 0 || evaluated.columns.length === 0) {
    throw new WriterWorkspaceIntegrationError('Writer-Tabelle enthält keine Diagrammdaten.');
  }

  const valuesByColumn = evaluated.columns.slice(0, MAX_TABLE_COLUMNS).map((_, columnIndex) =>
    rows.map((row) => parseCellNumber(row.cells[columnIndex]?.content ?? ''))
  );
  const numericColumns = valuesByColumn
    .map((values, columnIndex) => ({ values, columnIndex, numericCount: values.filter((value) => value !== null).length }))
    .filter((item) => item.numericCount > 0);
  if (numericColumns.length === 0) throw new WriterWorkspaceIntegrationError('Writer-Tabelle enthält keine numerische Datenserie.');

  const firstColumnIsMostlyLabels = valuesByColumn[0]?.filter((value) => value === null).length >= Math.ceil(rows.length / 2);
  const categoryColumn = firstColumnIsMostlyLabels ? 0 : -1;
  const categories = rows.map((row, rowIndex) => categoryColumn === 0
    ? safeText(row.cells[0]?.content || String(rowIndex + 1), 256)
    : String(rowIndex + 1));
  const series = numericColumns
    .filter((item) => item.columnIndex !== categoryColumn)
    .slice(0, 32)
    .map((item) => ({
      name: safeText(evaluated.columns[item.columnIndex] || `Serie ${item.columnIndex + 1}`, 256),
      values: item.values.map((value) => value ?? 0),
    }));
  if (series.length === 0) throw new WriterWorkspaceIntegrationError('Writer-Tabelle enthält neben den Kategorien keine numerische Datenserie.');

  const title=safeText(table.caption || 'Writer-Diagramm', 512);
  const chart=normalizeCanonicalChart({id:`writer-table-${safeText(table.id,128)}`,chart_type:'column',title,categories,series,source:{kind:'inline',live:false,state:'frozen'},source_state:'frozen',render_mode:'2d'});
  return { type:'chart', title, categories, series, chart };
}

function chartSnapshot(chart: ChartObject): WriterWorkspaceEmbedSnapshot {
  const canonical=normalizeCanonicalChart(chart);
  return {
    type: 'chart',
    title: safeText(canonical.title, 512),
    categories: canonical.categories.slice(0, 512).map((item) => safeText(item, 256)),
    series: canonical.series.slice(0, 64).map((series) => ({
      name: safeText(series.name, 256),
      values: series.values.slice(0, 512).map((value) => Number.isFinite(value) ? value : 0),
    })),
    chart: canonical,
  };
}

function taskSnapshot(document: WorkspaceDocument, kind: WriterWorkspaceEmbedKind): WriterWorkspaceEmbedSnapshot {
  const data = document.workData ?? document.workManagementData;
  if (document.kind !== 'Tasks' || !data) throw new WriterWorkspaceIntegrationError('Quelle ist kein Open-Core Tasks-Dokument.');
  const tasks = data.tasks.slice(0, MAX_TIMELINE_ITEMS);
  if (kind === 'task-list') {
    return {
      type: 'table',
      columns: ['Aufgabe', 'Status', 'Priorität', 'Start', 'Fällig', 'Fortschritt'],
      rows: tasks.map((task) => [
        safeText(task.title, 512), task.completed ? 'Erledigt' : 'Offen', task.priority,
        task.startDate ?? '', task.dueDate ?? '', `${Math.max(0, Math.min(100, task.progress ?? (task.completed ? 100 : 0)))} %`,
      ]),
    };
  }
  if (kind === 'task-kpi') {
    const completed = tasks.filter((task) => task.completed).length;
    const overdue = tasks.filter((task) => !task.completed && Boolean(task.dueDate) && task.dueDate! < new Date().toISOString().slice(0, 10)).length;
    const blocked = tasks.filter((task) => task.blocked || task.status === 'blocked').length;
    return { type: 'summary', metrics: [
      { label: 'Aufgaben', value: String(tasks.length) }, { label: 'Erledigt', value: String(completed) },
      { label: 'Blockiert', value: String(blocked) }, { label: 'Überfällig', value: String(overdue) },
      { label: 'Erledigungsquote', value: `${tasks.length ? Math.round(completed / tasks.length * 100) : 0} %` },
    ], lines: [] };
  }
  throw new WriterWorkspaceIntegrationError('Unsupported Open-Core Tasks embed kind.');
}

function whiteboardFrame(document: WorkspaceDocument, frameId: string): WriterWorkspaceEmbedSnapshot {
  if (document.kind === 'Draw') {
    const model = document.drawData;
    const frame = model?.objects[frameId];
    if (!model || !frame || frame.type !== 'frame') throw new WriterWorkspaceIntegrationError('Draw-Frame wurde nicht gefunden.');
    const inside = Object.values(model.objects).filter((item) => item.id !== frame.id && item.pageId === frame.pageId && item.x >= frame.x && item.y >= frame.y && item.x + item.width <= frame.x + frame.width && item.y + item.height <= frame.y + frame.height);
    return { type:'frame', name:safeText(frame.name || 'Draw Frame',512), text:'', containedItems:inside.slice(0,128).map((item)=>({id:item.id,type:item.type,text:safeText(item.richText?.runs.map((run)=>run.text).join('') || item.name,512)})) };
  }
  const items = document.whiteboardData?.items ?? [];
  const frame = items.find((item) => item.id === frameId && item.type === 'frame');
  if (!frame) throw new WriterWorkspaceIntegrationError('Whiteboard-Frame wurde nicht gefunden.');
  const inside = items.filter((item) => item.id !== frame.id && item.x >= frame.x && item.y >= frame.y && item.x + item.width <= frame.x + frame.width && item.y + item.height <= frame.y + frame.height);
  return {
    type: 'frame',
    name: safeText(frame.name || frame.text || 'Frame', 512),
    text: safeText(frame.text),
    containedItems: inside.slice(0, 128).map((item) => ({ id: item.id, type: item.type, text: safeText(item.text, 512) })),
  };
}

function presentSlide(document: WorkspaceDocument, slideId: string): WriterWorkspaceEmbedSnapshot {
  const slide = document.presentData?.slides.find((item) => item.id === slideId);
  if (!slide) throw new WriterWorkspaceIntegrationError('Present-Slide wurde nicht gefunden.');
  return {
    type: 'slide', title: safeText(slide.title, 512), subtitle: safeText(slide.subtitle, 512),
    bulletPoints: (slide.bulletPoints ?? []).slice(0, 64).map((item) => safeText(item, 512)),
    sceneObjectCount: slide.sceneObjects?.length ?? 0, commentCount: slide.comments?.length ?? 0,
  };
}

function pdfSnapshot(document: WorkspaceDocument, kind: WriterWorkspaceEmbedKind, selector: string): WriterWorkspaceEmbedSnapshot {
  const data = document.pdfData;
  if (!data) throw new WriterWorkspaceIntegrationError('PDF-Dokument enthält kein Seitenmodell.');
  if (kind === 'pdf-annotation') {
    const annotation = data.annotations.find((item) => item.id === selector);
    if (!annotation) throw new WriterWorkspaceIntegrationError('PDF-Annotation wurde nicht gefunden.');
    return { type: 'pdf-annotation', page: annotation.page, annotationType: annotation.type, text: safeText(annotation.text), author: annotation.author, createdAt: annotation.createdAt };
  }
  const pageNumber = Number(selector);
  const page = data.pages.find((item) => item.pageNumber === pageNumber);
  if (!page) throw new WriterWorkspaceIntegrationError('PDF-Seite wurde nicht gefunden.');
  return {
    type: 'pdf-page', pageNumber: page.pageNumber, title: safeText(page.title, 512), subtitle: page.subtitle ? safeText(page.subtitle, 512) : undefined,
    sections: page.sections.slice(0, 128).map((section) => ({ id: section.id, type: section.type, content: safeText(section.content) })),
  };
}

function vaultAsset(document: WorkspaceDocument, fileId: string): WriterWorkspaceEmbedSnapshot {
  const file = document.vaultData?.files.find((item) => item.id === fileId);
  if (!file) throw new WriterWorkspaceIntegrationError('Vault-Asset wurde nicht gefunden.');
  return {
    type: 'vault-asset', fileId: file.id, name: safeText(file.name, 512), mimeType: file.mimeType, sizeBytes: Math.max(0, file.sizeBytes),
    sourceType: file.sourceType, documentId: file.documentId, integrityState: file.integrityState,
  };
}

export function extractWriterWorkspaceSnapshot(document: WorkspaceDocument, request: WriterWorkspaceSnapshotRequest): WriterWorkspaceEmbedSnapshot {
  switch (request.kind) {
    case 'writer-live-link': {
      if (document.kind !== 'Writer') throw new WriterWorkspaceIntegrationError('Live-Link-Quelle ist kein Writer-Dokument.');
      const textBlock = document.root_object_ids.map((id) => document.objects[id]).find((object) => object?.type === 'TextBlock');
      const paragraphCount = textBlock?.type === 'TextBlock' ? textBlock.data.paragraphs.length : 0;
      return {
        type: 'summary',
        metrics: [
          { label: 'Dokument', value: safeText(document.title, 512) },
          { label: 'Version', value: String(document.version) },
          { label: 'Absätze', value: String(paragraphCount) },
          { label: 'Kommentare', value: String(document.writerData?.comments?.length ?? 0) },
        ],
        lines: ['Workspace Live-Link · canonical workspace identity is preserved'],
      };
    }
    case 'grid-range':
      if (document.kind !== 'Grid' || !request.sourceObjectId || !request.sourceSelector) throw new WriterWorkspaceIntegrationError('Grid-Range benötigt Grid-Dokument, Sheet und Range.');
      return gridRangeSnapshot(document, request.sourceObjectId, request.sourceSelector);
    case 'writer-local-chart': {
      if (document.kind !== 'Writer' || !request.sourceObjectId) throw new WriterWorkspaceIntegrationError('Lokales Writer-Diagramm benötigt eine Writer-Tabelle.');
      const table = document.writerData?.tables.find((item) => item.id === request.sourceObjectId);
      if (!table) throw new WriterWorkspaceIntegrationError('Writer-Tabelle für das Diagramm wurde nicht gefunden.');
      return writerTableChartSnapshot(table);
    }
    case 'grid-chart': {
      if (document.kind !== 'Grid' || !request.sourceObjectId) throw new WriterWorkspaceIntegrationError('Grid-Chart benötigt ein Grid-Dokument und Chart-Objekt.');
      const object = document.objects[request.sourceObjectId];
      if (!object || object.type !== 'Chart') throw new WriterWorkspaceIntegrationError('Grid-Chart wurde nicht gefunden.');
      return chartSnapshot(object.data);
    }
    case 'task-list': case 'task-kpi':
      return taskSnapshot(document, request.kind);
    case 'whiteboard-frame':
      if (!['Whiteboard', 'Draw'].includes(document.kind) || !request.sourceObjectId) throw new WriterWorkspaceIntegrationError('Whiteboard-Frame benötigt eine Frame-ID.');
      return whiteboardFrame(document, request.sourceObjectId);
    case 'present-slide':
      if (document.kind !== 'Present' || !request.sourceObjectId) throw new WriterWorkspaceIntegrationError('Present-Embed benötigt eine Slide-ID.');
      return presentSlide(document, request.sourceObjectId);
    case 'pdf-page': case 'pdf-annotation':
      if (document.kind !== 'PdfStudio' || !request.sourceSelector) throw new WriterWorkspaceIntegrationError('PDF-Referenz benötigt Seite oder Annotation.');
      return pdfSnapshot(document, request.kind, request.sourceSelector);
    case 'vault-asset':
      if (document.kind !== 'Vault' || !request.sourceObjectId) throw new WriterWorkspaceIntegrationError('Vault-Referenz benötigt eine Asset-ID.');
      return vaultAsset(document, request.sourceObjectId);
    default: throw new WriterWorkspaceIntegrationError('Unsupported Open-Core workspace embed kind.');
  }
}
