// STATUS: DIAMANT VGT SUPREME — localized Grid page layout and export controls.
import React from 'react';
import type { GridPrintSettings } from '../../../shared/contracts/workspace';
import type { GridPortableExportFormat } from '../interchange/gridPortableExport';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_PRINT_COPY } from '../locale/gridPrintLocale';

interface GridPrintPanelProps {
  settings: GridPrintSettings;
  selectedRange: string;
  onChange: (settings: GridPrintSettings) => void;
  onPrint: () => void;
  onExportPdf: (scope: 'selection'|'all-visible-sheets') => void;
  onExportPortable: (format: GridPortableExportFormat, range?: string) => void;
}

type MarginSide = 'top' | 'right' | 'bottom' | 'left';

const MARGIN_SIDES: readonly MarginSide[] = ['top', 'right', 'bottom', 'left'];

const parsePageCount = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const GridPrintPanel: React.FC<GridPrintPanelProps> = ({ settings, selectedRange, onChange, onPrint, onExportPdf, onExportPortable }) => {
  const { locale } = useWorkspaceLocale();
  const copy = GRID_PRINT_COPY[locale];
  const patch = (next: Partial<GridPrintSettings>): void => onChange({ ...settings, ...next });

  return (
    <section className="min-w-0 space-y-2" aria-labelledby="grid-print-title">
      <h3 id="grid-print-title" className="break-words font-semibold text-slate-200">{copy.title}</h3>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label={copy.printAreaLabel} value={settings.printArea ?? ''} onChange={(event) => patch({ printArea: event.target.value.toUpperCase() || undefined })} className="vgt-input col-span-2 min-w-0" placeholder={copy.printAreaPlaceholder(selectedRange)} />
        <button type="button" onClick={() => patch({ printArea: selectedRange })} className="vgt-button-secondary col-span-2 whitespace-normal break-words">{copy.useSelection}</button>
        <input aria-label={copy.repeatRowsLabel} value={settings.repeatRows ?? ''} onChange={(event) => patch({ repeatRows: event.target.value.toUpperCase() || undefined })} className="vgt-input min-w-0" placeholder={copy.repeatRowsPlaceholder} />
        <input aria-label={copy.repeatColumnsLabel} value={settings.repeatColumns ?? ''} onChange={(event) => patch({ repeatColumns: event.target.value.toUpperCase() || undefined })} className="vgt-input min-w-0" placeholder={copy.repeatColumnsPlaceholder} />
        <select aria-label={copy.paperSizeLabel} value={settings.paperSize} onChange={(event) => patch({ paperSize: event.target.value as GridPrintSettings['paperSize'] })} className="vgt-input min-w-0">
          <option>A5</option><option>A4</option><option>A3</option><option value="Letter">{copy.letterPaperSize}</option><option value="Legal">{copy.legalPaperSize}</option>
        </select>
        <select aria-label={copy.orientationLabel} value={settings.orientation} onChange={(event) => patch({ orientation: event.target.value as GridPrintSettings['orientation'] })} className="vgt-input min-w-0">
          <option value="portrait">{copy.portrait}</option><option value="landscape">{copy.landscape}</option>
        </select>
        <select aria-label={copy.marginsLabel} value={settings.margins} onChange={(event) => patch({ margins: event.target.value as GridPrintSettings['margins'] })} className="vgt-input col-span-2 min-w-0">
          <option value="normal">{copy.normalMargins}</option><option value="narrow">{copy.narrowMargins}</option><option value="wide">{copy.wideMargins}</option><option value="custom">{copy.customMargins}</option>
        </select>
        <input type="number" min={1} max={100} value={settings.fitToPagesWide ?? 1} onChange={(event) => patch({ fitToPagesWide: parsePageCount(event.target.value, 1) })} className="vgt-input min-w-0" aria-label={copy.fitPagesWideLabel} placeholder={copy.pagesWidePlaceholder} />
        <input type="number" min={1} max={100} value={settings.fitToPagesTall ?? 1} onChange={(event) => patch({ fitToPagesTall: parsePageCount(event.target.value, 1) })} className="vgt-input min-w-0" aria-label={copy.fitPagesTallLabel} placeholder={copy.pagesTallPlaceholder} />
        <input type="number" min={1} max={9999} value={settings.firstPageNumber ?? 1} onChange={(event) => patch({ firstPageNumber: parsePageCount(event.target.value, 1) })} className="vgt-input col-span-2 min-w-0" aria-label={copy.firstPageNumberLabel} />
      </div>
      {settings.margins === 'custom' && (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {MARGIN_SIDES.map((side) => (
            <input
              key={side}
              type="number"
              min={0}
              max={50}
              value={settings.customMarginsMm?.[side] ?? 15}
              onChange={(event) => patch({ customMarginsMm: { top: settings.customMarginsMm?.top ?? 15, right: settings.customMarginsMm?.right ?? 15, bottom: settings.customMarginsMm?.bottom ?? 15, left: settings.customMarginsMm?.left ?? 15, [side]: Number(event.target.value) } })}
              className="vgt-input min-w-0"
              aria-label={copy.marginSideLabels[side]}
            />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex min-w-0 items-center justify-between gap-2 rounded bg-white/5 px-2 py-2"><span className="break-words">{copy.fitToWidth}</span><input type="checkbox" checked={Boolean(settings.fitToWidth)} onChange={(event) => patch({ fitToWidth: event.target.checked })} /></label>
        <label className="flex min-w-0 items-center justify-between gap-2 rounded bg-white/5 px-2 py-2"><span className="break-words">{copy.showGridlines}</span><input type="checkbox" checked={Boolean(settings.showGridlines)} onChange={(event) => patch({ showGridlines: event.target.checked })} /></label>
        <label className="flex min-w-0 items-center justify-between gap-2 rounded bg-white/5 px-2 py-2"><span className="break-words">{copy.showHeadings}</span><input type="checkbox" checked={Boolean(settings.showHeadings)} onChange={(event) => patch({ showHeadings: event.target.checked })} /></label>
        <label className="flex min-w-0 items-center justify-between gap-2 rounded bg-white/5 px-2 py-2"><span className="break-words">{copy.repeatHeaderRow}</span><input type="checkbox" checked={Boolean(settings.repeatHeaderRow)} onChange={(event) => patch({ repeatHeaderRow: event.target.checked })} /></label>
      </div>
      <input aria-label={copy.headerLabel} value={settings.headerCenter ?? ''} onChange={(event) => patch({ headerCenter: event.target.value || undefined })} className="vgt-input w-full min-w-0" placeholder={copy.headerPlaceholder} />
      <input aria-label={copy.footerLabel} value={settings.footerCenter ?? ''} onChange={(event) => patch({ footerCenter: event.target.value || undefined })} className="vgt-input w-full min-w-0" placeholder={copy.footerPlaceholder} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={onPrint} className="vgt-button-primary whitespace-normal break-words">{copy.printPreview}</button>
        <button type="button" onClick={() => onExportPdf('selection')} className="vgt-button-primary whitespace-normal break-words">{copy.pdfSelection}</button>
        <button type="button" onClick={() => onExportPdf('all-visible-sheets')} className="vgt-button-secondary col-span-1 whitespace-normal break-words sm:col-span-2">{copy.pdfAllVisibleSheets}</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onExportPortable('csv', selectedRange)} className="vgt-button-secondary">CSV</button>
        <button type="button" onClick={() => onExportPortable('tsv', selectedRange)} className="vgt-button-secondary">TSV</button>
        <button type="button" onClick={() => onExportPortable('json', selectedRange)} className="vgt-button-secondary">JSON</button>
      </div>
    </section>
  );
};
