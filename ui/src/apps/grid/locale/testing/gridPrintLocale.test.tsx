// STATUS: PLATIN — rendered seven-locale coverage for Grid print settings and export controls.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { GridPrintSettings } from '../../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { GridPrintPanel } from '../../print/GridPrintPanel';
import { GRID_PRINT_COPY } from '../gridPrintLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const settings: GridPrintSettings = {
  paperSize: 'A4', orientation: 'portrait', margins: 'custom', customMarginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
  fitToWidth: true, showGridlines: true, showHeadings: true, repeatHeaderRow: true,
};

const escapeMarkup = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#x27;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const expectedKeys = Object.keys(GRID_PRINT_COPY['en-US']).sort();

it('renders localized Grid page setup, accessible labels and export controls for all seven locales', () => {
  for (const locale of WORKSPACE_LOCALES) {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
    const copy = GRID_PRINT_COPY[locale];
    const markup = renderToStaticMarkup(<GridPrintPanel
      settings={settings}
      selectedRange="B2:D8"
      onChange={noop}
      onPrint={noop}
      onExportPdf={noop}
      onExportPortable={noop}
    />);

    expect(Object.keys(copy).sort(), `${locale} catalog parity`).toEqual(expectedKeys);
    const labels = [
      copy.title, copy.printAreaLabel, copy.printAreaPlaceholder('B2:D8'), copy.useSelection,
      copy.repeatRowsLabel, copy.repeatRowsPlaceholder, copy.repeatColumnsLabel, copy.repeatColumnsPlaceholder,
      copy.paperSizeLabel, copy.letterPaperSize, copy.legalPaperSize, copy.orientationLabel, copy.portrait, copy.landscape, copy.marginsLabel,
      copy.normalMargins, copy.narrowMargins, copy.wideMargins, copy.customMargins,
      copy.fitPagesWideLabel, copy.pagesWidePlaceholder, copy.fitPagesTallLabel, copy.pagesTallPlaceholder,
      copy.firstPageNumberLabel, ...Object.values(copy.marginSideLabels), copy.fitToWidth, copy.showGridlines,
      copy.showHeadings, copy.repeatHeaderRow, copy.headerLabel, copy.headerPlaceholder, copy.footerLabel,
      copy.footerPlaceholder, copy.printPreview, copy.pdfSelection, copy.pdfAllVisibleSheets,
    ];
    for (const label of labels) expect(markup, `${locale}: ${label}`).toContain(escapeMarkup(label));
    expect(markup, `${locale}: Letter's persisted option value`).toContain(`value="Letter">${escapeMarkup(copy.letterPaperSize)}</option>`);
    expect(markup, `${locale}: Legal's persisted option value`).toContain(`value="Legal">${escapeMarkup(copy.legalPaperSize)}</option>`);
    expect(markup).toContain('CSV');
    expect(markup).toContain('TSV');
    expect(markup).toContain('JSON');
  }
});
