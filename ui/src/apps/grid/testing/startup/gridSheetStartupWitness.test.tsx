import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { GridSheet } from '../../GridSheet';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

// The Grid suite holds 971 tests, and a mutation that makes `GridSheet` throw on render left **all of them
// green** (round 72). The component was inspected by source-text contract tests, never executed. This witness
// executes it: it is the regression test for DEF-RE-003 ("Grid startet zuverlässig"), and it must go red when
// the component throws, which was verified by mutation.

// Filesystem-scanning contracts in this repository exceed the 5000 ms default under a full parallel run.
vi.setConfig({ testTimeout: 60_000 });

// A cell value no built-in chrome token contains, so that `toContain` can only match rendered cell text.
const CELL_TEXT = 'Astraea-Zelle-7f3a';

const document: WorkspaceDocument = {
  id: 'grid-startup-witness',
  title: 'Grid startup witness',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function render(target: WorkspaceDocument = document): string {
  return renderToStaticMarkup(
    createElement(GridSheet, {
      document: target,
      onUpdateDocument: vi.fn(),
      onSelectSelectionType: vi.fn(),
      onCreateChart: vi.fn(),
      networkCapability: 'offline' as never,
      keyVaultUnlocked: false,
      workspaceDocuments: {},
    } as never),
  );
}

describe('GridSheet startup contract', () => {
  it('renders a fresh Grid document without throwing and produces content', () => {
    const html = render();
    expect(html.length).toBeGreaterThan(0);
  });

  it('is deterministic — two renders of the same document agree', () => {
    expect(render()).toEqual(render());
  });

  it('survives a document with no grid data', () => {
    const empty = { ...document, id: 'grid-startup-witness-empty', gridData: undefined };
    const html = renderToStaticMarkup(
      createElement(GridSheet, {
        document: empty,
        onUpdateDocument: vi.fn(),
        onSelectSelectionType: vi.fn(),
        onCreateChart: vi.fn(),
        networkCapability: 'offline' as never,
        keyVaultUnlocked: false,
        workspaceDocuments: {},
      } as never),
    );
    expect(html.length).toBeGreaterThan(0);
  });

  // The two assertions above guard against a **throwing** render: a throw produces no markup at all, so
  // `length > 0` is exactly the right check for that failure (mutation-verified in round 72).
  //
  // They cannot distinguish "the sheet rendered" from "a shell rendered". This session measured that the
  // name-box assertion below does **not** close that gap either: `data-grid-name-box` is emitted by
  // `toolbar/GridFormulaBar.tsx:287`, a sibling of the viewport inside `GridSheet`, so it is present in
  // markup in which `GridSheetViewport` never mounted at all (measured: name box present, while
  // `role="grid"` and `<td>` are both absent). It stays as a cheap operability contract only.
  it('renders the sheet chrome, not an empty shell (DEF-RE-003)', () => {
    const html = render();
    expect(html).toContain('data-grid-name-box');
  });

  // Every assertion above is satisfied by a shell in which the sheet never mounts. The cause is the
  // *document*: the `document` constant above carries `root_object_ids: []` and no `gridData`, which is a shape no
  // Grid factory produces - `app/bootstrap/seedDocDefaultsOpenCore.ts` (case 'Grid') and
  // `workbook/gridWorkbookOperations.ts:addSheetToDocument` both always write `root_object_ids`, a Table
  // object and `gridData.sheets`. With that document, `state/useGridState.ts:70-74` yields
  // `workbookSheets = []`, `activeSheetModel` stays `undefined`, and the guard `GridSheet.tsx:413`
  // (`{activeSheetModel && <GridSheetViewport …>}`) skips the viewport - so `GridTableCanvas`, the only
  // component that emits `role="grid"` and `<td>`, is never rendered.
  //
  // The repair renders exactly one *populated* document. It is built by the production writer rather than
  // hand-written, so the input cannot drift away from the shape the application actually stores; a
  // hand-written, production-impossible document is what caused this defect in the first place.
  //
  // What this proves: the sheet surface exists in the render output - the grid table and its cells are
  // really there. What it does not prove: that a user can operate it. It statically renders React to a
  // string once; it dispatches no event, because `ui/package.json` has no jsdom, happy-dom or
  // @testing-library, so there is no DOM to send a `pointerdown`, `keydown` or `drop` to. The ~25 DOM
  // handlers on `GridTableCanvas` are still executed by nothing.
  it('renders the real sheet surface (role="grid" and table cells) for a populated document', () => {
    const populated = addSheetToDocument(document, [], 'Sheet 1', {
      cells: { A1: { value: CELL_TEXT } },
    });
    const html = render(populated.updatedDocument);
    expect(html).toContain('role="grid"');
    expect(html).toContain('<td');
    expect(html).toContain(CELL_TEXT);
  });
});
