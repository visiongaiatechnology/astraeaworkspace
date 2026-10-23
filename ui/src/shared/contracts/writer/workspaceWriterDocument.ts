// STATUS: DIAMANT VGT SUPREME — Writer Document aggregate schema contracts
import type { WriterPageSetupConfig, WriterSectionDefinition, WriterStyleCatalog, WriterStyleDefinition, WriterStyleSet } from './workspaceWriterLayout';
import type { WriterAutoCorrectConfig, WriterBookmark, WriterCitationSource, WriterComment, WriterContentControl, WriterFootnote, WriterIndexEntry, WriterInteropPreservation, WriterLinguisticsConfig, WriterMailMergeConfig, WriterProtectionMode, WriterRevision, WriterViewMode } from './workspaceWriterReview';
import type { Paragraph } from './workspaceWriterText';
import type { WriterListTemplate } from './workspaceWriterList';
import type { WriterEquationBlockData, WriterImageBlockData, WriterShapeBlockData } from './workspaceWriterMedia';
import type { WriterWorkspaceEmbed } from '../workspace-integration/workspaceWriterIntegration';
import type { WriterTableBlockData } from './workspaceWriterTable';

export interface WriterDocumentModel {
  pageSetup: WriterPageSetupConfig;
  tables: WriterTableBlockData[];
  images?: WriterImageBlockData[];
  mediaObjects?: import('./workspaceWriterMedia').WriterMediaObjectData[];
  styles?: WriterStyleDefinition[];
  styleCatalog?: WriterStyleCatalog;
  sections?: WriterSectionDefinition[];
  equations?: WriterEquationBlockData[];
  shapes?: WriterShapeBlockData[];
  footnotes?: WriterFootnote[];
  endnotes?: WriterFootnote[];
  citations?: WriterCitationSource[];
  comments?: WriterComment[];
  revisions?: WriterRevision[];
  bookmarks?: WriterBookmark[];
  mailMerge?: WriterMailMergeConfig;
  autoCorrect?: WriterAutoCorrectConfig;
  linguistics?: WriterLinguisticsConfig;
  viewMode?: WriterViewMode;
  currentTheme?: string;
  styleSets?: WriterStyleSet[];
  list_templates?: WriterListTemplate[];
  active_heading_list_template_id?: string;
  protectionMode?: WriterProtectionMode;
  protectionPasswordHash?: string;
  contentControls?: WriterContentControl[];
  indexEntries?: WriterIndexEntry[];
  namedVersions?: WriterNamedVersion[];
  interopPreservation?: WriterInteropPreservation;
  workspaceEmbeds?: WriterWorkspaceEmbed[];
}

export interface WriterNamedVersion {
  id: string;
  name: string;
  createdAt: number;
  sourceDocumentVersion: number;
  snapshot: WriterNamedVersionSnapshot;
}

export interface WriterNamedVersionSnapshot {
  paragraphs: Paragraph[];
  writerData: Omit<WriterDocumentModel, 'namedVersions' | 'protectionMode' | 'protectionPasswordHash'>;
}
