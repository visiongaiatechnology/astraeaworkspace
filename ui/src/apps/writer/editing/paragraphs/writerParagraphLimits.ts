// STATUS: DIAMANT VGT SUPREME — WR-045: hard ceilings for paragraph growth
//
// The document validator refuses more than 1 000 000 paragraphs, but that is a *file* bound:
// the interactive editor had no ceiling at all. Repeated direct-cursor clicks (or a hostile
// paste) could grow the model without limit while every click also re-paginated the document,
// which is exactly the runaway the plan asks to close. The interactive ceiling is far below
// the validator's so the two can never disagree about a document the editor produced.
export const WRITER_MAX_PARAGRAPHS = 20_000;
export const WRITER_MAX_PARAGRAPH_CHARS = 1_000_000;

export function writerCanAddParagraphs(paragraphCount: number, added = 1): boolean {
  // Fail closed: a non-finite count is a defect, not "plenty of room".
  if (!Number.isFinite(paragraphCount) || paragraphCount < 0) return false;
  const requested = Math.trunc(paragraphCount);
  const adding = Number.isFinite(added) ? Math.max(1, Math.trunc(added)) : 1;
  return requested + adding <= WRITER_MAX_PARAGRAPHS;
}
