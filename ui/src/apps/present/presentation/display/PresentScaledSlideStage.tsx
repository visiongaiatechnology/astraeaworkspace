// STATUS: PLATIN — projector- and presenter-safe slide stage.
//
// The existing presenter surfaces render the slide at a fixed 1024×576 canvas. A projector window
// must fill the screen without re-implementing the slide renderer, so the same `PresenterDeckSurface`
// is laid out at design size inside a 16:9 box and scaled to fit the window, letterboxed on black.
import React, { useEffect, useRef, useState } from 'react';
import type {
  PresentAnimation,
  PresentDocumentModel,
  PresentInkStroke,
  PresentSlide,
  WorkspaceObject,
} from '../../../../shared/contracts/workspace';
import { PresenterDeckSurface } from '../../presenter/PresenterDeckSurface';
import type { PresentDisplayTransitionState } from './runtime/usePresentDisplayRuntime';

export const PRESENT_DISPLAY_STAGE_WIDTH = 1024;
export const PRESENT_DISPLAY_STAGE_HEIGHT = 576;

const EMPTY_TRIGGER_IDS: ReadonlySet<string> = new Set<string>();
const EMPTY_INK_STROKES: PresentInkStroke[] = [];
const noop = (): void => undefined;

export interface PresentScaledSlideStageProps {
  readonly slides: PresentSlide[];
  readonly presentData: PresentDocumentModel;
  readonly embeddedObjects: WorkspaceObject[];
  readonly currentIdx: number;
  readonly transitionState: PresentDisplayTransitionState | null;
  readonly activeAnimations: PresentAnimation[];
  readonly animationProgressById: Record<string, number>;
  readonly interactive?: boolean;
  readonly onAdvance?: () => void;
  readonly className?: string;
  readonly testId?: string;
}

export const PresentScaledSlideStage: React.FC<PresentScaledSlideStageProps> = ({
  slides,
  presentData,
  embeddedObjects,
  currentIdx,
  transitionState,
  activeAnimations,
  animationProgressById,
  interactive = false,
  onAdvance,
  className = '',
  testId,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const measure = () => {
      const width = element.clientWidth > 0 ? element.clientWidth : element.getBoundingClientRect().width;
      const height = element.clientHeight > 0 ? element.clientHeight : element.getBoundingClientRect().height;
      if (width <= 0 || height <= 0) return;
      const next = Math.min(width / PRESENT_DISPLAY_STAGE_WIDTH, height / PRESENT_DISPLAY_STAGE_HEIGHT);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div
      ref={containerRef}
      data-present-slide-stage="true"
      data-present-stage-scale={scale.toFixed(3)}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-black ${className}`}
    >
      <div
        style={{
          width: PRESENT_DISPLAY_STAGE_WIDTH,
          height: PRESENT_DISPLAY_STAGE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        data-present-slide-surface={testId ?? 'current'}
      >
        <PresenterDeckSurface
          slides={slides}
          currentIdx={currentIdx}
          transitionState={transitionState}
          presentData={presentData}
          embeddedObjects={embeddedObjects}
          activeAnimations={activeAnimations}
          animationProgressById={animationProgressById}
          triggerObjectIds={EMPTY_TRIGGER_IDS}
          onTriggerObject={noop}
          onAdvance={interactive ? (onAdvance ?? noop) : noop}
          pointerTool="none"
          laserPos={null}
          inkStrokes={EMPTY_INK_STROKES}
          onPointerDown={noop}
          onPointerMove={noop}
          onPointerUp={noop}
          zoom={1}
          interactive={interactive}
        />
      </div>
    </div>
  );
};
