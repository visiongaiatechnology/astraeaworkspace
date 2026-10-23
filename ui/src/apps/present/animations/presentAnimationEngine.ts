// STATUS: DIAMANT VGT SUPREME — Deterministic Present animation engine
import type {
  PresentAnimation,
  PresentAnimationCategory,
  PresentAnimationEffect,
  PresentAnimationMotionPoint,
} from '../../../shared/contracts/workspace';

export interface PresentAnimationPreset {
  id: string;
  label: string;
  category: PresentAnimationCategory;
  effect: PresentAnimationEffect;
  durationMs: number;
  rewind?: boolean;
}

export interface PresentAnimationScheduleEntry {
  animationId: string;
  startMs: number;
  endMs: number;
}

export interface PresentAnimationPlaybackGroup {
  id: string;
  trigger: 'auto' | 'click';
  entries: PresentAnimationScheduleEntry[];
}

export interface PresentAnimationPreviewState {
  elapsedMs: number;
  animationIds: string[];
  progressByAnimationId: Record<string, number>;
}

export const PRESENT_ANIMATION_PRESETS: readonly PresentAnimationPreset[] = [
  { id: 'entrance-fade', label: 'Entrance · Fade', category: 'entrance', effect: 'fade-in', durationMs: 450 },
  { id: 'entrance-zoom', label: 'Entrance · Zoom', category: 'entrance', effect: 'zoom-in', durationMs: 500 },
  { id: 'entrance-left', label: 'Entrance · Fly Left', category: 'entrance', effect: 'fly-in-left', durationMs: 550 },
  { id: 'emphasis-pulse', label: 'Emphasis · Pulse', category: 'emphasis', effect: 'pulse', durationMs: 420, rewind: true },
  { id: 'emphasis-spin', label: 'Emphasis · Spin', category: 'emphasis', effect: 'spin', durationMs: 620, rewind: true },
  { id: 'exit-fade', label: 'Exit · Fade', category: 'exit', effect: 'fade-out', durationMs: 450 },
  { id: 'exit-fly', label: 'Exit · Fly Out', category: 'exit', effect: 'fly-out', durationMs: 520 },
  { id: 'motion-path', label: 'Motion · Path', category: 'motion', effect: 'motion-path', durationMs: 850 },
] as const;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function inferAnimationCategory(effect: PresentAnimationEffect): PresentAnimationCategory {
  if (['pulse', 'spin', 'grow-shrink'].includes(effect)) return 'emphasis';
  if (['fade-out', 'fly-out'].includes(effect)) return 'exit';
  if (effect === 'motion-path') return 'motion';
  return 'entrance';
}

const ANIMATION_EFFECTS: readonly PresentAnimationEffect[] = [
  'none', 'fade', 'zoom', 'fly-in', 'appear', 'fade-in', 'zoom-in', 'fly-in-left', 'fly-in-right',
  'pulse', 'spin', 'grow-shrink', 'fade-out', 'fly-out', 'motion-path',
];
const ANIMATION_TRIGGERS: readonly PresentAnimation['trigger'][] = ['on-click', 'with-previous', 'after-previous', 'object-trigger'];
const ANIMATION_SCOPES: readonly NonNullable<PresentAnimation['scope']>[] = ['object', 'paragraph', 'series', 'category'];

export function normalizePresentAnimation(animation: PresentAnimation): PresentAnimation {
  const effect = ANIMATION_EFFECTS.includes(animation.effect) ? animation.effect : 'fade-in';
  const category = inferAnimationCategory(effect);
  const trigger = ANIMATION_TRIGGERS.includes(animation.trigger) ? animation.trigger : 'on-click';
  const scope = animation.scope && ANIMATION_SCOPES.includes(animation.scope) ? animation.scope : 'object';
  const motionPath: PresentAnimationMotionPoint[] = (Array.isArray(animation.motionPath) ? animation.motionPath : [])
    .slice(0, 16)
    .map((point) => ({ xPercent: clamp(point.xPercent, -200, 200), yPercent: clamp(point.yPercent, -200, 200) }));
  return {
    ...animation,
    id: String(animation.id || 'animation').slice(0, 128),
    targetId: String(animation.targetId || 'slide-title').slice(0, 128),
    category,
    effect,
    trigger,
    durationMs: Math.round(clamp(animation.durationMs, 50, 60_000)),
    delayMs: Math.round(clamp(animation.delayMs, 0, 60_000)),
    repeatCount: Math.round(clamp(animation.repeatCount ?? 1, 1, 20)),
    rewind: Boolean(animation.rewind),
    scope,
    scopeIndex: Math.min(999, Math.max(0, Math.trunc(animation.scopeIndex ?? 0))),
    triggerObjectId: trigger === 'object-trigger' ? String(animation.triggerObjectId || '').slice(0, 128) : undefined,
    motionPath: category === 'motion' ? (motionPath.length >= 2 ? motionPath : [{ xPercent: 0, yPercent: 0 }, { xPercent: 18, yPercent: 0 }]) : undefined,
    presetId: animation.presetId ? String(animation.presetId).slice(0, 128) : undefined,
  };
}

export function createPresentAnimation(targetId: string, presetId = 'entrance-fade', sequence = 0): PresentAnimation {
  const preset = PRESENT_ANIMATION_PRESETS.find((candidate) => candidate.id === presetId) || PRESENT_ANIMATION_PRESETS[0];
  return normalizePresentAnimation({
    id: `anim-${targetId}-${Date.now()}-${sequence}`,
    targetId,
    category: preset.category,
    effect: preset.effect,
    trigger: 'on-click',
    durationMs: preset.durationMs,
    delayMs: 0,
    repeatCount: 1,
    rewind: Boolean(preset.rewind),
    scope: 'object',
    motionPath: preset.category === 'motion' ? [{ xPercent: 0, yPercent: 0 }, { xPercent: 18, yPercent: 0 }] : undefined,
    presetId: preset.id,
  });
}

export function buildAnimationPlaybackGroups(animations: PresentAnimation[]): PresentAnimationPlaybackGroup[] {
  const normalized = animations.map(normalizePresentAnimation).filter((animation) => animation.effect !== 'none');
  const groups: PresentAnimationPlaybackGroup[] = [];
  let current: PresentAnimationPlaybackGroup | null = null;
  let previousStart = 0;
  let sequenceCursor = 0;

  const createGroup = (trigger: 'auto' | 'click'): PresentAnimationPlaybackGroup => {
    const group: PresentAnimationPlaybackGroup = { id: `playback-${groups.length}`, trigger, entries: [] };
    groups.push(group);
    previousStart = 0;
    sequenceCursor = 0;
    return group;
  };

  for (const animation of normalized) {
    if (animation.trigger === 'object-trigger') continue;
    if (animation.trigger === 'on-click') current = createGroup('click');
    else if (!current) current = createGroup('auto');

    const startMs = animation.trigger === 'with-previous'
      ? previousStart + animation.delayMs
      : animation.trigger === 'on-click'
        ? animation.delayMs
        : sequenceCursor + animation.delayMs;
    const endMs = startMs + animation.durationMs * (animation.repeatCount || 1);
    current.entries.push({ animationId: animation.id, startMs, endMs });
    previousStart = startMs;
    sequenceCursor = Math.max(sequenceCursor, endMs);
  }

  return groups;
}

export function buildAutomaticAnimationSchedule(animations: PresentAnimation[]): PresentAnimationScheduleEntry[] {
  return buildAnimationPlaybackGroups(animations)
    .filter((group) => group.trigger === 'auto')
    .flatMap((group) => group.entries);
}

export function animationTimelineDuration(animations: PresentAnimation[]): number {
  return buildAutomaticAnimationSchedule(animations).reduce((max, entry) => Math.max(max, entry.endMs), 0);
}

export function evaluateAnimationTimeline(animations: PresentAnimation[], elapsedMs: number): PresentAnimationPreviewState {
  const time = Math.max(0, elapsedMs);
  const progressByAnimationId: Record<string, number> = {};
  for (const entry of buildAutomaticAnimationSchedule(animations)) {
    const animation = normalizePresentAnimation(animations.find((item) => item.id === entry.animationId)!);
    progressByAnimationId[entry.animationId] = animationProgressForElapsed(animation, time - entry.startMs);
  }
  return { elapsedMs: time, animationIds: animations.filter((animation) => animation.effect !== 'none').map((animation) => animation.id), progressByAnimationId };
}

export function animationStyleForProgress(animation: PresentAnimation, progress: number): Record<string, string | number> {
  const a = normalizePresentAnimation(animation);
  const p = clamp(progress, 0, 1);
  const entranceOpacity = p;
  const exitOpacity = 1 - p;
  switch (a.effect) {
    case 'appear': return { opacity: p > 0 ? 1 : 0 };
    case 'fade':
    case 'fade-in': return { opacity: entranceOpacity };
    case 'zoom':
    case 'zoom-in': return { opacity: entranceOpacity, transform: `scale(${0.82 + p * 0.18})` };
    case 'fly-in': return { opacity: entranceOpacity, transform: `translateY(${(1 - p) * 24}px)` };
    case 'fly-in-left': return { opacity: entranceOpacity, transform: `translateX(${(1 - p) * -36}px)` };
    case 'fly-in-right': return { opacity: entranceOpacity, transform: `translateX(${(1 - p) * 36}px)` };
    case 'pulse': return { transform: `scale(${1 + Math.sin(p * Math.PI) * 0.08})` };
    case 'spin': return { transform: `rotate(${p * 360}deg)` };
    case 'grow-shrink': return { transform: `scale(${1 + Math.sin(p * Math.PI * 2) * 0.12})` };
    case 'fade-out': return { opacity: exitOpacity };
    case 'fly-out': return { opacity: exitOpacity, transform: `translateY(${p * -30}px)` };
    case 'motion-path': {
      const points = a.motionPath || [{ xPercent: 0, yPercent: 0 }, { xPercent: 18, yPercent: 0 }];
      const scaled = p * (points.length - 1);
      const index = Math.min(points.length - 2, Math.floor(scaled));
      const local = scaled - index;
      const from = points[index];
      const to = points[index + 1];
      const x = from.xPercent + (to.xPercent - from.xPercent) * local;
      const y = from.yPercent + (to.yPercent - from.yPercent) * local;
      return { transform: `translate(${x}%, ${y}%)` };
    }
    default: return {};
  }
}

export function reorderPresentAnimations(animations: PresentAnimation[], id: string, direction: -1 | 1): PresentAnimation[] {
  const index = animations.findIndex((animation) => animation.id === id);
  if (index < 0) return animations;
  const target = index + direction;
  if (target < 0 || target >= animations.length) return animations;
  const next = [...animations];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function animationProgressForElapsed(animation: PresentAnimation, elapsedMs: number): number {
  const normalized = normalizePresentAnimation(animation);
  if (elapsedMs <= 0) return 0;
  const repeats = normalized.repeatCount || 1;
  const totalDuration = normalized.durationMs * repeats;
  if (elapsedMs >= totalDuration) return normalized.rewind ? 0 : 1;
  const cycleElapsed = elapsedMs % normalized.durationMs;
  return clamp(cycleElapsed / normalized.durationMs, 0, 1);
}

function animationMatchesScope(
  animation: PresentAnimation,
  targetId: string,
  scope: PresentAnimation['scope'],
  scopeIndex = 0
): boolean {
  const normalized = normalizePresentAnimation(animation);
  const normalizedScope = normalized.scope || 'object';
  return normalized.targetId === targetId
    && normalized.effect !== 'none'
    && normalizedScope === (scope || 'object')
    && (normalizedScope === 'object' || (normalized.scopeIndex || 0) === scopeIndex);
}

export function composeScopedAnimationStyle(
  animations: PresentAnimation[],
  targetId: string,
  scope: PresentAnimation['scope'],
  scopeIndex: number,
  progressByAnimationId: Record<string, number>
): Record<string, string | number> {
  let opacity: number | undefined;
  const transforms: string[] = [];
  for (const animation of animations) {
    if (!animationMatchesScope(animation, targetId, scope, scopeIndex)) continue;
    const progress = progressByAnimationId[animation.id] ?? 0;
    const style = animationStyleForProgress(animation, progress);
    if (typeof style.opacity === 'number') opacity = style.opacity;
    if (typeof style.transform === 'string' && style.transform && style.transform !== 'none') transforms.push(style.transform);
  }
  const result: Record<string, string | number> = {};
  if (opacity !== undefined) result.opacity = opacity;
  if (transforms.length) result.transform = transforms.join(' ');
  return result;
}

export function composeTargetAnimationStyle(
  animations: PresentAnimation[],
  targetId: string,
  progressByAnimationId: Record<string, number>
): Record<string, string | number> {
  return composeScopedAnimationStyle(animations, targetId, 'object', 0, progressByAnimationId);
}

export function scopedAnimationVisibilityFactor(
  animations: PresentAnimation[],
  targetId: string,
  scope: PresentAnimation['scope'],
  scopeIndex: number,
  progressByAnimationId: Record<string, number>
): number {
  const scoped = animations.filter((animation) => animationMatchesScope(animation, targetId, scope, scopeIndex));
  if (!scoped.length) return 1;
  let factor = 1;
  for (const animation of scoped) {
    const normalized = normalizePresentAnimation(animation);
    const progress = clamp(progressByAnimationId[animation.id] ?? 0, 0, 1);
    if (normalized.category === 'entrance') factor *= progress;
    else if (normalized.category === 'exit') factor *= 1 - progress;
  }
  return clamp(factor, 0, 1);
}

export function buildPreviewAnimationSchedule(animations: PresentAnimation[]): PresentAnimationScheduleEntry[] {
  const normalized = animations.map(normalizePresentAnimation).filter((animation) => animation.effect !== 'none');
  const scheduled: PresentAnimationScheduleEntry[] = [];
  let previousStart = 0;
  let sequenceCursor = 0;
  for (const animation of normalized) {
    const startMs = animation.trigger === 'with-previous' ? previousStart + animation.delayMs : sequenceCursor + animation.delayMs;
    const endMs = startMs + animation.durationMs * (animation.repeatCount || 1);
    scheduled.push({ animationId: animation.id, startMs, endMs });
    previousStart = startMs;
    sequenceCursor = Math.max(sequenceCursor, endMs);
  }
  return scheduled;
}

export function previewAnimationDuration(animations: PresentAnimation[]): number {
  return buildPreviewAnimationSchedule(animations).reduce((max, entry) => Math.max(max, entry.endMs), 0);
}

export function evaluatePreviewAnimationsAtTime(animations: PresentAnimation[], elapsedMs: number): PresentAnimationPreviewState {
  const time = Math.max(0, elapsedMs);
  const progressByAnimationId: Record<string, number> = {};
  for (const entry of buildPreviewAnimationSchedule(animations)) {
    const animation = normalizePresentAnimation(animations.find((item) => item.id === entry.animationId)!);
    progressByAnimationId[entry.animationId] = animationProgressForElapsed(animation, time - entry.startMs);
  }
  return { elapsedMs: time, animationIds: animations.filter((animation) => animation.effect !== 'none').map((animation) => animation.id), progressByAnimationId };
}
