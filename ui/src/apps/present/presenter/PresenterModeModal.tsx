// STATUS: DIAMANT VGT SUPREME â€” deterministic presenter runtime with audience, annotations and trusted remote adapter
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PresentDocumentModel, PresentInkStroke, PresentSlide, WorkspaceObject } from '../../../shared/contracts/workspace';
import { animationProgressForElapsed, buildAnimationPlaybackGroups, normalizePresentAnimation } from '../animations/presentAnimationEngine';
import { normalizePresentTransition, transitionDurationMs } from './transitions/presentTransitionEngine';
import { resolvePresentLinkActivation, type PresentLinkTarget } from '../canvas/model/presentHyperlinks';
import { playPresentTransitionSound } from './transitions/presentTransitionSound';
import { PresenterDeckSurface } from './PresenterDeckSurface';
import { PresenterControlBar, type PresenterPointerTool } from './controls/PresenterControlBar';
import { PresenterSidePanel } from './PresenterSidePanel';
import { openPresenterAudienceWindow, requestAudienceFullscreen } from './window/presenterAudienceWindow';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_STUDIO_COPY } from '../locale/presentStudioLocale';
import { PresentStudioErrorAlert } from '../locale/PresentStudioErrorAlert';
import {
  buildPresenterSequences,
  createPresenterPairToken,
  eraseInkAt,
  nextSlideIdInSequence,
  normalizeInkStrokes,
  previousSlideIdInSequence,
  PresenterRemoteChannel,
  type PresentRemoteCommand,
} from './runtime/presenterRuntime';
import { ChevronLeft, ChevronRight, EyeOff, Save, Trash2, X } from 'lucide-react';
import { cancelForegroundAnimationFrame, requestForegroundAnimationFrame } from '../../../platform/performance/performancePlatform';

interface PresenterModeModalProps {
  slides: PresentSlide[];
  initialSlideIdx: number;
  onClose: () => void;
  onCommitPresenterInk?: (inkBySlideId: Record<string, PresentInkStroke[]>) => void;
  embeddedObjects: WorkspaceObject[];
  presentData: PresentDocumentModel;
  /** Opens a workspace document a linked object points at (Paket 28). */
  onOpenDocument?: (documentId: string) => void;
}

interface TransitionState { fromIdx: number; toIdx: number; startedAt: number; progress: number; }

const formatElapsed = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>): { xPercent: number; yPercent: number } => {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    xPercent: Math.max(0, Math.min(100, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100)),
    yPercent: Math.max(0, Math.min(100, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100)),
  };
};

export const PresenterModeModal: React.FC<PresenterModeModalProps> = ({
  slides, initialSlideIdx, onClose, onCommitPresenterInk, embeddedObjects, presentData, onOpenDocument,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_STUDIO_COPY[locale].presenter;
  const controlsCopy = PRESENT_STUDIO_COPY[locale].controls;
  const [currentIdx, setCurrentIdx] = useState(Math.min(Math.max(0, initialSlideIdx), Math.max(0, slides.length - 1)));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [slideElapsedSeconds, setSlideElapsedSeconds] = useState(0);
  const [wallClock, setWallClock] = useState(Date.now());
  const [notesFontSize, setNotesFontSize] = useState(12);
  const [blackScreen, setBlackScreen] = useState(false);
  const [whiteScreen, setWhiteScreen] = useState(false);
  const [pointerTool, setPointerTool] = useState<PresenterPointerTool>('none');
  const [laserPos, setLaserPos] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [paused, setPaused] = useState(false);
  const [loopMode, setLoopMode] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [activeSequenceId, setActiveSequenceId] = useState('all');
  const [animationProgressById, setAnimationProgressById] = useState<Record<string, number>>({});
  const [clickGroupIndex, setClickGroupIndex] = useState(0);
  const [transitionState, setTransitionState] = useState<TransitionState | null>(null);
  const [audienceWindow, setAudienceWindow] = useState<Window | null>(null);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);
  const [inkDirty, setInkDirty] = useState(false);
  const [presenterError, setPresenterError] = useState<string | null>(null);
  const [inkBySlideId, setInkBySlideId] = useState<Record<string, PresentInkStroke[]>>(() => Object.fromEntries(slides.map((slide) => [slide.id, normalizeInkStrokes(slide.presenterInk)])));

  const drawingStrokeIdRef = useRef<string | null>(null);
  const animationStartsRef = useRef<Map<string, number>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const pauseStartedRef = useRef<number | null>(null);
  const remoteChannelRef = useRef<PresenterRemoteChannel | null>(null);
  const sessionId = useMemo(() => `session-${Date.now().toString(36)}`, []);
  const pairToken = useMemo(createPresenterPairToken, []);

  const slide = slides[currentIdx] || slides[0];
  useEffect(() => setSlideElapsedSeconds(0), [slide?.id]);
  const sequences = useMemo(() => buildPresenterSequences(slides, presentData.sections, presentData.customShows), [slides, presentData.sections, presentData.customShows]);
  const activeSequence = sequences.find((sequence) => sequence.id === activeSequenceId) || sequences[0];
  const currentInk = slide ? (inkBySlideId[slide.id] || []) : [];
  const nextSequenceSlideId = slide ? nextSlideIdInSequence(activeSequence, slide.id, loopMode) : null;
  const nextSlide = nextSequenceSlideId ? slides.find((item) => item.id === nextSequenceSlideId) || null : null;
  const activeAnimations = useMemo(() => (slide?.animations || []).filter((animation) => animation.effect !== 'none').map(normalizePresentAnimation), [slide]);
  const playbackGroups = useMemo(() => buildAnimationPlaybackGroups(activeAnimations), [activeAnimations]);
  const clickGroups = useMemo(() => playbackGroups.filter((group) => group.trigger === 'click'), [playbackGroups]);
  const triggerObjectIds = useMemo(() => new Set(activeAnimations.filter((animation) => animation.trigger === 'object-trigger' && animation.triggerObjectId).map((animation) => animation.triggerObjectId as string)), [activeAnimations]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setWallClock(Date.now());
      setElapsedSeconds((value) => paused ? value : value + 1);
      setSlideElapsedSeconds((value) => paused ? value : value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) cancelForegroundAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const tickAnimations = useCallback((now: number) => {
    if (paused) { animationFrameRef.current = null; return; }
    const next: Record<string, number> = {};
    let running = false;
    for (const animation of activeAnimations) {
      const startedAt = animationStartsRef.current.get(animation.id);
      if (startedAt === undefined) { next[animation.id] = 0; continue; }
      const elapsed = now - startedAt;
      next[animation.id] = animationProgressForElapsed(animation, elapsed);
      if (elapsed < animation.durationMs * (animation.repeatCount || 1)) running = true;
    }
    setAnimationProgressById(next);
    animationFrameRef.current = running ? requestForegroundAnimationFrame(tickAnimations) : null;
  }, [activeAnimations, paused]);

  const ensureAnimationLoop = useCallback(() => {
    if (!paused && animationFrameRef.current === null) animationFrameRef.current = requestForegroundAnimationFrame(tickAnimations);
  }, [paused, tickAnimations]);

  const startEntries = useCallback((entries: { animationId: string; startMs: number }[], baseTime = performance.now()) => {
    for (const entry of entries) animationStartsRef.current.set(entry.animationId, baseTime + Math.max(0, entry.startMs));
    if (entries.length) ensureAnimationLoop();
  }, [ensureAnimationLoop]);

  const resetAnimationIds = useCallback((ids: string[]) => {
    ids.forEach((id) => animationStartsRef.current.delete(id));
    setAnimationProgressById((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, 0])) }));
  }, []);

  useEffect(() => {
    stopAnimationLoop();
    animationStartsRef.current.clear();
    setAnimationProgressById(Object.fromEntries(activeAnimations.map((animation) => [animation.id, 0])));
    setClickGroupIndex(0);
    if (!slide || paused) return stopAnimationLoop;
    const automatic = playbackGroups.filter((group) => group.trigger === 'auto').flatMap((group) => group.entries);
    if (automatic.length) startEntries(automatic);
    return stopAnimationLoop;
  }, [slide?.id, activeAnimations, playbackGroups, paused, startEntries, stopAnimationLoop]);

  const startSlideTransition = useCallback((toIdx: number) => {
    if (paused || transitionState || toIdx < 0 || toIdx >= slides.length || toIdx === currentIdx) return;
    const transition = normalizePresentTransition(slides[toIdx]?.transition);
    void playPresentTransitionSound(transition.sound);
    if (transitionDurationMs(transition) <= 0) { setCurrentIdx(toIdx); return; }
    setTransitionState({ fromIdx: currentIdx, toIdx, startedAt: performance.now(), progress: 0 });
  }, [currentIdx, paused, slides, transitionState]);

  useEffect(() => {
    if (!transitionState || paused) return undefined;
    const duration = Math.max(1, transitionDurationMs(slides[transitionState.toIdx]?.transition));
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - transitionState.startedAt) / duration));
      if (progress >= 1) {
        setCurrentIdx(transitionState.toIdx);
        setTransitionState(null);
        transitionFrameRef.current = null;
      } else {
        setTransitionState((state) => state ? { ...state, progress } : state);
        transitionFrameRef.current = requestForegroundAnimationFrame(tick);
      }
    };
    transitionFrameRef.current = requestForegroundAnimationFrame(tick);
    return () => { if (transitionFrameRef.current !== null) cancelForegroundAnimationFrame(transitionFrameRef.current); transitionFrameRef.current = null; };
  }, [paused, slides, transitionState?.fromIdx, transitionState?.toIdx, transitionState?.startedAt]);

  const jumpToSlideId = useCallback((slideId: string) => {
    const idx = slides.findIndex((item) => item.id === slideId);
    if (idx >= 0) startSlideTransition(idx);
  }, [slides, startSlideTransition]);

  const advancePresentation = useCallback((source: 'click' | 'keyboard' | 'auto' | 'remote' = 'keyboard') => {
    if (!slide || paused || transitionState) return;
    if (clickGroupIndex < clickGroups.length) {
      startEntries(clickGroups[clickGroupIndex].entries);
      setClickGroupIndex((value) => value + 1);
      return;
    }
    if (source === 'click' && normalizePresentTransition(slide.transition).advanceOnClick === false) return;
    const nextId = nextSlideIdInSequence(activeSequence, slide.id, loopMode);
    if (nextId) jumpToSlideId(nextId);
  }, [activeSequence, clickGroupIndex, clickGroups, jumpToSlideId, loopMode, paused, slide, startEntries, transitionState]);

  const rewindPresentation = useCallback(() => {
    if (!slide || paused || transitionState) return;
    if (clickGroupIndex > 0) {
      const previousGroup = clickGroups[clickGroupIndex - 1];
      resetAnimationIds(previousGroup.entries.map((entry) => entry.animationId));
      setClickGroupIndex((value) => Math.max(0, value - 1));
      return;
    }
    const previousId = previousSlideIdInSequence(activeSequence, slide.id, loopMode);
    if (previousId) jumpToSlideId(previousId);
  }, [activeSequence, clickGroupIndex, clickGroups, jumpToSlideId, loopMode, paused, resetAnimationIds, slide, transitionState]);

  useEffect(() => {
    if (!slide || paused || transitionState) return undefined;
    const transition = normalizePresentTransition(slide.transition);
    const delay = kioskMode ? (transition.advanceAfterMs ?? Math.max(250, (slide.timingSeconds || 5) * 1000)) : transition.advanceAfterMs;
    if (delay == null || !nextSlideIdInSequence(activeSequence, slide.id, loopMode)) return undefined;
    const timer = window.setTimeout(() => advancePresentation('auto'), delay);
    return () => window.clearTimeout(timer);
  }, [activeSequence, advancePresentation, kioskMode, loopMode, paused, slide?.id, slide?.timingSeconds, slide?.transition, transitionState]);

  const togglePause = useCallback(() => {
    if (!paused) {
      pauseStartedRef.current = performance.now();
      stopAnimationLoop();
      setPaused(true);
      return;
    }
    const now = performance.now();
    const delta = Math.max(0, now - (pauseStartedRef.current || now));
    animationStartsRef.current.forEach((value, key) => animationStartsRef.current.set(key, value + delta));
    setTransitionState((state) => state ? { ...state, startedAt: state.startedAt + delta } : state);
    pauseStartedRef.current = null;
    setPaused(false);
  }, [paused, stopAnimationLoop]);

  const triggerObjectAnimations = useCallback((targetId: string) => {
    const triggered = activeAnimations.filter((animation) => animation.trigger === 'object-trigger' && animation.triggerObjectId === targetId);
    startEntries(triggered.map((animation) => ({ animationId: animation.id, startMs: animation.delayMs })));
  }, [activeAnimations, startEntries]);

  const updateInk = useCallback((next: PresentInkStroke[]) => {
    if (!slide) return;
    setInkBySlideId((current) => ({ ...current, [slide.id]: normalizeInkStrokes(next) }));
    setInkDirty(true);
  }, [slide]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!slide || pointerTool === 'none' || pointerTool === 'laser') return;
    const point = pointFromEvent(event);
    if (pointerTool === 'eraser') { updateInk(eraseInkAt(currentInk, point.xPercent, point.yPercent)); return; }
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ink-${Date.now()}`;
    drawingStrokeIdRef.current = id;
    updateInk([...currentInk, {
      id, tool: pointerTool, color: pointerTool === 'highlighter' ? '#facc15' : '#ef4444',
      width: pointerTool === 'highlighter' ? 16 : 3, opacity: pointerTool === 'highlighter' ? 0.35 : 1, points: [point, point],
    }]);
  }, [currentInk, pointerTool, slide, updateInk]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    if (pointerTool === 'laser') { setLaserPos(point); return; }
    if (pointerTool === 'eraser') { updateInk(eraseInkAt(currentInk, point.xPercent, point.yPercent)); return; }
    const strokeId = drawingStrokeIdRef.current;
    if (!strokeId || !['pen', 'highlighter'].includes(pointerTool)) return;
    updateInk(currentInk.map((stroke) => stroke.id === strokeId && stroke.points.length < 4096 ? { ...stroke, points: [...stroke.points, point] } : stroke));
  }, [currentInk, pointerTool, updateInk]);

  const handlePointerUp = useCallback(() => { drawingStrokeIdRef.current = null; }, []);

  const handleRemoteCommand = useCallback((command: PresentRemoteCommand) => {
    if (command.type === 'next') advancePresentation('remote');
    else if (command.type === 'previous') rewindPresentation();
    else if (command.type === 'pause' && !paused) togglePause();
    else if (command.type === 'resume' && paused) togglePause();
    else if (command.type === 'black') { setBlackScreen(command.enabled ?? true); setWhiteScreen(false); }
    else if (command.type === 'white') { setWhiteScreen(command.enabled ?? true); setBlackScreen(false); }
    else if (command.type === 'goto') jumpToSlideId(command.slideId);
  }, [advancePresentation, jumpToSlideId, paused, rewindPresentation, togglePause]);

  useEffect(() => {
    const channel = new PresenterRemoteChannel(sessionId, pairToken, handleRemoteCommand);
    remoteChannelRef.current = channel;
    setRemoteAvailable(channel.available);
    return () => { channel.close(); remoteChannelRef.current = null; };
  }, [handleRemoteCommand, pairToken, sessionId]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (blackScreen || whiteScreen) { setBlackScreen(false); setWhiteScreen(false); }
        else if (kioskMode) setKioskMode(false);
        else if (inkDirty) setPendingExit(true);
        else onClose();
      } else if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') { event.preventDefault(); advancePresentation('keyboard'); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); rewindPresentation(); }
      else if (event.key.toLowerCase() === 'b') { setBlackScreen((value) => !value); setWhiteScreen(false); }
      else if (event.key.toLowerCase() === 'w') { setWhiteScreen((value) => !value); setBlackScreen(false); }
      else if (event.key.toLowerCase() === 'l') setPointerTool((tool) => tool === 'laser' ? 'none' : 'laser');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [advancePresentation, blackScreen, inkDirty, kioskMode, onClose, rewindPresentation, whiteScreen]);

  useEffect(() => () => { if (audienceWindow && !audienceWindow.closed) audienceWindow.close(); }, [audienceWindow]);

  const openAudience = async () => {
    try {
      if (audienceWindow && !audienceWindow.closed) { audienceWindow.focus(); setPresenterError(null); return; }
      const target = await openPresenterAudienceWindow(copy.audienceWindowTitle);
      if (!target) {
        setPresenterError(copy.errors.audienceUnavailable);
        return;
      }
      setAudienceWindow(target);
      setPresenterError(null);
    } catch {
      setPresenterError(copy.errors.audienceUnavailable);
    }
  };

  const chooseSequence = (id: string) => {
    const sequence = sequences.find((candidate) => candidate.id === id);
    if (!sequence) return;
    setActiveSequenceId(sequence.id);
    const first = sequence.slideIds[0];
    if (first) jumpToSlideId(first);
  };

  const commitInk = () => {
    try {
      onCommitPresenterInk?.(inkBySlideId);
      setInkDirty(false);
      setPresenterError(null);
      return true;
    } catch {
      setPresenterError(copy.errors.inkSaveFailed);
      return false;
    }
  };
  const commitAndExit = () => { if (!commitInk()) return; setPendingExit(false); onClose(); };
  const discardAndExit = () => { setPendingExit(false); onClose(); };

  /**
   * Paket 28: "Form mit Link auf andere Folie, Dokument oder **geprÃ¼fte URL** aktivieren".
   * The action is decided by the pure resolver, so an unsupported scheme, a credentialed URL or an
   * unknown slide can never navigate - the refusal is reported instead.
   */
  const activateLink = (target: PresentLinkTarget) => {
    const activation = resolvePresentLinkActivation(target, {
      presenting: true,
      slideIds: slides.map((entry) => entry.id),
    });
    if (activation.action === 'navigate-slide') {
      const index = slides.findIndex((entry) => entry.id === activation.slideId);
      if (index >= 0) jumpToSlideId(activation.slideId);
      else setPresenterError('The linked slide is not part of this presentation.');
      return;
    }
    if (activation.action === 'open-url') {
      // Opened with noopener so the destination cannot reach back into this window.
      window.open(activation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (activation.action === 'open-document') {
      if (onOpenDocument) onOpenDocument(activation.documentId);
      else setPresenterError(`This runtime cannot open document ${activation.documentId} from the presentation.`);
      return;
    }
    setPresenterError(activation.message);
  };
  if (!slide) return null;

  const audienceRoot = audienceWindow && !audienceWindow.closed ? audienceWindow.document.getElementById('astraea-audience-root') : null;
  const deckSurface = (interactive: boolean) => (
    <PresenterDeckSurface
      slides={slides} currentIdx={currentIdx} transitionState={transitionState} presentData={presentData}
      embeddedObjects={embeddedObjects} activeAnimations={activeAnimations} animationProgressById={animationProgressById}
      triggerObjectIds={triggerObjectIds} onTriggerObject={triggerObjectAnimations}
      onAdvance={() => advancePresentation('click')} pointerTool={pointerTool} laserPos={laserPos}
      inkStrokes={currentInk} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      zoom={zoom} interactive={interactive}
      onActivateLink={interactive ? activateLink : undefined}
    />
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={copy.title} className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden font-sans">
      {!kioskMode && <PresenterControlBar
        copy={controlsCopy} elapsedLabel={formatElapsed(elapsedSeconds)} currentTimeLabel={new Date(wallClock).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        slideTimerLabel={formatElapsed(slideElapsedSeconds)} slideLabel={copy.slidePosition(currentIdx + 1, slides.length)} paused={paused} pointerTool={pointerTool} zoom={zoom}
        loopMode={loopMode} kioskMode={kioskMode} audienceOpen={Boolean(audienceRoot)} remoteAvailable={remoteAvailable} pairToken={pairToken}
        onTogglePause={togglePause} onSetPointerTool={setPointerTool} onZoom={(delta) => setZoom((value) => Math.max(1, Math.min(2.5, value + delta)))}
        onToggleLoop={() => setLoopMode((value) => !value)} onToggleKiosk={() => setKioskMode((value) => !value)}
        onOpenAudience={() => { void openAudience(); }} onAudienceFullscreen={() => requestAudienceFullscreen(audienceWindow)}
      />}

      <div className="flex-1 flex min-h-0 relative">
        <main className="relative flex-1 overflow-hidden bg-[#02030a]">{deckSurface(true)}
          {blackScreen && <div className="absolute inset-0 z-50 bg-black" />}
          {whiteScreen && <div className="absolute inset-0 z-50 bg-white" />}
          {paused && <div role="status" className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-full border border-amber-500/30 bg-amber-950/80 px-3 py-1 text-[0.625rem] font-bold uppercase tracking-widest text-amber-300">{copy.paused}</div>}
          {kioskMode && <div className="absolute top-3 right-3 z-30 max-w-[min(90vw,24rem)] break-words rounded bg-black/60 px-2 py-1 text-[0.5625rem] text-slate-400">{copy.kioskExitHint}</div>}
        </main>
        {!kioskMode && <PresenterSidePanel currentSlide={slide} nextSlide={nextSlide} slides={slides} currentIdx={currentIdx} notesFontSize={notesFontSize} activeSequenceId={activeSequence.id} sequences={sequences} onSetNotesFontSize={setNotesFontSize} onJumpIndex={startSlideTransition} onSelectSequence={chooseSequence} />}
      </div>

      {presenterError && <div className="absolute bottom-14 left-1/2 z-40 w-[min(92vw,32rem)] -translate-x-1/2"><PresentStudioErrorAlert message={presenterError}/></div>}
      {!kioskMode && <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t border-white/10 bg-slate-950/95 z-30 sm:px-6">
        <div className="flex flex-wrap gap-1"><button type="button" aria-pressed={blackScreen} onClick={() => { setBlackScreen((v) => !v); setWhiteScreen(false); }} className="whitespace-normal break-words px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300">{copy.blackScreen}</button><button type="button" aria-pressed={whiteScreen} onClick={() => { setWhiteScreen((v) => !v); setBlackScreen(false); }} className="whitespace-normal break-words px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-300">{copy.whiteScreen}</button>{currentInk.length > 0 && <button type="button" onClick={() => updateInk([])} className="p-1.5 rounded border border-red-500/20 text-red-300" aria-label={copy.clearInk} title={copy.clearInk}><Trash2 className="w-3.5 h-3.5" /></button>}</div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={rewindPresentation} aria-label={copy.previous} title={copy.previous} className="flex items-center gap-1 whitespace-normal break-words px-3 py-1.5 rounded-lg bg-white/5 text-xs text-slate-200"><ChevronLeft aria-hidden="true" className="w-4 h-4" />{copy.previous}</button><button type="button" onClick={() => advancePresentation('keyboard')} aria-label={copy.next} title={copy.next} className="flex items-center gap-1 whitespace-normal break-words px-3 py-1.5 rounded-lg bg-amber-600 text-xs font-bold text-white">{copy.next}<ChevronRight aria-hidden="true" className="w-4 h-4" /></button></div>
        <div className="flex flex-wrap gap-1">{inkDirty && <button type="button" onClick={commitInk} className="flex items-center gap-1 whitespace-normal break-words px-2 py-1 rounded border border-emerald-500/20 text-[0.625rem] text-emerald-300"><Save aria-hidden="true" className="w-3 h-3" />{copy.keepInk}</button>}<button type="button" onClick={() => inkDirty ? setPendingExit(true) : onClose()} className="p-1.5 rounded border border-red-500/30 bg-red-500/10 text-red-300" aria-label={copy.exitShow} title={copy.exitShow}><X aria-hidden="true" className="w-4 h-4" /></button></div>
      </div>}

      {pendingExit && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-3"><div role="dialog" aria-modal="true" aria-labelledby="presenter-exit-title" className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-950 p-5 shadow-2xl"><h3 id="presenter-exit-title" className="break-words text-sm font-bold text-slate-100">{copy.confirmTitle}</h3><p className="mt-1 break-words text-xs text-slate-400">{copy.confirmMessage}</p><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={discardAndExit} className="flex items-center gap-1 whitespace-normal break-words rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300"><EyeOff aria-hidden="true" className="w-3.5 h-3.5" />{copy.discard}</button><button type="button" onClick={commitAndExit} className="flex items-center gap-1 whitespace-normal break-words rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Save aria-hidden="true" className="w-3.5 h-3.5" />{copy.keepAndExit}</button></div></div></div>}

      {audienceRoot && createPortal(<div className="relative w-screen h-screen overflow-hidden bg-black">{deckSurface(false)}{blackScreen && <div className="absolute inset-0 z-50 bg-black" />}{whiteScreen && <div className="absolute inset-0 z-50 bg-white" />}</div>, audienceRoot)}
    </div>
  );
};
