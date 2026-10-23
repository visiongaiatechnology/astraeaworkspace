// @vitest-environment happy-dom
// STATUS: PLATIN — WR-034: a click selects, a drag moves, and the zoom is divided out
//
// Native M7 re-probe: selecting a shape made it twitch. `transition-all` on the `<path>`
// animated style changes on select/deselect, every pointer wobble of a plain click was
// reported as a move, and the millimetre delta ignored the document zoom.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WriterShapeCanvas } from '../../../editor/blocks/shapes/WriterShapeCanvas';

const rectangle = {
  id: 'shape-1',
  shapeKind: 'rectangle',
  xMm: 10,
  yMm: 10,
  widthMm: 40,
  heightMm: 20,
  strokeColor: '#3b82f6',
} as const;

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

async function mountCanvas(
  onUpdateShapes: (next: unknown[]) => void,
  options: { zoom?: number; selected?: string | null } = {},
): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <WriterShapeCanvas
        shapes={[rectangle]}
        onUpdateShapes={onUpdateShapes}
        selectedShapeId={options.selected === undefined ? 'shape-1' : options.selected}
        zoom={options.zoom}
      />,
    );
  });
  return container;
}

function pointer(target: Element, type: string, clientX: number, clientY: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
}

describe('WR-034 — a click does not move a shape', () => {
  it('ignores a pointer wobble below the drag threshold', async () => {
    const onUpdateShapes = vi.fn();
    const host = await mountCanvas(onUpdateShapes);
    const group = host.querySelector('[role="button"]')!;
    const svg = host.querySelector('svg')!;

    await act(async () => { pointer(group, 'pointerdown', 50, 50); });
    await act(async () => {
      pointer(svg, 'pointermove', 51, 51); // 1.4 px: a click, not a drag
      pointer(svg, 'pointerup', 51, 51);
    });

    expect(onUpdateShapes).not.toHaveBeenCalled();
  });

  it('moves once the pointer passes the threshold', async () => {
    const onUpdateShapes = vi.fn();
    const host = await mountCanvas(onUpdateShapes);
    const group = host.querySelector('[role="button"]')!;
    const svg = host.querySelector('svg')!;

    await act(async () => { pointer(group, 'pointerdown', 50, 50); });
    await act(async () => {
      pointer(svg, 'pointermove', 50 + 37.8, 50);
      pointer(svg, 'pointerup', 50 + 37.8, 50);
    });

    const last = onUpdateShapes.mock.calls.at(-1)?.[0] as Array<{ xMm: number }>;
    expect(last[0]!.xMm).toBeCloseTo(20, 0);
  });

  it('divides the document zoom out of the pointer delta', async () => {
    const onUpdateShapes = vi.fn();
    // At 200 % a 75.6 device pixel move is 37.8 CSS px, i.e. 10 mm — the same drag as above.
    const host = await mountCanvas(onUpdateShapes, { zoom: 200 });
    const group = host.querySelector('[role="button"]')!;
    const svg = host.querySelector('svg')!;

    await act(async () => { pointer(group, 'pointerdown', 50, 50); });
    await act(async () => {
      pointer(svg, 'pointermove', 50 + 75.6, 50);
      pointer(svg, 'pointerup', 50 + 75.6, 50);
    });

    const last = onUpdateShapes.mock.calls.at(-1)?.[0] as Array<{ xMm: number }>;
    expect(last[0]!.xMm).toBeCloseTo(20, 0);
  });
});

describe('WR-SHELL-03 — the drag previews locally and writes the model once', () => {
  function pointerEvent(target: Element, type: string, clientX: number, clientY: number, pointerId = 1): void {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    target.dispatchEvent(event);
  }

  it('moves the SVG during the drag without calling onUpdateShapes', async () => {
    const onUpdateShapes = vi.fn();
    const host = await mountCanvas(onUpdateShapes);
    const group = host.querySelector('[role="button"]')!;
    const svg = host.querySelector('svg')!;

    await act(async () => { pointerEvent(group, 'pointerdown', 50, 50); });
    await act(async () => { pointerEvent(svg, 'pointermove', 50 + 37.8, 50); });

    // No model write during the gesture…
    expect(onUpdateShapes).not.toHaveBeenCalled();
    // …but the live preview already follows the pointer: 10 mm + 10 mm = 20 mm ≈ 75.6 px.
    expect(group.getAttribute('transform')).toContain('translate(75.6');

    await act(async () => { pointerEvent(svg, 'pointerup', 50 + 37.8, 50); });
    expect(onUpdateShapes).toHaveBeenCalledTimes(1);
    const committed = onUpdateShapes.mock.calls[0]![0] as Array<{ xMm: number }>;
    expect(committed[0]!.xMm).toBeCloseTo(20, 0);
  });

  it('captures the pointer, survives leaving the SVG and releases it on pointer up', async () => {
    const onUpdateShapes = vi.fn();
    const host = await mountCanvas(onUpdateShapes);
    const group = host.querySelector('[role="button"]')!;
    const svg = host.querySelector('svg')!;
    const setCapture = vi.fn();
    const releaseCapture = vi.fn();
    Object.assign(group, { setPointerCapture: setCapture, releasePointerCapture: releaseCapture });

    await act(async () => { pointerEvent(group, 'pointerdown', 50, 50, 7); });
    expect(setCapture).toHaveBeenCalledWith(7);

    await act(async () => {
      pointerEvent(svg, 'pointermove', 50 + 37.8, 50, 7);
      // Leaving the SVG while the button is still down must not cancel the gesture.
      svg.dispatchEvent(new MouseEvent('pointerleave', { bubbles: false, cancelable: true }));
    });
    expect(group.getAttribute('transform')).toContain('translate(75.6');

    await act(async () => { pointerEvent(svg, 'pointerup', 50 + 37.8, 50, 7); });
    expect(onUpdateShapes).toHaveBeenCalledTimes(1);
    expect(releaseCapture).toHaveBeenCalledWith(7);
  });
});

describe('WR-034 — selection feedback does not animate the geometry', () => {
  it('carries no transition-all and no pulse on the selected path', async () => {
    const host = await mountCanvas(() => undefined);
    const path = host.querySelector('svg path:not([d^="M0,0"])')!;
    expect(path.getAttribute('class') ?? '').not.toContain('transition-all');
    expect(host.innerHTML).not.toContain('animate-pulse');
    expect(path.getAttribute('class') ?? '').toContain('stroke-blue-400');
  });
});
