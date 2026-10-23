// STATUS: PLATIN — Admin & Policy navigation, accessible labels, and catalog interpolation render across supported locales.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { adminPolicyCopy, type AdminPolicyTab } from '../locale/adminPolicyLocale';
import { DEFAULT_ADMIN_POLICY_MODEL, type AdminPolicyModel } from '../model/types';
import { AdminPolicyView } from '../panels/AdminPolicyView';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const document = {
  id: 'admin-policy-locale-test',
  kind: 'AdminPolicy',
  modified_at: 0,
  version: 1,
  adminPolicyData: structuredClone(DEFAULT_ADMIN_POLICY_MODEL),
} as unknown as WorkspaceDocument;

const escapeMarkup = (value: string) => value.replaceAll('&', '&amp;');

function documentForTab(tab: AdminPolicyTab): WorkspaceDocument {
  const model: AdminPolicyModel = structuredClone(DEFAULT_ADMIN_POLICY_MODEL);
  if (tab === 'Devices') {
    model.devices = [{ id: 'locale-device', name: 'Locale test device', os: 'Test OS', workspaceVersion: '1.0.0', groupIds: [], policyState: 'compliant', lastSeenAt: 0 }];
    model.deployment.blockedVersions = ['2.0.0'];
    model.deployment.approvedReleases = [{ version: '2.0.0', sequence: 1, channel: 'stable', artifactSha256: 'a'.repeat(64), signatureKeyId: 'locale-key', approvedAt: 0, rollbackApproved: false }];
  }
  if (tab === 'Retention') {
    model.retention.rules = [{ id: 'locale-retention', enabled: true, documentKinds: ['Writer'], spaceIds: [], tags: [], retentionDays: 1, action: 'delete' }];
  }
  if (tab === 'Network') {
    model.network.netGateCapabilities = [{ id: 'cap:locale-test', domains: ['test.example'], ips: [], protocols: ['imap-tls'] }];
  }
  if (tab === 'Continuity') model.continuity.lastFailureCode = 'native-backup-restore-failed';
  if (tab === 'Lifecycle') model.lifecycle.localMachinePolicy = { 'user-supplied-policy-key': 'authored-policy-value' };
  return { ...document, adminPolicyData: model } as unknown as WorkspaceDocument;
}

describe('Admin & Policy locale catalog', () => {
  it.each(WORKSPACE_LOCALES)('renders navigation and accessible shell copy in %s', (locale) => {
    localeState.current = locale;
    const copy = adminPolicyCopy(locale);
    const markup = renderToStaticMarkup(<AdminPolicyView document={document} releaseGate="approved" onUpdateDocument={vi.fn()} />);

    expect(markup).toContain(escapeMarkup(copy.title));
    expect(markup).toContain(`aria-label="${copy.toolbar}"`);
    expect(markup).toContain(`aria-label="${copy.policyDomains}"`);
    expect(markup).toContain(`aria-label="${copy.scopeNavigation}"`);
    expect(markup).toContain(copy.descriptions.Access);
    for (const tab of Object.keys(copy.tabs) as AdminPolicyTab[]) {
      expect(markup).toContain(copy.tabs[tab]);
      expect(copy.descriptions[tab]).toBeTruthy();
      expect(copy.panelLabel(copy.tabs[tab])).not.toMatch(/\{(?:tab|current|total)\}/);
    }
  });

  it.each(WORKSPACE_LOCALES)('provides translated actions, states, and interpolation in %s', (locale) => {
    const copy = adminPolicyCopy(locale);

    expect(Object.keys(copy.dlpActions)).toEqual([
      'audit',
      'warn-justify',
      'block',
      'require-recipient-encryption',
      'require-approved-space',
    ]);
    expect(Object.values(copy.dlpActions).every(Boolean)).toBe(true);
    expect(['Copy', 'Export', 'Print', 'Share', 'Clipboard', 'Connectors'].map(copy.boundary).every(Boolean)).toBe(true);
    expect(copy.value('localOnly')).toBeTruthy();
    expect(copy.value('personalScope')).toBeTruthy();
    expect(copy.auditVerificationFailed).toBeTruthy();
    expect(copy.findingCount(3)).not.toMatch(/\{count\}/);
    expect(copy.panelPosition('02', 10)).not.toMatch(/\{(?:current|total)\}/);
  });

  it.each(WORKSPACE_LOCALES)('localizes policy engine reasons and provider claims in %s', (locale) => {
    const copy = adminPolicyCopy(locale);
    const reasonCases = [
      ['device', 'target-version-invalid'], ['device', 'release-integrity-mismatch'],
      ['key-provider', 'hardware-attestation-required'], ['dlp', 'simulation:dlp-builtin-api-key'],
      ['dlp', 'simulation:dlp-audit'], ['dlp', 'simulation:dlp-block'],
      ['retention', 'legal-hold-active'], ['retention', 'retention-delete'], ['retention', 'retention-review'],
      ['network', 'external-ai-sensitivity-denied'], ['network', 'protocol-denied'],
      ['audit', 'sequence-or-link-mismatch'], ['backup', 'last-success-too-old'],
    ] as const;
    for (const [domain, code] of reasonCases) {
      expect(copy.reason(domain, code)).toBeTruthy();
      expect(copy.reason(domain, code)).not.toContain(code);
    }
    if (locale !== 'en-US') expect(copy.keyProviderClaim('Hardware-backed (verified)')).not.toContain('Hardware-backed');
    expect(copy.auditResult(true, 'ok')).not.toContain(': ok');
    expect(copy.reason('backup', 'engine-specific-failure-code')).not.toContain('engine-specific-failure-code');
  });

  it.each(WORKSPACE_LOCALES)('renders selected reason-bearing policy tabs and preserves authored Lifecycle values in %s', (locale) => {
    localeState.current = locale;
    const copy = adminPolicyCopy(locale);
    const selectedTabs: AdminPolicyTab[] = ['Devices', 'Encryption', 'DLP', 'Retention', 'Network', 'Audit', 'Continuity', 'Lifecycle'];

    for (const tab of selectedTabs) {
      const markup = renderToStaticMarkup(<AdminPolicyView document={documentForTab(tab)} initialTab={tab} releaseGate="approved" onUpdateDocument={vi.fn()} />);
      expect(markup).toContain(`aria-label="${copy.panelLabel(copy.tabs[tab])}"`);
      expect(markup).toContain(`<h2 class="adminPolicy__panelTitle">${copy.tabs[tab]}</h2>`);
      if (tab === 'Devices') expect(markup).toContain(copy.reason('device', 'target-version-blocked'));
      if (tab === 'Encryption') expect(markup).toContain(copy.keyProviderClaim('Software/OS protected (verified availability only)'));
      if (tab === 'DLP') expect(markup).toContain(copy.reason('dlp', 'simulation:dlp-audit'));
      if (tab === 'Retention') expect(markup).toContain(copy.reason('retention', 'retention-delete'));
      if (tab === 'Network') expect(markup).toContain(copy.reason('network', 'protocol-denied'));
      if (tab === 'Audit') expect(markup).toContain(copy.verifyAudit);
      if (tab === 'Continuity') expect(markup).toContain(copy.reason('backup', 'native-backup-restore-failed'));
      if (tab === 'Lifecycle') {
        expect(markup).toContain('user-supplied-policy-key');
        expect(markup).toContain('authored-policy-value');
      }
    }
    expect(copy.auditResult(false, 'event-hash-mismatch')).not.toContain('event-hash-mismatch');
    expect(copy.reason('network', 'future-connector-code')).not.toContain('future-connector-code');
  });
});
