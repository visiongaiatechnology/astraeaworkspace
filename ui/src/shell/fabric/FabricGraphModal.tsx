import React, { useMemo, useState } from 'react';
import { Share2, ArrowRight, Table2, Presentation, FileText, X } from 'lucide-react';
import { buildExternalClipboardPayload, viewFabricChanges, type FabricLink, type FabricTransferChoice } from '../../shared/workspace-interaction/fabric';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { fabricDocumentKindLabel, fabricGraphCopy } from '../i18n/fabricGraphLocale';
import { requestDropPolicyDecision } from '../../platform/native/nativePolicy';
import {
  assessFabricWorkspaceDrop,
  createFabricWorkspaceObjectDragPayload,
  FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
  resolveFabricWorkspaceDrop,
} from './fabricGraphWorkspaceDrop';

interface FabricGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  links: FabricLink[];
  documents: Record<string, WorkspaceDocument>;
  activeDocumentId: string;
  onOpenSource: (link: FabricLink) => void;
  onRefresh: (link: FabricLink) => void;
  onFreeze: (link: FabricLink) => void;
  onBreakLink: (link: FabricLink) => void;
  onRelink: (link: FabricLink, sourceDocumentId: string, sourceObjectId: string) => void;
  onInsertFromWorkspace: (sourceDocumentId: string, sourceObjectId: string, choice: FabricTransferChoice) => void;
}

function statusClasses(status: FabricLink['status']): string {
  switch (status) {
    case 'current': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
    case 'changed': return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
    case 'frozen': return 'bg-sky-500/10 text-sky-300 border-sky-500/25';
    case 'permission-lost': return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
    case 'unavailable': return 'bg-orange-500/10 text-orange-300 border-orange-500/25';
    case 'broken': return 'bg-red-500/10 text-red-300 border-red-500/25';
  }
}

export const FabricGraphModal: React.FC<FabricGraphModalProps> = ({
  isOpen,
  onClose,
  links,
  documents,
  activeDocumentId,
  onOpenSource,
  onRefresh,
  onFreeze,
  onBreakLink,
  onRelink,
  onInsertFromWorkspace,
}) => {
  const { locale } = useWorkspaceLocale();
  const copy = fabricGraphCopy(locale);
  const [sourceDocumentId, setSourceDocumentId] = useState('');
  const [sourceObjectId, setSourceObjectId] = useState('');
  const [pendingDrop, setPendingDrop] = useState<{ documentId: string; objectId: string } | null>(null);
  const [dropError, setDropError] = useState(false);
  const [changeViewKey, setChangeViewKey] = useState<string | null>(null);

  const sourceDocuments = useMemo(
    () => Object.values(documents).filter((document) => document.id !== activeDocumentId),
    [documents, activeDocumentId],
  );
  const selectedSource = documents[sourceDocumentId];
  const sourceObjects = selectedSource ? Object.values(selectedSource.objects) : [];
  const activeDocument = documents[activeDocumentId];
  const chosenSource = pendingDrop ?? (sourceDocumentId && sourceObjectId ? { documentId: sourceDocumentId, objectId: sourceObjectId } : null);

  if (!isOpen) return null;

  // Async, because the policy authority is a native call. The resolver refuses a drop that arrives without a
  // real decision (`drop_policy_decision_required`), so obtaining one here is what makes a legitimate drop
  // possible at all; the helper answers `Deny` with a named reason when the authority is unreachable.
  const executeInsert = async (choice: FabricTransferChoice) => {
    if (!chosenSource) return;
    if (pendingDrop) {
      const source = documents[chosenSource.documentId];
      const object = source?.objects[chosenSource.objectId];
      const payload = source && object ? createFabricWorkspaceObjectDragPayload(source, object) : null;
      const intent = choice === 'LiveLink' ? 'LIVE_REFERENCE' : 'COPY';
      const decision = payload ? await requestDropPolicyDecision(activeDocumentId) : undefined;
      const result = payload
        ? resolveFabricWorkspaceDrop(payload, activeDocumentId, documents, intent, undefined, decision)
        : { status: 'rejected' as const };
      if (result.status !== 'resolved') {
        setDropError(true);
        setPendingDrop(null);
        return;
      }
    }
    setDropError(false);
    onInsertFromWorkspace(chosenSource.documentId, chosenSource.objectId, choice);
    setPendingDrop(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={copy.closeDialog} className="relative w-full max-w-4xl rounded-2xl glass-dropdown p-6 shadow-2xl border border-purple-500/25 z-10 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-purple-500/15">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>Astraea Workspace Fabric</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25 font-mono">{copy.badge}</span>
              </h3>
              <p className="text-xs text-slate-400">{copy.description}</p>
            </div>
          </div>
          <button aria-label={copy.closeDialog} onClick={onClose} className="p-1.5 rounded-lg hover:bg-purple-500/15 text-slate-400 hover:text-purple-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-5 overflow-y-auto flex-1">
          <div className="p-3.5 rounded-xl bg-purple-950/[0.15] border border-purple-500/20 text-xs text-purple-200/90 leading-relaxed">
            {copy.introLead} <code className="text-purple-300 font-mono">vgt://workspace/document/.../object/...</code>{copy.introTail}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">{copy.insertTitle}</span>
                <span className="text-[11px] text-slate-500">{copy.targetLabel} {activeDocument?.title ?? copy.noActiveDocument}</span>
              </div>
              <span className="text-[10px] text-slate-500">{activeDocument?.kind === 'Writer' ? copy.writerTargetHelp : copy.otherTargetHelp}</span>
            </div>

            <div
              className="rounded-xl border border-dashed border-purple-500/30 bg-black/20 p-3 space-y-3"
              onDragOver={(event) => {
                if (Array.from(event.dataTransfer.types).includes(FABRIC_WORKSPACE_OBJECT_DRAG_MIME)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={async (event) => {
                const raw = event.dataTransfer.getData(FABRIC_WORKSPACE_OBJECT_DRAG_MIME);
                if (!raw) return;
                event.preventDefault();
                event.stopPropagation();
                // Same reason as in `executeInsert`: without a decision the resolver refuses, so the drop
                // could never be accepted however legitimate it was.
                const policyDecision = await requestDropPolicyDecision(activeDocumentId);
                const result = assessFabricWorkspaceDrop(raw, activeDocumentId, documents, policyDecision);
                // **W-442 behoben (Runde 229) ✗✓:** Hier stand `if (result.status === 'needsChoice' && result.choices[0])`
                // und nahm **stillschweigend `choices[0]`** ✗ — bei mehreren möglichen Quellen legte der Dialog damit
                // die **erste** ab, und der Nutzer erfuhr nicht, dass es eine Wahl gab ✓.
                //
                // **Die Unterscheidung, die den Fall löst ✓:** Eine „Wahl" aus **genau einer** Quelle ist **keine
                // Wahl** ✓ — sie ist eine Tatsache ✓, und sie zu nehmen ist richtig ✓. Eine Wahl aus **mehreren** ist
                // eine Entscheidung des Nutzers ✓ — und Stillschweigen ist dort ein Defekt ✗, kein Komfort ✓.
                //
                // **Deshalb:** Bei mehreren Quellen wird **nichts** abgelegt ✓ und der Fehlerfall **sichtbar** ✓.
                // *Die sichtbare Auswahl ist der vollständige Fix und steht als benannter nächster Schritt ✗; das
                // Ablegen der falschen Quelle ist der Schaden, und der ist hier beendet* ✓.
                if (result.status === 'accepted') {
                  setPendingDrop({ documentId: result.selection.sourceDocumentId, objectId: result.selection.sourceObjectId });
                  setDropError(false);
                } else if (result.status === 'needsChoice' && result.choices.length === 1 && result.choices[0]) {
                  // Genau **eine** Quelle: keine Wahl, keine Frage ✓.
                  setPendingDrop({ documentId: result.choices[0].sourceDocumentId, objectId: result.choices[0].sourceObjectId });
                  setDropError(false);
                } else {
                  // **Mehrere Quellen** ✓ oder **kein angenommenes Ziel** ✓ — nichts wird stillschweigend abgelegt ✗.
                  setPendingDrop(null);
                  setDropError(true);
                }
              }}
              aria-label={activeDocument?.kind === 'Writer' ? copy.writerDropTarget : copy.otherDropTarget}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  aria-label={copy.chooseSourceDocument}
                  value={sourceDocumentId}
                  onChange={(event) => { setSourceDocumentId(event.target.value); setSourceObjectId(''); setPendingDrop(null); setDropError(false); }}
                  className="bg-slate-950/80 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-200"
                >
                  <option value="">{copy.chooseSourceDocument}</option>
                  {sourceDocuments.map((document) => <option key={document.id} value={document.id}>{document.title} · {fabricDocumentKindLabel(document.kind)}</option>)}
                </select>
                <select
                  aria-label={copy.chooseSourceObject}
                  value={sourceObjectId}
                  disabled={!selectedSource}
                  onChange={(event) => { setSourceObjectId(event.target.value); setPendingDrop(null); setDropError(false); }}
                  className="bg-slate-950/80 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-200 disabled:opacity-40"
                >
                  <option value="">{copy.chooseSourceObject}</option>
                  {sourceObjects.map((object) => <option key={object.data.id} value={object.data.id}>{copy.objectType[object.type]} · {object.data.id}</option>)}
                </select>
              </div>

              {selectedSource && sourceObjects.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {sourceObjects.slice(0, 12).map((object) => (
                    <button
                      key={object.data.id}
                      draggable={selectedSource.kind === 'Grid' && object.type === 'Table' && activeDocument?.kind === 'Writer'}
                      onDragStart={(event) => {
                        const payload = createFabricWorkspaceObjectDragPayload(selectedSource, object);
                        if (!payload) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.setData(FABRIC_WORKSPACE_OBJECT_DRAG_MIME, payload);
                        const external = buildExternalClipboardPayload(`${object.type}: ${object.data.id}`);
                        for (const representation of external.representations) event.dataTransfer.setData(representation.mime, representation.text);
                        event.dataTransfer.effectAllowed = 'copyLink';
                      }}
                      onClick={() => { setSourceObjectId(object.data.id); setPendingDrop(null); setDropError(false); }}
                      className="shrink-0 px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] hover:bg-purple-500/10 text-[10px] text-slate-400 hover:text-purple-200"
                      title={copy.dragObject}
                    >
                      {copy.objectType[object.type]}: {object.data.id}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 rounded-lg bg-purple-950/20 border border-purple-500/15 p-2.5">
                <div className="text-[11px] text-slate-400 min-w-0">
                  {chosenSource ? (
                    <>{copy.selected} <span className="font-mono text-purple-300">{chosenSource.documentId}/{chosenSource.objectId}</span></>
                  ) : copy.selectPrompt}
                  {dropError && <span role="status" aria-live="polite" className="block text-rose-300">{copy.dropError}</span>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button disabled={!chosenSource} onClick={() => executeInsert('LiveLink')} className="px-2.5 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/30 text-purple-200 text-[11px] disabled:opacity-35">{copy.transfer.LiveLink}</button>
                  <button disabled={!chosenSource} onClick={() => executeInsert('PasteCopy')} className="px-2.5 py-1.5 rounded-lg bg-slate-700/40 hover:bg-slate-700/60 border border-white/10 text-slate-200 text-[11px] disabled:opacity-35">{copy.transfer.PasteCopy}</button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">{copy.activeLinks(links.length)}</span>
            {links.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 rounded-xl bg-black/20 border border-purple-500/15">
                {copy.noLinks}
              </div>
            ) : (
              <div className="space-y-2">
                {links.map((link) => {
                  const srcDoc = documents[link.sourceDocId];
                  const tgtDoc = documents[link.targetDocId];
                  const canRefresh = link.mode === 'Live';
                  const canRelink = Boolean(chosenSource) && link.targetDocId === activeDocumentId;
                  return (
                    <div key={`${link.targetDocId}:${link.targetRefId}`} className="p-3 rounded-xl bg-purple-950/[0.12] border border-purple-500/15 space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-2 min-w-0">
                          <Table2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-200 block truncate">{srcDoc ? srcDoc.title : link.sourceDocId || copy.brokenSource}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate block">{copy.objectLabel} {link.sourceObjId || copy.unresolvedObject}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center px-2 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${statusClasses(link.status)}`}>{copy.mode[link.mode]} · {copy.status[link.status]}</span>
                          <span className="text-[9px] text-slate-500 mt-1">v{link.resolvedSourceVersion ?? '?'} → v{link.sourceVersion ?? '?'}</span>
                          <ArrowRight className="w-4 h-4 text-purple-400 mt-0.5" />
                        </div>
                        <div className="flex items-center space-x-2 text-right min-w-0">
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-200 block truncate">{tgtDoc ? tgtDoc.title : link.targetDocId}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate block">{copy.referenceLabel} {link.targetRefId}</span>
                          </div>
                          {tgtDoc?.kind === 'Present' ? <Presentation className="w-4 h-4 text-amber-400 shrink-0" /> : <FileText className="w-4 h-4 text-blue-400 shrink-0" />}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
                        <button onClick={() => onOpenSource(link)} className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] text-slate-300">{copy.action.openSource}</button>
                        <button disabled={!canRefresh} onClick={() => onRefresh(link)} className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] text-slate-300 disabled:opacity-30">{copy.action.refresh}</button>
                        <button onClick={() => setChangeViewKey((current) => current === `${link.targetDocId}:${link.targetRefId}` ? null : `${link.targetDocId}:${link.targetRefId}`)} className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] text-slate-300">{copy.action.viewChanges}</button>
                        <button disabled={link.mode === 'Frozen'} onClick={() => onFreeze(link)} className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] text-slate-300 disabled:opacity-30">{copy.action.freeze}</button>
                        <button onClick={() => onBreakLink(link)} className="px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[10px] text-red-200">{copy.action.breakLink}</button>
                        <button
                          disabled={!canRelink}
                          onClick={() => chosenSource && onRelink(link, chosenSource.documentId, chosenSource.objectId)}
                          className="px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] text-purple-200 disabled:opacity-30"
                        >
                          {copy.action.relink}
                        </button>
                      </div>
                      {changeViewKey === `${link.targetDocId}:${link.targetRefId}` && (() => {
                        const change = viewFabricChanges(documents, link.targetDocId, link.targetRefId);
                        return <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[10px] text-slate-400">{copy.resolvedSourceVersion} <span className="font-mono text-slate-200">{change.fromVersion ?? '?'}</span> → {copy.currentVersion.toLowerCase()} <span className="font-mono text-slate-200">{change.toVersion ?? '?'}</span> · {copy.statusLabel.toLowerCase()} <span className="text-purple-300">{copy.status[change.status]}</span>{change.typeChanged ? ` · ${copy.semanticTypeChanged.toLowerCase()}` : ''}</div>;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="pt-3 border-t border-purple-500/15 flex justify-between items-center gap-3">
          <span className="text-[10px] text-slate-500">{copy.noNetworkRetrieval}</span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-200 border border-purple-500/20 text-xs font-medium transition-colors">{copy.closeFabric}</button>
        </div>
      </div>
    </div>
  );
};
