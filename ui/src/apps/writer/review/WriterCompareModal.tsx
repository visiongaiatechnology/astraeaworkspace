// STATUS: DIAMANT VGT SUPREME — Stable-ID Workspace Compare & Multi-Reviewer Combine Modal
import React, { useMemo, useState } from 'react';
import { Check, GitCompare, Users, X } from 'lucide-react';
import type { Paragraph, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { TrackChangeRevision } from '../types';
import {
  combineReviewerDocuments,
  compareDocuments,
  type DocumentCompareResult,
  type WriterCombineResult,
} from './compare/writerDocumentCompare';

export interface WriterCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocumentId: string;
  currentParagraphs: readonly Paragraph[];
  workspaceDocuments: readonly WorkspaceDocument[];
  onApplyMergedRevisions: (
    mergedParagraphs: Paragraph[],
    generatedRevisions: TrackChangeRevision[],
  ) => void;
}

type CompareMode = 'compare' | 'combine';
type ReviewResult = DocumentCompareResult | WriterCombineResult;

function paragraphsFromDocument(document: WorkspaceDocument): Paragraph[] {
  const blockId = document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock');
  const object = blockId ? document.objects[blockId] : undefined;
  return object?.type === 'TextBlock' ? object.data.paragraphs : [];
}

function isCombineResult(result: ReviewResult): result is WriterCombineResult {
  return 'conflicts' in result;
}

export const WriterCompareModal: React.FC<WriterCompareModalProps> = ({
  isOpen,
  onClose,
  currentDocumentId,
  currentParagraphs,
  workspaceDocuments,
  onApplyMergedRevisions,
}) => {
  const [mode, setMode] = useState<CompareMode>('compare');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const candidateDocuments = useMemo(
    () => workspaceDocuments.filter((document) => document.kind === 'Writer' && document.id !== currentDocumentId),
    [currentDocumentId, workspaceDocuments],
  );

  if (!isOpen) return null;

  const selectedDocuments = candidateDocuments.filter((document) => selectedDocumentIds.includes(document.id));
  const canRun = mode === 'compare' ? selectedDocuments.length === 1 : selectedDocuments.length >= 2;

  const resetSelection = (nextMode: CompareMode) => {
    setMode(nextMode);
    setSelectedDocumentIds([]);
    setResult(null);
  };

  const toggleDocument = (documentId: string) => {
    setResult(null);
    setSelectedDocumentIds((current) => {
      if (mode === 'compare') return current[0] === documentId ? [] : [documentId];
      return current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId];
    });
  };

  const handleRun = () => {
    if (!canRun) return;
    if (mode === 'compare') {
      const comparisonDocument = selectedDocuments[0];
      if (!comparisonDocument) return;
      setResult(compareDocuments(
        currentParagraphs,
        paragraphsFromDocument(comparisonDocument),
        comparisonDocument.title || comparisonDocument.id,
      ));
      return;
    }

    setResult(combineReviewerDocuments(
      currentParagraphs,
      selectedDocuments.map((document) => ({
        reviewer: document.title || document.id,
        paragraphs: paragraphsFromDocument(document),
      })),
    ));
  };

  const handleApply = () => {
    if (!result) return;
    onApplyMergedRevisions(result.mergedParagraphs, result.generatedRevisions);
    onClose();
  };

  const conflicts = result && isCombineResult(result) ? result.conflicts : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <GitCompare className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-100">Dokumentvergleich & Reviewer Combine</h3>
          </div>
          <button aria-label="Close Dokumentvergleich & Reviewer Combine dialog" type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950/70 border border-white/10">
          <button
            type="button"
            onClick={() => resetSelection('compare')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold ${mode === 'compare' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Zwei Dokumente vergleichen
          </button>
          <button
            type="button"
            onClick={() => resetSelection('combine')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${mode === 'combine' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            <Users className="w-3.5 h-3.5" />
            Mehrere Reviewer kombinieren
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              {mode === 'compare' ? 'Überarbeitetes Writer-Dokument auswählen' : 'Mindestens zwei Reviewer-Dokumente auswählen'}
            </span>
            <span className="text-[0.6875rem] text-slate-500">Stable IDs · keine Textkopien · kein Last-Writer-Wins</span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {candidateDocuments.length === 0 && (
              <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-500">
                Keine weiteren Writer-Dokumente im Workspace verfügbar.
              </div>
            )}
            {candidateDocuments.map((document) => {
              const selected = selectedDocumentIds.includes(document.id);
              const paragraphCount = paragraphsFromDocument(document).length;
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => toggleDocument(document.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${selected ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-950/60 border-white/5 hover:border-white/15'}`}
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{document.title || 'Unbenanntes Writer-Dokument'}</div>
                    <div className="text-[0.625rem] text-slate-500 font-mono mt-0.5">{document.id}</div>
                  </div>
                  <div className="text-[0.6875rem] text-slate-400">{paragraphCount} Absätze</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] leading-relaxed text-slate-500">
            {mode === 'compare'
              ? 'Das aktuelle Dokument ist die Basis. Änderungen des ausgewählten Writer-Dokuments werden als Revisionen erzeugt.'
              : 'Jede Reviewer-Version wird unabhängig gegen dieselbe Basis verglichen. Widersprüchliche Änderungen bleiben als Konflikt offen.'}
          </p>
          <button
            type="button"
            disabled={!canRun}
            onClick={handleRun}
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white"
          >
            {mode === 'compare' ? 'Vergleich ausführen' : 'Reviewer kombinieren'}
          </button>
        </div>

        {result && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Ergebnis</span>
              <span className="font-mono text-blue-400 font-bold">{result.generatedRevisions.length} Revisionen</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-[0.6875rem] font-mono">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-300">+{result.stats.insertedCount} hinzugefügt</div>
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-300">−{result.stats.deletedCount} gelöscht</div>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-300">~{result.stats.modifiedCount} geändert</div>
              <div className="p-2 rounded-lg bg-slate-800/50 text-slate-400">={result.stats.identicalCount} gleich</div>
            </div>
            {conflicts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[0.6875rem] font-semibold text-amber-300">{conflicts.length} Konflikt(e) bleiben bewusst unverändert:</div>
                {conflicts.slice(0, 8).map((conflict) => (
                  <div key={`${conflict.paragraphId}-${conflict.reason}`} className="text-[0.625rem] text-slate-400 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2 py-1.5">
                    <span className="font-mono text-amber-200">{conflict.paragraphId}</span> · {conflict.reason} · {conflict.reviewers.join(', ')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white">Abbrechen</button>
          <button
            type="button"
            disabled={!result}
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-lg flex items-center space-x-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Revisionen übernehmen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
