// STATUS: DIAMANT VGT SUPREME — Page setup tab render contracts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PageSetupConfig } from '../../types';
import { WriterPageSetupBordersTab } from '../../layout/page-setup/WriterPageSetupBordersTab';
import { WriterPageSetupColumnsTab } from '../../layout/page-setup/WriterPageSetupColumnsTab';
import { WriterPageSetupGeometryTab } from '../../layout/page-setup/WriterPageSetupGeometryTab';
import { WriterPageSetupHeadersTab } from '../../layout/page-setup/WriterPageSetupHeadersTab';
import { WRITER_PAGE_SETUP_TABS_COPY } from '../../layout/page-setup/writerPageSetupTabsLocale';
import { WRITER_PAGE_SETUP_COPY } from '../../layout/page-setup/writerPageSetupLocale';

const copy = WRITER_PAGE_SETUP_TABS_COPY['en-US'];
const geometryCopy = WRITER_PAGE_SETUP_COPY['en-US'].geometry;

const config: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
  columns: 1,
  columnGapMm: 10,
};

const onUpdateConfig = vi.fn((_candidate: PageSetupConfig): void => undefined);

describe('Writer page setup tab render contracts', () => {
  it('renders geometry and paper choices with selected-state semantics', () => {
    const markup = renderToStaticMarkup(
      <WriterPageSetupGeometryTab
        config={config}
        onUpdateConfig={onUpdateConfig}
        onSelectPaperSize={vi.fn()}
        onSelectMarginPreset={vi.fn()}
      />,
    );

    expect(markup).toContain(geometryCopy.paperSize);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(geometryCopy.customBackground);
  });

  it('renders bounded column controls and the computed remaining-width label', () => {
    const markup = renderToStaticMarkup(
      <WriterPageSetupColumnsTab
        config={{ ...config, columns: 2, columnWidthsMm: [75, 75] }}
        bodyWidthMm={160}
        onUpdateConfig={onUpdateConfig}
        onSelectColumnCount={vi.fn()}
        onSetCustomColumnWidths={vi.fn()}
        onColumnWidthChange={vi.fn()}
        onEqualizeColumns={vi.fn()}
        copy={copy.columns}
      />,
    );

    expect(markup).toContain(copy.columns.layout);
    expect(markup).toContain(copy.columns.custom);
    expect(markup).toContain('Remaining:');
  });

  it('renders document numbering and section-only restart controls from the supplied scope', () => {
    const documentMarkup = renderToStaticMarkup(
      <WriterPageSetupHeadersTab
        config={config}
        isSectionConfig={false}
        restartPageNumberAt={undefined}
        setRestartPageNumberAt={vi.fn()}
        onUpdateConfig={onUpdateConfig}
        copy={copy.headers}
      />,
    );
    const sectionMarkup = renderToStaticMarkup(
      <WriterPageSetupHeadersTab
        config={config}
        isSectionConfig
        restartPageNumberAt={1}
        setRestartPageNumberAt={vi.fn()}
        onUpdateConfig={onUpdateConfig}
        copy={copy.headers}
      />,
    );

    expect(documentMarkup).toContain(copy.headers.header);
    expect(documentMarkup).toContain(copy.headers.startInDocument);
    expect(documentMarkup).not.toContain(copy.headers.startInSection);
    expect(sectionMarkup).toContain(copy.headers.startInSection);
    expect(sectionMarkup).toContain(copy.headers.linkHeader);
  });

  it('renders border activation without materializing an inactive border model', () => {
    const markup = renderToStaticMarkup(
      <WriterPageSetupBordersTab config={config} onUpdateConfig={onUpdateConfig} copy={copy.borders} />,
    );

    expect(markup).toContain(copy.borders.enable);
    expect(markup).not.toContain('Linienstil');
  });
});
