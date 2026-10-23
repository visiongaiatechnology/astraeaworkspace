// STATUS: PLATIN — presenter/lectern display: slide left, speaker notes right, navigation, timer.
//
// This is the second monitor view, not a second editor. It reuses the shipped slide/transition/
// animation renderer through `PresentScaledSlideStage`, shows the next slide as a real (small)
// render, keeps the notes readable and scrollable, and owns the presentation navigation: every step
// is broadcast to the audience window, which only follows.
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MonitorOff, NotebookPen, Power } from 'lucide-react';
import type { PresentAnimation, PresentSlide } from '../../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { presentPresentationCopy } from '../locale/presentPresentationLocale';
import { PresentDisplayStatusPanel } from './PresentDisplayStatusPanel';
import { PresentScaledSlideStage } from './PresentScaledSlideStage';
import type { PresentDisplayRuntime } from './runtime/usePresentDisplayRuntime';

const EMPTY_ANIMATIONS: PresentAnimation[] = [];
const EMPTY_PROGRESS: Record<string, number> = {};

function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const PresentDisplayTimer: React.FC<{ startedAt: number | null; label: string }> = ({ startedAt, label }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return undefined;
    }
    const update = () => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <span data-present-timer="true" aria-label={label} title={label} className="font-mono text-lg font-bold tabular-nums text-amber-300">
      {formatElapsed(elapsed)}
    </span>
  );
};

export interface PresentPresenterDisplayProps {
  readonly runtime: PresentDisplayRuntime;
  readonly locale: WorkspaceLocale;
}

export const PresentPresenterDisplay: React.FC<PresentPresenterDisplayProps> = ({ runtime, locale }) => {
  const copy = presentPresentationCopy(locale).display;
  const { state, actions } = runtime;
  const [confirmEnd, setConfirmEnd] = useState(false);
  const ready = state.phase === 'ready';
  const currentSlide = state.slides[state.index] ?? null;
  const nextSlide = state.slides[state.index + 1] ?? null;
  const nextSlides = useMemo<PresentSlide[]>(() => (nextSlide ? [nextSlide] : []), [nextSlide]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (state.phase === 'ended' || state.phase === 'unavailable') return;
      if (confirmEnd) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setConfirmEnd(false);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          actions.endPresentation();
        }
        return;
      }
      if (!ready) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setConfirmEnd(true);
        }
        return;
      }
      switch (event.key) {
        case 'ArrowRight':
        case ' ':
        case 'Spacebar':
        case 'PageDown':
          event.preventDefault();
          actions.advance();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          actions.back();
          break;
        case 'Home':
          event.preventDefault();
          actions.firstSlide();
          break;
        case 'End':
          event.preventDefault();
          actions.lastSlide();
          break;
        case 'b':
        case 'B':
          event.preventDefault();
          actions.toggleBlack();
          break;
        case 'Escape':
          event.preventDefault();
          setConfirmEnd(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, confirmEnd, ready, state.phase]);

  if (state.phase === 'unavailable') {
    return (
      <PresentDisplayStatusPanel
        role="presenter"
        tone="error"
        title={copy.channelUnavailableTitle}
        body={copy.channelUnavailableBody}
      />
    );
  }
  if (state.phase === 'connecting') {
    return (
      <PresentDisplayStatusPanel
        role="presenter"
        tone="pending"
        title={copy.connecting}
        body={copy.waitingForEditor}
      />
    );
  }
  if (state.phase === 'timeout') {
    return (
      <PresentDisplayStatusPanel
        role="presenter"
        tone="error"
        notice={state.notice}
        title={state.notice === 'editor-lost' ? copy.editorLost : copy.timeoutTitle}
        body={copy.timeoutBody}
        actionLabel={copy.retry}
        onAction={actions.retryConnection}
      />
    );
  }
  if (state.phase === 'ended') {
    return (
      <PresentDisplayStatusPanel
        role="presenter"
        tone="ended"
        title={copy.endedTitle}
        body={copy.endedBody}
        secondaryLabel={copy.closeWindow}
        onSecondary={() => {
          try {
            window.close();
          } catch {
            // The editor closes this window through the native bridge.
          }
        }}
      />
    );
  }
  if (!state.presentData || state.slides.length === 0) {
    return (
      <PresentDisplayStatusPanel
        role="presenter"
        tone="pending"
        title={copy.emptyDeckTitle}
        body={copy.emptyDeckBody}
      />
    );
  }

  const slideNumber = Math.min(state.index + 1, Math.max(1, state.slides.length));
  return (
    <div
      data-present-display-root="presenter"
      data-present-display-role="presenter"
      data-present-display-phase={state.phase}
      className="fixed inset-0 flex select-none flex-col overflow-hidden bg-[#05070d] font-sans text-slate-100"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950/90 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="truncate text-[0.625rem] font-bold uppercase tracking-[0.2em] text-slate-400">
            {copy.presenterWindowLabel}
          </span>
          <span
            data-present-connection-state={ready ? 'live' : 'waiting'}
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wider ${
              ready
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
            }`}
          >
            {ready ? copy.live : copy.disconnected}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden="true" className="h-3.5 w-3.5 text-amber-400/80" />
            <PresentDisplayTimer startedAt={state.startedAt} label={copy.timerLabel} />
          </span>
          <span data-present-slide-counter="true" className="font-mono text-[0.6875rem] tabular-nums text-slate-400">
            {copy.slideCounter(slideNumber, Math.max(1, state.slides.length))}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={actions.toggleBlack}
            aria-pressed={state.blackScreen}
            data-present-black-toggle="true"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.6875rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              state.blackScreen
                ? 'border-amber-400/50 bg-amber-400/10 text-amber-200'
                : 'border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <MonitorOff aria-hidden="true" className="h-3.5 w-3.5" />
            {state.blackScreen ? copy.blackScreenOn : copy.blackScreenOff}
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            data-present-end="true"
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-red-200 transition-colors hover:bg-red-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
          >
            <Power aria-hidden="true" className="h-3.5 w-3.5" />
            {copy.endPresentation}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col p-4">
          <div className="relative min-h-0 flex-1">
            <PresentScaledSlideStage
              slides={state.slides}
              presentData={state.presentData}
              embeddedObjects={state.embeddedObjects}
              currentIdx={state.index}
              transitionState={state.transitionState}
              activeAnimations={state.activeAnimations}
              animationProgressById={state.animationProgressById}
              interactive
              onAdvance={actions.advance}
              testId="current"
            />
            {state.blackScreen && (
              <div data-present-black-screen="true" aria-hidden="true" className="absolute inset-0 z-30 bg-black" />
            )}
          </div>

          <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={actions.back}
                aria-label={copy.slideCounter(Math.max(1, slideNumber - 1), Math.max(1, state.slides.length))}
                title={copy.keyboardHint}
                data-present-previous="true"
                className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={actions.advance}
                data-present-next="true"
                className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[0.6875rem] font-bold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <p className="min-w-0 truncate text-[0.625rem] text-slate-500">{copy.keyboardHint}</p>
          </div>
        </main>

        <aside
          data-present-notes-panel="true"
          className="flex w-[min(38vw,34rem)] min-w-[18rem] shrink-0 flex-col border-l border-white/10 bg-slate-950/80"
        >
          <div className="shrink-0 border-b border-white/10 p-4">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h2 className="text-[0.5625rem] font-bold uppercase tracking-[0.18em] text-cyan-300">{copy.nextSlide}</h2>
              <span className="min-w-0 truncate text-[0.6875rem] font-semibold text-slate-300" data-present-next-title="true">
                {nextSlide ? nextSlide.title : copy.noNextSlide}
              </span>
            </div>
            <div className="mt-2 h-32 overflow-hidden rounded-lg border border-white/10 bg-black" data-present-next-stage="true">
              {nextSlide ? (
                <PresentScaledSlideStage
                  slides={nextSlides}
                  presentData={state.presentData}
                  embeddedObjects={state.embeddedObjects}
                  currentIdx={0}
                  transitionState={null}
                  activeAnimations={EMPTY_ANIMATIONS}
                  animationProgressById={EMPTY_PROGRESS}
                  testId="next"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[0.6875rem] text-slate-500">{copy.noNextSlide}</div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="flex items-center gap-1.5">
              <NotebookPen aria-hidden="true" className="h-3 w-3 text-amber-300" />
              <h2 className="text-[0.5625rem] font-bold uppercase tracking-[0.18em] text-amber-300">{copy.notes}</h2>
            </div>
            <div
              data-present-notes-text="true"
              tabIndex={0}
              className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[clamp(1rem,1.55vw,1.5rem)] leading-[1.55] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {currentSlide?.speakerNotes?.trim()
                ? currentSlide.speakerNotes
                : <span className="text-slate-500">{copy.noNotes}</span>}
            </div>
          </div>
        </aside>
      </div>

      {confirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="present-display-end-title"
          data-present-end-confirm="true"
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl">
            <h2 id="present-display-end-title" className="text-sm font-semibold text-slate-100">
              {copy.confirmEndTitle}
            </h2>
            <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-400">{copy.confirmEndBody}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                data-present-end-cancel="true"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {copy.confirmEndCancel}
              </button>
              <button
                type="button"
                onClick={actions.endPresentation}
                data-present-end-confirm-action="true"
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
              >
                {copy.confirmEndAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
