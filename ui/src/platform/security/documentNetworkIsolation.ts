// STATUS: DIAMANT VGT SUPREME — passive document rendering is network-silent by construction.
import type { WorkspaceDocument } from '../../shared/contracts/workspace';

const MAX_SCAN_NODES = 200_000;
const MAX_SCAN_DEPTH = 64;
const REMOTE_SCHEME = /^(?:https?:|wss?:|ftp:|file:|\/\/)/iu;
const CSS_REMOTE = /url\s*\(\s*["']?\s*(?:https?:|wss?:|ftp:|file:|\/\/)/iu;
const MARKUP_REMOTE = /<(?:img|image|audio|video|source|link|iframe|object|embed)\b[^>]*(?:src|href|xlink:href)\s*=\s*["']\s*(?:https?:|wss?:|ftp:|file:|\/\/)/iu;
const PASSIVE_RESOURCE_KEYS = new Set([
  'dataurl', 'embeddeddaturl', 'imageurl', 'audiourl', 'videourl', 'posterurl', 'thumbnailurl',
  'fonturl', 'stylesheeturl', 'backgroundimageurl', 'previewurl', 'avatarurl', 'src', 'srcset', 'poster',
]);

function passiveRemoteValue(key: string, value: string, parent: Readonly<Record<string, unknown>>): boolean {
  const normalizedKey = key.toLowerCase();
  const trimmed = value.trim();
  if (PASSIVE_RESOURCE_KEYS.has(normalizedKey) && REMOTE_SCHEME.test(trimmed)) return true;
  if (normalizedKey === 'externalurl') {
    const mode = typeof parent.mode === 'string' ? parent.mode.toLowerCase() : '';
    const mediaKind = typeof parent.mediaKind === 'string' ? parent.mediaKind.toLowerCase() : '';
    if ((mode === 'external' || mediaKind === 'audio' || mediaKind === 'video' || mediaKind === 'image') && REMOTE_SCHEME.test(trimmed)) return true;
  }
  if ((normalizedKey.includes('style') || normalizedKey.includes('css') || normalizedKey.includes('font') || normalizedKey.includes('background')) && CSS_REMOTE.test(value)) return true;
  if ((normalizedKey.includes('html') || normalizedKey.includes('svg') || normalizedKey.includes('markup')) && MARKUP_REMOTE.test(value)) return true;
  return false;
}

export interface PassiveResourceFinding {
  path: string;
  key: string;
}

export function findPassiveExternalResources(document: WorkspaceDocument): PassiveResourceFinding[] {
  const findings: PassiveResourceFinding[] = [];
  const stack: Array<{ value: unknown; path: string; depth: number }> = [{ value: document, path: '$', depth: 0 }];
  let scanned = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (++scanned > MAX_SCAN_NODES) throw new Error('Document network-isolation scan node boundary exceeded');
    if (current.depth > MAX_SCAN_DEPTH) throw new Error('Document network-isolation scan depth exceeded');
    if (!current.value || typeof current.value !== 'object') continue;

    if (Array.isArray(current.value)) {
      for (let i = current.value.length - 1; i >= 0; i -= 1) {
        stack.push({ value: current.value[i], path: `${current.path}[${i}]`, depth: current.depth + 1 });
      }
      continue;
    }

    const record = current.value as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const nextPath = `${current.path}.${key}`;
      if (typeof value === 'string' && passiveRemoteValue(key, value, record)) {
        findings.push({ path: nextPath, key });
        if (findings.length >= 256) return findings;
      } else if (value && typeof value === 'object') {
        stack.push({ value, path: nextPath, depth: current.depth + 1 });
      }
    }
  }
  return findings;
}

/**
 * Hard document-open boundary. Hyperlinks remain data, but browser-loadable remote resources are
 * rejected before the document reaches a renderer, so opening a document cannot create DNS/HTTP
 * side effects. Explicit network actions must flow through NetGate instead.
 */
export function assertDocumentOpenNetworkIsolated(document: WorkspaceDocument): WorkspaceDocument {
  const findings = findPassiveExternalResources(document);
  if (findings.length > 0) throw new Error('DOCUMENT_PASSIVE_EXTERNAL_RESOURCE_BLOCKED');
  return document;
}
