// STATUS: DIAMANT VGT SUPREME
// Validated history restoration boundary for Whiteboard canonical state.

import type {
  WhiteboardCollaborationState,
  WhiteboardCustomTemplate,
  WhiteboardFacilitationState,
  WhiteboardViewConfig,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { detectChangedWhiteboardItemIds, normalizeWhiteboardCollaborationState } from '../model/whiteboardCollaborationEngine';
import { applyWhiteboardHistoryEntry, type WhiteboardHistoryEntry } from './whiteboardDocumentHistory';
import { normalizeWhiteboardDiagramItem } from '../model/whiteboardDiagramEngine';
import { normalizeWhiteboardManipulationMetadata } from '../model/whiteboardManipulationEngine';
import { normalizeWhiteboardRichObject } from '../model/whiteboardObjectEngine';
import { normalizeCustomWhiteboardTemplates } from '../model/whiteboardTemplateEngine';
import { normalizeWhiteboardFacilitationState } from '../model/whiteboardFacilitationEngine';
import { validateAndNormalizeWhiteboardItems } from '../viewport/whiteboardViewportEngine';

export function prepareWhiteboardHistoryRestore(options: {
  currentDocument: WorkspaceDocument;
  currentItems: WhiteboardItem[];
  currentView: WhiteboardViewConfig;
  currentTemplates: WhiteboardCustomTemplate[];
  currentFacilitation: WhiteboardFacilitationState;
  collaboration: WhiteboardCollaborationState;
  entry: WhiteboardHistoryEntry;
  direction: 'undo' | 'redo';
}): { ok: true; items: WhiteboardItem[]; changedIds: string[]; view: WhiteboardViewConfig; templates: WhiteboardCustomTemplate[]; facilitation: WhiteboardFacilitationState; collaboration: WhiteboardCollaborationState; document: WorkspaceDocument } | { ok: false; reason: string } {
  if (options.entry.documentId !== options.currentDocument.id) {
    return { ok: false, reason: 'History entry does not belong to the current document.' };
  }

  const restored = applyWhiteboardHistoryEntry({ items: options.currentItems, view: options.currentView, templates: options.currentTemplates, facilitation: options.currentFacilitation, collaboration: options.collaboration }, options.entry, options.direction);
  const candidate = restored.items.map(normalizeWhiteboardRichObject).map(normalizeWhiteboardManipulationMetadata).map(normalizeWhiteboardDiagramItem);
  const validated = validateAndNormalizeWhiteboardItems(candidate);
  if (!validated.ok) return { ok: false, reason: validated.reason };
  const view = restored.view ?? options.currentView;
  const templates = normalizeCustomWhiteboardTemplates(restored.templates ?? options.currentTemplates);
  const facilitation = normalizeWhiteboardFacilitationState(restored.facilitation ?? options.currentFacilitation);
  const collaboration = normalizeWhiteboardCollaborationState(restored.collaboration ?? options.collaboration);
  const current = options.currentDocument;
  return {
    ok: true,
    items: validated.items,
    changedIds: detectChangedWhiteboardItemIds(options.currentItems, validated.items),
    view,
    templates,
    facilitation,
    collaboration,
    document: {
      ...current,
      modified_at: Date.now(),
      version: Math.max(1, current.version || 1) + 1,
      whiteboardData: { ...current.whiteboardData, items: validated.items.map((item) => ({ ...item })), view, templates, facilitation, collaboration },
    },
  };
}
