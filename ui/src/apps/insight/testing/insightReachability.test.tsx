// STATUS: PLATIN — BATCH-INSIGHT-2 render contract: the operations whose engines existed but were
// reachable from no component are now on the visible Insight surface.
//
// Reachability evidence, measured before this batch:
//  - import: `connectors/insightConnectorEngine.ts` + `connectors/insightImportCore.ts` — 0 importers
//    in any component, no file input anywhere.
//  - export: `exportRowsXlsx`, `exportReportPdf`, `exportReportPng` — 0 importers (only `exportRowsCsv`
//    was wired).
//  - lineage/performance: `analysis/insightAnalysisEngine.ts` — 0 importers.
//  - offline snapshot: `refresh/insightRefreshEngine.ts` — 0 importers.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NetworkCapability, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { DEFAULT_INSIGHT_MODEL } from '../domain/types';
import { insightCopy } from '../locale/insightLocale';
import { InsightView } from '../views/InsightView';
import { InsightReportFooter } from '../components/InsightReportFooter';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const docWith = (insightData: unknown) => ({
  id: 'insight-reachability', kind: 'Insight', modified_at: 0, version: 1, insightData,
} as unknown as WorkspaceDocument);
const render = (document: WorkspaceDocument, networkCapability: NetworkCapability = 'None') =>
  renderToStaticMarkup(<InsightView document={document} onUpdateDocument={vi.fn()} networkCapability={networkCapability} />);

describe('Insight import and export are on the visible surface', () => {
  it('offers a real file input for the bounded local import', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    expect(markup).toContain('data-insight-import="true"');
    expect(markup).toContain('data-insight-import-input="true"');
    expect(markup).toContain('type="file"');
    // The accepted kinds are the ones the import core really reads.
    for (const extension of ['.csv', '.tsv', '.json']) expect(markup).toContain(extension);
    expect(markup).toContain(`aria-label="${insightCopy('en-US').importLabel}"`);
  });

  it('offers XLSX and PDF export next to CSV, with their own labels', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    expect(markup).toContain('data-insight-export="xlsx"');
    expect(markup).toContain('data-insight-export="pdf"');
    const copy = insightCopy('en-US');
    expect(markup).toContain(copy.exportXlsx);
    expect(markup).toContain(copy.exportPdf);
    expect(markup).toContain(copy.csv);
    // The existing app-guide anchor stays where the guide expects it.
    expect(markup).toContain('data-vgt-app-guide-anchor="Insight:second"');
  });

  it('offers sealing and verifying an offline snapshot next to the encrypted export', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-seal-snapshot="true"');
    expect(markup).toContain('data-insight-verify-snapshot="true"');
    expect(markup).toContain(copy.sealSnapshot);
    expect(markup).toContain(copy.verifySnapshot);
    // The offline state of the provenance panel is derived from the cache, so it stays honest.
    expect(markup).toContain('data-insight-offline-state="none"');
  });

  it('offers the encrypted native interchange next to CSV, XLSX and PDF', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-export="vinsight"');
    expect(markup).toContain('data-insight-passphrase="true"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain(copy.exportEncrypted);
    expect(markup).toContain(copy.passphraseLabel);
    // The same file input accepts the encrypted container, which is read back with a real identity check.
    expect(markup).toContain('.vinsight');
  });

  it('renders the workbook picker and marks a workbook without a reader as not readable', () => {
    const workbook = {
      id:'workbook-q3', kind:'Grid', title:'Sales workbook Q3', created_at:1, modified_at:2, version:7, root_object_ids:[], objects:{}, gridData:{ sheets:[] },
    } as unknown as WorkspaceDocument;
    const taskList = { id:'tasks-1', kind:'Tasks', title:'Task list', version:2, objects:{} } as unknown as WorkspaceDocument;
    const markup = renderToStaticMarkup(<InsightView document={docWith(structuredClone(DEFAULT_INSIGHT_MODEL))} onUpdateDocument={vi.fn()} workspaceDocuments={[workbook, taskList]} />);
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-workspace-source="true"');
    expect(markup).toContain('data-insight-connect-source="true"');
    expect(markup).toContain(copy.connectSource);
    expect(markup).toContain('Sales workbook Q3 · v7');
    expect(markup).toContain('Task list · v2');
    // The task list has no reader in this build, so it is offered but disabled, never silently hidden.
    expect(markup).toContain('disabled=""');
    // Without a workspace list the picker says so instead of pretending to offer something.
    const bare = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    expect(bare).toContain(insightCopy('en-US').noWorkspaceSources);
  });

  it('keeps every new control labelled in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = insightCopy(locale);
      const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
      expect(markup).toContain(copy.importLabel);
      expect(markup).toContain(copy.exportXlsx);
      expect(markup).toContain(copy.exportPdf);
      expect(markup).toContain(copy.provenanceTitle);
      expect(markup).toContain(copy.exportEncrypted);
      expect(markup).toContain(copy.passphraseLabel);
      expect(markup).toContain(copy.connectSource);
    }
    localeState.current = 'en-US';
  });
});

describe('Insight authoring is on the visible surface', () => {
  it('renders the empty-dataset and KPI-card controls with accessible names', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    const copy = insightCopy('en-US');
    expect(markup).toContain('data-insight-authoring="true"');
    expect(markup).toContain(`aria-label="${copy.authoringTitle}"`);
    expect(markup).toContain('data-insight-dataset-name="true"');
    expect(markup).toContain('data-insight-create-dataset="true"');
    expect(markup).toContain('data-insight-kpi-title="true"');
    expect(markup).toContain('data-insight-kpi-measure="true"');
    expect(markup).toContain('data-insight-create-kpi="true"');
    expect(markup).toContain(copy.createDataset);
    expect(markup).toContain(copy.createKpi);
    for (const measure of ['revenue', 'margin', 'activeUsers', 'anomaly'] as const) expect(markup).toContain(copy.measureLabel(measure));
    // Nothing was refused, so no refusal is claimed.
    expect(markup).not.toContain('data-insight-authoring-error');
  });

  it('names the absence of a KPI card instead of rendering an empty grid', () => {
    const model = structuredClone(DEFAULT_INSIGHT_MODEL);
    model.kpis = [];
    const markup = render(docWith(model));
    expect(markup).toContain('data-insight-kpi-count="0"');
    expect(markup).toContain(insightCopy('en-US').noKpiCards);
  });

  it('renders the authoring labels in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = insightCopy(locale);
      const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
      expect(markup).toContain(copy.createDataset);
      expect(markup).toContain(copy.createKpi);
      expect(markup).toContain(copy.measureLabel('margin'));
    }
    localeState.current = 'en-US';
  });
});

describe('Insight provenance panel carries the computed facts', () => {
  const model = () => structuredClone(DEFAULT_INSIGHT_MODEL);
  const footer = (insightData: typeof DEFAULT_INSIGHT_MODEL, online = false) =>
    renderToStaticMarkup(<InsightReportFooter model={insightData} online={online} />);

  it('renders the lineage the analysis engine derived from the open document', () => {
    const markup = footer(model());
    // 1 source + 1 query + 1 table + 1 measure + 2 visuals = 6 nodes;
    // source->query, query->table, table->measure, query->visual ×2 = 5 edges, all resolved.
    expect(markup).toContain('data-insight-lineage-nodes="6"');
    expect(markup).toContain('data-insight-lineage-edges="5"');
    expect(markup).toContain('data-insight-lineage-unresolved="0"');
    expect(markup).toContain(insightCopy('en-US').lineageSummary(6, 5, 0));
  });

  it('renders the sources with their canonical URI and trust, and the measured columns', () => {
    const markup = footer(model());
    expect(markup).toContain('data-insight-source-id="src-local"');
    expect(markup).toContain('vgt://insight/embedded/operations');
    expect(markup).toContain('local-trusted');
    expect(markup).toContain('organizational');
    expect(markup).toContain('data-insight-provenance-columns="0"');
    const withSchema = model();
    withSchema.sources[0].schema = { tables:[{ name:'Operations', columns:[{ name:'revenue', type:'currency', nullable:false }] }], discoveredAt: 1 };
    expect(footer(withSchema)).toContain('data-insight-provenance-columns="1"');
  });

  it('renders the model diagnostics and the governance owner view', () => {
    const markup = footer(model());
    const copy = insightCopy('en-US');
    // diagnoseModel flags the unused canonical columns of the seeded model.
    expect(markup).toMatch(/data-insight-provenance="true"/);
    expect(markup.includes(copy.diagnosticsNone) || /Model diagnostics: \d+/.test(markup)).toBe(true);
    expect(markup).toContain('local-owner · none · internal');
  });

  it('renders the measured operations only from real samples', () => {
    const empty = footer(model());
    expect(empty).toContain('data-insight-perf-samples="0"');
    expect(empty).toContain(insightCopy('en-US').performanceNone);
    const measured = model();
    measured.performance = [
      { id:'perf-1', kind:'query', objectId:'q-main', durationMs:12.5, at:1, rows:4 },
      { id:'perf-2', kind:'query', objectId:'q-main', durationMs:7.5, at:2, rows:4 },
    ];
    const markup = footer(measured);
    expect(markup).toContain('data-insight-perf-samples="2"');
    expect(markup).toContain(insightCopy('en-US').performanceLine(2, '20.0', '12.5'));
  });

  it('names the offline snapshot state instead of implying a live source', () => {
    const noSnapshot = footer(model());
    expect(noSnapshot).toContain('data-insight-offline-state="none"');
    expect(noSnapshot).toContain(insightCopy('en-US').offlineNoSnapshot);
    const withSnapshot = model();
    withSnapshot.cache.snapshotAt = 1_767_225_600_000;
    withSnapshot.cache.sourceState = 'fresh';
    const offline = footer(withSnapshot);
    expect(offline).toContain('data-insight-offline-state="snapshot"');
    expect(offline).toContain('data-insight-source-state="fresh"');
    expect(offline).toContain(insightCopy('en-US').offlineSnapshot(new Date(1_767_225_600_000).toLocaleString('en-US'), 'fresh'));
    // Online the panel reports the source state and never claims an offline snapshot.
    const online = footer(withSnapshot, true);
    expect(online).toContain('data-insight-offline-state="online"');
    expect(online).toContain(insightCopy('en-US').sourceStateLabel('fresh'));
    expect(online).not.toContain(insightCopy('en-US').offlineNoSnapshot);
  });

  it('is reachable from the rendered view itself', () => {
    const markup = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)));
    expect(markup).toContain('data-insight-provenance="true"');
    expect(markup).toContain('data-insight-lineage-nodes="6"');
    // The default network capability is "None", i.e. this build is offline.
    expect(markup).toContain('data-insight-offline-state="none"');
    const online = render(docWith(structuredClone(DEFAULT_INSIGHT_MODEL)), 'WhitelistedOnly');
    expect(online).toContain('data-insight-offline-state="online"');
  });
});
