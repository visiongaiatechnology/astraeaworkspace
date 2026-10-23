// STATUS: PLATIN — seven-locale rendered coverage for Writer page setup chrome and geometry.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';
import type { PageSetupConfig } from '../../../types';
import { WriterPageSetupModal } from '../WriterPageSetupModal';
import { WRITER_PAGE_SETUP_COPY } from '../writerPageSetupLocale';
import { WriterPageSetupColumnsTab } from '../WriterPageSetupColumnsTab';
import { WriterPageSetupHeadersTab } from '../WriterPageSetupHeadersTab';
import { WriterPageSetupBordersTab } from '../WriterPageSetupBordersTab';
import { WriterWatermarkTab } from '../WriterWatermarkTab';
import { WRITER_PAGE_SETUP_TABS_COPY, writerPageSetupValidationFallback } from '../writerPageSetupTabsLocale';

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const config: PageSetupConfig = {
  paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
  showPageNumbers: true, headerText: '', footerText: '', columns: 1, columnGapMm: 10,
};
const expandedConfig: PageSetupConfig = {
  ...config,
  columns: 2,
  columnWidthsMm: [90, 90],
  firstPageDifferent: true,
  oddEvenDifferent: true,
  firstPageHeaderText: '',
  firstPageFooterText: '',
  evenPageHeaderText: '',
  evenPageFooterText: '',
  pageNumberFormat: 'roman-upper',
  pageNumberPosition: 'header-center',
  pageBorders: { style: 'dashed', widthPt: 2, color: '#475569', paddingMm: 5 },
  watermark: { enabled: true, text: 'AUTHORED WATERMARK', opacity: 0.08, rotationDeg: -45, color: '#94a3b8' },
};
const noop = (): void => undefined;
const props = {
  isOpen: true,
  onClose: noop,
  config,
  onUpdateConfig: noop,
  isSectionConfig: false,
  canCreateSection: false,
  onCreateSection: noop,
  onRemoveSection: noop,
};

describe('Writer page setup localization', () => {
  it('keeps all seven catalogs complete and stable across nested choice groups', () => {
    const base = WRITER_PAGE_SETUP_COPY['en-US'];
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_PAGE_SETUP_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(Object.keys(base).sort());
      expect(Object.keys(copy.tabs).sort(), `${locale}.tabs`).toEqual(Object.keys(base.tabs).sort());
      expect(Object.keys(copy.sectionBreaks).sort(), `${locale}.sectionBreaks`).toEqual(Object.keys(base.sectionBreaks).sort());
      expect(Object.keys(copy.geometry).sort(), `${locale}.geometry`).toEqual(Object.keys(base.geometry).sort());
      expect(Object.keys(copy.geometry.presets).sort(), `${locale}.presets`).toEqual(Object.keys(base.geometry.presets).sort());
      expect(Object.keys(copy.geometry.paperColors).sort(), `${locale}.paperColors`).toEqual(Object.keys(base.geometry.paperColors).sort());
      expect(copy.sectionRestartError, `${locale}.sectionRestartError`).toContain('9');
    }
  });

  it('renders localized modal chrome and geometry controls for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = WRITER_PAGE_SETUP_COPY[locale];
      const markup = renderToStaticMarkup(<WriterPageSetupModal {...props} />);

      expect(markup).toContain(copy.title);
      expect(markup).toContain(`aria-label="${copy.closeDialog}"`);
      expect(markup).toContain(copy.tabs.geometry);
      expect(markup).toContain(copy.tabs.headers);
      expect(markup).toContain(copy.standardDocument);
      expect(markup).toContain(copy.geometry.paperSize);
      expect(markup).toContain(copy.geometry.orientation);
      expect(markup).toContain(copy.geometry.marginsAndGutter);
      expect(markup).toContain(copy.geometry.pageBackground);
      expect(markup).toContain(copy.geometry.paperColors.white);
      expect(markup).toContain(`aria-label="${copy.geometry.customBackground}"`);
      expect(markup).toContain(`>${copy.apply}</button>`);
      if (locale === 'de-DE' || locale === 'ru-RU') {
        expect(markup).toContain('max-w-xl w-full');
        expect(markup).toContain('vgt-dialog-scroll-surface');
      }
    }
  });

  it('renders localized section controls when editing section-specific setup', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'it-IT', locale: 'it-IT', setPreference: noop });
    const copy = WRITER_PAGE_SETUP_COPY['it-IT'];
    const markup = renderToStaticMarkup(<WriterPageSetupModal {...props} isSectionConfig canCreateSection />);
    expect(markup).toContain(copy.activeSection);
    expect(markup).toContain(copy.createSection);
    expect(markup).toContain(copy.sectionStart);
    expect(markup).toContain(copy.sectionBreaks['next-page']);
    expect(markup).toContain(copy.removeSection);
  });

  it('keeps all seven catalogs aligned and renders each formerly mixed-locale tab', () => {
    const base = WRITER_PAGE_SETUP_TABS_COPY['en-US'];
    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_PAGE_SETUP_TABS_COPY[locale];
      expect(Object.keys(copy).sort(), `${locale}.tabs`).toEqual(Object.keys(base).sort());
      expect(Object.keys(copy.validationReasons).sort(), `${locale}.validationReasons`).toEqual(Object.keys(base.validationReasons).sort());
      for (const group of ['columns', 'headers', 'borders', 'watermark'] as const) {
        expect(Object.keys(copy[group]).sort(), `${locale}.${group}`).toEqual(Object.keys(base[group]).sort());
      }
      expect(Object.keys(copy.headers.numberFormats).sort()).toEqual(Object.keys(base.headers.numberFormats).sort());
      expect(Object.keys(copy.headers.positions).sort()).toEqual(Object.keys(base.headers.positions).sort());
      expect(Object.keys(copy.borders.styles).sort()).toEqual(Object.keys(base.borders.styles).sort());
      expect(Object.keys(copy.watermark.presets).sort()).toEqual(Object.keys(base.watermark.presets).sort());

      const noopDispatch: React.Dispatch<React.SetStateAction<number | undefined>> = () => undefined;
      const columns = renderToStaticMarkup(<WriterPageSetupColumnsTab config={expandedConfig} bodyWidthMm={180} onUpdateConfig={noop} onSelectColumnCount={noop} onSetCustomColumnWidths={noop} onColumnWidthChange={noop} onEqualizeColumns={noop} copy={copy.columns} />);
      const headers = renderToStaticMarkup(<WriterPageSetupHeadersTab config={expandedConfig} isSectionConfig restartPageNumberAt={2} setRestartPageNumberAt={noopDispatch} onUpdateConfig={noop} copy={copy.headers} />);
      const documentHeaders = renderToStaticMarkup(<WriterPageSetupHeadersTab config={expandedConfig} isSectionConfig={false} restartPageNumberAt={undefined} setRestartPageNumberAt={noopDispatch} onUpdateConfig={noop} copy={copy.headers} />);
      const borders = renderToStaticMarkup(<WriterPageSetupBordersTab config={expandedConfig} onUpdateConfig={noop} copy={copy.borders} />);
      const watermark = renderToStaticMarkup(<WriterWatermarkTab config={expandedConfig} onUpdateConfig={noop} copy={copy.watermark} />);

      for (const label of [
        copy.columns.layout, ...Object.values(copy.columns.count), copy.columns.gap, copy.columns.widths,
        copy.columns.widthHelp, copy.columns.custom, copy.columns.columnWidth(1), copy.columns.columnWidth(2),
        copy.columns.remaining('-10.00'), copy.columns.distribute,
      ]) expect(columns, `${locale}.columns.${label}`).toContain(label);
      for (const label of [
        copy.headers.header, copy.headers.footer, copy.headers.standardOdd, copy.headers.headerPlaceholder,
        copy.headers.footerPlaceholder, copy.headers.firstPageDifferent, copy.headers.firstHeader,
        copy.headers.firstFooter, copy.headers.firstHeaderPlaceholder, copy.headers.firstFooterPlaceholder,
        copy.headers.oddEvenDifferent, copy.headers.evenHeader, copy.headers.evenFooter,
        copy.headers.evenHeaderPlaceholder, copy.headers.evenFooterPlaceholder, copy.headers.linkHeader,
        copy.headers.linkFooter, copy.headers.showPageNumbers, copy.headers.numberFormat,
        ...Object.values(copy.headers.numberFormats), copy.headers.position, ...Object.values(copy.headers.positions),
        copy.headers.restartInSection, copy.headers.startInSection, copy.headers.chapterNumbering,
      ]) expect(headers, `${locale}.headers.${label}`).toContain(label);
      expect(documentHeaders).toContain(copy.headers.startInDocument);
      expect(documentHeaders).toContain(`aria-label="${copy.headers.startInDocument}"`);
      for (const label of [
        copy.borders.enable, copy.borders.style, ...Object.values(copy.borders.styles),
        copy.borders.width, copy.borders.color, copy.borders.padding,
      ]) expect(borders, `${locale}.borders.${label}`).toContain(label);
      for (const label of [
        copy.watermark.enabled, copy.watermark.enabledHelp, copy.watermark.text,
        ...Object.values(copy.watermark.presets), copy.watermark.opacity, copy.watermark.rotation,
        copy.watermark.color,
      ]) expect(watermark, `${locale}.watermark.${label}`).toContain(label);
      expect(columns).toContain(`aria-label="${copy.columns.gap}"`);
      expect(columns).toContain(`aria-label="${copy.columns.columnWidth(1)}"`);
      for (const label of [copy.headers.header, copy.headers.footer, copy.headers.firstHeader, copy.headers.firstFooter,
        copy.headers.evenHeader, copy.headers.evenFooter, copy.headers.numberFormat, copy.headers.position]) {
        expect(headers).toContain(`aria-label="${label}"`);
      }
      expect(borders).toContain(`aria-label="${copy.borders.style}"`);
      expect(borders).toContain(`aria-label="${copy.borders.width}"`);
      expect(borders).toContain(`aria-label="${copy.borders.padding}"`);
      expect(borders).toContain(`aria-label="${copy.borders.color}"`);
      expect(watermark).toContain(copy.watermark.presets.CONFIDENTIAL);
      expect(watermark).toContain('AUTHORED WATERMARK');
      expect(watermark).toContain(`aria-label="${copy.watermark.textAccessibleName}"`);
      expect(watermark).toContain(`aria-label="${copy.watermark.opacity}"`);
      expect(watermark).toContain(`aria-label="${copy.watermark.colorAccessibleName}"`);
    }
  });

  it('keeps German/Russian tab labels readable at narrow widths', () => {
    const privateFailure = new Error('validator-internal: /private/config.json');
    for (const locale of ['de-DE', 'ru-RU'] as const) {
      const copy = WRITER_PAGE_SETUP_TABS_COPY[locale];
      const columns = renderToStaticMarkup(<WriterPageSetupColumnsTab config={expandedConfig} bodyWidthMm={180} onUpdateConfig={noop} onSelectColumnCount={noop} onSetCustomColumnWidths={noop} onColumnWidthChange={noop} onEqualizeColumns={noop} copy={copy.columns} />);
      const headers = renderToStaticMarkup(<WriterPageSetupHeadersTab config={expandedConfig} isSectionConfig restartPageNumberAt={2} setRestartPageNumberAt={() => undefined} onUpdateConfig={noop} copy={copy.headers} />);
      const borders = renderToStaticMarkup(<WriterPageSetupBordersTab config={expandedConfig} onUpdateConfig={noop} copy={copy.borders} />);
      const watermark = renderToStaticMarkup(<WriterWatermarkTab config={expandedConfig} onUpdateConfig={noop} copy={copy.watermark} />);

      expect(columns).toContain(copy.columns.widthHelp);
      expect(columns).toContain(copy.columns.distribute);
      expect(headers).toContain('max-h-[380px] overflow-y-auto');
      expect(headers).toContain(copy.headers.firstHeaderPlaceholder);
      expect(borders).toContain(copy.borders.padding);
      expect(borders).toContain(copy.borders.styles.dashed);
      expect(watermark).toContain(copy.watermark.enabledHelp);
      expect(watermark).toContain(copy.watermark.colorAccessibleName);
      const genericValidationAlert = renderToStaticMarkup(<div role="alert">{writerPageSetupValidationFallback(locale, privateFailure)}</div>);
      expect(genericValidationAlert).toContain(copy.validationError);
      expect(genericValidationAlert).not.toContain('private');
      expect(genericValidationAlert).not.toContain('config.json');
    }
  });

  it('renders localized validation reasons for every known German validator message', () => {
    const knownFailures = [
      ['Der Seitennummern-Startwert muss eine ganze Zahl zwischen 1 und 9.999 sein.', 'pageNumbers'],
      ['Das Seitennummernformat ist ungültig.', 'pageNumbers'],
      ['Die Seitennummernposition ist ungültig.', 'pageNumbers'],
      ['Benutzerdefinierte Seitenmaße müssen zwischen 25 und 2.000 mm liegen.', 'customDimensions'],
      ['Seitenränder und Bundsteg müssen zwischen 0 und 200 mm liegen.', 'margins'],
      ['Innen-/Außenrand und Bundsteg müssen mindestens 10 mm nutzbare Seitenbreite lassen.', 'margins'],
      ['Oberer und unterer Rand müssen mindestens 10 mm nutzbare Seitenhöhe lassen.', 'margins'],
      ['Die Spaltenanzahl muss zwischen eins und vier liegen.', 'columns'],
      ['Der Spaltenabstand muss zwischen 0 und 100 mm liegen.', 'columns'],
      ['Spalten und Abstände müssen jeder Spalte mindestens 5 mm nutzbare Breite lassen.', 'columns'],
      ['Individuelle Spaltenbreiten benötigen exakt 2 Werte zwischen 5 und 1.000 mm.', 'columns'],
      ['Individuelle Spaltenbreiten und Abstände müssen die nutzbare Seitenbreite vollständig ausfüllen.', 'columns'],
      ['Die Papieroberfläche ist ungültig.', 'decorations'],
      ['Die benutzerdefinierte Hintergrundfarbe muss das Format #RRGGBB verwenden.', 'decorations'],
      ['Der Seitenrahmenstil ist ungültig.', 'decorations'],
      ['Die Seitenrahmenfarbe muss das Format #RRGGBB verwenden.', 'decorations'],
      ['Seitenrahmen-Werte müssen in gültigen Grenzen liegen (0–36 pt Breite, 0–50 mm Abstand).', 'decorations'],
      ['Der Wasserzeichenstatus ist ungültig.', 'decorations'],
      ['Die Wasserzeichenfarbe muss das Format #RRGGBB verwenden.', 'decorations'],
      ['Die Wasserzeichendeckkraft muss zwischen 2 und 30 Prozent liegen.', 'decorations'],
      ['Die Wasserzeichendrehung muss zwischen -180 und 180 Grad liegen.', 'decorations'],
      ['Ein aktives Wasserzeichen benötigt 1 bis 120 Zeichen.', 'decorations'],
      ['Kopf- und Fußzeilentexte dürfen jeweils höchstens 4.096 Zeichen enthalten.', 'headerFooter'],
    ] as const;

    for (const locale of WORKSPACE_LOCALES) {
      const copy = WRITER_PAGE_SETUP_TABS_COPY[locale];
      for (const [message, reason] of knownFailures) {
        const localizedAlert = renderToStaticMarkup(<div role="alert">{writerPageSetupValidationFallback(locale, message)}</div>);
        expect(localizedAlert, `${locale}.${reason}`).toContain(copy.validationReasons[reason]);
        expect(localizedAlert).not.toContain(message);
      }
    }
  });
});
