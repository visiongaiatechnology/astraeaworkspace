// STATUS: PLATIN — Source contract for the comment author filter
//
// The filter logic is unit-tested. What unit tests cannot reach is that the
// sidebar actually offers the filter next to the comment list, that the badge
// count uses the same helper, and that a stale filter falls back to everything.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const sidebar = read('../../../navigation/toc/WriterTocSidebar.tsx');

describe('Writer comment author filter wiring contract', () => {
  it('offers the filter in the comment tab', () => {
    expect(sidebar).toContain('const [commentAuthorFilter, setCommentAuthorFilter] = useState<string>(WRITER_COMMENT_FILTER_ALL);');
    expect(sidebar).toContain('id="writer-comment-author-filter"');
    expect(sidebar).toContain('aria-label="Kommentare nach Verfasser filtern"');
  });

  it('renders the filtered list, not the raw list', () => {
    expect(sidebar).toContain('const visibleComments = React.useMemo(');
    expect(sidebar).toContain('filterWriterCommentsByAuthor(comments, commentAuthorFilter)');
    expect(sidebar).toContain('visibleComments.length === 0 ?');
    expect(sidebar).toContain('visibleComments.map((comment) => (');
    expect(sidebar).not.toContain('comments.map((comment) => (');
  });

  it('builds the options from the discussion participants', () => {
    expect(sidebar).toContain('resolveWriterCommentAuthors(comments)');
    expect(sidebar).toContain('commentAuthors.map((author) => (');
  });

  it('shows how many comments are still open, per author', () => {
    expect(sidebar).toContain('countOpenWriterComments(comments)');
    expect(sidebar).toContain('countOpenWriterComments(comments, author)');
  });

  it('falls back to everything when the chosen author is gone', () => {
    expect(sidebar).toContain('if (commentAuthors.includes(commentAuthorFilter)) return;');
    expect(sidebar).toContain('setCommentAuthorFilter(WRITER_COMMENT_FILTER_ALL);');
  });

  it('distinguishes an empty document from an empty filter result', () => {
    expect(sidebar).toContain("? 'Keine Kommentare im Dokument.'");
    expect(sidebar).toContain(": 'Keine Kommentare dieses Verfassers.'");
  });
});
