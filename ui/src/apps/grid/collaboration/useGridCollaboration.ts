// STATUS: DIAMANT VGT SUPREME — Grid cell coauthoring over native SyncGraph + bounded local transport.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { closeGridSyncSession, getGridMissingSyncNodes, gridCollaborationNativeAvailable, mergeGridSyncNode, openGridSyncSession, recordGridSyncOperation } from './gridCollaborationNative';
import { createLocalGridCollaborationTransport, localGridTransportAvailable } from './gridCollaborationTransport';
import type { GridCollaborationMessage, GridCollaborationTransport, GridSyncOperation, GridVectorClock } from './gridCollaborationTypes';
import { applyGridRemoteSyncNode, deriveGridSyncOperations, gridSyncTableIdentityStable } from './gridCollaborationCore';

/**
 * GR-001 (M1, native crash candidate) — **a render path must not die on an optional ID API.**
 *
 * This is one of the first things `GridSheet` executes (the identity ref is initialised eagerly
 * in render). It called `crypto.randomUUID()` unconditionally, so a host without that API threw
 * before the sheet ever mounted — the measured failure class behind a "module safely stopped"
 * screen. The fallback keeps the ID unique enough for an in-session actor/session handle; the
 * value never becomes document content.
 */
const createGridCollaborationId = (prefix: string): string => {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}-${random}`;
};

export function useGridCollaboration(document:WorkspaceDocument,onRemoteDocument:(document:WorkspaceDocument)=>void){
  const identity=useRef({actorId:createGridCollaborationId('grid-actor'),sessionId:createGridCollaborationId('grid-session')});
  const [enabled,setEnabled]=useState(false),[connecting,setConnecting]=useState(false),[peerCount,setPeerCount]=useState(0),[conflictCount,setConflictCount]=useState(0),[lastError,setLastError]=useState<string|null>(null);
  const available=gridCollaborationNativeAvailable()&&localGridTransportAvailable();const transportRef=useRef<GridCollaborationTransport|null>(null);const vectorRef=useRef<GridVectorClock>({clock:{}});const optimisticRef=useRef(document);const queueRef=useRef<Promise<void>>(Promise.resolve());const peersRef=useRef(new Set<string>());
  const enqueue=useCallback((task:()=>Promise<void>)=>{queueRef.current=queueRef.current.then(task,task).catch((error:unknown)=>setLastError(error instanceof Error?error.message:'grid_collaboration_failed'));},[]);
  const sendPresence=useCallback((activeSheetId?:string,activeCell?:string)=>{transportRef.current?.send({kind:'presence',documentId:optimisticRef.current.id,senderSessionId:identity.current.sessionId,presence:{actorId:identity.current.actorId,sessionId:identity.current.sessionId,displayName:`Grid ${identity.current.actorId.slice(-6)}`,documentId:optimisticRef.current.id,activeSheetId,activeCell,updatedAt:Date.now()}});},[]);
  const onMessage=useCallback((message:GridCollaborationMessage)=>{if(message.documentId!==optimisticRef.current.id||message.senderSessionId===identity.current.sessionId)return;if(message.kind==='presence'){peersRef.current.add(message.senderSessionId);setPeerCount(peersRef.current.size);return;}if(message.kind==='leave'){peersRef.current.delete(message.senderSessionId);setPeerCount(peersRef.current.size);return;}if(message.kind==='sync-request'){enqueue(async()=>{const batch=await getGridMissingSyncNodes(optimisticRef.current.id,message.vectorClock);for(const node of batch.nodes)transportRef.current?.send({kind:'sync-node',documentId:optimisticRef.current.id,senderSessionId:identity.current.sessionId,targetSessionId:message.senderSessionId,node});transportRef.current?.send({kind:'sync-batch-end',documentId:optimisticRef.current.id,senderSessionId:identity.current.sessionId,targetSessionId:message.senderSessionId,hasMore:batch.hasMore});});return;}if(message.kind==='sync-batch-end'){if(message.hasMore)transportRef.current?.send({kind:'sync-request',documentId:optimisticRef.current.id,senderSessionId:identity.current.sessionId,vectorClock:vectorRef.current});return;}enqueue(async()=>{const merged=await mergeGridSyncNode(optimisticRef.current.id,message.node);vectorRef.current=merged.vectorClock;setConflictCount((count)=>count+merged.report.conflicts.length);const patched=applyGridRemoteSyncNode(optimisticRef.current,message.node);optimisticRef.current=patched;onRemoteDocument(patched);});},[enqueue,onRemoteDocument]);
  const stop=useCallback(()=>{try{transportRef.current?.send({kind:'leave',documentId:optimisticRef.current.id,senderSessionId:identity.current.sessionId,actorId:identity.current.actorId});}catch{}transportRef.current?.close();transportRef.current=null;peersRef.current.clear();setPeerCount(0);setEnabled(false);setConnecting(false);void closeGridSyncSession(optimisticRef.current.id).catch(()=>undefined);},[]);
  const start=useCallback(()=>{if(!available||enabled||connecting){if(!available)setLastError('Native SyncGraph or local Grid transport unavailable');return;}setConnecting(true);setLastError(null);enqueue(async()=>{const status=await openGridSyncSession(optimisticRef.current,identity.current.actorId);vectorRef.current=status.vectorClock;const transport=createLocalGridCollaborationTransport(optimisticRef.current.id);transportRef.current=transport;transport.subscribe(onMessage);setEnabled(true);setConnecting(false);sendPresence();transport.send({kind:'sync-request',documentId:optimisticRef.current.id,senderSessionId:identity.current.sessionId,vectorClock:vectorRef.current});});},[available,connecting,enabled,enqueue,onMessage,sendPresence]);
  const toggle=useCallback(()=>enabled?stop():start(),[enabled,start,stop]);
  const handleLocalDocumentUpdate=useCallback((next:WorkspaceDocument)=>{const previous=optimisticRef.current;optimisticRef.current=next;if(!enabled)return;if(!gridSyncTableIdentityStable(previous,next)){enqueue(async()=>{await closeGridSyncSession(previous.id).catch(()=>undefined);const status=await openGridSyncSession(next,identity.current.actorId);vectorRef.current=status.vectorClock;sendPresence(next.gridData?.activeSheetId);});return;}let operations:GridSyncOperation[];try{operations=deriveGridSyncOperations(previous,next);}catch(error){setLastError(error instanceof Error?error.message:'grid_collaboration_diff_failed');return;}if(!operations.length)return;enqueue(async()=>{for(const operation of operations){const response=await recordGridSyncOperation(next.id,operation);vectorRef.current=response.vectorClock;setConflictCount((count)=>count+response.report.conflicts.length);transportRef.current?.send({kind:'sync-node',documentId:next.id,senderSessionId:identity.current.sessionId,node:response.node});}});},[enabled,enqueue,sendPresence]);
  useEffect(()=>{optimisticRef.current=document;},[document]);useEffect(()=>()=>stop(),[stop]);
  return {actorId:identity.current.actorId,sessionId:identity.current.sessionId,available,enabled,connecting,peerCount,conflictCount,lastError,toggle,handleLocalDocumentUpdate,updatePresence:sendPresence};
}
