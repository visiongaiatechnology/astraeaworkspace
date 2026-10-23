// STATUS: PLATIN — Der gueltige Drehwert einer Seite. Eigene Datei, weil zwei Module ihn brauchen.
import type { PublishPage } from '../../../shared/contracts/publish/workspacePublish';

/** Dieselbe Menge, die `setPublishPageRotation` akzeptiert: `assertPublishDocument` prueft die Grenzen. */
export type PublishPageRotation = PublishPage['rotationDeg'];
export const PUBLISH_PAGE_ROTATIONS: readonly PublishPageRotation[] = [0, 90, 180, 270];
