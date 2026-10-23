// STATUS: PLATIN — isolated Writer focus-mode and DOM focus-return lifecycle.
import { useCallback, useMemo, useRef } from 'react';
import type { ViewMode } from '../../types';

type MutableRef<T> = { current: T };

export interface WriterFocusModePorts {
  getActiveElement: () => Element | null;
  isHtmlElement: (candidate: Element | null) => candidate is HTMLElement;
  scheduleFocus: (callback: FrameRequestCallback) => void;
  getExitButton: () => HTMLButtonElement | null;
  getReturnElement: () => HTMLElement | null;
  findFallbackFocusTarget: () => HTMLButtonElement | null;
}

export interface WriterFocusModeControllerOptions {
  currentMode: ViewMode;
  requestedMode: ViewMode;
  focusReturnElementRef: MutableRef<HTMLElement | null>;
  setViewMode: (mode: ViewMode) => void;
  ports: WriterFocusModePorts;
}

export function requestWriterViewMode(options: WriterFocusModeControllerOptions): void {
  const { currentMode, requestedMode, focusReturnElementRef, setViewMode, ports } = options;
  if (requestedMode !== 'focus' || currentMode === 'focus') {
    setViewMode(requestedMode);
    return;
  }

  const activeElement = ports.getActiveElement();
  focusReturnElementRef.current = ports.isHtmlElement(activeElement) ? activeElement : null;
  setViewMode('focus');
  ports.scheduleFocus(() => ports.getExitButton()?.focus());
}

export interface ExitWriterFocusModeOptions {
  exitFocusMode: () => void;
  ports: WriterFocusModePorts;
}

export function exitWriterFocusMode(options: ExitWriterFocusModeOptions): void {
  options.exitFocusMode();
  options.ports.scheduleFocus(() => {
    const previousElement = options.ports.getReturnElement();
    if (previousElement?.isConnected) {
      previousElement.focus();
      return;
    }
    options.ports.findFallbackFocusTarget()?.focus();
  });
}

export function useWriterFocusMode(
  viewMode: ViewMode,
  setViewMode: (mode: ViewMode) => void,
  exitFocusMode: () => void,
) {
  const focusExitButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusReturnElementRef = useRef<HTMLElement | null>(null);
  const ports = useMemo<WriterFocusModePorts>(() => ({
    getActiveElement: () => window.document.activeElement,
    isHtmlElement: (candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
    scheduleFocus: (callback) => { window.requestAnimationFrame(callback); },
    getExitButton: () => focusExitButtonRef.current,
    getReturnElement: () => focusReturnElementRef.current,
    findFallbackFocusTarget: () => window.document.querySelector<HTMLButtonElement>('[data-writer-view-mode="focus"]'),
  }), []);

  const handleSetViewMode = useCallback((requestedMode: ViewMode) => {
    requestWriterViewMode({
      currentMode: viewMode,
      requestedMode,
      focusReturnElementRef,
      setViewMode,
      ports,
    });
  }, [ports, setViewMode, viewMode]);

  const handleExitFocusMode = useCallback(() => {
    exitWriterFocusMode({ exitFocusMode, ports });
  }, [exitFocusMode, ports]);

  return { focusExitButtonRef, handleSetViewMode, handleExitFocusMode };
}
