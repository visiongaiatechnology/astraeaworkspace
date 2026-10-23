import React, { useMemo, useState } from 'react';
import type { PdfAnnotation, PdfPageModel, PdfSectionModel } from '../../../../shared/contracts/workspace';
import type { ActiveTool } from '../../studio/types';
import { buildStructuredPdfPageLayout, type PdfFlowBlock } from '../../layout/pdfStructuredLayout';

interface PdfStructuredFlowLayerProps {
  page: PdfPageModel;
  pageIndex: number;
  pageCount: number;
  annotations: PdfAnnotation[];
  searchQuery: string;
  activeTool: ActiveTool;
  onStageSectionRedaction: (pageNumber: number, section: PdfSectionModel) => void;
  onUpdateSectionContent?: (pageNumber: number, sectionId: string, newContent: string) => void;
  onUpdatePageMeta?: (pageNumber: number, title: string, subtitle?: string) => void;
}

const svgFontFamily = (font: string): string => font === 'Times-Roman'
  ? 'Times New Roman, Times, serif'
  : font === 'Courier'
    ? 'Courier New, Courier, monospace'
    : 'Arial, Helvetica, sans-serif';

const blockScreenBounds = (block: PdfFlowBlock, media: { x: number; y: number; width: number; height: number }) => ({
  left: ((block.bounds.x - media.x) / media.width) * 100,
  top: ((media.y + media.height - (block.bounds.y + block.bounds.height)) / media.height) * 100,
  width: (block.bounds.width / media.width) * 100,
  height: (block.bounds.height / media.height) * 100,
});

export const PdfStructuredFlowLayer: React.FC<PdfStructuredFlowLayerProps> = ({
  page,
  pageIndex,
  pageCount,
  annotations,
  searchQuery,
  activeTool,
  onStageSectionRedaction,
  onUpdateSectionContent,
  onUpdatePageMeta,
}) => {
  const layout = useMemo(() => buildStructuredPdfPageLayout(page, pageIndex, pageCount, annotations), [page, pageIndex, pageCount, annotations]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const media = layout.mediaBox;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const sectionById = useMemo(() => new Map(page.sections.map((section) => [section.id, section])), [page.sections]);
  const editingBlock = editingSectionId ? layout.flowBlocks.find((block) => block.sourceKind === 'section' && block.sourceId === editingSectionId) : undefined;
  const titleBlock = layout.flowBlocks.find((block) => block.sourceKind === 'title');

  const annotationStyle = (block: PdfFlowBlock): React.CSSProperties => {
    if (block.sourceKind !== 'section' || !block.sourceId) return {};
    const related = annotations.filter((annotation) => annotation.page === page.pageNumber && annotation.sectionId === block.sourceId);
    const highlight = related.find((annotation) => annotation.type === 'highlight');
    const underline = related.find((annotation) => annotation.type === 'underline');
    const strike = related.find((annotation) => annotation.type === 'strike');
    return {
      ...(highlight ? { paintOrder: 'stroke', stroke: highlight.color, strokeWidth: 5, strokeOpacity: 0.22 } : {}),
      ...(underline ? { textDecoration: 'underline', textDecorationColor: underline.color } : {}),
      ...(strike ? { textDecoration: 'line-through', textDecorationColor: strike.color } : {}),
    };
  };

  return (
    <div className="absolute inset-0 z-10" data-pdf-shared-layout="screen-v1">
      <svg
        className="absolute inset-0 h-full w-full select-text"
        viewBox={`0 0 ${media.width} ${media.height}`}
        role="img"
        aria-label={`PDF page ${page.pageNumber} structured screen layout`}
        preserveAspectRatio="none"
      >
        {layout.flowBlocks.map((block) => {
          const section = block.sourceKind === 'section' && block.sourceId ? sectionById.get(block.sourceId) : undefined;
          const isSearchMatch = Boolean(normalizedSearch && block.lines.join(' ').toLowerCase().includes(normalizedSearch));
          const top = media.height - ((block.bounds.y - media.y) + block.bounds.height);
          const canEditSection = Boolean(section && activeTool === 'select');
          const isTitle = block.sourceKind === 'title';
          return (
            <g
              key={block.id}
              data-pdf-flow-block={block.id}
              data-pdf-source-kind={block.sourceKind}
              data-pdf-source-id={block.sourceId}
              data-pdf-page={section ? page.pageNumber : undefined}
              data-pdf-section-id={section?.id}
              onClick={() => { if (section && activeTool === 'redact') onStageSectionRedaction(page.pageNumber, section); }}
              // GAP-0055, Runde 296: dieselbe Luecke wie in der
              // Positionierungsschicht — die Vormerkung zur Schwaerzung war nur
              // mit der Maus zu treffen. Bedingt auf das Schwaerzungswerkzeug.
              role={section && activeTool === 'redact' ? 'button' : undefined}
              tabIndex={section && activeTool === 'redact' ? 0 : undefined}
              onKeyDown={(event) => {
                if (!section || activeTool !== 'redact') return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onStageSectionRedaction(page.pageNumber, section);
                }
              }}
              onDoubleClick={(event: React.MouseEvent<SVGGElement>) => {
                if (canEditSection && section) { event.stopPropagation(); setEditingSectionId(section.id); }
                else if (isTitle && activeTool === 'select') { event.stopPropagation(); setEditingTitle(true); }
              }}
              style={{ cursor: section ? (activeTool === 'redact' ? 'crosshair' : 'text') : isTitle ? 'text' : 'default' }}
            >
              {isSearchMatch ? <rect x={block.bounds.x - media.x - 1} y={top - 1} width={Math.min(media.width, block.bounds.width + 2)} height={block.bounds.height + 2} rx="2" fill="#fde68a" opacity="0.58" /> : null}
              {section?.isRedacted ? <rect x={block.bounds.x - media.x} y={top} width={block.bounds.width} height={block.bounds.height} rx="2" fill="#050505" /> : null}
              {block.lines.map((line, lineIndex) => (
                <text
                  key={`${block.id}-${lineIndex}`}
                  x={block.x - media.x}
                  y={media.height - (block.baselines[lineIndex] - media.y)}
                  fontFamily={svgFontFamily(block.font)}
                  fontWeight={block.font === 'Helvetica-Bold' ? 700 : 400}
                  fontSize={block.fontSize}
                  fill={section?.isRedacted ? '#ffffff' : block.color || '#0f172a'}
                  style={annotationStyle(block)}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
        {layout.fixedText.map((item) => (
          <text
            key={item.id}
            data-pdf-fixed-text={item.kind}
            x={item.x - media.x}
            y={media.height - (item.baseline - media.y)}
            fontFamily={svgFontFamily(item.font)}
            fontWeight={item.font === 'Helvetica-Bold' ? 700 : 400}
            fontSize={item.fontSize}
            fill={item.color || '#64748b'}
            opacity={item.kind === 'watermark' ? 0.55 : 1}
          >
            {item.text}
          </text>
        ))}
      </svg>

      {editingBlock && editingSectionId ? (() => {
        const bounds = blockScreenBounds(editingBlock, media);
        const section = sectionById.get(editingSectionId);
        if (!section) return null;
        return (
          <textarea
            autoFocus
            value={section.content}
            onChange={(event) => onUpdateSectionContent?.(page.pageNumber, section.id, event.target.value)}
            onBlur={() => setEditingSectionId(null)}
            onKeyDown={(event) => { if (event.key === 'Escape') setEditingSectionId(null); }}
            className="absolute z-50 resize-none rounded border-2 border-blue-500 bg-white p-1 text-slate-950 shadow-xl outline-none"
            style={{ left: `${bounds.left}%`, top: `${bounds.top}%`, width: `${bounds.width}%`, minHeight: `${Math.max(3, bounds.height)}%`, fontSize: `${editingBlock.fontSize}px` }}
          />
        );
      })() : null}

      {editingTitle && titleBlock ? (() => {
        const bounds = blockScreenBounds(titleBlock, media);
        return (
          <input
            autoFocus
            type="text"
            value={page.title}
            onChange={(event) => onUpdatePageMeta?.(page.pageNumber, event.target.value, page.subtitle)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') setEditingTitle(false); }}
            className="absolute z-50 rounded border-2 border-blue-500 bg-white px-1 font-bold text-slate-950 shadow-xl outline-none"
            style={{ left: `${bounds.left}%`, top: `${bounds.top}%`, width: `${bounds.width}%`, height: `${Math.max(3, bounds.height)}%`, fontSize: `${titleBlock.fontSize}px` }}
          />
        );
      })() : null}
    </div>
  );
};
