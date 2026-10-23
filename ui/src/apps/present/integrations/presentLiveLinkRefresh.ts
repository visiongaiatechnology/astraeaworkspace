// STATUS: PLATIN — Paket 15 on the **reopen** path: a live-link refresh that cannot take the editor down.
//
// ## The defect this module closes (measured, not assumed) ✓✓
//
// `PresentCanvas` refreshed every `Live` workspace object inside a `useEffect`. That effect called
// `refreshPresentWorkspaceObject`, which reaches the neutral snapshot port
// (`platform/workspace/integrations/workspaceSnapshot.ts:113`). That port is installed once for the
// whole app (`app/App.tsx:39` → `installWriterWorkspaceSnapshotHost`) and **throws**
// `WorkspaceSnapshotProviderUnavailableError` when it is not installed, and
// `WorkspaceSnapshotBudgetExceededError` / `WorkspaceSnapshotShapeRejectedError` when the source
// document cannot be turned into a bounded snapshot.
//
// None of those three was caught anywhere between the port and the component ✗. Consequence: opening
// a deck that contains one `Live` workspace object next to an unavailable or unusable source threw
// **out of the render effect** — the editor did not report "Offline · source not available", which is
// exactly what Paket 15 ("Ändert sich Quelle, meldet Folie Aktualisierung **oder Offline-Zustand**")
// demands, it failed to mount at all ✗✗.
//
// ## The rule here, and why it is not a second refresh rule ✓
//
// This module owns **no** snapshot logic. It calls the existing `refreshPresentWorkspaceObject` per
// object and turns a **failure into a named, visible result** instead of an exception. The
// vocabulary is the one that already exists: `resolvePresentLinkStatus`
// (`integrations/presentLinkStatus.ts:47`) reports a link whose source is not available as
// `offline` with `attention: true`, and every live workspace object whose refresh failed is left
// **untouched**, so its stored `sourceVersion` stays behind the source and the badge tells the truth
// instead of showing stale numbers as current ✓.
//
// A failed object is never rewritten and never removed: a refresh that did not happen must not look
// like a refresh that did.

import type { PresentSceneObject, PresentSlide, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { isPlainPresentRecord } from '../canvas/model/presentScene';
import { refreshPresentWorkspaceObject } from './presentWorkspaceIntegration';

/** Upper bound for the reported reason, so a hostile error message cannot become a 10 MB badge. */
export const PRESENT_LINK_FAILURE_MAX_REASON = 240;

export interface PresentLiveLinkRefreshFailure {
  /** Document that owns the live object. */
  slideId: string;
  objectId: string;
  /** Source document the object points at. */
  sourceDocumentId: string;
  /** The port's own message, truncated. Never invented here. */
  reason: string;
  /** Version of the source at the moment of the failed attempt, or `null` when it is not present. */
  sourceVersion: number | null;
}

export interface PresentLiveLinkRefreshResult {
  slides: PresentSlide[];
  /** `true` when at least one slide was rewritten; the caller must commit exactly then. */
  changed: boolean;
  failures: PresentLiveLinkRefreshFailure[];
}

const reason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const trimmed = message.trim() || 'the source could not be read';
  return trimmed.slice(0, PRESENT_LINK_FAILURE_MAX_REASON);
};

/**
 * Refreshes every `Live` workspace object of every slide from `sourceDocuments`.
 *
 * * An object whose source is not open is left alone (that is the `offline` state the badge already
 *   reports) and is **not** a failure — "source closed" is a normal state, not an error.
 * * An object whose source *is* open but whose snapshot cannot be produced is reported in
 *   `failures` and left untouched.
 * * `changed` is derived from real rewrites, so a failed refresh never creates an empty undo entry.
 */
export function refreshPresentLiveLinks(
  slides: readonly PresentSlide[],
  sourceDocuments: readonly WorkspaceDocument[],
): PresentLiveLinkRefreshResult {
  const byId = new Map(sourceDocuments.map((document) => [document.id, document]));
  const failures: PresentLiveLinkRefreshFailure[] = [];
  let changed = false;

  const nextSlides = slides.map((slide) => {
    // Round 16 (malformed document): a hostile payload can carry a non-array `sceneObjects`; the
    // refresh effect runs at every canvas mount, so it must never call `.map` on anything else.
    // Round 24: null/primitive entries are filtered for this read-only refresh.
    const objects: readonly PresentSceneObject[] = Array.isArray(slide.sceneObjects)
      ? slide.sceneObjects.filter(isPlainPresentRecord) as unknown as PresentSceneObject[]
      : [];
    if (!objects.length) return slide;
    let slideChanged = false;
    const nextObjects = objects.map((object) => {
      if (object.kind !== 'workspace' || object.mode !== 'Live') return object;
      const source = byId.get(object.sourceDocumentId);
      if (!source) return object;
      try {
        const refreshed = refreshPresentWorkspaceObject(object, source);
        if (refreshed !== object) slideChanged = true;
        return refreshed as typeof object;
      } catch (error) {
        failures.push({
          slideId: slide.id,
          objectId: object.id,
          sourceDocumentId: object.sourceDocumentId,
          reason: reason(error),
          sourceVersion: Number.isFinite(source.version) ? source.version : null,
        });
        // Fail-closed: the stored object keeps its own (older) `sourceVersion`, so
        // `resolvePresentLinkStatus` reports `live-stale`, and the badge never claims "up to date".
        return object;
      }
    });
    if (!slideChanged) return slide;
    changed = true;
    return { ...slide, sceneObjects: nextObjects };
  });

  return { slides: changed ? nextSlides : (slides as PresentSlide[]), changed, failures };
}

/**
 * One visible, non-colour-only sentence for the failures. `null` when nothing failed, so the caller
 * renders nothing rather than an empty status region.
 */
export function describePresentLiveLinkFailures(failures: readonly PresentLiveLinkRefreshFailure[]): string | null {
  if (!failures.length) return null;
  const sources = [...new Set(failures.map((failure) => failure.sourceDocumentId))];
  const first = failures[0];
  return failures.length === 1
    ? `Live link: the source "${first.sourceDocumentId}" could not be read (${first.reason}). The slide keeps its stored snapshot and is marked as not current.`
    : `Live links: ${failures.length} object(s) from ${sources.length} source(s) could not be read (${first.reason}). The slides keep their stored snapshots and are marked as not current.`;
}
