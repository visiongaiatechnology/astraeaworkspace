// STATUS: PLATIN — pure Present geometry primitives shared by selection and snapping.
//
// Present stores geometry in **percent of the slide** (`xPercent`, `yPercent`,
// `widthPercent`, `heightPercent`). Percent space is anisotropic: one percent of width is a
// different physical length than one percent of height. Every rotation-aware computation in
// Present therefore has to know the slide aspect ratio. This module is the single place that
// converts between the two, so selection, marquee, snapping and guides all agree.

export interface PresentPercentRect {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface PresentRectObject extends PresentPercentRect {
  rotation?: number;
}

/** Physical slide width divided by physical slide height. 16:9 is the Present default. */
export const PRESENT_DEFAULT_ASPECT = 16 / 9;

const ASPECT_ALIASES: Record<string, number> = {
  '16:9': 16 / 9,
  '16:10': 1.6,
  '4:3': 4 / 3,
  a4: 1414 / 1000,
  letter: 11 / 8.5,
};

/**
 * Resolves a slide aspect-ratio token to a physical ratio. Unknown or malformed tokens fall
 * back to 16:9 rather than producing NaN geometry (fail-closed).
 */
export function presentAspectRatioValue(ratio: string | undefined | null): number {
  const raw = String(ratio ?? '').trim();
  if (!raw) return PRESENT_DEFAULT_ASPECT;
  const alias = ASPECT_ALIASES[raw.toLowerCase()];
  if (alias !== undefined) return alias;
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*[:x/]\s*([0-9]+(?:\.[0-9]+)?)$/i.exec(raw);
  if (match) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator > 0 && numerator > 0) return Math.max(0.25, Math.min(4, numerator / denominator));
  }
  return PRESENT_DEFAULT_ASPECT;
}

export function clampPresentPercent(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, finite));
}

/**
 * Axis-aligned bounding box of an object after rotation, in percent space.
 * The centre is rotation-invariant, so it is computed directly; the extent is rotated in
 * physical space and converted back, which is what CSS `rotate()` on a percent-sized box does.
 */
export function presentObjectRect(object: PresentRectObject, aspectRatio = PRESENT_DEFAULT_ASPECT): PresentPercentRect {
  const width = Math.max(0, Number.isFinite(object.widthPercent) ? object.widthPercent : 0);
  const height = Math.max(0, Number.isFinite(object.heightPercent) ? object.heightPercent : 0);
  const x = Number.isFinite(object.xPercent) ? object.xPercent : 0;
  const y = Number.isFinite(object.yPercent) ? object.yPercent : 0;
  const rotation = Number.isFinite(object.rotation ?? 0) ? (object.rotation ?? 0) : 0;
  const centreX = x + width / 2;
  const centreY = y + height / 2;
  if (rotation === 0) return { xPercent: x, yPercent: y, widthPercent: width, heightPercent: height };
  const aspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : PRESENT_DEFAULT_ASPECT;
  const physicalWidth = width * aspect;
  const physicalHeight = height;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const boxedPhysicalWidth = physicalWidth * cos + physicalHeight * sin;
  const boxedPhysicalHeight = physicalWidth * sin + physicalHeight * cos;
  const boxedWidth = boxedPhysicalWidth / aspect;
  const boxedHeight = boxedPhysicalHeight;
  return {
    xPercent: centreX - boxedWidth / 2,
    yPercent: centreY - boxedHeight / 2,
    widthPercent: boxedWidth,
    heightPercent: boxedHeight,
  };
}

export function rectsIntersect(a: PresentPercentRect, b: PresentPercentRect): boolean {
  if (a.widthPercent <= 0 || a.heightPercent <= 0 || b.widthPercent <= 0 || b.heightPercent <= 0) return false;
  return (
    a.xPercent < b.xPercent + b.widthPercent &&
    b.xPercent < a.xPercent + a.widthPercent &&
    a.yPercent < b.yPercent + b.heightPercent &&
    b.yPercent < a.yPercent + a.heightPercent
  );
}

export function rectContainsPoint(rect: PresentPercentRect, point: { xPercent: number; yPercent: number }): boolean {
  return (
    point.xPercent >= rect.xPercent &&
    point.xPercent <= rect.xPercent + rect.widthPercent &&
    point.yPercent >= rect.yPercent &&
    point.yPercent <= rect.yPercent + rect.heightPercent
  );
}

export function unionPresentRects(rects: readonly PresentPercentRect[]): PresentPercentRect | null {
  if (!rects.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    if (rect.widthPercent <= 0 || rect.heightPercent <= 0) continue;
    minX = Math.min(minX, rect.xPercent);
    minY = Math.min(minY, rect.yPercent);
    maxX = Math.max(maxX, rect.xPercent + rect.widthPercent);
    maxY = Math.max(maxY, rect.yPercent + rect.heightPercent);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { xPercent: minX, yPercent: minY, widthPercent: maxX - minX, heightPercent: maxY - minY };
}

/** Rect built from two drag corners, in either direction. */
export function rectFromCorners(
  a: { xPercent: number; yPercent: number },
  b: { xPercent: number; yPercent: number },
): PresentPercentRect {
  const xPercent = Math.min(a.xPercent, b.xPercent);
  const yPercent = Math.min(a.yPercent, b.yPercent);
  return {
    xPercent,
    yPercent,
    widthPercent: Math.abs(a.xPercent - b.xPercent),
    heightPercent: Math.abs(a.yPercent - b.yPercent),
  };
}

/** Ein Zeigerpunkt in CSS-Pixeln — **strukturell**, ohne DOM-Typen (wie `DragPointerLike` in Paket 5). */
export interface PresentClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

/** Der sichtbare Folienrahmen in CSS-Pixeln — **strukturell**; ein `DOMRect` passt ohne Umweg. */
export interface PresentClientFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PresentPercentPoint {
  readonly xPercent: number;
  readonly yPercent: number;
}

/**
 * **Die eine Umrechnung** von Zeigerkoordinaten in Folien-Prozente.
 *
 * `frame` ist der Rahmen, **wie er auf dem Schirm steht** — also **nach** dem Zoom. Genau deshalb kürzt
 * sich der Zoom heraus: derselbe Punkt relativ zur sichtbaren Folie ergibt bei **jedem** Zoom denselben
 * Prozentwert. *Ein zweiter Ort, der diese Rechnung noch einmal aufschreibt, wäre eine zweite Wahrheit
 * über Geometrie* — deshalb steht sie hier und wird von den Zeigergesten des Canvas
 * (`PresentStageCanvas.toPercent`) **und** vom Ablageziel (Paket 10) **gemeinsam** benutzt.
 *
 * **Fail-closed:** unbrauchbare Zahlen, ein Rahmen ohne Fläche (`width`/`height` ≤ 0) oder ein fehlender
 * Rahmen ergeben `null` — der Aufrufer **entscheidet** dann, statt dass hier geraten wird.
 */
export function presentPercentFromClientPoint(
  point: PresentClientPoint | null | undefined,
  frame: PresentClientFrame | null | undefined,
): PresentPercentPoint | null {
  if (!point || !frame) return null;
  const { clientX, clientY } = point;
  const { left, top, width, height } = frame;
  const zahlen = [clientX, clientY, left, top, width, height];
  if (!zahlen.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    xPercent: ((clientX - left) / width) * 100,
    yPercent: ((clientY - top) / height) * 100,
  };
}
