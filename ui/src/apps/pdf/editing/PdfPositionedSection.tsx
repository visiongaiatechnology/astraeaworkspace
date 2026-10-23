import React, { useMemo, useState } from 'react';
import type { PdfAnnotation, PdfPageBox, PdfSectionModel } from '../../../shared/contracts/workspace';
import type { ActiveTool } from '../studio/types';
import { layoutPositionedPdfSection } from './structuredPdfEditRendering';

interface PdfPositionedSectionProps {
  pageNumber: number;
  section: PdfSectionModel;
  mediaBox: PdfPageBox;
  annotations: PdfAnnotation[];
  searchQuery: string;
  activeTool: ActiveTool;
  onStageSectionRedaction: (pageNumber: number, section: PdfSectionModel) => void;
  onUpdateSectionContent?: (pageNumber: number, sectionId: string, newContent: string) => void;
}

const fontFamily = (font: string): string => font === 'Times-Roman'
  ? 'Times New Roman, Times, serif'
  : font === 'Courier'
    ? 'Courier New, Courier, monospace'
    : 'Arial, Helvetica, sans-serif';

export const PdfPositionedSection: React.FC<PdfPositionedSectionProps> = ({
  pageNumber,
  section,
  mediaBox,
  annotations,
  searchQuery,
  activeTool,
  onStageSectionRedaction,
  onUpdateSectionContent,
}) => {
  const [editing, setEditing] = useState(false);
  const layout = useMemo(() => layoutPositionedPdfSection(section), [section]);
  const bounds = section.bounds!;
  const related = annotations.filter((annotation) => annotation.page === pageNumber && (!annotation.sectionId || annotation.sectionId === section.id));
  const highlight = related.find((annotation) => annotation.type === 'highlight');
  const underline = related.find((annotation) => annotation.type === 'underline');
  const strike = related.find((annotation) => annotation.type === 'strike');
  const commentCount = related.filter((annotation) => annotation.type === 'comment').length;
  const searchMatch = Boolean(searchQuery.trim() && section.content.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <div
      data-pdf-page={pageNumber}
      data-pdf-section-id={section.id}
      data-pdf-positioned-layout="shared-structured-v1"
      className={`absolute overflow-hidden ${activeTool === 'redact' ? 'cursor-crosshair ring-1 ring-red-400/50' : 'cursor-text'}`}
      style={{
        left: `${((bounds.x - mediaBox.x) / mediaBox.width) * 100}%`,
        bottom: `${((bounds.y - mediaBox.y) / mediaBox.height) * 100}%`,
        width: `${(bounds.width / mediaBox.width) * 100}%`,
        height: `${(bounds.height / mediaBox.height) * 100}%`,
        zIndex: 10 + (section.zIndex ?? 0),
        backgroundColor: searchMatch ? 'rgba(253, 230, 138, 0.55)' : section.isRedacted ? '#050505' : 'transparent',
      }}
      onClick={() => { if (activeTool === 'redact') onStageSectionRedaction(pageNumber, section); }}
      // GAP-0055, Runde 296: die Schwaerzungs-Vormerkung war nur mit der Maus
      // zu treffen. `role` und `tabIndex` sind BEDINGT: nur im
      // Schwaerzungswerkzeug ist dieses Element ein Bedienelement, sonst ist es
      // eine Textflaeche, die nicht in der Tab-Reihenfolge liegen soll.
      role={activeTool === 'redact' ? 'button' : undefined}
      tabIndex={activeTool === 'redact' ? 0 : undefined}
      onKeyDown={(event) => {
        if (activeTool !== 'redact') return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onStageSectionRedaction(pageNumber, section);
        }
      }}
      onDoubleClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (activeTool !== 'select') return;
        event.stopPropagation();
        setEditing(true);
      }}
      title={activeTool === 'select' ? 'Double-click to edit positioned text' : undefined}
    >
      {editing ? (
        <textarea
          autoFocus
          value={section.content}
          onChange={(event) => onUpdateSectionContent?.(pageNumber, section.id, event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => { if (event.key === 'Escape') setEditing(false); }}
          className="h-full w-full resize-none border-2 border-blue-500 bg-white p-1 text-slate-950 outline-none"
          style={{ fontSize: `${layout.fontSize}px`, fontFamily: fontFamily(layout.font), lineHeight: layout.lineHeight }}
        />
      ) : (
        <svg className="h-full w-full select-text" viewBox={`0 0 ${bounds.width} ${bounds.height}`} preserveAspectRatio="none" role="img" aria-label={`Positioned PDF text ${section.id}`}>
          {layout.lines.map((line, index) => (
            <text
              key={`${section.id}-${index}`}
              x="0"
              y={bounds.y + bounds.height - layout.baselines[index]}
              fontFamily={fontFamily(layout.font)}
              fontWeight={layout.font === 'Helvetica-Bold' ? 700 : 400}
              fontSize={layout.fontSize}
              fill={section.isRedacted ? '#ffffff' : layout.color || '#0f172a'}
              style={{
                ...(highlight ? { paintOrder: 'stroke', stroke: highlight.color, strokeWidth: 5, strokeOpacity: 0.22 } : {}),
                ...(underline ? { textDecoration: 'underline', textDecorationColor: underline.color } : {}),
                ...(strike ? { textDecoration: 'line-through', textDecorationColor: strike.color } : {}),
              }}
            >
              {line}
            </text>
          ))}
        </svg>
      )}
      {commentCount > 0 ? <span className="pointer-events-none absolute right-0 top-0 rounded bg-amber-500 px-1 text-[0.5rem] font-bold text-black">{commentCount}</span> : null}
      {activeTool === 'redact' ? <span className="pointer-events-none absolute bottom-0 right-0 rounded bg-red-600/90 px-1 text-[0.5rem] font-mono text-white">Redact</span> : null}
    </div>
  );
};
