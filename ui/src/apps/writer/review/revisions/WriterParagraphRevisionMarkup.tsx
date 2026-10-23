// STATUS: DIAMANT VGT SUPREME — Sovereign Paragraph Revision Markup Renderer
import React from 'react';
import type { ReviewMode, ReviewerFilter, TrackChangeRevision } from '../../types';
import { computeDiffSegments } from './track-changes/writerTrackChangesEngine';

export interface WriterParagraphRevisionMarkupProps {
  paragraphId: string;
  currentText: string;
  revisions: readonly TrackChangeRevision[];
  reviewMode: ReviewMode;
  reviewerFilter?: ReviewerFilter;
}

export const WriterParagraphRevisionMarkup: React.FC<WriterParagraphRevisionMarkupProps> = ({
  paragraphId,
  currentText,
  revisions,
  reviewMode,
  reviewerFilter = 'all',
}) => {
  // Find pending revisions for this paragraph
  const matchingRevisions = revisions.filter(
    (r) =>
      r.paragraphId === paragraphId &&
      r.status === 'pending' &&
      (reviewerFilter === 'all' || r.author === reviewerFilter)
  );

  if (matchingRevisions.length === 0 || reviewMode === 'none') {
    return <span className="select-text">{currentText}</span>;
  }

  const latestRev = matchingRevisions[matchingRevisions.length - 1];

  // Mode: Original
  if (reviewMode === 'original') {
    const orig = latestRev.originalText !== undefined ? latestRev.originalText : currentText;
    return <span className="select-text">{orig}</span>;
  }

  // Mode: Simple Markup
  if (reviewMode === 'simple') {
    return (
      <div className="relative group">
        <div
          className="absolute -left-3 top-0 bottom-0 w-1 rounded-full bg-rose-500 shadow-sm"
          title={`Geändert von ${latestRev.author}`}
        />
        <span className="select-text">{currentText}</span>
      </div>
    );
  }

  // Mode: All Markup
  const original = latestRev.originalText || '';
  const diffSegments = computeDiffSegments(original, currentText);

  return (
    <span className="select-text inline-flex flex-wrap items-baseline gap-0.5">
      {diffSegments.map((seg, idx) => {
        if (seg.type === 'equal') {
          return <span key={idx}>{seg.text}</span>;
        }
        if (seg.type === 'insert') {
          return (
            <span
              key={idx}
              className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500 decoration-2 font-medium px-0.5 rounded cursor-help"
              title={`Eingefügt von ${latestRev.author}`}
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === 'delete') {
          return (
            <span
              key={idx}
              className="bg-rose-500/15 text-rose-600 dark:text-rose-400 line-through decoration-rose-500 decoration-2 font-medium opacity-75 px-0.5 rounded cursor-help"
              title={`Gelöscht von ${latestRev.author}`}
            >
              {seg.text}
            </span>
          );
        }
        return null;
      })}
    </span>
  );
};
