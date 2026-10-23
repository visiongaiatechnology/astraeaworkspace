import React, { useEffect, useMemo, useState } from 'react';
import { FileOutput, FolderKanban, LockKeyhole, Network, X } from 'lucide-react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../locale/pdfWorkflowDialogsLocale';

interface PdfWorkspaceIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: WorkspaceDocument;
  workspaceDocuments: WorkspaceDocument[];
  onCreatePdfFromSource: (sourceDocumentId: string) => string;
  onAnnotationsToTasks: (targetDocumentId?: string) => string;
  onPagesToWorkspace: (pageNumbers: number[], kind: 'Present' | 'Notes' | 'Whiteboard') => string;
  onProtectInVault: (targetDocumentId: string) => Promise<string>;
}

class PageSelectionError extends Error {
  constructor(readonly copyKey: 'integration.error.range' | 'integration.error.page' | 'integration.error.maxPages' | 'integration.error.selectPage') {
    super(copyKey);
  }
}

function parsePages(input: string, maxPage: number): number[] {
  const values = new Set<number>();
  for (const rawToken of input.split(',')) {
    const token = rawToken.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > maxPage || to - from > 499) throw new PageSelectionError('integration.error.range');
      for (let page = from; page <= to; page += 1) values.add(page);
    } else {
      const page = Number(token);
      if (!Number.isInteger(page) || page < 1 || page > maxPage) throw new PageSelectionError('integration.error.page');
      values.add(page);
    }
    if (values.size > 500) throw new PageSelectionError('integration.error.maxPages');
  }
  if (!values.size) throw new PageSelectionError('integration.error.selectPage');
  return [...values].sort((a, b) => a - b);
}

export const PdfWorkspaceIntegrationModal: React.FC<PdfWorkspaceIntegrationModalProps> = ({
  isOpen,
  onClose,
  source,
  workspaceDocuments,
  onCreatePdfFromSource,
  onAnnotationsToTasks,
  onPagesToWorkspace,
  onProtectInVault,
}) => {
  const { locale } = useWorkspaceLocale();
  const [sourceId, setSourceId] = useState('');
  const [taskTargetId, setTaskTargetId] = useState('');
  const [pageInput, setPageInput] = useState('1');
  const [pageKind, setPageKind] = useState<'Present' | 'Notes' | 'Whiteboard'>('Present');
  const [vaultTargetId, setVaultTargetId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const sourceTargets = useMemo(() => workspaceDocuments.filter((doc) => ['Writer', 'Grid', 'Present'].includes(doc.kind)), [workspaceDocuments]);
  const taskTargets = useMemo(() => workspaceDocuments.filter((doc) => doc.kind === 'Tasks'), [workspaceDocuments]);
  const vaultTargets = useMemo(() => workspaceDocuments.filter((doc) => doc.kind === 'Vault'), [workspaceDocuments]);

  useEffect(() => {
    if (!isOpen) return;
    setSourceId(sourceTargets[0]?.id ?? '');
    setTaskTargetId(taskTargets[0]?.id ?? '');
    setVaultTargetId(vaultTargets[0]?.id ?? '');
    setPageInput(source.pdfData?.pages.length ? '1' : '');
    setStatus('');
  }, [isOpen, source.pdfData?.pages.length, sourceTargets, taskTargets, vaultTargets]);

  if (!isOpen) return null;

  const run = async (action: () => string | Promise<string>, successKey: PdfWorkflowCopyKey, values: Readonly<Record<string, string | number>> | (() => Readonly<Record<string, string | number>>) = {}) => {
    setBusy(true);
    setStatus('');
    try {
      await action();
      setStatus(pdfWorkflowText(locale, successKey, typeof values === 'function' ? values() : values));
    } catch (error) {
      const copyKey = error instanceof PageSelectionError ? error.copyKey : 'integration.error.generic';
      setStatus(pdfWorkflowText(locale, copyKey));
    }
    finally { setBusy(false); }
  };

  const selectClass = 'w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/60';
  const buttonClass = 'rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-label={pdfWorkflowText(locale, 'integration.title')} className="vgt-dialog-scroll-surface max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-500/20 bg-slate-950/95 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-400" />
            <div><h3 className="text-sm font-bold text-white">{pdfWorkflowText(locale, 'integration.title')}</h3><p className="text-[0.6875rem] text-slate-500">{pdfWorkflowText(locale, 'integration.subtitle')}</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={pdfWorkflowText(locale, 'integration.close')}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><FileOutput className="h-4 w-4 text-cyan-400" />{pdfWorkflowText(locale, 'integration.source.heading')}</div>
            <p className="text-[0.6875rem] text-slate-500">{pdfWorkflowText(locale, 'integration.source.help')}</p>
            <select aria-label={pdfWorkflowText(locale, 'integration.source.select')} value={sourceId} onChange={(event) => setSourceId(event.target.value)} className={selectClass}><option value="">{pdfWorkflowText(locale, 'integration.source.select')}</option>{sourceTargets.map((doc) => <option key={doc.id} value={doc.id}>{doc.kind} · {doc.title}</option>)}</select>
            <button type="button" disabled={!sourceId || busy} className={buttonClass} onClick={() => void run(() => onCreatePdfFromSource(sourceId), 'integration.success.pdf')}>{pdfWorkflowText(locale, 'integration.source.create')}</button>
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><FolderKanban className="h-4 w-4 text-cyan-400" />{pdfWorkflowText(locale, 'integration.tasks.heading')}</div>
            <p className="text-[0.6875rem] text-slate-500">{pdfWorkflowText(locale, 'integration.tasks.help')}</p>
            <select aria-label={pdfWorkflowText(locale, 'integration.tasks.heading')} value={taskTargetId} onChange={(event) => setTaskTargetId(event.target.value)} className={selectClass}><option value="">{pdfWorkflowText(locale, 'integration.tasks.new')}</option>{taskTargets.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select>
            <button type="button" disabled={busy || !(source.pdfData?.annotations.length)} className={buttonClass} onClick={() => void run(() => onAnnotationsToTasks(taskTargetId || undefined), 'integration.success.tasks')}>{pdfWorkflowText(locale, 'integration.tasks.create')}</button>
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="text-xs font-semibold text-slate-200">{pdfWorkflowText(locale, 'integration.pages.heading')}</div>
            <p className="text-[0.6875rem] text-slate-500">{pdfWorkflowText(locale, 'integration.pages.help')}</p>
            <div className="grid grid-cols-[1fr_auto] gap-2"><input aria-label={pdfWorkflowText(locale, 'integration.pages.input')} value={pageInput} onChange={(event) => setPageInput(event.target.value)} className={selectClass} placeholder="1,3-5" /><select aria-label={pdfWorkflowText(locale, 'integration.pages.kind')} value={pageKind} onChange={(event) => setPageKind(event.target.value as typeof pageKind)} className={selectClass}><option>Present</option><option>Notes</option><option>Whiteboard</option></select></div>
            <button type="button" disabled={busy || !pageInput.trim()} className={buttonClass} onClick={() => {
              let selectedPageCount = 0;
              void run(() => {
                const pages = parsePages(pageInput, source.pdfData?.pages.length ?? 0);
                selectedPageCount = pages.length;
                return onPagesToWorkspace(pages, pageKind);
              }, 'integration.success.pages', () => ({ count: selectedPageCount, kind: pageKind }));
            }}>{pdfWorkflowText(locale, 'integration.pages.create')}</button>
          </section>

          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><LockKeyhole className="h-4 w-4 text-emerald-400" />Vault</div>
            <div className="space-y-2"><select aria-label={pdfWorkflowText(locale, 'integration.vault.select')} value={vaultTargetId} onChange={(event) => setVaultTargetId(event.target.value)} className={selectClass}><option value="">{pdfWorkflowText(locale, 'integration.vault.select')}</option>{vaultTargets.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select><button type="button" disabled={busy || !vaultTargetId} className={buttonClass} onClick={() => void run(() => onProtectInVault(vaultTargetId), 'integration.success.vault')}>{pdfWorkflowText(locale, 'integration.vault.protect')}</button></div>
          </section>


        </div>

        {status && <div role="status" aria-live="polite" className="mx-5 mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.6875rem] text-slate-300">{status}</div>}
      </div>
    </div>
  );
};
