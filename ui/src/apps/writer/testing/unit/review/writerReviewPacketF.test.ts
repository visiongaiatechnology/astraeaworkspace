// STATUS: DIAMANT VGT SUPREME — Sovereign Test Suite for Writer Review, Collaboration & Protection
import { describe, expect, it } from 'vitest';
import type { Paragraph, WriterPageSetupConfig, WriterStyleCatalog } from '../../../../../shared/contracts/workspace';
import type { TableBlockData } from '../../../types';
import {
  acceptAllRevisions,
  acceptRevision,
  computeDiffSegments,
  createFormatRevision,
  createMoveRevision,
  createPropertyRevision,
  createRevision,
  createTableRevision,
  createTextRevision,
} from '../../../review/revisions/track-changes/writerTrackChangesEngine';
import {
  combineReviewerDocuments,
  compareDocuments,
} from '../../../review/compare/writerDocumentCompare';
import {
  addWriterCommentReply,
  createWriterComment,
  extractWriterMentions,
  setWriterCommentResolved,
} from '../../../review/comments/writerCommentsEngine';
import {
  canComment,
  canEditText,
  canFillForms,
  canFormat,
  canPersistParagraphMutation,
  canPersistWriterPatch,
  hashProtectionPassword,
  isLegacyProtectionHash,
  verifyProtectionPassword,
} from '../../../security/protection/writerProtectionEngine';
import {
  revertWriterRevision,
  type WriterRevisionDocumentState,
} from '../../../review/revisions/writerRevisionRevertEngine';
import { projectWriterReviewPresentation } from '../../../review/presentation/writerReviewPresentation';

const paragraph = (id: string, text: string, bold = false): Paragraph => ({
  id,
  style: { alignment: 'left', line_height: 1.2, space_before: 0, space_after: 0 },
  spans: [{ text, bold }],
});

const PAGE_SETUP: WriterPageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

const STYLE_CATALOG: WriterStyleCatalog = {
  paragraphStyles: [],
  characterStyles: [],
  listStyles: [],
  tableStyles: [],
  linkedStyles: [],
};

const table = (id: string, content: string): TableBlockData => ({
  id,
  columns: ['A'],
  rows: [{ id: `${id}-row`, cells: [{ id: `${id}-cell`, content }] }],
  anchorParagraphId: 'p1',
});

function documentState(overrides: Partial<WriterRevisionDocumentState> = {}): WriterRevisionDocumentState {
  return {
    paragraphs: [paragraph('p1', 'Draft text'), paragraph('p2', 'Second paragraph')],
    tables: [],
    pageSetup: structuredClone(PAGE_SETUP),
    sections: [],
    styleCatalog: structuredClone(STYLE_CATALOG),
    currentTheme: 'astraea-light',
    ...overrides,
  };
}

describe('Writer Review, Track Changes & Collaboration', () => {
  describe('Track Changes diff and metadata', () => {
    it('computes token LCS diff and marks insertions and deletions', () => {
      const diff = computeDiffSegments(
        'Der schnelle braune Fuchs springt',
        'Der sehr schnelle rote Fuchs hüpft',
      );
      const additions = diff.filter((segment) => segment.type === 'insert').map((segment) => segment.text).join('');
      const deletions = diff.filter((segment) => segment.type === 'delete').map((segment) => segment.text).join('');
      expect(additions).toContain('sehr');
      expect(additions).toContain('rote');
      expect(deletions).toContain('braune');
      expect(deletions).toContain('springt');
    });

    it('creates structured text revisions with author attribution', () => {
      const revision = createTextRevision('p1', 'Old text', 'New text', 'Alice', 'Clarification');
      expect(revision).toMatchObject({
        paragraphId: 'p1',
        author: 'Alice',
        originalText: 'Old text',
        newText: 'New text',
        status: 'pending',
        details: 'Clarification',
        payload: { kind: 'text', beforeText: 'Old text', afterText: 'New text' },
      });
    });

    it('accepts one or all pending revisions without mutating document content', () => {
      const first = createTextRevision('p1', 'A', 'B', 'Alice');
      const second = createFormatRevision(paragraph('p2', 'X'), paragraph('p2', 'X', true), 'Bob');
      const acceptedOne = acceptRevision(first.id, [first, second]);
      expect(acceptedOne[0].status).toBe('accepted');
      expect(acceptedOne[1].status).toBe('pending');
      expect(acceptAllRevisions([first, second]).every((revision) => revision.status === 'accepted')).toBe(true);
    });
  });

  describe('Fail-closed reversible revisions', () => {
    it('reverts a text revision only when the current text still matches the recorded after-state', () => {
      const revision = createTextRevision('p1', 'Draft text', 'Final text', 'Alice');
      const success = revertWriterRevision(
        documentState({ paragraphs: [paragraph('p1', 'Final text'), paragraph('p2', 'Second paragraph')] }),
        revision,
      );
      expect(success.ok).toBe(true);
      if (success.ok) expect(success.state.paragraphs[0].spans[0].text).toBe('Draft text');

      const conflict = revertWriterRevision(
        documentState({ paragraphs: [paragraph('p1', 'Edited again'), paragraph('p2', 'Second paragraph')] }),
        revision,
      );
      expect(conflict.ok).toBe(false);
      if (!conflict.ok) expect(conflict.reason).toContain('weiter verändert');
    });

    it('reverts inserted and deleted paragraphs with neighborhood validation', () => {
      const inserted = paragraph('p-new', 'Inserted');
      const insertRevision = createRevision('insert', inserted.id, 'Alice', '', 'Inserted', undefined, {
        kind: 'paragraph-insert',
        paragraph: inserted,
        index: 1,
      });
      const insertResult = revertWriterRevision(
        documentState({ paragraphs: [paragraph('p1', 'Draft text'), inserted, paragraph('p2', 'Second paragraph')] }),
        insertRevision,
      );
      expect(insertResult.ok).toBe(true);
      if (insertResult.ok) expect(insertResult.state.paragraphs.map((item) => item.id)).toEqual(['p1', 'p2']);

      const deleted = paragraph('p2', 'Second paragraph');
      const deleteRevision = createRevision('delete', deleted.id, 'Bob', 'Second paragraph', '', undefined, {
        kind: 'paragraph-delete',
        paragraph: deleted,
        index: 1,
        previousParagraphId: 'p1',
      });
      const deleteResult = revertWriterRevision(
        documentState({ paragraphs: [paragraph('p1', 'Draft text')] }),
        deleteRevision,
      );
      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok) expect(deleteResult.state.paragraphs.map((item) => item.id)).toEqual(['p1', 'p2']);
    });

    it('reverts paragraph moves and rejects stale order snapshots', () => {
      const revision = createMoveRevision('p2', ['p1', 'p2'], ['p2', 'p1'], 'Alice');
      const result = revertWriterRevision(
        documentState({ paragraphs: [paragraph('p2', 'Second paragraph'), paragraph('p1', 'Draft text')] }),
        revision,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.state.paragraphs.map((item) => item.id)).toEqual(['p1', 'p2']);

      const stale = revertWriterRevision(
        documentState({ paragraphs: [paragraph('p2', 'Second paragraph'), paragraph('p1', 'Draft text'), paragraph('p3', 'Later')] }),
        revision,
      );
      expect(stale.ok).toBe(false);
    });

    it('reverts formatting from a full before/after paragraph snapshot', () => {
      const before = paragraph('p1', 'Draft text');
      const after = paragraph('p1', 'Draft text', true);
      const revision = createFormatRevision(before, after, 'Bob');
      const result = revertWriterRevision(documentState({ paragraphs: [after, paragraph('p2', 'Second paragraph')] }), revision);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.state.paragraphs[0]).toEqual(before);
    });

    it('reverts table insert, update and delete without overwriting later table changes', () => {
      const original = table('t1', 'Old');
      const updated = table('t1', 'New');

      const insertedRevision = createTableRevision('t1', undefined, original, undefined, 0, 'p1', 'Alice');
      const insertResult = revertWriterRevision(documentState({ tables: [original] }), insertedRevision);
      expect(insertResult.ok).toBe(true);
      if (insertResult.ok) expect(insertResult.state.tables).toEqual([]);

      const updateRevision = createTableRevision('t1', original, updated, 0, 0, 'p1', 'Alice');
      const updateResult = revertWriterRevision(documentState({ tables: [updated] }), updateRevision);
      expect(updateResult.ok).toBe(true);
      if (updateResult.ok) expect(updateResult.state.tables[0]).toEqual(original);

      const deleteRevision = createTableRevision('t1', original, undefined, 0, undefined, 'p1', 'Alice');
      const deleteResult = revertWriterRevision(documentState({ tables: [] }), deleteRevision);
      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok) expect(deleteResult.state.tables[0]).toEqual(original);

      const laterChange = table('t1', 'Changed after revision');
      expect(revertWriterRevision(documentState({ tables: [laterChange] }), updateRevision).ok).toBe(false);
    });

    it('reverts page setup, style catalog and theme property snapshots', () => {
      const pageAfter = { ...PAGE_SETUP, orientation: 'landscape' as const };
      const pageRevision = createPropertyRevision('p1', {
        kind: 'property', property: 'pageSetup', beforeValue: PAGE_SETUP, afterValue: pageAfter,
      }, 'Alice');
      const pageResult = revertWriterRevision(documentState({ pageSetup: pageAfter }), pageRevision);
      expect(pageResult.ok).toBe(true);
      if (pageResult.ok) expect(pageResult.state.pageSetup.orientation).toBe('portrait');

      const styleAfter: WriterStyleCatalog = {
        ...structuredClone(STYLE_CATALOG),
        characterStyles: [{ id: 'strong', label: 'Strong', bold: true }],
      };
      const styleRevision = createPropertyRevision('p1', {
        kind: 'property', property: 'styleCatalog', beforeValue: STYLE_CATALOG, afterValue: styleAfter,
      }, 'Bob');
      const styleResult = revertWriterRevision(documentState({ styleCatalog: styleAfter }), styleRevision);
      expect(styleResult.ok).toBe(true);
      if (styleResult.ok) expect(styleResult.state.styleCatalog.characterStyles).toEqual([]);

      const themeRevision = createPropertyRevision('p1', {
        kind: 'property', property: 'currentTheme', beforeValue: 'light', afterValue: 'dark',
      }, 'Alice');
      const themeResult = revertWriterRevision(documentState({ currentTheme: 'dark' }), themeRevision);
      expect(themeResult.ok).toBe(true);
      if (themeResult.ok) expect(themeResult.state.currentTheme).toBe('light');
    });
  });

  describe('Threaded comments and Unicode mentions', () => {
    it('normalizes Unicode mentions, supports replies and resolve/reopen', () => {
      expect(extractWriterMentions('Bitte @René prüfen, затем @Алиса und @René erneut.')).toEqual(['René', 'Алиса']);
      const comment = createWriterComment('p1', ' Alice ', '  Hallo @René\u0000  ', '#123456', 100);
      expect(comment.text).toBe('Hallo @René');
      expect(comment.mentions).toEqual(['René']);

      const replied = addWriterCommentReply(comment, 'Боб', 'Antwort für @Алиса', 200);
      expect(replied.replies).toHaveLength(1);
      expect(replied.replies[0].mentions).toEqual(['Алиса']);
      expect(setWriterCommentResolved(replied, true).resolved).toBe(true);
      expect(setWriterCommentResolved(replied, false).resolved).toBe(false);
    });
  });

  describe('Stable-ID document compare and multi-reviewer combine', () => {
    const base = [paragraph('p1', 'Intro'), paragraph('p2', 'Body')];

    it('compares by stable IDs instead of paragraph position', () => {
      const revised = [paragraph('p1', 'Updated intro'), paragraph('p2', 'Body'), paragraph('p3', 'Conclusion')];
      const comparison = compareDocuments(base, revised, 'Reviewer A');
      expect(comparison.stats).toMatchObject({ modifiedCount: 1, insertedCount: 1, deletedCount: 0, identicalCount: 1 });
      expect(comparison.generatedRevisions.map((revision) => revision.paragraphId).sort()).toEqual(['p1', 'p3']);
    });

    it('keeps compare deletions applied so accept/reject have correct document semantics', () => {
      const comparison = compareDocuments(base, [paragraph('p1', 'Intro')], 'Reviewer A');
      expect(comparison.mergedParagraphs.map((item) => item.id)).toEqual(['p1']);
      const deletion = comparison.generatedRevisions.find((revision) => revision.payload?.kind === 'paragraph-delete');
      expect(deletion).toBeDefined();
      if (!deletion) throw new Error('delete revision missing');
      const rejected = revertWriterRevision(documentState({ paragraphs: comparison.mergedParagraphs }), deletion);
      expect(rejected.ok).toBe(true);
      if (rejected.ok) expect(rejected.state.paragraphs.map((item) => item.id)).toEqual(['p1', 'p2']);
    });

    it('emits a reversible move revision for pure paragraph reordering', () => {
      const comparison = compareDocuments(base, [paragraph('p2', 'Body'), paragraph('p1', 'Intro')], 'Reviewer A');
      const move = comparison.generatedRevisions.find((revision) => revision.payload?.kind === 'move');
      expect(move?.type).toBe('move');
      if (!move) throw new Error('move revision missing');
      const rejected = revertWriterRevision(documentState({ paragraphs: comparison.mergedParagraphs }), move);
      expect(rejected.ok).toBe(true);
      if (rejected.ok) expect(rejected.state.paragraphs.map((item) => item.id)).toEqual(['p1', 'p2']);
    });

    it('combines independent reviewer edits against one base', () => {
      const result = combineReviewerDocuments(base, [
        { reviewer: 'Alice', paragraphs: [paragraph('p1', 'Alice intro'), paragraph('p2', 'Body')] },
        { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Intro'), paragraph('p2', 'Bob body')] },
      ]);
      expect(result.conflicts).toEqual([]);
      expect(result.mergedParagraphs.map((item) => item.spans[0].text)).toEqual(['Alice intro', 'Bob body']);
      expect(result.generatedRevisions).toHaveLength(2);
    });

    it('applies non-conflicting reviewer deletions and paragraph moves', () => {
      const deletion = combineReviewerDocuments(base, [
        { reviewer: 'Alice', paragraphs: [paragraph('p1', 'Intro')] },
        { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Intro'), paragraph('p2', 'Body')] },
      ]);
      expect(deletion.conflicts).toEqual([]);
      expect(deletion.mergedParagraphs.map((item) => item.id)).toEqual(['p1']);

      const moved = combineReviewerDocuments(base, [
        { reviewer: 'Alice', paragraphs: [paragraph('p2', 'Body'), paragraph('p1', 'Intro')] },
        { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Intro'), paragraph('p2', 'Bob body')] },
      ]);
      expect(moved.conflicts).toEqual([]);
      expect(moved.mergedParagraphs.map((item) => item.id)).toEqual(['p2', 'p1']);
      expect(moved.mergedParagraphs[0].spans[0].text).toBe('Bob body');
      expect(moved.generatedRevisions.some((revision) => revision.payload?.kind === 'move')).toBe(true);
    });

    it('reports competing reviewer paragraph orders instead of choosing a winner', () => {
      const extendedBase = [...base, paragraph('p3', 'End')];
      const result = combineReviewerDocuments(extendedBase, [
        { reviewer: 'Alice', paragraphs: [paragraph('p2', 'Body'), paragraph('p1', 'Intro'), paragraph('p3', 'End')] },
        { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Intro'), paragraph('p3', 'End'), paragraph('p2', 'Body')] },
      ]);
      expect(result.conflicts[0]).toMatchObject({ paragraphId: '__writer_document_order__', reason: 'concurrent-edit' });
      expect(result.mergedParagraphs.map((item) => item.id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('reports concurrent edits and delete-vs-edit conflicts without last-writer-wins overwrite', () => {
      const editConflict = combineReviewerDocuments(base, [
        { reviewer: 'Alice', paragraphs: [paragraph('p1', 'Alice version'), paragraph('p2', 'Body')] },
        { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Bob version'), paragraph('p2', 'Body')] },
      ]);
      expect(editConflict.conflicts[0]).toMatchObject({ paragraphId: 'p1', reason: 'concurrent-edit' });
      expect(editConflict.mergedParagraphs[0].spans[0].text).toBe('Intro');

      const deleteConflict = combineReviewerDocuments(base, [
        { reviewer: 'Alice', paragraphs: [paragraph('p2', 'Body')] },
        { reviewer: 'Bob', paragraphs: [paragraph('p1', 'Edited'), paragraph('p2', 'Body')] },
      ]);
      expect(deleteConflict.conflicts[0]).toMatchObject({ paragraphId: 'p1', reason: 'delete-vs-edit' });
      expect(deleteConflict.mergedParagraphs.some((item) => item.id === 'p1')).toBe(true);
    });
  });

  describe('Document protection', () => {
    it('enforces edit/comment/form permission gates', () => {
      expect([canEditText('none'), canFormat('none'), canComment('none'), canFillForms('none')]).toEqual([true, true, true, true]);
      expect([canEditText('read_only'), canFormat('read_only'), canComment('read_only'), canFillForms('read_only')]).toEqual([false, false, false, false]);
      expect([canEditText('comments_only'), canFormat('comments_only'), canComment('comments_only'), canFillForms('comments_only')]).toEqual([false, false, true, false]);
      expect([canEditText('form_filling'), canFormat('form_filling'), canComment('form_filling'), canFillForms('form_filling')]).toEqual([false, false, false, true]);
    });

    it('enforces protection again at the persistence boundary', () => {
      expect(canPersistWriterPatch('read_only', { comments: [] })).toBe(false);
      expect(canPersistWriterPatch('comments_only', { comments: [] })).toBe(true);
      expect(canPersistWriterPatch('comments_only', { tables: [] })).toBe(false);
      expect(canPersistWriterPatch('form_filling', { contentControls: [] })).toBe(true);
      expect(canPersistWriterPatch('form_filling', { comments: [] })).toBe(false);
      expect(canPersistWriterPatch('review', { tables: [], revisions: [] })).toBe(true);
      expect(canPersistWriterPatch('review', { tables: [] })).toBe(false);
      expect(canPersistParagraphMutation('review', { revisions: [] })).toBe(true);
      expect(canPersistParagraphMutation('review')).toBe(false);
      expect(canPersistParagraphMutation('read_only', { revisions: [] })).toBe(false);
    });

    it('uses salted PBKDF2-HMAC-SHA-256 and verifies correct passwords', async () => {
      const password = 'VGT_Supreme_Pass!2026';
      const first = await hashProtectionPassword(password);
      const second = await hashProtectionPassword(password);
      expect(first).toMatch(/^vgt-pbkdf2-sha256\$310000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
      expect(second).not.toBe(first);
      expect(isLegacyProtectionHash(first)).toBe(false);
      await expect(verifyProtectionPassword(password, first)).resolves.toBe(true);
      await expect(verifyProtectionPassword('Wrong_Password', first)).resolves.toBe(false);
      await expect(verifyProtectionPassword(password, undefined)).resolves.toBe(true);
    });

    it('retains legacy FNV verification only for migration compatibility', async () => {
      const legacy = 'vgt-hash-d45d4696';
      expect(isLegacyProtectionHash(legacy)).toBe(true);
      // Unknown legacy fixture must not accidentally authenticate.
      await expect(verifyProtectionPassword('not-the-original-password', legacy)).resolves.toBe(false);
    });
  });
  describe('Review presentation modes', () => {
    it('projects Original by reversing every pending structured revision in reverse application order', () => {
      const beforeP1 = paragraph('p1', 'Draft text');
      const finalP1 = paragraph('p1', 'Final text', true);
      const textRevision = createTextRevision('p1', 'Draft text', 'Final text', 'Alice');
      const formatRevision = createFormatRevision(paragraph('p1', 'Final text'), finalP1, 'Bob');
      formatRevision.timestamp = textRevision.timestamp + 1;
      const moved = createMoveRevision('p2', ['p1', 'p2'], ['p2', 'p1'], 'Reviewer');
      moved.timestamp = formatRevision.timestamp + 1;
      const projected = projectWriterReviewPresentation(
        documentState({ paragraphs: [paragraph('p2', 'Second paragraph'), finalP1] }),
        [textRevision, formatRevision, moved],
        'original',
      );
      expect(projected.conflicts).toHaveLength(0);
      expect(projected.state.paragraphs).toEqual([beforeP1, paragraph('p2', 'Second paragraph')]);
      expect(projected.historical).toBe(true);
    });

    it('keeps current state for markup modes and reports stale Original projections instead of guessing', () => {
      const current = documentState({ paragraphs: [paragraph('p1', 'Concurrent edit'), paragraph('p2', 'Second paragraph')] });
      const revision = createTextRevision('p1', 'Draft text', 'Final text', 'Alice');
      const currentProjection = projectWriterReviewPresentation(current, [revision], 'none');
      expect(currentProjection.state).toBe(current);
      const original = projectWriterReviewPresentation(current, [revision], 'original');
      expect(original.conflicts).toHaveLength(1);
      expect(original.state.paragraphs[0].spans[0].text).toBe('Concurrent edit');
    });
  });

});
