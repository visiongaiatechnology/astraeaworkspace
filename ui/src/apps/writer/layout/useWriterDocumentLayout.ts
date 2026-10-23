// STATUS: DIAMANT VGT SUPREME — Document Sections & Page Setup Hook
import { useCallback, useMemo } from 'react';
import type {
  Paragraph,
  WriterSectionBreakType,
  WriterSectionDefinition,
} from '../../../shared/contracts/workspace';
import type {
  CustomMargins,
  PageSetupConfig,
  WriterDocumentData,
  WriterProtectionMode,
  TrackChangeRevision,
} from '../types';
import { insertWriterFlowBreak, insertWriterSectionBreak } from '../editing/flow-breaks/writerBreaks';
import { canEditText, canFormat } from '../security/protection/writerProtectionEngine';
import { createFormatRevision, createPropertyRevision, createRevision } from '../review/revisions/track-changes/writerTrackChangesEngine';

export interface UseWriterDocumentLayoutProps {
  paragraphs: Paragraph[];
  activeParagraph: Paragraph | undefined;
  activeParagraphIndex: number;
  sections: WriterSectionDefinition[];
  pageSetup: PageSetupConfig;
  persistWriterData: (patch: Partial<WriterDocumentData>) => void;
  persistParagraphs: (paragraphs: Paragraph[], writerPatch?: Partial<WriterDocumentData>) => void;
  textSelection: { paragraphId: string; start: number; end: number } | null;
  setTextSelection: (selection: { paragraphId: string; start: number; end: number } | null) => void;
  setActiveParagraphId: (paragraphId: string | null) => void;
  protectionMode?: WriterProtectionMode;
  trackChangesActive?: boolean;
  revisions?: TrackChangeRevision[];
}

export function useWriterDocumentLayout({
  paragraphs,
  activeParagraph,
  activeParagraphIndex,
  sections,
  pageSetup,
  persistWriterData,
  persistParagraphs,
  textSelection,
  setTextSelection,
  setActiveParagraphId,
  protectionMode = 'none',
  trackChangesActive = false,
  revisions = [],
}: UseWriterDocumentLayoutProps) {
  const activeSection = useMemo(() => {
    if (!activeParagraph) return undefined;
    const paragraphIndex = new Map(paragraphs.map((p, idx) => [p.id, idx]));
    const cursorIndex = paragraphIndex.get(activeParagraph.id) ?? 0;
    return sections.reduce<WriterSectionDefinition | undefined>((candidate, section) => {
      const sectionIndex = paragraphIndex.get(section.startParagraphId);
      if (sectionIndex === undefined || sectionIndex > cursorIndex) return candidate;
      const candidateIndex = candidate ? paragraphIndex.get(candidate.startParagraphId) ?? -1 : -1;
      return sectionIndex >= candidateIndex ? section : candidate;
    }, undefined);
  }, [activeParagraph, paragraphs, sections]);

  const activePageSetup = activeSection?.pageSetup ?? pageSetup;

  const canCreateSectionAtCursor = Boolean(
    activeParagraph && !sections.some((s) => s.startParagraphId === activeParagraph.id)
  );

  const handleUpdateSectionPageSetup = useCallback((
    sectionId: string,
    config: PageSetupConfig,
    breakType?: WriterSectionBreakType,
    restartPageNumberAt?: number | null,
  ) => {
    if (!canFormat(protectionMode)) return;
    if (sectionId === 'document-default') {
      const revision = trackChangesActive ? createPropertyRevision(
        activeParagraph?.id ?? paragraphs[0]?.id ?? '',
        { kind: 'property', property: 'pageSetup', beforeValue: structuredClone(pageSetup), afterValue: structuredClone(config) },
        'You',
        'Seiteneinstellungen geändert',
      ) : undefined;
      persistWriterData({ pageSetup: config, revisions: revision ? [...revisions, revision] : revisions });
      return;
    }
    const nextSections = sections.map((section) => section.id === sectionId
      ? {
          ...section,
          pageSetup: config,
          breakType: breakType ?? section.breakType ?? 'next-page',
          restartPageNumberAt: restartPageNumberAt === undefined
            ? section.restartPageNumberAt
            : restartPageNumberAt ?? undefined,
        }
      : section);
    const revision = trackChangesActive ? createPropertyRevision(
      activeParagraph?.id ?? paragraphs[0]?.id ?? '',
      { kind: 'property', property: 'sections', beforeValue: structuredClone(sections), afterValue: structuredClone(nextSections) },
      'You',
      'Abschnittseinstellungen geändert',
    ) : undefined;
    persistWriterData({ sections: nextSections, revisions: revision ? [...revisions, revision] : revisions });
  }, [activeParagraph?.id, pageSetup, paragraphs, persistWriterData, protectionMode, revisions, sections, trackChangesActive]);

  const commitFlowBreak = useCallback((breakType: 'line' | 'page' | 'column') => {
    if (!activeParagraph || activeParagraphIndex < 0 || !canEditText(protectionMode)) return;
    const beforeParagraph = structuredClone(activeParagraph);
    const result = insertWriterFlowBreak(
      paragraphs,
      activeParagraph.id,
      textSelection,
      breakType,
    );
    let revision: TrackChangeRevision | undefined;
    if (trackChangesActive) {
      if (breakType === 'line') {
        const afterParagraph = result.paragraphs[activeParagraphIndex];
        if (afterParagraph) {
          revision = createFormatRevision(beforeParagraph, afterParagraph, 'You', 'Zeilenumbruch eingefügt');
        }
      } else {
        const afterHead = result.paragraphs[activeParagraphIndex];
        const insertedTail = result.paragraphs[activeParagraphIndex + 1];
        if (afterHead && insertedTail) {
          revision = createRevision(
            'insert',
            beforeParagraph.id,
            'You',
            beforeParagraph.spans.map((span) => span.text).join(''),
            `${afterHead.spans.map((span) => span.text).join('')}\n${insertedTail.spans.map((span) => span.text).join('')}`,
            breakType === 'page' ? 'Seitenumbruch eingefügt' : 'Spaltenumbruch eingefügt',
            {
              kind: 'structural-break',
              breakType,
              index: activeParagraphIndex,
              beforeParagraph,
              afterHead: structuredClone(afterHead),
              insertedTail: structuredClone(insertedTail),
            },
          );
        }
      }
    }
    persistParagraphs(result.paragraphs, revision ? { revisions: [...revisions, revision] } : undefined);
    setActiveParagraphId(result.activeParagraphId);
    setTextSelection({
      paragraphId: result.activeParagraphId,
      start: result.caretOffset,
      end: result.caretOffset,
    });
  }, [
    activeParagraph,
    activeParagraphIndex,
    paragraphs,
    persistParagraphs,
    protectionMode,
    revisions,
    setActiveParagraphId,
    setTextSelection,
    textSelection,
    trackChangesActive,
  ]);

  const handleInsertLineBreak = useCallback(() => commitFlowBreak('line'), [commitFlowBreak]);
  const handleInsertPageBreak = useCallback(() => commitFlowBreak('page'), [commitFlowBreak]);
  const handleInsertColumnBreak = useCallback(() => commitFlowBreak('column'), [commitFlowBreak]);

  const handleInsertSectionBreak = useCallback((breakType: WriterSectionBreakType) => {
    if (!activeParagraph || activeParagraphIndex < 0 || !canEditText(protectionMode)) return;
    const result = insertWriterSectionBreak(
      paragraphs,
      activeParagraph.id,
      textSelection,
      breakType,
    );
    const sectionId = crypto.randomUUID();
    if (sections.some((section) => section.id === sectionId)) {
      throw new Error('Writer section identity must be unique.');
    }
    const nextSections = [
      ...sections,
      {
        id: sectionId,
        startParagraphId: result.sectionStartParagraphId,
        pageSetup: structuredClone(activePageSetup),
        breakType,
      },
    ];
    const afterHead = result.paragraphs[activeParagraphIndex];
    const insertedTail = result.paragraphs[activeParagraphIndex + 1];
    const revision = trackChangesActive && afterHead && insertedTail
      ? createRevision(
          'insert',
          activeParagraph.id,
          'You',
          activeParagraph.spans.map((span) => span.text).join(''),
          `${afterHead.spans.map((span) => span.text).join('')}\n${insertedTail.spans.map((span) => span.text).join('')}`,
          `Abschnittsumbruch (${breakType}) eingefügt`,
          {
            kind: 'structural-break',
            breakType,
            index: activeParagraphIndex,
            beforeParagraph: structuredClone(activeParagraph),
            afterHead: structuredClone(afterHead),
            insertedTail: structuredClone(insertedTail),
            beforeSections: structuredClone(sections),
            afterSections: structuredClone(nextSections),
          },
        )
      : undefined;
    persistParagraphs(result.paragraphs, {
      sections: nextSections,
      revisions: revision ? [...revisions, revision] : revisions,
    });
    setActiveParagraphId(result.activeParagraphId);
    setTextSelection({
      paragraphId: result.activeParagraphId,
      start: result.caretOffset,
      end: result.caretOffset,
    });
  }, [
    activePageSetup,
    activeParagraph,
    activeParagraphIndex,
    paragraphs,
    persistParagraphs,
    protectionMode,
    revisions,
    sections,
    setActiveParagraphId,
    setTextSelection,
    textSelection,
    trackChangesActive,
  ]);

  const handleUpdateActivePageSetup = useCallback((
    config: PageSetupConfig,
    breakType?: WriterSectionBreakType,
    restartPageNumberAt?: number | null,
  ) => {
    handleUpdateSectionPageSetup(
      activeSection?.id ?? 'document-default',
      config,
      breakType,
      restartPageNumberAt,
    );
  }, [activeSection, handleUpdateSectionPageSetup]);

  const handleUpdateMargins = useCallback(
    (margins: CustomMargins) => {
      const currentSetup = activePageSetup;
      handleUpdateActivePageSetup({
        ...currentSetup,
        margins: 'custom',
        customMargins: {
          top: currentSetup.customMargins?.top ?? 25,
          bottom: currentSetup.customMargins?.bottom ?? 25,
          left: margins.left,
          right: margins.right,
          gutter: margins.gutter ?? currentSetup.customMargins?.gutter ?? 0,
        },
      });
    },
    [activePageSetup, handleUpdateActivePageSetup]
  );

  const handleCreateSectionAtActiveParagraph = useCallback(() => {
    if (!activeParagraph || !canFormat(protectionMode)) return;
    const existing = sections.find((section) => section.startParagraphId === activeParagraph.id);
    if (existing) return;
    const nextSections = [
      ...sections,
      {
        id: crypto.randomUUID(),
        startParagraphId: activeParagraph.id,
        pageSetup: structuredClone(activePageSetup),
        breakType: 'next-page' as const,
      },
    ];
    const revision = trackChangesActive ? createPropertyRevision(
      activeParagraph.id,
      { kind: 'property', property: 'sections', beforeValue: structuredClone(sections), afterValue: structuredClone(nextSections) },
      'You',
      'Abschnitt erstellt',
    ) : undefined;
    persistWriterData({ sections: nextSections, revisions: revision ? [...revisions, revision] : revisions });
  }, [activeParagraph, activePageSetup, persistWriterData, protectionMode, revisions, sections, trackChangesActive]);

  const handleRemoveActiveSection = useCallback(() => {
    if (!activeSection || !canFormat(protectionMode)) return;
    const nextSections = sections.filter((section) => section.id !== activeSection.id);
    const revision = trackChangesActive ? createPropertyRevision(
      activeParagraph?.id ?? activeSection.startParagraphId,
      { kind: 'property', property: 'sections', beforeValue: structuredClone(sections), afterValue: structuredClone(nextSections) },
      'You',
      'Abschnitt entfernt',
    ) : undefined;
    persistWriterData({ sections: nextSections, revisions: revision ? [...revisions, revision] : revisions });
  }, [activeParagraph?.id, activeSection, persistWriterData, protectionMode, revisions, sections, trackChangesActive]);

  return {
    activeSection,
    activePageSetup,
    canCreateSectionAtCursor,
    handleUpdateSectionPageSetup,
    handleInsertLineBreak,
    handleInsertPageBreak,
    handleInsertColumnBreak,
    handleInsertSectionBreak,
    handleUpdateActivePageSetup,
    handleUpdateMargins,
    handleCreateSectionAtActiveParagraph,
    handleRemoveActiveSection,
  };
}
