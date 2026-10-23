// STATUS: PLATIN — the one reader of the shell's workspace scale for the application modules.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * The scale the workspace shell publishes on `document.documentElement`.
 *
 * `useWorkspaceShellAppearanceLifecycle` writes three things there:
 *
 *   root.dataset.astraeaScaleBand    = shellScaleBand(projection.scalePercent);
 *   root.dataset.astraeaScalePercent = String(projection.scalePercent);
 *   root.style.fontSize              = `${projection.scalePercent}%`;
 *
 * The scale is therefore a property of the *workspace*, not of a module: a module either follows it or
 * it does not. The neighbouring modules that follow it are Automate (`readWorkspaceScale`),
 * Grid (`zoomScale`), Connect and the search hub. Present and PDF Studio had no reader at all.
 *
 * This hook is that reader. It is deliberately layer-free: it depends on nothing but React and the
 * DOM, so `src/shared` stays free of `src/shell` imports.
 */

export type WorkspaceUiScaleBand = 'standard' | 'increased' | 'maximum';

export interface WorkspaceUiScale {
  /** Clamped to the shell's own range, 25–400. */
  percent: number;
  /**
   * The band the shell publishes for this percentage (`shellScaleBand`): `standard` up to 100,
   * `increased` up to 174, `maximum` from 175. Recomputed rather than read, so the label cannot
   * disagree with the number.
   */
  band: WorkspaceUiScaleBand;
  /** Percentage written to the root's `data-astraea-scale-percent`; the observable module effect. */
  scaleAttribute: string;
  /** Applied to the module root as an inline style; the observable, inherited effect. */
  style: CSSProperties;
}

/**
 * The band boundaries are the shell's own (`workspaceShellPlatformAppearance.ts:33-36`). They are
 * duplicated here as literals on purpose: importing them would make `src/shared` depend on
 * `src/shell`, and the shared layer is the lower one.
 */
export function workspaceUiScaleBand(percent: number): WorkspaceUiScaleBand {
  if (!Number.isFinite(percent) || percent <= 100) return 'standard';
  return percent >= 175 ? 'maximum' : 'increased';
}

export function clampWorkspaceUiScalePercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(25, Math.min(400, Math.round(value)));
}

/**
 * Reads the published scale, preferring the explicit percent attribute the shell writes and falling
 * back to the root font size the shell sets in the same `apply()`. The font-size fallback matters in
 * tests and embeddings where the attribute is absent but the root is scaled.
 */
export function readWorkspaceUiScalePercent(): number {
  if (typeof document === 'undefined') return 100;
  const root = document.documentElement;
  const published = Number.parseFloat(root.dataset.astraeaScalePercent ?? '');
  if (Number.isFinite(published)) return clampWorkspaceUiScalePercent(published);
  if (typeof window === 'undefined') return 100;
  /**
   * GR-001/PR-001 (native crash candidate class) — the shell scale is an **enhancement**.
   *
   * `getComputedStyle` is a host API: a hardened WebView2/DOM shim can throw here. This function
   * runs in the **render path** of every module root (via `scaleFromElement`), so a throw took the
   * whole module tree down — measured as an empty DOM inside a mounted Present module. A scale
   * that cannot be read is 100 %, never a lost module.
   */
  let rootFontSize = Number.NaN;
  try {
    rootFontSize = Number.parseFloat(window.getComputedStyle(root).fontSize);
  } catch {
    return 100;
  }
  if (!Number.isFinite(rootFontSize) || rootFontSize <= 0) return 100;
  return clampWorkspaceUiScalePercent((rootFontSize / 16) * 100);
}

function scaleFromElement(element: HTMLElement | null): WorkspaceUiScale {
  const published = element?.dataset.astraeaScalePercent;
  const percent = published === undefined
    ? readWorkspaceUiScalePercent()
    : clampWorkspaceUiScalePercent(Number.parseFloat(published));
  return {
    percent,
    band: workspaceUiScaleBand(percent),
    scaleAttribute: String(percent),
    style: { fontSize: `${percent}%` },
  };
}

/**
 * Follows the workspace scale and returns the style and marker a module root has to carry.
 *
 * Two observable effects, deliberately chosen because both are measurable on the rendered node:
 *   1. an inline `font-size` in percent, so every `em`/percentage descendant of the module root
 *      scales with the workspace — the px-classed text does not, and that is the measured residue;
 *   2. `data-astraea-scale-percent`, the same marker the shell publishes, so a stylesheet (or an
 *      audit) can address the module at a given scale without re-deriving it.
 *
 * The observer is what makes the effect *live*: the shell writes the scale on a keypress (`+`/`-`/`0`
 * in `App.tsx`), not once at start-up.
 */
export function useWorkspaceUiScale(): WorkspaceUiScale {
  const [scale, setScale] = useState<WorkspaceUiScale>(() => scaleFromElement(null));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const sync = () => {
      const next = scaleFromElement(root);
      setScale((previous) => (
        previous.percent === next.percent && previous.band === next.band ? previous : next
      ));
    };
    sync();
    /**
     * GR-001/PR-001 (native crash candidate class) — the observer is optional.
     *
     * `new MutationObserver(sync)` ran unguarded in an effect of **every** module root. A host
     * whose `MutationObserver` exists but throws on construction (or on `observe`) removed the whole
     * module tree — measured as a blank Present module. Without the observer the scale is simply
     * static (the initial `sync()` above already read it); it does not follow a later shell change.
     */
    if (typeof MutationObserver === 'function') {
      let observer: MutationObserver | null = null;
      try {
        observer = new MutationObserver(sync);
        observer.observe(root, { attributes: true, attributeFilter: ['style', 'data-astraea-scale-percent'] });
      } catch {
        try { observer?.disconnect(); } catch { /* a hostile observer is unusable anyway */ }
        observer = null;
      }
      if (observer) {
        return () => {
          try { observer?.disconnect(); } catch { /* ignore a hostile observer on teardown */ }
        };
      }
    }
  }, []);

  return scale;
}
