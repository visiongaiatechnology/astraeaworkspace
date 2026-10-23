// STATUS: PLATIN — Source contract: one definition for the Writer view of a Grid cell
//
// W-239: the Writer had **two** cell-text functions for the same feature and neither used the Grid's
// number format, so one cell read `TRUE` through the "insert as table" button and `Ja` through the
// canonical workspace-embed path — and both read differently from the Grid itself (W-237). The range
// parser was duplicated as well.
//
// A unit test can prove that the shared function formats correctly, but not that both callers go
// through it, hence this contract.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const shared = read('../../../integrations/grid/writerGridCellText.ts');
const rangeLink = read('../../../integrations/grid/writerGridLink.ts');
const extractors = read('../../../public/workspace/writerWorkspaceExtractors.ts');
const modal = read('../../../integrations/grid/WriterGridEmbedModal.tsx');

describe('both insert paths read a Grid cell the same way', () => {
  it('has exactly one cell-text definition, and it is the Grid formatter', () => {
    expect(shared).toContain("import { formatCellValue } from '../../../grid/compat/gridUtils';");
    expect(shared).toContain('return formatCellValue(cell).normalize(\'NFKC\').slice(0, MAX_CELL_TEXT);');
  });

  it('routes the range-link path through it', () => {
    expect(rangeLink).toContain("import { writerGridCellText } from './writerGridCellText';");
    expect(rangeLink).toContain('return writerGridCellText(cell, { booleanTrue: \'Ja\', booleanFalse: \'Nein\' });');
    // The old second definition must be gone: no raw String(value) and no TRUE/FALSE spelling.
    expect(rangeLink).not.toContain("'TRUE'");
    expect(rangeLink).not.toContain("'FALSE'");
  });

  it('routes the canonical path through it as well', () => {
    expect(extractors).toContain("import { writerGridCellText } from '../../integrations/grid/writerGridCellText';");
    expect(extractors).toContain('return writerGridCellText(cell, { booleanTrue: \'Ja\', booleanFalse: \'Nein\' });');
    // Its own formatting helper is gone.
    expect(extractors).not.toContain('function valueText(');
  });

  it('keeps the bound and the normalisation that only one path had before', () => {
    // The canonical path bounded at 2048 and normalised; the range-link path did neither. The
    // stricter behaviour is the one that survived.
    expect(shared).toContain('const MAX_CELL_TEXT = 2_048;');
    expect(shared).toContain("normalize('NFKC')");
  });
});

describe('a refused insert says why', () => {
  it('reports the link error instead of swallowing it', () => {
    // W-238: the old handler caught the error and did nothing at all — the button looked broken.
    expect(modal).toContain('if (error instanceof WriterGridLinkError) { setInsertError(error.message); return; }');
    expect(modal).toContain('const [insertError, setInsertError] = useState<string | null>(null);');
    expect(modal).toContain('{insertError && <div role="alert"');
    // The message must be reachable for a screen reader, not only visible.
    expect(modal).toContain('role="alert"');
  });

  it('clears the message on a successful insert', () => {
    expect(modal).toContain('setInsertError(null);');
  });
});
