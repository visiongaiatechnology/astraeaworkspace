// STATUS: DIAMANT VGT SUPREME — deterministic local task print / Save-as-PDF path
import type { TaskItem } from '../../../shared/contracts/work-management/workspaceWork';

export { type TaskListPresentationRow as TaskPrintRow } from '../task-list/taskListPresentation';
import { taskListPresentationRows } from '../task-list/taskListPresentation';
import { createPdfFromRenderPages, paginateBlocks, resolveCanonicalPageGeometry, type RenderSnapshotPage } from '../../../platform/rendering/index';
import { deliverExportBytes, type ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import { assertPdfExportArtifact } from '../../../platform/rendering/documentPdfExport';

export function taskPrintRows(tasks: TaskItem[]) {
  return taskListPresentationRows(tasks);
}

function html(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export function buildTaskPrintDocument(tasks: TaskItem[], title = 'Astraea Tasks'): string {
  const rows = taskPrintRows(tasks);
  const body = rows.map((row) => `<tr data-task-id="${html(row.id)}"><td>${row.completed ? '✓' : '○'}</td><td>${html(row.title)}</td><td>${html(row.status)}</td><td>${html(row.priority)}</td><td>${html(row.due)}</td><td>${html(row.assignees)}</td><td>${html(row.tags)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${html(title)}</title><style>
@page{size:auto;margin:14mm}*{box-sizing:border-box}body{font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;background:#fff}h1{font-size:20px;margin:0 0 4px}.meta{color:#555;margin:0 0 16px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border-bottom:1px solid #d9d9d9;padding:7px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#555}th:nth-child(1),td:nth-child(1){width:28px}th:nth-child(3),td:nth-child(3){width:90px}th:nth-child(4),td:nth-child(4){width:65px}th:nth-child(5),td:nth-child(5){width:125px}@media print{tr{break-inside:avoid}button{display:none}}
</style></head><body><h1>${html(title)}</h1><p class="meta">${rows.length} task${rows.length === 1 ? '' : 's'} · local print / Save as PDF</p><table><thead><tr><th></th><th>Task</th><th>Status</th><th>Priority</th><th>Due</th><th>Assignees</th><th>Tags</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function printTaskList(tasks: TaskItem[], title = 'Astraea Tasks'): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Print window was blocked. Allow pop-ups for local Print / Save PDF.');
  popup.document.open();
  popup.document.write(buildTaskPrintDocument(tasks, title));
  popup.document.close();
  popup.addEventListener('load', () => { popup.focus(); popup.print(); }, { once: true });
}


export function buildTaskPdf(tasks: TaskItem[], title = 'Astraea Tasks'): Uint8Array {
  const rows = taskPrintRows(tasks);
  const geometry = resolveCanonicalPageGeometry({
    widthMm: 210,
    heightMm: 297,
    marginsMm: { top: 14, right: 14, bottom: 14, left: 14 },
  }, 'pt');
  const titleHeight = 34;
  const headerHeight = 18;
  const rowHeight = 22;
  const bodyHeight = Math.max(1, geometry.bodyHeight - titleHeight - headerHeight);
  const pages = paginateBlocks(rows.map((row) => ({ id: row.id, height: rowHeight, payload: row })), bodyHeight);
  const output: RenderSnapshotPage[] = pages.map((page, pageIndex) => {
    const x = geometry.margins.left;
    const top = geometry.margins.top;
    const width = geometry.bodyWidth;
    const columns = [0, 26, 260, 330, 390, 475, 560].map((offset) => x + offset * Math.min(1, width / 560));
    const primitives: RenderSnapshotPage['primitives'] = [
      { kind: 'text', x, y: top + 18, text: title, color: '#111111', font: '18px sans-serif', sourceId: 'title' },
      { kind: 'text', x: geometry.width - geometry.margins.right - 70, y: top + 18, text: `${pageIndex + 1}/${pages.length}`, color: '#555555', font: '9px sans-serif', sourceId: 'page-number' },
    ];
    const headers = ['✓', 'Task', 'Status', 'Priority', 'Due', 'Assignees', 'Tags'];
    headers.forEach((label, index) => primitives.push({ kind: 'text', x: columns[index]!, y: top + titleHeight + 12, text: label, color: '#555555', font: '9px sans-serif', sourceId: `header-${index}` }));
    let y = top + titleHeight + headerHeight;
    for (const block of page.blocks) {
      const row = block.payload;
      primitives.push({ kind: 'line', x, y: y + rowHeight - 3, width, height: 0, color: '#dddddd', sourceId: `${row.id}:rule` });
      const values = [row.completed ? '✓' : '○', row.title, row.status, row.priority, row.due, row.assignees, row.tags];
      values.forEach((value, index) => {
        const max = index === 1 ? 36 : index >= 5 ? 18 : 14;
        const text = String(value ?? '');
        primitives.push({ kind: 'text', x: columns[index]!, y: y + 14, text: text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text, color: '#111111', font: '9px sans-serif', sourceId: `${row.id}:${index}` });
      });
      y += rowHeight;
    }
    return { geometry, primitives };
  });
  return createPdfFromRenderPages(output, title);
}

/** Release Beta 0.1: native save on the desktop; the browser fallback stays a download. */
export function downloadTaskPdf(tasks: TaskItem[], title = 'Astraea Tasks', filename = 'tasks.pdf'): Promise<ExportDeliveryResult> {
  const bytes = buildTaskPdf(tasks, title);
  const extension = /\.[A-Za-z0-9]{1,12}$/u.test(filename) ? filename.split('.').pop()!.toLowerCase() : 'pdf';
  return deliverExportBytes(bytes, {
    suggestedName: filename,
    extensions: [extension],
    mimeType: 'application/pdf',
    assertArtifact: assertPdfExportArtifact,
  });
}
