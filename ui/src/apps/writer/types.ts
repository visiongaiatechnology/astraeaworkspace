// STATUS: DIAMANT VGT SUPREME
import type {
  WriterPaperSize,
  WriterPageOrientation,
  WriterMarginPreset,
  WriterPaperColor,
  WriterTableCellData,
  WriterTableRowData,
  WriterTableBlockData,
  WriterImageBlockData,
  WriterParagraphStyleName,
  WriterStyleDefinition,
  WriterPageSetupConfig,
  WriterFootnote,
  WriterCitationSource,
  WriterCitation,
  WriterCitationSourceType,
  WriterCitationStyle,
  WriterCommentReply,
  WriterComment,
  WriterRevision,
  WriterRevisionType,
  WriterRevisionStatus,
  WriterRevisionPayload,
  WriterBookmark,
  WriterMailMergeRecord,
  WriterMailMergeConfig,
  WriterEquationBlockData,
  WriterViewMode,
  WriterDocumentModel,
  WriterPageBorders,
  WriterPageNumberFormat,
  WorkspaceDocument,
  Paragraph,
  TextSpan,
  WriterFootnoteType,
  WriterNoteNumberFormat,
  WriterProtectionMode,
  WriterProtectionConfig,
  WriterContentControl,
  WriterContentControlType,
  WriterIndexEntry,
  WriterIndexSubEntry,
  WriterTableIndexItem,
  WriterCrossReferenceField,
} from '../../shared/contracts/workspace';
import type { WriterExportHost } from '../../edition/contracts/writerExportHost';

export type {
  WriterFootnote,
  WriterRevisionType,
  WriterRevisionStatus,
  WriterRevisionPayload,
  WriterCitationSource,
  WriterCitation,
  WriterCommentReply,
  WriterComment,
  WriterRevision,
  WriterBookmark,
  WriterEquationBlockData,
  WriterPageBorders,
  WriterPageNumberFormat,
  WriterFootnoteType,
  WriterNoteNumberFormat,
  WriterProtectionMode,
  WriterProtectionConfig,
  WriterContentControl,
  WriterContentControlType,
  WriterIndexEntry,
  WriterIndexSubEntry,
  WriterTableIndexItem,
  WriterCrossReferenceField,
};

export type PaperSize = WriterPaperSize;
export type PageOrientation = WriterPageOrientation;
export type MarginPreset = WriterMarginPreset;
export type PaperColor = WriterPaperColor;
export type TableCellData = WriterTableCellData;
export type TableRowData = WriterTableRowData;
export type TableBlockData = WriterTableBlockData;
export type ImageBlockData = WriterImageBlockData;
export type StyleName = WriterParagraphStyleName;
export type StyleDefinition = WriterStyleDefinition;
export type WriterParagraph = Paragraph;
export type WriterTextSpan = TextSpan;

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  opacity: number;
  rotationDeg: number;
  color: string;
}

export interface CustomMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  gutter: number;
}

export type PageSetupConfig = WriterPageSetupConfig;

export interface TocHeadingItem {
  id: string;
  level: number;
  text: string;
  index: number;
  pageNumber?: number;
}

export type CitationSourceType = WriterCitationSourceType;
export type CitationStyle = WriterCitationStyle;
export type RevisionType = WriterRevisionType;
export type RevisionStatus = WriterRevisionStatus;

export type ReviewMode = 'all' | 'simple' | 'none' | 'original';
export type ReviewerFilter = 'all' | string;

export type MailMergeRecord = WriterMailMergeRecord;
export type MailMergeConfig = WriterMailMergeConfig;
export type ViewMode = WriterViewMode;
export type ActiveTabSidebar = 'toc' | 'pages' | 'bookmarks' | 'comments' | 'search' | 'revisions';

// Type aliases for flexible imports
export type FootnoteItem = WriterFootnote;
export type CitationSource = WriterCitationSource;
export type DocumentComment = WriterComment;
export type TrackChangeRevision = WriterRevision;
export type BookmarkItem = WriterBookmark;
export type EquationBlockData = WriterEquationBlockData;
export type MailMergeData = MailMergeConfig;
export type ProtectionMode = WriterProtectionMode;
export type ProtectionConfig = WriterProtectionConfig;

export type WriterDocumentData = Partial<WriterDocumentModel>;
export type WriterWorkspaceSourceMetadata = Pick<WorkspaceDocument, 'id' | 'kind' | 'title' | 'modified_at'>;

export interface WriterEditorProps {
  document: WorkspaceDocument;
  workspaceDocuments: readonly WorkspaceDocument[];
  storedWorkspaceDocuments?: readonly WriterWorkspaceSourceMetadata[];
  loadStoredWorkspaceDocument?: (documentId: string) => Promise<WorkspaceDocument | null>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  onOpenDocument?: (documentId: string) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  allowBrowserManagedSpeech?: boolean;
  writerExportHost?: WriterExportHost;
  /**
   * W-229: what the shell's autosave is doing, pushed in by the frame (`AppWorkspaceView.tsx`).
   *
   * The Writer has no save state of its own and must not grow one: the shell owns the status and the
   * classified reason, and this surface only renders them. The reason is a **code**, never an exception
   * text, because a raw message can carry a path or a document name.
   */
  saveStatus?: 'saved' | 'saved-with-warning' | 'saving' | 'unsaved' | 'error';
  saveFailure?: { code: 'storage-full' | 'save-blocked' | 'native-unavailable' | 'unknown'; at: number } | null;
}
