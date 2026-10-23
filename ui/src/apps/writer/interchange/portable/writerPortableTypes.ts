// STATUS: PLATIN — the interchange format names, in one place
//
// Extracted so the export loss report and the interop module can both name a format without importing
// each other (the extraction was driven by a real cycle, not by taste: the report needs the format
// type and the interop module needs the report type).
export type WriterPortableFormat = 'docx' | 'odt' | 'rtf' | 'txt' | 'html' | 'markdown';
