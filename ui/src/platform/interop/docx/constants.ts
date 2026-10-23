// STATUS: PLATIN
export const WORD_DOCUMENT = 'word/document.xml';

export const MAX_DOCX_FILE_BYTES = 64 * 1024 * 1024;

export const MAX_XML_CHARS = 32 * 1024 * 1024;

export const DOCX_ZIP_LIMITS = { maxEntries: 2048, maxEntryBytes: 32 * 1024 * 1024, maxTotalUncompressedBytes: 96 * 1024 * 1024, maxCompressionRatio: 100 } as const;

export const DOCX_REGENERATED_XML_PARTS = new Set([
  '[Content_Types].xml',
  WORD_DOCUMENT,
  'word/styles.xml',
  'word/settings.xml',
  'docProps/core.xml',
  'docProps/app.xml',
]);
