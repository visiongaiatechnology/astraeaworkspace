// STATUS: PLATIN — Writer focus-mode transitions and focus restoration contracts.
import { describe, expect, it, vi } from 'vitest';
import type { ViewMode } from '../../../../types';
import {
  exitWriterFocusMode,
  requestWriterViewMode,
  type WriterFocusModePorts,
} from '../../../../editor/focus/useWriterFocusMode';

function createFocusModeFixture() {
  const scheduled: FrameRequestCallback[] = [];
  const previousElementState = { isConnected: true, focus: vi.fn() };
  const previousElement = previousElementState as unknown as HTMLElement;
  const exitButton = { focus: vi.fn() } as unknown as HTMLButtonElement;
  const fallbackButton = { focus: vi.fn() } as unknown as HTMLButtonElement;
  const focusReturnElementRef = { current: previousElement as HTMLElement | null };
  const focusExitButtonRef = { current: exitButton as HTMLButtonElement | null };
  let activeElement: Element | null = previousElement;
  let activeElementIsHtml = true;
  let fallbackTarget: HTMLButtonElement | null = fallbackButton;
  const ports: WriterFocusModePorts = {
    getActiveElement: () => activeElement,
    isHtmlElement: (candidate): candidate is HTMLElement => candidate === activeElement && activeElementIsHtml,
    scheduleFocus: (callback) => { scheduled.push(callback); },
    getExitButton: () => focusExitButtonRef.current,
    getReturnElement: () => focusReturnElementRef.current,
    findFallbackFocusTarget: () => fallbackTarget,
  };
  return {
    scheduled,
    previousElement,
    exitButton,
    fallbackButton,
    focusReturnElementRef,
    focusExitButtonRef,
    previousElementState,
    ports,
    setActiveElement: (value: Element | null, isHtml: boolean) => { activeElement = value; activeElementIsHtml = isHtml; },
    setFallbackTarget: (value: HTMLButtonElement | null) => { fallbackTarget = value; },
  };
}

function runNextFrame(scheduled: FrameRequestCallback[]): void {
  const callback = scheduled.shift();
  if (callback) callback(0);
}

describe('Writer focus-mode controller', () => {
  it('captures the active HTML element and focuses the exit control after entering focus mode', () => {
    const fixture = createFocusModeFixture();
    const setViewMode = vi.fn<(mode: ViewMode) => void>();

    requestWriterViewMode({
      currentMode: 'reading',
      requestedMode: 'focus',
      focusReturnElementRef: fixture.focusReturnElementRef,
      setViewMode,
      ports: fixture.ports,
    });

    expect(fixture.focusReturnElementRef.current).toBe(fixture.previousElement);
    expect(setViewMode).toHaveBeenCalledExactlyOnceWith('focus');
    expect(fixture.exitButton.focus).not.toHaveBeenCalled();
    runNextFrame(fixture.scheduled);
    expect(fixture.exitButton.focus).toHaveBeenCalledOnce();
  });

  it('does not capture or redirect focus for a normal mode change or repeated focus request', () => {
    const fixture = createFocusModeFixture();
    const setViewMode = vi.fn<(mode: ViewMode) => void>();

    requestWriterViewMode({
      currentMode: 'reading',
      requestedMode: 'draft',
      focusReturnElementRef: fixture.focusReturnElementRef,
      setViewMode,
      ports: fixture.ports,
    });
    requestWriterViewMode({
      currentMode: 'focus',
      requestedMode: 'focus',
      focusReturnElementRef: fixture.focusReturnElementRef,
      setViewMode,
      ports: fixture.ports,
    });

    expect(setViewMode.mock.calls).toEqual([['draft'], ['focus']]);
    expect(fixture.focusReturnElementRef.current).toBe(fixture.previousElement);
    expect(fixture.scheduled).toHaveLength(0);
  });

  it('restores a connected prior target or falls back after the target disconnects', () => {
    const fixture = createFocusModeFixture();
    const exit = vi.fn();

    exitWriterFocusMode({ exitFocusMode: exit, ports: fixture.ports });
    expect(exit).toHaveBeenCalledOnce();
    fixture.previousElementState.isConnected = true;
    runNextFrame(fixture.scheduled);
    expect(fixture.previousElement.focus).toHaveBeenCalledOnce();
    expect(fixture.fallbackButton.focus).not.toHaveBeenCalled();

    fixture.previousElementState.isConnected = false;
    exitWriterFocusMode({ exitFocusMode: exit, ports: fixture.ports });
    runNextFrame(fixture.scheduled);
    expect(fixture.fallbackButton.focus).toHaveBeenCalledOnce();
  });

  it('reads the prior target when the scheduled restoration runs', () => {
    const fixture = createFocusModeFixture();
    const exit = vi.fn();
    exitWriterFocusMode({ exitFocusMode: exit, ports: fixture.ports });
    fixture.focusReturnElementRef.current = { isConnected: false, focus: vi.fn() } as unknown as HTMLElement;

    runNextFrame(fixture.scheduled);

    expect(fixture.fallbackButton.focus).toHaveBeenCalledOnce();
  });

  it('does not retain non-HTML active elements as a focus restoration target', () => {
    const fixture = createFocusModeFixture();
    const setViewMode = vi.fn<(mode: ViewMode) => void>();
    fixture.setActiveElement({ focus: vi.fn() } as unknown as Element, false);

    requestWriterViewMode({
      currentMode: 'print',
      requestedMode: 'focus',
      focusReturnElementRef: fixture.focusReturnElementRef,
      setViewMode,
      ports: fixture.ports,
    });

    expect(fixture.focusReturnElementRef.current).toBeNull();
    expect(setViewMode).toHaveBeenCalledExactlyOnceWith('focus');
  });
});
