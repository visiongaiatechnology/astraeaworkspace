// STATUS: PLATIN — Astraea Publish: Master-Rahmen (AST-1371)
//
// ## Der Befund, gemessen vor dieser Datei
//
// `PublishMasterPage.frameIds` existierte, `effectiveMasterFrameIds` existierte — aber **nichts** legte je einen
// Master-Rahmen an (`frameIds` war immer `[]`), und **nichts** zeichnete einen. Der Akzeptanzsatz lautet
// „Wiederkehrende Kopfzeilen und Seitennummern über Master steuern": steuern konnte man nur **Text**, keine
// Rahmen. *Eine Fähigkeit ohne Aufrufer ist nicht geliefert — und ein Feld, das niemand füllt, ist keine
// Fähigkeit.*
//
// ## Die eine Regel: „Master-Rahmen" ist eine **Zugehoerigkeit**, keine zweite Rahmenart
//
// Der Vertrag lässt keine Rahmen ohne Seite zu: `assertPublishDocument` verlangt `pageId` **und** Eigentum
// (`frame-unowned`, gemessen in `publishDocumentEngine.ts:167`). Ein Master-Rahmen wird deshalb auf einer
// **wirklichen** Seite gehostet — der **ersten** Seite des Dokuments — und ist **zugleich** in
// `masterPage.frameIds` eingetragen.
//
// Daraus folgt **genau eine** Unterscheidung, und sie steht **hier**, einmal:
//
//   * **Master-Rahmen** = ein Rahmen, dessen ID in **irgendeiner** `masterPage.frameIds` steht.
//   * **Seitenrahmen** = jeder andere Rahmen der Seite.
//
// `splitPageLayers` ist die **einzige** Stelle, die so aufteilt; Canvas und SVG-Export lesen sie. *Ohne diese
// eine Regel würde ein Master-Rahmen auf seiner Host-Seite **zweimal** erscheinen — einmal als Seitenrahmen,
// einmal als Master — und das ist der Fehler, den eine zweite Aufteilung nach sich zieht.*
//
// ## Warum die Host-Seite die erste ist
//
// `masterOverrides` gilt **je Seite**, `masterPageId` verweist auf den Master. Der Host ist damit reine
// Ablage: *welche Seite den Rahmen **besitzt**, sagt nichts darüber, auf welchen Seiten er **erscheint*** —
// das sagt der Master. Die erste Seite ist die stabile Wahl; sie ist als Zahl benannt und nicht geraten.
//
// ## Fail-closed mit benanntem Grund
//
// Unbekannter Master ✓, unbekannter Rahmen ✓, ein Rahmen, der schon Master-Rahmen ist ✓, eine Seite, die den
// Master nicht nutzt ✓, eine Uebersteuerung fuer einen Rahmen, der nicht zum Master gehoert ✓ → benannt.
import type { PublishDocumentModel, PublishFrame, PublishRectMm } from '../../../shared/contracts/publish/workspacePublish';
import {
  PublishModelError, assertPublishDocument, createPublishFrame, deepClonePublish,
  effectiveMasterFrameIds, rectToFrameRect, syncPublishCompatibility,
} from './publishDocumentEngine';

/**
 * Die Seite, die Master-Rahmen **besitzt** — als Zahl benannt, nicht geraten.
 *
 * Sie ist reine Ablage (siehe Modulkopf): welche Seite den Rahmen besitzt, sagt nichts darüber, auf welchen
 * Seiten er erscheint.
 */
export const PUBLISH_MASTER_FRAME_HOST_INDEX = 0;

/** Ist dieser Rahmen ein **Master-Rahmen**? — die eine Regel, an einer Stelle. */
export function isPublishMasterFrame(model: PublishDocumentModel, frameId: string): boolean {
  return model.masterPages.some((master) => master.frameIds.includes(frameId));
}

/**
 * **Die eine Aufteilung** einer Seite in Master- und Seitenebene.
 *
 * Der Akzeptanzsatz „wiederkehrende Kopfzeilen" ist genau das: der Master-Rahmen erscheint auf **jeder** Seite,
 * die diesen Master nutzt (`effectiveMasterFrameIds` wendet `masterOverrides` an), und auf seiner Host-Seite
 * **nicht** zusätzlich als Seitenrahmen.
 */
export interface PublishPageLayers {
  readonly masterFrames: readonly PublishFrame[];
  readonly pageFrames: readonly PublishFrame[];
}

export function splitPageLayers(model: PublishDocumentModel, pageId: string): PublishPageLayers {
  const onPage = model.frames.filter((frame) => frame.pageId === pageId && !frame.hidden);
  const masterIds = new Set(effectiveMasterFrameIds(model, pageId));
  return {
    /**
     * **Master-Rahmen kommen aus dem Master, nicht aus den Rahmen dieser Seite.**
     *
     * Gemessen (eigener Fehler, Runde Publish-16, von einem Test gefunden): die erste Fassung suchte sie unter
     * `model.frames.filter(f => f.pageId === pageId)`. Ein Master-Rahmen wird aber auf **einer** Host-Seite
     * gehostet — auf allen anderen Seiten war er damit unsichtbar, obwohl `effectiveMasterFrameIds` ihn dort
     * korrekt meldete. *Der Master besitzt den Rahmen; die Host-Seite ist nur seine Ablage.*
     */
    masterFrames: [...masterIds].map((id) => model.frames.find((frame) => frame.id === id)).filter((frame): frame is PublishFrame => frame !== undefined && !frame.hidden),
    // Seitenrahmen sind die Rahmen **dieser** Seite, die keinem Master gehoeren — so erscheint ein Master-Rahmen
    // auf seiner Host-Seite nicht zusätzlich.
    pageFrames: onPage.filter((frame) => !masterIds.has(frame.id) && !isPublishMasterFrame(model, frame.id)),
  };
}

/** Alle Master-Rahmen **eines Masters** — fuer Anzeige und Zaehlung. */
export function masterFramesOf(model: PublishDocumentModel, masterId: string): PublishFrame[] {
  const master = model.masterPages.find((candidate) => candidate.id === masterId);
  if (!master) throw new PublishModelError('master-missing');
  return model.frames.filter((frame) => master.frameIds.includes(frame.id));
}

export interface PublishMasterFrameSpec {
  type: PublishFrame['type'];
  name?: string;
  content?: string;
  semanticRole?: PublishFrame['semanticRole'];
  widthMm?: number;
  heightMm?: number;
  xMm?: number;
  yMm?: number;
  fontSizePt?: number;
}

/**
 * **Einen Master-Rahmen anlegen** — der eine Einstieg.
 *
 * Er landet auf der Host-Seite (`PUBLISH_MASTER_FRAME_HOST_INDEX`), wird über den **vorhandenen** Erzeuger
 * gebaut (`createPublishFrame`), in `page.frameIds` **und** in `masterPage.frameIds` eingetragen — *beide
 * Eigentumslisten, weil der Vertrag beides verlangt.*
 */
export function addPublishMasterFrame(model: PublishDocumentModel, masterId: string, spec: PublishMasterFrameSpec): { model: PublishDocumentModel; frameId: string } {
  const master = model.masterPages.find((candidate) => candidate.id === masterId);
  if (!master) throw new PublishModelError('master-missing');
  const host = model.pages[PUBLISH_MASTER_FRAME_HOST_INDEX];
  if (!host) throw new PublishModelError('master-host-page-missing');
  const geometry = host.geometry;
  // Die Vorgabe liegt im Kopfbereich: *ein Master-Rahmen, der irgendwo landet, ist kein Kopf.*
  const rect: PublishRectMm = {
    x: spec.xMm ?? geometry.marginsMm.left,
    y: spec.yMm ?? Math.max(0, geometry.marginsMm.top / 2),
    width: spec.widthMm ?? Math.max(10, geometry.widthMm - geometry.marginsMm.left - geometry.marginsMm.right),
    height: spec.heightMm ?? 8,
  };
  const frame = createPublishFrame(spec.type, host.id, PUBLISH_MASTER_FRAME_HOST_INDEX, {
    ...rectToFrameRect(rect),
    name: spec.name ?? `${master.name} · ${spec.type}`,
    content: spec.content ?? '',
    semanticRole: spec.semanticRole ?? 'Artifact',
    ...(spec.fontSizePt === undefined ? {} : { fontSizePt: spec.fontSizePt }),
  });
  if (model.frames.some((candidate) => candidate.id === frame.id)) throw new PublishModelError('frame-id-collision');
  const pages = model.pages.map((page, index) => index === PUBLISH_MASTER_FRAME_HOST_INDEX ? { ...page, frameIds: [...page.frameIds, frame.id] } : page);
  const masterPages = model.masterPages.map((candidate) => candidate.id === masterId ? { ...candidate, frameIds: [...candidate.frameIds, frame.id] } : candidate);
  const next = syncPublishCompatibility({ ...model, pages, masterPages, frames: [...model.frames, frame], selectedFrameId: frame.id, revision: model.revision + 1 });
  assertPublishDocument(next);
  return { model: next, frameId: frame.id };
}

/** **Einen Master-Rahmen entfernen** — aus beiden Eigentumslisten. */
export function removePublishMasterFrame(model: PublishDocumentModel, frameId: string): PublishDocumentModel {
  const master = model.masterPages.find((candidate) => candidate.frameIds.includes(frameId));
  if (!master) throw new PublishModelError('master-frame-missing');
  const pages = model.pages.map((page) => page.frameIds.includes(frameId) ? { ...page, frameIds: page.frameIds.filter((id) => id !== frameId) } : page);
  const masterPages = model.masterPages.map((candidate) => candidate.id === master.id ? { ...candidate, frameIds: candidate.frameIds.filter((id) => id !== frameId) } : candidate);
  const frames = model.frames.filter((candidate) => candidate.id !== frameId);
  const next = syncPublishCompatibility({ ...model, pages, masterPages, frames, selectedFrameId: null, revision: model.revision + 1 });
  assertPublishDocument(next);
  return next;
}

/**
 * **Eine Seite uebersteuert einen Master-Rahmen** — „auf dieser Seite nicht".
 *
 * `masterOverrides` ist der vorhandene Vertrag dafür; `effectiveMasterFrameIds` liest ihn bereits. *Ein zweites
 * Feld für „Master hier ausblenden" wäre eine zweite Wahrheit.*
 */
export function setPublishMasterFrameOverride(model: PublishDocumentModel, pageId: string, frameId: string, overridden: boolean): PublishDocumentModel {
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new PublishModelError('page-missing');
  if (!page.masterPageId) throw new PublishModelError('page-without-master');
  if (!isPublishMasterFrame(model, frameId)) throw new PublishModelError('master-frame-missing');
  // Nur ein Rahmen **dieses** Masters darf uebersteuert werden — sonst waere die Uebersteuerung wirkungslos.
  const chainIds = new Set(model.masterPages.filter((candidate) => candidate.frameIds.includes(frameId)).map((candidate) => candidate.id));
  if (!chainIds.has(page.masterPageId)) throw new PublishModelError('master-frame-not-on-page-master');
  const masterOverrides = { ...page.masterOverrides };
  if (overridden) masterOverrides[frameId] = true; else delete masterOverrides[frameId];
  const pages = model.pages.map((candidate) => candidate.id === pageId ? { ...candidate, masterOverrides } : candidate);
  const next = syncPublishCompatibility({ ...model, pages, revision: model.revision + 1 });
  assertPublishDocument(next);
  return next;
}

/** Die sichtbare Aussage eines Masters — Wörter, damit die Zahl nicht allein steht. */
export function describePublishMaster(model: PublishDocumentModel, masterId: string): string {
  const master = model.masterPages.find((candidate) => candidate.id === masterId);
  if (!master) throw new PublishModelError('master-missing');
  const pages = model.pages.filter((page) => page.masterPageId === masterId);
  const parts = [
    `${master.name}`,
    `${master.frameIds.length} master frame(s)`,
    `on ${pages.length} page(s)`,
  ];
  if (master.headerText) parts.push(`header "${master.headerText}"`);
  if (master.footerText) parts.push(`footer "${master.footerText}"`);
  if (master.showPageNumbers) parts.push('page numbers shown');
  return parts.join(' · ');
}

/** Eine **tiefe Kopie** eines Master-Rahmens — fuer „Master-Rahmen auf eine Seite holen". */
export function copyMasterFrameToPage(model: PublishDocumentModel, frameId: string, pageId: string): PublishFrame {
  const frame = model.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new PublishModelError('page-missing');
  const pageIndex = model.pages.findIndex((candidate) => candidate.id === pageId);
  const copy = { ...deepClonePublish(frame), id: `${frame.id}-on-${pageId}`, pageId, pageIndex };
  if (model.frames.some((candidate) => candidate.id === copy.id)) throw new PublishModelError('frame-id-collision');
  return copy;
}
