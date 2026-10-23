// STATUS: PLATIN — Zeuge (AST-0106): das Raster selbst — Geometrie, Zustände, Tastatur.
//
// Dieser Zeuge rendert **die eine** Rasterkomponente, die beide Oberflächen benutzen
// (`WriterTableSizeGrid`), und fährt ihre reinen Teile (Zellauflösung, Fokusbewegung, Hervorhebung)
// direkt. Hover, Fokus und Disabled sind Zustände des Markups; das Auslösen des Klicks bleibt
// `NOT_TESTED` (kein DOM).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WriterTableSizeGrid } from '../../../../tables/picker/WriterTableSizeGrid';
import {
  describeWriterTableSize,
  isWriterTableSize,
  moveWriterTableSizeFocus,
  resolveWriterTableSizeFromCell,
  WRITER_TABLE_SIZE_GRID,
  writerTableSizeCellIsHighlighted,
} from '../../../../tables/picker/writerTableSize';

const noop = (): void => undefined;

const gridMarkup = (disabled = false): string => renderToStaticMarkup(
  <WriterTableSizeGrid
    label="Tabellengröße wählen"
    hint="Zellen überfahren oder mit den Pfeiltasten wählen; Enter fügt die Tabelle ein."
    onPick={noop}
    disabled={disabled}
  />,
);

describe('AST-0106 — das Raster misst 8 × 10', () => {
  it('hat 8 Zeilen und 10 Spalten', () => {
    expect(WRITER_TABLE_SIZE_GRID).toEqual({ rows: 8, cols: 10 });
  });

  it('löst jede Zelle in eine Größe auf — 0-basiert hinein, 1-basiert heraus', () => {
    expect(resolveWriterTableSizeFromCell(0, 0)).toEqual({ rows: 1, cols: 1 });
    expect(resolveWriterTableSizeFromCell(2, 4)).toEqual({ rows: 3, cols: 5 });
    expect(resolveWriterTableSizeFromCell(7, 9)).toEqual({ rows: 8, cols: 10 });
  });

  it('weist Zellen außerhalb des Rasters ab, statt still zu klemmen', () => {
    expect(resolveWriterTableSizeFromCell(8, 0)).toBeNull();
    expect(resolveWriterTableSizeFromCell(0, 10)).toBeNull();
    expect(resolveWriterTableSizeFromCell(-1, 0)).toBeNull();
    expect(resolveWriterTableSizeFromCell(1.5, 2)).toBeNull();
  });

  it('nimmt nur ganze Größen innerhalb des Rasters an', () => {
    expect(isWriterTableSize({ rows: 1, cols: 1 })).toBe(true);
    expect(isWriterTableSize({ rows: 8, cols: 10 })).toBe(true);
    expect(isWriterTableSize({ rows: 0, cols: 1 })).toBe(false);
    expect(isWriterTableSize({ rows: 9, cols: 1 })).toBe(false);
    expect(isWriterTableSize({ rows: 1, cols: 11 })).toBe(false);
    expect(isWriterTableSize({ rows: 1.5, cols: 2 })).toBe(false);
    expect(isWriterTableSize({ rows: Number.NaN, cols: 2 })).toBe(false);
  });

  it('beschreibt die Größe als Spalten × Zeilen', () => {
    expect(describeWriterTableSize({ rows: 4, cols: 3 })).toBe('3 × 4');
    expect(describeWriterTableSize({ rows: 1, cols: 1 })).toBe('1 × 1');
  });

  it('hebt genau die Zellen hervor, die die gewählte Größe abdeckt', () => {
    const size = { rows: 3, cols: 4 };
    expect(writerTableSizeCellIsHighlighted(size, { rows: 1, cols: 1 })).toBe(true);
    expect(writerTableSizeCellIsHighlighted(size, { rows: 3, cols: 4 })).toBe(true);
    expect(writerTableSizeCellIsHighlighted(size, { rows: 4, cols: 4 })).toBe(false);
    expect(writerTableSizeCellIsHighlighted(size, { rows: 3, cols: 5 })).toBe(false);
  });
});

describe('AST-0106 — die Pfeiltasten bewegen den Fokus im Raster', () => {
  it('läuft waagerecht und bleibt am Rand stehen', () => {
    expect(moveWriterTableSizeFocus(0, 'ArrowRight')).toBe(1);
    expect(moveWriterTableSizeFocus(9, 'ArrowRight')).toBe(9);
    expect(moveWriterTableSizeFocus(0, 'ArrowLeft')).toBe(0);
    expect(moveWriterTableSizeFocus(5, 'ArrowLeft')).toBe(4);
  });

  it('läuft senkrecht um eine ganze Zeile', () => {
    expect(moveWriterTableSizeFocus(0, 'ArrowDown')).toBe(10);
    expect(moveWriterTableSizeFocus(15, 'ArrowUp')).toBe(5);
    expect(moveWriterTableSizeFocus(3, 'ArrowUp')).toBe(3);
    expect(moveWriterTableSizeFocus(75, 'ArrowDown')).toBe(75);
  });

  it('springt mit Home und End an den Zeilenrand — nicht über das Raster hinaus', () => {
    expect(moveWriterTableSizeFocus(13, 'Home')).toBe(10);
    expect(moveWriterTableSizeFocus(13, 'End')).toBe(19);
    expect(moveWriterTableSizeFocus(79, 'End')).toBe(79);
  });

  it('lässt unbekannte Tasten unverändert', () => {
    expect(moveWriterTableSizeFocus(7, 'Enter')).toBe(7);
    expect(moveWriterTableSizeFocus(-1, 'ArrowRight')).toBe(0);
  });
});

describe('AST-0106 — Hover-, Fokus- und Disabled-Zustand im Markup', () => {
  it('gibt jeder Zelle einen Fokuspunkt und genau einen Tab-Einstieg', () => {
    const markup = gridMarkup();
    expect((markup.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((markup.match(/tabindex="-1"/g) ?? []).length).toBe(79);
  });

  it('trägt je Zelle die Zustandsmerkmale für Hover, Fokus und Hervorhebung', () => {
    const markup = gridMarkup();
    expect(markup).toContain('data-writer-table-size-cell="1x1"');
    expect((markup.match(/data-writer-table-size-highlighted="false"/g) ?? []).length).toBe(80);
    // Der Fokus der Zelle ist **gestaltet** (Ring), nicht unterdrückt — der Quellvertrag
    // `writerFocusVisibility.contract.test.mjs` verlangt das für jede Writer-Datei.
    expect(markup).toContain('focus-visible:ring-2 focus-visible:ring-blue-400');
    expect(markup).toContain('hover:border-blue-400');
  });

  it('deaktiviert im Disabled-Zustand jede Zelle sichtbar und bedienbar-aus', () => {
    const markup = gridMarkup(true);
    expect(markup).toContain('data-writer-table-size-disabled="true"');
    expect((markup.match(/<button type="button"[^>]*disabled/g) ?? []).length).toBe(80);
    expect(markup).toContain('cursor-not-allowed');
  });

  it('kündigt die überfahrene Größe in einer Live-Region an', () => {
    const markup = gridMarkup();
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-writer-table-size-announcement');
  });
});
