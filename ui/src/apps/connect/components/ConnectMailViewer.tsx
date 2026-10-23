// STATUS: DIAMANT VGT SUPREME — Astraea Connect Message Viewer
import React, { useMemo, useState } from 'react';
import { ShieldCheck, Reply, ReplyAll, Forward, Trash2, Paperclip, Send, Clock, Info, FileText } from 'lucide-react';
import type { ConnectDocumentModel, ConnectMessage } from '../domain/types';
import { queueCompose } from '../application/connectUiBridge';
import { resolveConnectDeliveryState, type ConnectDeliveryState } from '../domain/connectDeliveryState';
import { CONNECT_QUEUE_FOLDER } from '../domain/connectMailboxView';
import { mayRenderStoredClaim } from '../domain/connectClaims';
import { connectThreadMessages, normalizedThreadSubject } from '../domain/connectThreadProjection';
import { seedComposeDraft, validateComposeDraft, composeSecurityNote, type ConnectComposeDraft, type ConnectComposeMode } from '../domain/connectComposeCore';
import { ConnectReplyError } from '../domain/connectReplyCore';
import { useConnectCopy } from '../locale/connectLocale';
import { connectSignatureStatus } from '../locale/connectLocale';
import { useConnectExtraCopy } from '../locale/connectLocaleExtra';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';

interface ConnectMailViewerProps {
  model: ConnectDocumentModel;
  onUpdateModel: (updater: (prev: ConnectDocumentModel) => ConnectDocumentModel) => void;
  isComposeOpen: boolean;
  onCloseCompose: () => void;
}

/** The identity used for reply self-exclusion. A configured account wins; the legacy value is the fallback. */
const SELF_ADDRESS_FALLBACK = 'engineer@vgt.internal';

export const ConnectMailViewer: React.FC<ConnectMailViewerProps> = ({
  model,
  onUpdateModel,
  isComposeOpen,
  onCloseCompose,
}) => {
  const copy = useConnectCopy();
  const extra = useConnectExtraCopy();
  const { locale } = useWorkspaceLocale();
  const { messages, selectedMessageId } = model;
  const selectedMsg = messages.find(m => m.id === selectedMessageId);
  const threadMessages = useMemo(() => selectedMsg ? connectThreadMessages(messages, selectedMsg) : [], [messages, selectedMsg]);
  const activeMsg = threadMessages.at(-1) ?? selectedMsg;
  const [expandedThreadMessages, setExpandedThreadMessages] = useState<Set<string>>(new Set());

  // Compose State
  const [composeMode, setComposeMode] = useState<ConnectComposeMode>('new');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeError, setComposeError] = useState('');
  // Truthful, text-only notice about what the compose action actually produced.
  const [composeNotice, setComposeNotice] = useState('');
  const selfAddress = model.accounts?.[0]?.address ?? SELF_ADDRESS_FALLBACK;

  /**
   * MEASURED (BATCH-CONNECT-7): the reply and forward buttons at lines 191/197 of the previous version
   * had no handler at all. They now seed a real draft with RFC 5322 headers through
   * `domain/connectComposeCore.ts`, and a message without a usable Message-ID produces a visible
   * refusal instead of an empty form.
   */
  const openSeededCompose = (mode: ConnectComposeMode) => {
    if (!activeMsg) return;
    try {
      const seed = seedComposeDraft({ mode, message: activeMsg, selfAddress });
      setComposeMode(seed.mode);
      setComposeTo(seed.to);
      setComposeCc(seed.cc);
      setComposeSubject(seed.subject);
      setComposeBody(seed.body);
      setComposeError('');
      setComposeNotice('');
    } catch (error) {
      if (error instanceof ConnectReplyError) setComposeError(extra.replyNotPossible);
      else setComposeError(copy.composeError);
      setComposeNotice('');
      setComposeMode(mode);
      setComposeTo('');
      setComposeCc('');
      setComposeSubject('');
      setComposeBody('');
    }
  };

  const currentDraft = (): ConnectComposeDraft => ({
    mode: composeMode, to: composeTo, cc: composeCc, subject: composeSubject, body: composeBody,
    inReplyTo: '', references: [], attachments: [],
  });

  /** Queue the message. The visible notice names exactly what happened — queueing, not sending. */
  const handleQueueCompose = () => {
    const validation = validateComposeDraft(currentDraft());
    if (!validation.ok) {
      setComposeError(`${copy.composeError} (${validation.code})`);
      return;
    }
    try {
      const queued = queueCompose(composeTo, composeSubject, composeBody);
      const resolution = resolveConnectDeliveryState({ queued: true, encrypted: false, transportConnected: false });
      const state: ConnectDeliveryState = resolution.delivery;
      setComposeError('');
      const newMsg: ConnectMessage = {
        id: `msg-${Date.now()}`,
        messageId: `<msg-${Date.now()}@astraea.local>`,
        threadId: `subject:${normalizedThreadSubject(composeSubject)}`,
        sender: 'Me (Sovereign Node)',
        senderEmail: selfAddress,
        recipients: composeTo.split(',').map(entry => entry.trim()).filter(Boolean),
        cc: composeCc.split(',').map(entry => entry.trim()).filter(Boolean),
        subject: composeSubject,
        snippet: composeBody.slice(0, 80),
        body: composeBody,
        timestamp: Date.now(),
        folder: 'sent',
        delivery: state,
        isUnread: false,
        isStarred: false,
        isEncrypted: resolution.encryptedForReal,
      };
      onUpdateModel(prev => ({
        ...prev,
        messages: [newMsg, ...prev.messages],
        selectedMessageId: newMsg.id,
        selectedFolder: CONNECT_QUEUE_FOLDER,
      }));
      setComposeNotice(`${copy.queuedNotice} ${copy.queuedReleaseAt(new Date(queued.releaseAt).toLocaleTimeString(locale))}`);
      setComposeTo(''); setComposeCc(''); setComposeSubject(''); setComposeBody('');
      onCloseCompose();
    } catch {
      setComposeError(copy.composeError);
    }
  };

  /**
   * Save as draft: the message is stored in the drafts folder with NO delivery state, because nothing
   * was queued and nothing was sent. This is the distinction the compose surface used to lack.
   */
  const handleSaveDraft = () => {
    const validation = validateComposeDraft(currentDraft());
    if (!validation.ok) {
      setComposeError(`${copy.composeError} (${validation.code})`);
      return;
    }
    const draftMsg: ConnectMessage = {
      id: `draft-${Date.now()}`,
      messageId: `<draft-${Date.now()}@astraea.local>`,
      sender: 'Me (Sovereign Node)',
      senderEmail: selfAddress,
      recipients: composeTo.split(',').map(entry => entry.trim()).filter(Boolean),
      cc: composeCc.split(',').map(entry => entry.trim()).filter(Boolean),
      subject: composeSubject,
      snippet: composeBody.slice(0, 80),
      body: composeBody,
      timestamp: Date.now(),
      folder: 'drafts',
      isUnread: false,
      isStarred: false,
      isEncrypted: false,
    };
    onUpdateModel(prev => ({ ...prev, messages: [draftMsg, ...prev.messages], selectedMessageId: draftMsg.id, selectedFolder: 'drafts' }));
    setComposeError('');
    setComposeNotice(extra.draftSaved);
    setComposeTo(''); setComposeCc(''); setComposeSubject(''); setComposeBody('');
    onCloseCompose();
  };

  const securityNote = composeSecurityNote(false, false);

  if (isComposeOpen) {
    return (
      <div className="flex-1 flex flex-col bg-[#07050d] p-6 text-slate-200 select-none overflow-y-auto">
        <div className="max-w-2xl w-full mx-auto space-y-4 rounded-xl border border-purple-500/30 bg-[#0e0a1b] p-6 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-purple-500/20">
            <h3 className="text-sm font-bold text-purple-200">{copy.composeTitle}</h3>
            <span data-connect-encryption-state={securityNote.encryption === 'none' ? 'none' : 'in-process'} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.625rem] bg-amber-950 text-amber-300 border border-amber-500/30 font-mono">
              <Info className="w-3 h-3" />
              {copy.composeEncryptionNote}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {composeError && <div role="alert" className="rounded border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-rose-200">{composeError}</div>}
            {composeNotice && (
              <div role="status" data-connect-delivery-notice="queued" className="flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-amber-200">
                <Info className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{composeNotice}</span>
              </div>
            )}
            <div>
              <label className="text-slate-400 block mb-1">{copy.recipientLabel}</label>
              <input
                type="text"
                aria-label={copy.recipientLabel}
                value={composeTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComposeTo(e.target.value)}
                placeholder={copy.recipientPlaceholder}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100"
              />
            </div>

            {/* Cc is required for a correct reply-all, so it is a visible field. */}
            <div>
              <label className="text-slate-400 block mb-1">Cc</label>
              <input
                type="text"
                data-connect-compose-field="cc"
                aria-label="Cc"
                value={composeCc}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComposeCc(e.target.value)}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">{copy.subjectLabel}</label>
              <input
                type="text"
                aria-label={copy.subjectLabel}
                value={composeSubject}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setComposeSubject(e.target.value)}
                placeholder={copy.subjectPlaceholder}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg px-3 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">{copy.bodyLabel}</label>
              <textarea
                rows={8}
                data-vgt-app-guide-anchor="Connect:second"
                aria-label={copy.bodyLabel}
                value={composeBody}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComposeBody(e.target.value)}
                placeholder={copy.bodyPlaceholder}
                className="w-full bg-[#150f24] border border-purple-500/30 rounded-lg p-3 text-slate-100 font-sans"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-purple-500/20">
            <p data-connect-compose-note="queue-only" className="flex items-start gap-1.5 text-[0.625rem] text-amber-300">
              <Info className="mt-0.5 w-3 h-3 shrink-0" aria-hidden="true" />
              {extra.composeUnsentNote}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onCloseCompose} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200">
                {copy.cancel}
              </button>
              <button
                type="button"
                data-connect-compose-save-draft="true"
                onClick={handleSaveDraft}
                className="px-3 py-1.5 rounded-lg border border-purple-500/40 text-xs text-purple-200 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                {extra.saveDraft}
              </button>
              <button
                type="button"
                data-connect-compose-queue="true"
                onClick={handleQueueCompose}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-900/30 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{copy.queueSend}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!activeMsg) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs select-none">
        {copy.selectMessage}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#07050d] text-slate-200 select-none overflow-y-auto">
      {/* Message Header */}
      <div className="p-6 border-b border-purple-500/20 bg-[#0a0715]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 className="text-base font-bold text-white leading-snug">
            {activeMsg.subject}
          </h2>
          <div className="flex items-center gap-1.5">
            {/* MEASURED before BATCH-CONNECT-7: these three buttons had no handler at all. */}
            <button 
              onClick={() => openSeededCompose('reply')}
              data-connect-action="reply"
              className="p-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/40 text-slate-300 hover:text-white transition-colors" 
              title={copy.reply} aria-label={copy.reply}
            >
              <Reply className="w-4 h-4" />
            </button>
            <button 
              onClick={() => openSeededCompose('reply-all')}
              data-connect-action="reply-all"
              className="p-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/40 text-slate-300 hover:text-white transition-colors" 
              title={extra.replyAll} aria-label={extra.replyAll}
            >
              <ReplyAll className="w-4 h-4" />
            </button>
            <button 
              onClick={() => openSeededCompose('forward')}
              data-connect-action="forward"
              className="p-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/40 text-slate-300 hover:text-white transition-colors" 
              title={copy.forward} aria-label={copy.forward}
            >
              <Forward className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                onUpdateModel(prev => ({
                  ...prev,
                  messages: prev.messages.filter(m => m.id !== activeMsg.id),
                  selectedMessageId: null,
                }));
              }}
              data-connect-action="delete"
              className="p-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors" 
              title={copy.delete} aria-label={copy.delete}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center font-bold text-purple-300 text-xs">
              {activeMsg.sender.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-slate-200">{activeMsg.sender}</div>
              <div className="text-[0.6875rem] text-slate-400 font-mono">{activeMsg.senderEmail}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono text-[0.6875rem] text-slate-400">
              {new Date(activeMsg.timestamp).toLocaleString(locale)}
            </div>
            <div className="mt-1 flex flex-col items-end gap-1">
              {/* GAP-0057, Runde 295: ueber den Zusage-Resolver statt per Feldvergleich. */}
              {mayRenderStoredClaim(activeMsg, 'queued') && (
                <span data-connect-delivery-state="queued" className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[0.625rem] font-black text-amber-200">
                  <Clock className="w-3 h-3" />
                  {copy.queuedMessage}
                </span>
              )}
              {/*
                GAP-0057, Runde 295: hier stand `activeMsg.isEncrypted &&`, und
                darunter `activeMsg.signatureStatus === 'verified' &&`. Beide
                Zusagen hingen an nackten Feldern. Der Zusage-Resolver des Moduls
                (`domain/connectClaims.ts`) existierte genau dafuer und hatte
                NULL Verbraucher. Jetzt entscheidet er, und er verlangt die
                Evidenz: `webcrypto-ciphertext-created` fuer die Verschluesselung
                und `openpgp-signature-verified` fuer die Signatur. In diesem
                Build erzeugt KEINE Operation sie — also erscheint keine der
                beiden Zusagen mehr.
              */}
              {mayRenderStoredClaim(activeMsg, 'encrypted') && (
                <span className="inline-flex items-center gap-1 text-[0.625rem] text-emerald-400 font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  {copy.encryptedMessage}
                </span>
              )}
              {mayRenderStoredClaim(activeMsg, 'key-verified') && (
                <span className="inline-flex items-center gap-1 text-[0.625rem] text-emerald-400 font-bold">
                  <ShieldCheck className="w-3 h-3" />
                  {copy.verifiedSignature(activeMsg.signatureKind?.toUpperCase() ?? '')}
                </span>
              )}
              {(activeMsg.signatureStatus === 'invalid' || activeMsg.signatureStatus === 'expired' || activeMsg.signatureStatus === 'not-yet-valid') && (
                <span role="alert" className="inline-flex items-center gap-1 rounded border border-rose-500/50 bg-rose-950/60 px-2 py-1 text-[0.625rem] font-black text-rose-200">
                  {copy.invalidSignature(connectSignatureStatus(locale, activeMsg.signatureStatus))}
                </span>
              )}
              {(!activeMsg.signatureStatus || activeMsg.signatureStatus === 'unknown' || activeMsg.signatureStatus === 'unsigned') && (
                <span className="text-[0.625rem] font-medium text-amber-300">{copy.signatureNotVerified}</span>
              )}
            </div>
          </div>
        </div>

        {/* Attachments bar */}
        {activeMsg.attachments && activeMsg.attachments.length > 0 && (
          <div className="mt-4 pt-3 border-t border-purple-500/15 flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[0.6875rem] text-slate-400">{copy.attachments}</span>
            {activeMsg.attachments.map((att, i) => (
              <div key={i} className="px-2 py-1 rounded bg-purple-950/50 border border-purple-500/30 text-[0.6875rem] font-mono text-purple-200">
                {att.name} ({att.sizeKb} KB)
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thread compact history: only the newest message is expanded by default. */}
      {threadMessages.length > 1 && <section className="border-b border-purple-500/15 bg-[#090611] px-6 py-3" aria-label={copy.threadMessages(threadMessages.length)} data-connect-thread-compact="true">
        <div className="mb-2 text-[0.625rem] uppercase tracking-wider text-slate-500">{copy.threadSummary(threadMessages.length)} · {copy.olderRepliesCollapsed}</div>
        <div className="space-y-1.5">{threadMessages.slice(0,-1).map((message) => { const expanded=expandedThreadMessages.has(message.id); return <article key={message.id} className="rounded-lg border border-white/[0.07] bg-white/[0.025]"><button type="button" aria-expanded={expanded} aria-label={`${message.sender} · ${message.subject} · ${copy.olderRepliesCollapsed}`} onClick={()=>setExpandedThreadMessages(current=>{const next=new Set(current);expanded?next.delete(message.id):next.add(message.id);return next;})} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"><span className="min-w-0 truncate text-[0.6875rem] font-semibold text-slate-300">{message.sender} · {message.subject}</span><span className="shrink-0 font-mono text-[0.5625rem] text-slate-500">{new Date(message.timestamp).toLocaleString(locale)}</span></button>{expanded&&<div className="border-t border-white/[0.06] px-3 py-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap select-text">{message.body}</div>}</article>;})}</div>
      </section>}
      {/* Newest message stays fully expanded. */}
      <div className="p-6 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans select-text" data-connect-thread-latest="expanded">
        {activeMsg.body}
      </div>
    </div>
  );
};
