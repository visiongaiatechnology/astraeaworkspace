// STATUS: PLATIN — BroadcastChannel transport for the Present multi-display session.
//
// One channel object per window. The class owns the envelope (version, session, sender id, role) and
// validates every received payload through `normalizePresentSessionMessage` before handing it to the
// runtime. `PresentHelloLoop` is the bounded race-safety rule: a display that joined after the editor
// broadcast its snapshot repeats `hello` until the snapshot arrives or the 2 s budget is spent.
import {
  createPresentSessionSenderId,
  isPresentSessionId,
  normalizePresentSessionMessage,
  presentSessionChannelName,
  PRESENT_SESSION_SNAPSHOT_RETRY_MS,
  PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS,
  type PresentSessionMessage,
  type PresentSessionOutbound,
  type PresentSessionRole,
} from './presentSessionProtocol';

export interface PresentChannelLike {
  postMessage(data: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type PresentChannelFactory = (name: string) => PresentChannelLike | null;

/** BroadcastChannel is same-origin only; an unavailable browser falls back to the single-screen mode. */
export function defaultPresentChannelFactory(name: string): PresentChannelLike | null {
  if (typeof BroadcastChannel !== 'function') return null;
  try {
    return new BroadcastChannel(name) as unknown as PresentChannelLike;
  } catch {
    return null;
  }
}

export interface PresentSessionChannelOptions {
  readonly session: string;
  readonly role: PresentSessionRole;
  readonly onMessage: (message: PresentSessionMessage) => void;
  readonly senderId?: string;
  readonly channelFactory?: PresentChannelFactory;
}

export class PresentSessionChannel {
  readonly session: string;
  readonly role: PresentSessionRole;
  readonly senderId: string;
  readonly available: boolean;
  private readonly channel: PresentChannelLike | null;
  private readonly onMessage: (message: PresentSessionMessage) => void;
  private closed = false;

  constructor(options: PresentSessionChannelOptions) {
    this.session = options.session;
    this.role = options.role;
    this.senderId = options.senderId?.slice(0, 256) || createPresentSessionSenderId();
    this.onMessage = options.onMessage;
    const factory = options.channelFactory ?? defaultPresentChannelFactory;
    this.channel = isPresentSessionId(options.session) ? factory(presentSessionChannelName(options.session)) : null;
    this.available = this.channel !== null;
    if (this.channel) {
      this.channel.onmessage = (event: { data: unknown }) => {
        if (this.closed) return;
        const message = normalizePresentSessionMessage(event.data, this.session);
        if (!message) return;
        if (message.senderId === this.senderId) return;
        this.onMessage(message);
      };
    }
  }

  /** Posts one outbound message. Returns `false` when the channel is unavailable or the post failed. */
  post(outbound: PresentSessionOutbound): boolean {
    if (this.closed || !this.channel) return false;
    try {
      this.channel.postMessage({
        v: 1,
        session: this.session,
        senderId: this.senderId,
        role: this.role,
        ...outbound,
      });
      return true;
    } catch {
      return false;
    }
  }

  sendHello(): boolean {
    return this.post({ type: 'hello' });
  }

  sendSnapshot(payload: Extract<PresentSessionOutbound, { type: 'snapshot' }>['payload']): boolean {
    return this.post({ type: 'snapshot', payload });
  }

  sendGoto(payload: Extract<PresentSessionOutbound, { type: 'goto' }>['payload']): boolean {
    return this.post({ type: 'goto', payload });
  }

  sendBlack(enabled: boolean): boolean {
    return this.post({ type: 'black', payload: { enabled } });
  }

  sendEnd(reason: Extract<PresentSessionOutbound, { type: 'end' }>['payload']['reason']): boolean {
    return this.post({ type: 'end', payload: { reason } });
  }

  sendPing(): boolean {
    return this.post({ type: 'ping' });
  }

  sendAck(ready: boolean): boolean {
    return this.post({ type: 'ack', payload: { ready } });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.channel) {
      this.channel.onmessage = null;
      try {
        this.channel.close();
      } catch {
        // A channel that is already gone needs no further cleanup.
      }
    }
  }
}

export interface PresentHelloLoopOptions {
  readonly sendHello: () => unknown;
  readonly onTimeout: () => void;
  readonly retryMs?: number;
  readonly timeoutMs?: number;
  /** Injected for deterministic tests; defaults to the window timers. */
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

/**
 * Sends `hello` immediately and repeats it every `retryMs` until `notifySnapshot()` or `timeoutMs`.
 * This closes the join race: a display window can be ready before the editor created its channel.
 */
export class PresentHelloLoop {
  private readonly options: PresentHelloLoopOptions;
  private timer: unknown = null;
  private deadlineTimer: unknown = null;
  private waiting = false;
  private startedAt = 0;

  constructor(options: PresentHelloLoopOptions) {
    this.options = options;
  }

  private schedule(callback: () => void, delayMs: number): unknown {
    if (this.options.schedule) return this.options.schedule(callback, delayMs);
    return setTimeout(callback, delayMs);
  }

  private cancel(handle: unknown): void {
    if (handle === null || handle === undefined) return;
    if (this.options.cancel) {
      this.options.cancel(handle);
      return;
    }
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }

  start(): void {
    this.stop();
    this.waiting = true;
    this.startedAt = Date.now();
    const retryMs = Math.max(50, this.options.retryMs ?? PRESENT_SESSION_SNAPSHOT_RETRY_MS);
    const timeoutMs = Math.max(retryMs, this.options.timeoutMs ?? PRESENT_SESSION_SNAPSHOT_TIMEOUT_MS);
    this.options.sendHello();
    const retry = () => {
      if (!this.waiting) return;
      this.options.sendHello();
      this.timer = this.schedule(retry, retryMs);
    };
    this.timer = this.schedule(retry, retryMs);
    this.deadlineTimer = this.schedule(() => {
      if (!this.waiting) return;
      this.waiting = false;
      this.clearTimers();
      this.options.onTimeout();
    }, timeoutMs);
  }

  /** Called when any snapshot arrived; stops the retry loop. Returns whether it was still waiting. */
  notifySnapshot(): boolean {
    if (!this.waiting) return false;
    this.waiting = false;
    this.clearTimers();
    return true;
  }

  get isWaiting(): boolean {
    return this.waiting;
  }

  get elapsedMs(): number {
    return this.startedAt === 0 ? 0 : Date.now() - this.startedAt;
  }

  stop(): void {
    this.waiting = false;
    this.clearTimers();
  }

  private clearTimers(): void {
    this.cancel(this.timer);
    this.cancel(this.deadlineTimer);
    this.timer = null;
    this.deadlineTimer = null;
  }
}
