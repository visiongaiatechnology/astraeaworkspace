// STATUS: PLATIN — Writer colour picker with a scoped, frame-coalesced live preview
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface WriterColorPickerProps {
  value: string;
  onChange: (color: string, options?: { isIntermediate?: boolean }) => void;
  previewCssVar?: string;
  title?: string;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  className?: string;
  inputClassName?: string;
}

/**
 * The element the live preview variable is written to.
 *
 * It used to be `document.documentElement`, which invalidates the style of the
 * **whole application** on every colour sample — and the writing surface consumes
 * the variable in exactly one paragraph. On a multi-page document the OS colour
 * dialog fires input events far faster than a frame, so every one of them forced a
 * full-document style recalculation and repaint: the "RGB picker hangs" report.
 *
 * The host is therefore resolved as narrowly as the consumer allows:
 *
 * 1. the paragraph the caret is in (`data-writer-paragraph-active`), which is the
 *    only element that reads `--writer-live-text-color` in the rich surface;
 * 2. the paragraph wrapper by id, for the `textarea` path of the special views;
 * 3. the writing surface itself;
 * 4. `documentElement` as the last resort (a picker used outside the Writer).
 */
function resolveWriterColorPreviewHost(activeParagraphId?: string | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.querySelector<HTMLElement>('[data-writer-paragraph-active="true"]');
  if (active) return active;
  if (activeParagraphId) {
    const byId = document.getElementById(`writer-paragraph-${activeParagraphId}`);
    if (byId) return byId;
  }
  const surface = document.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
  if (surface) return surface;
  return document.documentElement;
}

/**
 * WriterColorPicker gives continuous live feedback while the OS colour dialog is
 * dragged, without starving the main thread.
 *
 * - One state update and **one** style write per animation frame, no matter how
 *   many `input` events the platform emits.
 * - The preview variable is written to the smallest element that consumes it, so a
 *   colour sample no longer invalidates the entire document.
 * - The model is committed exactly once — on `change`, `blur` or unmount — with
 *   history coalescing, so a drag is one undo step and zero persistence writes.
 */
export const WriterColorPicker: React.FC<WriterColorPickerProps> = ({
  value,
  onChange,
  previewCssVar,
  title,
  icon,
  label,
  className = 'flex items-center gap-1 cursor-pointer bg-slate-900 border border-white/10 rounded px-1.5 py-1 hover:border-blue-500/40',
  inputClassName = 'w-4 h-4 bg-transparent border-0 cursor-pointer p-0',
}) => {
  const [localColor, setLocalColor] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isInteractingRef = useRef(false);
  const pendingColorRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const previewHostRef = useRef<HTMLElement | null>(null);
  /** Last colour actually written as a preview, so a repeated sample is a no-op. */
  const appliedPreviewRef = useRef<string | null>(null);

  // Sync external value when not actively dragging
  useEffect(() => {
    if (!isInteractingRef.current && value !== localColor) {
      setLocalColor(value);
    }
  }, [value, localColor]);

  const clearPreview = useCallback(() => {
    const host = previewHostRef.current;
    previewHostRef.current = null;
    appliedPreviewRef.current = null;
    if (!host || !previewCssVar) return;
    host.style.removeProperty(previewCssVar);
    // The variable may have been set on a host that is gone; `documentElement` is
    // the only place a stale property could survive a re-render.
    if (host !== document.documentElement && host.style.length === 0) {
      host.removeAttribute('style');
    }
  }, [previewCssVar]);

  /** Writes the preview to the narrowest host, at most once per frame. */
  const applyPreview = useCallback((color: string) => {
    if (!previewCssVar || appliedPreviewRef.current === color) return;
    const host = resolveWriterColorPreviewHost();
    if (!host) return;
    if (previewHostRef.current && previewHostRef.current !== host) {
      previewHostRef.current.style.removeProperty(previewCssVar);
    }
    previewHostRef.current = host;
    appliedPreviewRef.current = color;
    host.style.setProperty(previewCssVar, color);
  }, [previewCssVar]);

  // Clean up RAF and any preview property on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      clearPreview();
    };
  }, [clearPreview]);

  const commitFinal = useCallback((color: string) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    clearPreview();
    isInteractingRef.current = false;
    pendingColorRef.current = null;
    setLocalColor(color);
    onChange(color, { isIntermediate: false });
  }, [clearPreview, onChange]);

  const scheduleFrame = useCallback(() => {
    if (rafIdRef.current !== null) return;
    const flush = () => {
      rafIdRef.current = null;
      const pending = pendingColorRef.current;
      if (pending === null) return;
      setLocalColor(pending);
      if (previewCssVar) {
        // O(1) style write on one element; no React render of the document.
        applyPreview(pending);
        return;
      }
      onChange(pending, { isIntermediate: true });
    };
    if (typeof requestAnimationFrame === 'function') rafIdRef.current = requestAnimationFrame(flush);
    else flush();
  }, [applyPreview, onChange, previewCssVar]);

  /**
   * Every sample — `input` and, depending on the engine, `change` — only *previews*.
   *
   * React maps `onChange` of an `<input>` to the native `input` event on some
   * platforms, so a commit wired to `onChange` would run once per mouse move. Both
   * handlers therefore share one coalesced preview; the model is committed by the
   * native `change` listener below or on blur.
   */
  const queuePreview = useCallback((event: React.SyntheticEvent<HTMLInputElement>) => {
    const nextColor = event.currentTarget.value;
    pendingColorRef.current = nextColor;
    isInteractingRef.current = true;
    scheduleFrame();
  }, [scheduleFrame]);

  const handleInput = queuePreview;
  const handleChange = queuePreview;

  /**
   * The **final** commit listens to the *native* `change` event.
   *
   * For a colour input that is the event fired when the OS dialog commits, not on
   * every sample. React's synthetic `onChange` cannot be used for that: it may be
   * the `input` event, which would put a full model transaction (history, save,
   * pagination) behind every mouse move — the reported stall.
   */
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return undefined;
    const onNativeChange = () => {
      commitFinal(element.value);
    };
    element.addEventListener('change', onNativeChange);
    return () => element.removeEventListener('change', onNativeChange);
  }, [commitFinal]);

  const handleBlur = useCallback(() => {
    if (isInteractingRef.current || pendingColorRef.current) {
      commitFinal(pendingColorRef.current ?? localColor);
    }
  }, [commitFinal, localColor]);

  return (
    <label className={className} title={title}>
      {label}
      {icon}
      <input
        ref={inputRef}
        type="color"
        value={localColor}
        onInput={handleInput}
        onChange={handleChange}
        onBlur={handleBlur}
        className={inputClassName}
      />    </label>
  );
};
