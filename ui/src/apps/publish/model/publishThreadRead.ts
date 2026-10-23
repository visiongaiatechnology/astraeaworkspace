// STATUS: PLATIN — Astraea Publish: „Ist dieser Rahmen Teil einer Story, und an welcher Stelle?"
//
// Eigene Datei aus zwei Gruenden, beide gemessen:
//   1. `threadChain` liegt in `publishThreadOps` und **wirft**, wenn der Rahmen kein Textrahmen ist. Der
//      Inspektor fragt aber fuer jeden ausgewaehlten Rahmen, auch fuer einen Bildrahmen. Ein Werfen im
//      Renderpfad waere ein Absturz der Flaeche.
//   2. Die Aussage „Rahmen 2 von 3" braucht dieselbe Kettenregel wie die Verkettung selbst. Eine zweite
//      Regel hier waere ein zweiter Textfluss-Begriff.
import type { PublishDocumentModel } from '../../../shared/contracts/publish/workspacePublish';
import { threadChain } from './publishThreadOps';

export interface PublishThreadPosition {
  linked: boolean;
  position: number;
  length: number;
  frameIds: string[];
}

/** Fuer Nicht-Textrahmen und Einzelrahmen antwortet diese Funktion, statt zu werfen. */
export function threadPosition(model: PublishDocumentModel, frameId: string): PublishThreadPosition {
  const frame = model.frames.find(candidate => candidate.id === frameId);
  if (!frame || frame.type !== 'text') return { linked: false, position: 0, length: 0, frameIds: [] };
  const chain = threadChain(model, frameId);
  if (chain.length <= 1) return { linked: false, position: 1, length: 1, frameIds: chain.map(entry => entry.id) };
  return { linked: true, position: chain.findIndex(entry => entry.id === frameId) + 1, length: chain.length, frameIds: chain.map(entry => entry.id) };
}

export function frameUsesThread(model: PublishDocumentModel, frameId: string): boolean {
  return threadPosition(model, frameId).linked;
}
