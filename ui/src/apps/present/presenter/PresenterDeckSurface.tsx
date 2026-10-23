// STATUS: DIAMANT VGT SUPREME — shared audience/presenter deck surface
import React from 'react';
import type { PresentAnimation, PresentDocumentModel, PresentInkStroke, PresentSlide, WorkspaceObject } from '../../../shared/contracts/workspace';
import { resolvePresentSlideDesign } from '../design/presentDesign';
import { PresenterSlideView } from './rendering/PresenterSlideView';
import { buildPresentMorphFrame, computePresentTransitionFrame, normalizePresentTransition } from './transitions/presentTransitionEngine';
import { presentLinkSummary, presentObjectLink, type PresentLinkTarget } from '../canvas/model/presentHyperlinks';

interface TransitionState { fromIdx: number; toIdx: number; progress: number; }

interface Props {
  slides: PresentSlide[];
  currentIdx: number;
  transitionState: TransitionState | null;
  presentData: PresentDocumentModel;
  embeddedObjects: WorkspaceObject[];
  activeAnimations: PresentAnimation[];
  animationProgressById: Record<string, number>;
  triggerObjectIds: ReadonlySet<string>;
  onTriggerObject: (targetId: string) => void;
  onAdvance: () => void;
  pointerTool: 'none' | 'laser' | 'pen' | 'highlighter' | 'eraser';
  laserPos: { xPercent: number; yPercent: number } | null;
  inkStrokes: PresentInkStroke[];
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  zoom: number;
  interactive?: boolean;
  /**
   * Activates a hyperlink on the current slide (Paket 28). Only rendered in interactive mode: the
   * audience window must never contain clickable hotspots for links the presenter has not reached.
   */
  onActivateLink?: (target: PresentLinkTarget) => void;
}

const noop = () => undefined;

export const PresenterDeckSurface: React.FC<Props> = ({
  slides, currentIdx, transitionState, presentData, embeddedObjects, activeAnimations,
  animationProgressById, triggerObjectIds, onTriggerObject, onAdvance, pointerTool,
  laserPos, inkStrokes, onPointerDown, onPointerMove, onPointerUp, zoom, interactive = true, onActivateLink,
}) => {
  const slide = slides[currentIdx] || slides[0];
  if (!slide) return null;
  // Link hotspots: positioned from the stored percent geometry, so they follow the object whatever
  // the zoom is. Only the visible links of the *current* slide exist.
  const linkHotspots = interactive && onActivateLink
    ? (slide.sceneObjects ?? []).flatMap((object) => {
        if (object.hidden) return [];
        const target = presentObjectLink(object);
        return target ? [{ object, target }] : [];
      })
    : [];
  const common = {
    totalSlides: slides.length,
    embeddedObjects,
    laserActive: pointerTool === 'laser',
    penActive: ['pen', 'highlighter', 'eraser'].includes(pointerTool),
    laserPos,
    inkStrokes,
  };

  const renderView = (targetSlide: PresentSlide, targetIdx: number, enabled: boolean, animations: PresentAnimation[], progress: Record<string, number>) => (
    <PresenterSlideView
      slide={targetSlide}
      design={resolvePresentSlideDesign(targetSlide, presentData)}
      currentIdx={targetIdx}
      {...common}
      animations={animations}
      animationProgressById={progress}
      triggerObjectIds={enabled ? triggerObjectIds : new Set<string>()}
      onTriggerObject={enabled ? onTriggerObject : noop}
      advancePresentation={enabled ? onAdvance : noop}
      onPointerDown={enabled ? onPointerDown : noop}
      onPointerMove={enabled ? onPointerMove : noop}
      onPointerUp={enabled ? onPointerUp : noop}
    />
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
      {transitionState ? (() => {
        const fromSlide = slides[transitionState.fromIdx];
        const toSlide = slides[transitionState.toIdx];
        if (!fromSlide || !toSlide) return renderView(slide, currentIdx, interactive, activeAnimations, animationProgressById);
        const transition = normalizePresentTransition(toSlide.transition);
        const frame = computePresentTransitionFrame(transition, transitionState.progress);
        const morph = transition.effect === 'morph' ? buildPresentMorphFrame(fromSlide, toSlide, transitionState.progress) : null;
        const outgoing = morph?.outgoing || fromSlide;
        const incoming = morph?.incoming || toSlide;
        return (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={frame.outgoing}>{renderView(outgoing, transitionState.fromIdx, false, [], {})}</div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={frame.incoming}>{renderView(incoming, transitionState.toIdx, false, [], {})}</div>
          </>
        );
      })() : renderView(slide, currentIdx, interactive, activeAnimations, animationProgressById)}
      {linkHotspots.map(({ object, target }) => (
        <button
          key={`link-${object.id}`}
          type="button"
          data-present-link-hotspot={object.id}
          aria-label={`Activate link on ${object.kind} object`}
          title={presentLinkSummary(target)}
          onClick={(event) => { event.stopPropagation(); onActivateLink?.(target); }}
          className="absolute z-40 cursor-pointer rounded ring-2 ring-transparent hover:ring-cyan-400/70 focus-visible:ring-cyan-400"
          style={{
            left: `${object.xPercent}%`,
            top: `${object.yPercent}%`,
            width: `${object.widthPercent}%`,
            height: `${object.heightPercent}%`,
          }}
        />
      ))}
    </div>
  );
};
