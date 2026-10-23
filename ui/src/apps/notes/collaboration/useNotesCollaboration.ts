import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME — optional same-origin Notes collaboration transport with deterministic conflict merge
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteNotebook, NotePage, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { mergeNotePageConflict } from './notesCollaborationCore';
import { createNotesDocumentHistory, recordNotesDocumentHistory, stepNotesDocumentHistory } from '../history/notesDocumentHistory';
import { withNotesPageObjects } from '../model/notesPageObjects';

const CHANNEL_PREFIX = 'astraea-notes-v1-';
const HEARTBEAT_MS = 3_000;
const PEER_TTL_MS = 12_000;
const MAX_WIRE_BYTES = 8_000_000;

type PresencePeer = { sessionId: string; authorId: string; displayName: string; pageId: string | null; updatedAt: number };
type PageLocation = { notebookId: string; sectionId: string; pageId: string };
type CollaborationMessage =
  | { version: 1; type: 'presence'; documentId: string; peer: PresencePeer }
  | { version: 1; type: 'leave'; documentId: string; sessionId: string }
  | { version: 1; type: 'page-update'; documentId: string; sessionId: string; authorId: string; displayName: string; location: PageLocation; base: NotePage; page: NotePage; sentAt: number };

function id(prefix: string): string {
  const value = secureRandomId('notes');
  return `${prefix}-${value}`.slice(0, 180);
}

function documentChannelId(documentId: string): string {
  const safe = documentId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96) || 'document';
  return `${CHANNEL_PREFIX}${safe}`;
}

function findPage(document: WorkspaceDocument, location: PageLocation): NotePage | null {
  const notebook = (document.notebooks ?? []).find((entry) => entry.id === location.notebookId);
  const section = notebook?.sections.find((entry) => entry.id === location.sectionId);
  return section?.pages.find((entry) => entry.id === location.pageId) ?? null;
}

function changedPages(before: WorkspaceDocument, after: WorkspaceDocument): Array<{ location: PageLocation; base: NotePage; page: NotePage }> {
  const beforePages = new Map<string, { location: PageLocation; page: NotePage }>();
  for (const notebook of before.notebooks ?? []) for (const section of notebook.sections) for (const page of section.pages) {
    beforePages.set(page.id, { location: { notebookId: notebook.id, sectionId: section.id, pageId: page.id }, page });
  }
  const changes: Array<{ location: PageLocation; base: NotePage; page: NotePage }> = [];
  for (const notebook of after.notebooks ?? []) for (const section of notebook.sections) for (const page of section.pages) {
    const prior = beforePages.get(page.id);
    if (prior && JSON.stringify(prior.page) !== JSON.stringify(page)) changes.push({ location: { notebookId: notebook.id, sectionId: section.id, pageId: page.id }, base: prior.page, page });
  }
  return changes.slice(0, 128);
}

function stampAttribution(before: WorkspaceDocument, after: WorkspaceDocument, authorId: string, displayName: string): WorkspaceDocument {
  const enabled = new Set((after.notebooks ?? []).filter((notebook) => notebook.authorAttributionEnabled).map((notebook) => notebook.id));
  if (!enabled.size) return after;
  const changed = new Set(changedPages(before, after).map((entry) => entry.location.pageId));
  if (!changed.size) return after;
  const now = Date.now();
  return {
    ...after,
    notebooks: (after.notebooks ?? []).map((notebook: NoteNotebook) => !enabled.has(notebook.id) ? notebook : ({
      ...notebook,
      sections: notebook.sections.map((section) => ({
        ...section,
        pages: section.pages.map((page) => changed.has(page.id) ? { ...page, lastAuthor: { authorId, displayName, updatedAt: now } } : page),
      })),
    })),
  };
}

function applyRemotePage(document: WorkspaceDocument, message: Extract<CollaborationMessage, { type: 'page-update' }>): { document: WorkspaceDocument; conflicts: number } {
  const local = findPage(document, message.location);
  if (!local) return { document, conflicts: 0 };
  const merged = JSON.stringify(local) === JSON.stringify(message.base)
    ? { page: message.page, conflicts: [] as string[] }
    : mergeNotePageConflict(message.base, local, message.page);
  const now = Date.now();
  const next = {
    ...document,
    modified_at: now,
    version: document.version + 1,
    notebooks: (document.notebooks ?? []).map((notebook) => notebook.id !== message.location.notebookId ? notebook : ({
      ...notebook,
      updatedAt: now,
      sections: notebook.sections.map((section) => section.id !== message.location.sectionId ? section : ({
        ...section,
        updatedAt: now,
        pages: section.pages.map((page) => page.id === message.location.pageId ? merged.page : page),
      })),
    })),
  };
  return { document: next, conflicts: merged.conflicts.length };
}

function isMessage(value: unknown, documentId: string): value is CollaborationMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<CollaborationMessage>;
  return message.version === 1 && message.documentId === documentId && ['presence', 'leave', 'page-update'].includes(String(message.type));
}

export function useNotesCollaboration(document: WorkspaceDocument, onUpdateDocument: (document: WorkspaceDocument) => void, activePageId: string | null = null) {
  const supported = typeof BroadcastChannel !== 'undefined';
  const sessionId = useRef(id('session')).current;
  const authorId = useRef(id('author')).current;
  const [displayName, setDisplayNameState] = useState(() => `Notes user ${authorId.slice(-6)}`);
  const [enabled, setEnabled] = useState(false);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyRef = useRef(createNotesDocumentHistory());
  const historyDocumentIdRef = useRef(document.id);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const documentRef = useRef(document);
  const onUpdateRef = useRef(onUpdateDocument);
  const pageRef = useRef<string | null>(activePageId);
  const nameRef = useRef(displayName);
  useEffect(() => {
    documentRef.current = document;
    if (historyDocumentIdRef.current !== document.id) {
      historyDocumentIdRef.current = document.id;
      historyRef.current = createNotesDocumentHistory();
      setHistoryRevision((value) => value + 1);
    }
  }, [document]);
  useEffect(() => { onUpdateRef.current = onUpdateDocument; }, [onUpdateDocument]);
  useEffect(() => { pageRef.current = activePageId; }, [activePageId]);
  useEffect(() => { nameRef.current = displayName; }, [displayName]);

  const post = useCallback((message: CollaborationMessage) => {
    try {
      const encoded = JSON.stringify(message);
      if (new TextEncoder().encode(encoded).byteLength > MAX_WIRE_BYTES) throw new Error('Collaboration update exceeds the 8 MB transport safety limit. Local changes were kept offline.');
      channelRef.current?.postMessage(message);
      setLastError(null);
    } catch (error) { setLastError(error instanceof Error ? error.message : 'Collaboration transport rejected the update.'); }
  }, []);

  useEffect(() => {
    if (!enabled || !supported) return undefined;
    const channel = new BroadcastChannel(documentChannelId(document.id));
    channelRef.current = channel;
    const sendPresence = () => post({ version: 1, type: 'presence', documentId: document.id, peer: { sessionId, authorId, displayName: nameRef.current, pageId: pageRef.current, updatedAt: Date.now() } });
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!isMessage(message, document.id)) return;
      if (message.type === 'leave') {
        if (message.sessionId !== sessionId) setPeers((current) => current.filter((peer) => peer.sessionId !== message.sessionId));
        return;
      }
      if (message.type === 'presence') {
        if (message.peer.sessionId === sessionId || !message.peer.sessionId || !message.peer.authorId) return;
        const safePeer: PresencePeer = { ...message.peer, displayName: String(message.peer.displayName || 'Collaborator').slice(0, 128), pageId: message.peer.pageId ? String(message.peer.pageId).slice(0, 180) : null, updatedAt: Date.now() };
        setPeers((current) => [...current.filter((peer) => peer.sessionId !== safePeer.sessionId), safePeer].slice(-64));
        return;
      }
      if (message.sessionId === sessionId || !message.location || !message.base || !message.page || message.page.id !== message.location.pageId || message.base.id !== message.page.id) return;
      const applied = applyRemotePage(documentRef.current, message);
      if (applied.document !== documentRef.current) {
        documentRef.current = applied.document;
        onUpdateRef.current(applied.document);
        if (applied.conflicts) setConflictCount((value) => value + applied.conflicts);
      }
    };
    sendPresence();
    const heartbeat = window.setInterval(() => {
      const cutoff = Date.now() - PEER_TTL_MS;
      setPeers((current) => current.filter((peer) => peer.updatedAt >= cutoff));
      sendPresence();
    }, HEARTBEAT_MS);
    return () => {
      post({ version: 1, type: 'leave', documentId: document.id, sessionId });
      window.clearInterval(heartbeat);
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
      setPeers([]);
    };
  }, [document.id, enabled, post, sessionId, authorId, supported]);

  const broadcastChangedPages = useCallback((before: WorkspaceDocument, after: WorkspaceDocument) => {
    if (!enabled || !supported) return;
    for (const change of changedPages(before, after)) {
      post({ version: 1, type: 'page-update', documentId: after.id, sessionId, authorId, displayName: nameRef.current, location: change.location, base: change.base, page: change.page, sentAt: Date.now() });
    }
  }, [authorId, enabled, post, sessionId, supported]);

  /**
   * **AST-0737-Abhängigkeit (4) — der eine Durchlass.**
   *
   * Gemessen: **jeder** Produktionsschreibzugriff auf das Notes-Dokument läuft hier durch — `useNotesEditorController.ts:23`
   * reicht `commitDocument` als `onUpdateDocument` an `useNotesManager` (`persistNotebooks`), und
   * `NotesEditorOverlays.tsx:205-210` schreibt den `.vnote`-Import **direkt** hierher. *Deshalb ist die
   * Objekt-Projektion **hier** vollständig — und nur hier.*
   *
   * `withNotesPageObjects` führt die Seiten als **Objekte** (`model/notesPageObjects.ts`), damit der Träger
   * (`notesParagraphCarrier`) sie **ohne** jeden Zugriff zur Zugzeit findet. *Ein erst beim Ziehen erzeugtes Objekt
   * wäre ein Scheinträger* ✗ — *hier steht es dauerhaft im Dokument, das gespeichert wird.*
   */
  const commitDocument = useCallback((nextDocument: WorkspaceDocument) => {
    const before = documentRef.current;
    const attributed = withNotesPageObjects(stampAttribution(before, nextDocument, authorId, nameRef.current));
    historyRef.current = recordNotesDocumentHistory(historyRef.current, before, attributed);
    setHistoryRevision((value) => value + 1);
    documentRef.current = attributed;
    onUpdateRef.current(attributed);
    broadcastChangedPages(before, attributed);
  }, [authorId, broadcastChangedPages]);

  const stepHistory = useCallback((direction: 'undo' | 'redo') => {
    const before = documentRef.current;
    const step = stepNotesDocumentHistory(historyRef.current, before, direction);
    if (!step.document) return;
    historyRef.current = step.state;
    // Auch der Rückweg führt durch dieselbe Projektion: *zwei Wege für dieselbe Sache wären zwei Wahrheiten.*
    const attributed = withNotesPageObjects(stampAttribution(before, step.document, authorId, nameRef.current));
    documentRef.current = attributed;
    onUpdateRef.current(attributed);
    setHistoryRevision((value) => value + 1);
    broadcastChangedPages(before, attributed);
  }, [authorId, broadcastChangedPages]);

  const undo = useCallback(() => stepHistory('undo'), [stepHistory]);
  const redo = useCallback(() => stepHistory('redo'), [stepHistory]);

  const setDisplayName = useCallback((value: string) => {
    const safe = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 128);
    setDisplayNameState(safe || `Notes user ${authorId.slice(-6)}`);
  }, [authorId]);

  return useMemo(() => ({
    supported, enabled, setEnabled, peers, conflictCount, lastError, authorId, displayName, setDisplayName, commitDocument,
    undo, redo, canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0,
  }), [supported, enabled, peers, conflictCount, lastError, authorId, displayName, setDisplayName, commitDocument, undo, redo, historyRevision]);
}
