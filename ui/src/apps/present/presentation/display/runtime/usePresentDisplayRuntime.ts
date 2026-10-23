// STATUS: PLATIN — display-side runtime for the Present projector and presenter windows.
//
// One hook owns everything a display window needs: the channel + snapshot handshake, the deck state,
// slide transitions, animation playback, the presenter's click steps, and the black screen. The
// presenter window is the only writer; the audience window renders what the presenter last decided.
// Both windows read the same versioned snapshot contract, so no editor/shell code is needed here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PresentAnimation,
  PresentDocumentModel,
  PresentSlide,
  WorkspaceObject,
} from '../../../../../shared/contracts/workspace';
import { cancelForegroundAnimationFrame, requestForegroundAnimationFrame } from '../../../../../platform/performance/performancePlatform';
import { buildAnimationPlaybackGroups, normalizePresentAnimation } from '../../../animations/presentAnimationEngine';
import {
  PRESENT_SESSION_EDITOR_TIMEOUT_MS,
  type PresentDisplayRole,
  type PresentSessionMessage,
  type PresentSessionSnapshotPayload,
} from '../../session/presentSessionProtocol';
import { PresentHelloLoop, PresentSessionChannel, type PresentChannelFactory } from '../../session/presentSessionBus';
import {
  buildPresentAnimationPlayback,
  computePresentAnimationProgress,
  presentDisplayTransitionDuration,
} from './presentDisplayPlayback';

export type PresentDisplayPhase = 'connecting' | 'ready' | 'ended' | 'timeout' | 'unavailable';
export type PresentDisplayNotice = 'timeout' | 'editor-lost' | 'ended-by-presenter' | 'ended-by-editor';

export interface PresentDisplayTransitionState {
  fromIdx: number;
  toIdx: number;
  progress: number;
}

export interface PresentDisplayRuntimeState {
  phase: PresentDisplayPhase;
  slides: PresentSlide[];
  presentData: PresentDocumentModel | null;
  embeddedObjects: WorkspaceObject[];
  index: number;
  transitionState: PresentDisplayTransitionState | null;
  activeAnimations: PresentAnimation[];
  animationProgressById: Record<string, number>;
  clickGroupIndex: number;
  clickGroupCount: number;
  blackScreen: boolean;
  startedAt: number | null;
  notice: PresentDisplayNotice | null;
}

export interface PresentDisplayRuntimeActions {
  advance: () => void;
  back: () => void;
  firstSlide: () => void;
  lastSlide: () => void;
  setBlack: (enabled: boolean) => void;
  toggleBlack: () => void;
  endPresentation: () => void;
  retryConnection: () => void;
}

export interface PresentDisplayRuntime {
  state: PresentDisplayRuntimeState;
  actions: PresentDisplayRuntimeActions;
}

export interface UsePresentDisplayRuntimeOptions {
  readonly role: PresentDisplayRole;
  readonly session: string;
  readonly reducedMotion: boolean;
  readonly channelFactory?: PresentChannelFactory;
  readonly now?: () => number;
}

interface PresentDisplayInternalState {
  phase: PresentDisplayPhase;
  slides: PresentSlide[];
  presentData: PresentDocumentModel | null;
  embeddedObjects: WorkspaceObject[];
  index: number;
  transitionState: PresentDisplayTransitionState | null;
  clickGroupIndex: number;
  blackScreen: boolean;
  startedAt: number | null;
  notice: PresentDisplayNotice | null;
}

const INITIAL_STATE: PresentDisplayInternalState = {
  phase: 'connecting',
  slides: [],
  presentData: null,
  embeddedObjects: [],
  index: 0,
  transitionState: null,
  clickGroupIndex: 0,
  blackScreen: false,
  startedAt: null,
  notice: null,
};

const defaultNow = (): number => (
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
);

function clickGroupsFor(slide: PresentSlide | undefined) {
  return buildAnimationPlaybackGroups((slide?.animations ?? []) as PresentAnimation[])
    .filter((group) => group.trigger === 'click');
}

export function usePresentDisplayRuntime(options: UsePresentDisplayRuntimeOptions): PresentDisplayRuntime {
  const [state, setState] = useState<PresentDisplayInternalState>(INITIAL_STATE);
  const [animationProgressById, setAnimationProgressById] = useState<Record<string, number>>({});
  const stateRef = useRef<PresentDisplayInternalState>(state);
  stateRef.current = state;

  const nowRef = useRef(options.now ?? defaultNow);
  nowRef.current = options.now ?? defaultNow;
  const reducedMotionRef = useRef(options.reducedMotion);
  reducedMotionRef.current = options.reducedMotion;

  const channelRef = useRef<PresentSessionChannel | null>(null);
  const helloLoopRef = useRef<PresentHelloLoop | null>(null);
  const startsRef = useRef<Record<string, number>>({});
  const slideActivatedAtRef = useRef(0);
  /** Direction of the last click-step change; a rewound step must not replay its entrance. */
  const animateCurrentClickGroupRef = useRef(true);
  const animationFrameRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionStartedAtRef = useRef(0);
  const lastEditorMessageAtRef = useRef(0);
  const handleMessageRef = useRef<(message: PresentSessionMessage) => void>(() => undefined);
  const tickAnimationsRef = useRef<() => void>(() => undefined);

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelForegroundAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  tickAnimationsRef.current = () => {
    const current = stateRef.current;
    const slide = current.slides[current.index];
    const computed = computePresentAnimationProgress(
      (slide?.animations ?? []) as PresentAnimation[],
      startsRef.current,
      nowRef.current(),
      reducedMotionRef.current,
    );
    setAnimationProgressById(computed.progressById);
    animationFrameRef.current = computed.running
      ? requestForegroundAnimationFrame(() => tickAnimationsRef.current())
      : null;
  };

  const adoptSnapshot = useCallback((payload: PresentSessionSnapshotPayload) => {
    helloLoopRef.current?.notifySnapshot();
    lastEditorMessageAtRef.current = Date.now();
    const previous = stateRef.current;
    const slides = payload.slides;
    const wasReady = previous.phase === 'ready';
    const maxIndex = Math.max(0, slides.length - 1);
    // Only the first snapshot of this window decides the position. The editor answers every `hello`
    // of every display with an `initial` snapshot; a second window joining later must not rewind a
    // show that is already running. A deck change (`update`) keeps the position as well.
    const nextIndex = wasReady
      ? Math.min(previous.index, maxIndex)
      : Math.min(Math.max(0, payload.index), maxIndex);
    const clickGroupIndex = wasReady
      ? Math.min(previous.clickGroupIndex, clickGroupsFor(slides[nextIndex]).length)
      : 0;
    slideActivatedAtRef.current = nowRef.current();
    animateCurrentClickGroupRef.current = true;
    startsRef.current = {};
    setState((current) => ({
      ...current,
      phase: 'ready',
      slides,
      presentData: { ...payload.presentData, slides },
      embeddedObjects: payload.embeddedObjects,
      index: nextIndex,
      transitionState: null,
      clickGroupIndex,
      blackScreen: wasReady ? current.blackScreen : false,
      startedAt: payload.startedAt || current.startedAt,
      notice: null,
    }));
  }, []);

  const setEnded = useCallback((notice: PresentDisplayNotice) => {
    helloLoopRef.current?.stop();
    stopAnimationLoop();
    setState((current) => current.phase === 'ended'
      ? { ...current, notice }
      : { ...current, phase: 'ended', notice, transitionState: null });
  }, [stopAnimationLoop]);

  const broadcastGoto = useCallback((index: number, clickGroupIndex: number, slides: PresentSlide[]) => {
    channelRef.current?.sendGoto({
      index,
      clickGroupIndex,
      slideId: slides[index]?.id ?? null,
    });
  }, []);

  const beginTransitionTo = useCallback((targetIndex: number, clickGroupIndex: number) => {
    const current = stateRef.current;
    if (targetIndex < 0 || targetIndex >= current.slides.length) return;
    slideActivatedAtRef.current = nowRef.current();
    startsRef.current = {};
    const targetSlide = current.slides[targetIndex];
    const duration = presentDisplayTransitionDuration(targetSlide?.transition, reducedMotionRef.current);
    if (duration <= 0) {
      setState((previous) => ({
        ...previous,
        index: targetIndex,
        clickGroupIndex,
        transitionState: null,
      }));
      return;
    }
    transitionStartedAtRef.current = nowRef.current();
    setState((previous) => ({
      ...previous,
      clickGroupIndex,
      transitionState: { fromIdx: previous.index, toIdx: targetIndex, progress: 0 },
    }));
  }, []);

  const handleMessage = (message: PresentSessionMessage): void => {
    const senderRole = message.role;
    if (senderRole === 'editor') {
      lastEditorMessageAtRef.current = Date.now();
      if (message.type === 'snapshot') {
        adoptSnapshot(message.payload);
      } else if (message.type === 'end') {
        setEnded(message.payload.reason === 'session-lost' ? 'editor-lost' : 'ended-by-editor');
      } else if (message.type === 'ping') {
        channelRef.current?.sendAck(true);
      }
      return;
    }
    if (senderRole !== 'presenter') return;
    if (message.type === 'goto') {
      lastEditorMessageAtRef.current = Date.now();
      const current = stateRef.current;
      if (current.phase !== 'ready') return;
      const targetIndex = Math.min(Math.max(0, message.payload.index), Math.max(0, current.slides.length - 1));
      if (targetIndex === current.index) {
        animateCurrentClickGroupRef.current = message.payload.clickGroupIndex >= current.clickGroupIndex;
        setState((previous) => ({ ...previous, clickGroupIndex: message.payload.clickGroupIndex }));
      } else {
        animateCurrentClickGroupRef.current = true;
        beginTransitionTo(targetIndex, message.payload.clickGroupIndex);
      }
      return;
    }
    if (message.type === 'black') {
      setState((previous) => previous.blackScreen === message.payload.enabled
        ? previous
        : { ...previous, blackScreen: message.payload.enabled });
      return;
    }
    if (message.type === 'end') {
      setEnded('ended-by-presenter');
    }
  };
  handleMessageRef.current = handleMessage;

  const advance = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'ready' || current.transitionState) return;
    const slide = current.slides[current.index];
    if (!slide) return;
    const clickGroups = clickGroupsFor(slide);
    if (current.clickGroupIndex < clickGroups.length) {
      const nextGroupIndex = current.clickGroupIndex + 1;
      animateCurrentClickGroupRef.current = true;
      broadcastGoto(current.index, nextGroupIndex, current.slides);
      setState((previous) => ({ ...previous, clickGroupIndex: nextGroupIndex }));
      return;
    }
    if (current.index + 1 >= current.slides.length) return;
    animateCurrentClickGroupRef.current = true;
    broadcastGoto(current.index + 1, 0, current.slides);
    beginTransitionTo(current.index + 1, 0);
  }, [beginTransitionTo, broadcastGoto]);

  const back = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'ready' || current.transitionState) return;
    const slide = current.slides[current.index];
    if (!slide) return;
    if (current.clickGroupIndex > 0) {
      const nextGroupIndex = current.clickGroupIndex - 1;
      animateCurrentClickGroupRef.current = false;
      broadcastGoto(current.index, nextGroupIndex, current.slides);
      setState((previous) => ({ ...previous, clickGroupIndex: nextGroupIndex }));
      return;
    }
    if (current.index <= 0) return;
    animateCurrentClickGroupRef.current = true;
    broadcastGoto(current.index - 1, 0, current.slides);
    beginTransitionTo(current.index - 1, 0);
  }, [beginTransitionTo, broadcastGoto]);

  const firstSlide = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'ready' || current.transitionState || current.slides.length === 0) return;
    if (current.index === 0 && current.clickGroupIndex === 0) return;
    broadcastGoto(0, 0, current.slides);
    beginTransitionTo(0, 0);
  }, [beginTransitionTo, broadcastGoto]);

  const lastSlide = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'ready' || current.transitionState || current.slides.length === 0) return;
    const lastIndex = current.slides.length - 1;
    if (current.index === lastIndex) return;
    broadcastGoto(lastIndex, 0, current.slides);
    beginTransitionTo(lastIndex, 0);
  }, [beginTransitionTo, broadcastGoto]);

  const setBlack = useCallback((enabled: boolean) => {
    channelRef.current?.sendBlack(enabled);
    setState((previous) => previous.blackScreen === enabled ? previous : { ...previous, blackScreen: enabled });
  }, []);

  const toggleBlack = useCallback(() => {
    setBlack(!stateRef.current.blackScreen);
  }, [setBlack]);

  const endPresentation = useCallback(() => {
    channelRef.current?.sendEnd('presenter-end');
    setEnded('ended-by-presenter');
  }, [setEnded]);

  const retryConnection = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    helloLoopRef.current?.stop();
    setState((previous) => ({ ...previous, phase: 'connecting', notice: null }));
    const loop = new PresentHelloLoop({
      sendHello: () => channel.sendHello(),
      onTimeout: () => setState((previous) => previous.phase === 'ready'
        ? previous
        : { ...previous, phase: 'timeout', notice: 'timeout' }),
    });
    helloLoopRef.current = loop;
    loop.start();
  }, []);

  // Channel lifecycle: join the session, ask for the snapshot, watch the editor heartbeat.
  useEffect(() => {
    const channel = new PresentSessionChannel({
      session: options.session,
      role: options.role,
      onMessage: (message) => handleMessageRef.current(message),
      channelFactory: options.channelFactory,
    });
    channelRef.current = channel;
    if (!channel.available) {
      setState((previous) => ({ ...previous, phase: 'unavailable' }));
      return () => {
        channel.close();
        channelRef.current = null;
      };
    }
    const loop = new PresentHelloLoop({
      sendHello: () => channel.sendHello(),
      onTimeout: () => setState((previous) => previous.phase === 'ready'
        ? previous
        : { ...previous, phase: 'timeout', notice: 'timeout' }),
    });
    helloLoopRef.current = loop;
    loop.start();
    lastEditorMessageAtRef.current = 0;
    const watchdog = setInterval(() => {
      const current = stateRef.current;
      if (current.phase !== 'ready' || current.notice !== null) return;
      const last = lastEditorMessageAtRef.current;
      if (last > 0 && Date.now() - last > PRESENT_SESSION_EDITOR_TIMEOUT_MS) {
        setState((previous) => previous.phase === 'ready'
          ? { ...previous, phase: 'timeout', notice: 'editor-lost' }
          : previous);
      }
    }, 1_000);
    return () => {
      loop.stop();
      helloLoopRef.current = null;
      clearInterval(watchdog);
      stopAnimationLoop();
      channel.close();
      channelRef.current = null;
    };
  }, [options.session, options.role, options.channelFactory, stopAnimationLoop]);

  // Slide transition frames. Depend on the endpoints only so progress updates do not restart the loop.
  const transitionFromIdx = state.transitionState?.fromIdx ?? null;
  const transitionToIdx = state.transitionState?.toIdx ?? null;
  useEffect(() => {
    if (transitionFromIdx === null || transitionToIdx === null) return undefined;
    const duration = Math.max(1, presentDisplayTransitionDuration(
      stateRef.current.slides[transitionToIdx]?.transition,
      reducedMotionRef.current,
    ));
    const startedAt = transitionStartedAtRef.current;
    const tick = () => {
      const progress = Math.min(1, Math.max(0, (nowRef.current() - startedAt) / duration));
      if (progress >= 1) {
        transitionFrameRef.current = null;
        slideActivatedAtRef.current = nowRef.current();
        setState((previous) => previous.transitionState === null
          ? previous
          : { ...previous, index: transitionToIdx, transitionState: null });
        return;
      }
      setState((previous) => previous.transitionState === null
        ? previous
        : { ...previous, transitionState: { ...previous.transitionState, progress } });
      transitionFrameRef.current = requestForegroundAnimationFrame(tick);
    };
    transitionFrameRef.current = requestForegroundAnimationFrame(tick);
    return () => {
      if (transitionFrameRef.current !== null) {
        cancelForegroundAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }
    };
    // Progress is deliberately not a dependency: the frame loop itself advances it.
  }, [transitionFromIdx, transitionToIdx]);

  // Animation schedule for the visible slide + click step, then frame-driven progress until done.
  const slideForAnimation = state.slides[state.index];
  useEffect(() => {
    const animations = (slideForAnimation?.animations ?? []) as PresentAnimation[];
    const playback = buildPresentAnimationPlayback(animations, {
      clickGroupIndex: state.clickGroupIndex,
      slideActivatedAt: slideActivatedAtRef.current,
      now: nowRef.current(),
      reducedMotion: options.reducedMotion,
      animateCurrentClickGroup: animateCurrentClickGroupRef.current,
    });
    startsRef.current = playback.startsByAnimationId;
    const computed = computePresentAnimationProgress(
      animations,
      playback.startsByAnimationId,
      nowRef.current(),
      options.reducedMotion,
    );
    setAnimationProgressById(computed.progressById);
    stopAnimationLoop();
    if (computed.running && !options.reducedMotion) {
      animationFrameRef.current = requestForegroundAnimationFrame(() => tickAnimationsRef.current());
    }
    return stopAnimationLoop;
  }, [slideForAnimation, state.clickGroupIndex, options.reducedMotion, stopAnimationLoop]);

  const activeAnimations = useMemo(
    () => ((slideForAnimation?.animations ?? []) as PresentAnimation[])
      .filter((animation) => animation.effect !== 'none')
      .map(normalizePresentAnimation),
    [slideForAnimation],
  );
  const clickGroupCount = useMemo(() => clickGroupsFor(slideForAnimation).length, [slideForAnimation]);

  const actions = useMemo<PresentDisplayRuntimeActions>(() => ({
    advance,
    back,
    firstSlide,
    lastSlide,
    setBlack,
    toggleBlack,
    endPresentation,
    retryConnection,
  }), [advance, back, firstSlide, lastSlide, setBlack, toggleBlack, endPresentation, retryConnection]);

  return {
    state: {
      ...state,
      activeAnimations,
      animationProgressById,
      clickGroupCount,
    },
    actions,
  };
}
