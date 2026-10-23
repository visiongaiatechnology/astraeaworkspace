// STATUS: DIAMANT VGT SUPREME — bounded high-DPI canvas setup

export interface HighDpiCanvasState {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  scale: number;
}

/**
 * GR-001 (M1 native crash candidate) — reading `devicePixelRatio` must not throw.
 *
 * It is a host property: a hardened WebView2/DOM shim may define it with a throwing getter.
 * The canvas setup is a *rendering convenience*; a broken DPR must fall back to 1, never kill
 * the module that is drawing.
 */
function safeDevicePixelRatio(): number | undefined {
  try {
    return globalThis.devicePixelRatio;
  } catch {
    return undefined;
  }
}

/**
 * GR-001 (M1 native crash candidate) — **is this a real 2D context?**
 *
 * `getContext('2d')` can return a truthy shim on restricted GPU/driver setups. Every draw call
 * would then throw (`ctx.fillRect is not a function`) inside a React effect and take the module
 * down. A renderer that cannot draw must skip its frame, not fail the sheet; this guard is the
 * single check for that decision.
 */
const REQUIRED_CONTEXT_METHODS = [
  'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'fillText', 'measureText',
  'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'closePath',
  'translate', 'scale', 'rotate', 'createLinearGradient',
] as const;

export function isUsableCanvas2DContext(context: unknown): context is CanvasRenderingContext2D {
  if (!context || typeof context !== 'object') return false;
  const candidate = context as Record<string, unknown>;
  return REQUIRED_CONTEXT_METHODS.every((method) => typeof candidate[method] === 'function');
}

export function boundedDevicePixelRatio(raw: number | undefined, max = 3): number {
  const value = Number.isFinite(raw) ? Number(raw) : 1;
  return Math.max(1, Math.min(Math.max(1, max), value));
}

export function configureHighDpiCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  rawDevicePixelRatio = safeDevicePixelRatio(),
): HighDpiCanvasState {
  const width = Math.max(1, Math.min(32_768, Math.round(cssWidth)));
  const height = Math.max(1, Math.min(32_768, Math.round(cssHeight)));
  const scale = boundedDevicePixelRatio(rawDevicePixelRatio);
  const pixelWidth = Math.max(1, Math.round(width * scale));
  const pixelHeight = Math.max(1, Math.round(height * scale));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  /**
   * GR-001 — a context object that exists but is not a real 2D context must not throw either.
   * `getContext('2d')` can return a partial shim on restricted GPU/driver setups; drawing then
   * stays unscaled instead of taking the whole sheet down.
   */
  if (typeof context?.setTransform === 'function') {
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }
  return { cssWidth: width, cssHeight: height, pixelWidth, pixelHeight, scale };
}
