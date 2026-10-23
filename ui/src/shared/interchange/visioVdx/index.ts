// STATUS: PLATIN — stable public entrypoint for the bounded Visio VDX codec.
export { exportDrawToVisioXml } from './export';
export { importVisioXmlToDraw } from './import';
export { VisioInteropError } from './contracts';
export type { VisioConversionReport, VisioExportResult, VisioImportResult } from './contracts';
