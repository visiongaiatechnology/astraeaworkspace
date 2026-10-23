// STATUS: PLATIN — editor-side owner of the Present multi-display session.
//
// Responsibilities: create the one session id, open the two native display windows through the
// bridge, answer `hello` with the current deck snapshot, mirror presenter navigation/black-screen
// state into the editor status bar, detect a closed display window through the ack heartbeat, and
// tear everything down — channel, heartbeat, both windows — on stop, end or unmount.
//
// Everything user-facing is a machine code (`PresentSessionStartError`, `PresentSessionNotice`); the
// editor maps it through the locale copy, so this controller stays free of UI text.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentDocumentModel, PresentSlide, WorkspaceObject } from '../../../../shared/contracts/workspace';
import type { PresentSessionNotice, PresentSessionStartError } from '../locale/presentPresentationLocale';
import {
  PRESENT_SESSION_CONNECT_TIMEOUT_MS,
  PRESENT_SESSION_DISPLAY_TIMEOUT_MS,
  PRESENT_SESSION_HEARTBEAT_MS,
  isPresentSessionId,
  isPresentSnapshotSendable,
  type PresentDisplayRole,
  type PresentSessionMessage,
  type PresentSessionSnapshotPayload,
} from '../session/presentSessionProtocol';
import { PresentSessionChannel, type PresentChannelFactory } from '../session/presentSessionBus';
import { nativePresentDisplayBridge, type PresentDisplayBridge } from './presentDisplayBridge';

export interface PresentSessionSelection {
  readonly audienceMonitorIndex: number;
  readonly presenterMonitorIndex: number;
}

export interface PresentSessionSnapshotSource {
  readonly slides: PresentSlide[];
  readonly presentData: PresentDocumentModel;
  readonly embeddedObjects: WorkspaceObject[];
  readonly index: number;
}

export type PresentSessionPhase = 'idle' | 'starting' | 'live' | 'ended';

export interface PresentRoleStatus {
  readonly ready: boolean;
}

export interface PresentDisplaySessionState {
  readonly phase: PresentSessionPhase;
  readonly session: string | null;
  readonly selection: PresentSessionSelection | null;
  readonly startedAt: number | null;
  readonly currentIndex: number;
  readonly slideCount: number;
  readonly blackScreen: boolean;
  readonly roles: Readonly<Record<PresentDisplayRole, PresentRoleStatus>>;
  readonly notice: PresentSessionNotice | null;
}

export interface PresentSessionStartResult {
  readonly ok: boolean;
  readonly error?: PresentSessionStartError;
}

export interface UsePresentDisplaySessionOptions {
  /** Latest deck snapshot; called when a display joins and when the deck changes mid-show. */
  readonly snapshotProvider: () => PresentSessionSnapshotSource | null;
  /** Cheap change signature of the deck; a change triggers an `update` snapshot while live. */
  readonly deckSignature?: string;
  readonly bridge?: PresentDisplayBridge;
  readonly channelFactory?: PresentChannelFactory;
}

export interface PresentDisplaySessionController {
  readonly state: PresentDisplaySessionState;
  start: (selection: PresentSessionSelection) => Promise<PresentSessionStartResult>;
  stop: () => Promise<void>;
  setBlack: (enabled: boolean) => void;
  clearNotice: () => void;
}

const IDLE_ROLES: Record<PresentDisplayRole, PresentRoleStatus> = {
  audience: { ready: false },
  presenter: { ready: false },
};

const INITIAL_STATE: PresentDisplaySessionState = {
  phase: 'idle',
  session: null,
  selection: null,
  startedAt: null,
  currentIndex: 0,
  slideCount: 0,
  blackScreen: false,
  roles: IDLE_ROLES,
  notice: null,
};

const retryDelay = (delayMs: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, delayMs);
});

function clampIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), slideCount - 1);
}

export function usePresentDisplaySession(
  options: UsePresentDisplaySessionOptions,
): PresentDisplaySessionController {
  const [state, setState] = useState<PresentDisplaySessionState>(INITIAL_STATE);
  const stateRef = useRef<PresentDisplaySessionState>(state);
  stateRef.current = state;

  const snapshotProviderRef = useRef(options.snapshotProvider);
  snapshotProviderRef.current = options.snapshotProvider;
  const bridgeRef = useRef<PresentDisplayBridge>(options.bridge ?? nativePresentDisplayBridge);
  bridgeRef.current = options.bridge ?? nativePresentDisplayBridge;
  const channelFactoryRef = useRef<PresentChannelFactory | undefined>(options.channelFactory);
  channelFactoryRef.current = options.channelFactory;

  const channelRef = useRef<PresentSessionChannel | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAckRef = useRef<Record<PresentDisplayRole, number>>({ audience: 0, presenter: 0 });
  const startedAtRef = useRef<number>(0);
  const lastSentSignatureRef = useRef<string>('');
  const handleMessageRef = useRef<(message: PresentSessionMessage) => void>(() => undefined);

  const buildSnapshot = useCallback((reason: PresentSessionSnapshotPayload['reason']): PresentSessionSnapshotPayload | null => {
    const source = snapshotProviderRef.current();
    if (!source) return null;
    const slides = source.slides;
    const index = clampIndex(source.index, slides.length);
    return {
      slides,
      // The wire carries the slides once; the design model never needs its own copy.
      presentData: { ...source.presentData, slides: [] },
      embeddedObjects: source.embeddedObjects,
      index,
      slideId: slides[index]?.id ?? null,
      startedAt: startedAtRef.current || Date.now(),
      reason,
    };
  }, []);

  const sendSnapshot = useCallback((reason: PresentSessionSnapshotPayload['reason']): boolean => {
    const channel = channelRef.current;
    if (!channel) return false;
    const payload = buildSnapshot(reason);
    if (!payload || !isPresentSnapshotSendable(payload)) return false;
    return channel.sendSnapshot(payload);
  }, [buildSnapshot]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(async (
    notice: PresentSessionNotice | null,
    sendEndReason: 'presenter-end' | 'editor-end' | 'session-lost' | null,
  ): Promise<void> => {
    const channel = channelRef.current;
    channelRef.current = null;
    stopHeartbeat();
    if (channel) {
      if (sendEndReason) channel.sendEnd(sendEndReason);
      channel.close();
    }
    const bridge = bridgeRef.current;
    await Promise.allSettled([bridge.close('audience'), bridge.close('presenter')]);
    startedAtRef.current = 0;
    lastAckRef.current = { audience: 0, presenter: 0 };
    lastSentSignatureRef.current = '';
    setState((previous) => ({
      ...previous,
      phase: 'ended',
      session: null,
      selection: null,
      startedAt: null,
      blackScreen: false,
      roles: IDLE_ROLES,
      notice,
    }));
  }, [stopHeartbeat]);

  const handleMessage = (message: PresentSessionMessage): void => {
    const senderRole = message.role;
    if (senderRole === 'editor') return;
    switch (message.type) {
      case 'hello':
        // A display window joined: answer with the pristine snapshot at the session start index.
        sendSnapshot('initial');
        return;
      case 'ack':
        lastAckRef.current[senderRole] = Date.now();
        setState((previous) => previous.roles[senderRole].ready
          ? previous
          : { ...previous, roles: { ...previous.roles, [senderRole]: { ready: true } } });
        return;
      case 'end':
        if (message.payload.reason === 'presenter-end') {
          void finish('ended-by-presenter', null);
        }
        return;
      case 'black':
        setState((previous) => previous.blackScreen === message.payload.enabled
          ? previous
          : { ...previous, blackScreen: message.payload.enabled });
        return;
      case 'goto':
        setState((previous) => previous.currentIndex === message.payload.index
          ? previous
          : { ...previous, currentIndex: message.payload.index });
        return;
      case 'snapshot':
      case 'ping':
      default:
        return;
    }
  };
  handleMessageRef.current = handleMessage;

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatTimerRef.current = setInterval(() => {
      const channel = channelRef.current;
      if (!channel) return;
      channel.sendPing();
      // A hidden/occluded editor window is throttled by the browser. It must not end a live show
      // because its own heartbeat slowed down; display-loss detection resumes when it is visible.
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      const roles = stateRef.current.roles;
      for (const role of ['audience', 'presenter'] as const) {
        const ack = lastAckRef.current[role];
        if (roles[role].ready && ack > 0 && now - ack > PRESENT_SESSION_DISPLAY_TIMEOUT_MS) {
          void finish(role === 'audience' ? 'window-lost-audience' : 'window-lost-presenter', 'session-lost');
          return;
        }
      }
      // A window that was opened by the bridge but never joined the session is a failure, not a
      // presentation with one silent screen: state it after a bounded start window.
      const startedAt = startedAtRef.current;
      if (startedAt > 0 && now - startedAt > PRESENT_SESSION_CONNECT_TIMEOUT_MS
        && (!roles.audience.ready || !roles.presenter.ready)) {
        void finish('window-unreachable', 'session-lost');
      }
    }, PRESENT_SESSION_HEARTBEAT_MS);
  }, [finish, stopHeartbeat]);

  const openRole = useCallback(async (
    bridge: PresentDisplayBridge,
    role: PresentDisplayRole,
    monitorIndex: number,
    session: string,
  ): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await bridge.open(role, monitorIndex, session);
        if (handle) return true;
      } catch {
        // A window left over from a just-ended session can still be registered; retry once.
      }
      if (attempt === 0) await retryDelay(250);
    }
    return false;
  }, []);

  const start = useCallback(async (selection: PresentSessionSelection): Promise<PresentSessionStartResult> => {
    const phase = stateRef.current.phase;
    if (phase === 'live' || phase === 'starting') return { ok: false, error: 'already-running' };
    const bridge = bridgeRef.current;
    if (!bridge.available()) return { ok: false, error: 'native-unavailable' };

    // A previous session may have crashed without closing its windows.
    await Promise.allSettled([bridge.close('audience'), bridge.close('presenter')]);

    const source = snapshotProviderRef.current();
    if (!source) return { ok: false, error: 'session-invalid' };

    let session: string;
    try {
      session = bridge.createSessionId();
    } catch {
      return { ok: false, error: 'session-invalid' };
    }
    if (!isPresentSessionId(session)) return { ok: false, error: 'session-invalid' };

    const channel = new PresentSessionChannel({
      session,
      role: 'editor',
      onMessage: (message) => handleMessageRef.current(message),
      channelFactory: channelFactoryRef.current,
    });
    if (!channel.available) return { ok: false, error: 'channel-unavailable' };

    startedAtRef.current = Date.now();
    const initialSnapshot = buildSnapshot('initial');
    if (!initialSnapshot || !isPresentSnapshotSendable(initialSnapshot)) {
      channel.close();
      return { ok: false, error: 'snapshot-too-large' };
    }

    channelRef.current = channel;
    setState({ ...INITIAL_STATE, phase: 'starting', session, selection });

    const opened: PresentDisplayRole[] = [];
    const audienceOpened = await openRole(bridge, 'audience', selection.audienceMonitorIndex, session);
    if (audienceOpened) opened.push('audience');
    const presenterOpened = audienceOpened
      ? await openRole(bridge, 'presenter', selection.presenterMonitorIndex, session)
      : false;
    if (presenterOpened) opened.push('presenter');

    if (opened.length < 2) {
      channel.close();
      channelRef.current = null;
      await Promise.allSettled(opened.map((role) => bridge.close(role)));
      startedAtRef.current = 0;
      setState(INITIAL_STATE);
      return { ok: false, error: 'open-failed' };
    }

    lastAckRef.current = { audience: 0, presenter: 0 };
    lastSentSignatureRef.current = options.deckSignature ?? '';
    setState({
      ...INITIAL_STATE,
      phase: 'live',
      session,
      selection,
      startedAt: initialSnapshot.startedAt,
      currentIndex: initialSnapshot.index,
      slideCount: initialSnapshot.slides.length,
      roles: IDLE_ROLES,
    });
    channel.sendSnapshot(initialSnapshot);
    startHeartbeat();
    return { ok: true };
  }, [buildSnapshot, openRole, options.deckSignature, startHeartbeat]);

  const stop = useCallback(async (): Promise<void> => {
    if (stateRef.current.phase !== 'live' && stateRef.current.phase !== 'starting') return;
    await finish('ended-by-editor', 'editor-end');
  }, [finish]);

  const setBlack = useCallback((enabled: boolean): void => {
    channelRef.current?.sendBlack(enabled);
    setState((previous) => previous.blackScreen === enabled ? previous : { ...previous, blackScreen: enabled });
  }, []);

  const clearNotice = useCallback((): void => {
    setState((previous) => previous.notice === null ? previous : { ...previous, notice: null });
  }, []);

  // A deck edit during the show is re-sent as an `update` snapshot; receivers keep their position.
  useEffect(() => {
    if (state.phase !== 'live') return;
    const signature = options.deckSignature ?? '';
    if (signature === lastSentSignatureRef.current) return;
    lastSentSignatureRef.current = signature;
    const channel = channelRef.current;
    if (!channel) return;
    const payload = buildSnapshot('update');
    if (!payload || !isPresentSnapshotSendable(payload)) return;
    channel.sendSnapshot(payload);
    setState((previous) => previous.slideCount === payload.slides.length
      ? previous
      : { ...previous, slideCount: payload.slides.length });
  }, [buildSnapshot, options.deckSignature, state.phase]);

  // Unmount is the last safety net: close the channel and both native windows without setState.
  useEffect(() => () => {
    stopHeartbeat();
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      channel.sendEnd('session-lost');
      channel.close();
      const bridge = bridgeRef.current;
      void Promise.allSettled([bridge.close('audience'), bridge.close('presenter')]);
    }
  }, [stopHeartbeat]);

  return { state, start, stop, setBlack, clearNotice };
}
