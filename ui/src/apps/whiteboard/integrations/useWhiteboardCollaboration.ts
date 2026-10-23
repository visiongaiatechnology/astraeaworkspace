// STATUS: DIAMANT VGT SUPREME
// Whiteboard collaboration controller: local real-time session, deterministic offline merge, comments, presence and Space role binding.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WhiteboardCollaborationState,
  WhiteboardParticipantCursor,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { syncWhiteboardCollaborationToDocument, syncWhiteboardItemsToDocument } from '../persistence/canvasItemsStore';
import {
  appendWhiteboardActivity,
  appendWhiteboardComment,
  applyWhiteboardItemOperations,
  createWhiteboardComment,
  createWhiteboardItemOperations,
  mergeWhiteboardCollaborationSnapshots,
  normalizeWhiteboardCollaborationState,
  resolveWhiteboardComment,
  WHITEBOARD_COLLAB_PRESENCE_TTL_MS,
} from '../model/whiteboardCollaborationEngine';
import { createWhiteboardSecureGuestLink } from './whiteboardGuestLink';
import {
  createLocalWhiteboardCollaborationTransport,
  localWhiteboardTransportAvailable,
  type WhiteboardCollaborationMessage,
  type WhiteboardCollaborationPresence,
  type WhiteboardCollaborationTransport,
} from './whiteboardCollaborationTransport';

interface ControllerArgs {
  document: WorkspaceDocument;
  items: WhiteboardItem[];
  onUpdateDocument: (document: WorkspaceDocument) => void;
  normalizeRemoteItems: (items: WhiteboardItem[]) => WhiteboardItem[] | null;
  onLocalStateMutation?: (before: WhiteboardCollaborationState, after: WhiteboardCollaborationState, coalesceKey: string) => void;
}

const makeSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `wb-session-${crypto.randomUUID()}`;
  throw new Error('whiteboard_collaboration_secure_random_unavailable');
};

export function useWhiteboardCollaboration({ document, items, onUpdateDocument, normalizeRemoteItems, onLocalStateMutation }: ControllerArgs) {
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = makeSessionId();
  const actorIdRef = useRef<string | null>(null);
  if (actorIdRef.current === null) actorIdRef.current = `actor-${sessionIdRef.current}`;
  const transportRef = useRef<WhiteboardCollaborationTransport | null>(null);
  const lastPresenceAtRef = useRef(0);
  const documentRef = useRef(document);
  const itemsRef = useRef(items);
  documentRef.current = document;
  itemsRef.current = items;

  const [state, setState] = useState<WhiteboardCollaborationState>(() => normalizeWhiteboardCollaborationState(document.whiteboardData?.collaboration));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [peers, setPeers] = useState<Record<string, WhiteboardCollaborationPresence>>({});
  const [transportLabel, setTransportLabel] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeWhiteboardCollaborationState(document.whiteboardData?.collaboration);
    stateRef.current = normalized;
    setState(normalized);
    setPeers({});
  }, [document.id]);

  const persistStateOnly = useCallback((nextRaw: WhiteboardCollaborationState, historyKey?: string) => {
    const before = stateRef.current;
    const next = normalizeWhiteboardCollaborationState(nextRaw);
    if (historyKey) onLocalStateMutation?.(before, next, historyKey);
    stateRef.current = next;
    setState(next);
    onUpdateDocument(syncWhiteboardCollaborationToDocument(next, itemsRef.current, documentRef.current));
  }, [onLocalStateMutation, onUpdateDocument]);

  const restoreState = useCallback((nextRaw: WhiteboardCollaborationState) => {
    const next = normalizeWhiteboardCollaborationState(nextRaw);
    stateRef.current = next;
    setState(next);
  }, []);

  const persistItemsAndState = useCallback((nextItems: WhiteboardItem[], next: WhiteboardCollaborationState) => {
    stateRef.current = next;
    setState(next);
    const base: WorkspaceDocument = {
      ...documentRef.current,
      whiteboardData: {
        items: itemsRef.current.map((item) => ({ ...item })),
        ...documentRef.current.whiteboardData,
        collaboration: next,
      },
    };
    onUpdateDocument(syncWhiteboardItemsToDocument(nextItems, base));
  }, [onUpdateDocument]);

  const send = useCallback((message: WhiteboardCollaborationMessage) => {
    try { transportRef.current?.send(message); setLastError(null); }
    catch (error) { setLastError(error instanceof Error ? error.message : 'whiteboard_collaboration_send_failed'); }
  }, []);

  const canEdit = true;
  const canComment = true;
  const roleLabel = 'Local owner';

  const recordLocalItems = useCallback((previous: WhiteboardItem[], next: WhiteboardItem[], changedIds: readonly string[], baseDocument?: WorkspaceDocument): boolean => {
    if (!canEdit) return false;
    const current = stateRef.current;
    const result = createWhiteboardItemOperations(previous, next, changedIds, current, actorIdRef.current!, current.localDisplayName);
    if (baseDocument) {
      stateRef.current=result.state; setState(result.state);
      onUpdateDocument({ ...baseDocument, whiteboardData:{ ...baseDocument.whiteboardData, items:next.map((item)=>({...item})), collaboration:result.state } });
    } else persistItemsAndState(next, result.state);
    if (result.operations.length > 0 && current.enabled) send({ kind:'item-ops', documentId:documentRef.current.id, senderSessionId:sessionIdRef.current!, operations:result.operations });
    return true;
  }, [canEdit, onUpdateDocument, persistItemsAndState, send]);

  const addComment = useCallback((body: string, objectId?: string, parentId?: string) => {
    if (!canComment) throw new Error('whiteboard_collaboration_comment_forbidden');
    const current = stateRef.current;
    const comment = createWhiteboardComment({ actorId:actorIdRef.current!, actorName:current.localDisplayName, body, objectId, parentId });
    let next = appendWhiteboardComment(current, comment);
    next = appendWhiteboardActivity(next,{at:comment.createdAt,actorId:comment.authorId,actorName:comment.authorName,kind:'comment',objectId:comment.objectId,detail:`Commented${comment.objectId ? ` on ${comment.objectId}` : ' on the board'}${comment.mentions.length ? ` mentioning ${comment.mentions.map((m)=>`@${m}`).join(', ')}` : ''}.`});
    persistStateOnly(next, `collab:comment:${comment.id}`);
    if (next.enabled) send({kind:'comment',documentId:documentRef.current.id,senderSessionId:sessionIdRef.current!,comment});
    return comment;
  }, [canComment, persistStateOnly, send]);

  const setCommentResolved = useCallback((commentId: string, resolved: boolean) => {
    if (!canComment) return;
    persistStateOnly(resolveWhiteboardComment(stateRef.current, commentId, resolved), `collab:comment:${commentId}`);
  }, [canComment, persistStateOnly]);

  const setEnabled = useCallback((enabled: boolean) => {
    const current = stateRef.current;
    let next = { ...current, enabled };
    next = appendWhiteboardActivity(next,{at:Date.now(),actorId:actorIdRef.current!,actorName:current.localDisplayName,kind:'presence',detail:enabled?'Real-time local collaboration enabled.':'Real-time local collaboration disabled; edits remain offline-capable.'});
    persistStateOnly(next, 'collab:enabled');
  }, [persistStateOnly]);

  const setDisplayName = useCallback((displayName: string) => {
    const normalized = displayName.normalize('NFKC').replace(/\0/g,'').trim().slice(0,128) || 'Local collaborator';
    persistStateOnly({ ...stateRef.current, localDisplayName: normalized }, 'collab:display-name');
  }, [persistStateOnly]);

  const setAuthorshipEnabled = useCallback((enabled: boolean) => persistStateOnly({ ...stateRef.current, objectAuthorshipEnabled: enabled }, 'collab:authorship'), [persistStateOnly]);

  const createGuestLink = useCallback((permission: 'Viewer'|'Commenter'): string => {
    void permission;
    return createWhiteboardSecureGuestLink();
  }, []);

  const clearLocalGuestEntry = useCallback(() => {
    const current = stateRef.current;
    const nextState: WhiteboardCollaborationState = { ...current };
    delete nextState.guestAccess;
    let next = nextState;
    next = appendWhiteboardActivity(next,{at:Date.now(),actorId:actorIdRef.current!,actorName:current.localDisplayName,kind:'guest',detail:'Cleared local guest-link metadata; no remote issuer is configured.'});
    persistStateOnly(next, 'collab:guest');
  }, [persistStateOnly]);

  const updateCursor = useCallback((x: number, y: number) => {
    if (!stateRef.current.enabled || !transportRef.current) return;
    const now = Date.now();
    if (now - lastPresenceAtRef.current < 60) return;
    lastPresenceAtRef.current = now;
    send({kind:'presence',documentId:documentRef.current.id,senderSessionId:sessionIdRef.current!,presence:{actorId:actorIdRef.current!,sessionId:sessionIdRef.current!,displayName:stateRef.current.localDisplayName,documentId:documentRef.current.id,x,y,updatedAt:now}});
  }, [send]);

  useEffect(() => {
    if (!state.enabled || !localWhiteboardTransportAvailable()) { setTransportLabel(null); transportRef.current?.close(); transportRef.current=null; return; }
    let transport: WhiteboardCollaborationTransport;
    try { transport = createLocalWhiteboardCollaborationTransport(document.id); }
    catch (error) { setLastError(error instanceof Error?error.message:'whiteboard_collaboration_transport_failed'); return; }
    transportRef.current = transport;
    setTransportLabel(transport.label);
    const unsubscribe = transport.subscribe((message) => {
      if (message.senderSessionId === sessionIdRef.current!) return;
      if (message.kind === 'item-ops') {
        const merged = applyWhiteboardItemOperations(itemsRef.current,stateRef.current,message.operations);
        if (!merged.applied) return;
        const normalized = normalizeRemoteItems(merged.items); if (!normalized) return;
        itemsRef.current = normalized; persistItemsAndState(normalized,merged.state); return;
      }
      if (message.kind === 'comment') {
        try {
          let next = appendWhiteboardComment(stateRef.current,message.comment);
          next = appendWhiteboardActivity(next,{at:message.comment.createdAt,actorId:message.comment.authorId,actorName:message.comment.authorName,kind:'comment',objectId:message.comment.objectId,detail:`Received comment${message.comment.objectId ? ` on ${message.comment.objectId}` : ' on the board'}${message.comment.mentions.length ? ` mentioning ${message.comment.mentions.map((m)=>`@${m}`).join(', ')}` : ''}.`});
          persistStateOnly(next);
        } catch { /* malformed thread is ignored fail-closed */ }
        return;
      }
      if (message.kind === 'presence') { setPeers((previous)=>({...previous,[message.presence.sessionId]:message.presence})); return; }
      if (message.kind === 'leave') { setPeers((previous)=>{const next={...previous};delete next[message.senderSessionId];return next;}); return; }
      if (message.kind === 'sync-request') {
        let snapshot = {items:itemsRef.current,state:stateRef.current};
        if (message.snapshot) {
          const merged = mergeWhiteboardCollaborationSnapshots(snapshot,message.snapshot);
          const normalized = normalizeRemoteItems(merged.snapshot.items);
          if (normalized) { itemsRef.current=normalized; snapshot={items:normalized,state:merged.snapshot.state}; persistItemsAndState(normalized,merged.snapshot.state); }
        }
        try { transport.send({kind:'snapshot',documentId:document.id,senderSessionId:sessionIdRef.current!,targetSessionId:message.senderSessionId,snapshot}); } catch { /* oversized snapshot remains safely local */ }
        return;
      }
      if (message.kind === 'snapshot' && message.targetSessionId === sessionIdRef.current!) {
        const merged = mergeWhiteboardCollaborationSnapshots({items:itemsRef.current,state:stateRef.current},message.snapshot);
        const normalized = normalizeRemoteItems(merged.snapshot.items); if (!normalized) return;
        itemsRef.current=normalized; persistItemsAndState(normalized,merged.snapshot.state);
      }
    });
    try { transport.send({kind:'sync-request',documentId:document.id,senderSessionId:sessionIdRef.current!,snapshot:{items:itemsRef.current,state:stateRef.current}}); } catch { /* large boards still retain operation-level collaboration */ }
    return () => {
      try { transport.send({kind:'leave',documentId:document.id,senderSessionId:sessionIdRef.current!,actorId:actorIdRef.current!}); } catch { /* close regardless */ }
      unsubscribe(); transport.close(); if (transportRef.current===transport) transportRef.current=null; setTransportLabel(null);
    };
  }, [document.id, normalizeRemoteItems, persistItemsAndState, persistStateOnly, state.enabled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now()-WHITEBOARD_COLLAB_PRESENCE_TTL_MS;
      setPeers((previous)=>Object.fromEntries(Object.entries(previous as Record<string, WhiteboardCollaborationPresence>).filter(([,presence])=>presence.updatedAt>=cutoff)));
    },5000);
    return () => window.clearInterval(timer);
  },[]);

  const participants = useMemo<WhiteboardParticipantCursor[]>(() => Object.values(peers as Record<string, WhiteboardCollaborationPresence>).map((peer)=>({id:peer.sessionId,name:peer.displayName,x:peer.x,y:peer.y,lastSeenAt:peer.updatedAt})),[peers]);

  return {
    state,
    actorId: actorIdRef.current!,
    sessionId: sessionIdRef.current!,
    transportAvailable: localWhiteboardTransportAvailable(),
    transportLabel,
    lastError,
    participants,
    canEdit,
    canComment,
    roleLabel,
    recordLocalItems,
    restoreState,
    addComment,
    setCommentResolved,
    setEnabled,
    setDisplayName,
    setAuthorshipEnabled,
    createGuestLink,
    clearLocalGuestEntry,
    updateCursor,
    secureGuestAvailable: false,
  };
}

export type WhiteboardCollaborationController = ReturnType<typeof useWhiteboardCollaboration>;
