// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — minimal bounded transport for the vendored PDF.js worker protocol.

const CALLBACK_DATA = 1;
const CALLBACK_ERROR = 2;
const STREAM_CANCEL = 1;
const STREAM_CANCEL_COMPLETE = 2;
const STREAM_CLOSE = 3;
const STREAM_ENQUEUE = 4;
const STREAM_ERROR = 5;
const STREAM_PULL = 6;
const STREAM_PULL_COMPLETE = 7;
const STREAM_START_COMPLETE = 8;

interface PdfJsMessage {
  sourceName?: string;
  targetName?: string;
  action?: string;
  data?: unknown;
  callbackId?: number;
  callback?: number;
  reason?: PdfJsSerializedError;
  stream?: number;
  streamId?: number;
  desiredSize?: number;
  chunk?: unknown;
  success?: boolean;
}

export interface PdfJsSerializedError {
  name: string;
  message: string;
  code?: number;
  status?: number;
  missing?: boolean;
  details?: string;
}

interface PdfJsCallbackCapability {
  resolve(value: unknown): void;
  reject(reason: Error): void;
}

interface PdfJsStreamControllerState {
  controller: ReadableStreamDefaultController<unknown>;
  startResolve: () => void;
  startReject: (reason: Error) => void;
  pullResolve?: () => void;
  pullReject?: (reason: Error) => void;
  cancelResolve?: () => void;
  cancelReject?: (reason: Error) => void;
  closed: boolean;
}

interface PdfJsSinkState {
  desiredSize: number;
  readyResolve?: () => void;
  onPull?: () => Promise<void> | void;
  onCancel?: (reason: Error) => Promise<void> | void;
  cancelled: boolean;
}

type PdfJsActionHandler = (data: unknown, sink?: PdfJsSink) => unknown | Promise<unknown>;

interface PdfJsSink {
  enqueue(chunk: unknown, size?: number, transfers?: Transferable[]): void;
  close(): void;
  error(reason: Error): void;
  readonly desiredSize: number;
  readonly cancelled: boolean;
  onPull?: () => Promise<void> | void;
  onCancel?: (reason: Error) => Promise<void> | void;
}

const toSerializedError = (reason: unknown): PdfJsSerializedError => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  return {
    name: error.name || 'UnknownErrorException',
    message: error.message || 'PDF.js worker operation failed',
    details: error.stack || error.message,
  };
};

export const fromSerializedError = (reason: PdfJsSerializedError | undefined): Error => {
  const error = new Error(reason?.message || 'PDF.js worker operation failed');
  error.name = reason?.name || 'UnknownErrorException';
  return error;
};

export class PdfJsMessageHandler {
  private callbackId = 1;
  private streamId = 1;
  private readonly callbacks = new Map<number, PdfJsCallbackCapability>();
  private readonly streams = new Map<number, PdfJsStreamControllerState>();
  private readonly sinks = new Map<number, PdfJsSinkState>();
  private readonly actions = new Map<string, PdfJsActionHandler>();
  private readonly abortController = new AbortController();

  constructor(
    private readonly sourceName: string,
    private readonly targetName: string,
    private readonly port: Worker,
  ) {
    port.addEventListener('message', this.handleMessage, { signal: this.abortController.signal });
  }

  on(action: string, handler: PdfJsActionHandler): void {
    if (this.actions.has(action)) throw new Error(`PDF.js action already registered: ${action}`);
    this.actions.set(action, handler);
  }

  send(action: string, data: unknown, transfers?: Transferable[]): void {
    this.port.postMessage({ sourceName: this.sourceName, targetName: this.targetName, action, data }, transfers ?? []);
  }

  sendWithPromise<T>(action: string, data: unknown, transfers?: Transferable[]): Promise<T> {
    const callbackId = this.callbackId++;
    return new Promise<T>((resolve, reject) => {
      this.callbacks.set(callbackId, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      try {
        this.port.postMessage({ sourceName: this.sourceName, targetName: this.targetName, action, callbackId, data }, transfers ?? []);
      } catch (error) {
        this.callbacks.delete(callbackId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  sendWithStream(action: string, data: unknown, strategy: QueuingStrategy<unknown> = { highWaterMark: 32 }): ReadableStream<unknown> {
    const streamId = this.streamId++;
    const sourceName = this.sourceName;
    const targetName = this.targetName;
    const port = this.port;
    return new ReadableStream<unknown>({
      start: (controller) => {
        let startResolve!: () => void;
        let startReject!: (reason: Error) => void;
        const started = new Promise<void>((resolve, reject) => {
          startResolve = resolve;
          startReject = reject;
        });
        this.streams.set(streamId, { controller, startResolve, startReject, closed: false });
        port.postMessage({
          sourceName,
          targetName,
          action,
          streamId,
          data,
          desiredSize: controller.desiredSize,
        });
        return started;
      },
      pull: (controller) => {
        const state = this.streams.get(streamId);
        if (!state || state.closed) return undefined;
        return new Promise<void>((resolve, reject) => {
          state.pullResolve = resolve;
          state.pullReject = reject;
          port.postMessage({
            sourceName,
            targetName,
            stream: STREAM_PULL,
            streamId,
            desiredSize: controller.desiredSize,
          });
        });
      },
      cancel: (reason) => {
        const state = this.streams.get(streamId);
        if (!state || state.closed) return undefined;
        state.closed = true;
        const error = reason instanceof Error ? reason : new Error(String(reason || 'PDF.js stream cancelled'));
        return new Promise<void>((resolve, reject) => {
          state.cancelResolve = resolve;
          state.cancelReject = reject;
          port.postMessage({
            sourceName,
            targetName,
            stream: STREAM_CANCEL,
            streamId,
            reason: toSerializedError(error),
          });
        });
      },
    }, strategy);
  }

  destroy(): void {
    this.abortController.abort();
    for (const callback of this.callbacks.values()) callback.reject(new Error('PDF.js worker connection destroyed'));
    this.callbacks.clear();
    for (const state of this.streams.values()) {
      if (!state.closed) state.controller.error(new Error('PDF.js worker connection destroyed'));
    }
    this.streams.clear();
    this.sinks.clear();
    this.actions.clear();
  }

  private readonly handleMessage = (event: MessageEvent<PdfJsMessage>): void => {
    const message = event.data;
    if (!message || message.targetName !== this.sourceName) return;

    if (message.stream) {
      this.handleStreamMessage(message);
      return;
    }

    if (message.callback) {
      const callbackId = message.callbackId;
      if (!callbackId) return;
      const callback = this.callbacks.get(callbackId);
      if (!callback) return;
      this.callbacks.delete(callbackId);
      if (message.callback === CALLBACK_DATA) callback.resolve(message.data);
      else if (message.callback === CALLBACK_ERROR) callback.reject(fromSerializedError(message.reason));
      else callback.reject(new Error(`Unexpected PDF.js callback kind: ${message.callback}`));
      return;
    }

    const action = message.action;
    if (!action) return;
    const handler = this.actions.get(action);
    if (!handler) {
      if (message.callbackId) {
        this.port.postMessage({
          sourceName: this.sourceName,
          targetName: message.sourceName,
          callback: CALLBACK_ERROR,
          callbackId: message.callbackId,
          reason: toSerializedError(new Error(`Unsupported PDF.js worker callback: ${action}`)),
        });
      }
      return;
    }

    if (message.callbackId) {
      Promise.resolve(handler(message.data)).then(
        (value) => this.port.postMessage({
          sourceName: this.sourceName,
          targetName: message.sourceName,
          callback: CALLBACK_DATA,
          callbackId: message.callbackId,
          data: value,
        }),
        (reason) => this.port.postMessage({
          sourceName: this.sourceName,
          targetName: message.sourceName,
          callback: CALLBACK_ERROR,
          callbackId: message.callbackId,
          reason: toSerializedError(reason),
        }),
      );
      return;
    }

    if (message.streamId) {
      this.startSink(message, handler);
      return;
    }

    void Promise.resolve(handler(message.data));
  };

  private startSink(message: PdfJsMessage, handler: PdfJsActionHandler): void {
    const streamId = message.streamId!;
    const sourceName = this.sourceName;
    const targetName = message.sourceName || this.targetName;
    const port = this.port;
    const state: PdfJsSinkState = {
      desiredSize: message.desiredSize ?? 1,
      cancelled: false,
    };
    this.sinks.set(streamId, state);
    const sink: PdfJsSink = {
      get desiredSize() { return state.desiredSize; },
      get cancelled() { return state.cancelled; },
      onPull: undefined,
      onCancel: undefined,
      enqueue: (chunk, size = 1, transfers = []) => {
        if (state.cancelled) return;
        state.desiredSize -= size;
        port.postMessage({ sourceName, targetName, stream: STREAM_ENQUEUE, streamId, chunk }, transfers);
      },
      close: () => {
        if (state.cancelled) return;
        state.cancelled = true;
        port.postMessage({ sourceName, targetName, stream: STREAM_CLOSE, streamId });
        this.sinks.delete(streamId);
      },
      error: (reason) => {
        if (state.cancelled) return;
        state.cancelled = true;
        port.postMessage({ sourceName, targetName, stream: STREAM_ERROR, streamId, reason: toSerializedError(reason) });
        this.sinks.delete(streamId);
      },
    };
    Object.defineProperties(sink, {
      onPull: {
        get: () => state.onPull,
        set: (value: PdfJsSinkState['onPull']) => { state.onPull = value; },
      },
      onCancel: {
        get: () => state.onCancel,
        set: (value: PdfJsSinkState['onCancel']) => { state.onCancel = value; },
      },
    });
    Promise.resolve(handler(message.data, sink)).then(
      () => port.postMessage({ sourceName, targetName, stream: STREAM_START_COMPLETE, streamId, success: true }),
      (reason) => port.postMessage({ sourceName, targetName, stream: STREAM_START_COMPLETE, streamId, success: false, reason: toSerializedError(reason) }),
    );
  }

  private handleStreamMessage(message: PdfJsMessage): void {
    const streamId = message.streamId;
    if (!streamId) return;
    const stream = this.streams.get(streamId);
    const sink = this.sinks.get(streamId);
    switch (message.stream) {
      case STREAM_START_COMPLETE:
        if (!stream) return;
        if (message.success) stream.startResolve();
        else stream.startReject(fromSerializedError(message.reason));
        return;
      case STREAM_PULL_COMPLETE:
        if (!stream) return;
        if (message.success) stream.pullResolve?.();
        else stream.pullReject?.(fromSerializedError(message.reason));
        stream.pullResolve = undefined;
        stream.pullReject = undefined;
        return;
      case STREAM_PULL:
        if (!sink) {
          this.port.postMessage({ sourceName: this.sourceName, targetName: message.sourceName, stream: STREAM_PULL_COMPLETE, streamId, success: true });
          return;
        }
        sink.desiredSize = message.desiredSize ?? sink.desiredSize;
        Promise.resolve(sink.onPull?.()).then(
          () => this.port.postMessage({ sourceName: this.sourceName, targetName: message.sourceName, stream: STREAM_PULL_COMPLETE, streamId, success: true }),
          (reason) => this.port.postMessage({ sourceName: this.sourceName, targetName: message.sourceName, stream: STREAM_PULL_COMPLETE, streamId, success: false, reason: toSerializedError(reason) }),
        );
        return;
      case STREAM_ENQUEUE:
        if (stream && !stream.closed) stream.controller.enqueue(message.chunk);
        return;
      case STREAM_CLOSE:
        if (!stream || stream.closed) return;
        stream.closed = true;
        stream.controller.close();
        this.streams.delete(streamId);
        return;
      case STREAM_ERROR:
        if (!stream || stream.closed) return;
        stream.closed = true;
        stream.controller.error(fromSerializedError(message.reason));
        this.streams.delete(streamId);
        return;
      case STREAM_CANCEL_COMPLETE:
        if (!stream) return;
        if (message.success) stream.cancelResolve?.();
        else stream.cancelReject?.(fromSerializedError(message.reason));
        this.streams.delete(streamId);
        return;
      case STREAM_CANCEL:
        if (!sink) return;
        sink.cancelled = true;
        Promise.resolve(sink.onCancel?.(fromSerializedError(message.reason))).then(
          () => this.port.postMessage({ sourceName: this.sourceName, targetName: message.sourceName, stream: STREAM_CANCEL_COMPLETE, streamId, success: true }),
          (reason) => this.port.postMessage({ sourceName: this.sourceName, targetName: message.sourceName, stream: STREAM_CANCEL_COMPLETE, streamId, success: false, reason: toSerializedError(reason) }),
        );
        this.sinks.delete(streamId);
        return;
      default:
        return;
    }
  }
}

