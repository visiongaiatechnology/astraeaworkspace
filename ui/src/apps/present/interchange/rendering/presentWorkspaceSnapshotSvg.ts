// STATUS: DIAMANT VGT SUPREME — deterministic SVG renderer for Present workspace references
import type { PresentWorkspaceSceneObject, WriterWorkspaceEmbedSnapshot } from '../../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { PRESENT_OFFICE_COPY, presentWorkspaceSnapshotMetricLabel } from '../../locale/presentOfficeLocale';
import { PRESENT_WORKFLOW_COPY } from '../../locale/presentWorkflowLocale';

export interface PresentWorkspaceSvgBox { x: number; y: number; w: number; h: number; }

const esc = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cap = (value: unknown, max = 256): string => String(value ?? '').normalize('NFKC').slice(0, max);

function line(text: string, x: number, y: number, size: number, color = '#cbd5e1', weight = 400, anchor: 'start' | 'end' = 'start'): string {
  const anchorAttribute = anchor === 'end' ? ' text-anchor="end"' : '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"${anchorAttribute} fill="${color}" font-size="${size}" font-weight="${weight}" font-family="Inter,Arial,sans-serif">${esc(cap(text, 256))}</text>`;
}

function renderTable(snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'table' }>, box: PresentWorkspaceSvgBox): string {
  const columns = snapshot.columns.slice(0, 10);
  const rows = snapshot.rows.slice(0, 12);
  const colCount = Math.max(1, columns.length);
  const rowCount = Math.max(1, rows.length + 1);
  const colW = box.w / colCount;
  const rowH = box.h / rowCount;
  let svg = '';
  columns.forEach((column, index) => {
    const x = box.x + index * colW;
    svg += `<rect x="${x}" y="${box.y}" width="${colW}" height="${rowH}" fill="#111827" stroke="#334155"/>${line(column, x + 4, box.y + Math.min(rowH - 3, 11), 8, '#e2e8f0', 700)}`;
  });
  rows.forEach((row, rowIndex) => columns.forEach((_, colIndex) => {
    const x = box.x + colIndex * colW;
    const y = box.y + (rowIndex + 1) * rowH;
    svg += `<rect x="${x}" y="${y}" width="${colW}" height="${rowH}" fill="${rowIndex % 2 ? '#0b1220' : '#0f172a'}" stroke="#1e293b"/>${line(row[colIndex] ?? '', x + 4, y + Math.min(rowH - 3, 10), 7, '#94a3b8')}`;
  }));
  return svg;
}

function renderChart(snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'chart' }>, box: PresentWorkspaceSvgBox, locale: WorkspaceLocale): string {
  const values = snapshot.series.slice(0, 6).flatMap((series) => series.values.slice(0, 20));
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const count = Math.max(1, values.length);
  const gap = Math.max(1, box.w / count * 0.18);
  const barW = Math.max(1, box.w / count - gap);
  let svg = line(snapshot.title || PRESENT_OFFICE_COPY[locale].workspaceIntegration.snapshotDetails.chart, box.x, box.y + 11, 9, '#e2e8f0', 700);
  values.forEach((value, index) => {
    const height = Math.max(2, Math.abs(value) / max * Math.max(8, box.h - 18));
    const x = box.x + index * (barW + gap);
    const y = box.y + box.h - height;
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" rx="1.5" fill="#22d3ee" fill-opacity="0.7"/>`;
  });
  return svg;
}

function renderSummary(snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'summary' }>, object: PresentWorkspaceSceneObject, box: PresentWorkspaceSvgBox, locale: WorkspaceLocale): string {
  const metrics = snapshot.metrics.slice(0, 8);
  const columns = Math.max(1, Math.min(4, metrics.length));
  const cardW = box.w / columns;
  let svg = '';
  metrics.forEach((metric, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = box.x + col * cardW;
    const y = box.y + row * 34;
    svg += `<rect x="${x + 2}" y="${y + 2}" width="${Math.max(4, cardW - 4)}" height="30" rx="5" fill="#111827" stroke="#1e293b"/>${line(presentWorkspaceSnapshotMetricLabel(locale, object.integrationKind, metric.label), x + 7, y + 13, 6.5, '#64748b', 700)}${line(metric.value, x + 7, y + 25, 9, '#e2e8f0', 700)}`;
  });
  const linesY = box.y + Math.ceil(metrics.length / columns) * 34 + 8;
  snapshot.lines.slice(0, 8).forEach((item, index) => { svg += line(`• ${item}`, box.x + 4, linesY + index * 10, 7, '#94a3b8'); });
  return svg;
}

function renderTimeline(snapshot: Extract<WriterWorkspaceEmbedSnapshot, { type: 'timeline' }>, box: PresentWorkspaceSvgBox): string {
  const items = snapshot.items.slice(0, 10);
  const rowH = Math.max(12, box.h / Math.max(1, items.length));
  let svg = '';
  items.forEach((item, index) => {
    const y = box.y + index * rowH;
    const progress = Math.max(0, Math.min(100, item.progress ?? 0));
    svg += `<rect x="${box.x}" y="${y + 2}" width="${box.w}" height="${Math.max(8, rowH - 4)}" rx="4" fill="#0f172a" stroke="#1e293b"/>${line(item.label, box.x + 6, y + Math.min(rowH - 3, 10), 7.5, '#e2e8f0', 600)}<rect x="${box.x + box.w * 0.62}" y="${y + rowH / 2 - 2}" width="${box.w * 0.32}" height="4" rx="2" fill="#1e293b"/><rect x="${box.x + box.w * 0.62}" y="${y + rowH / 2 - 2}" width="${box.w * 0.32 * progress / 100}" height="4" rx="2" fill="#22d3ee"/>`;
  });
  return svg;
}

function renderDetail(snapshot: Exclude<WriterWorkspaceEmbedSnapshot, { type: 'table' | 'chart' | 'summary' | 'timeline' }>, box: PresentWorkspaceSvgBox, locale: WorkspaceLocale): string {
  const copy = PRESENT_OFFICE_COPY[locale].workspaceIntegration;
  const details = copy.snapshotDetails;
  let title = '';
  const detail: string[] = [];
  if (snapshot.type === 'slide') { title = snapshot.title; detail.push(snapshot.subtitle, ...snapshot.bulletPoints.slice(0, 8)); }
  else if (snapshot.type === 'frame') { title = snapshot.name; detail.push(snapshot.text, ...snapshot.containedItems.slice(0, 8).map((item) => `${item.type}: ${item.text}`)); }
  else if (snapshot.type === 'pdf-page') { title = copy.pdfPage(snapshot.pageNumber, snapshot.title); detail.push(snapshot.subtitle || '', ...snapshot.sections.slice(0, 10).map((section) => `${section.type}: ${section.content}`)); }
  else if (snapshot.type === 'pdf-annotation') { title = `${snapshot.annotationType} · ${copy.pdfPage(snapshot.page, '')}`; detail.push(snapshot.text, snapshot.author || ''); }
  else if (snapshot.type === 'vault-asset') { title = snapshot.name; detail.push(`${snapshot.mimeType || copy.vaultAssetFallback} · ${snapshot.sizeBytes} B`, `${details.integrity}: ${details.integrityStates[snapshot.integrityState || 'unverified']}`); }
  else { title = snapshot.name; detail.push(snapshot.description, `${details.role}: ${snapshot.role}`, details.linkedDocuments(snapshot.linkedDocumentIds.length)); }
  let svg = line(title, box.x + 5, box.y + 13, 9, '#e2e8f0', 700);
  detail.filter(Boolean).slice(0, 10).forEach((item, index) => { svg += line(item, box.x + 5, box.y + 28 + index * 10, 7, '#94a3b8'); });
  return svg;
}

export function renderPresentWorkspaceSnapshotSvg(object: PresentWorkspaceSceneObject, box: PresentWorkspaceSvgBox, locale: WorkspaceLocale = 'en-US'): string {
  const modeCopy = PRESENT_WORKFLOW_COPY[locale].workspace;
  const modeLabel = object.mode === 'Live' ? modeCopy.live : modeCopy.frozen;
  const headerH = Math.min(22, Math.max(14, box.h * 0.12));
  const footerH = Math.min(14, Math.max(8, box.h * 0.08));
  const content = { x: box.x + 6, y: box.y + headerH + 5, w: Math.max(8, box.w - 12), h: Math.max(8, box.h - headerH - footerH - 10) };
  let body = `<g opacity="${Math.max(0, Math.min(1, object.opacity ?? 1))}" transform="rotate(${object.rotation ?? 0} ${box.x + box.w / 2} ${box.y + box.h / 2})"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="#020617" stroke="#22d3ee" stroke-opacity="0.28"/><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${headerH}" rx="10" fill="#0f172a"/>${line(object.title, box.x + 8, box.y + Math.min(headerH - 3, 12), 8, '#e2e8f0', 700)}${line(modeLabel, box.x + box.w - 8, box.y + Math.min(headerH - 3, 12), 6.5, object.mode === 'Live' ? '#6ee7b7' : '#94a3b8', 700, 'end')}`;
  const snapshot = object.snapshot;
  if (snapshot.type === 'table') body += renderTable(snapshot, content);
  else if (snapshot.type === 'chart') body += renderChart(snapshot, content, locale);
  else if (snapshot.type === 'summary') body += renderSummary(snapshot, object, content, locale);
  else if (snapshot.type === 'timeline') body += renderTimeline(snapshot, content);
  else body += renderDetail(snapshot, content, locale);
  body += line(`${cap(object.uri, 180)} · v${object.sourceVersion}`, box.x + 6, box.y + box.h - 4, 5.5, '#475569') + '</g>';
  return body;
}
