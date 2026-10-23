// STATUS: DIAMANT VGT SUPREME — immutable pagination flow contracts
import type { Paragraph, WriterEquationBlockData, WriterFootnote, WriterImageBlockData, WriterMediaObjectData, WriterTableBlockData, WriterWorkspaceEmbed, WriterLanguageTag } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../types';

export interface WriterPaginationFragment {
  key: string;
  paragraph: Paragraph;
  startOffset: number;
  endOffset: number;
  lineCount: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface WriterTableFragment {
  key: string;
  tableId: string;
  table: WriterTableBlockData;
  startRowIndex: number;
  endRowIndex: number;
  isFirstFragment: boolean;
  isLastFragment: boolean;
  repeatHeader: boolean;
  anchorParagraphId?: string;
}

export type WriterPageFlowItem =
  | { kind: 'paragraph'; fragment: WriterPaginationFragment; columnIndex?: number }
  | { kind: 'table'; fragment: WriterTableFragment; columnIndex?: number };

export interface WriterPaginationPage {
  id: string;
  pageIndex: number;
  paragraphs: Paragraph[];
  fragments: WriterPaginationFragment[];
  tableFragments?: WriterTableFragment[];
  flowItems?: WriterPageFlowItem[];
  columnFlowItems?: WriterPageFlowItem[][];
  usedFlowHeightPx: number;
  availableFlowHeightPx: number;
  isFirst: boolean;
  pageSetup: PageSetupConfig;
  sectionId: string;
  sectionPageIndex: number;
  displayPageNumber: number;
  displayPageNumberString?: string;
  columnUsedHeightsPx?: number[];
  sectionSegments?: WriterPaginationSectionSegment[];
  isBlankPage?: boolean;
}

export interface WriterPaginationSectionSegment {
  sectionId: string;
  sectionPageIndex: number;
  pageSetup: PageSetupConfig;
  fragments: WriterPaginationFragment[];
  tableFragments: WriterTableFragment[];
  flowItems: WriterPageFlowItem[];
  columnFlowItems: WriterPageFlowItem[][];
  usedFlowHeightPx: number;
  availableFlowHeightPx: number;
  columnUsedHeightsPx: number[];
}

export interface WriterFlowContent {
  tables: readonly WriterTableBlockData[];
  images: readonly WriterImageBlockData[];
  mediaObjects?: readonly WriterMediaObjectData[];
  equations: readonly WriterEquationBlockData[];
  footnotes: readonly WriterFootnote[];
  workspaceEmbeds?: readonly WriterWorkspaceEmbed[];
  defaultLanguage?: WriterLanguageTag;
}
