// @vitest-environment happy-dom
// STATUS: PLATIN — Colour picker preview performance (M2-Zusatzauftrag)
//
// The desktop report was "die RGB-Textfarbwahl hängt stark". The cause was
// measurable, not aesthetic: the picker wrote the live preview **on
// `document.documentElement` for every `input` event** of the OS colour dialog.
// A custom property there invalidates the style of the entire application tree,
// while exactly one paragraph consumes it — hundreds of full-document style
// recalculations per second.
//
// These tests pin the three properties that fix it:
//   1. the preview host is the paragraph, never the document root;
//   2. the writes are coalesced to one per animation frame;
//   3. the model is committed exactly once, on `change`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WriterColorPicker } from '../../../formatting/toolbar/WriterColorPicker';

const PREVIEW_VAR = '--writer-live-text-color';

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let anchor: HTMLDivElement | null = null;

async function mount(onChange: (color: string, options?: { isIntermediate?: boolean }) => void): Promise<HTMLInputElement> {
  anchor = document.createElement('div');
  anchor.setAttribute('data-writer-paragraph-active', 'true');
  document.body.appendChild(anchor);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <WriterColorPicker value="#000000" onChange={onChange} previewCssVar={PREVIEW_VAR} title="Textfarbe" />,
    );
  });
  return container.querySelector<HTMLInputElement>('input[type="color"]')!;
}

/** Waits for the next animation frame plus its microtask tail. */
async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      } else {
        setTimeout(resolve, 0);
      }
    });
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
  anchor?.remove();
  anchor = null;
  document.documentElement.style.removeProperty(PREVIEW_VAR);
});

describe('Textfarbwahl — the preview must not invalidate the whole document', () => {
  it('writes the preview onto the active paragraph, not onto documentElement', async () => {
    const onChange = vi.fn();
    const input = await mount(onChange);

    await act(async () => {
      input.value = '#3366ff';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await nextFrame();

    expect(anchor!.style.getPropertyValue(PREVIEW_VAR)).toBe('#3366ff');
    // The root must stay untouched — that is the whole performance argument.
    expect(document.documentElement.style.getPropertyValue(PREVIEW_VAR)).toBe('');
    // A preview alone never touches the model.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('coalesces hundreds of input events into one style write per frame', async () => {
    const onChange = vi.fn();
    const input = await mount(onChange);
    const setProperty = vi.spyOn(anchor!.style, 'setProperty');

    await act(async () => {
      for (let step = 0; step < 40; step += 1) {
        input.value = `#${(step * 6).toString(16).padStart(2, '0')}0000`;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await nextFrame();

    // One frame, one write — independent of the event rate.
    expect(setProperty).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    setProperty.mockRestore();
  });

  it('commits exactly once on change and removes the preview again', async () => {
    const onChange = vi.fn();
    const input = await mount(onChange);

    await act(async () => {
      input.value = '#112233';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await nextFrame();
    expect(anchor!.style.getPropertyValue(PREVIEW_VAR)).toBe('#112233');

    await act(async () => {
      input.value = '#445566';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await nextFrame();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('#445566', { isIntermediate: false });
    // The temporary preview is gone; the committed colour is the model's business.
    expect(anchor!.style.getPropertyValue(PREVIEW_VAR)).toBe('');
  });

  it('repeated identical samples are a no-op', async () => {
    const onChange = vi.fn();
    const input = await mount(onChange);
    const setProperty = vi.spyOn(anchor!.style, 'setProperty');

    await act(async () => {
      input.value = '#abcdef';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await nextFrame();
    await act(async () => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await nextFrame();

    expect(setProperty).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    setProperty.mockRestore();
  });
});
