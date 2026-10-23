// STATUS: PLATIN — bounded, pure Present hyperlinks and internal navigation (Paket 28).
//
// "Form mit Link auf andere Folie, Dokument oder **geprüfte URL** aktivieren".
//
// Present had no hyperlink concept at all: no scene object and no slide carried a link, so a shape
// could not navigate anywhere. A link is the most dangerous thing a deck can carry (it can phone
// home or jump somewhere unexpected), so it is a bounded, validated value - never a free string -
// and its activation is decided by one pure rule.

import { readPresentLink, withPresentLink, PRESENT_MAX_LINK_URL_LENGTH } from './presentObjectExtensions';

export type PresentLinkTarget =
  | { kind: 'slide'; slideId: string }
  | { kind: 'url'; url: string }
  | { kind: 'document'; documentId: string; uri?: string };

export type PresentLinkRejection =
  | 'unknown-kind'
  | 'empty-slide'
  | 'unknown-slide'
  | 'empty-url'
  | 'url-too-long'
  | 'unsupported-scheme'
  | 'credentials-in-url'
  | 'empty-document';

export interface PresentLinkValidation {
  ok: boolean;
  target: PresentLinkTarget | null;
  reason?: PresentLinkRejection;
  /** Visible text for the inspector/report; never colour-only. */
  message: string;
}

const REJECTION_MESSAGES: Record<PresentLinkRejection, string> = {
  'unknown-kind': 'Only links to a slide, a document or an HTTP(S) URL are supported.',
  'empty-slide': 'Choose the slide the link should open.',
  'unknown-slide': 'That slide does not exist in this deck.',
  'empty-url': 'Enter a URL.',
  'url-too-long': `The URL is longer than ${PRESENT_MAX_LINK_URL_LENGTH} characters.`,
  'unsupported-scheme': 'Only http:// and https:// links are allowed.',
  'credentials-in-url': 'URLs with a user name or password are rejected.',
  'empty-document': 'Choose the workspace document the link should open.',
};

function reject(reason: PresentLinkRejection): PresentLinkValidation {
  return { ok: false, target: null, reason, message: REJECTION_MESSAGES[reason] };
}

export interface PresentLinkValidationOptions {
  /** Slide ids of the deck the object belongs to; an unknown internal target is refused. */
  slideIds?: readonly string[];
  /** Document ids known to the workspace host, when the caller can check them. */
  documentIds?: readonly string[];
}

/**
 * Validates a link target, fail-closed. A URL must be HTTP(S), credential-free and bounded; an
 * internal target must resolve to a slide/document the caller knows about.
 */
export function validatePresentLinkTarget(
  target: PresentLinkTarget | null | undefined,
  options: PresentLinkValidationOptions = {},
): PresentLinkValidation {
  if (!target || typeof target !== 'object') return reject('unknown-kind');
  if (target.kind === 'slide') {
    const slideId = typeof target.slideId === 'string' ? target.slideId.trim() : '';
    if (!slideId) return reject('empty-slide');
    if (options.slideIds && !options.slideIds.includes(slideId)) return reject('unknown-slide');
    return { ok: true, target: { kind: 'slide', slideId }, message: `Link to slide ${slideId}.` };
  }
  if (target.kind === 'url') {
    const raw = typeof target.url === 'string' ? target.url.trim() : '';
    if (!raw) return reject('empty-url');
    if (raw.length > PRESENT_MAX_LINK_URL_LENGTH) return reject('url-too-long');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return reject('unsupported-scheme');
    }
    if (!['http:', 'https:'].includes(url.protocol)) return reject('unsupported-scheme');
    if (url.username || url.password) return reject('credentials-in-url');
    return { ok: true, target: { kind: 'url', url: url.toString() }, message: `Link to ${url.host}.` };
  }
  if (target.kind === 'document') {
    const documentId = typeof target.documentId === 'string' ? target.documentId.trim() : '';
    if (!documentId) return reject('empty-document');
    if (options.documentIds && !options.documentIds.includes(documentId)) return reject('empty-document');
    return { ok: true, target: { kind: 'document', documentId, ...(target.uri ? { uri: target.uri } : {}) }, message: `Link to document ${documentId}.` };
  }
  return reject('unknown-kind');
}

export type PresentLinkActivation =
  | { action: 'navigate-slide'; slideId: string; target: PresentLinkTarget }
  | { action: 'open-url'; url: string; target: PresentLinkTarget }
  | { action: 'open-document'; documentId: string; uri?: string; target: PresentLinkTarget }
  | { action: 'reject'; reason: PresentLinkRejection; message: string };

/**
 * Decides what activating a link does. Editing must never navigate: in edit mode the result is
 * always `reject` with the message "Links are followed while presenting", so a stray click cannot
 * throw the author out of their deck.
 */
export function resolvePresentLinkActivation(
  target: PresentLinkTarget | null | undefined,
  context: { presenting: boolean; slideIds?: readonly string[]; documentIds?: readonly string[] },
): PresentLinkActivation {
  const validation = validatePresentLinkTarget(target, context);
  if (!validation.ok || !validation.target) {
    return { action: 'reject', reason: validation.reason ?? 'unknown-kind', message: validation.message };
  }
  if (!context.presenting) {
    return { action: 'reject', reason: 'unknown-kind', message: 'Links are followed while presenting, not while editing.' };
  }
  const resolved = validation.target;
  if (resolved.kind === 'slide') return { action: 'navigate-slide', slideId: resolved.slideId, target: resolved };
  if (resolved.kind === 'url') return { action: 'open-url', url: resolved.url, target: resolved };
  return { action: 'open-document', documentId: resolved.documentId, ...(resolved.uri ? { uri: resolved.uri } : {}), target: resolved };
}

/** Reads the validated link of a scene object/image; an invalid stored link is reported as none. */
export function presentObjectLink(object: unknown): PresentLinkTarget | null {
  const stored = readPresentLink(object);
  if (!stored || typeof stored !== 'object') return null;
  const validation = validatePresentLinkTarget(stored as PresentLinkTarget);
  return validation.ok ? validation.target : null;
}

/** Stores a validated link on an object (or removes it when the target is invalid/absent). */
export function withPresentObjectLink<T extends object>(object: T, target: PresentLinkTarget | null): T {
  if (!target) return withPresentLink(object, null);
  const validation = validatePresentLinkTarget(target);
  return withPresentLink(object, validation.ok ? validation.target : null);
}

/** Bounded, human-readable summary for the inspector and the link badge. */
export function presentLinkSummary(target: PresentLinkTarget | null, slideIndexById?: ReadonlyMap<string, number>): string {
  if (!target) return 'No link';
  if (target.kind === 'slide') {
    const index = slideIndexById?.get(target.slideId);
    return index === undefined ? `Slide ${target.slideId}` : `Slide ${index + 1}`;
  }
  if (target.kind === 'url') {
    try {
      const url = new URL(target.url);
      return `URL · ${url.host}`;
    } catch {
      return 'URL';
    }
  }
  return `Document ${target.documentId}`;
}
