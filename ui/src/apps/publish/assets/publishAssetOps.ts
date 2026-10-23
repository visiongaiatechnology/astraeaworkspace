// STATUS: PLATIN — Astraea Publish: Bildrahmen wirklich fuellen
//
// Befund vor dieser Datei (gemessen, Runde Publish-4): Der Canvas zeichnete fuer **jeden** Bildrahmen
// denselben gestrichelten Platzhalter mit „Image Frame" und den Massen. `frame.assetId` wurde nirgends
// gesetzt, `ingestPublishAsset`/`fitAssetFrame` waren aus keiner Komponente erreichbar. „Lokales Bild in
// Rahmen platzieren, crop/fitting korrekt anzeigen" war damit nicht ausfuehrbar: es gab keinen Weg, ein
// Bild hineinzubekommen, und keine Anzeige, wenn eines darin war.
import type { PublishAsset, PublishDocumentModel, PublishFrame } from '../../../shared/contracts/publish/workspacePublish';
import { PublishModelError } from '../model/publishDocumentEngine';
import { ingestPublishAsset } from './publishAssetEngine';
import { updatePublishFrame } from '../model/publishFrameOps';

export interface PublishPlaceImageArgs {
  name: string;
  bytes: Uint8Array;
  /** Wahr, wenn die Bytes im Dokument mitgespeichert werden sollen (statt nur verwiesen). */
  embed: boolean;
  /** Pflicht bei `embed: false` — z. B. `vgt://vault/…` oder `asset://local/…`. */
  canonicalUri?: string;
  declaredMime?: string;
  modifiedAt?: number;
  licenseAllowsPackaging?: boolean;
}

/** Obergrenze fuer das Einbetten in ein Dokument: 32 MiB, wie `PUBLISH_ASSET_LIMITS.maxEmbeddedBytes`. */
export const PUBLISH_PLACE_IMAGE_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Nimmt ein Bild auf und setzt es in den Rahmen.
 *
 * Fail-closed mit benannter Grenze: ein zu grosses Bild wird **abgelehnt** und die Groesse in der Meldung
 * genannt. Es wird nicht stillschweigend verkleinert oder weggelassen.
 */
export async function placePublishImage(model: PublishDocumentModel, frameId: string, args: PublishPlaceImageArgs): Promise<PublishDocumentModel> {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  if (frame.type !== 'image' && frame.type !== 'graphic') throw new PublishModelError('asset-frame-type-invalid');
  if (!(args.bytes instanceof Uint8Array) || args.bytes.byteLength === 0) throw new PublishModelError('asset-bytes-empty');
  if (args.embed && args.bytes.byteLength > PUBLISH_PLACE_IMAGE_MAX_BYTES) throw new PublishModelError(`asset-embedded-size-boundary:${args.bytes.byteLength}>${PUBLISH_PLACE_IMAGE_MAX_BYTES}`);
  if (!args.embed && !args.canonicalUri) throw new PublishModelError('asset-canonical-uri-required');
  const asset = await ingestPublishAsset({
    name: args.name,
    bytes: args.bytes,
    declaredMime: args.declaredMime,
    storage: args.embed ? 'embedded' : 'local-link',
    canonicalUri: args.canonicalUri ?? `asset://local/${encodeURIComponent(args.name)}`,
    modifiedAt: args.modifiedAt ?? 0,
    licenseAllowsPackaging: args.licenseAllowsPackaging ?? args.embed,
    widthPx: undefined,
    heightPx: undefined,
  });
  const assets = model.assets.some(existing => existing.id === asset.id)
    ? model.assets.map(existing => existing.id === asset.id ? asset : existing)
    : [...model.assets, asset];
  // `assetId` geht durch `updatePublishFrame`, nicht direkt: dort wird der Ueberlauf neu berechnet und
  // die kanonische Invariante geprueft.
  return updatePublishFrame({ ...model, assets }, frameId, { assetId: asset.id, altText: frame.altText ?? args.name });
}

/**
 * Der Zustand „dieser Rahmen stellt einen On-Core-Platzhalter dar".
 *
 * Der Canvas muss das **unterscheiden** koennen, weil ein Nutzer sonst nicht weiss, ob das Bild fehlt oder
 * ob es nur nicht geladen wurde. Diese eine Funktion beantwortet die Frage fuer Canvas und Inspektor.
 */
export interface PublishImagePresentation {
  state: 'placeholder' | 'embedded' | 'linked' | 'missing' | 'remote-blocked' | 'not-an-image';
  source?: string;
  altText: string;
  label: string;
}

export function presentPublishImage(model: PublishDocumentModel, frame: PublishFrame): PublishImagePresentation {
  if (frame.type !== 'image' && frame.type !== 'graphic') return { state: 'not-an-image', altText: frame.altText ?? '', label: frame.name };
  if (!frame.assetId) return { state: 'placeholder', altText: frame.altText ?? '', label: frame.name };
  const asset = model.assets.find(candidate => candidate.id === frame.assetId);
  if (!asset) return { state: 'missing', altText: frame.altText ?? '', label: frame.name };
  if (asset.status === 'missing') return { state: 'missing', altText: frame.altText ?? asset.name, label: asset.name };
  if (asset.status === 'remote-blocked' || asset.storage === 'remote-capability') return { state: 'remote-blocked', altText: frame.altText ?? asset.name, label: asset.name };
  const source = buildPublishImageSource(asset);
  if (!source) return { state: 'missing', altText: frame.altText ?? asset.name, label: asset.name };
  return { state: asset.storage === 'embedded' ? 'embedded' : 'linked', source, altText: frame.altText ?? asset.name, label: asset.name };
}

/**
 * Die einzige Stelle, die aus einem Asset eine anzeigbare Quelle macht.
 *
 * Aktive Inhalte werden auch hier abgelehnt — ein SVG, das als `data:`-URL in ein `src` geht, darf kein
 * Skript und keinen Ereignishandler enthalten. Die Pruefung steht zusaetzlich zur Aufnahme, weil die
 * Anzeige ein zweiter Weg nach draussen ist.
 */
export function buildPublishImageSource(asset: PublishAsset): string | null {
  if (asset.storage === 'embedded') {
    if (!asset.embeddedBytesBase64) return null;
    const uri = `data:${asset.mimeType};base64,${asset.embeddedBytesBase64}`;
    return assertPassiveDataUri(uri);
  }
  if (!asset.canonicalUri) return null;
  return assertPassiveDataUri(asset.canonicalUri);
}

const ACTIVE_CONTENT = /<\s*(?:script|foreignObject|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:|data:text\/html/iu;

/**
 * Weist aktive Inhalte in einer Anzeigequelle ab — auch bei **base64**-Daten.
 *
 * Gemessen (eigener Fehler, Runde Publish-12): die erste Fassung dekodierte nur prozent-kodierte `data:`-URIs.
 * Ein `data:image/svg+xml;base64,…` mit `<svg onload=…>` kam damit **ungeprueft** durch diese Funktion. Ein
 * Test hat die Luecke gefunden, nicht das Auge. Jetzt werden beide Kodierungen vor der Pruefung dekodiert.
 */
function assertPassiveDataUri(uri: string): string {
  if (!uri.startsWith('data:')) return uri;
  const comma = uri.indexOf(',');
  if (comma < 0) throw new PublishModelError('asset-data-uri-malformed');
  const header = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  const isBase64 = /;base64/iu.test(header);
  let decoded: string;
  try {
    decoded = isBase64 ? atob(body) : decodeURIComponent(body);
  } catch {
    throw new PublishModelError('asset-data-uri-malformed');
  }
  if (ACTIVE_CONTENT.test(decoded)) throw new PublishModelError('asset-active-content-rejected');
  return uri;
}

/** Nur die sichtbaren Rahmen einer Seite — die Liste, die der Canvas zeichnet. */
export function visiblePageFrames(model: PublishDocumentModel, pageId: string): PublishFrame[] {
  return model.frames.filter(frame => frame.pageId === pageId && !frame.hidden);
}

/** Die MIME-Typen, die ein Ablegen auf einem Bildrahmen annehmen darf. */
export const PUBLISH_IMAGE_DROP_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'];

export interface PublishImageDropCheck {
  accepted: boolean;
  /** Grund der Ablehnung — wird dem Nutzer **genannt**, nicht verschwiegen. */
  reason: 'ok' | 'frame-not-image' | 'frame-locked' | 'type-not-accepted' | 'file-empty' | 'file-too-large';
  mimeType: string;
  byteLength: number;
  limitBytes: number;
}

/**
 * Prueft ein abgelegtes Bild gegen die Grenzen, **bevor** Bytes gelesen werden.
 *
 * Reine Funktion ohne DOM: der Canvas ruft sie auf, und ein Test kann dieselbe Entscheidung nachrechnen. Eine
 * Ablehnung nennt immer den Grund und die Grenze.
 */
export function checkPublishImageDrop(frame: Pick<PublishFrame, 'type' | 'locked'>, file: { type: string; size: number }): PublishImageDropCheck {
  const limitBytes = PUBLISH_PLACE_IMAGE_MAX_BYTES;
  const mimeType = (file.type || 'application/octet-stream').toLowerCase();
  const base = { mimeType, byteLength: file.size, limitBytes };
  if (frame.type !== 'image' && frame.type !== 'graphic') return { ...base, accepted: false, reason: 'frame-not-image' };
  if (frame.locked) return { ...base, accepted: false, reason: 'frame-locked' };
  if (!PUBLISH_IMAGE_DROP_TYPES.includes(mimeType)) return { ...base, accepted: false, reason: 'type-not-accepted' };
  if (file.size <= 0) return { ...base, accepted: false, reason: 'file-empty' };
  if (file.size > limitBytes) return { ...base, accepted: false, reason: 'file-too-large' };
  return { ...base, accepted: true, reason: 'ok' };
}
