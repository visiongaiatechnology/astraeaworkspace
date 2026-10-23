// STATUS: DIAMANT VGT SUPREME — deterministic slide transition and Morph engine
import type {
  PresentImageObject,
  PresentObjectGeometry,
  PresentSceneObject,
  PresentSlide,
  PresentSlideTransition,
  PresentTransitionDirection,
  PresentTransitionEffect,
  PresentTransitionSound,
} from '../../../../shared/contracts/workspace';

export interface PresentTransitionPreset {
  key: PresentTransitionEffect;
  label: string;
  defaultDirection?: PresentTransitionDirection;
}

export interface PresentTransitionLayerStyle {
  opacity?: number;
  transform?: string;
  clipPath?: string;
  zIndex: number;
}

export interface PresentTransitionFrame {
  outgoing: PresentTransitionLayerStyle;
  incoming: PresentTransitionLayerStyle;
}

export interface PresentMorphFrame {
  outgoing: PresentSlide;
  incoming: PresentSlide;
  matchedSceneKeys: string[];
  matchedImageKeys: string[];
}

export const PRESENT_TRANSITION_PRESETS: readonly PresentTransitionPreset[] = [
  { key: 'none', label: 'None' },
  { key: 'fade', label: 'Fade' },
  { key: 'push', label: 'Push', defaultDirection: 'left' },
  { key: 'wipe', label: 'Wipe', defaultDirection: 'left' },
  { key: 'split', label: 'Split', defaultDirection: 'vertical' },
  { key: 'reveal', label: 'Reveal', defaultDirection: 'left' },
  { key: 'cover', label: 'Cover', defaultDirection: 'left' },
  { key: 'uncover', label: 'Uncover', defaultDirection: 'left' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'morph', label: 'Morph' },
] as const;

const DIRECTIONS: readonly PresentTransitionDirection[] = ['left', 'right', 'up', 'down', 'horizontal', 'vertical'];
const SOUNDS: readonly PresentTransitionSound[] = ['none', 'click', 'chime', 'whoosh'];
const CANONICAL_EFFECTS: readonly PresentTransitionEffect[] = ['none', 'fade', 'push', 'wipe', 'split', 'reveal', 'cover', 'uncover', 'zoom', 'morph'];
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const ease = (progress: number): number => {
  const t = clamp(progress, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export const DEFAULT_PRESENT_TRANSITION: Readonly<PresentSlideTransition> = Object.freeze({
  effect: 'none',
  durationMs: 500,
  direction: 'left',
  sound: 'none',
  advanceOnClick: true,
  advanceAfterMs: null,
});

export function normalizePresentTransition(value?: PresentSlideTransition | null): PresentSlideTransition {
  if (!value) return { ...DEFAULT_PRESENT_TRANSITION };
  let effect: PresentTransitionEffect = value.effect;
  let direction: PresentTransitionDirection = DIRECTIONS.includes(value.direction as PresentTransitionDirection)
    ? (value.direction as PresentTransitionDirection)
    : 'left';
  if (effect === 'slide-left') { effect = 'push'; direction = 'left'; }
  if (effect === 'slide-right') { effect = 'push'; direction = 'right'; }
  if (effect === 'slide-up') { effect = 'push'; direction = 'up'; }
  if (effect === 'slide-down') { effect = 'push'; direction = 'down'; }
  if (!CANONICAL_EFFECTS.includes(effect)) effect = 'none';
  if (effect === 'split' && !['horizontal', 'vertical'].includes(direction)) direction = 'vertical';
  const sound = SOUNDS.includes(value.sound as PresentTransitionSound) ? (value.sound as PresentTransitionSound) : 'none';
  const auto = value.advanceAfterMs == null ? null : Math.round(clamp(value.advanceAfterMs, 250, 3_600_000));
  return {
    effect,
    durationMs: Math.round(clamp(value.durationMs, 50, 20_000)),
    direction,
    sound,
    advanceOnClick: value.advanceOnClick !== false,
    advanceAfterMs: auto,
  };
}

export function transitionDurationMs(value?: PresentSlideTransition | null): number {
  const normalized = normalizePresentTransition(value);
  return normalized.effect === 'none' ? 0 : normalized.durationMs;
}

function axisTranslate(direction: PresentTransitionDirection, amount: number): string {
  switch (direction) {
    case 'right': return `translate3d(${amount}%,0,0)`;
    case 'up': return `translate3d(0,${-amount}%,0)`;
    case 'down': return `translate3d(0,${amount}%,0)`;
    default: return `translate3d(${-amount}%,0,0)`;
  }
}

function incomingOffset(direction: PresentTransitionDirection, amount: number): string {
  switch (direction) {
    case 'right': return `translate3d(${-amount}%,0,0)`;
    case 'up': return `translate3d(0,${amount}%,0)`;
    case 'down': return `translate3d(0,${-amount}%,0)`;
    default: return `translate3d(${amount}%,0,0)`;
  }
}

function wipeClip(direction: PresentTransitionDirection, progress: number): string {
  const remaining = (1 - progress) * 100;
  if (direction === 'right') return `inset(0 ${remaining}% 0 0)`;
  if (direction === 'up') return `inset(0 0 ${remaining}% 0)`;
  if (direction === 'down') return `inset(${remaining}% 0 0 0)`;
  return `inset(0 0 0 ${remaining}%)`;
}

export function computePresentTransitionFrame(
  transitionInput: PresentSlideTransition | undefined,
  rawProgress: number,
): PresentTransitionFrame {
  const transition = normalizePresentTransition(transitionInput);
  const progress = ease(rawProgress);
  const inverse = 1 - progress;
  const direction = transition.direction || 'left';
  const base: PresentTransitionFrame = { outgoing: { zIndex: 1 }, incoming: { zIndex: 2 } };
  switch (transition.effect) {
    case 'none':
      return { outgoing: { opacity: 0, zIndex: 1 }, incoming: { opacity: 1, zIndex: 2 } };
    case 'fade':
    case 'morph':
      return { outgoing: { opacity: inverse, zIndex: 1 }, incoming: { opacity: progress, zIndex: 2 } };
    case 'push':
      return {
        outgoing: { transform: axisTranslate(direction, progress * 100), zIndex: 1 },
        incoming: { transform: incomingOffset(direction, inverse * 100), zIndex: 2 },
      };
    case 'wipe':
      return { outgoing: { zIndex: 1 }, incoming: { clipPath: wipeClip(direction, progress), zIndex: 2 } };
    case 'split': {
      const inset = inverse * 50;
      const clipPath = direction === 'horizontal'
        ? `inset(${inset}% 0 ${inset}% 0)`
        : `inset(0 ${inset}% 0 ${inset}%)`;
      return { outgoing: { zIndex: 1 }, incoming: { clipPath, zIndex: 2 } };
    }
    case 'reveal':
      return { outgoing: { transform: axisTranslate(direction, progress * 100), zIndex: 2 }, incoming: { zIndex: 1 } };
    case 'cover':
      return { outgoing: { zIndex: 1 }, incoming: { transform: incomingOffset(direction, inverse * 100), zIndex: 2 } };
    case 'uncover':
      return { outgoing: { transform: axisTranslate(direction, progress * 100), zIndex: 2 }, incoming: { zIndex: 1 } };
    case 'zoom':
      return {
        outgoing: { opacity: inverse, transform: `scale(${1 + progress * 0.12})`, zIndex: 1 },
        incoming: { opacity: progress, transform: `scale(${0.88 + progress * 0.12})`, zIndex: 2 },
      };
    default:
      return base;
  }
}

const morphKey = (object: { id: string; morphKey?: string }): string => String(object.morphKey || object.id).slice(0, 128);
const interpolate = (from: number | undefined, to: number | undefined, progress: number, fallback: number): number =>
  (from ?? fallback) + ((to ?? fallback) - (from ?? fallback)) * progress;

function interpolateGeometry<T extends PresentObjectGeometry & { id: string }>(from: T, to: T, progress: number): T {
  return {
    ...to,
    xPercent: interpolate(from.xPercent, to.xPercent, progress, 0),
    yPercent: interpolate(from.yPercent, to.yPercent, progress, 0),
    widthPercent: interpolate(from.widthPercent, to.widthPercent, progress, 10),
    heightPercent: interpolate(from.heightPercent, to.heightPercent, progress, 10),
    rotation: interpolate(from.rotation, to.rotation, progress, 0),
    opacity: interpolate(from.opacity, to.opacity, progress, 1),
    zIndex: progress < 0.5 ? (from.zIndex ?? 20) : (to.zIndex ?? 20),
    morphKey: morphKey(to),
  };
}

export function buildPresentMorphFrame(fromSlide: PresentSlide, toSlide: PresentSlide, rawProgress: number): PresentMorphFrame {
  const progress = ease(rawProgress);
  const fromScene = new Map((fromSlide.sceneObjects || []).map((object) => [morphKey(object), object]));
  const toSceneKeys = new Set((toSlide.sceneObjects || []).map(morphKey));
  const matchedSceneKeys: string[] = [];
  const incomingScene: PresentSceneObject[] = (toSlide.sceneObjects || []).map((toObject) => {
    const key = morphKey(toObject);
    const fromObject = fromScene.get(key);
    if (!fromObject || fromObject.kind !== toObject.kind) return { ...toObject, opacity: (toObject.opacity ?? 1) * progress } as PresentSceneObject;
    matchedSceneKeys.push(key);
    return interpolateGeometry(fromObject as PresentSceneObject, toObject, progress) as PresentSceneObject;
  });
  const outgoingScene = (fromSlide.sceneObjects || [])
    .filter((object) => !toSceneKeys.has(morphKey(object)))
    .map((object) => ({ ...object, opacity: (object.opacity ?? 1) * (1 - progress) } as PresentSceneObject));

  const fromImages = new Map((fromSlide.images || []).map((image) => [morphKey(image), image]));
  const toImageKeys = new Set((toSlide.images || []).map(morphKey));
  const matchedImageKeys: string[] = [];
  const incomingImages: PresentImageObject[] = (toSlide.images || []).map((toImage) => {
    const key = morphKey(toImage);
    const fromImage = fromImages.get(key);
    if (!fromImage) return { ...toImage, opacity: (toImage.opacity ?? 1) * progress };
    matchedImageKeys.push(key);
    return interpolateGeometry(fromImage, toImage, progress);
  });
  const outgoingImages = (fromSlide.images || [])
    .filter((image) => !toImageKeys.has(morphKey(image)))
    .map((image) => ({ ...image, opacity: (image.opacity ?? 1) * (1 - progress) }));

  return {
    outgoing: { ...fromSlide, sceneObjects: outgoingScene, images: outgoingImages },
    incoming: { ...toSlide, sceneObjects: incomingScene, images: incomingImages },
    matchedSceneKeys,
    matchedImageKeys,
  };
}

export function applyTransitionToSlides(slides: PresentSlide[], source: PresentSlideTransition): PresentSlide[] {
  const normalized = normalizePresentTransition(source);
  return slides.map((slide) => ({ ...slide, transition: { ...normalized } }));
}
