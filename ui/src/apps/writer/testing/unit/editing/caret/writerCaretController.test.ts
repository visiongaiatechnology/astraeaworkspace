// STATUS: PLATIN — Writer caret transfer channel contracts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLastWriterCaretRequest,
  requestWriterCaret,
  requestWriterCaretAfterLayout,
  resetWriterCaretController,
  setWriterCaretScheduler,
  subscribeWriterCaret,
  type WriterCaretRequest,
} from '../../../../editing/caret/writerCaretController';

describe('Writer caret controller', () => {
  beforeEach(() => {
    resetWriterCaretController();
  });

  it('delivers a request to every subscriber with a strictly increasing token', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeWriterCaret(first);
    subscribeWriterCaret(second);

    const requestA = requestWriterCaret({ paragraphId: 'p1', start: 3, origin: 'enter' });
    const requestB = requestWriterCaret({ paragraphId: 'p2', start: 0, origin: 'split' });

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(requestB.token).toBeGreaterThan(requestA.token);
    expect(first.mock.calls[1]?.[0]).toMatchObject({ paragraphId: 'p2', origin: 'split' });

    unsubscribeFirst();
    requestWriterCaret({ paragraphId: 'p3', start: 0, origin: 'merge' });
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
  });

  it('keeps the last request available for a paragraph that mounts afterwards', () => {
    requestWriterCaret({ paragraphId: 'p-new', start: 4, origin: 'enter' });
    const pending = getLastWriterCaretRequest();
    expect(pending).not.toBeNull();
    expect(pending).toMatchObject({ paragraphId: 'p-new', start: 4, end: 4, origin: 'enter' });
  });

  it('normalizes negative, fractional and inverted ranges', () => {
    const request = requestWriterCaret({ paragraphId: 'p1', start: -9, end: -2, origin: 'api' });
    expect(request.start).toBe(0);
    expect(request.end).toBe(0);
    const fractional = requestWriterCaret({ paragraphId: 'p1', start: 2.8, end: 1.2, origin: 'api' });
    expect(fractional.start).toBe(2);
    expect(fractional.end).toBe(2);
    const nonFinite = requestWriterCaret({ paragraphId: 'p1', start: Number.NaN, origin: 'api' });
    expect(nonFinite.start).toBe(0);
  });

  it('tolerates a subscriber that unsubscribes during delivery', () => {
    const seen: WriterCaretRequest[] = [];
    const unsubscribe = subscribeWriterCaret((request) => {
      seen.push(request);
      unsubscribe();
    });
    requestWriterCaret({ paragraphId: 'p1', start: 0, origin: 'api' });
    requestWriterCaret({ paragraphId: 'p1', start: 1, origin: 'api' });
    expect(seen).toHaveLength(1);
  });

  describe('deferred delivery after layout', () => {
    it('records the request immediately but delivers it only when the frame runs', () => {
      const pendingCallbacks: Array<() => void> = [];
      setWriterCaretScheduler((callback) => { pendingCallbacks.push(callback); });
      const listener = vi.fn();
      subscribeWriterCaret(listener);

      const request = requestWriterCaretAfterLayout({ paragraphId: 'p1', start: 42, origin: 'pagination' });

      expect(listener).not.toHaveBeenCalled();
      // A fragment that mounts before the frame still finds the request.
      expect(getLastWriterCaretRequest()).toMatchObject({ paragraphId: 'p1', start: 42 });

      expect(pendingCallbacks).toHaveLength(1);
      pendingCallbacks[0]?.();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        token: request.token,
        paragraphId: 'p1',
        start: 42,
        origin: 'pagination',
      }));
    });

    it('keeps the token order when several deferred requests are queued', () => {
      const pendingCallbacks: Array<() => void> = [];
      setWriterCaretScheduler((callback) => { pendingCallbacks.push(callback); });
      const tokens: number[] = [];
      subscribeWriterCaret((request) => { tokens.push(request.token); });

      requestWriterCaretAfterLayout({ paragraphId: 'p1', start: 1, origin: 'pagination' });
      requestWriterCaretAfterLayout({ paragraphId: 'p1', start: 2, origin: 'pagination' });
      requestWriterCaretAfterLayout({ paragraphId: 'p1', start: 3, origin: 'pagination' });
      for (const callback of pendingCallbacks) callback();

      expect(tokens).toEqual([...tokens].sort((a, b) => a - b));
      expect(tokens).toHaveLength(3);
      expect(getLastWriterCaretRequest()?.start).toBe(3);
    });

    it('restores the frame scheduler on reset', () => {
      setWriterCaretScheduler(vi.fn());
      resetWriterCaretController();
      // No scheduler is left over from the previous test: the default path runs.
      expect(() => requestWriterCaretAfterLayout({ paragraphId: 'p1', start: 0, origin: 'api' })).not.toThrow();
    });
  });
});
