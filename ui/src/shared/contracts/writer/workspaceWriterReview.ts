// STATUS: DIAMANT VGT SUPREME — Writer Review and controls schema contracts
import type { Paragraph } from './workspaceWriterText';
import type { WriterLanguageTag, WriterPageSetupConfig, WriterSectionBreakType, WriterSectionDefinition, WriterStyleCatalog } from './workspaceWriterLayout';
import type { WriterTableBlockData } from './workspaceWriterTable';

export type WriterFootnoteType = 'footnote' | 'endnote';

export type WriterNoteNumberFormat = 'arabic' | 'roman' | 'alpha' | 'symbol';

export interface WriterFootnote {
  id: string;
  number: number;
  text: string;
  referenceParagraphId: string;
  /**
   * Character offset of the reference inside its paragraph. Notes are numbered in
   * text order, so this is the ordering key within one paragraph.
   *
   * Captured when the note is inserted: the reference is a rendered badge, not a
   * character in the text (see W-043), so there is nothing to locate afterwards.
   * Without it every note of a paragraph ties and the order falls back to the
   * insertion order, which is not the text order.
   */
  referenceTextOffset?: number;
  /**
   * The former name of `referenceTextOffset`. Nothing ever wrote it, so no stored
   * document carries a value; it is read only so a hand-authored file that used the
   * old name still orders correctly.
   * @deprecated Use `referenceTextOffset`.
   */
  referenceSpanIndex?: number;
  noteType?: WriterFootnoteType;
  numberFormat?: WriterNoteNumberFormat;
  customMark?: string;
}

export type WriterCitationSourceType = 'book' | 'article' | 'conference' | 'web';

export type WriterCitationStyle = 'APA' | 'MLA' | 'Chicago' | 'IEEE' | 'ISO690' | 'Harvard';

export interface WriterCitationSource {
  id: string;
  type: WriterCitationSourceType;
  author: string;
  title: string;
  year: string;
  journal?: string;
  publisher?: string;
  doi?: string;
  url?: string;
}

export interface WriterCitation {
  id: string;
  sourceId: string;
  locator?: string;
  prefix?: string;
  suffix?: string;
}

export interface WriterCommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  mentions?: string[];
}

export interface WriterComment {
  id: string;
  paragraphId: string;
  author: string;
  avatarColor: string;
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: WriterCommentReply[];
  mentions?: string[];
}

export type WriterRevisionType = 'insert' | 'delete' | 'move' | 'format' | 'table' | 'property';

export type WriterRevisionStatus = 'pending' | 'accepted' | 'rejected';

export interface WriterTextRevisionPayload {
  kind: 'text';
  beforeText: string;
  afterText: string;
  /** Full paragraph snapshots keep rich span structure reversible when available. */
  beforeParagraph?: Paragraph;
  afterParagraph?: Paragraph;
}

export interface WriterParagraphInsertRevisionPayload {
  kind: 'paragraph-insert';
  paragraph: Paragraph;
  index: number;
}

export interface WriterParagraphDeleteRevisionPayload {
  kind: 'paragraph-delete';
  paragraph: Paragraph;
  index: number;
  previousParagraphId?: string;
  nextParagraphId?: string;
}

export interface WriterMoveRevisionPayload {
  kind: 'move';
  paragraphId: string;
  beforeOrder: string[];
  afterOrder: string[];
}

export interface WriterFormatRevisionPayload {
  kind: 'format';
  beforeParagraph: Paragraph;
  afterParagraph: Paragraph;
}

export interface WriterStructuralBreakRevisionPayload {
  kind: 'structural-break';
  breakType: 'page' | 'column' | WriterSectionBreakType;
  index: number;
  beforeParagraph: Paragraph;
  afterHead: Paragraph;
  insertedTail: Paragraph;
  beforeSections?: WriterSectionDefinition[];
  afterSections?: WriterSectionDefinition[];
}

export interface WriterTableRevisionPayload {
  kind: 'table';
  tableId: string;
  beforeTable?: WriterTableBlockData;
  afterTable?: WriterTableBlockData;
  beforeIndex?: number;
  afterIndex?: number;
}

export type WriterPropertyRevisionPayload =
  | {
      kind: 'property';
      property: 'pageSetup';
      beforeValue: WriterPageSetupConfig;
      afterValue: WriterPageSetupConfig;
    }
  | {
      kind: 'property';
      property: 'sections';
      beforeValue: WriterSectionDefinition[];
      afterValue: WriterSectionDefinition[];
    }
  | {
      kind: 'property';
      property: 'styleCatalog';
      beforeValue: WriterStyleCatalog;
      afterValue: WriterStyleCatalog;
    }
  | {
      kind: 'property';
      property: 'currentTheme';
      beforeValue?: string;
      afterValue?: string;
    };

export type WriterRevisionPayload =
  | WriterTextRevisionPayload
  | WriterParagraphInsertRevisionPayload
  | WriterParagraphDeleteRevisionPayload
  | WriterMoveRevisionPayload
  | WriterFormatRevisionPayload
  | WriterStructuralBreakRevisionPayload
  | WriterTableRevisionPayload
  | WriterPropertyRevisionPayload;

export interface WriterRevision {
  id: string;
  paragraphId: string;
  type: WriterRevisionType;
  author: string;
  authorColor: string;
  originalText?: string;
  newText?: string;
  timestamp: number;
  status: WriterRevisionStatus;
  details?: string;
  payload?: WriterRevisionPayload;
  conflictReason?: string;
}

export type WriterContentControlType = 'text' | 'checkbox' | 'dropdown' | 'date' | 'picture' | 'repeating_section';

interface WriterContentControlBase {
  id: string;
  type: WriterContentControlType;
  title: string;
  paragraphId: string;
  tag?: string;
  required?: boolean;
  locked?: boolean;
}

export interface WriterTextContentControl extends WriterContentControlBase {
  type: 'text';
  value: string;
  placeholder?: string;
  maxLength?: number;
}

export interface WriterCheckboxContentControl extends WriterContentControlBase {
  type: 'checkbox';
  checked: boolean;
  checkedLabel?: string;
  uncheckedLabel?: string;
}

export interface WriterDropdownContentControl extends WriterContentControlBase {
  type: 'dropdown';
  options: string[];
  value?: string;
}

export interface WriterDateContentControl extends WriterContentControlBase {
  type: 'date';
  value?: string;
  min?: string;
  max?: string;
}

export interface WriterPictureContentControl extends WriterContentControlBase {
  type: 'picture';
  imageId?: string;
}

export interface WriterRepeatingSectionItem {
  id: string;
  value: string;
}

export interface WriterRepeatingSectionContentControl extends WriterContentControlBase {
  type: 'repeating_section';
  items: WriterRepeatingSectionItem[];
}

export type WriterContentControl =
  | WriterTextContentControl
  | WriterCheckboxContentControl
  | WriterDropdownContentControl
  | WriterDateContentControl
  | WriterPictureContentControl
  | WriterRepeatingSectionContentControl;

export type WriterProtectionMode = 'none' | 'review' | 'read_only' | 'comments_only' | 'form_filling';

export interface WriterProtectionConfig {
  mode: WriterProtectionMode;
  passwordHash?: string;
  enforced: boolean;
}

export interface WriterIndexSubEntry {
  id: string;
  subTerm: string;
  pageNumbers: number[];
}

export interface WriterIndexEntry {
  id: string;
  term: string;
  pageNumbers: number[];
  subEntries?: WriterIndexSubEntry[];
}

export interface WriterTableIndexItem {
  id: string;
  label: string;
  title: string;
  pageNumber: number;
}

export interface WriterCrossReferenceField {
  type: 'cross_reference';
  targetType: 'heading' | 'bookmark' | 'footnote' | 'endnote' | 'figure' | 'table';
  targetId: string;
  format: 'full' | 'text' | 'page' | 'text_and_page';
  cachedText: string;
}

export interface WriterBookmark {
  id: string;
  name: string;
  paragraphId: string;
  createdAt: number;
}

export interface WriterMailMergeRecord {
  [key: string]: string;
}

export interface WriterMailMergeConfig {
  records: WriterMailMergeRecord[];
  currentRecordIndex: number;
  previewEnabled: boolean;
  sourceLabel?: string;
}

export type WriterAutoCorrectLocale = 'de-DE' | 'en-US';

export interface WriterAutoCorrectRule {
  id: string;
  trigger: string;
  replacement: string;
  caseSensitive: boolean;
}

export interface WriterLinguisticsConfig {
  defaultLanguage: WriterLanguageTag;
  customDictionary: string[];
}

export interface WriterAutoCorrectConfig {
  enabled: boolean;
  smartQuotes: boolean;
  autoFormat: boolean;
  locale: WriterAutoCorrectLocale;
  replacements: WriterAutoCorrectRule[];
}

export type WriterViewMode = 'print' | 'continuous' | 'draft' | 'outline' | 'reading' | 'focus';

export interface WriterInteropPreservation {
  sourceFormat: 'docx' | 'odt';
  preservedXmlParts: Record<string, string>;
  preservedNamespaces: Record<string, string>;
}
