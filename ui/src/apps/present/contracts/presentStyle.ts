// STATUS: PLATIN — Present Runde 41: additive, optional style contract for scene objects, cards and
// slide backgrounds.
//
// The shared contract stays untouched: the style payloads are written into optional extension keys
// (`presentStyle` on a scene object/card, `presentBackgroundStyle` on a slide). The canonical writer
// copies unknown keys verbatim, so old documents remain readable (every field is optional) and new
// documents round-trip through save/reopen without a migration.
import type { PresentDocumentModel, PresentSlide, PresentSlideCard } from '../../../shared/contracts/workspace';

export type PresentStyleAlignment = 'left' | 'center' | 'right';
export type PresentStyleFontWeight = 'normal' | 'semibold' | 'bold';

export interface PresentStyleGradient {
  type: 'linear';
  from: string;
  to: string;
  /** Degrees, 0 = to top, 90 = to right (CSS linear-gradient convention). */
  angle: number;
}

export interface PresentStyleBorder {
  color: string;
  width: number;
  radius: number;
}

export interface PresentStyleShadow {
  color: string;
  blurPx: number;
  offsetXPx: number;
  offsetYPx: number;
}

export interface PresentObjectStyle {
  textColor?: string;
  backgroundColor?: string;
  backgroundGradient?: PresentStyleGradient;
  border?: PresentStyleBorder;
  shadow?: PresentStyleShadow;
  fontSizePt?: number;
  fontWeight?: PresentStyleFontWeight;
  textAlign?: PresentStyleAlignment;
  opacity?: number;
}

export interface PresentCardStyle {
  textColor?: string;
  backgroundColor?: string;
  backgroundGradient?: PresentStyleGradient;
  border?: PresentStyleBorder;
}

export interface PresentSlideBackgroundStyle {
  /** Data URL of the background image (same imported-image path as regular images, size limited). */
  imageDataUrl?: string;
  imageOpacity?: number;
}

export const PRESENT_STYLE_IMAGE_MAX_BYTES = 3_000_000;

const OBJECT_STYLE_KEY = 'presentStyle';

/**
 * SEC-03 (hostile document input): style extensions are read from documents that may be foreign
 * or hand-edited. Colours reach CSS, so they are restricted to plain CSS colour tokens; the slide
 * background image must be a bounded `data:image/...;base64,` URL. Anything else is ignored and
 * the kind default wins — a hostile document can therefore not smuggle arbitrary CSS.
 */
const CSS_COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%/\sdeg]+\)|oklch\([0-9.,%/\sdeg]+\)|transparent|[a-z]{3,20})$/iu;
const MAX_CSS_COLOR_LENGTH = 64;
const PRESENT_BACKGROUND_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/iu;
const MAX_BACKGROUND_DATA_URL_LENGTH = Math.ceil((PRESENT_STYLE_IMAGE_MAX_BYTES * 4) / 3) + 64;

function readColor(record: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalString(record, key)?.trim();
  if (!value || value.length > MAX_CSS_COLOR_LENGTH || !CSS_COLOR_PATTERN.test(value)) return undefined;
  return value;
}
const SLIDE_BACKGROUND_KEY = 'presentBackgroundStyle';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readOptionalNumber(record: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : undefined;
}

function readGradient(value: unknown): PresentStyleGradient | undefined {
  if (!isRecord(value)) return undefined;
  const from = readColor(value, 'from');
  const to = readColor(value, 'to');
  if (!from || !to) return undefined;
  return { type: 'linear', from, to, angle: readOptionalNumber(value, 'angle', 0, 360) ?? 90 };
}

function readBorder(value: unknown): PresentStyleBorder | undefined {
  if (!isRecord(value)) return undefined;
  const color = readColor(value, 'color');
  const width = readOptionalNumber(value, 'width', 0, 24);
  const radius = readOptionalNumber(value, 'radius', 0, 999);
  if (!color && width === undefined && radius === undefined) return undefined;
  return { color: color ?? '#94a3b8', width: width ?? 0, radius: radius ?? 0 };
}

function readShadow(value: unknown): PresentStyleShadow | undefined {
  if (!isRecord(value)) return undefined;
  const color = readColor(value, 'color') ?? 'rgba(0,0,0,0.35)';
  return {
    color,
    blurPx: readOptionalNumber(value, 'blurPx', 0, 128) ?? 0,
    offsetXPx: readOptionalNumber(value, 'offsetXPx', -128, 128) ?? 0,
    offsetYPx: readOptionalNumber(value, 'offsetYPx', -128, 128) ?? 0,
  };
}

/** Read the sanitized style extension of a scene object (never throws on hostile payloads). */
export function readPresentObjectStyle(object: unknown): PresentObjectStyle {
  if (!isRecord(object) || !isRecord(object[OBJECT_STYLE_KEY])) return {};
  const raw = object[OBJECT_STYLE_KEY] as Record<string, unknown>;
  const style: PresentObjectStyle = {
    textColor: readColor(raw, 'textColor'),
    backgroundColor: readColor(raw, 'backgroundColor'),
    backgroundGradient: readGradient(raw.backgroundGradient),
    border: readBorder(raw.border),
    shadow: readShadow(raw.shadow),
    fontSizePt: readOptionalNumber(raw, 'fontSizePt', 6, 200),
    fontWeight: (['normal', 'semibold', 'bold'] as const).includes(raw.fontWeight as never)
      ? (raw.fontWeight as PresentStyleFontWeight)
      : undefined,
    textAlign: (['left', 'center', 'right'] as const).includes(raw.textAlign as never)
      ? (raw.textAlign as PresentStyleAlignment)
      : undefined,
    opacity: readOptionalNumber(raw, 'opacity', 0, 1),
  };
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as PresentObjectStyle;
}

/** Merge a style patch into the object (undefined fields are removed; an empty style is dropped). */
export function withPresentObjectStyle<T extends object>(object: T, patch: Partial<PresentObjectStyle>): T {
  const next: PresentObjectStyle = { ...readPresentObjectStyle(object) };
  for (const [key, value] of Object.entries(patch) as Array<[keyof PresentObjectStyle, unknown]>) {
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  const record = object as Record<string, unknown>;
  if (!Object.keys(next).length) {
    const copy = { ...record };
    delete copy[OBJECT_STYLE_KEY];
    return copy as T;
  }
  return { ...record, [OBJECT_STYLE_KEY]: next } as T;
}

/** Removes the style extension → the object returns to its kind defaults. */
export function resetPresentObjectStyle<T extends object>(object: T): T {
  const copy = { ...(object as Record<string, unknown>) };
  delete copy[OBJECT_STYLE_KEY];
  return copy as T;
}

export interface ResolvedPresentObjectStyle {
  textColor: string;
  backgroundColor: string;
  backgroundGradient: PresentStyleGradient | null;
  border: PresentStyleBorder | null;
  shadow: PresentStyleShadow | null;
  fontSizePt: number | null;
  fontWeight: PresentStyleFontWeight | null;
  textAlign: PresentStyleAlignment | null;
  opacity: number | null;
}

/**
 * Effective style = kind defaults overlaid with the optional extension. Reset therefore means
 * "delete the extension" and the original kind/theme values win again.
 */
export function resolvePresentObjectStyle(object: Record<string, unknown>): ResolvedPresentObjectStyle {
  const override = readPresentObjectStyle(object);
  const kind = String(object.kind ?? '');
  let textColor = '#0f172a';
  let backgroundColor = 'transparent';
  let fontSizePt: number | null = null;
  let fontWeight: PresentStyleFontWeight | null = null;
  let textAlign: PresentStyleAlignment | null = null;
  if (kind === 'text') {
    textColor = typeof object.color === 'string' ? object.color : textColor;
    backgroundColor = typeof object.backgroundColor === 'string' ? object.backgroundColor : 'transparent';
    fontSizePt = typeof object.fontSizePt === 'number' ? object.fontSizePt : null;
    fontWeight = (typeof object.fontWeight === 'string' ? object.fontWeight : null) as PresentStyleFontWeight | null;
    textAlign = (typeof object.textAlign === 'string' ? object.textAlign : null) as PresentStyleAlignment | null;
  } else if (kind === 'shape') {
    textColor = typeof object.strokeColor === 'string' ? object.strokeColor : textColor;
    backgroundColor = typeof object.fillColor === 'string' ? object.fillColor : 'transparent';
  } else if (kind === 'widget') {
    textColor = typeof object.accentColor === 'string' ? object.accentColor : textColor;
  }
  return {
    textColor: override.textColor ?? textColor,
    backgroundColor: override.backgroundColor ?? backgroundColor,
    backgroundGradient: override.backgroundGradient ?? null,
    border: override.border ?? null,
    shadow: override.shadow ?? null,
    fontSizePt: override.fontSizePt ?? fontSizePt,
    fontWeight: override.fontWeight ?? fontWeight,
    textAlign: override.textAlign ?? textAlign,
    opacity: override.opacity ?? null,
  };
}

/** CSS for the object chrome (background/gradient/border/radius/shadow). */
export function presentObjectStyleCss(style: ResolvedPresentObjectStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.backgroundGradient) {
    css.backgroundImage = presentGradientCss(style.backgroundGradient);
  } else if (style.backgroundColor && style.backgroundColor !== 'transparent') {
    css.backgroundColor = style.backgroundColor;
  }
  if (style.border) {
    css.border = `${style.border.width}px solid ${style.border.color}`;
    css.borderRadius = `${style.border.radius}px`;
  }
  if (style.shadow) {
    css.boxShadow = `${style.shadow.offsetXPx}px ${style.shadow.offsetYPx}px ${style.shadow.blurPx}px ${style.shadow.color}`;
  }
  return css;
}

export function presentGradientCss(gradient: PresentStyleGradient): string {
  return `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`;
}

// ---------------------------------------------------------------------------------------------
// Present cards
// ---------------------------------------------------------------------------------------------
export function readPresentCardStyle(card: unknown): PresentCardStyle {
  if (!isRecord(card) || !isRecord(card[OBJECT_STYLE_KEY])) return {};
  const raw = card[OBJECT_STYLE_KEY] as Record<string, unknown>;
  return {
    textColor: readColor(raw, 'textColor'),
    backgroundColor: readColor(raw, 'backgroundColor'),
    backgroundGradient: readGradient(raw.backgroundGradient),
    border: readBorder(raw.border),
  };
}

export function withPresentCardStyle<T extends object>(card: T, patch: Partial<PresentCardStyle>): T {
  const next: PresentCardStyle = { ...readPresentCardStyle(card) };
  for (const [key, value] of Object.entries(patch) as Array<[keyof PresentCardStyle, unknown]>) {
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  const record = card as Record<string, unknown>;
  if (!Object.keys(next).length) {
    const copy = { ...record };
    delete copy[OBJECT_STYLE_KEY];
    return copy as T;
  }
  return { ...record, [OBJECT_STYLE_KEY]: next } as T;
}

export function resetPresentCardStyle<T extends object>(card: T): T {
  const copy = { ...(card as Record<string, unknown>) };
  delete copy[OBJECT_STYLE_KEY];
  return copy as T;
}

export function presentCardStyleCss(card: unknown): React.CSSProperties {
  const style = readPresentCardStyle(card);
  const css: React.CSSProperties = {};
  if (style.backgroundGradient) css.backgroundImage = presentGradientCss(style.backgroundGradient);
  else if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.border) {
    css.border = `${style.border.width}px solid ${style.border.color}`;
    css.borderRadius = `${style.border.radius}px`;
  }
  return css;
}

// ---------------------------------------------------------------------------------------------
// Slide background (solid colour / gradient already exist on the contract; image is the optional
// extension). The background is drawn on the slide frame below every object.
// ---------------------------------------------------------------------------------------------
export function readPresentSlideBackgroundStyle(slide: unknown): PresentSlideBackgroundStyle {
  if (!isRecord(slide) || !isRecord(slide[SLIDE_BACKGROUND_KEY])) return {};
  const raw = slide[SLIDE_BACKGROUND_KEY] as Record<string, unknown>;
  const imageDataUrl = readOptionalString(raw, 'imageDataUrl')?.trim();
  return {
    imageDataUrl: imageDataUrl
      && imageDataUrl.length <= MAX_BACKGROUND_DATA_URL_LENGTH
      && PRESENT_BACKGROUND_DATA_URL_PATTERN.test(imageDataUrl)
      ? imageDataUrl
      : undefined,
    imageOpacity: readOptionalNumber(raw, 'imageOpacity', 0, 1),
  };
}

export function withPresentSlideBackgroundStyle<T extends object>(slide: T, patch: Partial<PresentSlideBackgroundStyle>): T {
  const next: PresentSlideBackgroundStyle = { ...readPresentSlideBackgroundStyle(slide) };
  for (const [key, value] of Object.entries(patch) as Array<[keyof PresentSlideBackgroundStyle, unknown]>) {
    if (value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }
  const record = slide as Record<string, unknown>;
  if (!Object.keys(next).length) {
    const copy = { ...record };
    delete copy[SLIDE_BACKGROUND_KEY];
    return copy as T;
  }
  return { ...record, [SLIDE_BACKGROUND_KEY]: next } as T;
}

/** Size guard for the background-image picker (Data-URL byte length, not character count). */
export function presentBackgroundImageFitsLimit(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/')) return false;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return false;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  return bytes > 0 && bytes <= PRESENT_STYLE_IMAGE_MAX_BYTES;
}

export interface PresentSlideBackgroundCss {
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
}

/** The slide surface style: solid colour, linear gradient or an authored background image. */
export function presentSlideBackgroundCss(
  slide: PresentSlide,
  baseColor: string,
  baseGradient?: { type: 'linear' | 'radial'; from: string; to: string; angle?: number } | null,
): PresentSlideBackgroundCss {
  const style = readPresentSlideBackgroundStyle(slide);
  const image = style.imageDataUrl && PRESENT_BACKGROUND_DATA_URL_PATTERN.test(style.imageDataUrl) ? style.imageDataUrl : undefined;
  if (image) {
    return {
      backgroundColor: slide.backgroundColor || baseColor,
      backgroundImage: `url("${image.replace(/"/g, '%22')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  if (baseGradient) {
    return {
      backgroundColor: slide.backgroundColor || baseColor,
      backgroundImage: baseGradient.type === 'radial'
        ? `radial-gradient(circle at 50% 50%, ${baseGradient.from}, ${baseGradient.to})`
        : `linear-gradient(${baseGradient.angle ?? 90}deg, ${baseGradient.from}, ${baseGradient.to})`,
    };
  }
  return { backgroundColor: slide.backgroundColor || baseColor };
}

/** Utility used by tests/tools that own a deck model: read the active master of a slide. */
export function presentActiveMaster(model: PresentDocumentModel, slide: PresentSlide) {
  const masters = model.masters ?? [];
  return masters.find((master) => master.id === slide.masterId) ?? masters[0];
}

export type { PresentSlideCard };
