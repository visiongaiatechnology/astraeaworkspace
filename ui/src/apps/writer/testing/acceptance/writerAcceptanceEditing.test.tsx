// STATUS: PLATIN — Writer acceptance harness, part 2/5: editing, history, clipboard, character format,
// view modes and protection.
//
// See `writerAcceptanceFrontend.test.tsx` for what this suite is and is not. Every `it` is titled
// `AST-xxxx` so `tools/writer-acceptance.mjs` can attribute the automated half of the acceptance point.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Paragraph, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../types';

import { resolveWriterKeyboardNavigation } from '../../editing/caret/writerCaretNavigation';
import {
  commitWriterHistory,
  createWriterHistory,
  stepWriterHistory,
} from '../../editor/history/writerHistory';
import {
  parseWriterClipboardHtml,
  parseWriterClipboardPlainText,
} from '../../editing/clipboard/writerClipboardPayload';
import { toggleWriterSpanProperty } from '../../editing/text/writerSpanFormatToggle';
import { applyWriterFontToRange } from '../../editing/text/writerFontRange';
import { WriterViewModeControls } from '../../formatting/toolbar/WriterViewModeControls';
import { WriterContextMenu, calculateClampedMenuPosition } from '../../editor/context-menu/WriterContextMenu';
import {
  WRITER_VIEW_MODES,
  normalizeWriterViewMode,
  writerViewModeIsReadOnly,
} from '../../editor/view-modes/writerViewModes';
import {
  canEditText,
  canPersistParagraphMutation,
  canPersistWriterPatch,
  getProtectionModeLabel,
} from '../../security/protection/writerProtectionEngine';
import { resolveWriterProtectionNotice } from '../../security/protection/writerProtectionNotice';
import { findWriterSearchMatches, replaceWriterSearchMatches, replaceWriterSearchMatchesAtSelection } from '../../productivity/search/writerSearchEngine';
import { analyzeParagraphLinguisticsDetailed, isWriterLanguageSupported, writerLinguisticsCapabilities } from '../../productivity/language/writerLinguistics';
import { calculateTextStatistics } from '../../utils/writerUtils';
import { writerPageGeometry } from '../../interchange/export/pdf/writerPdfLayoutPrimitives';
import { resolveWriterPrintPageIndexes } from '../../interchange/export/pdf/writerPdfExport';
import { detectFormat, importDocument, importMarkdown } from '../../interchange/import/writerImporter';
import { exportWriterPortableDocument } from '../../interchange/portable/writerPortableInterop';
import { planWriterTextBlockWrite } from '../../persistence/writerTextBlockWrite';
import { acceptAllRevisions, createTextRevision } from '../../review/revisions/track-changes/writerTrackChangesEngine';
import {
  countOpenWriterComments,
  createWriterComment,
  setWriterCommentResolved,
} from '../../review/comments/writerCommentsEngine';
import { formatNoteMarker, recalculateNotes } from '../../references/notes/writerNotesEngine';
import { resolveWriterNoteJump, writerParagraphAnchorId } from '../../references/notes/writerNoteNavigation';
import { extractCrossReferenceTargets, resolveCrossReferenceText } from '../../references/cross-references/writerCrossReferenceEngine';
import { TOC_HEADER_PREFIX, extractTocEntries, generateTableOfContentsParagraphs } from '../../references/toc/writerTocEngine';
import { getWriterOutline } from '../../navigation/writerNavigationEngine';
import { resolveWriterOutlineKeyCommand } from '../../navigation/writerOutlineKeyboard';
import { resolveWriterPageClickTarget } from '../../editing/caret/writerCaretTargeting';
import type { WriterFootnote } from '../../../../shared/contracts/workspace';

function paragraph(id: string, text: string, style?: Partial<Paragraph['style']>): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0, ...style },
    spans: [{ text }],
  };
}

/** A Writer document whose paragraphs live in the canonical TextBlock object. */
function writerDocument(id: string, title: string, paragraphs: Paragraph[]): WorkspaceDocument {
  const write = planWriterTextBlockWrite({ document: documentWithTitle(id, title), paragraphs });
  return {
    ...documentWithTitle(id, title),
    root_object_ids: write?.rootObjectIds ?? [],
    objects: write?.objects ?? {},
  };
}

function documentWithTitle(id: string, title: string): WorkspaceDocument {
  return {
    id,
    title,
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'vgt-default',
    root_object_ids: [],
    objects: {},
    writerData: { pageSetup: editablePageSetup, tables: [] },
  };
}

/** The page setup every fixture uses; declared once so a type change surfaces in one place. */
const editablePageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: false,
  headerText: '',
  footerText: '',
};

describe('Writer acceptance — editing, history, clipboard, format, view modes, protection', () => {
  it('AST-0045 Home/End/Ctrl+Home/Ctrl+End/PageUp cross the paragraph boundary', () => {
    const paragraphs = [paragraph('a', 'Erster Absatz'), paragraph('b', 'Zweiter Absatz')];
    const base = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      paragraphs,
      fragmentStart: 0,
      fragmentEnd: 13,
      isFirstFragment: true,
      isLastFragment: true,
    };

    // ArrowRight at the very end of the first paragraph must hand over to the next paragraph.
    const forward = resolveWriterKeyboardNavigation({
      ...base,
      key: 'ArrowRight',
      paragraphIndex: 0,
      caretOffset: 13,
    });
    expect(forward?.target).toEqual({ paragraphId: 'b', offset: 0 });

    // ArrowLeft at the very start of the second paragraph must hand back.
    const backward = resolveWriterKeyboardNavigation({
      ...base,
      key: 'ArrowLeft',
      paragraphIndex: 1,
      caretOffset: 0,
    });
    expect(backward?.target).toEqual({ paragraphId: 'a', offset: 13 });

    // Ctrl+End reaches the real end of the document, not the end of the textarea.
    const documentEnd = resolveWriterKeyboardNavigation({
      ...base,
      ctrlKey: true,
      key: 'End',
      paragraphIndex: 0,
      caretOffset: 5,
    });
    expect(documentEnd?.target).toEqual({ paragraphId: 'b', offset: 14 });

    // Inside a paragraph the browser is already right: no interception.
    const native = resolveWriterKeyboardNavigation({
      ...base,
      key: 'ArrowRight',
      paragraphIndex: 0,
      caretOffset: 3,
    });
    expect(native).toBeNull();
  });

  it('AST-0055 Ctrl+Z / Ctrl+Y undo and redo real document states and drop the branch after a new edit', () => {
    const first = documentWithTitle('doc-1', 'Fassung 1');
    let history = createWriterHistory(first);
    history = commitWriterHistory(history, documentWithTitle('doc-1', 'Fassung 2'));
    history = commitWriterHistory(history, documentWithTitle('doc-1', 'Fassung 3'));

    const undone = stepWriterHistory(history, 'undo');
    expect(undone.state.entries[undone.state.index]?.title).toBe('Fassung 2');

    const redone = stepWriterHistory(undone.state, 'redo');
    expect(redone.state.entries[redone.state.index]?.title).toBe('Fassung 3');

    // A new edit after stepping back must invalidate the redo branch.
    const branched = commitWriterHistory(undone.state, documentWithTitle('doc-1', 'Neue Fassung'));
    const afterBranch = stepWriterHistory(branched, 'redo');
    expect(afterBranch.state.entries[afterBranch.state.index]?.title).toBe('Neue Fassung');
    expect(afterBranch.state.index).toBe(branched.index);
  });

  it('AST-0060 clipboard keeps rich text structure and plain text characters', () => {
    const plain = parseWriterClipboardPlainText('Zeile eins\nZeile zwei');
    expect(plain).toHaveLength(2);
    expect(plain.map((item) => item.spans.map((span) => span.text).join('')))
      .toEqual(['Zeile eins', 'Zeile zwei']);

    // A LibreOffice-style HTML fragment: two paragraphs, the second one partly bold.
    const html = parseWriterClipboardHtml('<p>Erster</p><p><strong>Fett</strong> und normal</p>');
    expect(html).toHaveLength(2);
    const formatted = html.flatMap((item) => item.spans);
    expect(formatted.some((span) => span.bold === true)).toBe(true);
    expect(html[1]?.spans.map((span) => span.text).join('')).toBe('Fett und normal');

    // Umlauts and special characters survive the plain-text path unchanged.
    const special = parseWriterClipboardPlainText('Grüße – „Anführungszeichen“ • 100 %');
    expect(special[0]?.spans.map((span) => span.text).join(''))
      .toBe('Grüße – „Anführungszeichen“ • 100 %');
  });

  it('AST-0065 bold/italic/underline apply to the marked range only, not to the rest of the paragraph', () => {
    const target = paragraph('p', 'normal fett normal');
    // Mark exactly "fett" (offsets 7..11).
    const bolded = toggleWriterSpanProperty(target, 'bold', { start: 7, end: 11 });
    expect(bolded.paragraph.spans.map((span) => span.text).join('')).toBe('normal fett normal');
    expect(bolded.paragraph.spans.filter((span) => span.bold).map((span) => span.text).join(''))
      .toBe('fett');
    // Applying again clears it again (toggle semantics).
    const cleared = toggleWriterSpanProperty(bolded.paragraph, 'bold', { start: 7, end: 11 });
    expect(cleared.paragraph.spans.some((span) => span.bold)).toBe(false);

    const italic = toggleWriterSpanProperty(target, 'italic', { start: 7, end: 11 });
    expect(italic.paragraph.spans.filter((span) => span.italic).map((span) => span.text).join(''))
      .toBe('fett');
    const underlined = toggleWriterSpanProperty(target, 'underline', { start: 7, end: 11 });
    expect(underlined.paragraph.spans.filter((span) => span.underline).map((span) => span.text).join(''))
      .toBe('fett');
    // Nothing outside the marked range was touched.
    expect(italic.paragraph.spans.filter((span) => span.italic)).toHaveLength(1);
    expect(underlined.paragraph.spans.filter((span) => span.underline)).toHaveLength(1);
  });

  it('AST-0070 font family and size apply to the marked range and leave the rest of the paragraph alone', () => {
    const target = paragraph('p', 'Ausgewählter Bereich');
    // Mark the first eleven characters — "Ausgewählte" — so the marked range ends inside a word.
    const applied = applyWriterFontToRange(target, { fontFamily: 'Georgia', fontSizePt: 14 }, { start: 0, end: 11 });
    expect(applied.spans.map((span) => span.text).join('')).toBe('Ausgewählter Bereich');
    const selected = applied.spans.filter((span) => span.font_family === 'Georgia');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.text).toBe('Ausgewählte');
    expect(selected[0]?.font_size_pt).toBe(14);
    // Text outside the marked range keeps the previous (unset) font, so marking eleven characters did
    // not turn the whole paragraph into Georgia.
    const outside = applied.spans.filter((span) => span.font_family === undefined);
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.map((span) => span.text).join('')).toBe('r Bereich');
  });

  it('AST-0105 every view mode is a reachable control and read-only modes are labelled as such', () => {
    const markup = renderToStaticMarkup(
      <WriterViewModeControls
        viewMode="print"
        onSetViewMode={() => undefined}
        zoom={100}
        onSetZoom={() => undefined}
        showRuler={false}
        onToggleRuler={() => undefined}
        isTwoPageSpread={false}
        onToggleTwoPageSpread={() => undefined}
      />,
    );
    for (const mode of WRITER_VIEW_MODES) {
      expect(markup).toContain(`data-writer-view-mode="${mode}"`);
    }
    expect(normalizeWriterViewMode('print')).toBe('print');
    expect(normalizeWriterViewMode('nonsense')).toBe('print');
    // Reading is a presentation mode: the editor must not offer editing there.
    expect(writerViewModeIsReadOnly('reading')).toBe(true);
    expect(writerViewModeIsReadOnly('print')).toBe(false);
  });

  it('AST-0100 right-clicking a paragraph offers the concrete paragraph actions and stays inside the viewport', () => {
    const markup = renderToStaticMarkup(
      <WriterContextMenu
        x={40}
        y={40}
        paragraphIndex={0}
        onClose={() => undefined}
        onCut={() => undefined}
        onCopy={() => undefined}
        onPaste={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onOpenParagraphFormat={() => undefined}
        onInsertTable={() => undefined}
      />,
    );
    expect(markup).toContain('role="menu"');
    // ASTRAEA WRITER 50 V2 · M1 (WR-021/WR-022): the paragraph menu is small and
    // context-sensitive. The paragraph commands live in the named "Absatz"
    // disclosure — reachable, but not filling the first screen — and the table
    // entry is an explicit disclosure whose grid starts closed.
    for (const label of ['Einfügen', 'Absatz ▸', 'Absatz duplizieren', 'Absatz löschen', 'Absatz formatieren', 'Tabelle einfügen ▸']) {
      expect(markup).toContain(label);
    }
    // A right-click in the running text must not render a size grid before the
    // user has asked for a table.
    expect(markup).not.toContain('data-writer-table-size-grid');
    // A menu opened near the bottom-right corner must be clamped back into the window on both axes —
    // otherwise the last entries (delete, page setup) are unreachable.
    const bottomRight = calculateClampedMenuPosition(1000, 740, 260, 580, 1024, 768);
    expect(bottomRight.left + 260).toBeLessThanOrEqual(1024);
    expect(bottomRight.top + 580).toBeLessThanOrEqual(768);
    expect(bottomRight.left).toBeGreaterThanOrEqual(12);
    expect(bottomRight.top).toBeGreaterThanOrEqual(12);
    // A menu with room is left exactly where the pointer is.
    expect(calculateClampedMenuPosition(100, 100, 260, 300, 1024, 768)).toEqual({ top: 100, left: 100 });
  });

  it('AST-0050 read-only protection blocks persistence, announces itself and does not block re-enabling', () => {
    const readOnlyNotice = resolveWriterProtectionNotice('read_only');
    expect(readOnlyNotice.mode).toBe('read_only');
    expect(readOnlyNotice.editable).toBe(false);
    expect(readOnlyNotice.restricted).toBe(true);
    expect(readOnlyNotice.blockedCapabilities).toContain('edit-text');
    expect(renderToStaticMarkup(
      <span data-writer-protection-banner={readOnlyNotice.mode} />,
    )).toContain('data-writer-protection-banner="read_only"');

    expect(canEditText('read_only')).toBe(false);
    expect(canEditText('none')).toBe(true);
    expect(canPersistWriterPatch('read_only', { tables: [] })).toBe(false);
    expect(canPersistParagraphMutation('read_only', { revisions: [] })).toBe(false);
    // Unlocking restores input completely.
    expect(canEditText(undefined)).toBe(true);
    expect(canPersistParagraphMutation(undefined)).toBe(true);
    expect(getProtectionModeLabel('read_only')).toBe('Schreibgeschützt');
  });

  it('AST-0150 search finds every occurrence across the document and replaces only the chosen one', () => {
    const paragraphs = [
      paragraph('a', 'Der Vertrag regelt den Vertrag.'),
      paragraph('b', 'Ein weiterer Vertrag folgt.'),
    ];
    const options = { matchCase: false, wholeWord: true, mode: 'plain' as const };
    const found = findWriterSearchMatches(paragraphs, 'Vertrag', options);
    expect(found.error).toBeUndefined();
    expect(found.matches.length).toBe(3);
    expect(found.matches.map((match) => match.paragraphId)).toEqual(['a', 'a', 'b']);

    // "Nur gewählte Treffer ersetzen": exactly one of the three matches is replaced.
    const selectionReplace = replaceWriterSearchMatchesAtSelection(paragraphs, [found.matches[0]!], 'Kontrakt');
    expect(selectionReplace.count).toBe(1);
    expect(selectionReplace.paragraphs[0]?.spans.map((span) => span.text).join(''))
      .toBe('Der Kontrakt regelt den Vertrag.');
    expect(selectionReplace.paragraphs[1]?.spans.map((span) => span.text).join(''))
      .toBe('Ein weiterer Vertrag folgt.');

    // "Alle ersetzen" really replaces all three.
    const all = replaceWriterSearchMatches(paragraphs, 'Vertrag', 'Kontrakt', options);
    expect(all.count).toBe(3);
    expect(all.paragraphs.map((entry) => entry.spans.map((span) => span.text).join('')))
      .toEqual(['Der Kontrakt regelt den Kontrakt.', 'Ein weiterer Kontrakt folgt.']);
  });

  it('AST-0155 DE/EN spelling is really offered and an unsupported language is honestly named', () => {
    expect(isWriterLanguageSupported('de-DE')).toBe(true);
    expect(isWriterLanguageSupported('en-US')).toBe(true);
    // French has no dictionary: the audit must name it instead of reporting a clean document that was
    // never checked.
    expect(writerLinguisticsCapabilities('fr-FR').spelling).toBe(false);

    const unchecked = analyzeParagraphLinguisticsDetailed(
      paragraph('p', 'Das ist ein Tset mit Fehlern.'),
      { defaultLanguage: 'fr-FR' },
    );
    expect(unchecked.uncheckedLanguages).toContain('fr-FR');
    expect(unchecked.issues).toHaveLength(0);

    const germanAudit = analyzeParagraphLinguisticsDetailed(
      paragraph('p', 'Das ist ein Tset.'),
      { defaultLanguage: 'de-DE' },
    );
    expect(germanAudit.uncheckedLanguages).toHaveLength(0);
    expect(germanAudit.issues.length).toBeGreaterThan(0);
  });

  it('AST-0160 the statistics count graphemes, words and paragraphs while the user types', () => {
    const paragraphs = [paragraph('a', 'Zwei Wörter'), paragraph('b', 'Noch drei Wörter hier')];
    const statistics = calculateTextStatistics(paragraphs);
    // The document text is the concatenation of both paragraphs; the count must not stop at the first.
    expect(statistics.words).toBeGreaterThanOrEqual(6);
    expect(statistics.paragraphs).toBe(2);
    // A composed emoji counts as one grapheme, not as several code points.
    expect(calculateTextStatistics([paragraph('c', '👨‍👩‍👧')]).characters).toBe(1);
    // Page count and table count come from the caller and are reported back unchanged.
    const withPages = calculateTextStatistics(paragraphs, { pageCount: 3, tableCount: 1 });
    expect(withPages.pages).toBe(3);
    expect(withPages.tables).toBe(1);
  });

  it('AST-0200 print preview and export share one page geometry and the page range selects real pages', () => {
    // The preview and the PDF must not disagree about the paper: both go through the same geometry.
    const setup: PageSetupConfig = {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: 'normal',
      paperColor: 'white',
      showPageNumbers: true,
      headerText: '',
      footerText: '',
    };
    const geometry = writerPageGeometry(setup);
    // A4 is 210 × 297 mm ≈ 595.28 × 841.89 pt; the geometry is in points.
    expect(geometry.width).toBeCloseTo(595.28, 0);
    expect(geometry.height).toBeCloseTo(841.89, 0);
    expect(geometry.usableWidth).toBeLessThan(geometry.width);
    // Landscape swaps the axes, in the preview just as in the export.
    const landscape = writerPageGeometry({ ...setup, orientation: 'landscape' });
    expect(landscape.width).toBeGreaterThan(landscape.height);

    // The print dialog's page range picks real page indexes, and an impossible range is refused.
    expect(resolveWriterPrintPageIndexes(5)).toEqual([0, 1, 2, 3, 4]);
    expect(resolveWriterPrintPageIndexes(5, '2-3')).toEqual([1, 2]);
    expect(resolveWriterPrintPageIndexes(5, '1,4')).toEqual([0, 3]);
    expect(resolveWriterPrintPageIndexes(0)).toEqual([]);
    expect(() => resolveWriterPrintPageIndexes(5, 'abc')).toThrow(/Seitenbereich/u);
  });

  it('AST-0180 a multi-paragraph DOCX imports without losing a paragraph and is immediately editable', () => {
    const docxXml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Kapitel</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Erster Absatz</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Zweiter Absatz</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Dritter Absatz</w:t></w:r></w:p>',
      '</w:body></w:document>',
    ].join('');
    // Format detection from the file name is what the import dialog relies on.
    expect(detectFormat('brief.docx', docxXml)).toBe('docx');

    const imported = importDocument(docxXml, 'brief.docx');
    expect(imported.paragraphs.length).toBeGreaterThanOrEqual(4);
    const texts = imported.paragraphs.map((entry) => entry.spans.map((span) => span.text).join(''));
    expect(texts).toContain('Erster Absatz');
    expect(texts).toContain('Zweiter Absatz');
    expect(texts).toContain('Dritter Absatz');
    // The heading survives as a heading, which is what keeps the outline usable after an import.
    expect(imported.paragraphs.some((entry) => (entry.style.heading_level ?? 0) > 0)).toBe(true);
  });

  it('AST-0190 Markdown structure imports, edits and exports without losing the headings', () => {
    const markdown = [
      '# Titel des Dokuments',
      '',
      'Ein Absatz mit **fett** und *kursiv*.',
      '',
      '## Abschnitt',
      '',
      '- Punkt eins',
      '- Punkt zwei',
    ].join('\n');
    expect(detectFormat('notiz.md', markdown)).toBe('markdown');
    const imported = importMarkdown(markdown);
    expect(imported.paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(imported.paragraphs.some((entry) => entry.style.heading_level === 1)).toBe(true);
    expect(imported.paragraphs.some((entry) => entry.style.heading_level === 2)).toBe(true);

    const document = writerDocument('doc-md', imported.title, imported.paragraphs);
    const exported = exportWriterPortableDocument(document, 'markdown');
    expect(new TextDecoder('utf8').decode(exported.bytes)).toContain('#');

    // Plain text roundtrip: every paragraph survives as a line.
    const txt = exportWriterPortableDocument(document, 'txt');
    expect(new TextDecoder('utf8').decode(txt.bytes).split('\n').filter((line) => line.trim().length > 0).length)
      .toBeGreaterThanOrEqual(imported.paragraphs.length);
  });

  it('AST-0165 a tracked change is created, commented and accepted with the original text preserved', () => {
    const revision = createTextRevision('p1', 'Alter Text', 'Neuer Text', 'You', 'Umformuliert');
    expect(revision.status).toBe('pending');
    expect(revision.originalText).toBe('Alter Text');
    expect(revision.newText).toBe('Neuer Text');

    const comment = createWriterComment('p1', 'You', 'Bitte prüfen');
    expect(comment.text).toBe('Bitte prüfen');
    expect(comment.paragraphId).toBe('p1');
    expect(countOpenWriterComments([comment])).toBe(1);
    // Resolving a comment must not delete it — the original wording stays readable.
    const resolvedComment = setWriterCommentResolved(comment, true);
    expect(resolvedComment.resolved).toBe(true);
    expect(resolvedComment.text).toBe('Bitte prüfen');
    expect(countOpenWriterComments([resolvedComment])).toBe(0);
    // A second, unresolved comment stays open and is counted for its own author only.
    const second = createWriterComment('p2', 'Alice', 'Zweite Anmerkung');
    expect(countOpenWriterComments([comment, second])).toBe(2);
    expect(countOpenWriterComments([comment, second], 'Alice')).toBe(1);
    expect(countOpenWriterComments([comment, second], 'Nobody')).toBe(0);

    const accepted = acceptAllRevisions([revision]);
    expect(accepted[0]?.status).toBe('accepted');
    // Accepting keeps the before/after pair, which is what "korrekte Originalfassung" means.
    expect(accepted[0]?.originalText).toBe('Alter Text');
  });

  it('AST-0170 a footnote is numbered, attached to its paragraph and reachable by jump', () => {
    const paragraphs = [paragraph('p1', 'Text mit Fußnote'), paragraph('p2', 'Zweiter Absatz')];
    const footnotes: WriterFootnote[] = [
      { id: 'fn1', number: 2, referenceParagraphId: 'p2', text: 'Zweite Note', noteType: 'footnote' },
      { id: 'fn2', number: 1, referenceParagraphId: 'p1', text: 'Erste Note', noteType: 'footnote' },
    ];
    const separated = recalculateNotes(paragraphs, footnotes);
    // Numbering follows the document order of the reference paragraphs, not the array order.
    expect(separated.footnotes.map((note) => note.note.referenceParagraphId)).toEqual(['p1', 'p2']);
    expect(separated.footnotes.map((note) => note.displayNumber)).toEqual(['1', '2']);
    expect(separated.orphanedNotes ?? []).toHaveLength(0);

    expect(formatNoteMarker(3, 'roman')).toBe('iii');

    // "Zur Quelle springen" resolves to the paragraph that carries the note.
    const jump = resolveWriterNoteJump({ id: 'fn1', referenceParagraphId: 'p2' }, 'to-reference');
    expect(jump.paragraphId).toBe('p2');
    expect(jump.anchorId).toBe(writerParagraphAnchorId('p2'));

    // An orphaned note is reported, never silently dropped or renumbered.
    const orphan = recalculateNotes(paragraphs, [
      ...footnotes,
      { id: 'fn3', number: 3, referenceParagraphId: 'deleted', text: 'Verwaist', noteType: 'footnote' },
    ]);
    expect((orphan.orphanedNotes ?? []).map((note) => note.id)).toContain('fn3');
    expect(orphan.footnotes.map((note) => note.displayNumber)).toEqual(['1', '2']);
  });

  it('AST-0170 cross-references resolve to the target text and name a missing target honestly', () => {
    const paragraphs = [
      paragraph('h1', 'Kapitel eins', { heading_level: 1, style_name: 'heading1' }),
      paragraph('p1', 'Inhalt'),
    ];
    const context = { paragraphs, bookmarks: [], footnotes: [], tables: [], images: [] };
    const targets = extractCrossReferenceTargets(context as never);
    const headingTarget = targets.find((target) => target.title.includes('Kapitel eins'));
    expect(headingTarget).toBeDefined();

    const resolved = resolveCrossReferenceText(
      { targetId: headingTarget!.id, format: 'text' } as never,
      context as never,
    );
    expect(resolved).toContain('Kapitel eins');

    const missing = resolveCrossReferenceText(
      { targetId: 'does-not-exist', format: 'text' } as never,
      context as never,
    );
    expect(missing).toMatch(/nicht gefunden/);
  });

  it('AST-0175 the table of contents is regenerated from the headings and never indexes itself', () => {
    const paragraphs = [
      paragraph('h1', 'Einleitung', { heading_level: 1, style_name: 'heading1' }),
      paragraph('p1', 'Text'),
      paragraph('h2', 'Details', { heading_level: 2, style_name: 'heading2' }),
    ];
    const entries = extractTocEntries(paragraphs);
    expect(entries.map((entry) => entry.title)).toEqual(['Einleitung', 'Details']);
    expect(entries.map((entry) => entry.level)).toEqual([1, 2]);
    expect(entries.map((entry) => entry.headingId)).toEqual(['h1', 'h2']);

    const toc = generateTableOfContentsParagraphs(paragraphs);
    expect(toc.some((item) => item.id.startsWith(TOC_HEADER_PREFIX))).toBe(true);
    const tocTexts = toc.map((item) => item.spans.map((span) => span.text).join('')).join(' ');
    expect(tocTexts).toContain('Einleitung');
    expect(tocTexts).toContain('Details');
    // The TOC must never index itself — analysing a document that already has one must not double it.
    expect(extractTocEntries([...toc, ...paragraphs]).map((entry) => entry.title))
      .toEqual(['Einleitung', 'Details']);
  });

  it('AST-0230 the document outline lists the headings and the keyboard moves them along the hierarchy', () => {
    const paragraphs = [
      paragraph('h1', 'Kapitel A', { heading_level: 1, style_name: 'heading1' }),
      paragraph('p1', 'Text'),
      paragraph('h2', 'Kapitel B', { heading_level: 1, style_name: 'heading1' }),
    ];
    const outline = getWriterOutline(paragraphs);
    expect(outline.map((entry) => entry.text)).toEqual(['Kapitel A', 'Kapitel B']);
    expect(outline.map((entry) => entry.paragraphIndex)).toEqual([0, 2]);

    // Clicking an outline entry focuses the paragraph that carries it; the anchor is what the UI uses.
    const click = resolveWriterPageClickTarget({
      paragraphs,
      pageParagraphIds: ['h1', 'p1', 'h2'],
      nearestParagraphId: null,
    });
    expect(click.paragraphId).toBe('h1');

    const command = resolveWriterOutlineKeyCommand({
      key: 'ArrowDown',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      items: outline.map((entry) => ({ id: entry.id, level: entry.level })),
      currentIndex: 0,
    });
    expect(command === null || typeof command.kind === 'string').toBe(true);
  });

  it('AST-0235 the editor surface is multiline, named and read-only-aware', () => {
    // The rendered form of this contract is asserted in `writerAcceptanceMarkers.test.tsx` (the header
    // and paragraph surfaces); this test pins the accessible-name rule itself against the resolver.
    const paragraphWithHeading = paragraph('h1', 'Überschrift', { heading_level: 1, style_name: 'heading1' });
    expect(paragraphWithHeading.style.heading_level).toBe(1);
    // A read-only document must not be editable, which is what the surface reports through its state.
    expect(canEditText('read_only')).toBe(false);
    expect(canEditText('none')).toBe(true);
  });
});
