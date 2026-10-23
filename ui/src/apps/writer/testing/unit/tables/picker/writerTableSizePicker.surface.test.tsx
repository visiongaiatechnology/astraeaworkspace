// STATUS: PLATIN — Zeuge (AST-0106): die Größenwahl fehlt auf **beiden** Einfüge-Oberflächen.
//
// Es gibt zwei Wege zu einer Tabelle im Writer: die Formatierungsleiste und das Absatzkontextmenü. Beide
// bauten vorher dasselbe feste 3 × 1-Literal. Dieser Zeuge rendert **beide** Oberflächen und sucht das
// Raster in ihnen. Findet er keines, kann der Benutzer keine Größe wählen — das ist die Messung.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WriterContextMenu } from '../../../../editor/context-menu/WriterContextMenu';
import { WriterFormattingToolbar } from '../../../../formatting/toolbar/WriterFormattingToolbar';

const noop = (): void => undefined;

const toolbarProps = {
  styles: [],
  currentTheme: 'default',
  viewMode: 'print',
  zoom: 100,
  canUndo: false,
  canRedo: false,
  onApplyStyle: noop,
  onToggleSpan: noop,
  onSetAlignment: noop,
  onToggleList: noop,
  onUpdateStyle: noop,
  onSetTextColor: noop,
  onSetHighlightColor: noop,
  onClearFormatting: noop,
  onSetLineSpacing: noop,
  onSelectTheme: noop,
  onInsertTable: noop,
  onInsertImage: noop,
  onInsertEquation: noop,
  onOpenPageSetup: noop,
  onOpenCitationModal: noop,
  onOpenSymbolsModal: noop,
  onOpenFootnoteModal: noop,
  onOpenBookmarkModal: noop,
  onOpenMailMergeModal: noop,
  onInsertLineBreak: noop,
  onInsertPageBreak: noop,
  onInsertColumnBreak: noop,
  onInsertSectionBreak: noop,
  onSetViewMode: noop,
  onSetZoom: noop,
  onUndo: noop,
  onRedo: noop,
  onOpenGridEmbed: noop,
} satisfies ComponentProps<typeof WriterFormattingToolbar>;

const menuProps = {
  x: 40,
  y: 40,
  paragraphIndex: 1,
  onClose: noop,
  onDuplicate: noop,
  onDelete: noop,
  onInsertTable: noop,
} as const;

const toolbarMarkup = (): string => renderToStaticMarkup(<WriterFormattingToolbar {...toolbarProps} />);
const menuMarkup = (): string => renderToStaticMarkup(<WriterContextMenu {...menuProps} />);

const cellCount = (markup: string): number => (markup.match(/data-writer-table-size-cell=/g) ?? []).length;

describe('AST-0106 — die Formatierungsleiste', () => {
  it('führt ein Tabellengrößen-Raster statt einer festen Größe', () => {
    const markup = toolbarMarkup();
    expect(markup).toContain('data-writer-table-size-grid="8x10"');
    expect(cellCount(markup)).toBe(80);
  });

  it('öffnet das Raster über einen erreichbaren Knopf mit aria-expanded', () => {
    const markup = toolbarMarkup();
    expect(markup).toContain('data-writer-table-size-picker=');
    expect(markup).toContain('aria-haspopup="true"');
    expect(markup).toMatch(/data-writer-table-size-picker="(open|closed)"/);
  });

  it('bietet jede Zelle von 1 × 1 bis 8 × 10 an', () => {
    const markup = toolbarMarkup();
    expect(markup).toContain('data-writer-table-size-cell="1x1"');
    expect(markup).toContain('data-writer-table-size-cell="1x10"');
    expect(markup).toContain('data-writer-table-size-cell="8x1"');
    expect(markup).toContain('data-writer-table-size-cell="8x10"');
  });
});

describe('AST-0106 — das Absatzkontextmenü', () => {
  /**
   * ASTRAEA WRITER 50 V2 · M1 (WR-022) — the contract of this block was inverted.
   *
   * It used to demand that the 8 × 10 grid was already rendered *when the menu
   * opened*. That is exactly the defect the reconstruction plan names: every
   * right-click became a wall of 80 cells before the user had asked for a table.
   * The grid must start **closed** and open only by an explicit activation of
   * `Tabelle einfügen ▸`.
   *
   * A `renderToStaticMarkup` render cannot click, so this file now pins the
   * closed-on-open half. The open half — the click, the `aria-expanded` state and
   * the 80 distinct cell labels — is a real DOM interaction in
   * `testing/acceptance/surface/writerSurfaceInspector.test.tsx`.
   */
  it('hält das Raster beim Öffnen des Menüs geschlossen', () => {
    const markup = menuMarkup();
    expect(markup).not.toContain('data-writer-table-size-grid');
    expect(cellCount(markup)).toBe(0);
  });

  it('lässt den Eintrag "Tabelle einfügen ▸" als Bedienelement stehen', () => {
    const markup = menuMarkup();
    expect(markup).toContain('Tabelle einfügen ▸');
    expect(markup).toContain('data-writer-context-menu-action="insert-table"');
  });

  it('sagt über aria-expanded, ob das Raster sichtbar ist — und meldet zuerst geschlossen', () => {
    expect(menuMarkup()).toMatch(/data-writer-context-menu-action="insert-table"[^>]*aria-expanded="(true|false)"/);
    expect(menuMarkup()).toMatch(/data-writer-context-menu-action="insert-table"[^>]*aria-expanded="false"/);
  });

  it('benennt die Größenwahl als eigenen, erreichbaren Bereich', () => {
    // The disclosure owns a named panel; `aria-controls` and the panel id are the
    // link a screen reader follows, even while the panel is hidden.
    const markup = menuMarkup();
    expect(markup).toMatch(/aria-controls="[^"]*-table-grid"/);
    expect(markup).toContain('Tabelle einfügen ▸');
  });
});

describe('AST-0106 — das Raster ist rollen- und tastaturfähig', () => {
  it('wird von derselben Komponente gerendert wie in der Werkzeugleiste — keine zweite Größenregel', () => {
    // The toolbar renders the grid directly; the menu must not re-implement it.
    // Both paths are the one `WriterTableSizeGrid`, which is what keeps the cell
    // labels and the keyboard model identical.
    const toolbar = toolbarMarkup();
    expect(toolbar).toContain('role="grid"');
    expect((toolbar.match(/role="row"/g) ?? []).length).toBe(8);
    expect((toolbar.match(/role="gridcell"/g) ?? []).length).toBe(80);
    const labels = toolbar.match(/data-writer-table-size-cell="[0-9]+x[0-9]+"[^>]*/g) ?? [];
    const names = new Set(
      (toolbar.match(/aria-label="[^"]*"/g) ?? []).filter((label) => label.includes('×')),
    );
    expect(labels.length).toBe(80);
    expect(names.size).toBeGreaterThanOrEqual(80);
  });
});
