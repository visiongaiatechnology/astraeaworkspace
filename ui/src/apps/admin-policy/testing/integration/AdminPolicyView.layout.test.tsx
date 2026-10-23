import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { AdminPolicyView } from '../../panels/AdminPolicyView';
import { DEFAULT_ADMIN_POLICY_MODEL } from '../../model/types';
import { ADMIN_POLICY_GOVERNANCE_TABS } from '../../locale/adminPolicyGovernanceLocale';

const document: WorkspaceDocument = {
  id: 'admin-policy-layout-test',
  title: 'Admin policy layout test',
  kind: 'AdminPolicy',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  adminPolicyData: DEFAULT_ADMIN_POLICY_MODEL,
};

/** Die zehn Fachbereiche plus die vier Verwaltungsbereiche — an einer Stelle gezählt. */
const EXPECTED_TAB_COUNT = 10 + ADMIN_POLICY_GOVERNANCE_TABS.length;

describe('AdminPolicyView layout contract', () => {
  it('provides a labelled policy scope, one keyboard tab per policy domain, and an associated active panel', () => {
    const html = renderToStaticMarkup(createElement(AdminPolicyView, {
      document,
      onUpdateDocument: vi.fn(),
      releaseGate: 'approved',
    }));

    expect(html).toContain('Astraea Admin &amp; Policy');
    expect(html).toContain('Current scope');
    expect(html).toContain('Owner policy write');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html.match(/role="tab"/g)).toHaveLength(EXPECTED_TAB_COUNT);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(EXPECTED_TAB_COUNT);

    const tabRelationships = Array.from(html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g));
    expect(tabRelationships).toHaveLength(EXPECTED_TAB_COUNT);
    for (const [, panelId] of tabRelationships) {
      expect(html).toContain(`id="${panelId}"`);
    }

    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-label="Access policy panel"');
    expect(html).toContain('Activate 15m break-glass');
  });

  it('renders the enforcement surface with a real decision instead of a claimed one', () => {
    const html = renderToStaticMarkup(createElement(AdminPolicyView, {
      document,
      onUpdateDocument: vi.fn(),
      initialTab: 'Enforce',
      releaseGate: 'approved',
    }));

    // Der Entscheidungszustand wird beim Rendern wirklich berechnet: die Attribute tragen den Code,
    // den `evaluateAdminOperation` zurückgegeben hat, nicht eine Erfolgsmeldung.
    expect(html).toContain('data-admin-decision=');
    expect(html).toContain('data-admin-decision-reason=');

    // Der Compliance-Bericht kommt aus Aufrufen der Autoritätsfunktion; die Zähler tragen ihre Werte.
    expect(html).toMatch(/data-admin-compliance-enforced="\d+"/u);
    expect(html).toMatch(/data-admin-compliance-violations="\d+"/u);
    expect(html).toMatch(/data-admin-compliance-gaps="\d+"/u);
    expect(html).toMatch(/data-admin-compliance-blocking="(?:true|false)"/u);

    // Die Nachweis-Matrix steht vollständig auf der sichtbaren Fläche.
    expect(html.match(/data-admin-matrix-operation=/g)?.length ?? 0).toBeGreaterThanOrEqual(15);
  });

  it('renders the catalog, the authoring forms and the interchange surface', () => {
    const catalog = renderToStaticMarkup(createElement(AdminPolicyView, { document, onUpdateDocument: vi.fn(), initialTab: 'Catalog', releaseGate: 'approved' }));
    expect(catalog).toContain('data-admin-inspector-policy=');
    expect(catalog).toContain('data-admin-catalog-hits=');
    expect(catalog).toContain('data-admin-catalog-state=');

    const author = renderToStaticMarkup(createElement(AdminPolicyView, { document, onUpdateDocument: vi.fn(), initialTab: 'Author', releaseGate: 'approved' }));
    expect(author).toContain('data-admin-authoring="true"');
    expect(author).toContain('data-admin-preview-allowed=');
    expect(author).toContain('data-admin-assign-authority=');

    const interchange = renderToStaticMarkup(createElement(AdminPolicyView, { document, onUpdateDocument: vi.fn(), initialTab: 'Interchange', releaseGate: 'approved' }));
    expect(interchange).toContain('data-admin-interchange="true"');
    expect(interchange).toContain('data-admin-diff=');
  });
});
