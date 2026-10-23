// STATUS: PLATIN — bounded, selective document hydration for shell session restore.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';

export const MAX_WORKSPACE_SESSION_RESTORE_DOCUMENTS = 64;

function validRestoreDocumentId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z0-9][A-Za-z0-9._~-]*$/u.test(value);
}

function hasOwn<T>(record: Readonly<Record<string, T>>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, id);
}

export interface WorkspaceRestoreSelectionInput {
  readonly detachedDocumentId: string | null;
  /** null means no valid shell session exists; an empty array means the user closed all tabs. */
  readonly sessionDocumentIds: readonly string[] | null;
  readonly legacyActiveDocumentId: string | null;
  readonly storedDocumentIds: ReadonlySet<string>;
  readonly seededDocuments: Readonly<Record<string, Pick<WorkspaceDocument, 'id'>>>;
}

export function selectWorkspaceRestoreDocumentIds(input: WorkspaceRestoreSelectionInput): string[] {
  let candidates: readonly string[];
  if (input.detachedDocumentId !== null) {
    candidates = [input.detachedDocumentId];
  } else if (input.sessionDocumentIds !== null) {
    candidates = input.sessionDocumentIds;
  } else if (input.legacyActiveDocumentId && input.storedDocumentIds.has(input.legacyActiveDocumentId)) {
    candidates = [input.legacyActiveDocumentId];
  } else {
    candidates = [];
  }

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const id of candidates) {
    if (!validRestoreDocumentId(id) || seen.has(id)) continue;
    if (!input.storedDocumentIds.has(id) && !hasOwn(input.seededDocuments, id)) continue;
    seen.add(id);
    selected.push(id);
    if (selected.length >= MAX_WORKSPACE_SESSION_RESTORE_DOCUMENTS) break;
  }
  return selected;
}

export interface WorkspaceRestoreResult<TDocument extends Pick<WorkspaceDocument, 'id'>> {
  readonly documents: Record<string, TDocument>;
  readonly failedStoredDocumentIds: readonly string[];
}

export function prepareWorkspaceLibraryProjectionDocuments<TDocument extends Pick<WorkspaceDocument, 'id'>>(
  seededDocuments: Readonly<Record<string, TDocument>>,
  storedDocumentIds: ReadonlySet<string>,
  restoredDocuments: Readonly<Record<string, TDocument>>,
): Record<string, TDocument> {
  const nonPersistedSeeds = Object.fromEntries(
    Object.entries(seededDocuments).filter(([id]) => !storedDocumentIds.has(id)),
  ) as Record<string, TDocument>;
  return { ...nonPersistedSeeds, ...restoredDocuments };
}

export async function restoreWorkspaceDocuments<TDocument extends Pick<WorkspaceDocument, 'id'>>(
  documentIds: readonly string[],
  input: {
    readonly storedDocumentIds: ReadonlySet<string>;
    readonly seededDocuments: Readonly<Record<string, TDocument>>;
    readonly loadStoredDocument: (documentId: string) => Promise<TDocument | null>;
  },
): Promise<WorkspaceRestoreResult<TDocument>> {
  const documents: Record<string, TDocument> = {};
  const failedStoredDocumentIds: string[] = [];
  const boundedIds = [...new Set(documentIds.filter(validRestoreDocumentId))]
    .slice(0, MAX_WORKSPACE_SESSION_RESTORE_DOCUMENTS);

  for (const id of boundedIds) {
    if (input.storedDocumentIds.has(id)) {
      try {
        const stored = await input.loadStoredDocument(id);
        if (!stored || stored.id !== id) {
          failedStoredDocumentIds.push(id);
          continue;
        }
        documents[id] = stored;
      } catch {
        failedStoredDocumentIds.push(id);
      }
      continue;
    }

    const seeded = hasOwn(input.seededDocuments, id) ? input.seededDocuments[id] : undefined;
    if (seeded?.id === id) documents[id] = seeded;
  }

  return { documents, failedStoredDocumentIds };
}
