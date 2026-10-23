// STATUS: DIAMANT VGT SUPREME — Formatting and Style Orchestration Hook for Astraea Writer
import { useCallback, useState } from 'react';
import type {
  Paragraph,
  ParagraphStyle,
  WriterAutoCorrectConfig,
  WriterParagraphStyleName,
  WriterStyleCatalog,
  WriterStyleDefinition,
  WriterStyleSet,
  WriterTabStop,
  WriterTextAlignment,
} from '../../../shared/contracts/workspace';
import type { TableBlockData, TrackChangeRevision, WriterDocumentData, WriterProtectionMode } from '../types';
import type { WriterCaseTransformMode } from './transforms/writerCaseTransform';
import type { WriterHistoryCoalesceRequest } from '../editor/history/writerHistory';
import { toggleWriterSpanProperty, applyWriterSpanToggleAcrossParagraphs } from '../editing/text/writerSpanFormatToggle';
import type { WriterCoveredParagraphRange } from './range/writerRangeFormatState';
import { applyWriterLinkToRanges, resolveWriterLinkAtRange } from './range/writerLinkApply';
import { applyWriterFontToRange, type WriterFontPatch } from '../editing/text/writerFontRange';
import {
  applyWriterParagraphOperation,
  patchWriterParagraphStyle,
  resolveWriterListToggleValue,
  resolveWriterParagraphTargets,
  type WriterParagraphListStyle,
  type WriterParagraphStylePatch,
} from '../editing/paragraphs/writerParagraphFormatApply';

/**
 * A colour gesture — every intermediate drag frame plus the commit that closes
 * it — is one undo step. A call without `options` is a discrete click on a
 * swatch and always starts its own step, which keeps the granularity a user
 * expects from a word processor.
 */
function formatGestureCoalesceKey(
  base: string,
  options: { isIntermediate?: boolean } | undefined,
  paragraphId: string | undefined,
): WriterHistoryCoalesceRequest {
  if (options === undefined) return false;
  return `${base}:${paragraphId ?? 'active'}`;
}
import {
  applyWriterCharacterStyle,
  applyWriterDocumentTheme,
  applyWriterLinkedStyle,
  applyWriterListStyle,
  applyWriterStyle,
  applyWriterTableStyle,
  writerDocumentTheme,
  updateWriterStyle,
} from './styles/writerStyles';
import { WRITER_DOCUMENT_THEMES } from './styles/writerStylesDefaults';
import {
  applyWriterStyleSet,
  createWriterStyleSet,
  upsertWriterStyleSet,
} from './styles/writerStyleSets';
import {
  applyWriterTextSpanFormatRange,
  writerTextSpanFormatAtOffset,
  type WriterTextSpanFormat,
} from '../editing/text/writerTextEditing';
import { transformWriterParagraphRange } from './transforms/writerCaseTransform';
import { createFormatRevision, createPropertyRevision, createTableRevision } from '../review/revisions/track-changes/writerTrackChangesEngine';
import { canEditText, canFormat } from '../security/protection/writerProtectionEngine';

interface UseWriterFormattingStateProps {
  paragraphs: Paragraph[];
  activeParagraph: Paragraph | undefined;
  activeParagraphIndex: number;
  textSelection: { paragraphId: string; start: number; end: number } | null;
  setTextSelection: (sel: { paragraphId: string; start: number; end: number } | null) => void;
  styles: WriterStyleDefinition[];
  styleCatalog: WriterStyleCatalog;
  styleSets: WriterStyleSet[];
  tables: TableBlockData[];
  autoCorrect: WriterAutoCorrectConfig;
  trackChangesActive: boolean;
  revisions: TrackChangeRevision[];
  protectionMode?: WriterProtectionMode;
  updateActiveParagraph: (updater: (p: Paragraph) => Paragraph) => void;
  updateActiveParagraphFormatting: (updater: (p: Paragraph) => Paragraph, options?: { coalesce?: WriterHistoryCoalesceRequest }) => void;
  persistParagraphs: (next: Paragraph[], patch?: Partial<WriterDocumentData>, coalesce?: WriterHistoryCoalesceRequest) => void;
  persistWriterData: (patch: Partial<WriterDocumentData>, coalesce?: WriterHistoryCoalesceRequest) => void;
  /**
   * Paragraph ids a marked range covers. Read at command time through a getter,
   * because the range selection is created after this hook.
   */
  getCoveredParagraphIds?: () => readonly string[];
  /**
   * The covered paragraphs with the offsets the marked range holds inside each —
   * the same getter idea, because a character-level command needs the offsets and
   * not only the ids (W-110).
   */
  getCoveredParagraphRanges?: () => readonly WriterCoveredParagraphRange[];
  currentTheme?: string;
  setCurrentTheme: (theme: string) => void;
}

export function useWriterFormattingState({
  paragraphs,
  activeParagraph,
  activeParagraphIndex,
  textSelection,
  setTextSelection,
  styles,
  styleCatalog,
  styleSets,
  tables,
  autoCorrect,
  trackChangesActive,
  revisions,
  protectionMode = 'none',
  updateActiveParagraph,
  updateActiveParagraphFormatting,
  persistParagraphs,
  persistWriterData,
  getCoveredParagraphIds,
  getCoveredParagraphRanges,
  currentTheme,
  setCurrentTheme,
}: UseWriterFormattingStateProps) {
  const [copiedFormat, setCopiedFormat] = useState<{
    paragraphStyle: ParagraphStyle;
    spanFormat: WriterTextSpanFormat;
  } | null>(null);

  const handleApplyStyle = useCallback((name: WriterParagraphStyleName) => {
    updateActiveParagraph((p) => applyWriterStyle(p, name));
  }, [updateActiveParagraph]);

  /**
   * Applies a per-paragraph operation to every paragraph the marked range covers.
   *
   * Two commands act on one paragraph at a time — toggling a character property
   * over the covered sub-range (W-110) and applying a list template (W-117) — and
   * both used to rewrite the active paragraph alone. They report `handled` when
   * the range really spans paragraphs and `not-applicable` when one paragraph is
   * the target, so the single-paragraph path keeps its own history behaviour.
   */
  const applyAcrossCoveredParagraphs = useCallback((
    operation: (paragraph: Paragraph) => Paragraph,
    revisionLabel: string,
  ): 'handled' | 'not-applicable' => {
    if (!canFormat(protectionMode)) return 'handled';
    const ranges = getCoveredParagraphRanges?.() ?? [];
    if (ranges.length < 2) return 'not-applicable';
    const indices = ranges
      .map((range) => paragraphs.findIndex((paragraph) => paragraph.id === range.paragraphId))
      .filter((index) => index >= 0);
    const result = applyWriterParagraphOperation(paragraphs, indices, operation);
    if (result.changedParagraphIds.length === 0) return 'handled';
    const created = result.changedParagraphIds
      .map((id) => {
        const before = paragraphs.find((paragraph) => paragraph.id === id);
        const after = result.paragraphs.find((paragraph) => paragraph.id === id);
        return before && after && trackChangesActive
          ? createFormatRevision(before, after, 'You', revisionLabel)
          : undefined;
      })
      .filter((revision): revision is TrackChangeRevision => revision !== undefined);
    persistParagraphs(result.paragraphs, created.length > 0 ? { revisions: [...revisions, ...created] } : undefined);
    return 'handled';
  }, [getCoveredParagraphRanges, paragraphs, persistParagraphs, protectionMode, revisions, trackChangesActive]);

  const handleApplyCharacterStyle = useCallback((styleId: string) => {
    updateActiveParagraph((paragraph) => applyWriterCharacterStyle(
      paragraph,
      styleId,
      styleCatalog,
      textSelection?.paragraphId === paragraph.id ? textSelection : undefined,
    ));
  }, [styleCatalog, textSelection, updateActiveParagraph]);

  const handleApplyListStyle = useCallback((styleId: string) => {
    // A list template reaches every paragraph of the range: the style inspector
    // used to bind `list_style_id` to the active paragraph alone (W-117).
    const outcome = applyAcrossCoveredParagraphs(
      (paragraph) => applyWriterListStyle(paragraph, styleId, styleCatalog),
      'Listenformat angewendet',
    );
    if (outcome === 'handled') return;
    updateActiveParagraph((paragraph) => applyWriterListStyle(paragraph, styleId, styleCatalog));
  }, [applyAcrossCoveredParagraphs, styleCatalog, updateActiveParagraph]);

  const handleApplyLinkedStyle = useCallback((styleId: string) => {
    updateActiveParagraph((paragraph) => applyWriterLinkedStyle(paragraph, styleId, styleCatalog));
  }, [styleCatalog, updateActiveParagraph]);

  const handleApplyTableStyle = useCallback((tableId: string, styleId: string) => {
    if (!canFormat(protectionMode)) return;
    const index = tables.findIndex((table) => table.id === tableId);
    if (index < 0) return;
    const before = tables[index];
    const after = applyWriterTableStyle(before, styleId, styleCatalog);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const nextTables = [...tables];
    nextTables[index] = after;
    const revision = trackChangesActive
      ? createTableRevision(tableId, before, after, index, index, activeParagraph?.id, 'You', 'Tabellenformatierung geändert')
      : undefined;
    persistWriterData({ tables: nextTables, revisions: revision ? [...revisions, revision] : revisions });
  }, [activeParagraph?.id, persistWriterData, protectionMode, revisions, styleCatalog, tables, trackChangesActive]);

  const handleToggleSpan = useCallback((prop: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'subscript' | 'superscript') => {
    // A range that spans paragraphs is formatted as one range: the same decision
    // for all of it, each paragraph within the offsets the range covers there
    // (W-110). Only the active paragraph used to be touched.
    const ranges = getCoveredParagraphRanges?.() ?? [];
    if (ranges.length >= 2) {
      const result = applyWriterSpanToggleAcrossParagraphs(paragraphs, ranges, prop);
      if (result.changedParagraphIds.length === 0) return;
      const created = result.changedParagraphIds
        .map((id) => {
          const before = paragraphs.find((paragraph) => paragraph.id === id);
          const after = result.paragraphs.find((paragraph) => paragraph.id === id);
          return before && after && trackChangesActive
            ? createFormatRevision(before, after, 'You', 'Zeichenformatierung')
            : undefined;
        })
        .filter((revision): revision is TrackChangeRevision => revision !== undefined);
      persistParagraphs(result.paragraphs, created.length > 0 ? { revisions: [...revisions, ...created] } : undefined);
      return;
    }
    updateActiveParagraphFormatting((p) => {
      // The marked range decides, not the whole paragraph: a partial selection is
      // completed on the first press and only a fully formatted range is cleared.
      const selection = textSelection && textSelection.paragraphId === p.id
        ? { start: textSelection.start, end: textSelection.end }
        : null;
      return toggleWriterSpanProperty(p, prop, selection).paragraph;
    });
  }, [getCoveredParagraphRanges, paragraphs, persistParagraphs, revisions, textSelection, trackChangesActive, updateActiveParagraphFormatting]);

  /**
   * WR-035 — a link is a **span property**, applied exactly to the marked range.
   *
   * `Strg+K` and the insert menu route here. Passing `null` removes the link; the
   * command reports whether anything changed so the caller can skip the transaction.
   */
  const handleApplyLink = useCallback((url: string | null) => {
    const ranges = getCoveredParagraphRanges?.() ?? [];
    if (ranges.length === 0) return false;
    const trimmed = url?.trim() ?? '';
    const link = trimmed.length === 0 ? undefined : { kind: 'external' as const, url: trimmed };
    const result = applyWriterLinkToRanges(paragraphs, ranges, link);
    if (result.changedParagraphIds.length === 0) return false;
    persistParagraphs(result.paragraphs);
    return true;
  }, [getCoveredParagraphRanges, paragraphs, persistParagraphs]);

  /** The link under the caret, for the context menu's edit/remove entries. */
  const resolveActiveLink = useCallback(() => {
    const ranges = getCoveredParagraphRanges?.() ?? [];
    return resolveWriterLinkAtRange(paragraphs, ranges);
  }, [getCoveredParagraphRanges, paragraphs]);

  /**
   * Font family and size act on the marked text. The previous implementation
   * changed the *style definition*, which silently restyled every paragraph
   * using that style instead of the selection. Without a marked range the whole
   * paragraph is patched, which is the bounded interpretation of "the font of
   * this paragraph" and also prepares the next typed character.
   */
  const applyFontPatch = useCallback((patch: WriterFontPatch) => {
    updateActiveParagraphFormatting((p) => {
      const selection = textSelection && textSelection.paragraphId === p.id
        ? { start: textSelection.start, end: textSelection.end }
        : null;
      return applyWriterFontToRange(p, patch, selection);
    });
  }, [textSelection, updateActiveParagraphFormatting]);

  const handleSetFontFamily = useCallback((fontFamily: string) => {
    if (fontFamily.length === 0) return;
    applyFontPatch({ fontFamily });
  }, [applyFontPatch]);

  const handleSetFontSizePt = useCallback((fontSizePt: number) => {
    applyFontPatch({ fontSizePt });
  }, [applyFontPatch]);

  /**
   * Paragraph-level commands (alignment, line spacing). A marked range that
   * covers several paragraphs applies to all of them — the acceptance speaks of
   * "Absätze", and marking three paragraphs to centre them means all three.
   */
  const applyParagraphPatch = useCallback((patch: WriterParagraphStylePatch) => {
    const targets = resolveWriterParagraphTargets(
      paragraphs,
      activeParagraphIndex,
      getCoveredParagraphIds?.() ?? null,
    );
    const result = patchWriterParagraphStyle(paragraphs, targets, patch);
    if (result.changedCount === 0) return;
    persistParagraphs(result.paragraphs);
  }, [activeParagraphIndex, getCoveredParagraphIds, paragraphs, persistParagraphs]);

  const handleSetAlignment = useCallback((alignment: WriterTextAlignment) => {
    applyParagraphPatch({ alignment });
  }, [applyParagraphPatch]);

  /**
   * The paragraph format dialog sends one patch with indents, spacing, tab stops,
   * borders and pagination flags. It must reach the same targets as the toolbar
   * commands — before this it rewrote the active paragraph only, so a selection
   * over several paragraphs kept its old indent and spacing.
   */
  const handleApplyParagraphStylePatch = useCallback((patch: Partial<Paragraph['style']>) => {
    applyParagraphPatch({ style: patch });
  }, [applyParagraphPatch]);

  /**
   * List buttons. Like alignment they act on the marked paragraphs: marking
   * three paragraphs and pressing "bulleted list" makes three list items, and
   * pressing it again removes the list from all three because every target
   * already carries that style.
   */
  const handleToggleList = useCallback((list: WriterParagraphListStyle) => {
    const targets = resolveWriterParagraphTargets(
      paragraphs,
      activeParagraphIndex,
      getCoveredParagraphIds?.() ?? null,
    );
    const value = resolveWriterListToggleValue(paragraphs, targets, list);
    const result = patchWriterParagraphStyle(paragraphs, targets, { list: value });
    if (result.changedCount === 0) return;
    persistParagraphs(result.paragraphs);
  }, [activeParagraphIndex, getCoveredParagraphIds, paragraphs, persistParagraphs]);

  const handleSetTextColor = useCallback((color: string, options?: { isIntermediate?: boolean }) => {
    updateActiveParagraphFormatting((p) => {
      if (textSelection && textSelection.paragraphId === p.id && textSelection.start !== textSelection.end) {
        const baseFormat = writerTextSpanFormatAtOffset(p, textSelection.start);
        return applyWriterTextSpanFormatRange(p, textSelection.start, textSelection.end, {
          ...baseFormat,
          text_color: color,
        });
      }
      return { ...p, spans: p.spans.map((s) => ({ ...s, text_color: color })) };
    }, { coalesce: formatGestureCoalesceKey('format:text-color', options, textSelection?.paragraphId) });
  }, [textSelection, updateActiveParagraphFormatting]);

  const handleSetHighlightColor = useCallback((color: string, options?: { isIntermediate?: boolean }) => {
    updateActiveParagraphFormatting((p) => {
      if (textSelection && textSelection.paragraphId === p.id && textSelection.start !== textSelection.end) {
        const baseFormat = writerTextSpanFormatAtOffset(p, textSelection.start);
        return applyWriterTextSpanFormatRange(p, textSelection.start, textSelection.end, {
          ...baseFormat,
          highlight_color: color,
        });
      }
      return { ...p, spans: p.spans.map((s) => ({ ...s, highlight_color: color })) };
    }, { coalesce: formatGestureCoalesceKey('format:highlight', options, textSelection?.paragraphId) });
  }, [textSelection, updateActiveParagraphFormatting]);

  const handleClearFormatting = useCallback(() => {
    updateActiveParagraph((p) => ({
      ...p,
      style: { alignment: 'left', line_height: 1.5, space_before: 4, space_after: 8 },
      spans: p.spans.map((s) => ({ text: s.text, font_size_pt: 11 })),
    }));
  }, [updateActiveParagraph]);

  const handleSetLineSpacing = useCallback((spacing: number) => {
    applyParagraphPatch({ lineHeight: spacing });
  }, [applyParagraphPatch]);

  const handleCopyFormat = useCallback(() => {
    if (!activeParagraph) return;
    const sourceOffset = textSelection?.paragraphId === activeParagraph.id ? textSelection.start : 0;
    setCopiedFormat({
      paragraphStyle: { ...activeParagraph.style },
      spanFormat: writerTextSpanFormatAtOffset(activeParagraph, sourceOffset),
    });
  }, [activeParagraph, textSelection]);

  const handleApplyCopiedFormat = useCallback(() => {
    if (!canFormat(protectionMode) || !copiedFormat || !activeParagraph || activeParagraphIndex < 0) return;
    const textLength = activeParagraph.spans.reduce((total, span) => total + span.text.length, 0);
    const target = textSelection?.paragraphId === activeParagraph.id && textSelection.start !== textSelection.end
      ? textSelection
      : { paragraphId: activeParagraph.id, start: 0, end: textLength };
    const formatted = applyWriterTextSpanFormatRange(
      activeParagraph,
      target.start,
      target.end,
      copiedFormat.spanFormat,
    );
    const next = [...paragraphs];
    const after = {
      ...formatted,
      style: { ...copiedFormat.paragraphStyle },
    };
    next[activeParagraphIndex] = after;
    const revision = trackChangesActive && JSON.stringify(activeParagraph) !== JSON.stringify(after)
      ? createFormatRevision(activeParagraph, after, 'You', 'Formatpinsel angewendet')
      : undefined;
    persistParagraphs(next, revision ? { revisions: [...revisions, revision] } : undefined);
    setCopiedFormat(null);
  }, [activeParagraph, activeParagraphIndex, copiedFormat, paragraphs, persistParagraphs, protectionMode, revisions, textSelection, trackChangesActive]);

  const handleTransformCase = useCallback((mode: WriterCaseTransformMode) => {
    if (!canEditText(protectionMode) || !activeParagraph || activeParagraphIndex < 0) return;
    const originalText = activeParagraph.spans.map((span) => span.text).join('');
    const activeSelection = textSelection?.paragraphId === activeParagraph.id && textSelection.start !== textSelection.end
      ? textSelection
      : { paragraphId: activeParagraph.id, start: 0, end: originalText.length };
    const result = transformWriterParagraphRange(
      activeParagraph,
      activeSelection.start,
      activeSelection.end,
      mode,
      autoCorrect.locale,
    );
    const transformedText = result.paragraph.spans.map((span) => span.text).join('');
    if (transformedText === originalText) return;
    const next = [...paragraphs];
    next[activeParagraphIndex] = result.paragraph;
    const revisionPatch = trackChangesActive ? {
      revisions: [
        ...revisions,
        createFormatRevision(activeParagraph, result.paragraph, 'You', 'Groß-/Kleinschreibung transformiert'),
      ],
    } : undefined;
    persistParagraphs(next, revisionPatch);
    setTextSelection({
      paragraphId: activeParagraph.id,
      start: result.selectionStart,
      end: result.selectionEnd,
    });
  }, [activeParagraph, activeParagraphIndex, autoCorrect.locale, paragraphs, persistParagraphs, protectionMode, revisions, setTextSelection, textSelection, trackChangesActive]);

  const handleUpdateParagraphStyle = useCallback((patch: Partial<ParagraphStyle>) => {
    updateActiveParagraphFormatting((p) => ({ ...p, style: { ...p.style, ...patch } }));
  }, [updateActiveParagraphFormatting]);

  const handleSelectTheme = useCallback((themeId: string) => {
    if (!canFormat(protectionMode)) return;
    const theme = writerDocumentTheme(themeId);
    const paragraphStyles = applyWriterDocumentTheme(styles, themeId);
    const oldTheme = WRITER_DOCUMENT_THEMES.find((t) => t.id === currentTheme);

    const hasSpanOverrides = paragraphs.some((p) =>
      p.spans.some((span) => span.font_family !== undefined || span.text_color !== undefined)
    );

    const nextParagraphs = hasSpanOverrides
      ? paragraphs.map((p) => {
          const isHeading = Boolean(
            p.style.heading_level ||
            p.style.style_name?.startsWith('heading') ||
            p.style.style_name === 'title'
          );
          const targetFont = isHeading ? theme.headingFont : theme.primaryFont;
          const targetColor = isHeading ? theme.accentColor : theme.textColor;

          const updatedSpans = p.spans.map((span) => {
            let nextFamily = span.font_family;
            let nextColor = span.text_color;

            if (
              span.font_family &&
              oldTheme &&
              (span.font_family === oldTheme.primaryFont || span.font_family === oldTheme.headingFont)
            ) {
              nextFamily = targetFont;
            }

            if (
              span.text_color &&
              oldTheme &&
              (span.text_color === oldTheme.accentColor || span.text_color === oldTheme.textColor)
            ) {
              nextColor = targetColor;
            }

            if (nextFamily === span.font_family && nextColor === span.text_color) {
              return span;
            }

            return {
              ...span,
              font_family: nextFamily,
              text_color: nextColor,
            };
          });

          return { ...p, spans: updatedSpans };
        })
      : paragraphs;

    const nextCatalog = { ...styleCatalog, paragraphStyles };
    const generatedRevisions: TrackChangeRevision[] = [];
    if (trackChangesActive) {
      if (currentTheme !== themeId) {
        generatedRevisions.push(createPropertyRevision(
          activeParagraph?.id ?? paragraphs[0]?.id ?? '',
          { kind: 'property', property: 'currentTheme', beforeValue: currentTheme, afterValue: themeId },
          'You',
          'Dokumenttheme geändert',
        ));
      }
      if (JSON.stringify(styleCatalog) !== JSON.stringify(nextCatalog)) {
        generatedRevisions.push(createPropertyRevision(
          activeParagraph?.id ?? paragraphs[0]?.id ?? '',
          { kind: 'property', property: 'styleCatalog', beforeValue: structuredClone(styleCatalog), afterValue: structuredClone(nextCatalog) },
          'You',
          'Theme-Formatvorlagen geändert',
        ));
      }
      nextParagraphs.forEach((paragraph, index) => {
        const before = paragraphs[index];
        if (before && JSON.stringify(before) !== JSON.stringify(paragraph)) {
          generatedRevisions.push(createFormatRevision(before, paragraph, 'You', 'Theme-Direktformatierung angepasst'));
        }
      });
    }
    setCurrentTheme(themeId);
    persistParagraphs(nextParagraphs, {
      currentTheme: themeId,
      styles: paragraphStyles,
      styleCatalog: nextCatalog,
      revisions: generatedRevisions.length > 0 ? [...revisions, ...generatedRevisions] : revisions,
    });
  }, [activeParagraph?.id, currentTheme, paragraphs, persistParagraphs, protectionMode, revisions, setCurrentTheme, styleCatalog, styles, trackChangesActive]);

  const handleUpdateStyle = useCallback((
    name: WriterParagraphStyleName,
    patch: Partial<Omit<WriterStyleDefinition, 'name' | 'label'>>,
  ) => {
    if (!canFormat(protectionMode)) return;
    const updatedStyles = updateWriterStyle(styles, name, patch);
    const nextCatalog = { ...styleCatalog, paragraphStyles: updatedStyles };
    const revision = trackChangesActive && JSON.stringify(styleCatalog) !== JSON.stringify(nextCatalog)
      ? createPropertyRevision(
          activeParagraph?.id ?? paragraphs[0]?.id ?? '',
          { kind: 'property', property: 'styleCatalog', beforeValue: structuredClone(styleCatalog), afterValue: structuredClone(nextCatalog) },
          'You',
          `Formatvorlage ${name} geändert`,
        )
      : undefined;
    persistWriterData({
      styles: updatedStyles,
      styleCatalog: nextCatalog,
      revisions: revision ? [...revisions, revision] : revisions,
    });
  }, [activeParagraph?.id, paragraphs, persistWriterData, protectionMode, revisions, styleCatalog, styles, trackChangesActive]);

  const handleSaveStyleSet = useCallback((name: string) => {
    if (!canFormat(protectionMode)) return;
    const styleSet = createWriterStyleSet(name, styleCatalog);
    persistWriterData({ styleSets: upsertWriterStyleSet(styleSets, styleSet) });
  }, [persistWriterData, protectionMode, styleCatalog, styleSets]);

  const handleImportStyleSet = useCallback((styleSet: WriterStyleSet) => {
    if (!canFormat(protectionMode)) return;
    persistWriterData({ styleSets: upsertWriterStyleSet(styleSets, styleSet) });
  }, [persistWriterData, protectionMode, styleSets]);

  const handleApplyStyleSet = useCallback((styleSetId: string) => {
    if (!canFormat(protectionMode)) return;
    const styleSet = styleSets.find((candidate) => candidate.id === styleSetId);
    if (!styleSet) return;
    const nextCatalog = applyWriterStyleSet(styleSet);
    const revision = trackChangesActive && JSON.stringify(styleCatalog) !== JSON.stringify(nextCatalog)
      ? createPropertyRevision(
          activeParagraph?.id ?? paragraphs[0]?.id ?? '',
          { kind: 'property', property: 'styleCatalog', beforeValue: structuredClone(styleCatalog), afterValue: structuredClone(nextCatalog) },
          'You',
          'Formatvorlagensatz angewendet',
        )
      : undefined;
    persistWriterData({
      styles: nextCatalog.paragraphStyles,
      styleCatalog: nextCatalog,
      revisions: revision ? [...revisions, revision] : revisions,
    });
  }, [activeParagraph?.id, paragraphs, persistWriterData, protectionMode, revisions, styleCatalog, styleSets, trackChangesActive]);

  const handleUpdateIndents = useCallback(
    (indent: { firstLineMm?: number; leftMm?: number; rightMm?: number }) => {
      const patch: Partial<Paragraph['style']> = {};
      if (indent.firstLineMm !== undefined) patch.first_line_indent_mm = indent.firstLineMm;
      if (indent.leftMm !== undefined) patch.left_indent_mm = indent.leftMm;
      if (indent.rightMm !== undefined) patch.right_indent_mm = indent.rightMm;
      if (Object.keys(patch).length === 0) return;
      applyParagraphPatch({ style: patch });
    },
    [applyParagraphPatch]
  );

  const handleUpdateTabStops = useCallback(
    (tabStops: WriterTabStop[]) => {
      applyParagraphPatch({ style: { tab_stops: tabStops } });
    },
    [applyParagraphPatch]
  );

  return {
    copiedFormat,
    handleApplyStyle,
    handleApplyCharacterStyle,
    handleApplyListStyle,
    handleApplyLinkedStyle,
    handleApplyTableStyle,
    handleToggleSpan,
    handleApplyLink,
    resolveActiveLink,
    handleSetFontFamily,
    handleSetFontSizePt,
    handleSetAlignment,
    handleApplyParagraphStylePatch,
    handleToggleList,
    handleSetTextColor,
    handleSetHighlightColor,
    handleClearFormatting,
    handleSetLineSpacing,
    handleCopyFormat,
    handleApplyCopiedFormat,
    handleTransformCase,
    handleUpdateParagraphStyle,
    handleSelectTheme,
    handleUpdateStyle,
    handleSaveStyleSet,
    handleImportStyleSet,
    handleApplyStyleSet,
    handleUpdateIndents,
    handleUpdateTabStops,
  };
}
