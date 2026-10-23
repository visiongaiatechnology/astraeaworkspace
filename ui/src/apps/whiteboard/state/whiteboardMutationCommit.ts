// STATUS: PLATIN
// Runs UI follow-up effects only after the canonical Whiteboard mutation is accepted.

import type { WhiteboardItem } from '../types';

export type WhiteboardItemsUpdate = WhiteboardItem[] | ((previous: WhiteboardItem[]) => WhiteboardItem[]);
export type WhiteboardItemsUpdater = (update: WhiteboardItemsUpdate) => boolean;

export function commitWhiteboardItemMutation(
  updateItems: WhiteboardItemsUpdater,
  update: WhiteboardItemsUpdate,
  afterAccepted: () => void,
): boolean {
  if (!updateItems(update)) return false;
  afterAccepted();
  return true;
}
