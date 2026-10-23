import type { WriterWorkspaceEmbedKind, WriterWorkspaceEmbedSnapshot } from '../../workspace-integration/workspaceWriterIntegration';
// STATUS: DIAMANT VGT SUPREME — Notes & PDF Studio Types

export type NoteTemplateScope = 'notebook' | 'section' | 'page';
export type NotePropertyValue = string | number | boolean | null;

export interface NoteTagDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  builtIn?: boolean;
}

export interface NoteSmartCollectionQuery {
  tags?: string[];
  properties?: Record<string, NotePropertyValue>;
  text?: string;
  match?: 'all' | 'any';
}

export interface NoteSmartCollection {
  id: string;
  name: string;
  query: NoteSmartCollectionQuery;
  createdAt: number;
  updatedAt: number;
}


export type NoteSavedSearchScope = 'page' | 'section' | 'notebook' | 'all';

export interface NoteSavedSearch {
  id: string;
  name: string;
  query: string;
  scope: NoteSavedSearchScope;
  tag?: string | null;
  dateFrom?: number | null;
  dateTo?: number | null;
  includeArchived?: boolean;
  favoritesOnly?: boolean;
  createdAt: number;
  updatedAt: number;
}


export interface NoteComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  parentId?: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number | null;
}

export interface NoteAuthorAttribution {
  authorId: string;
  displayName: string;
  updatedAt: number;
}


export type NoteProtectionMode = 'none' | 'workspace' | 'additional-unlock';
export interface NoteProtectionVerifier {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  saltBase64: string;
  verifierBase64: string;
}
export interface NoteProtectionPolicy {
  mode: NoteProtectionMode;
  verifier?: NoteProtectionVerifier;
  autoLockMinutes?: number;
}


export type NoteWorkspaceLinkRelation = 'writer-draft' | 'task' | 'planner' | 'project' | 'database' | 'space' | 'pdf-annotation' | 'vault';
export interface NoteWorkspaceLink {
  id: string;
  relation: NoteWorkspaceLinkRelation;
  targetDocumentId: string;
  targetKind: string;
  targetObjectId?: string;
  uri: string;
  createdAt: number;
}

export interface NoteTaskBinding {
  id: string;
  taskId: string;
  source: 'markdown' | 'canvas';
  sourceKey: string;
  sync: 'bidirectional' | 'note-to-task' | 'task-to-note';
  createdAt: number;
}

export interface NotePageTemplateSnapshot {
  title: string;
  content: string;
  editorMode?: NotePageEditorMode;
  canvas?: NoteCanvasState;
  tags: string[];
  properties?: Record<string, NotePropertyValue>;
}

export interface NoteSectionTemplateSnapshot {
  title: string;
  pages: NotePageTemplateSnapshot[];
}

export interface NoteNotebookTemplateSnapshot {
  title: string;
  sections: NoteSectionTemplateSnapshot[];
}

export interface NoteTemplateRecord {
  id: string;
  name: string;
  scope: NoteTemplateScope;
  createdAt: number;
  updatedAt: number;
  page?: NotePageTemplateSnapshot;
  section?: NoteSectionTemplateSnapshot;
  notebook?: NoteNotebookTemplateSnapshot;
}

export interface NoteSectionGroup {
  id: string;
  title: string;
  parentGroupId?: string | null;
  color?: string;
  collapsed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NoteNavigationEntry {
  pageId: string;
  visitedAt: number;
}

export interface NoteNotebook {
  id: string;
  title: string;
  sections: NoteSection[];
  sectionGroups?: NoteSectionGroup[];
  templates?: NoteTemplateRecord[];
  recentPageIds?: string[];
  navigationHistory?: NoteNavigationEntry[];
  properties?: Record<string, NotePropertyValue>;
  tagDefinitions?: NoteTagDefinition[];
  smartCollections?: NoteSmartCollection[];
  savedSearches?: NoteSavedSearch[];
  authorAttributionEnabled?: boolean;
  protection?: NoteProtectionPolicy;
  pinned?: boolean;
  favorite?: boolean;
  archived?: boolean;
  trashedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface NoteSection {
  id: string;
  title: string;
  pages: NotePage[];
  groupId?: string | null;
  properties?: Record<string, NotePropertyValue>;
  pinned?: boolean;
  archived?: boolean;
  trashedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  protection?: NoteProtectionPolicy;
}

export interface NoteAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: number;
  sha256?: string;
}


export interface NoteLinkBinding {
  key: string;
  rawTarget: string;
  targetPageId?: string;
  targetAnchor?: string;
  transclusion?: boolean;
  updatedAt: number;
}

export interface NoteBlockAnchor {
  id: string;
  label: string;
  source: 'explicit' | 'heading' | 'canvas';
  line?: number;
  blockId?: string;
}

export interface NotePageRevision {
  id: string;
  timestamp: number;
  name?: string;
  title: string;
  content: string;
  editorMode?: NotePageEditorMode;
  canvas?: NoteCanvasState;
  tags: string[];
  properties?: Record<string, NotePropertyValue>;
}


export type NoteInkTool = 'pen' | 'highlighter' | 'line' | 'rect' | 'ellipse';
export type NoteInkPointerType = 'mouse' | 'touch' | 'pen';

export interface NoteInkPoint {
  x: number;
  y: number;
  t: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

export interface NoteInkStroke {
  id: string;
  tool: NoteInkTool;
  inputType: NoteInkPointerType;
  points: NoteInkPoint[];
  color: string;
  width: number;
  opacity: number;
}

export interface NoteInkRecognition {
  text: string;
  engine: 'web-handwriting-api';
  language: string;
  updatedAt: number;
}

export interface NoteInkDocument {
  version: 1;
  width: number;
  height: number;
  strokes: NoteInkStroke[];
  recognition?: NoteInkRecognition;
}


export interface NoteImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NoteImageOcrToken {
  text: string;
  box: { x: number; y: number; width: number; height: number };
}

export interface NoteImageOcrResult {
  fullText: string;
  tokens: NoteImageOcrToken[];
  sourceWidth: number;
  sourceHeight: number;
  engine: 'shape-detection-text';
  updatedAt: number;
}

export interface NoteImageAnnotation {
  id: string;
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface NoteMediaBookmark {
  id: string;
  seconds: number;
  label: string;
}

export interface NoteTranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence: number | null;
}

export interface NoteMediaMemo {
  id: string;
  kind: 'audio' | 'video';
  title: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
  durationSeconds: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  bookmarks: NoteMediaBookmark[];
  transcript: NoteTranscriptSegment[];
  createdAt: number;
  transcriptionEngine?: 'web-speech-local';
}


export interface NoteWorkspaceEmbedData {
  kind: WriterWorkspaceEmbedKind;
  mode: 'Live' | 'Frozen';
  sourceDocumentId: string;
  sourceObjectId?: string;
  sourceSelector?: string;
  sourceVersion: number;
  uri: string;
  title: string;
  snapshot: WriterWorkspaceEmbedSnapshot;
}

export type NotePageEditorMode = 'document' | 'freeform';
export type NoteCanvasBackground = 'plain' | 'grid' | 'ruled' | 'dots';
export type NoteCanvasPageMode = 'infinite' | 'fixed';
export type NoteCanvasPageSize = 'A4' | 'Letter' | 'A5' | 'Custom';

export interface NoteCanvasGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface NoteCanvasBlockBase extends NoteCanvasGeometry {
  id: string;
  collapsed?: boolean;
}

export type NoteCanvasBlock =
  | (NoteCanvasBlockBase & { kind: 'text'; text: string })
  | (NoteCanvasBlockBase & { kind: 'list'; items: string[]; ordered?: boolean; checklist?: boolean })
  | (NoteCanvasBlockBase & { kind: 'table'; rows: string[][] })
  | (NoteCanvasBlockBase & { kind: 'image'; src: string; mimeType: string; altText?: string; crop?: NoteImageCrop; rotation?: 0 | 90 | 180 | 270; ocr?: NoteImageOcrResult; annotations?: NoteImageAnnotation[] })
  | (NoteCanvasBlockBase & { kind: 'media'; memo: NoteMediaMemo })
  | (NoteCanvasBlockBase & { kind: 'ink'; svg: string; ink?: NoteInkDocument; recognizedText?: string })
  | (NoteCanvasBlockBase & { kind: 'file'; attachmentId: string; name: string; mimeType: string })
  | (NoteCanvasBlockBase & { kind: 'embed'; title: string; reference: string; frozen: boolean; workspace?: NoteWorkspaceEmbedData })
  | (NoteCanvasBlockBase & { kind: 'toggle'; title: string; text: string });

export interface NoteCanvasState {
  pageMode: NoteCanvasPageMode;
  pageSize: NoteCanvasPageSize;
  customWidthPx?: number;
  customHeightPx?: number;
  background: NoteCanvasBackground;
  backgroundColor?: string;
  blocks: NoteCanvasBlock[];
}

export interface NotePage {
  id: string;
  title: string;
  content: string;
  editorMode?: NotePageEditorMode;
  canvas?: NoteCanvasState;
  tags: string[];
  backlinks: string[];
  last_modified: number;
  created_at?: number;
  lastOpenedAt?: number;
  parentPageId?: string | null;
  properties?: Record<string, NotePropertyValue>;
  aliases?: string[];
  linkBindings?: NoteLinkBinding[];
  taskBindings?: NoteTaskBinding[];
  workspaceLinks?: NoteWorkspaceLink[];
  pinned?: boolean;
  favorite?: boolean;
  archived?: boolean;
  trashedAt?: number | null;
  templateId?: string;
  attachments?: NoteAttachment[];
  revisions?: NotePageRevision[];
  comments?: NoteComment[];
  lastAuthor?: NoteAuthorAttribution;
  protection?: NoteProtectionPolicy;
  sensitiveMode?: boolean;
}

export interface NoteDocumentModel {
  id: string;
  title: string;
  sections: NoteSection[];
}

