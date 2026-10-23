// STATUS: PLATIN
// Stable public facade for PDF comparison types, engine, view mapping, and report serialization.

export type { PdfCompareCategory, PdfCompareChangeKind, PdfCompareOptions, PdfCompareTextDelta, PdfCompareDifference, PdfComparePageSummary, PdfCompareSummary, PdfCompareResult } from './pdfCompareTypes';
export { compareStructuredPdfDocuments } from './pdfCompareEngine';
export { computeSynchronizedScrollTop } from './pdfCompareView';
export { serializePdfCompareReport } from './pdfCompareReport';
