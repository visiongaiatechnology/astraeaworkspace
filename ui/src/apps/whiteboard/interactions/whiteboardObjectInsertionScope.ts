// STATUS: PLATIN
// Rejects asynchronous Whiteboard insertion results after a document switch or unmount.

export interface WhiteboardObjectInsertionSession {
  documentId: string;
  generation: number;
  active: boolean;
}

export interface WhiteboardObjectInsertionToken {
  documentId: string;
  generation: number;
}

export function createWhiteboardObjectInsertionSession(documentId: string): WhiteboardObjectInsertionSession {
  return { documentId, generation: 0, active: false };
}

export function activateWhiteboardObjectInsertionSession(session: WhiteboardObjectInsertionSession, documentId: string): void {
  session.documentId = documentId;
  session.generation += 1;
  session.active = true;
}

export function invalidateWhiteboardObjectInsertionSession(session: WhiteboardObjectInsertionSession): void {
  session.generation += 1;
  session.active = false;
}

export function captureWhiteboardObjectInsertionToken(
  session: WhiteboardObjectInsertionSession,
  documentId: string,
): WhiteboardObjectInsertionToken | null {
  if (!session.active || session.documentId !== documentId) return null;
  return { documentId, generation: session.generation };
}

export function isCurrentWhiteboardObjectInsertionToken(
  session: WhiteboardObjectInsertionSession,
  token: WhiteboardObjectInsertionToken,
): boolean {
  return session.active && session.documentId === token.documentId && session.generation === token.generation;
}

export function commitWhiteboardObjectInsertionIfCurrent(
  session: WhiteboardObjectInsertionSession,
  token: WhiteboardObjectInsertionToken,
  commit: () => boolean,
): boolean {
  if (!isCurrentWhiteboardObjectInsertionToken(session, token)) return false;
  return commit();
}
