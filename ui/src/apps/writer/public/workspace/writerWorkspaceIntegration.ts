// STATUS: DIAMANT VGT SUPREME — Writer cross-workspace live reference engine
import type {
  WorkspaceDocument,
  WriterWorkspaceEmbed,
  WriterWorkspaceEmbedKind,
} from '../../../../shared/contracts/workspace';
import type { CreateWriterWorkspaceEmbedRequest } from '../../../../platform/workspace/integrations/writerWorkspaceIntegration';
// W-316: the Writer's own creation path calls the extractor directly, so it used to bypass the
// port's per-snapshot budget. The same assertion is applied here — the port's signature is unchanged,
// so this is a second call site, not a redesign.
import {
  assertWorkspaceEmbedSnapshotBudget,
  WorkspaceSnapshotError,
  WORKSPACE_EMBED_SNAPSHOT_LIMITS,
} from '../../../../platform/workspace/integrations/workspaceSnapshot';
import {
  extractWriterWorkspaceSnapshot,
  writerTableChartSnapshot,
  WriterWorkspaceIntegrationError,
} from './writerWorkspaceExtractors';

export const MAX_WRITER_WORKSPACE_EMBEDS = 128;

/**
 * The most snapshot bytes **one Writer document** may carry (W-317).
 *
 * The port documented this as a derived invariant (128 embeds × 1 MiB) and enforced it nowhere,
 * because it has no document context. The document context exists here: this module appends embeds to
 * one document. The number is derived from the two bounds it comes from, so it cannot drift.
 */
export const MAX_WRITER_EMBED_PAYLOAD_BYTES = MAX_WRITER_WORKSPACE_EMBEDS * WORKSPACE_EMBED_SNAPSHOT_LIMITS.maxSnapshotBytes;

/**
 * The stored size of one embed's snapshot, measured the way the per-snapshot budget measures it.
 *
 * The per-snapshot assertion has already refused anything unmeasurable, so a serialization failure here
 * cannot happen; the length (not the bytes) is enough for a sum that is compared against a byte budget
 * with a factor-4 headroom.
 */
function snapshotStoredLength(embed: WriterWorkspaceEmbed): number {
  return JSON.stringify(embed.snapshot).length;
}

/**
 * Refuses an append that would push the document's embeds past the aggregate budget (W-317).
 *
 * Derived from the count bound and the per-snapshot budget; nothing is removed, so an over-budget
 * document is refused rather than silently trimmed.
 */
export function assertWriterEmbedPayloadBudget(
  embeds: readonly WriterWorkspaceEmbed[],
  limitBytes: number = MAX_WRITER_EMBED_PAYLOAD_BYTES,
): void {
  const limit = Number.isFinite(limitBytes) && limitBytes > 0 ? limitBytes : MAX_WRITER_EMBED_PAYLOAD_BYTES;
  let total = 0;
  for (const embed of embeds) total += snapshotStoredLength(embed);
  if (total > limit) {
    throw new WriterWorkspaceIntegrationError(
      `Die Workspace-Embeds dieses Dokuments überschreiten ${Math.round(limit / (1024 * 1024))} MiB. `
      + 'Bitte ein Embed mit großem Inhalt entfernen.',
    );
  }
}

export type { CreateWriterWorkspaceEmbedRequest } from '../../../../platform/workspace/integrations/writerWorkspaceIntegration';

function safeSegment(value: string): string {
  return encodeURIComponent(value.slice(0, 512));
}

export function writerWorkspaceEmbedUri(
  sourceDocumentId: string,
  kind: WriterWorkspaceEmbedKind,
  sourceObjectId?: string,
  sourceSelector?: string,
): string {
  const base = `vgt://workspace/document/${safeSegment(sourceDocumentId)}/writer-embed/${safeSegment(kind)}`;
  const params = new URLSearchParams();
  if (sourceObjectId) params.set('object', sourceObjectId.slice(0, 512));
  if (sourceSelector) params.set('selector', sourceSelector.slice(0, 2_048));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function defaultEmbedTitle(source: WorkspaceDocument, kind: WriterWorkspaceEmbedKind): string {
  const labels: Partial<Record<WriterWorkspaceEmbedKind, string>> = {
    'writer-live-link': 'Writer Live-Link',
    'grid-range': 'Grid-Bereich',
    'grid-chart': 'Grid-Diagramm',
    'writer-local-chart': 'Writer-Diagramm',
    'task-list': 'Aufgabenliste',
    'task-kpi': 'Aufgaben-KPI',
    'whiteboard-frame': 'Whiteboard-Frame',
    'present-slide': 'Present-Slide',
    'pdf-page': 'PDF-Seite',
    'pdf-annotation': 'PDF-Annotation',
    'vault-asset': 'Vault-Asset',
  };
  return `${labels[kind] ?? 'Workspace reference'} · ${source.title}`.slice(0, 512);
}

/**
 * The paragraph ids of a Writer document, found the way the rest of the application finds them:
 * the root text block first, then any text block.
 */
function writerParagraphIds(document: WorkspaceDocument): Set<string> {
  const root = document.root_object_ids
    .map((id) => document.objects[id])
    .find((object) => object?.type === 'TextBlock');
  const block = root?.type === 'TextBlock'
    ? root
    : Object.values(document.objects).find((object) => object.type === 'TextBlock');
  return new Set(block?.type === 'TextBlock' ? block.data.paragraphs.map((paragraph) => paragraph.id) : []);
}

export function createWriterWorkspaceEmbed(request: CreateWriterWorkspaceEmbedRequest): WriterWorkspaceEmbed {
  if (request.writerDocument.kind !== 'Writer') throw new WriterWorkspaceIntegrationError('Zieldokument ist kein Writer-Dokument.');
  if (!request.anchorParagraphId || request.anchorParagraphId.length > 512) throw new WriterWorkspaceIntegrationError('Writer-Embed benötigt einen gültigen Absatzanker.');
  // W-255: an anchor that names no existing paragraph produced an embed that is stored and counted
  // but never rendered — the page renderer matches it against a paragraph, and the section partition
  // drops it when the paragraph is unknown. Images, tables, equations and media objects all have an
  // "unanchored" fallback for exactly this case; embeds did not. So the anchor is checked here, before
  // anything is written, and the message is one a user can act on.
  if (!writerParagraphIds(request.writerDocument).has(request.anchorParagraphId)) {
    throw new WriterWorkspaceIntegrationError('Der gewählte Absatz existiert nicht mehr. Bitte den Absatz wählen und erneut einfügen.');
  }
  const comments = request.writerDocument.writerData?.comments ?? [];
  const snapshot = assertWorkspaceEmbedSnapshotBudget(extractWriterWorkspaceSnapshot(request.sourceDocument, {
    kind: request.kind,
    sourceObjectId: request.sourceObjectId,
    sourceSelector: request.sourceSelector,
    retainedWriterCommentIds: comments.map((comment) => comment.id),
  }));
  const now = request.now ?? Date.now();
  // `updatedAt` means "the state of the source this embed reflects", so it is the source's
  // modification time — not the insertion clock (that is `createdAt`). The refresh below and the
  // chart refresh already pass the source's time; creation used to pass the clock, which made the
  // "nothing changed" test compare two different things and never fire (W-249/W-250).
  const sourceModifiedAt = request.sourceDocument.modified_at;
  const reflectedSourceTime = Number.isFinite(sourceModifiedAt) && sourceModifiedAt > 0 ? sourceModifiedAt : now;
  return {
    id: request.id ?? crypto.randomUUID(),
    kind: request.kind,
    mode: request.mode,
    sourceDocumentId: request.sourceDocument.id,
    sourceObjectId: request.sourceObjectId,
    sourceSelector: request.sourceSelector,
    uri: writerWorkspaceEmbedUri(request.sourceDocument.id, request.kind, request.sourceObjectId, request.sourceSelector),
    sourceVersion: request.sourceDocument.version,
    anchorParagraphId: request.anchorParagraphId,
    title: defaultEmbedTitle(request.sourceDocument, request.kind),
    createdAt: now,
    updatedAt: reflectedSourceTime,
    snapshot,
  };
}

export function appendWriterWorkspaceEmbed(
  embeds: readonly WriterWorkspaceEmbed[],
  embed: WriterWorkspaceEmbed,
  payloadLimitBytes: number = MAX_WRITER_EMBED_PAYLOAD_BYTES,
): WriterWorkspaceEmbed[] {
  const next = embeds.filter((item) => item.id !== embed.id);
  if (next.length >= MAX_WRITER_WORKSPACE_EMBEDS) throw new WriterWorkspaceIntegrationError(`Writer unterstützt höchstens ${MAX_WRITER_WORKSPACE_EMBEDS} Workspace-Embeds pro Dokument.`);
  // W-316: the append is the second entrance for a snapshot, so the per-snapshot budget is asserted
  // here as well; nothing is written before both bounds hold.
  assertWorkspaceEmbedSnapshotBudget(embed.snapshot);
  const withEmbed = [...next, embed];
  // W-317: the count says nothing about the payload. The aggregate is checked before the document
  // changes, so an over-budget append is refused instead of absorbed.
  assertWriterEmbedPayloadBudget(withEmbed, payloadLimitBytes);
  return withEmbed;
}

export function refreshWriterLocalChartEmbeds(
  embeds: readonly WriterWorkspaceEmbed[] | undefined,
  tables: NonNullable<WorkspaceDocument['writerData']>['tables'],
  sourceDocumentId: string,
  sourceVersion: number,
  updatedAt: number,
): WriterWorkspaceEmbed[] | undefined {
  if (!embeds) return undefined;
  const tableById = new Map(tables.map((table) => [table.id, table]));
  return embeds.map((embed) => {
    if (embed.kind !== 'writer-local-chart' || embed.mode !== 'Live' || embed.sourceDocumentId !== sourceDocumentId || !embed.sourceObjectId) return embed;
    const table = tableById.get(embed.sourceObjectId);
    if (!table) return embed;
    try {
      return { ...embed, sourceVersion, updatedAt, snapshot: writerTableChartSnapshot(table) };
    } catch (error: unknown) {
      if (error instanceof WriterWorkspaceIntegrationError) return embed;
      throw error;
    }
  });
}

export function refreshWriterWorkspaceEmbeds(
  writerDocument: WorkspaceDocument,
  sourceDocument: WorkspaceDocument,
): { document: WorkspaceDocument; updatedCount: number; failedCount: number } {
  if (writerDocument.kind !== 'Writer' || !writerDocument.writerData?.workspaceEmbeds?.length) {
    return { document: writerDocument, updatedCount: 0, failedCount: 0 };
  }
  let updatedCount = 0;
  let failedCount = 0;
  const retainedWriterCommentIds = (writerDocument.writerData.comments ?? []).map((comment) => comment.id);
  const workspaceEmbeds = writerDocument.writerData.workspaceEmbeds.map((embed) => {
    // W-249: the "nothing changed" test used the version alone, so a source update that moved
    // `modified_at` but not `version` left a **live** table showing stale numbers — while the
    // range-link path refreshes on every update and this module itself treats `modified_at` as the
    // freshness signal (it writes it below and takes the later of the two). Both signals now decide;
    // the shortcut still covers the genuinely unchanged case.
    if (embed.mode !== 'Live' || embed.sourceDocumentId !== sourceDocument.id) return embed;
    if (embed.sourceVersion === sourceDocument.version && embed.updatedAt === sourceDocument.modified_at) return embed;
    try {
      const snapshot = assertWorkspaceEmbedSnapshotBudget(extractWriterWorkspaceSnapshot(sourceDocument, {
        kind: embed.kind,
        sourceObjectId: embed.sourceObjectId,
        sourceSelector: embed.sourceSelector,
        retainedWriterCommentIds,
      }));
      updatedCount += 1;
      return { ...embed, sourceVersion: sourceDocument.version, updatedAt: sourceDocument.modified_at, snapshot };
    } catch (error: unknown) {
      // W-316: a snapshot the budget refuses is a refusal of **this** embed, not of the refresh. The
      // existing contract is "one failed embed does not stop the others" (W-245), and a platform
      // snapshot error has to fall into it like the Writer's own error does.
      if (error instanceof WriterWorkspaceIntegrationError || error instanceof WorkspaceSnapshotError) {
        failedCount += 1;
        return embed;
      }
      throw error;
    }
  });
  if (updatedCount === 0) return { document: writerDocument, updatedCount, failedCount };
  // W-317: a refresh can enlarge the payload of every embed at once, so the aggregate is checked
  // before the document is written.
  assertWriterEmbedPayloadBudget(workspaceEmbeds);
  return {
    document: {
      ...writerDocument,
      version: writerDocument.version + 1,
      modified_at: Math.max(writerDocument.modified_at + 1, sourceDocument.modified_at),
      writerData: { ...writerDocument.writerData, workspaceEmbeds },
    },
    updatedCount,
    failedCount,
  };
}


export type WriterVaultOpenTarget =
  | { kind: 'workspace-document'; documentId: string }
  | { kind: 'data-url'; url: string; name: string; mimeType?: string };

export function resolveWriterVaultOpenTarget(embed: WriterWorkspaceEmbed, documents: readonly WorkspaceDocument[]): WriterVaultOpenTarget {
  if (embed.kind !== 'vault-asset' || embed.snapshot.type !== 'vault-asset') throw new WriterWorkspaceIntegrationError('Referenz ist kein Vault-Asset.');
  const asset = embed.snapshot;
  const vault = documents.find((document) => document.id === embed.sourceDocumentId && document.kind === 'Vault');
  const file = vault?.vaultData?.files.find((candidate) => candidate.id === asset.fileId);
  if (!file) throw new WriterWorkspaceIntegrationError('Vault-Asset ist nicht mehr verfügbar.');
  if (file.sourceType === 'workspace-document' && file.documentId) return { kind: 'workspace-document', documentId: file.documentId };
  if (file.sourceType === 'attachment' && file.payloadDataUrl) {
    return { kind: 'data-url', url: file.payloadDataUrl, name: file.name, mimeType: file.mimeType };
  }
  throw new WriterWorkspaceIntegrationError('Vault-Asset besitzt keinen direkt auflösbaren lokalen Inhalt.');
}
