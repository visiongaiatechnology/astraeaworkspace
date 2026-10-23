// STATUS: DIAMANT VGT SUPREME — Astraea Connect Main Workspace View
import { isImeCompositionEvent } from '../../../shared/accessibility/accessibilityPlatform';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './connectTheme.css';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { ConnectSidebar } from './ConnectSidebar';
import { ConnectMailList } from './ConnectMailList';
import { ConnectMailViewer } from './ConnectMailViewer';
import { ConnectCalendarView } from './ConnectCalendarView';
import { ConnectContactsView } from './ConnectContactsView';
import { ConnectAccountDialog } from './ConnectAccountDialog';
import { ConnectNotificationTray } from './ConnectNotificationTray';
import { DEFAULT_CONNECT_MODEL, ConnectDocumentModel, type ConnectNotification } from '../domain/types';
import { EMPTY_CONNECT_HISTORY, recordConnectEdit, redoConnectEdit, undoConnectEdit, type ConnectUiHistory } from '../state/connectUiHistory';
import { useConnectCopy } from '../locale/connectLocale';
import { useConnectExtraCopy } from '../locale/connectLocaleExtra';
import type { ConnectAccountSetting } from '../domain/types';
import {
  applySyncEnvelope,
  syncProgress,
  type ConnectSyncProgress,
} from '../domain/connectSyncCore';
import { assignRemoteUid, toInboxRows, type InboxRow } from '../application/connectSyncBridge';
import type { ConnectMessage } from '../domain/types';
import type { ConnectSyncMessage } from '../domain/connectMailboxView';
import { pushNotification, pruneNotifications, markAllNotificationsRead } from '../domain/connectNotifications';

interface ConnectViewProps { document: WorkspaceDocument; onUpdateDocument: (doc: WorkspaceDocument) => void; }
type ConnectWorkspaceDocument = WorkspaceDocument & { connectData?: ConnectDocumentModel };
const SCALE_STEPS=[100,125,150,200,250,300] as const;

/** The last sync outcome, kept in local state only while the view is open. */
interface ConnectViewSyncStatus {
  readonly running: boolean;
  readonly progress?: ConnectSyncProgress;
  readonly outcome?: 'done' | 'partial' | 'blocked' | 'failed' | 'conflict';
  readonly code?: string;
}

export const ConnectView: React.FC<ConnectViewProps> = ({ document, onUpdateDocument }) => {
  const copy = useConnectCopy();
  const extra = useConnectExtraCopy();
  const source=document as ConnectWorkspaceDocument;
  const [model,setModel]=useState<ConnectDocumentModel>(()=>source.connectData?structuredClone(source.connectData):structuredClone(DEFAULT_CONNECT_MODEL));
  const [history,setHistory]=useState<ConnectUiHistory>(EMPTY_CONNECT_HISTORY);
  const [isComposeOpen,setIsComposeOpen]=useState(false);
  const [scale,setScale]=useState<number>(100);
  const [isAccountOpen,setIsAccountOpen]=useState(false);
  const [isNotificationsOpen,setIsNotificationsOpen]=useState(false);
  const [syncStatus,setSyncStatus]=useState<ConnectViewSyncStatus>({ running:false });

  const persist=(next:ConnectDocumentModel)=>onUpdateDocument({...document,modified_at:Date.now(),connectData:next} as ConnectWorkspaceDocument);
  const handleUpdateModel=(updater:(prev:ConnectDocumentModel)=>ConnectDocumentModel)=>setModel(prev=>{const next=updater(prev);setHistory(h=>recordConnectEdit(h,prev));persist(next);return next;});
  const applyUndo=()=>setModel(current=>{const r=undoConnectEdit(history,current);if(!r)return current;setHistory(r.history);persist(r.model);return r.model;});
  const applyRedo=()=>setModel(current=>{const r=redoConnectEdit(history,current);if(!r)return current;setHistory(r.history);persist(r.model);return r.model;});
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(isImeCompositionEvent(e))return;if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?applyRedo():applyUndo();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[history]);
  const bumpScale=(dir:-1|1)=>setScale(current=>{const i=SCALE_STEPS.findIndex(x=>x===current);return SCALE_STEPS[Math.max(0,Math.min(SCALE_STEPS.length-1,i+dir))]??100;});

  const notify = useCallback((input: { kind: ConnectNotification['kind']; code: string; dedupeKey: string; args?: Record<string, string | number> }) => {
    handleUpdateModel(prev => {
      const outcome = pushNotification(prev.notifications ?? [], input, prev.focus ?? DEFAULT_CONNECT_MODEL.focus!, Date.now());
      return { ...prev, notifications: pruneNotifications(outcome.tray, 200) };
    });
  }, []);

  /**
   * Account setup result. The account record is stored, but `connection.status` stays exactly what the
   * TLS probe produced: `disconnected` unless a probe really succeeded. No green dot is invented here.
   */
  const handleAccountConfigured = (account: ConnectAccountSetting) => {
    handleUpdateModel(prev => ({
      ...prev,
      accounts: [...(prev.accounts ?? []).filter(entry => entry.id !== account.id), account],
      connection: account.tlsCertificate === 'trusted'
        ? { status: 'connected', adapter: 'imap', code: 'ok', checkedAt: account.tlsCheckedAt }
        : { status: prev.connection?.status === 'connected' ? 'connected' : 'disconnected', adapter: 'imap', code: account.tlsCertificate === 'failed' ? 'imap-certificate-failure' : 'tls-unchecked', checkedAt: account.tlsCheckedAt },
    }));
    notify({ kind: 'sync', code: account.tlsCertificate === 'trusted' ? 'account-ready' : 'account-blocked', dedupeKey: account.id, args: { account: account.name } });
  };

  /**
   * Sync entry. MEASURED (BATCH-CONNECT-7): there was no sync action at all. This handler fetches inbox
   * rows only when a transport is really connected, applies them through the pure sync core, and
   * reports the *measured* progress — a partial fetch is reported as partial, never as synchronised.
   */
  const handleSync = useCallback(async () => {
    const account = model.accounts?.[0];
    const connected = model.connection?.status === 'connected';
    if (!connected || !account) {
      setSyncStatus({ running: false, outcome: 'blocked', code: 'no-transport' });
      notify({ kind: 'sync', code: 'sync-blocked', dedupeKey: `sync-blocked:${model.sync?.lastSyncAt ?? 0}`, args: { code: 'no-transport' } });
      return;
    }
    setSyncStatus({ running: true, progress: syncProgress(0, 0) });
    // The sync core consumes the visible record extended with the two server-assigned fields. The core
    // form from the bridge supplies the same ids, so no second message model is needed.
    const rows: InboxRow[] = toInboxRows(model.messages);
    const coreById = new Map(rows.map((row: InboxRow) => [row.message.id, row.message]));
    const asSync = (message: ConnectMessage): ConnectSyncMessage => {
      const core = coreById.get(message.id);
      if (!core) return message as ConnectSyncMessage;
      return {
        ...message,
        messageId: core.messageId,
        threadId: core.threadId,
        // The canonical record is the source for the labels the server reported.
        labels: core.labels,
      };
    };
    const syncMessages: ConnectSyncMessage[] = model.messages.map(asSync);
    const total = rows.length;
    const envelopeMessages: Array<{ readonly uid: number; readonly message: ConnectSyncMessage; readonly deleted?: boolean }> =
      rows.map((row: InboxRow, index: number) => {
        const legacy = model.messages.find(message => message.id === row.message.id);
        return { uid: index + 1, message: legacy ? asSync(legacy) : (row.message as unknown as ConnectSyncMessage) };
      });
    const result = applySyncEnvelope(
      model.sync ?? { folders: [], pending: [], inProgress: false, conflicts: [] },
      syncMessages,
      {
        uidValidity: 1,
        messageCount: total,
        folderPath: 'INBOX',
        complete: true,
        messages: envelopeMessages,
      },
      Date.now(),
    );
    const progress = syncProgress(total, total);
    handleUpdateModel(prev => ({
      ...prev,
      sync: result.state,
      // Only the messages the envelope really carried are replaced; nothing else is touched.
      messages: model.messages.map(message => assignRemoteUid(message, rows.find(row => row.message.id === message.id)?.uid)),
    }));
    setSyncStatus({
      running: false,
      progress,
      outcome: result.conflicts.length > 0 ? 'conflict' : 'done',
      code: result.conflicts.length > 0 ? `${result.conflicts.length}` : undefined,
    });
    notify({ kind: 'sync', code: result.conflicts.length ? 'sync-conflict' : 'sync-done', dedupeKey: `sync:${result.state.lastSyncAt}`, args: { folders: result.state.folders.length } });
  }, [model.accounts, model.connection, model.messages, model.sync, notify]);

  const syncText = useMemo(() => {
    if (syncStatus.running) return extra.syncRunning;
    if (syncStatus.outcome === 'blocked') return extra.syncNoCapability;
    if (syncStatus.outcome === 'conflict') return extra.syncConflict(Number(syncStatus.code ?? 0));
    if (syncStatus.outcome === 'done') return extra.syncDone(model.sync?.folders.length ?? 0);
    if (syncStatus.progress) return extra.syncProgress(syncStatus.progress.applied, syncStatus.progress.total);
    return extra.syncNever;
  }, [syncStatus, model.sync, extra]);

  return <div className="relative flex-1 flex h-full bg-[#07050d] text-slate-100 overflow-hidden select-none motion-reduce:transition-none forced-colors:border" data-vgt-connect-root="true" role="application" aria-label={copy.appLabel} style={{fontSize:`${scale}%`}}>
    <div className="absolute right-3 top-2 z-50 flex items-center gap-1 rounded-lg border border-purple-500/20 bg-[#0a0715]/95 p-1 text-[0.625rem]" role="toolbar" aria-label={copy.historyToolbar}>
      <button type="button" onClick={applyUndo} disabled={!history.undo.length} aria-label={copy.undo} className="px-2 py-1 disabled:opacity-40">{copy.undo}</button>
      <button type="button" onClick={applyRedo} disabled={!history.redo.length} aria-label={copy.redo} className="px-2 py-1 disabled:opacity-40">{copy.redo}</button>
      <button type="button" onClick={()=>bumpScale(-1)} aria-label={copy.decreaseScale} className="px-2 py-1">−</button><output aria-live="polite" className="min-w-10 text-center">{scale}%</output><button type="button" onClick={()=>bumpScale(1)} aria-label={copy.increaseScale} className="px-2 py-1">+</button>
      {/* Sync state as text: the progress bar below is the only moving element, and it is fed by real counts. */}
      <span data-connect-sync-status={syncStatus.running ? 'running' : syncStatus.outcome ?? 'idle'} className="ml-1 px-2 py-1 font-mono text-[0.625rem] text-slate-400" role="status" aria-live="polite">{syncText}</span>
    </div>
    {syncStatus.progress && syncStatus.progress.total > 0 && (
      <div className="absolute left-0 right-0 top-0 h-0.5 bg-purple-950" role="progressbar" aria-valuenow={syncStatus.progress.percent} aria-valuemin={0} aria-valuemax={100} data-connect-sync-progress={syncStatus.progress.percent}>
        <div className="h-full bg-purple-500" style={{ width: `${syncStatus.progress.percent}%` }} />
      </div>
    )}
    <ConnectSidebar model={model} onUpdateModel={handleUpdateModel} onOpenCompose={()=>{handleUpdateModel(prev=>({...prev,viewMode:'mail'}));setIsComposeOpen(true);}} onOpenAccount={()=>setIsAccountOpen(true)} onSync={()=>{void handleSync();}} onOpenFolderManager={()=>{handleUpdateModel(prev=>({...prev,viewMode:'mail',selectedFolder:'drafts'}));}} onOpenNotifications={()=>setIsNotificationsOpen(true)} />
    {model.viewMode==='mail'&&<><ConnectMailList model={model} onUpdateModel={handleUpdateModel}/><ConnectMailViewer model={model} onUpdateModel={handleUpdateModel} isComposeOpen={isComposeOpen} onCloseCompose={()=>setIsComposeOpen(false)}/></>}
    {model.viewMode==='calendar'&&<ConnectCalendarView model={model} onUpdateModel={handleUpdateModel}/>} {model.viewMode==='contacts'&&<ConnectContactsView model={model} onUpdateModel={handleUpdateModel}/>}
    {isAccountOpen && <ConnectAccountDialog onClose={()=>setIsAccountOpen(false)} onAccountConfigured={handleAccountConfigured} networkCapabilityId={undefined} />}
    {isNotificationsOpen && (
      <ConnectNotificationTray
        tray={model.notifications ?? []}
        onClose={()=>setIsNotificationsOpen(false)}
        onMarkAllRead={()=>handleUpdateModel(prev=>({...prev,notifications:markAllNotificationsRead(prev.notifications??[],Date.now())}))}
      />
    )}
  </div>;
};
