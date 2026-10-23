// STATUS: PLATIN — Filtering the comment discussion by author
//
// The reviewer filter existed for tracked changes only, so comments could not be
// filtered by author even though the acceptance asks for exactly that.
import { describe, expect, it } from 'vitest';
import type { WriterComment } from '../../../types';
import {
  countOpenWriterComments,
  filterWriterCommentsByAuthor,
  resolveWriterCommentAuthors,
  WRITER_COMMENT_FILTER_ALL,
} from '../../../review/comments/writerCommentsEngine';

const comment = (
  id: string,
  author: string,
  overrides: Partial<WriterComment> = {},
): WriterComment => ({
  id,
  paragraphId: 'p1',
  author,
  avatarColor: '#60a5fa',
  text: `Kommentar ${id}`,
  createdAt: 1,
  resolved: false,
  replies: [],
  ...overrides,
});

const reply = (id: string, author: string) => ({
  id,
  author,
  text: `Antwort ${id}`,
  createdAt: 2,
  mentions: [],
});

const thread = [
  comment('c1', 'Alice', { replies: [reply('r1', 'Bob')] }),
  comment('c2', 'Bob', { resolved: true }),
  comment('c3', 'Carol'),
  comment('c4', 'alice ', { replies: [reply('r2', 'Dave')] }),
];

const ids = (comments: readonly WriterComment[]) => comments.map((entry) => entry.id);

describe('Writer comment authors', () => {
  it('collects authors from comments and replies', () => {
    expect(resolveWriterCommentAuthors(thread)).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  it('treats case and whitespace as the same person', () => {
    expect(resolveWriterCommentAuthors([comment('a', 'Alice'), comment('b', ' alice ')])).toEqual(['Alice']);
  });

  it('returns nothing for an empty discussion', () => {
    expect(resolveWriterCommentAuthors([])).toEqual([]);
  });

  it('ignores an empty author name', () => {
    expect(resolveWriterCommentAuthors([comment('a', '   ')])).toEqual([]);
  });

  it('sorts names without regard to case', () => {
    expect(resolveWriterCommentAuthors([comment('a', 'zoe'), comment('b', 'Anna'), comment('c', 'bea')]))
      .toEqual(['Anna', 'bea', 'zoe']);
  });
});

describe('Writer comment author filter', () => {
  it('keeps everything for the all value and for a missing author', () => {
    expect(ids(filterWriterCommentsByAuthor(thread, WRITER_COMMENT_FILTER_ALL))).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(ids(filterWriterCommentsByAuthor(thread, undefined))).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(ids(filterWriterCommentsByAuthor(thread, ''))).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('keeps the threads a person wrote', () => {
    expect(ids(filterWriterCommentsByAuthor(thread, 'Carol'))).toEqual(['c3']);
  });

  it('keeps a thread the person only answered in', () => {
    // Bob wrote c2 and answered in c1 — participation keeps both.
    expect(ids(filterWriterCommentsByAuthor(thread, 'Bob'))).toEqual(['c1', 'c2']);
    expect(ids(filterWriterCommentsByAuthor(thread, 'Dave'))).toEqual(['c4']);
  });

  it('matches regardless of case and surrounding whitespace', () => {
    expect(ids(filterWriterCommentsByAuthor(thread, 'ALICE'))).toEqual(['c1', 'c4']);
    expect(ids(filterWriterCommentsByAuthor(thread, ' alice '))).toEqual(['c1', 'c4']);
  });

  it('returns nothing for an author who is not in the discussion', () => {
    expect(filterWriterCommentsByAuthor(thread, 'Nobody')).toEqual([]);
  });

  it('does not mutate the input', () => {
    const snapshot = JSON.stringify(thread);
    filterWriterCommentsByAuthor(thread, 'Alice');
    resolveWriterCommentAuthors(thread);
    expect(JSON.stringify(thread)).toBe(snapshot);
  });

  it('returns a copy even when nothing is filtered out', () => {
    const result = filterWriterCommentsByAuthor(thread, WRITER_COMMENT_FILTER_ALL);
    expect(result).not.toBe(thread);
    expect(result).toHaveLength(thread.length);
  });
});

describe('Writer open comment count', () => {
  it('counts the unresolved comments', () => {
    expect(countOpenWriterComments(thread)).toBe(3);
  });

  it('counts per author, including threads they only answered in', () => {
    expect(countOpenWriterComments(thread, 'Alice')).toBe(2);
    expect(countOpenWriterComments(thread, 'Bob')).toBe(1);
    expect(countOpenWriterComments(thread, 'Carol')).toBe(1);
    expect(countOpenWriterComments(thread, 'Nobody')).toBe(0);
  });

  it('is zero for an empty discussion', () => {
    expect(countOpenWriterComments([])).toBe(0);
  });
});
