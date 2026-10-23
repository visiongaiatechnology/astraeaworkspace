// STATUS: DIAMANT VGT SUPREME — Writer cross-workspace reference model
import type { ChartObject } from '../visualization/workspaceShapesChartsCore';
export type WriterWorkspaceEmbedMode = 'Live' | 'Snapshot';

export type WriterWorkspaceEmbedKind =
  | 'writer-live-link'
  | 'grid-range'
  | 'grid-chart'
  | 'writer-local-chart'
  | 'database-recordset'
  | 'project-report'
  | 'project-timeline'
  | 'task-list'
  | 'task-kpi'
  | 'forms-summary'
  | 'whiteboard-frame'
  | 'present-slide'
  | 'pdf-page'
  | 'pdf-annotation'
  | 'vault-asset'
  | 'space-context';

export interface WriterWorkspaceTableSnapshot {
  type: 'table';
  columns: string[];
  rows: string[][];
}

export interface WriterWorkspaceChartSnapshot {
  type: 'chart';
  title: string;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  chart?: ChartObject;
}

export interface WriterWorkspaceSummarySnapshot {
  type: 'summary';
  metrics: Array<{ label: string; value: string }>;
  lines: string[];
}

export interface WriterWorkspaceTimelineSnapshot {
  type: 'timeline';
  items: Array<{
    id: string;
    label: string;
    start?: string;
    end?: string;
    progress?: number;
    status?: string;
  }>;
}

export interface WriterWorkspaceSlideSnapshot {
  type: 'slide';
  title: string;
  subtitle: string;
  bulletPoints: string[];
  sceneObjectCount: number;
  commentCount: number;
}

export interface WriterWorkspaceFrameSnapshot {
  type: 'frame';
  name: string;
  text: string;
  containedItems: Array<{ id: string; type: string; text: string }>;
}

export interface WriterWorkspacePdfPageSnapshot {
  type: 'pdf-page';
  pageNumber: number;
  title: string;
  subtitle?: string;
  sections: Array<{ id: string; type: string; content: string }>;
}

export interface WriterWorkspacePdfAnnotationSnapshot {
  type: 'pdf-annotation';
  page: number;
  annotationType: string;
  text: string;
  author?: string;
  createdAt?: number;
}

export interface WriterWorkspaceVaultAssetSnapshot {
  type: 'vault-asset';
  fileId: string;
  name: string;
  mimeType?: string;
  sizeBytes: number;
  sourceType?: 'workspace-document' | 'attachment';
  documentId?: string;
  integrityState?: 'unverified' | 'verified' | 'mismatch' | 'unavailable';
}

export interface WriterWorkspaceSpaceSnapshot {
  type: 'space-context';
  spaceId: string;
  name: string;
  description: string;
  role: string;
  permissions: string[];
  linkedDocumentIds: string[];
  activity: Array<{ id: string; at: number; text: string }>;
  retainedWriterCommentIds: string[];
}

export type WriterWorkspaceEmbedSnapshot =
  | WriterWorkspaceTableSnapshot
  | WriterWorkspaceChartSnapshot
  | WriterWorkspaceSummarySnapshot
  | WriterWorkspaceTimelineSnapshot
  | WriterWorkspaceSlideSnapshot
  | WriterWorkspaceFrameSnapshot
  | WriterWorkspacePdfPageSnapshot
  | WriterWorkspacePdfAnnotationSnapshot
  | WriterWorkspaceVaultAssetSnapshot
  | WriterWorkspaceSpaceSnapshot;

export interface WriterWorkspaceEmbed {
  id: string;
  kind: WriterWorkspaceEmbedKind;
  mode: WriterWorkspaceEmbedMode;
  sourceDocumentId: string;
  sourceObjectId?: string;
  sourceSelector?: string;
  uri: string;
  sourceVersion: number;
  anchorParagraphId: string;
  title: string;
  /** When the embed was inserted. */
  createdAt: number;
  /**
   * The modification time of the **source** state this embed reflects.
   *
   * Not the same as `createdAt`: together with `sourceVersion` it tells a live embed whether anything
   * moved, and both signals are needed because a source update can change content without raising the
   * version (W-249).
   */
  updatedAt: number;
  snapshot: WriterWorkspaceEmbedSnapshot;
}
