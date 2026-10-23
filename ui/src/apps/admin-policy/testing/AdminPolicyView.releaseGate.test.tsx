// STATUS: PLATIN — Sicherheits-Gate-Vertrag für Admin & Policy in der Beta.
//
// **Was hier gemessen wird:** Der Produktionspfad (`AppWorkspaceView` rendert `<AdminPolicyView … />`
// ohne Gate-Override) darf eine App, deren Richtlinien von keinem Workspace-Modul durchgesetzt werden,
// nicht als bearbeitbare Governance-Konsole anbieten. Die Gate-Ansicht darf nichts schreiben und keine
// Authoring-/Enforce-Flächen zeigen. Der `approved`-Pfad existiert nur für die bestehenden Panel-Tests.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_ADMIN_POLICY_MODEL } from '../model/types';
import { AdminPolicyView } from '../panels/AdminPolicyView';
import { securityGateDecisionOf } from '../../../edition/releaseStatus';

// Die Gate-Texte sind Beta-Kennzeichnung; für den deutschsprachigen Release-Pfad werden sie deutsch geprüft.
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: 'de-DE' }),
}));

const document = {
  id: 'admin-policy-gate',
  kind: 'AdminPolicy',
  modified_at: 0,
  version: 1,
  adminPolicyData: structuredClone(DEFAULT_ADMIN_POLICY_MODEL),
} as unknown as WorkspaceDocument;

describe('Admin & Policy release gate', () => {
  it('is registered as a blocked security gate in this Beta', () => {
    expect(securityGateDecisionOf('AdminPolicy')).toBe('blocked');
  });

  it('renders the blocked gate on the production path instead of an editable console', () => {
    const onUpdateDocument = vi.fn();
    const markup = renderToStaticMarkup(<AdminPolicyView document={document} onUpdateDocument={onUpdateDocument} />);

    expect(markup).toContain('data-admin-policy-release-gate="blocked"');
    expect(markup).toContain('data-release-gate="security-gate-blocked"');
    // Die Gate-Ansicht erklärt den Befund und schreibt nichts.
    expect(markup).toContain('nicht durchgesetzt');
    expect(markup).toContain('Bestehende Richtliniendaten bleiben erhalten');
    // Keine Authoring-/Governance-Flächen, keine Schreibaktion.
    expect(markup).not.toContain('data-admin-authoring="true"');
    expect(markup).not.toContain('data-admin-governance="enforce"');
    expect(onUpdateDocument).not.toHaveBeenCalled();
  });

  it('keeps the internal panels reachable only through the explicit test-only approval override', () => {
    const markup = renderToStaticMarkup(
      <AdminPolicyView document={document} initialTab="Catalog" releaseGate="approved" onUpdateDocument={vi.fn()} />,
    );
    expect(markup).not.toContain('data-admin-policy-release-gate="blocked"');
    expect(markup).toContain('data-admin-governance="catalog"');
  });
});
