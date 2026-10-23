import { describe, expect, it, vi } from 'vitest';
import {
  activateWhiteboardObjectInsertionSession,
  captureWhiteboardObjectInsertionToken,
  commitWhiteboardObjectInsertionIfCurrent,
  createWhiteboardObjectInsertionSession,
  invalidateWhiteboardObjectInsertionSession,
  isCurrentWhiteboardObjectInsertionToken,
} from '../../interactions/whiteboardObjectInsertionScope';

describe('Whiteboard object insertion lifecycle', () => {
  it('rejects tokens while the owner session is inactive', () => {
    const session = createWhiteboardObjectInsertionSession('document-a');
    expect(captureWhiteboardObjectInsertionToken(session, 'document-a')).toBeNull();
  });

  it('invalidates pending results on document change, including a switch back to the same ID', () => {
    const session = createWhiteboardObjectInsertionSession('document-a');
    activateWhiteboardObjectInsertionSession(session, 'document-a');
    const firstToken = captureWhiteboardObjectInsertionToken(session, 'document-a');
    expect(firstToken).not.toBeNull();
    invalidateWhiteboardObjectInsertionSession(session);
    activateWhiteboardObjectInsertionSession(session, 'document-b');
    activateWhiteboardObjectInsertionSession(session, 'document-a');
    expect(isCurrentWhiteboardObjectInsertionToken(session, firstToken!)).toBe(false);
  });

  it('rejects a callback captured for another document', () => {
    const session = createWhiteboardObjectInsertionSession('document-a');
    activateWhiteboardObjectInsertionSession(session, 'document-b');
    expect(captureWhiteboardObjectInsertionToken(session, 'document-a')).toBeNull();
    expect(captureWhiteboardObjectInsertionToken(session, 'document-b')).not.toBeNull();
  });

  it('invalidates in-flight work on unmount', () => {
    const session = createWhiteboardObjectInsertionSession('document-a');
    activateWhiteboardObjectInsertionSession(session, 'document-a');
    const token = captureWhiteboardObjectInsertionToken(session, 'document-a');
    expect(token).not.toBeNull();
    invalidateWhiteboardObjectInsertionSession(session);
    expect(isCurrentWhiteboardObjectInsertionToken(session, token!)).toBe(false);
  });

  it('does not call a stale commit callback', () => {
    const session = createWhiteboardObjectInsertionSession('document-a');
    activateWhiteboardObjectInsertionSession(session, 'document-a');
    const token = captureWhiteboardObjectInsertionToken(session, 'document-a');
    if (!token) throw new Error('Active document token was not created.');
    invalidateWhiteboardObjectInsertionSession(session);
    const commit = vi.fn(() => true);

    expect(commitWhiteboardObjectInsertionIfCurrent(session, token, commit)).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns the canonical commit result for a current token', () => {
    const session = createWhiteboardObjectInsertionSession('document-a');
    activateWhiteboardObjectInsertionSession(session, 'document-a');
    const token = captureWhiteboardObjectInsertionToken(session, 'document-a');
    if (!token) throw new Error('Active document token was not created.');
    const commit = vi.fn(() => false);

    expect(commitWhiteboardObjectInsertionIfCurrent(session, token, commit)).toBe(false);
    expect(commit).toHaveBeenCalledOnce();
  });
});
