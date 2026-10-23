// STATUS: GOLD — Present Runde 42: BroadcastChannel session bus, race-safe hello and bounded retries.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PresentHelloLoop,
  PresentSessionChannel,
} from '../../presentation/session/presentSessionBus';
import {
  PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS,
  type PresentSessionMessage,
  type PresentSessionSnapshotPayload,
} from '../../presentation/session/presentSessionProtocol';
import { createPresentSessionTestHub } from './presentSessionTestHub';
import type { PresentSlide } from '../../../../shared/contracts/workspace';

const SESSION = 'present-bus-session';

const SLIDE: PresentSlide = {
  id: 'slide-1',
  title: 'Opening',
  subtitle: '',
  layout: 'blank',
  speakerNotes: 'Say hello.',
} as PresentSlide;

function snapshotPayload(): PresentSessionSnapshotPayload {
  return {
    slides: [SLIDE],
    presentData: { slides: [] },
    embeddedObjects: [],
    index: 0,
    slideId: SLIDE.id,
    startedAt: 1_700_000_000_000,
    reason: 'initial',
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Present session bus', () => {
  it('answers a display hello with the deck snapshot and rejects foreign sessions', () => {
    const hub = createPresentSessionTestHub();
    const editorMessages: PresentSessionMessage[] = [];
    const editor = new PresentSessionChannel({
      session: SESSION,
      role: 'editor',
      channelFactory: hub.factory,
      onMessage: (message) => {
        editorMessages.push(message);
        if (message.type === 'hello') editor.sendSnapshot(snapshotPayload());
      },
    });
    const displayMessages: PresentSessionMessage[] = [];
    const display = new PresentSessionChannel({
      session: SESSION,
      role: 'audience',
      senderId: 'audience-window',
      channelFactory: hub.factory,
      onMessage: (message) => displayMessages.push(message),
    });
    const rogue = new PresentSessionChannel({
      session: 'foreign-session',
      role: 'presenter',
      channelFactory: hub.factory,
      onMessage: () => undefined,
    });

    expect(editor.available).toBe(true);
    display.sendHello();
    expect(editorMessages.map((message) => message.type)).toEqual(['hello']);
    expect(displayMessages.map((message) => message.type)).toEqual(['snapshot']);
    expect(displayMessages[0]?.role).toBe('editor');

    rogue.sendGoto({ index: 3, clickGroupIndex: 0, slideId: null });
    expect(displayMessages).toHaveLength(1);

    display.sendGoto({ index: 1, clickGroupIndex: 0, slideId: 'slide-2' });
    expect(displayMessages).toHaveLength(1);
  });

  it('delivers presenter navigation and black-screen commands to the audience window', () => {
    const hub = createPresentSessionTestHub();
    const audienceMessages: PresentSessionMessage[] = [];
    // The audience channel is retained by the hub; only its received messages are asserted here.
    new PresentSessionChannel({
      session: SESSION,
      role: 'audience',
      channelFactory: hub.factory,
      onMessage: (message) => audienceMessages.push(message),
    });
    const presenter = new PresentSessionChannel({
      session: SESSION,
      role: 'presenter',
      channelFactory: hub.factory,
      onMessage: () => undefined,
    });

    presenter.sendGoto({ index: 2, clickGroupIndex: 1, slideId: 'slide-3' });
    presenter.sendBlack(true);
    presenter.sendEnd('presenter-end');

    expect(audienceMessages.map((message) => message.type)).toEqual(['goto', 'black', 'end']);
    const goto = audienceMessages[0];
    expect(goto?.type === 'goto' ? goto.payload : null).toEqual({
      index: 2,
      clickGroupIndex: 1,
      slideId: 'slide-3',
    });
  });

  it('stops delivery after close and exposes unavailable channels explicitly', () => {
    const hub = createPresentSessionTestHub();
    const receiverMessages: PresentSessionMessage[] = [];
    const receiver = new PresentSessionChannel({
      session: SESSION,
      role: 'audience',
      channelFactory: hub.factory,
      onMessage: (message) => receiverMessages.push(message),
    });
    const sender = new PresentSessionChannel({
      session: SESSION,
      role: 'presenter',
      channelFactory: hub.factory,
      onMessage: () => undefined,
    });

    sender.sendBlack(true);
    expect(receiverMessages).toHaveLength(1);
    receiver.close();
    sender.sendBlack(false);
    expect(receiverMessages).toHaveLength(1);
    expect(sender.post({ type: 'ping' })).toBe(true);
    sender.close();
    expect(sender.post({ type: 'ping' })).toBe(false);

    const unavailable = new PresentSessionChannel({
      session: SESSION,
      role: 'audience',
      channelFactory: () => null,
      onMessage: () => undefined,
    });
    expect(unavailable.available).toBe(false);
    expect(unavailable.sendHello()).toBe(false);
  });

  it('repeats hello until the snapshot arrives', () => {
    vi.useFakeTimers();
    const sendHello = vi.fn();
    const onTimeout = vi.fn();
    const loop = new PresentHelloLoop({ sendHello, onTimeout });
    loop.start();
    expect(sendHello).toHaveBeenCalledTimes(1);
    expect(loop.isWaiting).toBe(true);

    vi.advanceTimersByTime(PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS / 2);
    expect(sendHello.mock.calls.length).toBeGreaterThan(2);

    expect(loop.notifySnapshot()).toBe(true);
    expect(loop.isWaiting).toBe(false);
    const callsAfterSnapshot = sendHello.mock.calls.length;
    vi.advanceTimersByTime(PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS * 2);
    expect(sendHello).toHaveBeenCalledTimes(callsAfterSnapshot);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('times out after two seconds without a snapshot and stops retrying', () => {
    vi.useFakeTimers();
    const sendHello = vi.fn();
    const onTimeout = vi.fn();
    const loop = new PresentHelloLoop({ sendHello, onTimeout });
    loop.start();
    vi.advanceTimersByTime(PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(loop.isWaiting).toBe(false);
    const callsAtTimeout = sendHello.mock.calls.length;
    vi.advanceTimersByTime(PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS * 3);
    expect(sendHello).toHaveBeenCalledTimes(callsAtTimeout);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
