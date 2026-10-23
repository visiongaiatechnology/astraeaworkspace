// STATUS: PLATIN — Present M1 (PR-007): live preview while a freeform shape is drawn.
//
// The overlay only *renders* a `PresentShapeDrawing`; it computes nothing. Both the preview and the
// committed object go through `presentShapeDragDrawing`, so what the user sees during the drag is
// exactly the geometry that lands in the document on pointer-up (no "snap after commit" surprise).
import React from 'react';
import type { PresentShapeSceneObject } from '../../../../shared/contracts/workspace';
import type { PresentShapeDrawing } from '../model/presentScene';

interface PresentShapeDrawOverlayProps {
  shape: PresentShapeSceneObject['shape'];
  drawing: PresentShapeDrawing;
}

export const PresentShapeDrawOverlay: React.FC<PresentShapeDrawOverlayProps> = ({ shape, drawing }) => {
  const isLine = shape === 'line';
  const shapeClass = isLine
    ? 'rounded-full border border-cyan-200/80 bg-cyan-300/80'
    : shape === 'ellipse'
      ? 'rounded-full border-2 border-dashed border-cyan-300 bg-cyan-400/20'
      : 'rounded-sm border-2 border-dashed border-cyan-300 bg-cyan-400/20';
  return (
    <div
      data-present-shape-draft="true"
      data-present-shape-draft-kind={shape}
      aria-hidden="true"
      className={`pointer-events-none absolute z-40 ${shapeClass}`}
      style={{
        left: `${drawing.rect.xPercent}%`,
        top: `${drawing.rect.yPercent}%`,
        width: `${drawing.rect.widthPercent}%`,
        height: `${drawing.rect.heightPercent}%`,
        transform: drawing.rotationDeg ? `rotate(${drawing.rotationDeg}deg)` : undefined,
      }}
    />
  );
};
