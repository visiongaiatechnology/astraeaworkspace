// STATUS: PLATIN
// Document-scoped history and pointer ownership for the Whiteboard ink controller.

import { WHITEBOARD_INK_HISTORY_LIMIT, type WhiteboardInkHistoryEntry } from '../model/whiteboardInkEngine';
import type { WhiteboardInteractionTool } from '../types';

export interface WhiteboardInkSession {
  documentId: string;
  past: WhiteboardInkHistoryEntry[];
  future: WhiteboardInkHistoryEntry[];
  activePointerId: number | null;
  activeTool: WhiteboardInteractionTool | null;
}

export function createWhiteboardInkSession(documentId: string): WhiteboardInkSession {
  return { documentId, past: [], future: [], activePointerId: null, activeTool: null };
}

export function resetWhiteboardInkSessionForDocument(session: WhiteboardInkSession, documentId: string): boolean {
  if (session.documentId === documentId) return false;
  session.documentId = documentId;
  session.past = [];
  session.future = [];
  session.activePointerId = null;
  session.activeTool = null;
  return true;
}

export function beginWhiteboardInkGesture(
  session: WhiteboardInkSession,
  documentId: string,
  pointerId: number,
  tool: WhiteboardInteractionTool,
): boolean {
  if (session.documentId !== documentId || session.activePointerId !== null) return false;
  session.activePointerId = pointerId;
  session.activeTool = tool;
  return true;
}

export function getWhiteboardInkGestureTool(
  session: WhiteboardInkSession,
  documentId: string,
  pointerId: number,
): WhiteboardInteractionTool | null {
  return session.documentId === documentId && session.activePointerId === pointerId ? session.activeTool : null;
}

export function finishWhiteboardInkGesture(
  session: WhiteboardInkSession,
  documentId: string,
  pointerId: number,
): WhiteboardInteractionTool | null {
  const tool = getWhiteboardInkGestureTool(session, documentId, pointerId);
  if (tool === null) return null;
  session.activePointerId = null;
  session.activeTool = null;
  return tool;
}

export function recordWhiteboardInkHistory(
  session: WhiteboardInkSession,
  documentId: string,
  entry: WhiteboardInkHistoryEntry,
): boolean {
  if (session.documentId !== documentId || entry.documentId !== documentId) return false;
  session.past = [...session.past, entry].slice(-WHITEBOARD_INK_HISTORY_LIMIT);
  session.future = [];
  return true;
}

export function commitWhiteboardInkMutation(
  session: WhiteboardInkSession,
  documentId: string,
  entry: WhiteboardInkHistoryEntry,
  commit: () => boolean,
): boolean {
  if (session.documentId !== documentId || entry.documentId !== documentId || !commit()) return false;
  return recordWhiteboardInkHistory(session, documentId, entry);
}

export function peekWhiteboardInkUndo(session: WhiteboardInkSession, documentId: string): WhiteboardInkHistoryEntry | null {
  if (session.documentId !== documentId) return null;
  return session.past[session.past.length - 1] ?? null;
}

export function peekWhiteboardInkRedo(session: WhiteboardInkSession, documentId: string): WhiteboardInkHistoryEntry | null {
  if (session.documentId !== documentId) return null;
  return session.future[0] ?? null;
}

export function completeWhiteboardInkUndo(
  session: WhiteboardInkSession,
  documentId: string,
  entry: WhiteboardInkHistoryEntry,
): boolean {
  if (session.documentId !== documentId || entry.documentId !== documentId || session.past.at(-1) !== entry) return false;
  session.past = session.past.slice(0, -1);
  session.future = [entry, ...session.future].slice(0, WHITEBOARD_INK_HISTORY_LIMIT);
  return true;
}

export function completeWhiteboardInkRedo(
  session: WhiteboardInkSession,
  documentId: string,
  entry: WhiteboardInkHistoryEntry,
): boolean {
  if (session.documentId !== documentId || entry.documentId !== documentId || session.future[0] !== entry) return false;
  session.future = session.future.slice(1);
  session.past = [...session.past, entry].slice(-WHITEBOARD_INK_HISTORY_LIMIT);
  return true;
}

export function canUndoWhiteboardInk(session: WhiteboardInkSession, documentId: string): boolean {
  return peekWhiteboardInkUndo(session, documentId) !== null;
}

export function canRedoWhiteboardInk(session: WhiteboardInkSession, documentId: string): boolean {
  return peekWhiteboardInkRedo(session, documentId) !== null;
}
