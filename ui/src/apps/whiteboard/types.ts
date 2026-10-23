import { WorkspaceDocument, WhiteboardObjectModel, WhiteboardObjectType } from '../../shared/contracts/workspace';

export interface WhiteboardCanvasProps {
  document: WorkspaceDocument;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onCreateDerivedDocument?: (doc: WorkspaceDocument) => void;
  workspaceDocuments?: Record<string, WorkspaceDocument>;
  onOpenWorkspaceDocument?: (documentId: string) => void;
}

export type WhiteboardItemType = WhiteboardObjectType;
export type WhiteboardInteractionTool = WhiteboardItemType | 'select' | 'pan' | 'ink-pen' | 'ink-pencil' | 'ink-highlighter' | 'ink-eraser' | 'ink-lasso';
export type StickyColor = 'yellow' | 'cyan' | 'purple';

export const WHITEBOARD_MAX_ITEMS = 100_000;

/**
 * App-owned typography of a Whiteboard text label.
 *
 * This is an additive, optional field inside the **same** canonical carrier as every other object
 * property (`whiteboardData.items`). It is normalised and bounded by
 * `model/whiteboardTextStyleEngine.ts`, which also owns the single formatter used by the DOM renderer,
 * the SVG export and the raster export. The shared contract has no typography field yet; when one is
 * added, this local declaration is the migration source for cross-app consumers.
 */
export interface WhiteboardTextStyle {
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontFamily: 'sans' | 'serif' | 'mono';
  align: 'left' | 'center' | 'right';
}

export interface WhiteboardItem extends WhiteboardObjectModel {
  textStyle?: WhiteboardTextStyle;
}

export const STICKY_COLORS: Record<StickyColor, { bg: string; border: string; text: string; header: string; label: string }> = {
  yellow: {
    bg: '#fef9c3',
    border: '#fde047',
    text: '#713f12',
    header: '#fef08a',
    label: 'Yellow',
  },
  cyan: {
    bg: '#cffafe',
    border: '#67e8f9',
    text: '#164e63',
    header: '#a5f3fc',
    label: 'Cyan',
  },
  purple: {
    bg: '#f3e8ff',
    border: '#d8b4fe',
    text: '#581c87',
    header: '#e9d5ff',
    label: 'Purple',
  },
};
