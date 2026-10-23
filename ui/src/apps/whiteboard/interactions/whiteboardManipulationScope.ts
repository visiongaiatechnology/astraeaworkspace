// STATUS: PLATIN
// Keeps transient Whiteboard selection state inside the document that created it.

import type { WhiteboardItem } from '../types';

export interface WhiteboardManipulationSelectionInput {
  documentId: string;
  selectionDocumentId: string;
  selectedItemIds: readonly string[];
  selectedItemId: string | null;
  items: readonly WhiteboardItem[];
}

export function isCurrentWhiteboardManipulationDocument(activeDocumentId: string, callbackDocumentId: string): boolean {
  return activeDocumentId === callbackDocumentId;
}

export function scopeWhiteboardManipulationSelection(input: WhiteboardManipulationSelectionInput): string[] {
  if (input.documentId !== input.selectionDocumentId) return [];
  const visibleIds = new Set(input.items.filter((item) => !item.hidden).map((item) => item.id));
  const requestedIds = input.selectedItemIds.length > 0
    ? input.selectedItemIds
    : input.selectedItemId ? [input.selectedItemId] : [];
  return [...new Set(requestedIds)].filter((id) => visibleIds.has(id)).slice(0, 4096);
}
