// STATUS: DIAMANT VGT SUPREME — the timeline arithmetic behind the debug step view.
//
// MEASURED FACTS this module encodes (see BATCH-AUTOMATE/INVENTORY.md):
//  - A run already carries everything the debug view needs (`FlowExecutionStep`: nodeId, nodeTitle,
//    status, startedAt, endedAt, durationMs, branch, safeMessage, redactedInput/redactedOutput), but the
//    run drawer rendered only a flat list of step messages. There was no node step view, no in/out and
//    no timeline (AST-1776).
//  - No timeline arithmetic existed anywhere, so AST-1777 had no type contract to satisfy.
//
// One definition per fact: the durations and offsets are computed HERE and nowhere else. The panel only
// renders what this returns, so the text and the bar geometry can never disagree.
//
// Every number is guarded: a run whose steps carry a zero or non-finite duration must still render. The
// total is never used as a divisor without a fallback, because a division by zero would make the whole
// debug view throw — the opposite of "verständlich rendern".
import type { FlowExecutionRun, FlowExecutionStep, FlowRunStatus } from '../model/types';

export class AutomateTimelineError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AutomateTimelineError';
  }
}

/** A step placed on the timeline, with its own share of the run. */
export interface TimelineSegment {
  readonly index: number;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly status: FlowRunStatus;
  /** Milliseconds from the first step's start. Never negative. */
  readonly offsetMs: number;
  readonly durationMs: number;
  /** 0…100 share of the total. A zero-length step reports 0, never NaN. */
  readonly percent: number;
}

export interface AutomateTimeline {
  readonly steps: readonly TimelineSegment[];
  /** Sum of the step durations. 0 for a run whose steps measured nothing. */
  readonly totalMs: number;
  /** Wall-clock span of the run, from its own start/end. Falls back to `totalMs`. */
  readonly spanMs: number;
  /** True when no step measured a positive duration — the view must not draw a proportional bar. */
  readonly degenerate: boolean;
}

/** A finite, non-negative number, or 0. The only place a raw duration is trusted. */
function ms(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Compute the timeline of one run.
 *
 * Offsets are relative to the earliest step start, so a run with a large absolute `startedAt` still
 * renders from zero. Percentages are shares of the summed step duration; when that sum is zero the
 * timeline is `degenerate` and every percent is 0 rather than NaN.
 */
export function buildAutomateTimeline(run: Pick<FlowExecutionRun, 'startedAt' | 'endedAt' | 'steps'>): AutomateTimeline {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const durations = steps.map((step) => ms(step.durationMs));
  const totalMs = durations.reduce((sum, value) => sum + value, 0);

  const starts = steps
    .map((step) => (typeof step.startedAt === 'number' && Number.isFinite(step.startedAt) ? step.startedAt : null))
    .filter((value): value is number => value !== null);
  const origin = starts.length > 0 ? Math.min(...starts) : 0;

  const segments: TimelineSegment[] = steps.map((step, index) => {
    const durationMs = durations[index];
    const startedAt = typeof step.startedAt === 'number' && Number.isFinite(step.startedAt) ? step.startedAt : origin;
    return {
      index,
      nodeId: step.nodeId,
      nodeTitle: step.nodeTitle,
      status: step.status,
      offsetMs: Math.max(0, startedAt - origin),
      durationMs,
      percent: totalMs > 0 ? Math.round((durationMs / totalMs) * 1000) / 10 : 0,
    };
  });

  const spanFromRun = ms(run.endedAt) - ms(run.startedAt);
  return {
    steps: segments,
    totalMs,
    spanMs: spanFromRun > 0 ? spanFromRun : totalMs,
    degenerate: totalMs === 0,
  };
}

/**
 * The step to show in the detail pane. `index` is clamped into range; an empty run returns null rather
 * than throwing, so the view can render an honest empty state.
 */
export function selectTimelineStep(run: Pick<FlowExecutionRun, 'steps'>, index: number): FlowExecutionStep | null {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  if (steps.length === 0) return null;
  const bounded = Math.min(steps.length - 1, Math.max(0, Number.isFinite(index) ? Math.trunc(index) : 0));
  return steps[bounded];
}

/**
 * The runs a debug view may offer, newest first, bounded.
 * A run must have at least one step to be inspectable — an empty run is not a step view.
 */
export function inspectableRuns(runs: readonly FlowExecutionRun[], max = 50): FlowExecutionRun[] {
  if (!Array.isArray(runs)) return [];
  if (!Number.isInteger(max) || max < 1 || max > 500) throw new AutomateTimelineError('timeline-run-limit-invalid');
  return runs.filter((run) => Array.isArray(run.steps) && run.steps.length > 0).slice(0, max);
}

/** Node ids that a run actually walked, in walk order. Used to mark the breakpointed ones. */
export function inspectedNodeIds(run: Pick<FlowExecutionRun, 'steps'>): string[] {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  return steps.map((step) => step.nodeId);
}
