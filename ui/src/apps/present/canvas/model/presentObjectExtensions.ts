// STATUS: PLATIN — single documented definition of the app-local Present geometry extensions.
//
// `flipX`, `flipY` and `groupId` are **not yet** part of the shared
// `PresentObjectGeometry` contract (`src/shared/contracts/present/workspacePresentScene.ts`).
// That file is owned by another workstream, so Present carries these three fields as
// documented optional extensions on its own scene/image objects.
//
// Why this is safe and lossless:
//  * `presentData.slides[].sceneObjects[]` / `.images[]` are serialised as one canonical
//    JSON payload (`docs/…` -> `WorkspaceDocument.presentData`), so extra properties survive
//    Save -> Close -> Reopen and the `ppt/vgt-present.xml` canonical PPTX part unchanged.
//  * Every read goes through the accessors below. There is no direct property access
//    anywhere in `apps/present`, so promoting these to the shared contract later is a
//    one-file change here plus a type edit there.
//
// Registered as a contract defect: the shared geometry type should gain
// `flipX?: boolean; flipY?: boolean; groupId?: string;`.

export interface PresentGeometryExtensions {
  /** Mirror the object across its vertical centre line. */
  flipX?: boolean;
  /** Mirror the object across its horizontal centre line. */
  flipY?: boolean;
  /** Logical grouping key; members of one group share the exact same value. */
  groupId?: string;
}

/**
 * Text styling that the shared `PresentTextSceneObject` contract does not carry yet.
 * `lineHeight` and `fontFamily` are Paket 5's "Zeilenabstand" and "Schrift"; both are read and
 * written through the accessors below so promoting them into the shared contract stays a one-file
 * change. Registered as part of the same contract defect as the geometry extensions.
 */
export interface PresentTextStyleExtensions {
  lineHeight?: number;
  fontFamily?: string;
}

/**
 * Crop insets in percent of the *image* box, 0..45 each. Paket 6 "Bildimport und Zuschneiden".
 * The sum of two opposite insets must stay below 90 % so at least a 10 % band remains visible.
 */
export interface PresentImageCropExtensions {
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
}

/**
 * The image's own pixel size, measured once at import by the isolated decoder and then stored, so
 * an aspect-correct resize works after a reopen without re-decoding the image. Bound: 1..32768 px.
 */
export interface PresentImageIntrinsicExtensions {
  intrinsicWidthPx?: number;
  intrinsicHeightPx?: number;
}

export const PRESENT_MAX_IMAGE_PIXELS = 32768;

/**
 * Hyperlink target of an object (Paket 28). Stored as a bounded, validated value - never a free
 * string - because a link is the only field in a deck that can make the host contact the network.
 */
export interface PresentLinkExtensions {
  link?: unknown;
}

/** Upper bound for a stored/edited link URL. */
export const PRESENT_MAX_LINK_URL_LENGTH = 4096;
/** Upper bound for an alt text read from a document. */
export const PRESENT_MAX_ALT_TEXT_LENGTH = 2000;

/** Reads whatever is stored; the caller validates it (`presentHyperlinks.validatePresentLinkTarget`). */
export function readPresentLink(object: unknown): unknown {
  const candidate = (object ?? {}) as PresentLinkExtensions;
  return candidate.link ?? null;
}

/** Returns a copy with the link set (`null` removes the field). */
export function withPresentLink<T extends object>(object: T, link: unknown): T {
  const next: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  if (link === null || link === undefined) delete next.link;
  else next.link = link;
  return next as T;
}

/**
 * Alt text of any scene object (Paket 29). Images already carry `altText`; shapes, charts, tables
 * and widgets had no accessible description at all, so a screen reader could only announce the kind.
 */
export function readPresentAltText(object: unknown): string {
  const candidate = (object ?? {}) as { altText?: unknown };
  if (typeof candidate.altText !== 'string') return '';
  return candidate.altText.trim().slice(0, PRESENT_MAX_ALT_TEXT_LENGTH);
}

export function withPresentAltText<T extends object>(object: T, altText: string): T {
  const next: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  const trimmed = typeof altText === 'string' ? altText.trim().slice(0, PRESENT_MAX_ALT_TEXT_LENGTH) : '';
  if (trimmed) next.altText = trimmed;
  else delete next.altText;
  return next as T;
}

export const PRESENT_MAX_CROP_INSET_PERCENT = 45;
/**
 * Upper bound for the sum of two opposite insets. It must stay strictly below the visibility
 * threshold (90 %), otherwise clamping could produce a box that the visibility rule then calls
 * invisible - an inconsistency the counter-test caught.
 */
export const PRESENT_MAX_CROP_PAIR_PERCENT = 85;
/** At least this share of the image always remains visible. */
export const PRESENT_MIN_VISIBLE_BAND_PERCENT = 100 - PRESENT_MAX_CROP_PAIR_PERCENT;
/** Upper bound for a font stack read from a document (hostile input). */
export const PRESENT_MAX_FONT_FAMILY_LENGTH = 128;


/** Upper bound for a group identifier read from a document (hostile input). */
export const PRESENT_MAX_GROUP_ID_LENGTH = 128;

/** Deterministic group identifier factory: `present-group-<sequence>`. */
export function createPresentGroupId(sequence: number): string {
  const safe = Number.isFinite(sequence) ? Math.max(0, Math.floor(sequence)) : 0;
  return `present-group-${safe}`;
}

export interface PresentFlip {
  flipX: boolean;
  flipY: boolean;
}

/** Reads the mirror state; a missing/invalid value is the identity transform. */
export function readPresentFlip(object: unknown): PresentFlip {
  const candidate = (object ?? {}) as PresentGeometryExtensions;
  return { flipX: candidate.flipX === true, flipY: candidate.flipY === true };
}

/** Returns a copy with the mirror state applied. `flipX`/`flipY` default to the current value. */
export function withPresentFlip<T extends object>(object: T, flip: Partial<PresentFlip>): T {
  const current = readPresentFlip(object);
  const next = {
    ...object,
    flipX: flip.flipX === undefined ? current.flipX : flip.flipX === true,
    flipY: flip.flipY === undefined ? current.flipY : flip.flipY === true,
  };
  return next as T;
}

/** CSS transform fragment for the mirror state; empty string when the object is not mirrored. */
export function presentFlipTransform(object: unknown): string {
  const { flipX, flipY } = readPresentFlip(object);
  if (!flipX && !flipY) return '';
  return `scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`;
}

/** Full CSS transform for a scene object: rotation first, then mirroring. */
export function presentObjectTransform(object: { rotation?: number } & object, extra = ''): string {
  const rotation = Number.isFinite(object.rotation ?? 0) ? (object.rotation ?? 0) : 0;
  return [`rotate(${rotation}deg)`, presentFlipTransform(object), extra].filter(Boolean).join(' ').trim();
}

/**
 * Reads the group key. Values that are not a bounded, non-empty string are rejected
 * (fail-closed) so a hostile document cannot smuggle a 10 MB group identifier.
 */
export function readPresentGroupId(object: unknown): string | null {
  const candidate = (object ?? {}) as PresentGeometryExtensions;
  const value = candidate.groupId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PRESENT_MAX_GROUP_ID_LENGTH) return null;
  return trimmed;
}

/** Returns a copy with the group key set (`null` removes it). */
export function withPresentGroupId<T extends object>(object: T, groupId: string | null): T {
  // `T extends object` ist nicht auf `Record<string, unknown>` zuweisbar: der Spread muss die Felder
  // ausdrücklich als Datensatz lesen. Das Ergebnis bleibt `T`, die Form ändert sich nicht.
  const next: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  if (groupId === null) delete next.groupId;
  else next.groupId = groupId.slice(0, PRESENT_MAX_GROUP_ID_LENGTH);
  return next as T;
}

const clampPercent = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.min(PRESENT_MAX_CROP_INSET_PERCENT, Math.max(0, Math.round(numeric * 100) / 100));
};

/** Reads the crop insets; missing/invalid values are 0 (no crop). Also reports whether a band remains. */
export function readPresentImageCrop(object: unknown): { top: number; right: number; bottom: number; left: number; visible: boolean } {
  const candidate = (object ?? {}) as PresentImageCropExtensions;
  const top = clampPercent(candidate.cropTop) ?? 0;
  const right = clampPercent(candidate.cropRight) ?? 0;
  const bottom = clampPercent(candidate.cropBottom) ?? 0;
  const left = clampPercent(candidate.cropLeft) ?? 0;
  return { top, right, bottom, left, visible: top + bottom < 90 && left + right < 90 };
}

/** Returns a copy with the crop insets applied. Values that would hide the whole image are refused. */
export function withPresentImageCrop<T extends object>(object: T, crop: Partial<PresentImageCropExtensions>): T {
  const current = readPresentImageCrop(object);
  const merged = {
    top: crop.cropTop === undefined ? current.top : clampPercent(crop.cropTop) ?? current.top,
    right: crop.cropRight === undefined ? current.right : clampPercent(crop.cropRight) ?? current.right,
    bottom: crop.cropBottom === undefined ? current.bottom : clampPercent(crop.cropBottom) ?? current.bottom,
    left: crop.cropLeft === undefined ? current.left : clampPercent(crop.cropLeft) ?? current.left,
  };
  if (merged.top + merged.bottom >= PRESENT_MAX_CROP_PAIR_PERCENT) {
    merged.bottom = Math.max(0, PRESENT_MAX_CROP_PAIR_PERCENT - merged.top);
  }
  if (merged.left + merged.right >= PRESENT_MAX_CROP_PAIR_PERCENT) {
    merged.right = Math.max(0, PRESENT_MAX_CROP_PAIR_PERCENT - merged.left);
  }
  const next: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  for (const [key, value] of Object.entries(merged)) {
    const field = `crop${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (value) next[field] = value;
    else delete next[field];
  }
  return next as T;
}

/** `clip-path: inset(...)` for the stored crop, or `undefined` when nothing is cropped. */
export function presentImageCropClipPath(object: unknown): string | undefined {
  const crop = readPresentImageCrop(object);
  if (!crop.visible) return 'inset(45% 45% 45% 45%)';
  if (!crop.top && !crop.right && !crop.bottom && !crop.left) return undefined;
  return `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`;
}

/**
 * Intrinsic pixel size of an image object. Falls back to the current box ratio so an image imported
 * before this extension existed still resizes without distorting.
 */
export function readPresentImageIntrinsicSize(
  image: unknown,
  slideAspectRatio = 16 / 9,
): { widthPx: number; heightPx: number } {
  const candidate = (image ?? {}) as PresentImageIntrinsicExtensions & {
    widthPercent?: number;
    heightPercent?: number;
  };
  const bound = (value: unknown): number | undefined => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return Math.min(PRESENT_MAX_IMAGE_PIXELS, Math.max(1, Math.round(numeric)));
  };
  const widthPx = bound(candidate.intrinsicWidthPx);
  const heightPx = bound(candidate.intrinsicHeightPx);
  if (widthPx && heightPx) return { widthPx, heightPx };
  // Fallback: express the *current* box as a pixel ratio so the aspect ratio stays what it is now.
  const aspect = Number.isFinite(slideAspectRatio) && slideAspectRatio > 0 ? slideAspectRatio : 16 / 9;
  const boxWidth = Number.isFinite(candidate.widthPercent ?? NaN) ? (candidate.widthPercent as number) : 28;
  const boxHeight = Number.isFinite(candidate.heightPercent ?? NaN) ? (candidate.heightPercent as number) : 18;
  const physicalWidth = Math.max(0.01, boxWidth * aspect);
  const physicalHeight = Math.max(0.01, boxHeight);
  // One valid dimension is used together with the current box ratio - never discarded.
  if (widthPx) return { widthPx, heightPx: Math.max(1, Math.round((widthPx * physicalHeight) / physicalWidth)) };
  if (heightPx) return { widthPx: Math.max(1, Math.round((heightPx * physicalWidth) / physicalHeight)), heightPx };
  return { widthPx: Math.round(physicalWidth * 1000), heightPx: Math.round(physicalHeight * 1000) };
}

/** Stores the measured intrinsic size (bounded); invalid values remove the field instead of storing junk. */
export function withPresentImageIntrinsicSize<T extends object>(
  image: T,
  size: { widthPx?: number; heightPx?: number },
): T {
  const next: Record<string, unknown> = { ...(image as Record<string, unknown>) };
  const bound = (value: unknown): number | undefined => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return Math.min(PRESENT_MAX_IMAGE_PIXELS, Math.max(1, Math.round(numeric)));
  };
  const widthPx = bound(size.widthPx);
  const heightPx = bound(size.heightPx);
  if (widthPx) next.intrinsicWidthPx = widthPx;
  else delete next.intrinsicWidthPx;
  if (heightPx) next.intrinsicHeightPx = heightPx;
  else delete next.intrinsicHeightPx;
  return next as T;
}

/**
 * Reads the app-local text style. Values are bounded here as well as on write, because a document
 * is hostile input: a 10 MB font stack or a negative line height must not reach a style attribute.
 */
export function readPresentTextStyle(object: unknown): PresentTextStyleExtensions {
  const candidate = (object ?? {}) as PresentTextStyleExtensions & { fontSizePt?: unknown };
  const lineHeightNumeric = typeof candidate.lineHeight === 'number' ? candidate.lineHeight : Number(candidate.lineHeight);
  const lineHeight = Number.isFinite(lineHeightNumeric) && candidate.lineHeight !== undefined
    ? Math.min(4, Math.max(0.5, lineHeightNumeric))
    : undefined;
  const fontFamily = typeof candidate.fontFamily === 'string'
    ? candidate.fontFamily.replace(/[^A-Za-z0-9 ,\-_'"]/g, '').trim().slice(0, PRESENT_MAX_FONT_FAMILY_LENGTH) || undefined
    : undefined;
  return { ...(lineHeight === undefined ? {} : { lineHeight }), ...(fontFamily === undefined ? {} : { fontFamily }) };
}

export function withPresentTextStyle<T extends object>(object: T, style: PresentTextStyleExtensions): T {
  const next: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  const normalized = readPresentTextStyle(style);
  if (normalized.lineHeight === undefined) delete next.lineHeight;
  else next.lineHeight = normalized.lineHeight;
  if (normalized.fontFamily === undefined) delete next.fontFamily;
  else next.fontFamily = normalized.fontFamily;
  return next as T;
}
