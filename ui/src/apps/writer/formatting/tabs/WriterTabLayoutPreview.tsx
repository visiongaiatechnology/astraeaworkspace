// STATUS: DIAMANT VGT SUPREME — WYSIWYG tab alignment and leader preview
import React, { type CSSProperties } from 'react';
import type { WriterTabStop } from '../../../../shared/contracts/workspace';
import { layoutWriterTabbedLine } from './writerTabStops';

interface WriterTabLayoutPreviewProps {
  text: string;
  tabStops: WriterTabStop[] | undefined;
  style?: CSSProperties;
}

const segmentTransform = (alignment: 'left' | 'right' | 'center' | 'decimal'): string | undefined =>
  alignment === 'right' ? 'translateX(-100%)' : alignment === 'center' ? 'translateX(-50%)' : undefined;

export const WriterTabLayoutPreview: React.FC<WriterTabLayoutPreviewProps> = ({ text, tabStops, style }) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 py-1 whitespace-pre-wrap overflow-hidden" style={style}>
    {text.split(/\r?\n/u).map((line, lineIndex) => {
      const segments = layoutWriterTabbedLine(line, tabStops);
      return (
        <div key={`${lineIndex}-${line.length}`} className="relative min-h-[1em]">
          {segments.map((segment, segmentIndex) => {
            if (segmentIndex === 0) return <span key="initial">{segment.text}</span>;
            const previousPosition = segments[segmentIndex - 1]?.positionMm ?? 0;
            const leaderWidth = Math.max(0, segment.positionMm - previousPosition - 2);
            const separatorIndex = segment.alignment === 'decimal'
              ? segment.text.indexOf(segment.decimalCharacter)
              : -1;
            const beforeDecimal = separatorIndex >= 0 ? segment.text.slice(0, separatorIndex) : segment.text;
            const afterDecimal = separatorIndex >= 0 ? segment.text.slice(separatorIndex) : '';
            return (
              <React.Fragment key={`${segmentIndex}-${segment.positionMm}`}>
                {segment.leader !== 'none' && (
                  <span className="absolute bottom-[0.2em] opacity-60"
                    style={{
                      left: `${previousPosition + 1}mm`, width: `${leaderWidth}mm`,
                      borderBottom: `1px ${segment.leader === 'dots' ? 'dotted' : segment.leader === 'dashes' ? 'dashed' : 'solid'} currentColor`,
                    }} />
                )}
                {segment.alignment === 'decimal' ? (
                  <span className="absolute whitespace-pre" style={{ left: `${segment.positionMm}mm` }}>
                    <span className="absolute right-0 whitespace-pre">{beforeDecimal}</span>
                    <span className="absolute left-0 whitespace-pre">{afterDecimal}</span>
                  </span>
                ) : (
                  <span className="absolute whitespace-pre" style={{ left: `${segment.positionMm}mm`, transform: segmentTransform(segment.alignment) }}>
                    {segment.text}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      );
    })}
  </div>
);
