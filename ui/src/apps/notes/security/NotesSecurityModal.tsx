// STATUS: DIAMANT VGT SUPREME — Notes protection controls and encrypted .vnote export
import React, { useMemo, useState } from 'react';
import { Download, Lock, ShieldCheck, X } from 'lucide-react';
import type { NoteNotebook, NotePage, NoteProtectionPolicy, NoteSection } from '../../../shared/contracts/workspace';
import { packVnote } from '../interchange/container/notesVnoteContainer';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesExtendedText } from '../notesExtendedLocale';
import { deliverExportBytes } from '../../../shared/interchange/exportDelivery';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

type Target = 'notebook' | 'section' | 'page';
interface Props {
  isOpen: boolean;
  notebook: NoteNotebook | null;
  section: NoteSection | null;
  page: NotePage | null;
  isLocked: boolean;
  onSetPolicy: (notebookId: string, kind: Target, entityId: string, mode: 'none'|'workspace'|'additional-unlock', secret?: string, autoLockMinutes?: number) => Promise<void>;
  onUnlock: (kind: Target, id: string, policy: NoteProtectionPolicy | undefined, secret: string) => Promise<boolean>;
  onLockAll: () => void;
  onToggleSensitive: (notebookId: string, pageId: string, enabled: boolean) => void;
  onClose: () => void;
}

function safeFilename(value: string): string { return value.replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim().slice(0, 120) || 'Astraea-Notes'; }

export const NotesSecurityModal: React.FC<Props> = (props) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: string) => notesExtendedText(message, locale);
  const [target, setTarget] = useState<Target>('section');
  const [mode, setMode] = useState<'none'|'workspace'|'additional-unlock'>('workspace');
  const [secret, setSecret] = useState('');
  const [autoLock, setAutoLock] = useState(10);
  const [status, setStatus] = useState('');
  const targetEntity = useMemo(() => target === 'notebook' ? props.notebook : target === 'section' ? props.section : props.page, [target, props.notebook, props.section, props.page]);
  const dialogA11y = useNotesDialogA11y(props.isOpen, props.onClose);
  if (!props.isOpen) return null;
  const apply = async () => {
    if (!props.notebook || !targetEntity) return;
    try {
      if (mode === 'additional-unlock' && !secret) throw new Error(t('Additional unlock requires a secret.'));
      await props.onSetPolicy(props.notebook.id, target, targetEntity.id, mode, secret, autoLock);
      setStatus(`${t(targetLabel)} ${t('protection updated.')}`); setSecret('');
    } catch { setStatus(t('Protection update failed.')); }
  };
  const unlock = async () => {
    if (!targetEntity) return;
    const valid = await props.onUnlock(target, targetEntity.id, targetEntity.protection, secret);
    setStatus(valid ? `${t(targetLabel)} ${t('unlocked for this runtime.')}` : t('Unlock failed.'));
    if (valid) setSecret('');
  };
  const exportEncrypted = async () => {
    if (!props.notebook) return;
    try {
      if (secret.length < 8) throw new Error(t('Use at least 8 characters for portable .vnote encryption.'));
      const bytes = await packVnote([props.notebook], props.notebook.title, { password: secret });
      // Release Beta 0.1: native confirmation first; the browser fallback stays a download.
      const delivery = await deliverExportBytes(bytes, {
        suggestedName: `${safeFilename(props.notebook.title)}.vnote`,
        extensions: ['vnote'],
        mimeType: 'application/vnd.astraea.vnote',
      });
      setStatus(`${t('Encrypted .vnote exported through the authoritative Workspace container crypto.')} ${delivery.mode === 'file' ? `${delivery.fileName} saved.` : `Download started: ${delivery.fileName} (browser mode – no write confirmation).`}`);
      setSecret('');
    } catch (error) { setStatus(`${t('.vnote export failed.')} ${error instanceof Error ? error.message : ''}`.trim()); }
  };
  const targetLabel = target === 'notebook' ? 'Notebook' : target === 'section' ? 'Section' : 'Page';
  return <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Notes security')}>
    <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0d121c] shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/10"><div><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="w-4 h-4 text-emerald-300" />{t('Notes Security')}</div><div className="text-[0.625rem] text-slate-500">{t('Document crypto stays in Workspace Core. Notes stores only protection policy and unlock verifier metadata.')}</div></div><button aria-label={t('Close')} type="button" onClick={props.onClose} className="p-1.5 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button></div>
      <div className="p-4 space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 space-y-2"><div className="text-xs font-semibold flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-amber-300" />{t('Protection policy')}</div><div className="grid grid-cols-3 gap-2"><select value={target} onChange={(event) => setTarget(event.target.value as Target)} className="bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs"><option value="notebook">{t('Notebook')}</option><option value="section">{t('Section')}</option><option value="page">{t('Page')}</option></select><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="col-span-2 bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs"><option value="none">{t('No extra policy')}</option><option value="workspace">{t('Workspace container only')}</option><option value="additional-unlock">{t('Additional unlock')}</option></select></div><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={t('Unlock / portable export secret')} autoComplete="new-password" className="w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-xs" />{mode === 'additional-unlock' && <label className="flex items-center gap-2 text-[0.625rem] text-slate-400">{t('Auto-lock after')} <input type="number" min={1} max={240} value={autoLock} onChange={(event) => setAutoLock(Math.max(1, Math.min(240, Number(event.target.value) || 10)))} className="w-16 bg-slate-950 border border-white/10 rounded px-1 py-1" /> {t('minutes inactivity')}</label>}<div className="flex flex-wrap gap-2"><button type="button" onClick={apply} className="px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-[0.625rem] text-emerald-200">{t('Apply policy')}</button>{targetEntity?.protection?.mode === 'additional-unlock' && <button type="button" onClick={unlock} className="px-2 py-1 rounded border border-amber-500/20 bg-amber-500/10 text-[0.625rem] text-amber-200">{t('Unlock target')}</button>}<button type="button" onClick={props.onLockAll} className="px-2 py-1 rounded border border-white/10 text-[0.625rem] text-slate-400">{t('Lock all now')}</button></div></div>
        {props.page && props.notebook && <label className="rounded-xl border border-white/10 bg-white/[0.025] p-3 flex items-start gap-2 text-[0.6875rem] text-slate-300"><input type="checkbox" checked={Boolean(props.page.sensitiveMode)} onChange={(event) => props.onToggleSensitive(props.notebook!.id, props.page!.id, event.target.checked)} /><span><b>{t('Sensitive-note mode.')}</b> {t('Hide result snippets and visual previews/thumbnails where Notes renders summaries.')}</span></label>}
        <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.03] p-3 space-y-2"><div className="text-xs font-semibold">{t('Encrypted native .vnote')}</div><p className="text-[0.625rem] text-slate-500">{t('Exports the selected notebook through the same authenticated encrypted container implementation used by Workspace.')} {t('OCR, transcript data and attachments remain inside that encrypted container; Notes does not create a plaintext cache.')}</p><button type="button" onClick={exportEncrypted} disabled={!props.notebook} className="flex items-center gap-1.5 px-2 py-1 rounded border border-blue-500/20 bg-blue-500/10 text-[0.625rem] text-blue-200 disabled:opacity-40"><Download className="w-3 h-3" />{t('Export password-encrypted .vnote')}</button></div>
        <div className={`text-[0.625rem] rounded p-2 border ${props.isLocked ? 'border-amber-500/20 text-amber-300' : 'border-white/10 text-slate-500'}`}>{status || (props.isLocked ? 'Current page is locked. Unlock every protected ancestor required by its policy.' : 'Search uses an ephemeral in-memory index only. Locked pages are excluded before indexing.')}</div>
      </div>
    </div>
  </div>;
};
