// STATUS: GOLD — Present Runde 42: the versioned session protocol is a hard input boundary.
import { describe, expect, it } from 'vitest';
import type { PresentSessionSnapshotPayload } from '../../presentation/session/presentSessionProtocol';
import {
  PRESENT_SESSION_MAX_SLIDES,
  PRESENT_SESSION_PROTOCOL_VERSION,
  isPresentSessionId,
  isPresentSnapshotSendable,
  normalizePresentSessionMessage,
  presentSessionChannelName,
} from '../../presentation/session/presentSessionProtocol';
import type { PresentSlide } from '../../../../shared/contracts/workspace';

const SESSION = 'present-42-test';

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: PRESENT_SESSION_PROTOCOL_VERSION,
    session: SESSION,
    senderId: 'sender-editor',
    role: 'editor',
    ...overrides,
  };
}

function slide(id: string, title: string, extra: Record<string, unknown> = {}): PresentSlide {
  return {
    id,
    title,
    subtitle: '',
    layout: 'blank',
    speakerNotes: `notes ${id}`,
    ...extra,
  } as PresentSlide;
}

function snapshotPayload(overrides: Partial<PresentSessionSnapshotPayload> = {}): PresentSessionSnapshotPayload {
  return {
    slides: [slide('s1', 'One'), slide('s2', 'Two')],
    presentData: { slides: [] },
    embeddedObjects: [],
    index: 0,
    slideId: 's1',
    startedAt: 1_700_000_000_000,
    reason: 'initial',
    ...overrides,
  };
}

describe('Present session protocol', () => {
  it('accepts only bounded session identifiers and builds one channel name', () => {
    expect(isPresentSessionId('present-42_A')).toBe(true);
    expect(isPresentSessionId('')).toBe(false);
    expect(isPresentSessionId('with space')).toBe(false);
    expect(isPresentSessionId('with/slash')).toBe(false);
    expect(isPresentSessionId('x'.repeat(65))).toBe(false);
    expect(presentSessionChannelName('present-42_A')).toBe('astraea-present-session-v1:present-42_A');
  });

  it('normalises every message type of the running session', () => {
    expect(normalizePresentSessionMessage(envelope({ type: 'hello', role: 'audience' }), SESSION)).toEqual({
      v: 1,
      session: SESSION,
      senderId: 'sender-editor',
      role: 'audience',
      type: 'hello',
    });
    expect(normalizePresentSessionMessage(envelope({ type: 'ping' }), SESSION)?.type).toBe('ping');
    expect(normalizePresentSessionMessage(envelope({
      type: 'ack',
      role: 'presenter',
      payload: { ready: true },
    }), SESSION)).toEqual({
      v: 1,
      session: SESSION,
      senderId: 'sender-editor',
      role: 'presenter',
      type: 'ack',
      payload: { ready: true },
    });
    const snapshot = normalizePresentSessionMessage(envelope({ type: 'snapshot', payload: snapshotPayload() }), SESSION);
    expect(snapshot?.type).toBe('snapshot');
    if (snapshot?.type === 'snapshot') {
      expect(snapshot.payload.slides.map((entry) => entry.title)).toEqual(['One', 'Two']);
      expect(snapshot.payload.reason).toBe('initial');
    }
  });

  it('rejects wrong version, wrong session, unknown type and malformed payloads', () => {
    expect(normalizePresentSessionMessage(envelope({ v: 2, type: 'hello' }), SESSION)).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'hello' }), 'another-session')).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'exec-shell' }), SESSION)).toBeNull();
    expect(normalizePresentSessionMessage('hello', SESSION)).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'goto', payload: { index: -1, clickGroupIndex: 0, slideId: null } }), SESSION)).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'goto', payload: { index: 0, clickGroupIndex: 0, slideId: null } }), SESSION)).not.toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'black', payload: { enabled: 'yes' } }), SESSION)).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'end', payload: { reason: 'because' } }), SESSION)).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'snapshot', payload: { slides: 'nope' } }), SESSION)).toBeNull();
    expect(normalizePresentSessionMessage(envelope({ type: 'snapshot', payload: snapshotPayload({ index: -3 }) }), SESSION)).toBeNull();
  });

  it('bounds the deck size and sanitises slide identity', () => {
    const tooMany = Array.from({ length: PRESENT_SESSION_MAX_SLIDES + 1 }, (_, index) => slide(`s${index}`, `T${index}`));
    expect(normalizePresentSessionMessage(envelope({
      type: 'snapshot',
      payload: snapshotPayload({ slides: tooMany }),
    }), SESSION)).toBeNull();

    expect(normalizePresentSessionMessage(envelope({
      type: 'snapshot',
      payload: snapshotPayload({ slides: [{ title: 'no id', subtitle: '', layout: 'blank' } as never] }),
    }), SESSION)).toBeNull();

    const sanitized = normalizePresentSessionMessage(envelope({
      type: 'snapshot',
      payload: snapshotPayload({ slides: [slide('s1', 7 as never)] }),
    }), SESSION);
    expect(sanitized?.type).toBe('snapshot');
    if (sanitized?.type === 'snapshot') expect(sanitized.payload.slides[0]?.title).toBe('');
  });

  it('does not resend a snapshot it cannot serialise', () => {
    expect(isPresentSnapshotSendable(snapshotPayload())).toBe(true);
    const circular: Record<string, unknown> = { slides: [] };
    circular.self = circular;
    expect(isPresentSnapshotSendable(circular as unknown as PresentSessionSnapshotPayload)).toBe(false);
  });
});
