// STATUS: DIAMANT VGT SUPREME
// The one rule for a PDF file name this application displays, downloads or stores.
//
// It was extracted from `viewer/display/PdfJsPageView.tsx` (`sanitizeDownloadName`), which was the only
// definition until this batch. `interchange/native/openNativePdfPayload.ts` needed the same rule for the name a
// newly opened foreign PDF takes over — and a second copy of one character class is exactly the "two rules for
// one fact" failure this project keeps paying for. The rule itself is unchanged: Unicode text stays readable
// (a German `ü` is not a path separator), while path separators, control characters and the characters Windows
// forbids in a name become `_`.

const UNSAFE_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/gu;
const MAX_FILE_NAME_CHARS = 180;

/**
 * Returns a name that is safe as a path segment and still readable.
 *
 * Not a security boundary on its own: the size and structure gates live in the canonical import path
 * (`platform/documents/pdf/nativeInspection.ts`). This function only stops a name from becoming a path.
 */
export function sanitizePdfFileName(name: string, fallback = 'document.pdf'): string {
  const normalized = (name || '').normalize('NFKC').replace(UNSAFE_FILE_NAME_CHARS, '_').trim();
  return normalized.slice(0, MAX_FILE_NAME_CHARS) || fallback;
}

/** The download name for a PDF artifact: the same rule, plus the extension contract. */
export function sanitizePdfDownloadName(title: string, suffix: string): string {
  const stem = sanitizePdfFileName((title || 'document').replace(/\.pdf$/iu, '').replace(/[^a-z0-9._-]+/giu, '_'), 'document');
  return `${stem}${suffix}.pdf`;
}
