// STATUS: DIAMANT VGT SUPREME
// Named, localized reasons for the document-assembly refusals.
//
// AST-0814 asks that every invalid path of the merge workflow be **visible and fail-closed** — not that the user
// read an English domain sentence out of `pages/pdfPageOps.ts`. Until this module, the assembler showed
// `cause.message` verbatim: an English technical sentence inside a seven-language application, and one that
// names no next step. The mapping below is by **identity**, not by position (the mistake W-299 already cost this
// project once) and it always names what the user can do next.
//
// The domain keeps its precise English sentences — they are the log's evidence — and the interface asks this
// module for the localizable one. An unknown refusal falls back to a generic sentence and keeps the detail.

import type { PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';

export type PdfAssemblyFailureCode = 'native-source' | 'dependency' | 'page-budget' | 'too-few-sources' | 'generic';

export interface PdfAssemblyFailure {
  readonly code: PdfAssemblyFailureCode;
  readonly copyKey: PdfWorkflowCopyKey;
  /** The domain's own sentence, kept for the log and the secondary line. Never the primary message. */
  readonly detail: string;
}

const NATIVE_SOURCE = /native\/raw PDF|requires the standards parser|unavailable for arbitrary native PDFs/u;
const DEPENDENCY = /unavailable dependency|calculation source|would leave form calculation/u;
const PAGE_BUDGET = /10,000-page policy|page count is outside the structured page-operation policy/u;
const TOO_FEW_SOURCES = /at least two structured PDF documents/u;

/**
 * Classifies a refusal from the page-operation or merge domain into a named code.
 *
 * The order matters: a message can match more than one pattern (a native source also fails the page-count check
 * only in unrelated sentences), and the most specific cause is the one the user can act on.
 */
export function classifyPdfAssemblyFailure(cause: unknown): PdfAssemblyFailure {
  const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : 'unknown assembly failure';
  if (TOO_FEW_SOURCES.test(detail)) return { code: 'too-few-sources', copyKey: 'merge.failed.too-few-sources', detail };
  if (NATIVE_SOURCE.test(detail)) return { code: 'native-source', copyKey: 'merge.failed.native-source', detail };
  if (DEPENDENCY.test(detail)) return { code: 'dependency', copyKey: 'merge.failed.dependency', detail };
  if (PAGE_BUDGET.test(detail)) return { code: 'page-budget', copyKey: 'merge.failed.page-budget', detail };
  return { code: 'generic', copyKey: 'merge.failed.generic', detail };
}
