// STATUS: PLATIN — one definition of "may this media be previewed, and would that contact a host".
//
// Paket 22 "Aufzeichnung und Medien": "Audio/Video mit **expliziter Zustimmung** einfügen, **keine
// automatische Netzwerkverbindung**".
//
// The measured defect: `PresentMediaEmbedModal` rendered `<video src={externalUrl}>` / `<audio
// src={externalUrl}>` directly from the URL **draft field**. Merely typing or pasting a URL made the
// browser request the media from that host, before any validation and without consent, which is the
// one behaviour the requirement forbids. This module is the single decision point: no component may
// derive a media `src` from an unvalidated or unapproved URL again.

export interface PresentMediaPreviewRequest {
  mode: 'external' | 'embedded';
  /** Data URL of the validated local file, when one was chosen. */
  embeddedDataUrl?: string;
  /** The draft URL as typed; it is NOT trusted and never used directly. */
  externalUrl?: string;
  /** The user explicitly asked to load the external preview (consent to contact the host). */
  externalPreviewApproved: boolean;
  mediaKind: 'audio' | 'video';
}

export type PresentMediaPreviewNoticeKind =
  | 'none'
  | 'local-preview'
  | 'awaiting-consent'
  | 'invalid-url'
  | 'no-source';

export interface PresentMediaPreviewDecision {
  /** The only value a component may put into a media element's `src`. `null` means "render nothing". */
  src: string | null;
  noticeKind: PresentMediaPreviewNoticeKind;
  /** Host of the blocked URL, for the visible notice; `null` when unknown. */
  host: string | null;
  /** True when showing a preview would contact a network host. */
  contactsHost: boolean;
}

/** Extracts a display host without throwing on a malformed URL. */
export function presentMediaUrlHost(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.host || null;
  } catch {
    return null;
  }
}

/** Only HTTP(S) without embedded credentials may leave the machine (same rule as the media validator). */
export function isPresentExternalMediaUrlAllowed(value: string | undefined): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Decides what, if anything, may be rendered as a media preview.
 *
 * Rules, in order:
 *  1. an embedded data URL is local: previewable without any consent,
 *  2. an external URL is previewable **only** after explicit consent *and* validation,
 *  3. otherwise nothing is rendered and the caller shows the corresponding notice.
 */
export function resolvePresentMediaPreview(request: PresentMediaPreviewRequest): PresentMediaPreviewDecision {
  if (request.mode === 'embedded') {
    const dataUrl = typeof request.embeddedDataUrl === 'string' ? request.embeddedDataUrl.trim() : '';
    if (!dataUrl) {
      return { src: null, noticeKind: 'no-source', host: null, contactsHost: false };
    }
    return { src: dataUrl, noticeKind: 'local-preview', host: null, contactsHost: false };
  }

  const raw = typeof request.externalUrl === 'string' ? request.externalUrl.trim() : '';
  if (!raw) {
    return { src: null, noticeKind: 'no-source', host: null, contactsHost: false };
  }
  const host = presentMediaUrlHost(raw);
  if (!request.externalPreviewApproved) {
    return { src: null, noticeKind: 'awaiting-consent', host, contactsHost: true };
  }
  if (!isPresentExternalMediaUrlAllowed(raw)) {
    return { src: null, noticeKind: 'invalid-url', host, contactsHost: false };
  }
  return { src: raw, noticeKind: 'local-preview', host, contactsHost: true };
}
