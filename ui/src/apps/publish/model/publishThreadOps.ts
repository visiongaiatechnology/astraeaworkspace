// STATUS: PLATIN — Astraea Publish: Story-Textfluss ueber mehrere Rahmen und Seiten
//
// Befund vor dieser Datei (gemessen, Runde Publish-3): `threadTextFrames` und `reflowTextThread` gab es,
// sie waren aber **von keiner Komponente aus erreichbar**. Kein Knopf verknuepfte zwei Rahmen, kein Knopf
// loeste Ueberlauf auf, und die Ueberlaufanzeige des Inspektors benutzte `detectOversetFrames`, waehrend
// der Canvas den Text einfach abschnitt — der Nutzer erfuhr nie, dass Text fehlte.
//
// Diese Datei besitzt die Verkettung: Kette finden, anhaengen, trennen, Ueberlauf aufloesen. Die Regeln
// fuer Kapazitaet (`estimateTextCapacity`) und Umfluss (`reflowTextThread`) bleiben im Dokumentmodell —
// hier stehen nur die Operationen, die daraus eine bedienbare Story machen.
import type {
  PublishDocumentModel, PublishFrame, PublishPage, PublishRectMm, PublishTextFrameOptions,
} from '../../../shared/contracts/publish/workspacePublish';
import {
  PUBLISH_LIMITS, PublishModelError, addPublishPage, assertPublishDocument,
  createDefaultTextOptions, createDefaultPublishTypography, createPublishFrame, deepClonePublish,
  estimateTextCapacity, publishStableId, rectToFrameRect, reflowAllTextThreads,
  syncPublishCompatibility,
} from './publishDocumentEngine';

/** Ein neuer Rahmen einer Story wird so breit wie der Rahmen, an den er angehaengt wird. */
export const PUBLISH_THREAD_FRAME_DEFAULT_HEIGHT_MM = 60;
/**
 * Abstand zwischen Ankerrahmen und Fortsetzung auf derselben Seite.
 *
 * Exportiert, weil ein Test denselben Wert braucht: eine zweite Zahl im Test waere eine zweite Wahrheit
 * darueber, wo die Fortsetzung liegt.
 */
export const PUBLISH_THREAD_ANCHOR_GAP_MM = 4;

/** Alle Textrahmen einer Story, in Leserichtung. Beginnt immer beim ersten Rahmen der Kette. */
export function threadChain(model: PublishDocumentModel, frameId: string): PublishFrame[] {
  const byId = new Map(model.frames.map(frame => [frame.id, frame] as const));
  let start = byId.get(frameId);
  if (!start || start.type !== 'text') throw new PublishModelError('text-thread-start-invalid');
  const seenBack = new Set<string>();
  while (start.text?.previousFrameId) {
    if (seenBack.has(start.id)) throw new PublishModelError('text-thread-cycle');
    seenBack.add(start.id);
    const previous = byId.get(start.text.previousFrameId);
    if (!previous) break;
    start = previous;
  }
  const chain: PublishFrame[] = [];
  const seen = new Set<string>();
  let current: PublishFrame | undefined = start;
  while (current) {
    if (seen.has(current.id)) throw new PublishModelError('text-thread-cycle');
    seen.add(current.id);
    if (chain.length >= PUBLISH_LIMITS.maxThreadLength) throw new PublishModelError('text-thread-limit');
    chain.push(current);
    const nextId: string | undefined = current.text?.nextFrameId;
    current = nextId ? byId.get(nextId) : undefined;
  }
  return chain;
}

/**
 * Der Text ab einem Rahmen bis zum Ende der Story.
 *
 * Wichtig fuer „Overset-Text anzeigen": der Nutzer muss sehen, **was** nicht passt, nicht nur dass etwas
 * nicht passt. Deshalb wird der Resttext zurueckgegeben und nicht nur eine Zahl.
 */
export function threadRemainingText(model: PublishDocumentModel, frameId: string, maxChars = 20_000): string {
  const chain = threadChain(model, frameId);
  const index = chain.findIndex(frame => frame.id === frameId);
  return chain.slice(index).map(frame => frame.content).join('').slice(0, maxChars);
}

/** Der Text, der in der letzten Rahmenkette **nicht mehr** hineinpasst. */
function overflowTail(chain: readonly PublishFrame[]): string {
  const totalCapacity = chain.reduce((sum, frame) => sum + estimateTextCapacity(frame), 0);
  const full = chain.map(frame => frame.content).join('');
  return full.length > totalCapacity ? full.slice(totalCapacity) : '';
}

export interface PublishThreadOverflowReport {
  chain: PublishFrame[];
  oversetFrameIds: string[];
  remainingChars: number;
  remainingText: string;
  summary: string;
}

export function inspectThreadOverflow(model: PublishDocumentModel, frameId: string, maxChars = 20_000): PublishThreadOverflowReport {
  const chain = threadChain(model, frameId);
  const oversetFrameIds = chain.filter(frame => frame.text?.overset || frame.content.length > estimateTextCapacity(frame)).map(frame => frame.id);
  // Der Resttext wird gegen die **Summe** der Rahmenkapazitaeten gemessen, nicht gegen den letzten Rahmen
  // allein: sonst meldete eine Story mit Ueberlauf im ersten Rahmen "0 Zeichen zu viel".
  const tail = overflowTail(chain);
  return {
    chain,
    oversetFrameIds,
    remainingChars: tail.length,
    remainingText: tail.slice(0, maxChars),
    summary: oversetFrameIds.length === 0
      ? `Story of ${chain.length} frame(s) fits without overflow.`
      : `Story overflows in ${oversetFrameIds.length} of ${chain.length} frame(s); ${tail.length} character(s) do not fit.`,
  };
}

/**
 * Verkettet zwei Rahmen und **fliesst sofort um**.
 *
 * Vorher rief `threadTextFrames` allein `assertPublishDocument`; der Inhalt blieb, wo er war. Ein Nutzer,
 * der zwei Rahmen verband, sah keine Aenderung. Diese Funktion ist die einzige, die Verkettung *und*
 * Umfluss zusammen ausfuehrt, damit beide nie auseinanderlaufen.
 */
export function linkPublishFrames(model: PublishDocumentModel, fromId: string, toId: string): PublishDocumentModel {
  if (!model.frames.some(frame => frame.id === fromId) || !model.frames.some(frame => frame.id === toId)) throw new PublishModelError('text-thread-target-invalid');
  const fromChain = threadChain(model, fromId);
  if (fromChain.some(frame => frame.id === toId)) throw new PublishModelError('text-thread-cycle');
  const toChain = threadChain(model, toId);
  // Zwei nicht-leere Ketten zu verbinden hiesse, zwei Stories zu verschmelzen: zwei Anfaenge, ein Ende.
  if (toChain.length > 1) throw new PublishModelError('text-thread-target-has-continuation');
  if (fromChain[fromChain.length - 1].id !== fromId) throw new PublishModelError('text-thread-source-not-last');
  const frames: PublishFrame[] = model.frames.map(frame => {
    if (frame.id === fromId) return { ...frame, text: { ...(frame.text ?? createDefaultTextOptions()), nextFrameId: toId } };
    if (frame.id === toId) {
      const text: PublishTextFrameOptions = { ...(frame.text ?? createDefaultTextOptions()), previousFrameId: fromId };
      delete text.threadId;
      return { ...frame, text };
    }
    return frame;
  });
  return refreshThreads({ ...model, frames, revision: model.revision + 1 });
}

function refreshThreads(model: PublishDocumentModel): PublishDocumentModel {
  assertPublishDocument(model);
  const synced = syncPublishCompatibility(reflowAllTextThreads(model));
  assertPublishDocument(synced);
  return synced;
}

/**
 * Trennt die Verbindung **nach** dem angegebenen Rahmen.
 *
 * Der abgetrennte Teil behaelt seinen Text — nichts wird stillschweigend verworfen. Beide Teile werden
 * getrennt umflossen, weil sie ab jetzt zwei Stories sind.
 */
export function unlinkPublishFrameAfter(model: PublishDocumentModel, frameId: string): PublishDocumentModel {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame) throw new PublishModelError('frame-missing');
  const nextId = frame.text?.nextFrameId;
  if (!nextId) throw new PublishModelError('text-thread-not-linked');
  if (!model.frames.some(candidate => candidate.id === nextId)) throw new PublishModelError('text-thread-target-invalid');
  const frames: PublishFrame[] = model.frames.map(candidate => {
    if (candidate.id === frameId) { const text = { ...(candidate.text ?? createDefaultTextOptions()) }; delete text.nextFrameId; return { ...candidate, text }; }
    if (candidate.id === nextId) { const text = { ...(candidate.text ?? createDefaultTextOptions()) }; delete text.previousFrameId; return { ...candidate, text }; }
    return candidate;
  });
  return refreshThreads({ ...model, frames, revision: model.revision + 1 });
}

/**
 * Fuegt **nach** dem angegebenen Rahmen eine Fortsetzung ein und haengt sie in die Kette.
 *
 * Gemessen (eigener Fehler, Runde Publish-11): die erste Fassung verlangte, dass der Anker das **Ende** der
 * Story ist, und haengte nur dort an. Der Ueberlauf sitzt aber oft in einem **mittleren** Rahmen — dann war
 * "Ueberlauf aufloesen" wirkungslos. Diese Funktion schneidet den neuen Rahmen zwischen Anker und dessen
 * bisherigen Nachfolger ein.
 */
export function appendThreadFrame(model: PublishDocumentModel, frameId: string): PublishDocumentModel {
  const anchor = model.frames.find(candidate => candidate.id === frameId);
  if (!anchor) throw new PublishModelError('frame-missing');
  if (anchor.type !== 'text') throw new PublishModelError('text-thread-target-invalid');
  const successorId = anchor.text?.nextFrameId;
  const anchorPage = model.pages.find(page => page.id === anchor.pageId);
  if (!anchorPage) throw new PublishModelError('page-missing');
  const pageIndex = model.pages.findIndex(page => page.id === anchorPage.id);
  const geometry = anchorPage.geometry;
  let base = model;
  let targetPage: PublishPage = anchorPage;
  const fitsOnPage = anchor.yMm + anchor.heightMm + PUBLISH_THREAD_FRAME_DEFAULT_HEIGHT_MM <= geometry.heightMm - geometry.marginsMm.bottom;
  if (!fitsOnPage) {
    base = addPublishPage(model, geometry, pageIndex);
    targetPage = base.pages[pageIndex + 1] ?? base.pages[base.pages.length - 1];
  }
  const pageIndexInBase = base.pages.findIndex(page => page.id === targetPage.id);
  const desiredY = fitsOnPage ? anchor.yMm + anchor.heightMm + PUBLISH_THREAD_ANCHOR_GAP_MM : targetPage.geometry.marginsMm.top;
  const rect = clampRectToPage({ x: anchor.xMm, y: desiredY, width: anchor.widthMm, height: PUBLISH_THREAD_FRAME_DEFAULT_HEIGHT_MM }, targetPage.geometry);
  const newFrame = createPublishFrame('text', targetPage.id, pageIndexInBase, {
    /**
     * Die ID muss **pro Aufruf** eindeutig sein.
     *
     * Gemessen (eigener Fehler, Runde Publish-13, gefunden durch einen Test mit **zwei** Aufrufen in derselben
     * Instanz): `createPublishFrame` leitet die ID aus Name, x und y ab. Zweimal am selben Anker angehaengt
     * ergab nach dem ersten Umfluss dieselbe Position und denselben Namen — und damit dieselbe ID. Der zweite
     * Aufruf warf `frame-id-collision`, ein zweiter Fortsetzungsrahmen war unmoeglich. Revision und
     * Rahmenzahl gehen jetzt in den Seed ein, wie bei `addFrameToPublish`.
     */
    id: publishStableId('frame', `${base.revision}:${targetPage.id}:thread:${base.frames.length}:${anchor.id}`),
    ...rectToFrameRect(rect),
    name: `${anchor.name} (continued)`,
    content: '',
    semanticRole: anchor.semanticRole ?? 'P',
    text: { ...(anchor.text ?? createDefaultTextOptions()), previousFrameId: anchor.id, overset: false, ...(successorId ? { nextFrameId: successorId } : {}) },
    typography: anchor.typography ? deepClonePublish(anchor.typography) : createDefaultPublishTypography(),
    paragraphStyleId: anchor.paragraphStyleId,
    fontFamily: anchor.fontFamily,
    fontSizePt: anchor.fontSizePt,
  });
  if (base.frames.some(candidate => candidate.id === newFrame.id)) throw new PublishModelError('frame-id-collision');
  const pages = base.pages.map(page => page.id === targetPage.id ? { ...page, frameIds: [...page.frameIds, newFrame.id] } : page);
  /**
   * Die Kette wird in **beide** Richtungen geschlossen.
   *
   * Gemessen (eigener Fehler, Runde Publish-11): der neue Rahmen trug nur `previousFrameId`. Der Anker behielt
   * `nextFrameId: undefined`, weil `reflowTextThread` die Kette **vorwaerts** ueber `nextFrameId` laeuft. Die
   * Folge war, dass der Umfluss den neuen Rahmen nicht erreichte und sein Inhalt auf leer gesetzt wurde — ein
   * neuer Rahmen, der nichts aufnahm. Ein Test hat das gefunden, nicht das Auge.
   */
  const frames = [
    ...base.frames.map(candidate => {
      if (candidate.id === anchor.id) return { ...candidate, text: { ...(candidate.text ?? createDefaultTextOptions()), nextFrameId: newFrame.id } };
      if (successorId && candidate.id === successorId) return { ...candidate, text: { ...(candidate.text ?? createDefaultTextOptions()), previousFrameId: newFrame.id } };
      return candidate;
    }),
    newFrame,
  ];
  const withFrame = syncPublishCompatibility({ ...base, pages, frames, selectedFrameId: newFrame.id, revision: base.revision + 1 });
  assertPublishDocument(withFrame);
  /**
   * Der Umfluss laeuft ueber `refreshThreads` (alle Ketten in **einem** Durchgang).
   *
   * Gemessen (eigener Fehler, Runde Publish-11): ein zusaetzlicher Einzelaufruf `reflowTextThread` auf den
   * neuen Rahmen rechnete auf einem bereits umgeflossenen Modell und verteilte den Text ein zweites Mal —
   * `resolvePublishThreadOverflow` kam so nie ueber zwei Rahmen hinaus.
   */
  return refreshThreads(withFrame);
}

/**
 * Loest Ueberlauf auf: haengt so lange Fortsetzungsrahmen an, bis der Text passt.
 *
 * Gemessen (eigener Fehler, Runde Publish-11): die erste Fassung nahm immer den **letzten** Rahmen der Kette.
 * Nach einem Umfluss traegt aber genau **ein** Rahmen den Ueberlaufrest — der letzte kann leer sein. Die
 * Schleife sah dann "passt" und tat nichts.
 *
 * Fail-closed mit benannter Grenze: nach `maxNewFrames` Versuchen wird abgebrochen, damit ein
 * fehlerhafter Kapazitaetswert keine Endlosschleife erzeugt.
 */
export function resolvePublishThreadOverflow(model: PublishDocumentModel, frameId: string, maxNewFrames = 256): PublishDocumentModel {
  if (!Number.isInteger(maxNewFrames) || maxNewFrames < 1 || maxNewFrames > 256) throw new PublishModelError('thread-overflow-limit-invalid');
  let next = model;
  const startId = threadChain(next, frameId)[0].id;
  for (let attempt = 0; attempt < maxNewFrames; attempt += 1) {
    const chain = threadChain(next, startId);
    const overflowing = chain.filter(frame => frame.content.length > estimateTextCapacity(frame));
    if (overflowing.length === 0) return next;
    // Am **ueberlaufenden** Rahmen anhaengen: nur dort entsteht Platz fuer genau den Rest.
    next = appendThreadFrame(next, overflowing[0].id);
  }
  throw new PublishModelError(`thread-overflow-unresolved-after:${maxNewFrames}`);
}

function clampRectToPage(rect: PublishRectMm, geometry: { widthMm: number; heightMm: number; marginsMm: { top: number; right: number; bottom: number; left: number } }): PublishRectMm {
  const width = Math.max(10, Math.min(rect.width, geometry.widthMm - geometry.marginsMm.left - geometry.marginsMm.right));
  const height = Math.max(10, Math.min(rect.height, geometry.heightMm - geometry.marginsMm.top - geometry.marginsMm.bottom));
  return {
    width,
    height,
    x: Math.max(geometry.marginsMm.left, Math.min(rect.x, geometry.widthMm - geometry.marginsMm.right - width)),
    y: Math.max(geometry.marginsMm.top, Math.min(rect.y, geometry.heightMm - geometry.marginsMm.bottom - height)),
  };
}

/** Ein Rahmen mit leerem Text und ohne Verkettung — die Voraussetzung fuer „sofort tippen". */
export function createStandaloneTextFrame(model: PublishDocumentModel, rect: PublishRectMm, name = 'Story frame'): PublishFrame {
  const page = model.pages[model.activePageIndex];
  if (!page) throw new PublishModelError('active-page-missing');
  const clamped = clampRectToPage(rect, page.geometry);
  return createPublishFrame('text', page.id, model.activePageIndex, {
    ...clamped,
    name,
    content: '',
    semanticRole: 'P',
    text: { ...createDefaultTextOptions(), threadId: publishStableId('thread', `${page.id}:${model.frames.length}:${model.revision}`) },
    typography: createDefaultPublishTypography(),
  });
}
