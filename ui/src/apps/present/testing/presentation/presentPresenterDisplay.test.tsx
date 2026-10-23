// @vitest-environment happy-dom
// STATUS: GOLD — Present Runde 42: the presenter window shows slide left / notes right, drives the
// audience through the bus, toggles the black screen and ends the presentation explicitly.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PresentDisplayApp } from '../../presentation/display/PresentDisplayApp';
import {
  createDisplaySnapshot,
  createEditorPeer,
  createPresenterPeer,
  createPresentSessionTestHub,
  type PresentSessionTestHub,
} from './presentSessionTestHub';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const SESSION = 'present-presenter-session';

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

interface MountedPresenter {
  readonly element: HTMLDivElement;
  readonly hub: PresentSessionTestHub;
  readonly editor: ReturnType<typeof createEditorPeer>;
  readonly presenter: ReturnType<typeof createPresenterPeer>;
}

async function mountPresenter(): Promise<MountedPresenter> {
  const hub = createPresentSessionTestHub();
  const editor = createEditorPeer(hub, SESSION, () => createDisplaySnapshot());
  const presenter = createPresenterPeer(hub, SESSION);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(PresentDisplayApp, {
      role: 'presenter',
      session: SESSION,
      locale: 'en-US',
      channelFactory: hub.factory,
      reducedMotionOverride: true,
    }));
  });
  await act(async () => undefined);
  return { element: container, hub, editor, presenter };
}

function pressKey(key: string): Promise<void> {
  return act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('Present presenter display', () => {
  it('renders the slide, the next slide and the speaker notes', async () => {
    const { element } = await mountPresenter();
    expect(element.querySelector('[data-present-display-root="presenter"]')).not.toBeNull();
    expect(element.textContent).toContain('Opening');
    expect(element.querySelector('[data-present-notes-panel="true"]')).not.toBeNull();
    expect(element.querySelector('[data-present-notes-text="true"]')?.textContent).toContain('Speaker says hello.');
    expect(element.querySelector('[data-present-next-title="true"]')?.textContent).toContain('Closing');
    expect(element.querySelector('[data-present-slide-counter="true"]')?.textContent).toContain('Slide 1 of 2');
    expect(element.querySelector('[data-present-timer="true"]')).not.toBeNull();
  });

  it('advances the deck and broadcasts the goto to the audience through the bus', async () => {
    const { element, presenter } = await mountPresenter();
    await pressKey('ArrowRight');
    expect(element.textContent).toContain('Closing');
    expect(element.querySelector('[data-present-notes-text="true"]')?.textContent).toContain('Thank you.');
    expect(presenter.received.map((message) => message.type)).toContain('goto');
    const goto = presenter.received.find((message) => message.type === 'goto');
    expect(goto?.type === 'goto' ? goto.payload : null).toEqual({
      index: 1,
      clickGroupIndex: 0,
      slideId: 'slide-closing',
    });
  });

  it('navigates back with the previous control and with the keyboard', async () => {
    const { element } = await mountPresenter();
    await act(async () => {
      (element.querySelector('[data-present-next="true"]') as HTMLButtonElement).click();
    });
    expect(element.textContent).toContain('Closing');
    await pressKey('ArrowLeft');
    expect(element.textContent).toContain('Opening');
    expect(element.querySelector('[data-present-notes-text="true"]')?.textContent).toContain('Speaker says hello.');
  });

  it('toggles and broadcasts the black screen', async () => {
    const { element, presenter } = await mountPresenter();
    await pressKey('b');
    expect(element.querySelector('[data-present-black-screen="true"]')).not.toBeNull();
    const black = presenter.received.find((message) => message.type === 'black');
    expect(black?.type === 'black' ? black.payload : null).toEqual({ enabled: true });
    await pressKey('b');
    expect(element.querySelector('[data-present-black-screen="true"]')).toBeNull();
  });

  it('asks before ending and broadcasts end on confirmation', async () => {
    const { element, presenter } = await mountPresenter();
    await pressKey('Escape');
    expect(element.querySelector('[data-present-end-confirm="true"]')).not.toBeNull();
    await act(async () => {
      (element.querySelector('[data-present-end-cancel="true"]') as HTMLButtonElement).click();
    });
    expect(element.querySelector('[data-present-end-confirm="true"]')).toBeNull();
    expect(presenter.received.some((message) => message.type === 'end')).toBe(false);

    await pressKey('Escape');
    await act(async () => {
      (element.querySelector('[data-present-end-confirm-action="true"]') as HTMLButtonElement).click();
    });
    const end = presenter.received.find((message) => message.type === 'end');
    expect(end?.type === 'end' ? end.payload : null).toEqual({ reason: 'presenter-end' });
    expect(element.querySelector('[data-present-display-status="presenter"]')).not.toBeNull();
    expect(element.textContent).toContain('Presentation ended');
  });

  it('explains a missing channel instead of rendering an empty window', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(PresentDisplayApp, {
        role: 'presenter',
        session: SESSION,
        locale: 'en-US',
        channelFactory: () => null,
        reducedMotionOverride: true,
      }));
    });
    expect(container.querySelector('[data-present-display-status="presenter"]')).not.toBeNull();
    expect(container.textContent).toContain('cannot join the presentation');
  });
});
