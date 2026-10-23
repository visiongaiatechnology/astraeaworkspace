// STATUS: DIAMANT VGT SUPREME — Pure list presentation and marker projection for Writer paragraphs
import React from 'react';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { WriterListTemplate } from '../../../../shared/contracts/writer/workspaceWriterList';
import {
  calculateHeadingOutlineNumber,
  calculateMultilevelListOrdinal,
  resolveWriterListBulletGlyph,
  resolveWriterListLevelGeometry,
} from '../../formatting/lists/writerMultilevelList';

export interface WriterParagraphListPresentation {
  listOrdinal: string;
  headingOrdinal: string;
  bulletGlyph: string;
  levelGeometry: ReturnType<typeof resolveWriterListLevelGeometry> | undefined;
}

export function resolveWriterParagraphListPresentation(
  paragraph: Paragraph,
  allParagraphs: Paragraph[],
  paragraphIndex: number,
  template?: WriterListTemplate,
): WriterParagraphListPresentation {
  const heading = paragraph.style.heading_level;

  return {
    listOrdinal: paragraph.style.list_style === 'number'
      ? calculateMultilevelListOrdinal(allParagraphs, paragraphIndex, template)
      : '',
    headingOrdinal: heading
      ? calculateHeadingOutlineNumber(allParagraphs, paragraphIndex, template)
      : '',
    bulletGlyph: resolveWriterListBulletGlyph(paragraph, paragraph.style.list_level ?? 0, template),
    levelGeometry: paragraph.style.list_style || paragraph.style.heading_outline_numbered
      ? resolveWriterListLevelGeometry(paragraph.style.list_level ?? 0, template)
      : undefined,
  };
}

interface WriterParagraphListMarkerProps {
  paragraph: Paragraph;
  presentation: WriterParagraphListPresentation;
  isFirstFragment: boolean;
  isLight: boolean;
  isRightToLeft: boolean;
  readOnly: boolean;
  /** WR-031: the rich-text surface positions the marker in its own gutter. */
  richText?: boolean;
}

export const WriterParagraphListMarker: React.FC<WriterParagraphListMarkerProps> = ({
  paragraph,
  presentation,
  isFirstFragment,
  isLight,
  isRightToLeft,
  readOnly,
  richText = false,
}) => {
  const heading = paragraph.style.heading_level;
  // WR-031: in the rich-text surface the marker sits inside the paragraph's own gutter.
  const markerSide = isRightToLeft
    ? (richText ? 'right-0' : 'right-3')
    : (richText ? 'left-0' : 'left-3');
  const markerTop = richText ? 'top-0' : 'top-2';

  if (!isFirstFragment) return null;

  if (paragraph.style.list_style === 'bullet' && !heading) {
    return (
      <span className={`absolute ${markerTop} ${markerSide} text-sm select-none ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
        {presentation.bulletGlyph}
      </span>
    );
  }

  if (paragraph.style.list_style === 'number' && !heading) {
    return (
      <span className={`absolute ${markerTop} ${markerSide} text-xs font-mono font-medium select-none ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
        {presentation.listOrdinal}
      </span>
    );
  }

  if (heading && presentation.headingOrdinal) {
    return (
      <span className={`absolute top-2 text-xs font-mono font-bold select-none ${isRightToLeft ? 'right-0.5' : 'left-0.5'} text-blue-400`}>
        {presentation.headingOrdinal}
      </span>
    );
  }

  if (paragraph.style.list_style === 'checklist' && !heading) {
    return (
      <input
        type="checkbox"
        disabled={readOnly}
        aria-label="Checklisteneintrag"
        className={`absolute top-2.5 rounded text-blue-600 w-3.5 h-3.5 cursor-pointer ${isRightToLeft ? 'right-2.5' : 'left-2.5'}`}
        defaultChecked={false}
      />
    );
  }

  return null;
};
