// @vitest-environment happy-dom
// STATUS: GOLD — Present Runde 42: the start dialog lists monitors, preselects roles and offers the
// single-screen fallback. It also proves the modal contract: Escape, focus containment/restoration,
// explicit unavailable states and a visible error for a failed start.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentationStartDialog, type PresentationStartDialogProps } from '../../presentation/dialog/PresentationStartDialog';
import { DEFAULT_PRESENT_DISPLAY_PREFERENCE } from '../../presentation/preferences/presentDisplayPreferences';
import { createMonitorFixture } from './presentSessionTestHub';
import type { PresentMonitorInfo } from '../../../../platform/native/presentWindowBridge';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

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

function baseProps(overrides: Partial<PresentationStartDialogProps> = {}): PresentationStartDialogProps {
  return {
    monitors: createMonitorFixture(),
    displayAvailable: true,
    preference: DEFAULT_PRESENT_DISPLAY_PREFERENCE,
    storedPreference: false,
    locale: 'en-US',
    onCancel: vi.fn(),
    onStartSingleScreen: vi.fn(),
    onStartMultiScreen: vi.fn(),
    ...overrides,
  };
}

async function renderDialog(props: PresentationStartDialogProps): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(PresentationStartDialog, props));
  });
  return container;
}

function click(element: Element | null): Promise<void> {
  return act(async () => {
    if (element instanceof HTMLElement) element.click();
  });
}

function pressKey(element: Element, key: string, init: KeyboardEventInit = {}): Promise<void> {
  return act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

describe('Present start dialog', () => {
  it('lists monitors with name, resolution and the primary badge and preselects the roles', async () => {
    const element = await renderDialog(baseProps());
    expect(element.querySelector('[data-present-start-dialog="true"]')).not.toBeNull();
    expect(element.querySelector('[data-present-monitor-row="audience:0"]')?.textContent).toContain('Display 1');
    expect(element.querySelector('[data-present-monitor-row="audience:0"]')?.textContent).toContain('1920 × 1080');
    expect(element.querySelector('[data-present-monitor-row="presenter:0"] [data-present-primary-badge="true"]')).not.toBeNull();

    const audienceFirst = element.querySelector<HTMLInputElement>('input[name="present-audience-monitor"][value="0"]');
    const audienceSecond = element.querySelector<HTMLInputElement>('input[name="present-audience-monitor"][value="1"]');
    const presenterFirst = element.querySelector<HTMLInputElement>('input[name="present-presenter-monitor"][value="0"]');
    const presenterSecond = element.querySelector<HTMLInputElement>('input[name="present-presenter-monitor"][value="1"]');
    expect(audienceFirst?.checked).toBe(false);
    expect(audienceSecond?.checked).toBe(true);
    expect(presenterFirst?.checked).toBe(true);
    expect(presenterSecond?.checked).toBe(false);
  });

  it('starts the two-window presentation with the selected monitors', async () => {
    const props = baseProps();
    const element = await renderDialog(props);
    const submit = element.querySelector('[data-present-start-submit="true"]');
    expect(submit?.getAttribute('data-present-start-mode')).toBe('multi');
    await click(submit);
    expect(props.onStartMultiScreen).toHaveBeenCalledWith({
      audienceMonitorIndex: 1,
      presenterMonitorIndex: 0,
    });
    expect(props.onStartSingleScreen).not.toHaveBeenCalled();
  });

  it('offers the single-screen path and start it by click', async () => {
    const props = baseProps();
    const element = await renderDialog(props);
    const singleMode = element.querySelector<HTMLInputElement>('input[name="present-start-mode"][value="single"]');
    await click(singleMode);
    const submit = element.querySelector('[data-present-start-submit="true"]');
    expect(submit?.getAttribute('data-present-start-mode')).toBe('single');
    await click(submit);
    expect(props.onStartSingleScreen).toHaveBeenCalledTimes(1);
    expect(props.onStartMultiScreen).not.toHaveBeenCalled();
  });

  it('cancels with Escape and with the cancel/close buttons', async () => {
    const props = baseProps();
    const element = await renderDialog(props);
    const panel = element.querySelector('[data-present-start-dialog="true"]') as HTMLElement;
    await pressKey(panel, 'Escape');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    await click(element.querySelector('[data-present-dialog-cancel="true"]'));
    await click(element.querySelector('[data-present-dialog-close="true"]'));
    expect(props.onCancel).toHaveBeenCalledTimes(3);
  });

  it('contains Tab focus inside the dialog and restores it on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const props = baseProps();
    const element = await renderDialog(props);
    const panel = element.querySelector('[data-present-start-dialog="true"]') as HTMLElement;
    expect(panel.contains(document.activeElement)).toBe(true);

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, input'));
    const last = focusable[focusable.length - 1];
    last.focus();
    await pressKey(last, 'Tab');
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);

    await act(async () => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('states the native-unavailable fallback and keeps only the single-screen mode', async () => {
    const props = baseProps({ displayAvailable: false, monitors: [] });
    const element = await renderDialog(props);
    expect(element.querySelector('[data-present-native-unavailable="true"]')).not.toBeNull();
    const multiMode = element.querySelector<HTMLInputElement>('input[name="present-start-mode"][value="multi"]');
    expect(multiMode?.disabled).toBe(true);
    expect(element.querySelector('[data-present-start-submit="true"]')?.getAttribute('data-present-start-mode')).toBe('single');
    await click(element.querySelector('[data-present-start-submit="true"]'));
    expect(props.onStartSingleScreen).toHaveBeenCalledTimes(1);
  });

  it('explains the single-monitor situation and offers single-screen prominently', async () => {
    const monitors: PresentMonitorInfo[] = createMonitorFixture([{ index: 0, name: 'Laptop', primary: true }]);
    const props = baseProps({ monitors });
    const element = await renderDialog(props);
    expect(element.querySelector('[data-present-single-monitor-notice="true"]')).not.toBeNull();
    const multiMode = element.querySelector<HTMLInputElement>('input[name="present-start-mode"][value="multi"]');
    expect(multiMode?.disabled).toBe(true);
  });

  it('warns when projector and presenter are put on the same screen', async () => {
    const element = await renderDialog(baseProps());
    expect(element.querySelector('[data-present-same-monitor-warning="true"]')).toBeNull();
    const audiencePrimary = element.querySelector<HTMLInputElement>('input[name="present-audience-monitor"][value="0"]');
    await click(audiencePrimary);
    expect(element.querySelector('[data-present-same-monitor-warning="true"]')).not.toBeNull();
  });

  it('disables the primary action while a start is in flight and shows a start error', async () => {
    const busyElement = await renderDialog(baseProps({ busy: true }));
    const busySubmit = busyElement.querySelector<HTMLButtonElement>('[data-present-start-submit="true"]');
    expect(busySubmit?.disabled).toBe(true);
    await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;

    const errorElement = await renderDialog(baseProps({ error: 'open-failed' }));
    const alert = errorElement.querySelector('[data-present-start-error="true"]');
    expect(alert?.textContent).toContain('could not be opened');
  });
});
