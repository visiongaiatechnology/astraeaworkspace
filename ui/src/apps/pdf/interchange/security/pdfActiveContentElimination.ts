// STATUS: DIAMANT VGT SUPREME — byte-level active PDF content elimination contract.

const FORBIDDEN_ACTIVE_PDF_MARKERS = [
  /\/JavaScript\b/u,
  /\/JS\b/u,
  /\/Launch\b/u,
  /\/OpenAction\b/u,
  /\/AA\b/u,
  /\/EmbeddedFiles\b/u,
  /\/EmbeddedFile\b/u,
  /\/FileAttachment\b/u,
  /\/Filespec\b/u,
  /\/EF\s*<</u,
] as const;

export function assertPdfActiveContentEliminated(bytes: Uint8Array): void {
  const serialized = new TextDecoder('latin1').decode(bytes);
  for (const marker of FORBIDDEN_ACTIVE_PDF_MARKERS) {
    if (marker.test(serialized)) throw new Error('PDF active-content elimination failed closed.');
  }
}
