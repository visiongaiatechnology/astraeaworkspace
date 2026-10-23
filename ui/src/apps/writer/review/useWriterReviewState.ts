// STATUS: DIAMANT VGT SUPREME — Sovereign Review & Collaboration State Hook
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Paragraph,
  WorkspaceDocument,
  WriterPageSetupConfig,
  WriterSectionDefinition,
  WriterStyleCatalog,
} from '../../../shared/contracts/workspace';
import type {
  ReviewMode,
  ReviewerFilter,
  TableBlockData,
  TrackChangeRevision,
  WriterDocumentData,
  WriterProtectionMode,
  WriterRevisionType,
} from '../types';
import {
  combineReviewerDocuments,
  compareDocuments,
  type ReviewerDocumentInput,
} from './compare/writerDocumentCompare';
import { acceptAllRevisions, acceptRevision, boundWriterRevisionRegister, sortWriterRevisionsNewestFirst } from './revisions/track-changes/writerTrackChangesEngine';
import { revertWriterRevision, type WriterRevisionDocumentState } from './revisions/writerRevisionRevertEngine';
import { projectWriterReviewPresentation } from './presentation/writerReviewPresentation';
import {
  canEditText,
  canManageRevisions,
  hashProtectionPassword,
  isLegacyProtectionHash,
  requiresTrackedChanges,
  verifyProtectionPassword,
} from '../security/protection/writerProtectionEngine';

export interface UseWriterReviewStateProps {
  paragraphs: Paragraph[];
  revisions: TrackChangeRevision[];
  tables: TableBlockData[];
  pageSetup: WriterPageSetupConfig;
  sections: WriterSectionDefinition[];
  styleCatalog: WriterStyleCatalog;
  currentTheme?: string;
  initialReviewMode?: ReviewMode;
  initialTrackChangesActive?: boolean;
  initialProtectionMode?: WriterProtectionMode;
  initialProtectionPasswordHash?: string;
  persistParagraphs: (newParagraphs: Paragraph[], writerPatch?: Partial<WriterDocumentData>) => void;
  persistWriterData: (patch: Partial<WriterDocumentData>) => void;
}

function paragraphsFromDocument(document: WorkspaceDocument): Paragraph[] {
  const blockId = document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock');
  const object = blockId ? document.objects[blockId] : undefined;
  return object?.type === 'TextBlock' ? object.data.paragraphs : [];
}

export function useWriterReviewState({
  paragraphs,
  revisions,
  tables,
  pageSetup,
  sections,
  styleCatalog,
  currentTheme,
  initialReviewMode = 'all',
  initialTrackChangesActive = false,
  initialProtectionMode = 'none',
  initialProtectionPasswordHash,
  persistParagraphs,
  persistWriterData,
}: UseWriterReviewStateProps) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>(initialReviewMode);
  /**
   * WR-038 — a real **review mode**, not just a markup selector.
   *
   * The model default used to be markup `'all'`, so every paragraph with a pending revision
   * showed a "Revision (author)" tile and a `⟦n⟧` marker while the user was simply writing.
   * Review chrome is now an explicit mode: off by default, and while it is off the renderer
   * gets `'none'`. Turning it on restores the chosen markup without touching the text.
   */
  const [isReviewModeActive, setIsReviewModeActive] = useState(false);
  const [trackChangesActive, setTrackChangesActiveState] = useState(
    initialTrackChangesActive || requiresTrackedChanges(initialProtectionMode),
  );
  const [reviewerFilter, setReviewerFilter] = useState<ReviewerFilter>('all');
  const [revisionTypeFilter, setRevisionTypeFilter] = useState<'all' | WriterRevisionType>('all');
  const [isReviewPaneOpen, setIsReviewPaneOpen] = useState(false);
  const [protectionMode, setProtectionMode] = useState<WriterProtectionMode>(initialProtectionMode);
  const [protectionPasswordHash, setProtectionPasswordHash] = useState<string | undefined>(initialProtectionPasswordHash);

  useEffect(() => {
    setProtectionMode(initialProtectionMode);
    setProtectionPasswordHash(initialProtectionPasswordHash);
    if (requiresTrackedChanges(initialProtectionMode)) setTrackChangesActiveState(true);
  }, [initialProtectionMode, initialProtectionPasswordHash]);

  const setTrackChangesActive = useCallback((active: boolean) => {
    if (requiresTrackedChanges(protectionMode) && !active) return;
    setTrackChangesActiveState(active);
  }, [protectionMode]);

  const currentRevisionState = useCallback((): WriterRevisionDocumentState => ({
    paragraphs,
    tables,
    pageSetup,
    sections,
    styleCatalog,
    currentTheme,
  }), [currentTheme, pageSetup, paragraphs, sections, styleCatalog, tables]);

  const reviewPresentation = useMemo(
    () => projectWriterReviewPresentation(currentRevisionState(), revisions, reviewMode),
    [currentRevisionState, reviewMode, revisions],
  );

  const persistRevertedState = useCallback((
    state: WriterRevisionDocumentState,
    nextRevisions: TrackChangeRevision[],
  ) => {
    persistParagraphs(state.paragraphs, {
      tables: state.tables,
      pageSetup: state.pageSetup,
      sections: state.sections,
      styles: state.styleCatalog.paragraphStyles,
      styleCatalog: state.styleCatalog,
      currentTheme: state.currentTheme,
      // W-053: the register is bounded here, at the single place a revert writes it back. A pending
      // revision is never dropped; the oldest decided ones go first.
      revisions: boundWriterRevisionRegister(nextRevisions),
    });
  }, [persistParagraphs]);

  const handleAcceptRevision = useCallback((id: string) => {
    if (!canManageRevisions(protectionMode)) return;
    // W-053: accepting is what turns a pending revision into permanent history, so the bound belongs
    // on this path.
    persistWriterData({ revisions: boundWriterRevisionRegister(acceptRevision(id, revisions)) });
  }, [persistWriterData, protectionMode, revisions]);

  const handleRejectRevision = useCallback((id: string) => {
    if (!canManageRevisions(protectionMode)) return false;
    const revision = revisions.find((candidate) => candidate.id === id);
    if (!revision || revision.status !== 'pending') return false;
    const result = revertWriterRevision(currentRevisionState(), revision);
    if (!result.ok) {
      persistWriterData({
        revisions: revisions.map((candidate) => candidate.id === id
          ? { ...candidate, conflictReason: result.reason }
          : candidate),
      });
      return false;
    }
    persistRevertedState(result.state, revisions.map((candidate) => candidate.id === id
      ? { ...candidate, status: 'rejected' as const, conflictReason: undefined }
      : candidate));
    return true;
  }, [currentRevisionState, persistRevertedState, persistWriterData, protectionMode, revisions]);

  const handleAcceptAllRevisions = useCallback(() => {
    if (!canManageRevisions(protectionMode)) return;
    // W-053: a bulk accept creates the most history at once, so it is bounded as well.
    persistWriterData({ revisions: boundWriterRevisionRegister(acceptAllRevisions(revisions)) });
  }, [persistWriterData, protectionMode, revisions]);

  const handleRejectAllRevisions = useCallback(() => {
    if (!canManageRevisions(protectionMode)) return;
    let state = currentRevisionState();
    let nextRevisions = [...revisions];
    const pending = sortWriterRevisionsNewestFirst(
      revisions.filter((revision) => revision.status === 'pending'),
    );

    for (const revision of pending) {
      const result = revertWriterRevision(state, revision);
      if (!result.ok) {
        nextRevisions = nextRevisions.map((candidate) => candidate.id === revision.id
          ? { ...candidate, conflictReason: result.reason }
          : candidate);
        continue;
      }
      state = result.state;
      nextRevisions = nextRevisions.map((candidate) => candidate.id === revision.id
        ? { ...candidate, status: 'rejected' as const, conflictReason: undefined }
        : candidate);
    }
    persistRevertedState(state, nextRevisions);
  }, [currentRevisionState, persistRevertedState, protectionMode, revisions]);

  const handleAcceptSelectedRevisions = useCallback((ids: readonly string[]) => {
    if (!canManageRevisions(protectionMode)) return;
    const selected = new Set(ids);
    // W-053: selected accept is the path the review surface uses, so it carries the bound too.
    persistWriterData({
      revisions: boundWriterRevisionRegister(revisions.map((revision) => selected.has(revision.id) && revision.status === 'pending'
        ? { ...revision, status: 'accepted' as const, conflictReason: undefined }
        : revision)),
    });
  }, [persistWriterData, protectionMode, revisions]);

  const handleRejectSelectedRevisions = useCallback((ids: readonly string[]) => {
    if (!canManageRevisions(protectionMode)) return;
    const selected = new Set(ids);
    let state = currentRevisionState();
    let nextRevisions = [...revisions];
    const pending = sortWriterRevisionsNewestFirst(
      revisions.filter((revision) => selected.has(revision.id) && revision.status === 'pending'),
    );
    for (const revision of pending) {
      const result = revertWriterRevision(state, revision);
      if (!result.ok) {
        nextRevisions = nextRevisions.map((candidate) => candidate.id === revision.id
          ? { ...candidate, conflictReason: result.reason }
          : candidate);
        continue;
      }
      state = result.state;
      nextRevisions = nextRevisions.map((candidate) => candidate.id === revision.id
        ? { ...candidate, status: 'rejected' as const, conflictReason: undefined }
        : candidate);
    }
    persistRevertedState(state, nextRevisions);
  }, [currentRevisionState, persistRevertedState, protectionMode, revisions]);

  const handleCompareDocuments = useCallback((comparisonDocument: WorkspaceDocument) => {
    if (!canEditText(protectionMode)) return null;
    const result = compareDocuments(paragraphs, paragraphsFromDocument(comparisonDocument), 'Dokumenten-Vergleich');
    persistParagraphs(result.mergedParagraphs, { revisions: [...revisions, ...result.generatedRevisions] });
    setTrackChangesActive(true);
    setReviewMode('all');
    setIsReviewPaneOpen(true);
    return result;
  }, [paragraphs, persistParagraphs, protectionMode, revisions]);

  const handleCombineReviewerDocuments = useCallback((documents: readonly WorkspaceDocument[]) => {
    if (!canEditText(protectionMode)) return null;
    const reviewerInputs: ReviewerDocumentInput[] = documents.map((document) => ({
      reviewer: document.title || document.id,
      paragraphs: paragraphsFromDocument(document),
    }));
    const result = combineReviewerDocuments(paragraphs, reviewerInputs);
    persistParagraphs(result.mergedParagraphs, { revisions: [...revisions, ...result.generatedRevisions] });
    setTrackChangesActive(true);
    setReviewMode('all');
    setIsReviewPaneOpen(true);
    return result;
  }, [paragraphs, persistParagraphs, protectionMode, revisions]);

  const handleApplyMergedRevisions = useCallback((mergedParagraphs: Paragraph[], generatedRevisions: TrackChangeRevision[]) => {
    if (!canEditText(protectionMode)) return;
    persistParagraphs(mergedParagraphs, { revisions: [...revisions, ...generatedRevisions] });
    setTrackChangesActive(true);
    setReviewMode('all');
    setIsReviewPaneOpen(true);
  }, [persistParagraphs, protectionMode, revisions]);

  const handleApplyProtection = useCallback((mode: WriterProtectionMode, passwordHash?: string) => {
    setProtectionMode(mode);
    setProtectionPasswordHash(passwordHash);
    if (requiresTrackedChanges(mode)) setTrackChangesActiveState(true);
    persistWriterData({ protectionMode: mode, protectionPasswordHash: passwordHash });
  }, [persistWriterData]);

  const handleSetProtection = useCallback(async (mode: WriterProtectionMode, password?: string): Promise<boolean> => {
    if (mode === 'none') {
      handleApplyProtection('none', undefined);
      return true;
    }
    const normalized = password?.trim() ?? '';
    const hash = normalized ? await hashProtectionPassword(normalized) : undefined;
    handleApplyProtection(mode, hash);
    return true;
  }, [handleApplyProtection]);

  const handleUnprotect = useCallback(async (password: string): Promise<boolean> => {
    if (!(await verifyProtectionPassword(password, protectionPasswordHash))) return false;
    handleApplyProtection('none', undefined);
    return true;
  }, [handleApplyProtection, protectionPasswordHash]);

  const handleMigrateLegacyProtection = useCallback(async (password: string): Promise<boolean> => {
    if (!isLegacyProtectionHash(protectionPasswordHash)) return false;
    if (!(await verifyProtectionPassword(password, protectionPasswordHash))) return false;
    const nextHash = await hashProtectionPassword(password);
    handleApplyProtection(protectionMode, nextHash);
    return true;
  }, [handleApplyProtection, protectionMode, protectionPasswordHash]);

  return {
    reviewMode,
    setReviewMode,
    isReviewModeActive,
    setIsReviewModeActive,
    reviewPresentation,
    trackChangesActive,
    setTrackChangesActive,
    reviewerFilter,
    setReviewerFilter,
    revisionTypeFilter,
    setRevisionTypeFilter,
    isReviewPaneOpen,
    setIsReviewPaneOpen,
    protectionMode,
    protectionPasswordHash,
    handleAcceptRevision,
    handleRejectRevision,
    handleAcceptAllRevisions,
    handleRejectAllRevisions,
    handleAcceptSelectedRevisions,
    handleRejectSelectedRevisions,
    handleCompareDocuments,
    handleCombineReviewerDocuments,
    handleApplyMergedRevisions,
    handleApplyProtection,
    handleSetProtection,
    handleUnprotect,
    handleMigrateLegacyProtection,
  };
}
