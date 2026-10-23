// BATCH-PRESENT — media preview consent contract (Paket 22).
//
// The measured defect: the media dialog rendered `<video src={draftUrl}>` directly from the URL
// field, so typing a URL made the browser contact that host before any validation and without
// consent. `resolvePresentMediaPreview` is now the only decision point; these tests state which
// inputs may produce a `src` at all.

import { describe, expect, it } from 'vitest';
import {
  isPresentExternalMediaUrlAllowed,
  presentMediaUrlHost,
  resolvePresentMediaPreview,
} from '../../media/presentMediaPreview';

describe('resolvePresentMediaPreview', () => {
  it('never returns a src for an unapproved external URL', () => {
    const decision = resolvePresentMediaPreview({
      mode: 'external',
      externalUrl: 'https://example.com/movie.mp4',
      externalPreviewApproved: false,
      mediaKind: 'video',
    });
    expect(decision.src).toBeNull();
    expect(decision.noticeKind).toBe('awaiting-consent');
    expect(decision.contactsHost).toBe(true);
    expect(decision.host).toBe('example.com');
  });

  it('returns the validated src only after explicit consent', () => {
    const decision = resolvePresentMediaPreview({
      mode: 'external',
      externalUrl: 'https://example.com/movie.mp4',
      externalPreviewApproved: true,
      mediaKind: 'video',
    });
    expect(decision.src).toBe('https://example.com/movie.mp4');
    expect(decision.noticeKind).toBe('local-preview');
    expect(decision.contactsHost).toBe(true);
  });

  it('refuses a credentialed or non-HTTP(S) URL even with consent', () => {
    for (const url of ['https://user:pass@example.com/a.mp4', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url']) {
      const decision = resolvePresentMediaPreview({
        mode: 'external',
        externalUrl: url,
        externalPreviewApproved: true,
        mediaKind: 'audio',
      });
      expect(decision.src, url).toBeNull();
      expect(decision.noticeKind, url).toBe('invalid-url');
    }
  });

  it('previews an embedded data URL without any consent because no host is contacted', () => {
    const decision = resolvePresentMediaPreview({
      mode: 'embedded',
      embeddedDataUrl: 'data:audio/mpeg;base64,AAAA',
      externalPreviewApproved: false,
      mediaKind: 'audio',
    });
    expect(decision.src).toBe('data:audio/mpeg;base64,AAAA');
    expect(decision.noticeKind).toBe('local-preview');
    expect(decision.contactsHost).toBe(false);
  });

  it('reports "no source" for empty input and never invents a src', () => {
    expect(resolvePresentMediaPreview({ mode: 'embedded', externalPreviewApproved: false, mediaKind: 'video' }).noticeKind).toBe('no-source');
    expect(resolvePresentMediaPreview({ mode: 'external', externalUrl: '   ', externalPreviewApproved: true, mediaKind: 'video' }).src).toBeNull();
  });

  it('extracts a display host without throwing on malformed input', () => {
    expect(presentMediaUrlHost('https://cdn.example.com:8443/a.mp4')).toBe('cdn.example.com:8443');
    expect(presentMediaUrlHost('nonsense')).toBeNull();
    expect(presentMediaUrlHost(undefined)).toBeNull();
    expect(isPresentExternalMediaUrlAllowed('https://example.com/a.mp4')).toBe(true);
    expect(isPresentExternalMediaUrlAllowed('ftp://example.com/a.mp4')).toBe(false);
  });
});
