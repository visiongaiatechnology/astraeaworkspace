// @vitest-environment happy-dom
// STATUS: GOLD — Present Runde 42: the editor owns the multi-display session lifecycle.
//
// Proves the full contract of `usePresentDisplaySession`: both native windows are opened with one
// session, a joining display receives the deck snapshot, acks mark it connected, presenter end/stop
// close both windows and clean the channel, an update snapshot is sent when the deck changes, and a
// closed display window ends the show instead of leaking a session.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  usePresentDisplaySession,
  type PresentDisplaySessionController,
} from '../../presentation/editor/usePresentDisplaySession';
import { PresentSessionChannel } from '../../presentation/session/presentSessionBus';
import type { PresentSessionMessage } from '../../presentation/session/presentSessionProtocol';
import {
  TEST_DISPLAY_SLIDES,
  createFakePresentDisplayBridge,
  createPresentSessionTestHub,
  type FakePresentDisplayBridge,
  type PresentSessionTestHub,
} from './presentSessionTestHub';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const SESSION = 'present-test-session';

interface HarnessHandle {
  controller: PresentDisplaySessionController | null;
}

interface HarnessProps {
  readonly bridge: FakePresentDisplayBridge['bridge'];
  readonly hub: PresentSessionTestHub;
  readonly handle: HarnessHandle;
  readonly signature: string;
}

function SessionHarness({ bridge, hub, handle, signature }: HarnessProps) {
  const controller = usePresentDisplaySession({
    bridge,
    channelFactory: hub.factory,
    snapshotProvider: () => ({
      slides: TEST_DISPLAY_SLIDES,
      presentData: { slides: [] },
      embeddedObjects: [],
      index: 0,
    }),
    deckSignature: signature,
  });
  handle.controller = controller;
  return createElement('div', {
    'data-present-session-phase': controller.state.phase,
    'data-present-session-ready-audience': controller.state.roles.audience.ready ? 'true' : 'false',
  });
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.useRealTimers();
});

async function mountSession(signature = 'v1'): Promise<{
  handle: HarnessHandle;
  hub: PresentSessionTestHub;
  bridge: FakePresentDisplayBridge;
  element: HTMLDivElement;
}> {
  const hub = createPresentSessionTestHub();
  const bridge = createFakePresentDisplayBridge({ sessionId: SESSION });
  const handle: HarnessHandle = { controller: null };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(SessionHarness, { bridge: bridge.bridge, hub, handle, signature }));
  });
  return { handle, hub, bridge, element: container };
}

function createDisplayChannel(
  hub: PresentSessionTestHub,
  role: 'audience' | 'presenter',
  session = SESSION,
): { channel: PresentSessionChannel; received: PresentSessionMessage[] } {
  const received: PresentSessionMessage[] = [];
  const channel = new PresentSessionChannel({
    session,
    role,
    channelFactory: hub.factory,
    onMessage: (message) => received.push(message),
  });
  return { channel, received };
}

async function startSession(handle: HarnessHandle): Promise<void> {
  await act(async () => {
    await handle.controller?.start({ audienceMonitorIndex: 1, presenterMonitorIndex: 0 });
  });
  await act(async () => undefined);
}

describe('Present display session controller', () => {
  it('opens projector and presenter windows on the chosen monitors with one shared session', async () => {
    const { handle, bridge, element } = await mountSession();
    await startSession(handle);
    expect(handle.controller?.state.phase).toBe('live');
    expect(element.querySelector('[data-present-session-phase]')?.getAttribute('data-present-session-phase')).toBe('live');
    expect(bridge.sessionIds).toHaveLength(1);
    expect(bridge.openCalls).toEqual([
      { role: 'audience', monitorIndex: 1, session: SESSION },
      { role: 'presenter', monitorIndex: 0, session: SESSION },
    ]);
    expect(handle.controller?.state.startedAt).not.toBeNull();
  });

  it('answers a display hello with the deck snapshot and tracks the ack', async () => {
    const { handle, hub, element } = await mountSession();
    await startSession(handle);
    const audience = createDisplayChannel(hub, 'audience');

    await act(async () => audience.channel.sendHello());
    const snapshot = audience.received.find((message) => message.type === 'snapshot');
    expect(snapshot).toBeDefined();
    if (snapshot?.type === 'snapshot') {
      expect(snapshot.payload.slides.map((slide) => slide.title)).toEqual(['Opening', 'Closing']);
      expect(snapshot.payload.reason).toBe('initial');
      expect(snapshot.session).toBe(SESSION);
    }

    await act(async () => audience.channel.sendAck(true));
    expect(handle.controller?.state.roles.audience.ready).toBe(true);
    expect(element.querySelector('[data-present-session-ready-audience]')?.getAttribute('data-present-session-ready-audience')).toBe('true');
  });

  it('ends the session and closes both windows when the presenter ends it', async () => {
    const { handle, hub, bridge } = await mountSession();
    await startSession(handle);
    const presenter = createDisplayChannel(hub, 'presenter');

    await act(async () => presenter.channel.sendEnd('presenter-end'));
    await act(async () => undefined);

    expect(handle.controller?.state.phase).toBe('ended');
    expect(handle.controller?.state.notice).toBe('ended-by-presenter');
    expect(bridge.closeCalls).toContain('audience');
    expect(bridge.closeCalls).toContain('presenter');
    // A message after teardown must not resurrect the session.
    await act(async () => presenter.channel.sendGoto({ index: 1, clickGroupIndex: 0, slideId: null }));
    expect(handle.controller?.state.phase).toBe('ended');
  });

  it('stops on request, closes both windows and reports the cause', async () => {
    const { handle, bridge } = await mountSession();
    await startSession(handle);
    await act(async () => {
      await handle.controller?.stop();
    });
    expect(handle.controller?.state.phase).toBe('ended');
    expect(handle.controller?.state.notice).toBe('ended-by-editor');
    expect(bridge.closeCalls.filter((role) => role === 'audience').length).toBeGreaterThanOrEqual(2);
    expect(bridge.closeCalls.filter((role) => role === 'presenter').length).toBeGreaterThanOrEqual(2);
  });

  it('reports a failed window start instead of pretending the show is live', async () => {
    const { handle, bridge } = await mountSession();
    bridge.setOpenFailure(new Error('Der Present-Bildschirm ist bereits geöffnet'));
    const startResult: { value: { ok: boolean; error?: string } | null } = { value: null };
    await act(async () => {
      startResult.value = (await handle.controller?.start({ audienceMonitorIndex: 1, presenterMonitorIndex: 0 })) ?? null;
    });
    expect(startResult.value?.ok).toBe(false);
    expect(startResult.value?.error).toBe('open-failed');
    expect(handle.controller?.state.phase).toBe('idle');
  });

  it('broadcasts an update snapshot when the deck changes during the show', async () => {
    const { handle, hub } = await mountSession('v1');
    await startSession(handle);
    const audience = createDisplayChannel(hub, 'audience');
    await act(async () => audience.channel.sendHello());
    expect(audience.received.filter((message) => message.type === 'snapshot')).toHaveLength(1);

    await act(async () => {
      root?.render(createElement(SessionHarness, {
        bridge: createFakePresentDisplayBridge({ sessionId: SESSION }).bridge,
        hub,
        handle,
        signature: 'v2',
      }));
    });
    const snapshots = audience.received.filter((message) => message.type === 'snapshot');
    expect(snapshots).toHaveLength(2);
    const update = snapshots[1];
    expect(update?.type === 'snapshot' ? update.payload.reason : null).toBe('update');
  });

  it('reports a display window that never connects instead of waiting forever', async () => {
    vi.useFakeTimers();
    const { handle } = await mountSession();
    await startSession(handle);
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });
    await act(async () => undefined);
    expect(handle.controller?.state.phase).toBe('ended');
    expect(handle.controller?.state.notice).toBe('window-unreachable');
  });

  it('ends the show when a previously connected display window goes silent', async () => {
    vi.useFakeTimers();
    const { handle, hub } = await mountSession();
    await startSession(handle);
    const audience = createDisplayChannel(hub, 'audience');
    await act(async () => audience.channel.sendHello());
    await act(async () => audience.channel.sendAck(true));
    expect(handle.controller?.state.roles.audience.ready).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(4_500);
    });
    await act(async () => undefined);
    expect(handle.controller?.state.phase).toBe('ended');
    expect(handle.controller?.state.notice).toBe('window-lost-audience');
  });
});
