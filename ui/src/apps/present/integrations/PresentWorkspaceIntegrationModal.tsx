// STATUS: DIAMANT VGT SUPREME — bounded cross-workspace object insertion for Present
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PresentObjectGeometry, PresentWorkspaceSceneObject, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { Link2, LockKeyhole, RefreshCw, Snowflake, X } from 'lucide-react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { PRESENT_WORKFLOW_COPY, presentWorkspaceFailureCopy } from '../locale/presentWorkflowLocale';
import { PRESENT_OFFICE_COPY } from '../locale/presentOfficeLocale';
import { VaultPickerModal } from '../../../shared/vault/picker/VaultPickerModal';
import {
  PRESENT_VAULT_PICKER_ACTION,
  PRESENT_VAULT_PICKER_APP,
  PRESENT_VAULT_PICKER_ENTRY_LABEL,
  resolvePresentVaultPickerEntry,
  resolvePresentVaultPickerOutcome,
} from './presentVaultPicker';
import {
  createPresentWorkspaceObject,
  listPresentWorkspaceIntegrationTargets,
  type PresentWorkspaceIntegrationTarget,
} from './presentWorkspaceIntegration';

interface Props {
  isOpen: boolean;
  sourceDocuments: readonly WorkspaceDocument[];
  existingObjects: readonly PresentObjectGeometry[];
  onClose: () => void;
  onInsert: (object: PresentWorkspaceSceneObject) => void;
  onOpenSource?: (documentId: string) => void;
}

const sourceKinds = new Set(['Grid', 'Tasks', 'Whiteboard', 'Draw', 'Writer', 'PdfStudio', 'Vault']);

export const PresentWorkspaceIntegrationModal: React.FC<Props> = ({ isOpen, sourceDocuments, existingObjects, onClose, onInsert, onOpenSource }) => {
  const { locale } = useWorkspaceLocale();
  const copy = PRESENT_WORKFLOW_COPY[locale].workspace;
  const integrationCopy = PRESENT_OFFICE_COPY[locale].workspaceIntegration;
  const eligible = useMemo(() => sourceDocuments.filter((document) => sourceKinds.has(document.kind)), [sourceDocuments]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<'Live' | 'Frozen'>('Live');
  const [error, setError] = useState<string | null>(null);
  /*
   * **AST-1226 — der Cross-App-Vault-Picker in Present.**
   *
   * Der Einstieg steht **hier**, weil dieser Dialog schon der Ort ist, an dem Present ein geschütztes
   * Workspace-Objekt wählt — ein zweiter Ort für dieselbe Wahl wäre ein zweiter Weg in dieselbe Sache.
   * Was fehlte, war der **autoritätsgefilterte** Weg: `VaultPickerModal` statt eines `<select>`, das
   * jede Vault-Datei anbietet.
   *
   * Gesperrt heißt: kein Einstieg. Namen verschlüsselter Assets darf auch ein Dialog nicht zeigen.
   */
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const vaultPickerEntryRef = useRef<HTMLButtonElement | null>(null);
  const vaultPickerWasOpen = useRef(false);
  const vaultPickerEntry = resolvePresentVaultPickerEntry(sourceDocuments);
  /*
   * Fokus-Rückgabe: der Picker übernimmt den Fokus. Diese Wirkung feuert **nur** nach einem echten
   * Schließen (`wasOpen`) — sonst würde sie beim Öffnen des Dialogs den Fokus stehlen.
   */
  useEffect(() => {
    if (vaultPickerOpen) { vaultPickerWasOpen.current = true; return; }
    if (!vaultPickerWasOpen.current) return;
    vaultPickerWasOpen.current = false;
    vaultPickerEntryRef.current?.focus();
  }, [vaultPickerOpen]);

  const source = eligible.find((document) => document.id === sourceId) ?? eligible[0];
  const targets = useMemo(() => source ? listPresentWorkspaceIntegrationTargets(source, locale) : [], [source, locale]);
  const target: PresentWorkspaceIntegrationTarget | undefined = targets.find((item) => item.id === targetId) ?? targets[0];

  if (!isOpen) return null;

  const insert = () => {
    setError(null);
    if (!source || !target) {
      setError(copy.compatibleSourceFailure);
      return;
    }
    try {
      onInsert(createPresentWorkspaceObject({
        sourceDocument: source,
        integrationKind: target.integrationKind,
        mode,
        sourceObjectId: target.sourceObjectId,
        sourceSelector: target.sourceSelector,
        title: `${source.title} · ${target.label}`,
      }, undefined, existingObjects));
      onClose();
    } catch (cause: unknown) {
      setError(presentWorkspaceFailureCopy(locale, cause));
    }
  };

  const targetLabel = (item: PresentWorkspaceIntegrationTarget): string => {
    if (item.integrationKind === 'task-list') return copy.taskList;
    if (item.integrationKind === 'task-kpi') return copy.taskKpi;
    if (item.integrationKind === 'grid-range' && item.label.endsWith(' · Range')) return `${item.label.slice(0, -' · Range'.length)} · ${copy.range}`;
    if (item.integrationKind === 'grid-kpi' && item.label.endsWith(' · KPI')) return `${item.label.slice(0, -' · KPI'.length)} · ${copy.kpi}`;
    if (item.integrationKind === 'pdf-page' && item.sourceSelector) {
      const separator = item.label.indexOf(' · ');
      const authoredTitle = separator >= 0 ? item.label.slice(separator + 3) : '';
      return authoredTitle ? `${copy.page(item.sourceSelector)} · ${authoredTitle}` : copy.page(item.sourceSelector);
    }
    return item.label;
  };

  const targetKindLabel = (item: PresentWorkspaceIntegrationTarget): string => {
    return integrationCopy.targetKinds[item.integrationKind] ?? item.integrationKind;
  };

  const sourceKindLabel = (kind: string): string => integrationCopy.sourceKinds[kind as keyof typeof integrationCopy.sourceKinds] ?? kind;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="present-workspace-dialog-title">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-cyan-500/20 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-300"><Link2 className="h-4 w-4" /><h2 id="present-workspace-dialog-title" className="text-sm font-bold break-words">{copy.title}</h2></div>
            <p className="mt-1 text-[0.6875rem] text-slate-500 break-words">{copy.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white" aria-label={copy.close}><X className="h-4 w-4" /></button>
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-3">
            <label className="block text-[0.625rem] uppercase tracking-wide text-slate-500">{copy.sourceDocument}
              <select
                value={source?.id ?? ''}
                onChange={(event) => { setSourceId(event.target.value); setTargetId(''); setError(null); }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              >
                {eligible.map((document) => <option key={document.id} value={document.id}>{sourceKindLabel(document.kind)} · {document.title}</option>)}
              </select>
            </label>
            <label className="block text-[0.625rem] uppercase tracking-wide text-slate-500">{copy.objectView}
              <select
                value={target?.id ?? ''}
                onChange={(event) => { setTargetId(event.target.value); setError(null); }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              >
                {targets.map((item) => <option key={item.id} value={item.id}>{targetLabel(item)}</option>)}
              </select>
            </label>
            {source?.kind === 'Vault' && (
              /*
               * **AST-1226 — der sichtbare Einstieg.** Ein gerendertes `<button>` mit
               * `data-vault-picker-entry` und `aria-label`. Gesperrt oder ohne Tresordokument ist er
               * **deaktiviert und benannt** — kein Knopf, der nichts tut.
               */
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03] p-2">
                <button
                  type="button"
                  ref={vaultPickerEntryRef}
                  data-vault-picker-entry="Present"
                  disabled={vaultPickerEntry.state !== 'ready'}
                  aria-label={PRESENT_VAULT_PICKER_ENTRY_LABEL}
                  title={vaultPickerEntry.state === 'locked'
                    ? 'The Vault session is locked. Unlock it in the Vault first — this entry then shows only what Present may open.'
                    : vaultPickerEntry.state === 'absent'
                      ? 'There is no Vault document in this workspace.'
                      : 'Pick through the Vault access authority instead of listing every file'}
                  onClick={() => setVaultPickerOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500/10"
                >
                  <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                  {PRESENT_VAULT_PICKER_ENTRY_LABEL}
                </button>
                <span className="text-[0.625rem] text-slate-500" role="status">
                  {vaultPickerEntry.state === 'ready'
                    ? 'Only assets Present may open are listed; withheld ones are counted, not shown.'
                    : vaultPickerEntry.state === 'locked'
                      ? 'Locked — the picker is therefore unavailable.'
                      : 'No Vault document in this workspace.'}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={copy.referenceMode}>
              <button type="button" onClick={() => setMode('Live')} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs ${mode === 'Live' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-slate-400'}`}><RefreshCw className="h-3.5 w-3.5" />{copy.live}</button>
              <button type="button" onClick={() => setMode('Frozen')} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs ${mode === 'Frozen' ? 'border-slate-500/50 bg-slate-700/30 text-slate-200' : 'border-white/10 text-slate-400'}`}><Snowflake className="h-3.5 w-3.5" />{copy.frozen}</button>
            </div>
            {source && onOpenSource && <button type="button" onClick={() => onOpenSource(source.id)} className="w-full whitespace-normal rounded-lg border border-white/10 px-3 py-2 text-[0.6875rem] text-slate-400 hover:bg-white/5 hover:text-white">{copy.openSource}</button>}
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            {source && target ? <>
              <div className="text-[0.625rem] uppercase tracking-wide text-slate-500">{copy.canonicalReference}</div>
              <div className="mt-1 text-sm font-semibold text-slate-100 break-words">{targetLabel(target)}</div>
              <dl className="mt-4 grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5 text-[0.625rem]">
                <dt className="text-slate-600">{copy.documentId}</dt><dd className="truncate font-mono text-slate-400">{source.id}</dd>
                <dt className="text-slate-600">{copy.version}</dt><dd className="font-mono text-slate-400">{source.version}</dd>
                <dt className="text-slate-600">{copy.kind}</dt><dd className="font-mono text-cyan-300">{targetKindLabel(target)}</dd>
                <dt className="text-slate-600">{copy.object}</dt><dd className="truncate font-mono text-slate-400">{target.sourceObjectId || '—'}</dd>
                <dt className="text-slate-600">{copy.selector}</dt><dd className="truncate font-mono text-slate-400">{target.sourceSelector || '—'}</dd>
                <dt className="text-slate-600">{copy.mode}</dt><dd className="font-mono text-slate-400">{mode === 'Live' ? copy.live : copy.frozen}</dd>
              </dl>
              <p className="mt-4 rounded-lg border border-amber-500/10 bg-amber-500/[0.04] p-2 text-[0.5625rem] leading-relaxed text-slate-500">{copy.liveNote}</p>
            </> : <div className="flex h-full min-h-44 items-center justify-center text-center text-xs text-slate-500">{copy.noTarget}</div>}
          </section>
        </div>

        {error && <div role="alert" className="mx-5 mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-[0.6875rem] text-rose-200 break-words">{error}</div>}
        <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5">{copy.cancel}</button>
          <button type="button" onClick={insert} disabled={!source || !target} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40">{copy.insert}</button>
        </footer>
      </div>

      {/*
        **Der geteilte Dialog, nicht ein zweiter.** `VaultPickerModal` filtert mit der Autorität;
        Present entscheidet nur, *welcher* Tresor und *welche* Anwendung. Die Wahl wird **erneut**
        geurteilt und in das Ziel übersetzt, das Present ohnehin kennt (aus `targets`, nicht aus einem
        hier nachgebauten `vault-asset:<id>`-Format).
      */}
      {vaultPickerOpen && (
        <VaultPickerModal
          isOpen
          requestingApp={PRESENT_VAULT_PICKER_APP}
          action={PRESENT_VAULT_PICKER_ACTION}
          title="Select a protected Vault asset for Present"
          files={vaultPickerEntry.state === 'ready' ? vaultPickerEntry.files : []}
          grants={vaultPickerEntry.state === 'ready' ? vaultPickerEntry.request.grants : []}
          onSelect={(candidate) => {
            if (vaultPickerEntry.state !== 'ready') { setVaultPickerOpen(false); return; }
            const outcome = resolvePresentVaultPickerOutcome(vaultPickerEntry, targets, candidate.fileId);
            setVaultPickerOpen(false);
            if (!outcome.ok) {
              setError(`The Vault access authority refused this selection (${outcome.reason}).`);
              return;
            }
            setError(null);
            setSourceId(outcome.selection.sourceDocumentId);
            setTargetId(outcome.selection.target.id);
          }}
          onCancel={() => setVaultPickerOpen(false)}
        />
      )}
    </div>
  );
};
