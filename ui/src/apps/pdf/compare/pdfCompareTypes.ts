// STATUS: PLATIN
// Public result and option contracts for structured PDF comparison.

export type PdfCompareCategory =
  | 'text'
  | 'page-meta'
  | 'decorations'
  | 'annotations'
  | 'forms'
  | 'redactions';

export type PdfCompareChangeKind = 'inserted' | 'deleted' | 'changed' | 'moved';

export interface PdfCompareOptions {
  ignoreCategories?: PdfCompareCategory[];
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

export interface PdfCompareTextDelta {
  before: string;
  after: string;
  removedTokens: string[];
  addedTokens: string[];
}

export interface PdfCompareDifference {
  id: string;
  kind: PdfCompareChangeKind;
  category: PdfCompareCategory;
  pageBefore?: number;
  pageAfter?: number;
  indexBefore?: number;
  indexAfter?: number;
  sectionId?: string;
  summary: string;
  textDelta?: PdfCompareTextDelta;
}

export interface PdfComparePageSummary {
  pageNumber: number;
  inserted: number;
  deleted: number;
  changed: number;
  moved: number;
  differenceIds: string[];
}

export interface PdfCompareSummary {
  inserted: number;
  deleted: number;
  changed: number;
  moved: number;
  total: number;
  pagesTouched: number;
}

export interface PdfCompareResult {
  schema: 'vgt-pdf-compare-v1';
  generatedAt: number;
  sourceTitle: string;
  targetTitle: string;
  options: Required<PdfCompareOptions>;
  summary: PdfCompareSummary;
  pageSummaries: PdfComparePageSummary[];
  differences: PdfCompareDifference[];
}
