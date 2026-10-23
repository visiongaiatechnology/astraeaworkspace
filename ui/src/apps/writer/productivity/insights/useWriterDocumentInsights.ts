// STATUS: DIAMANT VGT SUPREME — Bounded Writer Pagination & Statistics Derivation
import { useMemo } from 'react';
import type {
  Paragraph,
  WriterEquationBlockData,
  WriterFootnote,
  WriterImageBlockData,
  WriterMediaObjectData,
  WriterPageSetupConfig,
  WriterSectionDefinition,
  WriterStyleDefinition,
  WriterTableBlockData,
} from '../../../../shared/contracts/workspace';
import { paginateWriterSections } from '../../layout/pagination/writerPagination';
import { calculateTextStatistics } from '../../utils/writerUtils';

interface UseWriterDocumentInsightsProps {
  paragraphs: readonly Paragraph[];
  pageSetup: WriterPageSetupConfig;
  styles: readonly WriterStyleDefinition[];
  sections: readonly WriterSectionDefinition[];
  tables: readonly WriterTableBlockData[];
  images: readonly WriterImageBlockData[];
  mediaObjects: readonly WriterMediaObjectData[];
  equations: readonly WriterEquationBlockData[];
  footnotes: readonly WriterFootnote[];
}

export function useWriterDocumentInsights({
  paragraphs,
  pageSetup,
  styles,
  sections,
  tables,
  images,
  mediaObjects,
  equations,
  footnotes,
}: UseWriterDocumentInsightsProps) {
  const pages = useMemo(() => paginateWriterSections(
    [...paragraphs],
    pageSetup,
    [...styles],
    [...sections],
    { tables: [...tables], images: [...images], mediaObjects: [...mediaObjects], equations: [...equations], footnotes: [...footnotes] },
  ), [equations, footnotes, images, mediaObjects, pageSetup, paragraphs, sections, styles, tables]);

  const stats = useMemo(() => calculateTextStatistics([...paragraphs], {
    pageCount: pages.length,
    tableCount: tables.length,
    additionalTexts: [
      ...tables.flatMap((table) => [
        ...table.columns,
        ...table.rows.flatMap((row) => row.cells.map((cell) => cell.content)),
      ]),
      ...footnotes.map((footnote) => footnote.text),
      ...images.flatMap((image) => [image.altText ?? '', image.caption ?? '']).filter(Boolean),
      ...mediaObjects.flatMap((media) => [media.name, media.caption ?? '']).filter(Boolean),
      ...equations.map((equation) => equation.caption ?? '').filter(Boolean),
    ],
  }), [equations, footnotes, images, mediaObjects, pages.length, paragraphs, tables]);

  return { pages, stats };
}
