// STATUS: DIAMANT VGT SUPREME — Unified Writer workspace integration UI
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Layers, Link2, LockKeyhole, RefreshCw, X } from 'lucide-react';
import type {
  WorkspaceDocument,
  WriterWorkspaceEmbed,
  WriterWorkspaceEmbedKind,
  WriterWorkspaceEmbedMode,
} from '../../../../shared/contracts/workspace';
import type { TableBlockData } from '../../types';
import type { WriterWorkspaceSourceMetadata } from '../../types';
import { extractWriterTableFromGrid, WriterGridLinkError } from './writerGridLink';
import { projectWriterWorkspaceSourceCandidates } from '../workspace/writerGridSourceCatalog';
import { createWriterWorkspaceEmbed } from '../../public/workspace/writerWorkspaceIntegration';
import { WriterWorkspaceEmbedBlock } from '../workspace/WriterWorkspaceEmbedBlock';
import { VaultPickerModal } from '../../../../shared/vault/picker/VaultPickerModal';
import {
  resolveWriterVaultPickerEntry,
  resolveWriterVaultPickerOutcome,
  WRITER_VAULT_PICKER_ACTION,
  WRITER_VAULT_PICKER_APP,
  WRITER_VAULT_PICKER_ENTRY_LABEL,
} from '../vault/writerVaultPicker';

export interface WriterGridEmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTable: (table: TableBlockData) => void;
  onInsertWorkspaceEmbed: (embed: WriterWorkspaceEmbed) => void;
  writerDocument: WorkspaceDocument;
  anchorParagraphId: string;
  workspaceDocuments: readonly WorkspaceDocument[];
  storedWorkspaceDocuments?: readonly WriterWorkspaceSourceMetadata[];
  loadStoredWorkspaceDocument?: (documentId: string) => Promise<WorkspaceDocument | null>;
}

interface SelectOption { value: string; label: string }

function kindsForDocument(document?: WorkspaceDocument): Array<{ value: WriterWorkspaceEmbedKind; label: string }> {
  if (!document) return [];
  switch (document.kind) {
    case 'Writer': return [{ value: 'writer-local-chart', label: 'Diagramm aus lokaler Writer-Tabelle' }];
    case 'Grid': return [{ value: 'grid-range', label: 'Zelle / Range / Tabelle' }, { value: 'grid-chart', label: 'Diagramm' }];
    case 'Tasks': return [{ value: 'task-list', label: 'Task-Liste' }, { value: 'task-kpi', label: 'Task-KPI' }];
    case 'Whiteboard': case 'Draw': return [{ value: 'whiteboard-frame', label: 'Whiteboard-Frame' }];
    case 'Present': return [{ value: 'present-slide', label: 'Present-Slide' }];
    case 'PdfStudio': return [{ value: 'pdf-page', label: 'PDF-Seite' }, { value: 'pdf-annotation', label: 'PDF-Annotation' }];
    case 'Vault': return [{ value: 'vault-asset', label: 'Vault-Asset' }];
    default: return [];
  }
}

function objectOptions(document: WorkspaceDocument | undefined, kind: WriterWorkspaceEmbedKind): SelectOption[] {
  if (!document) return [];
  if (kind === 'writer-local-chart') return (document.writerData?.tables ?? []).map((table) => ({ value: table.id, label: table.caption || table.id }));
  if (kind === 'grid-range') return Object.entries(document.objects).flatMap(([id, object]) => object.type === 'Table' ? [{ value: id, label: document.gridData?.sheets.find((sheet) => sheet.tableObjectId === id)?.name ?? id }] : []);
  if (kind === 'grid-chart') return Object.entries(document.objects).flatMap(([id, object]) => object.type === 'Chart' ? [{ value: id, label: object.data.title || id }] : []);
  if (kind === 'whiteboard-frame') return (document.whiteboardData?.items ?? []).filter((item) => item.type === 'frame').map((item) => ({ value: item.id, label: item.name || item.text || item.id }));
  if (kind === 'present-slide') return (document.presentData?.slides ?? []).map((slide, index) => ({ value: slide.id, label: `${index + 1}. ${slide.title || 'Slide'}` }));
  if (kind === 'pdf-page') return (document.pdfData?.pages ?? []).map((page) => ({ value: String(page.pageNumber), label: `Seite ${page.pageNumber} · ${page.title}` }));
  if (kind === 'pdf-annotation') return (document.pdfData?.annotations ?? []).map((item) => ({ value: item.id, label: `Seite ${item.page} · ${item.type} · ${item.text.slice(0, 48)}` }));
  if (kind === 'vault-asset') return (document.vaultData?.files ?? []).map((file) => ({ value: file.id, label: `${file.name} · ${file.sourceType ?? 'asset'}` }));
  return [];
}

function selectorFor(kind: WriterWorkspaceEmbedKind, objectValue: string, range: string): { sourceObjectId?: string; sourceSelector?: string } {
  if (kind === 'writer-local-chart') return { sourceObjectId: objectValue };
  if (kind === 'grid-range') return { sourceObjectId: objectValue, sourceSelector: range };
  if (kind === 'pdf-page' || kind === 'pdf-annotation') return { sourceSelector: objectValue };
  if (['grid-chart', 'whiteboard-frame', 'present-slide', 'vault-asset'].includes(kind)) return { sourceObjectId: objectValue };
  return {};
}

export const WriterGridEmbedModal: React.FC<WriterGridEmbedModalProps> = ({
  isOpen, onClose, onInsertTable, onInsertWorkspaceEmbed,
  writerDocument, anchorParagraphId, workspaceDocuments, storedWorkspaceDocuments = [], loadStoredWorkspaceDocument,
}) => {
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [loadedStoredDocuments, setLoadedStoredDocuments] = useState<Record<string, WorkspaceDocument>>({});
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const pendingLoads = useRef(new Map<string, Promise<WorkspaceDocument | null>>());
  const sourceCandidates = useMemo(
    () => {
      const candidates = projectWriterWorkspaceSourceCandidates(writerDocument.id, workspaceDocuments, storedWorkspaceDocuments);
      if (writerDocument.writerData?.tables.length) {
        candidates.push({ id: writerDocument.id, kind: 'Writer', title: writerDocument.title, isOpen: true });
      }
      return candidates;
    },
    [storedWorkspaceDocuments, workspaceDocuments, writerDocument.id, writerDocument.title, writerDocument.writerData?.tables.length],
  );
  const selectedCandidate = sourceCandidates.find((candidate) => candidate.id === selectedDocumentId) ?? sourceCandidates[0];
  const activeSourceId = selectedCandidate?.id ?? '';
  const selectedDocument = workspaceDocuments.find((document) => document.id === activeSourceId)
    ?? loadedStoredDocuments[activeSourceId];

  useEffect(() => {
    if (!isOpen || !selectedCandidate || selectedCandidate.isOpen || loadedStoredDocuments[selectedCandidate.id]) return;
    if (!loadStoredWorkspaceDocument) {
      setSourceLoadError('Die gespeicherte Quelle kann nicht lokal geladen werden.');
      return;
    }
    let current = true;
    const candidate = selectedCandidate;
    setSourceLoadError(null);
    setLoadingSourceId(candidate.id);
    let request = pendingLoads.current.get(candidate.id);
    if (!request) {
      request = Promise.resolve()
        .then(() => loadStoredWorkspaceDocument(candidate.id))
        .finally(() => pendingLoads.current.delete(candidate.id));
      pendingLoads.current.set(candidate.id, request);
    }
    void request.then((document) => {
      if (!current) return;
      if (!document || document.id !== candidate.id || document.kind !== candidate.kind) {
        setSourceLoadError('Die gespeicherte Quelle ist nicht mehr verfügbar oder hat sich geändert.');
        return;
      }
      setLoadedStoredDocuments((previous) => ({ ...previous, [document.id]: document }));
    }).catch((error: unknown) => {
      if (!current) return;
      console.warn('[Writer] Stored workspace source could not be loaded:', error instanceof Error ? error.name : 'Error');
      setSourceLoadError('Die gespeicherte Quelle konnte nicht geladen werden.');
    }).finally(() => {
      if (current) setLoadingSourceId((activeId) => activeId === candidate.id ? null : activeId);
    });
    return () => { current = false; };
  }, [isOpen, loadStoredWorkspaceDocument, loadedStoredDocuments, selectedCandidate]);

  const availableKinds = kindsForDocument(selectedDocument);
  const [selectedKind, setSelectedKind] = useState<WriterWorkspaceEmbedKind>('grid-range');
  const effectiveKind = availableKinds.some((item) => item.value === selectedKind) ? selectedKind : availableKinds[0]?.value ?? 'grid-range';
  const [objectValue, setObjectValue] = useState('');
  const [range, setRange] = useState('A1:B10');
  const [mode, setMode] = useState<WriterWorkspaceEmbedMode>('Live');
  /** Why the last "insert as table" attempt did not happen (W-238). */
  const [insertError, setInsertError] = useState<string | null>(null);
  /*
   * **AST-1226 — der Cross-App-Vault-Picker in Writer.**
   *
   * Der Einstieg steht **hier**, weil dieser Dialog schon der Ort ist, an dem Writer ein
   * geschütztes Workspace-Objekt wählt (`kindsForDocument` kennt `Vault` → `vault-asset`). Ein
   * zweiter Ort für dieselbe Wahl wäre ein zweiter Weg in dieselbe Sache.
   *
   * Was hier **nicht** passiert: Filtern. `resolveWriterVaultPickerEntry` liefert die Dateien
   * ungefiltert und den typisierten Auftrag; das Urteil fällt `listVaultPickerCandidates` →
   * `evaluateVaultAccess` (shared). Gesperrt heißt: kein Einstieg, denn Namen verschlüsselter
   * Assets darf auch ein Dialog nicht zeigen.
   */
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const vaultPickerEntryRef = useRef<HTMLButtonElement | null>(null);
  const vaultPickerWasOpen = useRef(false);
  const vaultPickerEntry = resolveWriterVaultPickerEntry(workspaceDocuments);
  /*
   * Fokus-Rückgabe: der Picker übernimmt den Fokus; ohne diese Zeile landete er nach dem Schließen
   * am Dokumentanfang. Sie feuert **nur** nach einem echten Schließen (`wasOpen`), sonst würde sie
   * beim Öffnen des Dialogs den Fokus stehlen.
   */
  useEffect(() => {
    if (vaultPickerOpen) { vaultPickerWasOpen.current = true; return; }
    if (!vaultPickerWasOpen.current) return;
    vaultPickerWasOpen.current = false;
    vaultPickerEntryRef.current?.focus();
  }, [vaultPickerOpen]);
  const options = objectOptions(selectedDocument, effectiveKind);
  const effectiveObject = options.some((option) => option.value === objectValue) ? objectValue : options[0]?.value ?? '';
  const selector = selectorFor(effectiveKind, effectiveObject, range);

  const preview = useMemo(() => {
    if (!selectedDocument) return { embed: null as WriterWorkspaceEmbed | null, error: sourceLoadError };
    if (!anchorParagraphId) return { embed: null as WriterWorkspaceEmbed | null, error: 'Kein Absatzanker verfügbar.' };
    try {
      return { embed: createWriterWorkspaceEmbed({ writerDocument, sourceDocument: selectedDocument, kind: effectiveKind, mode, anchorParagraphId, ...selector, id: 'workspace-preview', now: 0 }), error: null as string | null };
    } catch (error: unknown) {
      return { embed: null, error: error instanceof Error ? error.message : 'Workspace-Referenz konnte nicht erstellt werden.' };
    }
  }, [anchorParagraphId, effectiveKind, mode, selectedDocument, selector.sourceObjectId, selector.sourceSelector, sourceLoadError, writerDocument]);

  if (!isOpen) return null;

  const handleDocumentChange = (value: string) => { setSelectedDocumentId(value); setObjectValue(''); setSourceLoadError(null); };
  const handleKindChange = (value: WriterWorkspaceEmbedKind) => { setSelectedKind(value); setObjectValue(''); };
  const handleInsertReference = () => {
    if (!selectedDocument || !preview.embed) return;
    try {
      // W-257: this call can throw (anchor gone, too many embeds, no snapshot provider) and used to
      // escape the click handler uncaught. The preview already reports such a reason; the click has
      // to do the same instead of failing silently in the console.
      onInsertWorkspaceEmbed(createWriterWorkspaceEmbed({ writerDocument, sourceDocument: selectedDocument, kind: effectiveKind, mode, anchorParagraphId, ...selector }));
      setInsertError(null);
      onClose();
    } catch (error: unknown) {
      setInsertError(error instanceof Error ? error.message : 'Workspace-Referenz konnte nicht erstellt werden.');
    }
  };
  const handleInsertGridTable = () => {
    if (!selectedDocument || selectedDocument.kind !== 'Grid' || effectiveKind !== 'grid-range' || !effectiveObject) return;
    try {
      onInsertTable(extractWriterTableFromGrid(selectedDocument, effectiveObject, range, mode === 'Live' ? 'Live' : 'Frozen', { anchorParagraphId }));
      setInsertError(null);
      onClose();
    } catch (error: unknown) {
      // W-238: a link error used to be swallowed, so an out-of-range or oversized range closed
      // nothing, inserted nothing and said nothing — the button simply appeared broken. The reason
      // is the whole point of the error, so it is shown.
      if (error instanceof WriterGridLinkError) { setInsertError(error.message); return; }
      throw error;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl space-y-4 rounded-2xl border border-cyan-500/25 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-cyan-300"/><div><h3 className="text-sm font-bold text-slate-100">Workspace-Objekt in Writer einbetten</h3><p className="text-[0.625rem] text-slate-400">Kanonische Referenzen · Live oder Snapshot · lokal und bounded</p></div></div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Dialog schließen"><X className="h-4 w-4"/></button>
        </div>

        {sourceCandidates.length === 0 ? <div className="rounded-xl border border-amber-400/30 bg-amber-950/40 p-4 text-sm text-amber-100">Keine kompatible Workspace-Quelle ist lokal gespeichert oder geöffnet.</div> : <>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-300"><span className="font-semibold">Quelldokument</span><select value={activeSourceId} onChange={(event) => handleDocumentChange(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-slate-100">{sourceCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} · {candidate.kind} · {candidate.isOpen ? 'geöffnet' : 'lokal gespeichert'}</option>)}</select></label>
            <label className="space-y-1 text-xs text-slate-300"><span className="font-semibold">Integration</span><select value={effectiveKind} onChange={(event) => handleKindChange(event.target.value as WriterWorkspaceEmbedKind)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-slate-100">{availableKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>

          {loadingSourceId === activeSourceId && <div className="rounded-lg border border-cyan-400/20 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100" role="status">Gespeicherte Quelle wird lokal geladen…</div>}
          {sourceLoadError && <div className="rounded-lg border border-amber-400/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100" role="alert">{sourceLoadError}</div>}

          {options.length > 0 && <label className="block space-y-1 text-xs text-slate-300"><span className="font-semibold">Objekt / View</span><select value={effectiveObject} onChange={(event) => setObjectValue(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-slate-100">{options.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}</select></label>}
          {effectiveKind === 'vault-asset' && (
            /*
             * **AST-1226 — der sichtbare Einstieg.** Ein gerendertes `<button>` mit
             * `data-vault-picker-entry` und `aria-label`; ein Handler allein wäre kein Einstieg.
             * Gesperrt oder ohne Tresordokument ist der Knopf **deaktiviert und benannt** — kein
             * Knopf, der nichts tut.
             */
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-2">
              <button
                type="button"
                ref={vaultPickerEntryRef}
                data-vault-picker-entry="Writer"
                disabled={vaultPickerEntry.state !== 'ready'}
                aria-label={WRITER_VAULT_PICKER_ENTRY_LABEL}
                title={vaultPickerEntry.state === 'locked'
                  ? 'Der Tresor ist gesperrt. Erst im Vault entsperren — der Picker zeigt dann nur, was Writer öffnen darf.'
                  : vaultPickerEntry.state === 'absent'
                    ? 'Es gibt kein Vault-Dokument in diesem Arbeitsbereich.'
                    : 'Gezielte Auswahl über die Zugriffsautorität des Tresors'}
                onClick={() => setVaultPickerOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500/10"
              >
                <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                {WRITER_VAULT_PICKER_ENTRY_LABEL}
              </button>
              <span className="text-[0.625rem] text-slate-500" role="status">
                {vaultPickerEntry.state === 'ready'
                  ? 'Öffnet den Picker: sichtbar ist nur, was Writer öffnen darf. Verweigertes wird gezählt, nicht gezeigt.'
                  : vaultPickerEntry.state === 'locked'
                    ? 'Gesperrt — die Auswahl ist deshalb nicht verfügbar.'
                    : 'Kein Vault-Dokument im Arbeitsbereich.'}
              </span>
            </div>
          )}
          {effectiveKind === 'grid-range' && <label className="block space-y-1 text-xs text-slate-300"><span className="font-semibold">A1-Bereich</span><input value={range} onChange={(event) => setRange(event.target.value.toUpperCase())} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-slate-100" spellCheck={false}/></label>}

          {insertError && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-100">{insertError}</div>}

          <div
            data-vgt-app-guide-anchor="Writer:embed-mode"
            role="group"
            aria-label="Darstellung des eingebetteten Objekts"
            className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-slate-950/80 p-1"
          >
            <button type="button" onClick={() => setMode('Live')} aria-pressed={mode === 'Live'} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${mode === 'Live' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}><RefreshCw className="h-3.5 w-3.5"/>Live verknüpft</button>
            <button type="button" onClick={() => setMode('Snapshot')} aria-pressed={mode === 'Snapshot'} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${mode === 'Snapshot' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5'}`}><Layers className="h-3.5 w-3.5"/>Snapshot</button>
          </div>

          {preview.error ? <div role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">{preview.error}</div> : preview.embed ? <div className="space-y-2 rounded-xl border border-cyan-500/15 bg-slate-950/60 p-3 text-xs">
            <div className="text-cyan-200 font-semibold">{preview.embed.title}</div>
            <div className="mt-1 text-[0.625rem] text-slate-500 font-mono break-all">{preview.embed.uri}</div>
            <div className="mt-2 text-[0.625rem] text-slate-400">Snapshot-Typ: {preview.embed.snapshot.type} · Quelle v{preview.embed.sourceVersion}</div>
            {/* W-261: the preview was computed and then thrown away — the dialog showed the title and
                the snapshot *type*, never the content the user is about to insert. The real block
                renders every snapshot kind, so the preview is the same view as the result and there is
                no second renderer to keep in step. `readOnly` keeps the delete button out of a dialog. */}
            <div className="max-h-96 overflow-auto rounded-xl border border-white/[0.06]" data-writer-workspace-embed-preview={preview.embed.id}>
              <WriterWorkspaceEmbedBlock embed={preview.embed} readOnly />
            </div>
          </div> : null}
        </>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/5">Abbrechen</button>
          {selectedDocument?.kind === 'Grid' && effectiveKind === 'grid-range' && <button type="button" onClick={handleInsertGridTable} disabled={!preview.embed} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><FileSpreadsheet className="inline h-3.5 w-3.5 mr-1"/>Als Writer-Tabelle</button>}
          <button type="button" onClick={handleInsertReference} disabled={!preview.embed} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40">{mode === 'Live' ? 'Live-Referenz einfügen' : 'Snapshot einfügen'}</button>
        </div>
      </div>

      {/*
        **Der geteilte Dialog, nicht ein zweiter.** `VaultPickerModal` filtert mit der Autorität;
        Writer entscheidet nur, *welcher* Tresor und *welche* Anwendung. Die Wahl geht als
        `fileId` in `objectValue` — dieselbe Zeile, die auch das Auswahlfeld setzt, und damit in
        **denselben** `createWriterWorkspaceEmbed`-Pfad wie jede andere Auswahl.
      */}
      {vaultPickerOpen && (
        <VaultPickerModal
          isOpen
          requestingApp={WRITER_VAULT_PICKER_APP}
          action={WRITER_VAULT_PICKER_ACTION}
          title="Vault-Asset für Writer wählen"
          files={vaultPickerEntry.state === 'ready' ? vaultPickerEntry.files : []}
          grants={vaultPickerEntry.state === 'ready' ? vaultPickerEntry.request.grants : []}
          onSelect={(candidate) => {
            /*
             * **Erneutes Urteil an der Anwendungsgrenze.** Der Picker urteilt beim Bestätigen schon
             * selbst; Writer verlässt sich trotzdem nicht darauf, dass der Rückruf nur aus dem
             * eigenen Dialog kommt. Eine Ablehnung wird **benannt** statt verschluckt.
             */
            if (vaultPickerEntry.state !== 'ready') { setVaultPickerOpen(false); return; }
            const outcome = resolveWriterVaultPickerOutcome(vaultPickerEntry, candidate.fileId);
            setVaultPickerOpen(false);
            if (!outcome.ok) {
              setInsertError(`Die Zugriffsautorität hat diese Auswahl abgelehnt (${outcome.reason}).`);
              return;
            }
            setInsertError(null);
            setObjectValue(outcome.fileId);
          }}
          onCancel={() => setVaultPickerOpen(false)}
        />
      )}
    </div>
  );
};
