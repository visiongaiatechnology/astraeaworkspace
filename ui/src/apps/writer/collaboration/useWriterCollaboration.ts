// STATUS: DIAMANT VGT SUPREME — Writer SyncGraph / Presence Orchestrator
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  closeWriterSyncSession,
  getWriterMissingSyncNodes,
  mergeWriterSyncNode,
  openWriterSyncSession,
  recordWriterSyncOperation,
  writerCollaborationNativeAvailable,
} from './native/writerCollaborationNative';
import {
  createLocalWriterCollaborationTransport,
  localWriterTransportAvailable,
} from './transport/writerCollaborationTransport';
import type {
  WriterCollaborationPeer,
  WriterCollaborationState,
  WriterCollaborationTransport,
  WriterCollaborationTransportMessage,
  WriterPresenceCursor,
  WriterPresenceState,
  WriterSyncReport,
  WriterVectorClock,
} from './types/writerCollaborationTypes';
import { deriveWriterSyncOperations } from './operations/writerSyncOperations';

const PRESENCE_HEARTBEAT_MS = 3_000;
const PRESENCE_STALE_MS = 12_000;
const MAX_REMOTE_PEERS = 64;

function createStableId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function defaultDisplayName(actorId: string): string {
  return `Reviewer ${actorId.slice(-6)}`;
}

function sameDocument(left: WorkspaceDocument, right: WorkspaceDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reportConflictCount(report: WriterSyncReport): number {
  return report.conflicts.length;
}

interface UseWriterCollaborationResult extends WriterCollaborationState {
  transportLabel: string | null;
  toggleEnabled: () => void;
  handleLocalDocumentUpdate: (document: WorkspaceDocument) => void;
  updateLocalPresence: (activeParagraphId: string | null, cursor?: WriterPresenceCursor | null) => void;
  remotePeersForParagraph: (paragraphId: string) => WriterCollaborationPeer[];
}

export function useWriterCollaboration(
  document: WorkspaceDocument,
  onUpdateDocument: (document: WorkspaceDocument) => void,
): UseWriterCollaborationResult {
  const identityRef = useRef({
    actorId: createStableId('actor'),
    sessionId: createStableId('session'),
  });
  const [enabled, setEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [peers, setPeers] = useState<WriterCollaborationPeer[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [bufferedOperationCount, setBufferedOperationCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [transportLabel, setTransportLabel] = useState<string | null>(null);

  const available = writerCollaborationNativeAvailable() && localWriterTransportAvailable();
  const transportRef = useRef<WriterCollaborationTransport | null>(null);
  const sessionDocumentIdRef = useRef<string | null>(null);
  const vectorClockRef = useRef<WriterVectorClock>({ clock: {} });
  const canonicalRef = useRef<WorkspaceDocument>(document);
  const optimisticRef = useRef<WorkspaceDocument>(document);
  const generationRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const peerLastSeenRef = useRef(new Map<string, number>());
  const presenceRef = useRef<WriterPresenceState>({
    actorId: identityRef.current.actorId,
    sessionId: identityRef.current.sessionId,
    displayName: defaultDisplayName(identityRef.current.actorId),
    documentId: document.id,
    activeParagraphId: null,
    updatedAt: Date.now(),
  });

  const enqueue = useCallback((task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task, task).catch((error: unknown) => {
      setLastError(error instanceof Error ? error.message : 'Collaboration operation failed');
    });
  }, []);

  const publishPresence = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    const presence = { ...presenceRef.current, updatedAt: Date.now() };
    presenceRef.current = presence;
    transport.send({
      kind: 'presence',
      documentId: presence.documentId,
      senderSessionId: presence.sessionId,
      presence,
    });
  }, []);

  const applyNativeDocument = useCallback((nextDocument: WorkspaceDocument, generation: number) => {
    canonicalRef.current = nextDocument;
    if (generationRef.current !== generation) return;
    const currentOptimistic = optimisticRef.current;
    optimisticRef.current = nextDocument;
    if (!sameDocument(currentOptimistic, nextDocument)) onUpdateDocument(nextDocument);
  }, [onUpdateDocument]);

  const handleTransportMessage = useCallback((message: WriterCollaborationTransportMessage) => {
    if (message.documentId !== optimisticRef.current.id) return;
    if (message.senderSessionId === identityRef.current.sessionId) return;
    if ('targetSessionId' in message && message.targetSessionId && message.targetSessionId !== identityRef.current.sessionId) return;

    if (message.kind === 'presence') {
      const incoming = message.presence;
      if (incoming.documentId !== optimisticRef.current.id || incoming.sessionId !== message.senderSessionId) return;
      const receivedAt = Date.now();
      const previousSeenAt = peerLastSeenRef.current.get(incoming.sessionId);
      peerLastSeenRef.current.set(incoming.sessionId, receivedAt);
      setPeers((current) => {
        const filtered = current.filter((peer) => peer.sessionId !== incoming.sessionId);
        return [...filtered, { ...incoming, updatedAt: receivedAt, stale: false }]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_REMOTE_PEERS);
      });
      if (previousSeenAt === undefined || receivedAt - previousSeenAt > PRESENCE_STALE_MS) {
        transportRef.current?.send({
          kind: 'sync-request',
          documentId: optimisticRef.current.id,
          senderSessionId: identityRef.current.sessionId,
          vectorClock: vectorClockRef.current,
        });
      }
      return;
    }

    if (message.kind === 'leave') {
      peerLastSeenRef.current.delete(message.senderSessionId);
      setPeers((current) => current.filter((peer) => peer.sessionId !== message.senderSessionId));
      return;
    }

    const generation = generationRef.current;
    if (message.kind === 'sync-request') {
      enqueue(async () => {
        const batch = await getWriterMissingSyncNodes(optimisticRef.current.id, message.vectorClock);
        const transport = transportRef.current;
        if (!transport) return;
        for (const node of batch.nodes) {
          transport.send({
            kind: 'sync-node',
            documentId: optimisticRef.current.id,
            senderSessionId: identityRef.current.sessionId,
            targetSessionId: message.senderSessionId,
            node,
          });
        }
        transport.send({
          kind: 'sync-batch-end',
          documentId: optimisticRef.current.id,
          senderSessionId: identityRef.current.sessionId,
          targetSessionId: message.senderSessionId,
          hasMore: batch.hasMore,
        });
        publishPresence();
      });
      return;
    }

    if (message.kind === 'sync-batch-end') {
      enqueue(async () => {
        if (!message.hasMore) return;
        transportRef.current?.send({
          kind: 'sync-request',
          documentId: optimisticRef.current.id,
          senderSessionId: identityRef.current.sessionId,
          vectorClock: vectorClockRef.current,
        });
      });
      return;
    }

    enqueue(async () => {
      const response = await mergeWriterSyncNode(optimisticRef.current.id, message.node);
      vectorClockRef.current = response.vectorClock;
      setConflictCount((count) => count + reportConflictCount(response.report));
      setBufferedOperationCount(response.report.buffered_count);
      applyNativeDocument(response.document, generation);
    });
  }, [applyNativeDocument, enqueue, publishPresence]);

  const stopCollaboration = useCallback(() => {
    const transport = transportRef.current;
    if (transport) {
      try {
        transport.send({
          kind: 'leave',
          documentId: optimisticRef.current.id,
          senderSessionId: identityRef.current.sessionId,
          actorId: identityRef.current.actorId,
        });
      } catch {
        // Closing is best-effort; local state still tears down fail-closed.
      }
      transport.close();
    }
    transportRef.current = null;
    peerLastSeenRef.current.clear();
    setTransportLabel(null);
    setPeers([]);
    setConnecting(false);
    setEnabled(false);
    const sessionDocumentId = sessionDocumentIdRef.current;
    sessionDocumentIdRef.current = null;
    if (sessionDocumentId) void closeWriterSyncSession(sessionDocumentId).catch(() => undefined);
  }, []);

  const startCollaboration = useCallback(() => {
    if (!available || enabled || connecting) {
      if (!available) setLastError('Native SyncGraph or the configured collaboration transport is unavailable');
      return;
    }
    setConnecting(true);
    setLastError(null);
    const generation = generationRef.current;
    enqueue(async () => {
      try {
        const currentDocument = optimisticRef.current;
        const status = await openWriterSyncSession(currentDocument, identityRef.current.actorId);
        sessionDocumentIdRef.current = currentDocument.id;
        canonicalRef.current = status.document;
        vectorClockRef.current = status.vectorClock;
        setBufferedOperationCount(status.pendingBufferCount);
        setConflictCount(status.audit.reduce((sum, entry) => sum + entry.conflicts.length, 0));

        const transport = createLocalWriterCollaborationTransport(currentDocument.id);
        transportRef.current = transport;
        transport.subscribe(handleTransportMessage);
        setTransportLabel(transport.label);
        setEnabled(true);
        setConnecting(false);
        presenceRef.current = {
          ...presenceRef.current,
          documentId: currentDocument.id,
          updatedAt: Date.now(),
        };
        transport.send({
          kind: 'sync-request',
          documentId: currentDocument.id,
          senderSessionId: identityRef.current.sessionId,
          vectorClock: status.vectorClock,
        });
        publishPresence();
        applyNativeDocument(status.document, generation);
      } catch (error) {
        setConnecting(false);
        setEnabled(false);
        setLastError(error instanceof Error ? error.message : 'Collaboration session could not be started');
      }
    });
  }, [applyNativeDocument, available, connecting, enabled, enqueue, handleTransportMessage, publishPresence]);

  const toggleEnabled = useCallback(() => {
    if (enabled || connecting) {
      stopCollaboration();
      return;
    }
    startCollaboration();
  }, [connecting, enabled, startCollaboration, stopCollaboration]);

  const handleLocalDocumentUpdate = useCallback((nextDocument: WorkspaceDocument) => {
    const previousOptimistic = optimisticRef.current;
    optimisticRef.current = nextDocument;
    generationRef.current += 1;
    const generation = generationRef.current;
    onUpdateDocument(nextDocument);

    if (!enabled) {
      canonicalRef.current = nextDocument;
      return;
    }

    let operations;
    try {
      operations = deriveWriterSyncOperations(previousOptimistic, nextDocument);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Writer change cannot be represented as a SyncGraph operation');
      stopCollaboration();
      return;
    }

    enqueue(async () => {
      if (operations.length === 0) {
        canonicalRef.current = nextDocument;
        return;
      }
      let canonical = canonicalRef.current;
      for (const operation of operations) {
        const response = await recordWriterSyncOperation(nextDocument.id, operation);
        canonical = response.document;
        vectorClockRef.current = response.vectorClock;
        setConflictCount((count) => count + reportConflictCount(response.report));
        setBufferedOperationCount(response.report.buffered_count);
        transportRef.current?.send({
          kind: 'sync-node',
          documentId: nextDocument.id,
          senderSessionId: identityRef.current.sessionId,
          node: response.node,
        });
      }
      applyNativeDocument(canonical, generation);
    });
  }, [applyNativeDocument, enabled, enqueue, onUpdateDocument, stopCollaboration]);

  const updateLocalPresence = useCallback((activeParagraphId: string | null, cursor?: WriterPresenceCursor | null) => {
    presenceRef.current = {
      ...presenceRef.current,
      activeParagraphId,
      cursor: cursor ?? undefined,
      updatedAt: Date.now(),
    };
    if (enabled) publishPresence();
  }, [enabled, publishPresence]);

  useEffect(() => {
    optimisticRef.current = document;
    if (!enabled) canonicalRef.current = document;
    if (presenceRef.current.documentId !== document.id) {
      presenceRef.current = { ...presenceRef.current, documentId: document.id, cursor: undefined, activeParagraphId: null };
    }
  }, [document, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const heartbeat = window.setInterval(publishPresence, PRESENCE_HEARTBEAT_MS);
    const staleSweep = window.setInterval(() => {
      const now = Date.now();
      const cutoff = now - PRESENCE_STALE_MS;
      setPeers((current) => {
        const active = current.filter((peer) => (peerLastSeenRef.current.get(peer.sessionId) ?? 0) >= cutoff);
        const activeSessions = new Set(active.map((peer) => peer.sessionId));
        for (const sessionId of peerLastSeenRef.current.keys()) {
          if (!activeSessions.has(sessionId)) peerLastSeenRef.current.delete(sessionId);
        }
        return active.map((peer) => ({
          ...peer,
          stale: (peerLastSeenRef.current.get(peer.sessionId) ?? 0) < now - PRESENCE_HEARTBEAT_MS * 2,
        }));
      });
    }, PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(staleSweep);
    };
  }, [enabled, publishPresence]);

  useEffect(() => () => stopCollaboration(), [stopCollaboration]);

  useEffect(() => {
    if (!enabled) return;
    stopCollaboration();
  }, [document.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remotePeersForParagraph = useCallback((paragraphId: string) => (
    peers.filter((peer) => peer.activeParagraphId === paragraphId || peer.cursor?.paragraphId === paragraphId)
  ), [peers]);

  return useMemo(() => ({
    enabled,
    available,
    connecting,
    actorId: identityRef.current.actorId,
    sessionId: identityRef.current.sessionId,
    peers,
    conflictCount,
    bufferedOperationCount,
    lastError,
    transportLabel,
    toggleEnabled,
    handleLocalDocumentUpdate,
    updateLocalPresence,
    remotePeersForParagraph,
  }), [
    available,
    bufferedOperationCount,
    conflictCount,
    connecting,
    enabled,
    handleLocalDocumentUpdate,
    lastError,
    peers,
    remotePeersForParagraph,
    toggleEnabled,
    transportLabel,
    updateLocalPresence,
  ]);
}
