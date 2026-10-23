// STATUS: PLATIN — deterministic in-memory stand-ins for BrowserChannel and the native display bridge.
//
// Tests of the Present presentation system must prove window-to-window behaviour without a second
// real window. The hub models a same-origin BroadcastChannel namespace: every channel created by the
// factory joins one hub, posts are cloned (like the structured-clone rule of BroadcastChannel) and
// delivered to every other open channel with the same name — never to the sender.
import type {
  PresentChannelFactory,
  PresentChannelLike,
} from '../../../../apps/present/presentation/session/presentSessionBus';
import { PresentSessionChannel } from '../../../../apps/present/presentation/session/presentSessionBus';
import type {
  PresentSessionMessage,
  PresentSessionSnapshotPayload,
} from '../../../../apps/present/presentation/session/presentSessionProtocol';
import type {
  PresentDisplayBridge,
} from '../../../../apps/present/presentation/editor/presentDisplayBridge';
import type { PresentMonitorInfo } from '../../../../platform/native/presentWindowBridge';
import type { PresentSlide } from '../../../../shared/contracts/workspace';

interface TestChannelRecord {
  readonly channel: TestPresentChannel;
  readonly name: string;
}

class TestPresentChannel implements PresentChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly name: string;
  closed = false;
  private readonly hub: PresentSessionTestHub;

  constructor(hub: PresentSessionTestHub, name: string) {
    this.hub = hub;
    this.name = name;
  }

  postMessage(data: unknown): void {
    if (this.closed) return;
    this.hub.post(this, data);
  }

  close(): void {
    this.closed = true;
  }

  deliver(data: unknown): void {
    if (this.closed) return;
    this.onmessage?.({ data });
  }
}

export interface PresentSessionTestHub {
  readonly factory: PresentChannelFactory;
  readonly channels: TestPresentChannel[];
  /** Messages delivered to a channel with the given role marker, in order. */
  post(sender: TestPresentChannel, data: unknown): void;
}

export function createPresentSessionTestHub(): PresentSessionTestHub {
  const records: TestChannelRecord[] = [];
  const hub: PresentSessionTestHub = {
    factory: (name: string) => {
      const channel = new TestPresentChannel(hub, name);
      records.push({ channel, name });
      return channel;
    },
    channels: [],
    post: (sender, data) => {
      const cloned = JSON.parse(JSON.stringify(data)) as unknown;
      for (const record of records) {
        if (record.channel === sender || record.channel.closed) continue;
        if (record.channel.name !== sender.name) continue;
        record.channel.deliver(cloned);
      }
    },
  };
  // `channels` is exposed as the live record list so tests can assert availability/cleanup.
  Object.defineProperty(hub, 'channels', {
    get: () => records.map((record) => record.channel),
  });
  return hub;
}

export function createMonitorFixture(overrides: Partial<PresentMonitorInfo>[] = []): PresentMonitorInfo[] {
  const base: PresentMonitorInfo = {
    index: 0,
    name: 'Display 1',
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    scaleFactor: 1,
    primary: true,
  };
  if (overrides.length === 0) {
    return [
      base,
      { ...base, index: 1, name: 'Display 2', x: 1920, primary: false },
    ];
  }
  return overrides.map((override, position) => ({
    ...base,
    index: override.index ?? position,
    name: override.name ?? `Display ${position + 1}`,
    ...override,
  }));
}

export interface FakePresentDisplayBridge {
  readonly bridge: PresentDisplayBridge;
  readonly openCalls: { role: 'audience' | 'presenter'; monitorIndex: number; session: string }[];
  readonly closeCalls: ('audience' | 'presenter')[];
  readonly sessionIds: string[];
  setAvailable(value: boolean): void;
  setOpenFailure(value: Error | null): void;
}

export function createFakePresentDisplayBridge(options: {
  available?: boolean;
  monitors?: PresentMonitorInfo[];
  openFailure?: Error | null;
  sessionId?: string;
} = {}): FakePresentDisplayBridge {
  let available = options.available ?? true;
  let openFailure = options.openFailure ?? null;
  const openCalls: FakePresentDisplayBridge['openCalls'] = [];
  const closeCalls: FakePresentDisplayBridge['closeCalls'] = [];
  const sessionIds: string[] = [];
  const bridge: PresentDisplayBridge = {
    available: () => available,
    createSessionId: () => {
      const session = options.sessionId ?? 'present-test-session';
      sessionIds.push(session);
      return session;
    },
    listMonitors: async () => options.monitors ?? createMonitorFixture(),
    open: async (role, monitorIndex, session) => {
      openCalls.push({ role, monitorIndex, session });
      if (openFailure) throw openFailure;
      return { role, label: `present-${role}`, session };
    },
    close: async (role) => {
      closeCalls.push(role);
    },
  };
  return {
    bridge,
    openCalls,
    closeCalls,
    sessionIds,
    setAvailable: (value: boolean) => { available = value; },
    setOpenFailure: (value: Error | null) => { openFailure = value; },
  };
}

export const TEST_DISPLAY_SLIDES: PresentSlide[] = [
  {
    id: 'slide-opening',
    title: 'Opening',
    subtitle: 'A subtitle',
    layout: 'blank',
    speakerNotes: 'Speaker says hello.',
  } as PresentSlide,
  {
    id: 'slide-closing',
    title: 'Closing',
    subtitle: '',
    layout: 'blank',
    speakerNotes: 'Thank you.',
  } as PresentSlide,
];

export function createDisplaySnapshot(
  overrides: Partial<PresentSessionSnapshotPayload> = {},
): PresentSessionSnapshotPayload {
  return {
    slides: TEST_DISPLAY_SLIDES,
    presentData: { slides: [], theme: 'dark' },
    embeddedObjects: [],
    index: 0,
    slideId: TEST_DISPLAY_SLIDES[0].id,
    startedAt: Date.now(),
    reason: 'initial',
    ...overrides,
  };
}

export interface EditorPeer {
  readonly channel: PresentSessionChannel;
  readonly received: PresentSessionMessage[];
}

/**
 * The editor side of the channel for display-window tests: answers `hello` with a snapshot and lets
 * the test post `goto`/`black`/`end` as if the presenter window did it.
 */
export function createEditorPeer(
  hub: PresentSessionTestHub,
  session: string,
  getSnapshot: () => PresentSessionSnapshotPayload,
): EditorPeer {
  const received: PresentSessionMessage[] = [];
  const channel = new PresentSessionChannel({
    session,
    role: 'editor',
    senderId: 'test-editor',
    channelFactory: hub.factory,
    onMessage: (message) => {
      received.push(message);
      if (message.type === 'hello') channel.sendSnapshot(getSnapshot());
    },
  });
  return { channel, received };
}

/** The presenter side of the channel for audience-display tests. */
export function createPresenterPeer(hub: PresentSessionTestHub, session: string): EditorPeer {
  const received: PresentSessionMessage[] = [];
  const channel = new PresentSessionChannel({
    session,
    role: 'presenter',
    senderId: 'test-presenter',
    channelFactory: hub.factory,
    onMessage: (message) => received.push(message),
  });
  return { channel, received };
}
