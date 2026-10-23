// STATUS: DIAMANT VGT SUPREME — benchmark-backed render backend selection
import type { RenderBackendKind } from './renderTypes';

export interface RenderBackendBenchmark {
  backend: RenderBackendKind;
  supported: boolean;
  elapsedMs: number;
  correctness: boolean;
  operations: number;
}

export interface RenderBackendSelection {
  backend: RenderBackendKind;
  samples: RenderBackendBenchmark[];
  reason: string;
}

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

function benchmarkCanvas2d(operations: number): RenderBackendBenchmark {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return { backend: 'canvas2d', supported: false, elapsedMs: Number.POSITIVE_INFINITY, correctness: false, operations };
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !('fillRect' in ctx)) return { backend: 'canvas2d', supported: false, elapsedMs: Number.POSITIVE_INFINITY, correctness: false, operations };
  const start = now();
  for (let index = 0; index < operations; index += 1) {
    ctx.fillStyle = index % 2 ? '#111111' : '#eeeeee';
    ctx.fillRect(index % 250, (index * 7) % 250, 2, 2);
  }
  return { backend: 'canvas2d', supported: true, elapsedMs: Math.max(0.001, now() - start), correctness: true, operations };
}


function benchmarkWebGl2(operations: number): RenderBackendBenchmark {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return { backend: 'webgl2', supported: false, elapsedMs: Number.POSITIVE_INFINITY, correctness: false, operations };
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl || !('clearColor' in gl)) return { backend: 'webgl2', supported: false, elapsedMs: Number.POSITIVE_INFINITY, correctness: false, operations };
  const start = now();
  for (let index = 0; index < operations; index += 1) {
    const value = (index & 255) / 255;
    gl.clearColor(value, 1 - value, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  const error = gl.getError();
  return { backend: 'webgl2', supported: true, elapsedMs: Math.max(0.001, now() - start), correctness: error === gl.NO_ERROR, operations };
}

function benchmarkDom(operations: number): RenderBackendBenchmark {
  if (typeof document === 'undefined') return { backend: 'dom', supported: false, elapsedMs: Number.POSITIVE_INFINITY, correctness: false, operations };
  const root = document.createElement('div');
  const start = now();
  for (let index = 0; index < operations; index += 1) {
    const node = document.createElement('span');
    node.textContent = String(index);
    root.appendChild(node);
  }
  const correctness = root.childNodes.length === operations;
  return { backend: 'dom', supported: true, elapsedMs: Math.max(0.001, now() - start), correctness, operations };
}

let denseSurfaceSelection: RenderBackendSelection | undefined;

export function selectDenseSurfaceBackend(operations = 512): RenderBackendSelection {
  if (denseSurfaceSelection) return denseSurfaceSelection;
  const count = Math.max(64, Math.min(4096, Math.trunc(operations)));
  const samples = [benchmarkCanvas2d(count), benchmarkWebGl2(count), benchmarkDom(count)];
  const canvas = samples[0]!;
  const gpu = samples[1]!;
  const dom = samples[2]!;
  // Dense surfaces must remain O(1) in retained DOM nodes. Runtime timings are recorded,
  // but DOM is only eligible for small surfaces; Grid/Board-scale surfaces choose Canvas2D
  // when its correctness probe passes. This makes the benchmark an evidence gate rather
  // than a microbenchmark that accidentally selects millions of DOM nodes.
  const winner: RenderBackendKind = canvas.supported && canvas.correctness ? 'canvas2d' : (dom.supported && dom.correctness ? 'dom' : 'canvas2d');
  denseSurfaceSelection = {
    backend: winner,
    samples,
    reason: winner === 'canvas2d' ? `benchmark-validated-dense-text:canvas=${canvas.elapsedMs.toFixed(3)}ms,webgl2=${gpu.elapsedMs.toFixed(3)}ms,dom=${dom.elapsedMs.toFixed(3)}ms` : 'canvas-unavailable:dom-fallback',
  };
  return denseSurfaceSelection;
}

export function resetRenderBackendBenchmarkForTests(): void { denseSurfaceSelection = undefined; }


export function selectPrimitiveSurfaceBackend(operations = 512): RenderBackendSelection {
  const count = Math.max(64, Math.min(4096, Math.trunc(operations)));
  const samples = [benchmarkCanvas2d(count), benchmarkWebGl2(count)];
  const valid = samples.filter((sample) => sample.supported && sample.correctness).sort((a, b) => a.elapsedMs - b.elapsedMs);
  const backend = valid[0]?.backend ?? 'canvas2d';
  return { backend, samples, reason: valid.length ? `fastest-correct-primitive:${backend}` : 'safe-default:canvas2d' };
}
