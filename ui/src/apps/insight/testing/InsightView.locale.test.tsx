// STATUS: PLATIN — Insight visible labels and accessibility names render from every supported catalog.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_INSIGHT_MODEL } from '../domain/types';
import { insightCopy } from '../locale/insightLocale';
import { formatInsightUsd } from '../interactions/insightCrossFilter';
import { InsightView } from '../views/InsightView';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { shellChromeCopy } from '../../../shell/i18n/shellChromeLocale';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const document = {
  id: 'insight-locale-test',
  kind: 'Insight',
  modified_at: 0,
  version: 1,
  insightData: structuredClone(DEFAULT_INSIGHT_MODEL),
} as unknown as WorkspaceDocument;

describe('Insight locale catalog', () => {
  it.each(WORKSPACE_LOCALES)('renders the report surface and accessible controls in %s', (locale) => {
    localeState.current = locale;
    const copy = insightCopy(locale);
    const markup = renderToStaticMarkup(<InsightView document={document} onUpdateDocument={vi.fn()} />);

    expect(markup).toContain(copy.productTitle.replaceAll('&', '&amp;'));
    expect(markup).toContain(`aria-label="${copy.workspaceLabel}"`);
    expect(markup).toContain(`aria-label="${copy.undo}"`);
    expect(markup).toContain(copy.revenueByRegion);
    expect(markup).toContain(copy.transformPipeline);
    expect(markup).toContain(copy.queryDescription);
    expect(markup).toContain(`<option value="region">${copy.region}</option>`);
    expect(markup).toContain(`<option value="activeUsers">${copy.activeUsers}</option>`);
    expect(markup).toContain(copy.aggregation('SUM'));
    const capability = shellChromeCopy(locale).status.capability.None;
    expect(markup).toContain(`${copy.network}: ${capability} · ${copy.accessibilityFindings}:`);
    const totalRevenue = DEFAULT_INSIGHT_MODEL.records.reduce((sum, record) => sum + record.revenue, 0);
    expect(markup).toContain(formatInsightUsd(totalRevenue, locale));
    const activePage = DEFAULT_INSIGHT_MODEL.report.pages.find((page) => page.id === DEFAULT_INSIGHT_MODEL.report.activePageId);
    expect(activePage).toBeDefined();
    if (activePage) {
      expect(markup).toContain(copy.screenReaderSummary(
        DEFAULT_INSIGHT_MODEL.datasetName,
        activePage.name,
        activePage.visuals.filter((visual) => visual.visible).length,
        activePage.filters.filter((filter) => filter.enabled).length + DEFAULT_INSIGHT_MODEL.report.reportFilters.filter((filter) => filter.enabled).length,
      ));
    }
    expect(markup).not.toContain('Query rejected:');
  });

  it('interpolates row counts, timing, and region names without changing action identifiers', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = insightCopy(locale);
      expect(copy.querySuccess(12, '4.5')).toContain('12');
      expect(copy.filterToRegion('Europe-Central', 40)).toContain('Europe-Central');
      expect(copy.removeStep(3)).toContain('3');
      expect(copy.screenReaderSummary('Dataset', 'Overview', 4, 2)).not.toMatch(/\{(?:datasetName|pageName|visualCount|filterCount)\}/);
    }
  });
});
