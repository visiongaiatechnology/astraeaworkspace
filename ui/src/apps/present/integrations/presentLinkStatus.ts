// STATUS: PLATIN — one definition of "is this slide's live link current, stale or offline".
//
// Paket 15 "Grid Live Chart Verknüpfung": "Ändert sich Quelle, meldet Folie **Aktualisierung oder
// Offline-Zustand**".
//
// `refreshPresentWorkspaceObject` already rewrote a live object when its source document changed,
// but nothing stated what the *user* sees when the source is missing (offline), when the source
// went backwards (stale) or when the object is frozen on purpose. The canvas silently kept the old
// numbers, which is the one thing the acceptance scenario forbids. This module is the single
// definition of that state, so the badge, the aria label and any future export agree.

import type { PresentWorkspaceSceneObject } from '../../../shared/contracts/workspace';

export type PresentLinkState = 'live-current' | 'live-updated' | 'live-stale' | 'offline' | 'frozen';

export interface PresentLinkStatus {
  state: PresentLinkState;
  /** Visible/announced text. Never colour-only. */
  label: string;
  /** True when the slide should tell the user that the numbers on screen are not the source's. */
  attention: boolean;
  /** Version delta the last refresh produced; `0` when nothing changed. */
  versionDelta: number;
}

export interface PresentLinkStatusInput {
  object: Pick<PresentWorkspaceSceneObject, 'mode' | 'sourceVersion' | 'title'>;
  /** Version of the source document the object points at, or `null` when it is not open/available. */
  sourceVersion: number | null;
  /** True when the canvas already refreshed this object in this session. */
  refreshed?: boolean;
}

const STATE_LABELS: Record<PresentLinkState, string> = {
  'live-current': 'Live · up to date',
  'live-updated': 'Live · updated from source',
  'live-stale': 'Live · source is older than the snapshot',
  offline: 'Offline · source not available',
  frozen: 'Frozen snapshot',
};

/**
 * Resolves the link state. A frozen object is always `frozen` (the user chose it), a missing source
 * is always `offline` (fail-closed, never "looks fine"), and a live object whose source version is
 * behind the stored `sourceVersion` is `stale` rather than pretending to be current.
 */
export function resolvePresentLinkStatus(input: PresentLinkStatusInput): PresentLinkStatus {
  const stored = Number.isFinite(input.object.sourceVersion) ? Number(input.object.sourceVersion) : 0;
  if (input.object.mode !== 'Live') {
    return { state: 'frozen', label: STATE_LABELS.frozen, attention: false, versionDelta: 0 };
  }
  if (input.sourceVersion === null || !Number.isFinite(input.sourceVersion)) {
    return { state: 'offline', label: STATE_LABELS.offline, attention: true, versionDelta: 0 };
  }
  const delta = Math.round(input.sourceVersion) - stored;
  if (delta < 0) {
    return { state: 'live-stale', label: STATE_LABELS['live-stale'], attention: true, versionDelta: delta };
  }
  if (input.refreshed && delta > 0) {
    return { state: 'live-updated', label: STATE_LABELS['live-updated'], attention: false, versionDelta: delta };
  }
  return { state: 'live-current', label: STATE_LABELS['live-current'], attention: false, versionDelta: Math.max(0, delta) };
}

/** Status of every live-linked object on one slide, plus the count the canvas badge should show. */
export function summarizePresentSlideLinks(
  objects: readonly Pick<PresentWorkspaceSceneObject, 'id' | 'mode' | 'sourceVersion' | 'title' | 'sourceDocumentId'>[],
  versionsByDocumentId: ReadonlyMap<string, number>,
  refreshedIds: ReadonlySet<string> = new Set(),
): { statuses: Array<PresentLinkStatus & { id: string }>; attentionCount: number; liveCount: number } {
  const statuses = objects
    .filter((object) => object.mode === 'Live' || object.mode === 'Frozen')
    .map((object) => ({
      ...resolvePresentLinkStatus({
        object,
        sourceVersion: versionsByDocumentId.has(object.sourceDocumentId)
          ? (versionsByDocumentId.get(object.sourceDocumentId) as number)
          : null,
        refreshed: refreshedIds.has(object.id),
      }),
      id: object.id,
    }));
  return {
    statuses,
    attentionCount: statuses.filter((status) => status.attention).length,
    liveCount: statuses.filter((status) => status.state !== 'frozen').length,
  };
}
