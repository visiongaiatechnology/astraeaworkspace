// STATUS: DIAMANT VGT SUPREME — the node step view with in/out and a timeline.
//
// MEASURED FACTS this panel addresses (see BATCH-AUTOMATE/INVENTORY.md, package 19):
//  - The run drawer listed step *messages* only. There was no node step view, no input/output pane and no
//    timeline, although `FlowExecutionStep` already carried `redactedInput`/`redactedOutput`/`durationMs`
//    (AST-1776).
//  - The timeline arithmetic is owned by `execution/automateTimelineCore.ts`; this panel only renders it,
//    so the printed numbers and the bar widths cannot disagree.
//
// Nothing here is drawn on a canvas: the timeline is an ordered list whose every value is also text, so no
// essential function lives only in a graphic and no state depends on colour alone.
import React, { useMemo, useState } from 'react';
import { Bug, Gauge, Clock, ArrowRightLeft, ListOrdered } from 'lucide-react';
import type { AutomateDocumentModel, FlowExecutionStep, JsonValue } from '../model/types';
import {
  buildAutomateTimeline,
  inspectableRuns,
  inspectedNodeIds,
  selectTimelineStep,
} from '../execution/automateTimelineCore';
import { redactRunStepPayload } from '../execution/automateObservabilityCore';
import { useAutomateCopy } from '../locale/automateLocale';

interface Props {
  model: AutomateDocumentModel;
}

/** A step payload is ALWAYS routed through the redactor, even if a producer already redacted it. */
function safePayload(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(redactRunStepPayload(value));
  } catch {
    return '[REDACTED:UNRENDERABLE]';
  }
}

export const AutomateDebugStepView: React.FC<Props> = ({ model }) => {
  const copy = useAutomateCopy();
  const runs = useMemo(() => inspectableRuns(model.runs), [model.runs]);
  const [runIndex, setRunIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  const run = runs[Math.min(runIndex, Math.max(0, runs.length - 1))] ?? null;
  const timeline = useMemo(() => (run ? buildAutomateTimeline(run) : null), [run]);
  const step: FlowExecutionStep | null = run ? selectTimelineStep(run, stepIndex) : null;

  const breakpointedNodeIds = useMemo(() => new Set(model.nodes.filter((node) => node.breakpoint).map((node) => node.id)), [model.nodes]);
  const walkedNodeIds = useMemo(() => (run ? inspectedNodeIds(run) : []), [run]);

  return (
    <section className="automate-debug" data-automate-debug-view={run ? 'ready' : 'empty'} aria-labelledby="automate-debug-heading">
      <h4 id="automate-debug-heading" className="automate-debug-title text-[0.625rem] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <Bug aria-hidden="true"/>{copy.debugView}
      </h4>

      {run === null || timeline === null ? (
        <p data-automate-debug-empty="true" className="automate-debug-empty text-[0.6875rem]">{copy.debugEmpty}</p>
      ) : (
        <>
          <div className="automate-debug-run-selector flex items-center gap-1.5 mb-2">
            <label className="automate-debug-label text-[0.625rem]" htmlFor="automate-debug-run">{copy.debugRun}</label>
            <select
              id="automate-debug-run"
              value={Math.min(runIndex, runs.length - 1)}
              data-automate-debug-run="true"
              onChange={(event) => { setRunIndex(Number(event.target.value)); setStepIndex(0); }}
              className="automate-debug-select px-1.5 py-0.5 text-[0.625rem]"
            >
              {runs.map((candidate, index) => (
                <option key={candidate.id} value={index}>{`${index + 1}. ${candidate.status}`}</option>
              ))}
            </select>
          </div>

          {/* Timeline: an ordered list of steps, each with its offset, duration and share as TEXT. */}
          <div className="automate-debug-timeline" role="group" aria-label={copy.debugTimeline}>
            <span className="automate-debug-label text-[0.625rem] flex items-center gap-1">
              <Clock aria-hidden="true"/>{copy.debugTimeline}
            </span>
            {timeline.degenerate && (
              <p data-automate-debug-degenerate="true" className="automate-debug-degenerate text-[0.625rem]">{copy.debugDegenerate}</p>
            )}
            <ol className="automate-debug-segments mt-1 space-y-0.5">
              {timeline.steps.map((segment) => {
                const selected = stepIndex === segment.index;
                return (
                  <li key={`${segment.nodeId}-${segment.index}`} className="automate-debug-segment">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setStepIndex(segment.index)}
                      data-automate-debug-segment={segment.nodeId}
                      data-automate-debug-percent={segment.percent}
                      className="automate-debug-segment-button w-full text-left text-[0.625rem] flex items-center gap-1.5"
                    >
                      <span className="automate-debug-segment-title truncate">{copy.templateTitle(segment.nodeTitle)}</span>
                      <span className="automate-debug-segment-metrics font-mono shrink-0">
                        +{segment.offsetMs}ms · {segment.durationMs}ms · {segment.percent}%
                      </span>
                    </button>
                    {/* The bar is decoration on top of the numbers, never the only carrier of the value. */}
                    <span
                      aria-hidden="true"
                      className="automate-debug-bar block h-0.5"
                      style={{ width: `${Math.max(0, Math.min(100, segment.percent))}%` }}
                    />
                    {breakpointedNodeIds.has(segment.nodeId) && (
                      <span data-automate-debug-breakpoint={segment.nodeId} className="automate-debug-breakpoint text-[0.5625rem]">
                        {copy.debugBreakpointSet}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {step !== null && (
            <div className="automate-debug-detail mt-2" data-automate-debug-step={step.nodeId}>
              <p className="automate-debug-step-heading text-[0.625rem] font-semibold flex items-center gap-1">
                <ListOrdered aria-hidden="true"/>{copy.debugStepOf(stepIndex + 1, timeline.steps.length)}
              </p>
              <p className="automate-debug-node text-[0.6875rem]">{copy.templateTitle(step.nodeTitle)}</p>
              <p className="automate-debug-status text-[0.625rem] flex items-center gap-1">
                <Gauge aria-hidden="true"/>{copy.executionStatus(step.status)} · {step.durationMs}ms
              </p>
              {(() => {
                const input = safePayload(step.redactedInput);
                const output = safePayload(step.redactedOutput);
                if (input === null && output === null) {
                  return <p data-automate-debug-no-payload="true" className="automate-debug-no-payload text-[0.625rem]">{copy.debugNoPayload}</p>;
                }
                return (
                  <dl className="automate-debug-io text-[0.625rem]">
                    <dt className="automate-debug-io-label">{copy.debugInput}</dt>
                    <dd data-automate-debug-input={input === null ? 'none' : 'present'} className="automate-debug-io-value font-mono break-all">
                      <ArrowRightLeft aria-hidden="true"/> {input ?? copy.debugNoPayload}
                    </dd>
                    <dt className="automate-debug-io-label">{copy.debugOutput}</dt>
                    <dd data-automate-debug-output={output === null ? 'none' : 'present'} className="automate-debug-io-value font-mono break-all">
                      <ArrowRightLeft aria-hidden="true"/> {output ?? copy.debugNoPayload}
                    </dd>
                  </dl>
                );
              })()}
            </div>
          )}

          <p className="automate-debug-walked text-[0.5625rem]" data-automate-debug-walked={walkedNodeIds.length}>
            {copy.debugStepOf(timeline.steps.length, timeline.steps.length)}
          </p>
        </>
      )}
    </section>
  );
};
