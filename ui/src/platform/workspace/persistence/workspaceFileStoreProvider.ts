// STATUS: PLATIN — the single adapter that touches the Lead-owned native file store bridge.
//
// Everything above this file consumes `WorkspaceFileStorePort`; only this adapter knows the Tauri
// bridge. `null`/`false` outside the desktop build keeps the browser fallback intact.
import {
  workspaceFileStoreList,
  workspaceFileStoreRead,
  workspaceFileStoreRemove,
  workspaceFileStoreReveal,
  workspaceFileStoreSupported,
  workspaceFileStoreWrite,
  type WorkspaceFileStoreListing,
  type WorkspaceFileStoreReadResult,
  type WorkspaceFileStoreWriteResult,
} from '../../native/workspaceFileStore';
import type { WorkspaceFileStorePort } from './workspaceFilePersistence';

export interface WorkspaceFileStoreSession {
  readonly store: WorkspaceFileStorePort;
  readonly rootPath: string | null;
}

const port: WorkspaceFileStorePort = {
  list: async (): Promise<WorkspaceFileStoreListing | null> => workspaceFileStoreList(),
  write: async (documentId: string, bytes: Uint8Array): Promise<WorkspaceFileStoreWriteResult | null> => workspaceFileStoreWrite(documentId, bytes),
  read: async (fileName: string): Promise<WorkspaceFileStoreReadResult | null> => workspaceFileStoreRead(fileName),
  remove: async (fileName: string): Promise<boolean> => workspaceFileStoreRemove(fileName),
  reveal: async (): Promise<boolean> => workspaceFileStoreReveal(),
};

let session: WorkspaceFileStoreSession | null | undefined;

/** Whether the current process has the native durable file store at all. */
export function workspaceFileStoreIsSupported(): boolean {
  return workspaceFileStoreSupported();
}

/**
 * Resolves the native store once per process and caches its root path (used for the honest
 * "Gespeichert · Datei" tooltip and the "Ordner öffnen" action). Returns `null` in the browser.
 */
export async function getWorkspaceFileStoreSession(): Promise<WorkspaceFileStoreSession | null> {
  if (session !== undefined) return session;
  if (!workspaceFileStoreSupported()) {
    session = null;
    return session;
  }
  let rootPath: string | null = null;
  try {
    rootPath = (await workspaceFileStoreList())?.rootPath ?? null;
  } catch {
    rootPath = null;
  }
  session = { store: port, rootPath };
  return session;
}

export async function revealWorkspaceFileStoreFolder(): Promise<boolean> {
  try {
    return await workspaceFileStoreReveal();
  } catch {
    return false;
  }
}

/** Test seam: a fresh process must resolve the store again. */
export function resetWorkspaceFileStoreSessionForTests(): void {
  session = undefined;
}
