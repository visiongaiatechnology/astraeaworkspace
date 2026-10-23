// STATUS: DIAMANT VGT SUPREME — Writer Section-11 Search/Navigation/Productivity Regression Tests
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterDocumentModel } from '../../../../../shared/contracts/workspace';
import { addWriterClipboardEntry } from '../../../productivity/clipboard/writerClipboardHistory';
import { buildWriterGoToTargets, reorderWriterOutlineBlock } from '../../../navigation/writerNavigationEngine';
import { findWriterSearchMatches, replaceWriterSearchMatches } from '../../../productivity/search/writerSearchEngine';
import { addWriterNamedVersion, createWriterNamedVersion, restoreWriterNamedVersion } from '../../../productivity/versions/writerVersionsEngine';
import { createParagraphTextRevision } from '../../../review/revisions/track-changes/writerTrackChangesEngine';
import { revertWriterRevision } from '../../../review/revisions/writerRevisionRevertEngine';

const headingStyle = { alignment: 'left' as const, line_height: 1.2, space_before: 0, space_after: 0, heading_level: 1 as const, style_name: 'heading1' as const };
const bodyStyle = { alignment: 'left' as const, line_height: 1.2, space_before: 0, space_after: 0, style_name: 'normal' as const };
const paragraphs: Paragraph[] = [
  { id: 'h1', style: headingStyle, spans: [{ text: 'Alpha Kapitel', bold: true }] },
  { id: 'p1', style: bodyStyle, spans: [{ text: 'Alpha body text' }] },
  { id: 'h2', style: headingStyle, spans: [{ text: 'Beta Kapitel' }] },
  { id: 'p2', style: bodyStyle, spans: [{ text: 'Beta body text' }] },
];
const pageSetup = { paperSize: 'A4' as const, orientation: 'portrait' as const, margins: 'normal' as const, paperColor: 'white' as const, showPageNumbers: true, headerText: '', footerText: '' };

describe('Writer section 11 productivity domain', () => {
  it('supports bounded plain, wildcard, regex and format/style search', () => {
    expect(findWriterSearchMatches(paragraphs, 'Alpha', { matchCase: false, wholeWord: true, mode: 'plain' }).matches).toHaveLength(2);
    expect(findWriterSearchMatches(paragraphs, 'Beta*text', { matchCase: false, wholeWord: false, mode: 'wildcard' }).matches[0]?.paragraphId).toBe('p2');
    expect(findWriterSearchMatches(paragraphs, '', { matchCase: false, wholeWord: false, mode: 'plain', format: { bold: true } }).matches[0]?.paragraphId).toBe('h1');
    expect(findWriterSearchMatches(paragraphs, '(a+)+', { matchCase: false, wholeWord: false, mode: 'regex' }).error).toBeTruthy();
    expect(findWriterSearchMatches(paragraphs, '(a|aa)+$', { matchCase: false, wholeWord: false, mode: 'regex' }).error).toBeTruthy();
    expect(findWriterSearchMatches(paragraphs, '*'.repeat(33), { matchCase: false, wholeWord: false, mode: 'wildcard' }).error).toBeTruthy();
  });

  it('replaces matching text without flattening paragraph/span structure', () => {
    const result = replaceWriterSearchMatches(paragraphs, 'body', 'BODY', { matchCase: false, wholeWord: true, mode: 'plain' });
    expect(result.count).toBe(2);
    expect(result.paragraphs[1]?.id).toBe('p1');
    expect(result.paragraphs[1]?.spans[0]?.text).toBe('Alpha BODY text');
  });

  it('rejects tracked replacements without flattening rich spans', () => {
    const before: Paragraph = { id: 'rich', style: bodyStyle, spans: [{ text: 'Alpha ', bold: true }, { text: 'body', italic: true }, { text: ' text' }] };
    const replaced = replaceWriterSearchMatches([before], 'body', 'BODY', { matchCase: false, wholeWord: true, mode: 'plain' }).paragraphs[0]!;
    const revision = createParagraphTextRevision(before, replaced, 'You', 'Suchen/Ersetzen');
    const reverted = revertWriterRevision({ paragraphs: [replaced], tables: [], pageSetup, sections: [], styleCatalog: { paragraphStyles: [], characterStyles: [], tableStyles: [], listStyles: [], linkedStyles: [] } }, revision);
    expect(reverted.ok).toBe(true);
    if (reverted.ok) expect(reverted.state.paragraphs[0]?.spans).toEqual(before.spans);
  });

  it('moves a heading together with its semantic subtree', () => {
    expect(reorderWriterOutlineBlock(paragraphs, 'h2', 'h1').map((paragraph) => paragraph.id)).toEqual(['h2', 'p2', 'h1', 'p1']);
  });

  it('bounds and normalizes local clipboard history', () => {
    let history = [] as ReturnType<typeof addWriterClipboardEntry>;
    for (let index = 0; index < 40; index += 1) history = addWriterClipboardEntry(history, `Entry ${index}`, index);
    expect(history).toHaveLength(32);
    history = addWriterClipboardEntry(history, 'Ｅｎｔｒｙ 39', 99);
    expect(history[0]?.text).toBe('Entry 39');
    expect(history).toHaveLength(32);
  });

  it('keeps protection out of named snapshots and preserves current protection on restore', () => {
    const model: WriterDocumentModel = { pageSetup, tables: [], protectionMode: 'read_only', protectionPasswordHash: 'legacy-secret', namedVersions: [] };
    const version = createWriterNamedVersion({ name: ' Release Candidate ', paragraphs, writerData: model, documentVersion: 7, now: 123 });
    expect(version.name).toBe('Release Candidate');
    expect('protectionMode' in version.snapshot.writerData).toBe(false);
    const current: WriterDocumentModel = { ...model, protectionMode: 'review', protectionPasswordHash: 'current-secret', namedVersions: addWriterNamedVersion([], version) };
    const restored = restoreWriterNamedVersion(version, current);
    expect(restored.writerData.protectionMode).toBe('review');
    expect(restored.writerData.protectionPasswordHash).toBe('current-secret');
    expect(restored.writerData.namedVersions).toHaveLength(1);
  });

  it('builds Go-To targets for pages, sections, bookmarks and footnotes', () => {
    const targets = buildWriterGoToTargets({
      pages: [{ id: 'page-1', pageIndex: 0, paragraphs: [paragraphs[0]!], fragments: [], usedFlowHeightPx: 0, availableFlowHeightPx: 100, isFirst: true, pageSetup, sectionId: 's1', sectionPageIndex: 0, displayPageNumber: 1 }],
      sections: [{ id: 's1', startParagraphId: 'h1', pageSetup }], bookmarks: [{ id: 'b1', name: 'Start', paragraphId: 'h1', createdAt: 1 }],
      footnotes: [{ id: 'f1', number: 1, text: 'note', referenceParagraphId: 'p1' }], comments: [], tables: [], images: [], equations: [],
    });
    expect(targets.some((target) => target.kind === 'page')).toBe(true);
    expect(targets.some((target) => target.kind === 'section')).toBe(true);
    expect(targets.some((target) => target.kind === 'bookmark')).toBe(true);
    expect(targets.some((target) => target.kind === 'footnote')).toBe(true);
  });
});
