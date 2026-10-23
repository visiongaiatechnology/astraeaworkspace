// STATUS: DIAMANT VGT SUPREME — Writer Search, Outline, Clipboard & Version Orchestration
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Paragraph,
  WriterDocumentModel,
  WriterNamedVersion,
  WriterProtectionMode,
  WriterRevision,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import type { WriterDocumentData } from '../types';
import type { WriterHistoryCoalesceRequest } from '../editor/history/writerHistory';
import { addWriterClipboardEntry, normalizeWriterClipboardHistory, type WriterClipboardEntry } from './clipboard/writerClipboardHistory';
import { reorderWriterOutlineBlock } from '../navigation/writerNavigationEngine';
import {
  replaceWriterSearchMatches,
  replaceWriterSearchMatchesAtSelection,
  type WriterSearchMatch,
  type WriterSearchOptions,
} from './search/writerSearchEngine';
import { createMoveRevision, createParagraphTextRevision } from '../review/revisions/track-changes/writerTrackChangesEngine';
import { addWriterNamedVersion, createWriterNamedVersion, restoreWriterNamedVersion } from './versions/writerVersionsEngine';
import { canEditText } from '../security/protection/writerProtectionEngine';
import { securityPolicyForDocument } from '../../../platform/security/securityProfiles';

interface UseWriterProductivityStateProps {
  documentVersion: number;
  paragraphs: readonly Paragraph[];
  writerModel: WriterDocumentModel;
  revisions: readonly WriterRevision[];
  trackChangesActive: boolean;
  protectionMode: WriterProtectionMode;
  persistParagraphs: (paragraphs: Paragraph[], writerPatch?: Partial<WriterDocumentData>, coalesce?: WriterHistoryCoalesceRequest) => void;
  persistWriterData: (patch: Partial<WriterDocumentData>, coalesce?: WriterHistoryCoalesceRequest) => void;
  insertTextAtSelection: (text: string) => void;
  sessionHistory: readonly WorkspaceDocument[];
  currentDocument: WorkspaceDocument;
  currentHistoryIndex: number;
  commitDocument: (document: WorkspaceDocument, coalesce?: WriterHistoryCoalesceRequest) => void;
}

export interface WriterSessionVersionEntry {
  historyIndex: number;
  version: number;
  modifiedAt: number;
  current: boolean;
}

export interface WriterProductivityOperationResult {
  ok: boolean;
  message?: string;
}

export function useWriterProductivityState({
  documentVersion,
  paragraphs,
  writerModel,
  revisions,
  trackChangesActive,
  protectionMode,
  persistParagraphs,
  persistWriterData,
  insertTextAtSelection,
  sessionHistory,
  currentDocument,
  currentHistoryIndex,
  commitDocument,
}: UseWriterProductivityStateProps) {
  const namedVersions = writerModel.namedVersions ?? [];
  const [clipboardHistoryEnabled, setClipboardHistoryEnabledState] = useState(false);
  const [clipboardHistory, setClipboardHistory] = useState<WriterClipboardEntry[]>([]);
  const [productivityMessage, setProductivityMessage] = useState<string | null>(null);
  const topSecretClipboardBlocked = securityPolicyForDocument(currentDocument).profile === 'VGT_TOP_SECRET';

  useEffect(() => {
    if (!topSecretClipboardBlocked) return;
    setClipboardHistoryEnabledState(false);
    setClipboardHistory([]);
  }, [topSecretClipboardBlocked, currentDocument.id]);

  const setClipboardHistoryEnabled = useCallback((enabled: boolean) => {
    if (topSecretClipboardBlocked) {
      setClipboardHistoryEnabledState(false);
      setClipboardHistory([]);
      setProductivityMessage('Clipboard History ist für VGT Top Secret deaktiviert.');
      return;
    }
    setClipboardHistoryEnabledState(enabled);
  }, [topSecretClipboardBlocked]);

  const captureClipboardText = useCallback((text: string) => {
    if (topSecretClipboardBlocked || !clipboardHistoryEnabled || !text) return;
    setClipboardHistory((entries) => addWriterClipboardEntry(entries, text));
  }, [clipboardHistoryEnabled, topSecretClipboardBlocked]);

  const clearClipboardHistory = useCallback(() => {
    setClipboardHistory([]);
    setProductivityMessage(null);
  }, []);

  const insertClipboardEntry = useCallback((entryId: string) => {
    if (topSecretClipboardBlocked) {
      setProductivityMessage('Clipboard History ist für VGT Top Secret deaktiviert.');
      return;
    }
    if (!canEditText(protectionMode)) {
      setProductivityMessage('Der aktuelle Dokumentschutz erlaubt keine Texteingabe.');
      return;
    }
    const entry = clipboardHistory.find((item) => item.id === entryId);
    if (!entry) return;
    insertTextAtSelection(entry.text);
    setProductivityMessage('Zwischenablage-Eintrag eingefügt.');
  }, [clipboardHistory, insertTextAtSelection, protectionMode, topSecretClipboardBlocked]);

  const handleReplaceAllSearch = useCallback((query: string, replacement: string, options: WriterSearchOptions) => {
    if (!canEditText(protectionMode)) return { ok: false, message: 'Der aktuelle Dokumentschutz erlaubt keine Ersetzungen.' };
    const result = replaceWriterSearchMatches(paragraphs, query, replacement, options);
    if (result.error) return { ok: false, message: result.error };
    if (result.count === 0) return { ok: true, message: 'Keine Treffer ersetzt.' };

    const nextRevisions = [...revisions];
    if (trackChangesActive) {
      for (let index = 0; index < paragraphs.length; index += 1) {
        const before = paragraphs[index];
        const after = result.paragraphs[index];
        if (!before || !after || before === after) continue;
        const beforeText = before.spans.map((span) => span.text).join('');
        const afterText = after.spans.map((span) => span.text).join('');
        if (beforeText !== afterText) nextRevisions.push(createParagraphTextRevision(before, after, 'You', 'Suchen/Ersetzen'));
      }
    }
    persistParagraphs(result.paragraphs, trackChangesActive ? { revisions: nextRevisions } : undefined);
    return { ok: true, message: `${result.count} Treffer ersetzt.` };
  }, [paragraphs, persistParagraphs, protectionMode, revisions, trackChangesActive]);

  /**
   * Replaces **only the given matches**. The acceptance asks for "nur gewählte
   * Treffer ersetzen"; the document-wide path could not express that. Protection
   * mode, revision tracking and persistence behave exactly as in the replace-all
   * path, so a partially replaced document is as traceable as a fully replaced one.
   */
  const handleReplaceSelectedMatches = useCallback((
    matches: readonly WriterSearchMatch[],
    replacement: string,
  ) => {
    if (!canEditText(protectionMode)) return { ok: false, message: 'Der aktuelle Dokumentschutz erlaubt keine Ersetzungen.' };
    if (matches.length === 0) return { ok: true, message: 'Keine Treffer ausgewählt.' };
    const result = replaceWriterSearchMatchesAtSelection(paragraphs, matches, replacement);
    if (result.count === 0) {
      return {
        ok: true,
        message: result.skipped > 0
          ? 'Die ausgewählten Treffer passen nicht mehr zum Text und wurden nicht ersetzt.'
          : 'Keine Treffer ersetzt.',
      };
    }

    const nextRevisions = [...revisions];
    if (trackChangesActive) {
      for (let index = 0; index < paragraphs.length; index += 1) {
        const before = paragraphs[index];
        const after = result.paragraphs[index];
        if (!before || !after || before === after) continue;
        const beforeText = before.spans.map((span) => span.text).join('');
        const afterText = after.spans.map((span) => span.text).join('');
        if (beforeText !== afterText) nextRevisions.push(createParagraphTextRevision(before, after, 'You', 'Suchen/Ersetzen'));
      }
    }
    persistParagraphs(result.paragraphs, trackChangesActive ? { revisions: nextRevisions } : undefined);
    return {
      ok: true,
      message: result.skipped > 0
        ? `${result.count} Treffer ersetzt, ${result.skipped} übersprungen.`
        : `${result.count} Treffer ersetzt.`,
    };
  }, [paragraphs, persistParagraphs, protectionMode, revisions, trackChangesActive]);

  const handleReorderOutline = useCallback((sourceHeadingId: string, targetHeadingId: string) => {
    if (!canEditText(protectionMode)) return { ok: false, message: 'Der aktuelle Dokumentschutz erlaubt kein Outline-Reordering.' };
    try {
      const next = reorderWriterOutlineBlock(paragraphs, sourceHeadingId, targetHeadingId);
      const beforeOrder = paragraphs.map((paragraph) => paragraph.id);
      const afterOrder = next.map((paragraph) => paragraph.id);
      if (beforeOrder.every((id, index) => afterOrder[index] === id)) return { ok: true };
      const revisionPatch = trackChangesActive
        ? { revisions: [...revisions, createMoveRevision(sourceHeadingId, beforeOrder, afterOrder, 'You', 'Outline-Unterbaum verschoben')] }
        : undefined;
      persistParagraphs(next, revisionPatch);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Outline-Reordering fehlgeschlagen.' };
    }
  }, [paragraphs, persistParagraphs, protectionMode, revisions, trackChangesActive]);

  const createNamedVersion = useCallback((name: string): WriterProductivityOperationResult => {
    if (protectionMode !== 'none') return { ok: false, message: 'Benannte Versionen können nur im ungeschützten Vollzugriff erstellt werden.' };
    try {
      const version = createWriterNamedVersion({ name, paragraphs, writerData: writerModel, documentVersion });
      persistWriterData({ namedVersions: addWriterNamedVersion(namedVersions, version) });
      return { ok: true, message: `Version „${version.name}“ gespeichert.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Version konnte nicht erstellt werden.' };
    }
  }, [documentVersion, namedVersions, paragraphs, persistWriterData, protectionMode, writerModel]);

  const restoreNamedVersion = useCallback((versionId: string): WriterProductivityOperationResult => {
    if (protectionMode !== 'none' || trackChangesActive) {
      return { ok: false, message: 'Versionen können nur bei Vollzugriff und deaktiviertem Track Changes wiederhergestellt werden.' };
    }
    const version = namedVersions.find((item) => item.id === versionId);
    if (!version) return { ok: false, message: 'Version wurde nicht gefunden.' };
    const restored = restoreWriterNamedVersion(version, writerModel);
    persistParagraphs(restored.paragraphs, restored.writerData);
    return { ok: true, message: `Version „${version.name}“ wiederhergestellt.` };
  }, [namedVersions, persistParagraphs, protectionMode, trackChangesActive, writerModel]);

  const deleteNamedVersion = useCallback((versionId: string): WriterProductivityOperationResult => {
    if (protectionMode !== 'none') return { ok: false, message: 'Benannte Versionen können im geschützten Modus nicht gelöscht werden.' };
    const next = namedVersions.filter((item) => item.id !== versionId);
    if (next.length === namedVersions.length) return { ok: false, message: 'Version wurde nicht gefunden.' };
    persistWriterData({ namedVersions: next });
    return { ok: true, message: 'Benannte Version gelöscht.' };
  }, [namedVersions, persistWriterData, protectionMode]);

  const sessionVersions = useMemo<WriterSessionVersionEntry[]>(() => sessionHistory.map((snapshot, historyIndex) => ({
    historyIndex, version: snapshot.version, modifiedAt: snapshot.modified_at, current: historyIndex === currentHistoryIndex,
  })).reverse(), [currentHistoryIndex, sessionHistory]);

  const restoreSessionVersion = useCallback((historyIndex: number): WriterProductivityOperationResult => {
    if (protectionMode !== 'none' || trackChangesActive) {
      return { ok: false, message: 'Sitzungsversionen können nur bei Vollzugriff und deaktiviertem Track Changes wiederhergestellt werden.' };
    }
    const target = sessionHistory[historyIndex];
    if (!target) return { ok: false, message: 'Sitzungsversion wurde nicht gefunden.' };
    const restored = structuredClone(target);
    const targetWriterData = restored.writerData ?? writerModel;
    restored.writerData = {
      ...targetWriterData, namedVersions: writerModel.namedVersions,
      protectionMode: writerModel.protectionMode, protectionPasswordHash: writerModel.protectionPasswordHash,
    };
    restored.version = currentDocument.version + 1;
    restored.modified_at = Date.now();
    commitDocument(restored);
    return { ok: true, message: `Sitzungsversion v${target.version} wiederhergestellt.` };
  }, [commitDocument, currentDocument.version, protectionMode, sessionHistory, trackChangesActive, writerModel]);

  const safeClipboardHistory = useMemo(() => normalizeWriterClipboardHistory(clipboardHistory), [clipboardHistory]);

  return {
    namedVersions: namedVersions as WriterNamedVersion[],
    sessionVersions,
    restoreSessionVersion,
    clipboardHistoryEnabled,
    setClipboardHistoryEnabled,
    clipboardHistory: safeClipboardHistory,
    captureClipboardText,
    clearClipboardHistory,
    insertClipboardEntry,
    productivityMessage,
    setProductivityMessage,
    handleReplaceAllSearch,
    handleReplaceSelectedMatches,
    handleReorderOutline,
    createNamedVersion,
    restoreNamedVersion,
    deleteNamedVersion,
  };
}
