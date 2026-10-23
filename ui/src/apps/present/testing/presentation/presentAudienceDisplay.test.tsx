// @vitest-environment happy-dom
// STATUS: GOLD — Present Runde 42: the audience/projector window renders only the slide, follows the
// presenter's goto/black commands and honours reduced motion for slide animations.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PresentAnimation, PresentSlide } from '../../../../shared/contracts/workspace';
import { PresentDisplayApp } from '../../presentation/display/PresentDisplayApp';
import {
  TEST_DISPLAY_SLIDES,
  createDisplaySnapshot,
  createEditorPeer,
  createPresenterPeer,
  createPresentSessionTestHub,
  type PresentSessionTestHub,
} from './presentSessionTestHub';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const SESSION = 'present-audience-session';

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

interface MountedAudience {
  readonly element: HTMLDivElement;
  readonly hub: PresentSessionTestHub;
  readonly editor: ReturnType<typeof createEditorPeer>;
  readonly presenter: ReturnType<typeof createPresenterPeer>;
}

const TITLE_ANIMATION: PresentAnimation = {
  id: 'anim-title',
  targetId: 'slide-title',
  effect: 'fade-in',
  trigger: 'on-click',
  durationMs: 400,
  delayMs: 0,
};

const ANIMATED_SLIDES: PresentSlide[] = [
  { ...TEST_DISPLAY_SLIDES[0], animations: [TITLE_ANIMATION] } as PresentSlide,
  TEST_DISPLAY_SLIDES[1],
];

async function mountAudience(options: {
  reducedMotion?: boolean;
  slides?: PresentSlide[];
} = {}): Promise<MountedAudience> {
  const hub = createPresentSessionTestHub();
  const editor = createEditorPeer(hub, SESSION, () => createDisplaySnapshot({
    slides: options.slides ?? TEST_DISPLAY_SLIDES,
  }));
  const presenter = createPresenterPeer(hub, SESSION);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(PresentDisplayApp, {
      role: 'audience',
      session: SESSION,
      locale: 'en-US',
      channelFactory: hub.factory,
      reducedMotionOverride: options.reducedMotion ?? false,
    }));
  });
  await act(async () => undefined);
  return { element: container, hub, editor, presenter };
}

describe('Present audience display', () => {
  it('renders the slide from the editor snapshot and nothing else', async () => {
    const { element } = await mountAudience();
    expect(element.querySelector('[data-present-display-root="audience"]')).not.toBeNull();
    expect(element.querySelector('[data-present-display-phase]')?.getAttribute('data-present-display-phase')).toBe('ready');
    expect(element.querySelector('[data-present-slide-stage="true"]')).not.toBeNull();
    expect(element.textContent).toContain('Opening');
    expect(element.textContent).toContain('A subtitle');
    // No editor chrome in the audience window.
    expect(element.querySelector('[data-vgt-present-root]')).toBeNull();
    expect(element.querySelector('[data-present-notes-panel]')).toBeNull();
  });

  it('follows the presenter navigation and the black-screen command', async () => {
    const { element, presenter } = await mountAudience();
    await act(async () => presenter.channel.sendGoto({ index: 1, clickGroupIndex: 0, slideId: 'slide-closing' }));
    expect(element.textContent).toContain('Closing');
    expect(element.querySelector('[data-present-black-screen="true"]')).toBeNull();

    await act(async () => presenter.channel.sendBlack(true));
    expect(element.querySelector('[data-present-black-screen="true"]')).not.toBeNull();

    await act(async () => presenter.channel.sendBlack(false));
    expect(element.querySelector('[data-present-black-screen="true"]')).toBeNull();
  });

  it('ignores editor goto/black messages (only the presenter drives the show)', async () => {
    const { element, editor } = await mountAudience();
    await act(async () => {
      editor.channel.sendGoto({ index: 1, clickGroupIndex: 0, slideId: 'slide-closing' });
      editor.channel.sendBlack(true);
    });
    expect(element.textContent).toContain('Opening');
    expect(element.querySelector('[data-present-black-screen="true"]')).toBeNull();
  });

  it('does not rewind when a later initial snapshot arrives for a second display window', async () => {
    const { element, editor, presenter } = await mountAudience();
    await act(async () => presenter.channel.sendGoto({ index: 1, clickGroupIndex: 0, slideId: 'slide-closing' }));
    expect(element.textContent).toContain('Closing');
    // The editor answers every display `hello` with an initial snapshot; the audience is already
    // showing slide 2 and must stay there.
    await act(async () => editor.channel.sendSnapshot(createDisplaySnapshot({ reason: 'initial' })));
    expect(element.textContent).toContain('Closing');
  });

  it('keeps a click-triggered fade-in hidden until the presenter plays the step', async () => {
    const { element } = await mountAudience({ slides: ANIMATED_SLIDES });
    const title = element.querySelector('h1') as HTMLElement | null;
    expect(title).not.toBeNull();
    expect(title?.style.opacity).toBe('0');
  });

  it('applies reduced motion as the final animation state immediately', async () => {
    const { element } = await mountAudience({ slides: ANIMATED_SLIDES, reducedMotion: true });
    const title = element.querySelector('h1') as HTMLElement | null;
    expect(title).not.toBeNull();
    expect(title?.style.opacity).toBe('1');
  });

  it('stays on the last slide when the session ends without throwing', async () => {
    const { element, editor } = await mountAudience();
    await act(async () => editor.channel.sendEnd('editor-end'));
    expect(element.querySelector('[data-present-display-root="audience"]')).not.toBeNull();
  });
});
