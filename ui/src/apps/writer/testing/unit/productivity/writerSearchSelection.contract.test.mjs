// STATUS: PLATIN — Source contract for the selected-match replace wiring
//
// The engine is unit-tested and the labels are checked for all seven locales. What
// neither can reach is the wiring: the checkbox list must drive the selection set,
// the two buttons must hand over exactly the right matches, and the editor must
// connect the handler (and block it in the read-only original view). The replace
// row only appears after a click, so a static render cannot show it — this contract
// is the honest way to pin it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const bar = read('../../../productivity/search/WriterFindReplaceBar.tsx');
const editor = read('../../../editor/WriterEditor.tsx');
const state = read('../../../productivity/useWriterProductivityState.ts');

describe('Writer selected-match replace contract', () => {
  it('renders one checkbox per match, driven by the selection set', () => {
    expect(bar).toContain('matches.map((match, index) => (');
    expect(bar).toContain('type="checkbox"');
    expect(bar).toContain('checked={selectedMatches.has(matchKey(match))}');
    expect(bar).toContain('onChange={() => toggleMatch(match)}');
    // Every checkbox needs an accessible name, not just a visual label.
    expect(bar).toContain('aria-label={`${copy.matchCount(index + 1, matches.length)}: ${match.text.slice(0, 40)}`}');
  });

  it('hands over exactly the ticked matches', () => {
    expect(bar).toContain('const chosen = matches.filter((match) => selectedMatches.has(matchKey(match)));');
    expect(bar).toContain('const operation = onReplaceSelection(chosen, replaceText);');
  });

  it('offers a single-match path that passes one match', () => {
    expect(bar).toContain('const operation = onReplaceSelection([target], replaceText);');
    expect(bar).toContain('const target = matches[currentMatchIndex] ?? matches[0];');
  });

  it('keys the selection by match position, not by object identity', () => {
    // A new search must not carry a stale selection into a different result set.
    expect(bar).toContain('match.paragraphId}:${match.spanIndex}:${match.start}:${match.end}');
    expect(bar).toContain('useState<ReadonlySet<string>>(() => new Set())');
  });

  it('keeps the selection controls keyboard reachable', () => {
    for (const needle of ['focus-visible:ring-2 focus-visible:ring-blue-400/70', 'focus-visible:ring-2 focus-visible:ring-blue-300']) {
      expect(bar).toContain(needle);
    }
  });

  it('connects the editor and blocks it in the original view and in reading mode', () => {
    expect(editor).toContain(': state.handleReplaceSelectedMatches}');
    // WR-039/WR-040: the refusal reports itself, and a reading view refuses too.
    expect(editor).toContain("(): { ok: false; message: string } => ({ ok: false, message: 'Die Leseansicht ist schreibgeschützt.' })");
    expect(editor).toContain('isHistoricalReview || viewModeReadOnly');
  });

  it('routes the handler through protection mode, revisions and persistence', () => {
    expect(state).toContain('const handleReplaceSelectedMatches = useCallback(');
    expect(state).toContain('if (!canEditText(protectionMode)) return { ok: false');
    expect(state).toContain('replaceWriterSearchMatchesAtSelection(paragraphs, matches, replacement)');
    expect(state).toContain('persistParagraphs(result.paragraphs, trackChangesActive ? { revisions: nextRevisions } : undefined);');
    expect(state).toContain('handleReplaceSelectedMatches,');
  });
});
