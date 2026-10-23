import type { KeyVaultStatus, NetworkCapability, WorkspaceDocument } from '../../shared/contracts/workspace';

export interface EditionWorkManagementProps {
  document: WorkspaceDocument;
  onUpdateDocument: (document: WorkspaceDocument) => void;
  onCreateDerivedDocument: (document: WorkspaceDocument) => void;
  /**
   * AST-1001: the workspace document list and the shell's own navigator.
   *
   * Tasks already receives `onCreateDerivedDocument` (above) and uses it to create a Notes document
   * from a task. Without these two props a stored cross-app link could be created but never
   * followed — "Aufgabe als Live-Link in Notiz oder Bericht aufnehmen" implies a resolvable link,
   * not a string in a field. Same shape and same names as `EditionVaultRuntimeProps`, so the shell
   * passes one form rather than two.
   *
   * Optional so an embedding host without a document list still type-checks; the view then says
   * that navigation is unavailable instead of rendering an inert link.
   */
  documents?: WorkspaceDocument[];
  onOpenDocument?: (documentId: string) => void;
}

export interface EditionVaultRuntimeProps {
  document: WorkspaceDocument;
  documents: WorkspaceDocument[];
  onUpdateDocument: (document: WorkspaceDocument) => void;
  onCreateDerivedDocument: (document: WorkspaceDocument) => void;
  onOpenDocument: (documentId: string) => void;
  vaultStatus: KeyVaultStatus;
  activeDocumentPin: string | null;
  activeDocumentPassword?: string | null;
  onSetActiveDocumentPin?: (pin: string | null) => void;
  onSetActiveDocumentPassword?: (password: string | null) => void;
  networkCapability: NetworkCapability;
}

export interface EditionWriterSharingPanelProps {
  document: WorkspaceDocument;
}
