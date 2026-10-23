// STATUS: PLATIN — all supported locales render Writer table properties copy and controls.
import type { Dispatch, SetStateAction } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WriterTableBlockData } from '../../../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';
import { TableCellTab, TableGeneralTab, TableRowTab, TableStylesTab, TableToolsTab } from '../WriterTableModalTabs';
import { WriterTablePropertiesModal } from '../WriterTablePropertiesModal';
import { WRITER_TABLE_DESIGN_PRESETS } from '../../styles/writerTableStyles';
import { WRITER_TABLE_PROPERTIES_COPY } from '../writerTablePropertiesLocale';

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const escapeMarkupText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mergeRange = { startRow: 0, startCol: 0, endRow: 1, endCol: 1 };
const setMergeRange: Dispatch<SetStateAction<typeof mergeRange>> = () => undefined;
const table: WriterTableBlockData = {
  id: 'table-12345678',
  columns: ['Revenue', 'Margin'],
  rows: [1, 2, 3].map((row) => ({
    id: `row-${row}`,
    cells: [
      { id: `cell-${row}-1`, content: `AUTHORED VALUE ${row}` },
      { id: `cell-${row}-2`, content: '20%' },
    ],
  })),
  styleId: 'grid-neutral',
  totalRowHighlight: true,
};

describe('Writer table properties localization', () => {
  it('keeps every nested catalog group structurally aligned across seven locales', () => {
    const base = WRITER_TABLE_PROPERTIES_COPY['en-US'];
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_TABLE_PROPERTIES_COPY[locale];
      expect(Object.keys(copy).sort(), `${locale}.root`).toEqual(Object.keys(base).sort());
      for (const group of ['tabs', 'general', 'row', 'styles', 'cell', 'tools', 'presets'] as const) {
        expect(Object.keys(copy[group]).sort(), `${locale}.${group}`).toEqual(Object.keys(base[group]).sort());
      }
      for (const group of ['autoFit', 'captionPosition'] as const) {
        expect(Object.keys(copy.general[group]).sort(), `${locale}.general.${group}`).toEqual(Object.keys(base.general[group]).sort());
      }
      for (const group of ['alignment', 'rotation'] as const) {
        expect(Object.keys(copy.cell[group]).sort(), `${locale}.cell.${group}`).toEqual(Object.keys(base.cell[group]).sort());
      }
      expect(Object.keys(copy.presets).sort(), `${locale}.presets`).toEqual(WRITER_TABLE_DESIGN_PRESETS.map(({ id }) => id).sort());
      expect(copy.tableDimensions(3, 2, 'table-1234'), `${locale}.dimensions`).toContain('table-1234');
      expect(copy.row.rowOption(3, true), `${locale}.rowOption`).not.toBe('');
      expect(copy.cell.rowOption(2), `${locale}.cell.rowOption`).not.toBe('');
      expect(copy.tools.formulaInCell(1, 2), `${locale}.formulaInCell`).not.toBe('');
    }
  });

  it('renders localized modal chrome, table summary, and general controls for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = WRITER_TABLE_PROPERTIES_COPY[locale];
      const markup = renderToStaticMarkup(
        <WriterTablePropertiesModal isOpen table={table} onClose={noop} onUpdateTable={noop} />
      );
      const general = renderToStaticMarkup(
        <TableGeneralTab table={table} columnWidths={[40, 60]} onUpdate={noop} onWidthChange={noop} copy={copy.general} />
      );
      const row = renderToStaticMarkup(
        <TableRowTab table={table} selectedRow={0} onSelectRow={noop} onSetKeepTogether={noop} copy={copy.row} />
      );

      expect(markup).toContain(`<h2 class="text-base font-semibold tracking-wide">${copy.title}</h2>`);
      expect(markup).toContain(`aria-label="${copy.closeDialog}"`);
      expect(markup).toContain(copy.tableDimensions(3, 2, 'table-12'));
      for (const label of Object.values(copy.tabs)) expect(markup).toContain(escapeMarkupText(label));
      expect(markup).toContain(copy.close);
      for (const label of [copy.row.activeRow, copy.row.rowOption(1, false), copy.row.rowOption(3, true),
        copy.row.keepTogether, copy.row.keepTogetherHelp]) {
        expect(row).toContain(escapeMarkupText(label));
      }
      for (const mode of Object.values(copy.general.autoFit)) {
        expect(general).toContain(mode.label);
        expect(general).toContain(mode.description);
      }
      for (const label of [copy.general.autoFitLabel, copy.general.columnWidths, copy.general.caption, copy.general.captionPlaceholder,
        copy.general.captionPosition.above, copy.general.captionPosition.below, copy.general.repeatHeader]) {
        expect(general).toContain(label);
      }
    }
  });

  it('renders localized preset, cell, and table tool copy while preserving authored values and formulas', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = WRITER_TABLE_PROPERTIES_COPY[locale];
      const styles = renderToStaticMarkup(<TableStylesTab table={table} onUpdate={noop} copy={{ styles: copy.styles, presets: copy.presets }} />);
      const cell = renderToStaticMarkup(
        <TableCellTab table={table} selectedRow={0} selectedCol={0} setSelectedRow={noop} setSelectedCol={noop}
          onSetVerticalAlign={noop} onSetTextRotation={noop} mergeRange={mergeRange} setMergeRange={setMergeRange}
          onMerge={noop} onSplitCell={noop} copy={copy.cell} />
      );
      const tools = renderToStaticMarkup(
        <TableToolsTab table={table} selectedRow={0} selectedCol={1} onApplyFormula={noop} sortCol={0} sortDir="asc"
          sortNumeric={false} setSortCol={noop} setSortDir={noop} setSortNumeric={noop} onSort={noop} splitAtRow={1}
          setSplitAtRow={noop} onSplitTable={noop} copy={copy.tools} />
      );

      for (const preset of Object.values(copy.presets)) {
        expect(styles).toContain(preset.label);
        expect(styles).toContain(preset.description);
      }
      for (const label of [copy.styles.presets, copy.styles.designOptions, copy.styles.highlightHeader, copy.styles.highlightTotal,
        copy.styles.alternatingRows, copy.styles.highlightFirstColumn, copy.styles.highlightLastColumn]) {
        expect(styles).toContain(escapeMarkupText(label));
      }
      for (const label of [copy.cell.row, copy.cell.rowOption(1), copy.cell.column, copy.cell.verticalAlignment,
        ...Object.values(copy.cell.alignment), copy.cell.textRotation, ...Object.values(copy.cell.rotation), copy.cell.mergeSplit,
        copy.cell.fromRow, copy.cell.fromColumn, copy.cell.toRow, copy.cell.toColumn, copy.cell.mergeRange, copy.cell.splitActiveCell]) {
        expect(cell).toContain(escapeMarkupText(label));
      }
      for (const label of [copy.tools.formulaInCell(1, 2), copy.tools.sortTableByColumn, copy.tools.column, copy.tools.direction,
        copy.tools.ascending, copy.tools.descending, copy.tools.dataType, copy.tools.text, copy.tools.numeric, copy.tools.sortNow,
        copy.tools.splitTable, copy.tools.splitBeforeRow, copy.tools.split]) {
        expect(tools).toContain(escapeMarkupText(label));
      }
      expect(cell).toContain('Revenue');
      expect(tools).toContain('=SUM(ABOVE)');
    }
  });
});
