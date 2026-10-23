// STATUS: DIAMANT VGT SUPREME — stable local Workspace embeds for Notes
import type { NoteWorkspaceEmbedData, WorkspaceDocument, WriterWorkspaceEmbedKind } from '../../../shared/contracts/workspace';
import { extractWorkspaceEmbedSnapshot } from '../../../platform/workspace/integrations/workspaceSnapshot';

export interface NoteWorkspaceEmbedTarget {
  id: string;
  label: string;
  kind: WriterWorkspaceEmbedKind;
  sourceObjectId?: string;
  sourceSelector?: string;
}

const safe = (value: unknown, max = 256): string => String(value ?? '').normalize('NFKC').replace(/\u0000/g, '').slice(0, max);

export function listNoteWorkspaceEmbedTargets(document: WorkspaceDocument): NoteWorkspaceEmbedTarget[] {
  if (document.kind === 'Writer') return [{ id: 'writer', label: 'Writer document', kind: 'writer-live-link' }];
  if (document.kind === 'Grid') {
    const ranges = (document.gridData?.sheets ?? []).map((sheet) => ({ id: `grid-range:${sheet.id}`, label: `${sheet.name} · A1:F20`, kind: 'grid-range' as const, sourceObjectId: sheet.tableObjectId, sourceSelector: 'A1:F20' }));
    const charts = Object.entries(document.objects).flatMap(([id, object]) => object.type === 'Chart' ? [{ id: `grid-chart:${id}`, label: object.data.title || 'Grid chart', kind: 'grid-chart' as const, sourceObjectId: id }] : []);
    return [...ranges, ...charts].slice(0, 256);
  }
  if (document.kind === 'Present') return (document.presentData?.slides ?? []).slice(0, 256).map((slide, index) => ({ id: `slide:${slide.id}`, label: `${index + 1}. ${slide.title || 'Slide'}`, kind: 'present-slide', sourceObjectId: slide.id }));
  if (document.kind === 'PdfStudio') {
    const pages = (document.pdfData?.pages ?? []).slice(0, 512).map((page) => ({ id: `pdf:${page.pageNumber}`, label: `Page ${page.pageNumber} · ${safe(page.title, 128)}`, kind: 'pdf-page' as const, sourceSelector: String(page.pageNumber) }));
    const annotations = (document.pdfData?.annotations ?? []).slice(0, 512).map((annotation) => ({ id: `pdf-annotation:${annotation.id}`, label: `Annotation · page ${annotation.page} · ${safe(annotation.text || annotation.type, 128)}`, kind: 'pdf-annotation' as const, sourceSelector: annotation.id }));
    return [...pages, ...annotations].slice(0, 768);
  }
  if (document.kind === 'Whiteboard') return (document.whiteboardData?.items ?? []).filter((item) => item.type === 'frame').slice(0, 256).map((item) => ({ id: `frame:${item.id}`, label: safe(item.name || item.text || 'Frame', 160), kind: 'whiteboard-frame', sourceObjectId: item.id }));
  if (document.kind === 'Draw') return Object.values(document.drawData?.objects ?? {}).filter((item) => item.type === 'frame').slice(0, 256).map((item) => ({ id: `frame:${item.id}`, label: safe(item.name || 'Draw Frame', 160), kind: 'whiteboard-frame', sourceObjectId: item.id }));
  if (document.kind === 'Tasks') return [{ id: 'tasks', label: 'Task list', kind: 'task-list' }, { id: 'task-kpi', label: 'Task progress', kind: 'task-kpi' }];
  if (document.kind === 'Vault') {
    // AST-0696: "Asset aus Vault oder Datei in Notiz verlinken" — the Vault source was missing from the
    // target list even though the snapshot port already understands `vault-asset`.
    return (document.vaultData?.files ?? [])
      .filter((file) => file && typeof file.id === 'string' && file.id.length > 0)
      .slice(0, 512)
      .map((file) => ({
        id: `vault-asset:${file.id}`,
        label: `${safe(file.name || 'Vault asset', 160)}${file.mimeType ? ` · ${safe(file.mimeType, 64)}` : ''}`,
        kind: 'vault-asset' as const,
        sourceObjectId: file.id,
      }));
  }
  return [];
}

export function createNoteWorkspaceEmbed(sourceDocument: WorkspaceDocument, target: NoteWorkspaceEmbedTarget, mode: 'Live' | 'Frozen'): NoteWorkspaceEmbedData {
  const snapshot = extractWorkspaceEmbedSnapshot(sourceDocument, { kind: target.kind, sourceObjectId: target.sourceObjectId, sourceSelector: target.sourceSelector });
  const query = new URLSearchParams();
  query.set('kind', target.kind);
  if (target.sourceObjectId) query.set('object', target.sourceObjectId);
  if (target.sourceSelector) query.set('selector', target.sourceSelector);
  return {
    kind: target.kind,
    mode,
    sourceDocumentId: sourceDocument.id,
    sourceObjectId: target.sourceObjectId,
    sourceSelector: target.sourceSelector,
    sourceVersion: sourceDocument.version,
    uri: `vgt://workspace/document/${encodeURIComponent(sourceDocument.id)}/notes-reference?${query.toString()}`,
    title: `${safe(sourceDocument.title, 256)} · ${safe(target.label, 256)}`,
    snapshot,
  };
}

export function resolveNoteWorkspaceEmbed(embed: NoteWorkspaceEmbedData, documents: readonly WorkspaceDocument[]): NoteWorkspaceEmbedData {
  if (embed.mode === 'Frozen') return embed;
  const source = documents.find((document) => document.id === embed.sourceDocumentId);
  if (!source || source.version === embed.sourceVersion) return embed;
  try {
    return {
      ...embed,
      sourceVersion: source.version,
      snapshot: extractWorkspaceEmbedSnapshot(source, { kind: embed.kind, sourceObjectId: embed.sourceObjectId, sourceSelector: embed.sourceSelector }),
    };
  } catch {
    return embed;
  }
}
