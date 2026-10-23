import { WorkspaceDocument, NetworkCapability } from '../../../shared/contracts/workspace';
import type { PdfTrustedTimestampProvider } from '../signatures/timestamps/pdfRfc3161Timestamp';

export interface PdfStudioProps {
  document: WorkspaceDocument;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  workspaceDocuments?: WorkspaceDocument[];
  onUpdateWorkspaceDocument?: (doc: WorkspaceDocument) => void;
  onCreateDerivedDocument?: (doc: WorkspaceDocument) => void;
  onOpenWorkspaceDocument?: (documentId: string) => void;
  trustedTimestampProvider?: PdfTrustedTimestampProvider;
  networkCapability?: NetworkCapability;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
}

export type ActiveTool = 'select' | 'highlight' | 'underline' | 'strike' | 'comment' | 'redact';

export interface HighlightColor {
  name: string;
  hex: string;
  bgClass: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: 'Sovereign Amber', hex: '#f59e0b', bgClass: 'bg-amber-500/30 text-amber-200 border-b-2 border-amber-400' },
  { name: 'Cyber Emerald', hex: '#10b981', bgClass: 'bg-emerald-500/30 text-emerald-200 border-b-2 border-emerald-400' },
  { name: 'Neon Blue', hex: '#3b82f6', bgClass: 'bg-blue-500/30 text-blue-200 border-b-2 border-blue-400' },
  { name: 'Sovereign Rose', hex: '#ec4899', bgClass: 'bg-pink-500/30 text-pink-200 border-b-2 border-pink-400' },
];
