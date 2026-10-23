// STATUS: DIAMANT VGT SUPREME
// Visual projection of canonical review annotations onto the structured PDF page.

import React from 'react';
import type { PdfAnnotation } from '../../../../shared/contracts/workspace';

interface PdfReviewOverlayProps {
  annotations: PdfAnnotation[];
}

function cssBounds(annotation: PdfAnnotation): React.CSSProperties {
  const bounds = annotation.bounds ?? { x: 0.72, y: 0.12, width: 0.2, height: 0.08 };
  return {
    left: `${bounds.x * 100}%`,
    top: `${bounds.y * 100}%`,
    width: `${bounds.width * 100}%`,
    height: `${bounds.height * 100}%`,
  };
}

function shapeNode(annotation: PdfAnnotation): React.ReactElement | null {
  const color = annotation.color || '#38bdf8';
  if (annotation.shapeKind === 'ellipse') return <ellipse cx="50" cy="50" rx="46" ry="42" fill="none" stroke={color} strokeWidth="3" />;
  if (annotation.shapeKind === 'line') return <line x1="4" y1="50" x2="96" y2="50" stroke={color} strokeWidth="3" />;
  if (annotation.shapeKind === 'arrow') return <><line x1="4" y1="50" x2="88" y2="50" stroke={color} strokeWidth="3" /><polyline points="78,38 94,50 78,62" fill="none" stroke={color} strokeWidth="3" /></>;
  return <rect x="4" y="6" width="92" height="88" rx="3" fill="none" stroke={color} strokeWidth="3" />;
}

export const PdfReviewOverlay: React.FC<PdfReviewOverlayProps> = ({ annotations }) => (
  <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden" aria-hidden="true">
    {annotations.map((annotation) => {
      if (annotation.type === 'ink' && annotation.points && annotation.points.length > 1) {
        return (
          <svg key={annotation.id} className="absolute inset-0 w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <polyline fill="none" stroke={annotation.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={annotation.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ')} />
          </svg>
        );
      }
      if (annotation.type === 'shape') {
        return <svg key={annotation.id} className="absolute" style={cssBounds(annotation)} viewBox="0 0 100 100" preserveAspectRatio="none">{shapeNode(annotation)}</svg>;
      }
      if (annotation.type === 'stamp') {
        return <div key={annotation.id} className="absolute flex items-center justify-center border-2 rounded px-2 text-[0.6875rem] font-black uppercase tracking-wider bg-white/75" style={{ ...cssBounds(annotation), borderColor: annotation.color, color: annotation.color }}>{annotation.stampLabel || 'STAMP'}</div>;
      }
      if (annotation.type === 'text-box' || annotation.type === 'callout') {
        return <div key={annotation.id} className={`absolute rounded border p-2 text-[0.625rem] leading-tight bg-white/90 shadow-sm ${annotation.type === 'callout' ? 'border-l-4' : ''}`} style={{ ...cssBounds(annotation), borderColor: annotation.color, color: '#0f172a' }}>{annotation.text}</div>;
      }
      if (annotation.type === 'text-insert' || annotation.type === 'text-replace') {
        return <div key={annotation.id} className="absolute rounded border bg-white/90 p-1.5 text-[0.5625rem] shadow-sm" style={{ ...cssBounds(annotation), borderColor: annotation.color, color: '#0f172a' }}><strong style={{ color: annotation.color }}>{annotation.type === 'text-insert' ? 'INSERT' : 'REPLACE'}</strong>{annotation.targetText ? <div className="truncate">Target: {annotation.targetText}</div> : null}{annotation.replacementText ? <div className="truncate">With: {annotation.replacementText}</div> : null}</div>;
      }
      if (annotation.type === 'file-attachment' && annotation.attachment) {
        return <div key={annotation.id} className="absolute rounded border bg-amber-50/95 p-1.5 text-[0.5625rem] text-amber-950 shadow-sm" style={{ ...cssBounds(annotation), borderColor: annotation.color }}><strong>ATTACHMENT</strong><div className="truncate">{annotation.attachment.fileName}</div></div>;
      }
      if (annotation.type === 'measurement' && annotation.measurement) {
        return <div key={annotation.id} className="absolute flex items-center justify-center border-t-2 text-[0.5625rem] font-semibold bg-white/80" style={{ ...cssBounds(annotation), borderColor: annotation.color, color: annotation.color }}>{annotation.measurement.value} {annotation.measurement.unit}{annotation.measurement.scaleLabel ? ` · ${annotation.measurement.scaleLabel}` : ''}</div>;
      }
      return null;
    })}
  </div>
);
