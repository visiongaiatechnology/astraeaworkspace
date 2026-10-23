// STATUS: DIAMANT VGT SUPREME — bounded rendering resources, cancellation and isolated decoder failures
export interface RenderResourcePolicy {
  maxImageWidth: number;
  maxImageHeight: number;
  maxImagePixels: number;
  maxCanvasWidth: number;
  maxCanvasHeight: number;
  maxCanvasPixels: number;
  maxNestingDepth: number;
  maxPathSegments: number;
  maxTextRuns: number;
  maxDecodedBytes: number;
}

export const DEFAULT_RENDER_RESOURCE_POLICY: Readonly<RenderResourcePolicy> = Object.freeze({
  maxImageWidth: 32_768,
  maxImageHeight: 32_768,
  maxImagePixels: 268_435_456,
  maxCanvasWidth: 32_768,
  maxCanvasHeight: 32_768,
  maxCanvasPixels: 268_435_456,
  maxNestingDepth: 128,
  maxPathSegments: 1_000_000,
  maxTextRuns: 250_000,
  maxDecodedBytes: 256 * 1024 * 1024,
});

function integer(value: number, min: number, max: number, code: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}

export interface RenderResourceRequest {
  imageWidth?: number;
  imageHeight?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  nestingDepth?: number;
  pathSegments?: number;
  textRuns?: number;
  decodedBytes?: number;
}

export function assertRenderResourceRequest(request: RenderResourceRequest, policy: Readonly<RenderResourcePolicy> = DEFAULT_RENDER_RESOURCE_POLICY): void {
  if (request.imageWidth !== undefined || request.imageHeight !== undefined) {
    const width = integer(request.imageWidth ?? 0, 1, policy.maxImageWidth, 'render_resource_image_width_limit');
    const height = integer(request.imageHeight ?? 0, 1, policy.maxImageHeight, 'render_resource_image_height_limit');
    if (width * height > policy.maxImagePixels) throw new Error('render_resource_image_pixel_limit');
  }
  if (request.canvasWidth !== undefined || request.canvasHeight !== undefined) {
    const width = integer(request.canvasWidth ?? 0, 1, policy.maxCanvasWidth, 'render_resource_canvas_width_limit');
    const height = integer(request.canvasHeight ?? 0, 1, policy.maxCanvasHeight, 'render_resource_canvas_height_limit');
    if (width * height > policy.maxCanvasPixels) throw new Error('render_resource_canvas_pixel_limit');
  }
  if (request.nestingDepth !== undefined) integer(request.nestingDepth, 0, policy.maxNestingDepth, 'render_resource_nesting_limit');
  if (request.pathSegments !== undefined) integer(request.pathSegments, 0, policy.maxPathSegments, 'render_resource_path_limit');
  if (request.textRuns !== undefined) integer(request.textRuns, 0, policy.maxTextRuns, 'render_resource_text_run_limit');
  if (request.decodedBytes !== undefined) integer(request.decodedBytes, 0, policy.maxDecodedBytes, 'render_resource_decoded_byte_limit');
}

export function throwIfRenderCancelled(signal?: AbortSignal, label = 'render'): void {
  if (signal?.aborted) throw new DOMException(`${label} aborted`, 'AbortError');
}

export type DecoderResult<T> = { ok: true; value: T; decodedBytes: number; } | { ok: false; errorCode: 'decode-rejected' | 'decode-failed' | 'cancelled'; placeholder: true; };

export interface IsolatedDecoder<TInput, TOutput> {
  decode(input: TInput, signal?: AbortSignal): Promise<{ value: TOutput; decodedBytes: number }> | { value: TOutput; decodedBytes: number };
}

export async function decodeResourceIsolated<TInput, TOutput>(input: TInput, decoder: IsolatedDecoder<TInput, TOutput>, signal?: AbortSignal, policy: Readonly<RenderResourcePolicy> = DEFAULT_RENDER_RESOURCE_POLICY): Promise<DecoderResult<TOutput>> {
  try {
    throwIfRenderCancelled(signal, 'decoder');
    const decoded = await decoder.decode(input, signal);
    throwIfRenderCancelled(signal, 'decoder');
    assertRenderResourceRequest({ decodedBytes: decoded.decodedBytes }, policy);
    return { ok: true, value: decoded.value, decodedBytes: decoded.decodedBytes };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, errorCode: 'cancelled', placeholder: true };
    if (String(error).includes('render_resource_')) return { ok: false, errorCode: 'decode-rejected', placeholder: true };
    return { ok: false, errorCode: 'decode-failed', placeholder: true };
  }
}

export async function runCancellableRenderLoop<T>(items: readonly T[], visit: (item: T, index: number) => void, signal?: AbortSignal, cancellationInterval = 128): Promise<number> {
  if (items.length > 2_000_000) throw new Error('render_loop_item_limit');
  const interval = integer(cancellationInterval, 1, 65_536, 'render_loop_cancel_interval_invalid');
  for (let index = 0; index < items.length; index += 1) {
    if (index % interval === 0) throwIfRenderCancelled(signal, 'layout');
    visit(items[index]!, index);
  }
  return items.length;
}
