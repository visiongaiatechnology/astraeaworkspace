// STATUS: DIAMANT VGT SUPREME — Stable Writer pagination compatibility facade
export { paginateWriterParagraphs } from './paragraphs/writerParagraphPagination';
export { paginateWriterSections } from './sections/writerSectionPagination';
export type {
  WriterPaginationFragment,
  WriterTableFragment,
  WriterPageFlowItem,
  WriterPaginationPage,
  WriterPaginationSectionSegment,
  WriterFlowContent,
} from './writerPaginationTypes';
export * from './geometry/writerPaginationGeometry';
export * from './measurement/writerPaginationMeasurement';
