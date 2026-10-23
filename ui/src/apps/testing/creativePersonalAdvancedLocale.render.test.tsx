// STATUS: GOLD — verifies Vault and Publish advanced surfaces use seven-locale labels.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../shell/localization/workspaceLocale';
import { creativePersonalText } from '../creativePersonalLocale';
import { VaultAdvancedModal, VaultAttestationDetails, VaultSecuritySuiteRows } from '../vault/settings/VaultAdvancedModal';
import { PublishAdvancedModal, PublishVerificationResultRows } from '../publish/prepress/PublishAdvancedModal';
import { DEFAULT_PUBLISH_MODEL } from '../publish/contracts/types';
import { AVAILABLE_ICC_PROFILES, type IccProfileId } from '../publish/prepress/publishPrepressEngine';
import { PUBLISH_ADVANCED_COPY, publishProfileDescription, publishTicViolationText, publishVerificationResultText } from '../publish/publishAdvancedLocale';
import { publishFindingMessage } from '../publish/publishInspectorLocale';
import type { PublishPreflightFinding } from '../../shared/contracts/publish/workspacePublish';
import { VAULT_ADVANCED_COPY, vaultAdvancedText, vaultAttestationProviderText, vaultProviderText, vaultSecurityLevelText, vaultSuiteResultText } from '../vault/vaultAdvancedLocale';

vi.mock('../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('>', '&gt;');
const vaultProps = {
  isOpen: true, locked: false, onClose: noop, vaultFiles: [], onExportEncryptedBackup: async () => 'backup.vvault', showToast: noop,
  peerSyncPolicy: {} as ComponentProps<typeof VaultAdvancedModal>['peerSyncPolicy'], peerDevices: [], vaultFolders: [],
  networkCapability: 'None', onPeerSyncPolicyChange: noop, onTrustPeer: noop, onRemovePeer: noop,
} satisfies ComponentProps<typeof VaultAdvancedModal>;
const publishProps = {
  isOpen: true, onClose: noop, documentTitle: 'Publication', model: DEFAULT_PUBLISH_MODEL, onUpdateModel: noop, showToast: noop,
} satisfies ComponentProps<typeof PublishAdvancedModal>;
const vaultAttestation = {
  keyId: 'key-handle-local',
  hardwareType: 'WebCrypto self-verification; Platform authenticator available for user verification; Vault key hardware binding is not asserted',
  algorithm: 'ECDSA-P256', timestamp: '2026-10-09T12:00:00.000Z', signatureHex: 'ab12cd34', valid: true,
} satisfies ComponentProps<typeof VaultAttestationDetails>['attestation'];
const unknownVaultAttestation = { ...vaultAttestation, hardwareType: 'WebCrypto self-verification; private engine diagnostic', valid: false };
const vaultSuiteResults = [
  { id: 'VGT3_CONTAINER_ROUNDTRIP', name: 'engine name', passed: true, durationMs: 1, message: 'engine message' },
  { id: 'NON_EXTRACTABLE_SIGNING', name: 'engine name', passed: false, durationMs: 2, message: 'engine message' },
  { id: 'CHUNK_INTEGRITY', name: 'engine name', passed: true, durationMs: 3, message: 'engine message' },
  { id: 'QUARANTINE_EXECUTABLE', name: 'engine name', passed: false, durationMs: 4, message: 'engine message' },
  { id: 'MEMORY_ZEROIZE', name: 'engine name', passed: true, durationMs: 5, message: 'engine message' },
  { id: 'future-suite-code', name: 'private engine suite name', passed: false, durationMs: 6, message: 'private engine diagnostic' },
] satisfies ComponentProps<typeof VaultSecuritySuiteRows>['results'];
const publishSuiteResults = [
  { id: 'VPUBLISH_CONTAINER_SEAL_ROUNDTRIP', name: 'engine name', status: 'passed', durationMs: 1, details: 'engine detail' },
  { id: 'PDFX_PREPRESS_OUTPUT_INTENT', name: 'engine name', status: 'failed', durationMs: 2, details: 'engine detail' },
  { id: 'TOTAL_INK_COVERAGE_TIC_DIAGNOSTICS', name: 'engine name', status: 'warning', durationMs: 3, details: 'engine detail' },
  { id: 'TYPOGRAPHIC_FRAME_THREADING_INVARIANTS', name: 'engine name', status: 'passed', durationMs: 4, details: 'engine detail' },
  { id: 'ACCESSIBLE_TAGGED_PDF_STRUCTURE', name: 'engine name', status: 'failed', durationMs: 5, details: 'engine detail' },
  { id: 'THIRD_PARTY_DTP_IDML_INTEROP_FIDELITY', name: 'engine name', status: 'passed', durationMs: 6, details: 'engine detail' },
  { id: 'future-suite-code', name: 'private engine suite name', status: 'failed', durationMs: 7, details: 'private engine diagnostic' },
] satisfies ComponentProps<typeof PublishVerificationResultRows>['results'];
const unknownFinding = { id: 'future-finding', severity: 'warning', category: 'Color', message: 'private engine diagnostic', navigable: false } satisfies PublishPreflightFinding;

describe('advanced creative and personal locale coverage', () => {
  it('renders localized Vault and Publish advanced headers and navigation', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const vault = renderToStaticMarkup(<VaultAdvancedModal {...vaultProps} />);
      const publish = renderToStaticMarkup(<PublishAdvancedModal {...publishProps} />);
      for (const label of ['Astraea Vault — Advanced Interop & Key Security', 'Key Capabilities & Signing', 'Relay & Federation Sync', 'Encrypted .vvault Containers', 'Fidelity & Security Audit Suite']) {
        expect(vault).toContain(creativePersonalText(label, locale).replaceAll('&', '&amp;'));
      }
      for (const label of ['Astraea Publish Prepress & PDF/X Studio', 'ICC Profiles & Ink Manager', 'Navigable Preflight Audit', 'PDF/X Production Export', '6-Point Verification Suite']) {
        expect(publish).toContain(creativePersonalText(label, locale).replaceAll('&', '&amp;'));
      }
      for (const id of Object.keys(AVAILABLE_ICC_PROFILES) as IccProfileId[]) {
        expect(publish).toContain(publishProfileDescription(id, locale));
        expect(publish).toContain(AVAILABLE_ICC_PROFILES[id].name);
        expect(publish).toContain(AVAILABLE_ICC_PROFILES[id].standard);
      }
    }
  });

  it('renders localized Vault capability, attestation, and known suite states with opaque unknown fallbacks', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const markup = renderToStaticMarkup(<>
        <p>{vaultProviderText('Platform authenticator available for user verification; Vault key hardware binding is not asserted', locale)}</p>
        <p>{vaultSecurityLevelText('SOFTWARE_WEBCRYPTO', locale)}</p>
        <p>{vaultProviderText('unknown provider diagnostic', locale)}</p>
        <VaultAttestationDetails attestation={vaultAttestation} locale={locale} />
        <VaultAttestationDetails attestation={unknownVaultAttestation} locale={locale} />
        <VaultSecuritySuiteRows results={vaultSuiteResults} locale={locale} />
      </>);
      expect(markup).toContain(vaultAdvancedText('providerPlatform', locale));
      expect(markup).toContain(vaultAdvancedText('tierWebCrypto', locale));
      expect(markup).toContain(vaultAdvancedText('providerUnknown', locale));
      expect(markup).toContain(vaultAttestationProviderText(vaultAttestation.hardwareType, locale));
      expect(markup).toContain(vaultAdvancedText('attestationVerified', locale));
      expect(markup).toContain(vaultAdvancedText('attestationFailed', locale));
      expect(markup).not.toContain('private engine diagnostic');
      expect(markup).toContain(vaultAdvancedText('attestationKey', locale));
      expect(markup).toContain(vaultAttestation.keyId);
      expect(markup).toContain(vaultAttestation.algorithm);
      expect(markup).toContain(vaultAttestation.signatureHex);
      for (const result of vaultSuiteResults) {
        const copy = vaultSuiteResultText(result.id, result.passed, locale);
        expect(markup).toContain(copy.name);
        expect(markup).toContain(copy.message);
        expect(markup).not.toContain(result.name);
        expect(markup).not.toContain(result.message);
      }
      expect(Object.keys(VAULT_ADVANCED_COPY[locale]).sort()).toEqual(Object.keys(VAULT_ADVANCED_COPY['en-US']).sort());
    }
  });

  it('renders localized Publish preflight and verification states without raw engine diagnostics', () => {
    const tic = 'Total Ink Coverage exceeds limit (322% > 300%).';
    for (const locale of WORKSPACE_LOCALES) {
      const markup = renderToStaticMarkup(<>
        <p>{publishTicViolationText(tic, locale)}</p>
        <p>{publishTicViolationText('future TIC diagnostic', locale)}</p>
        <p>{publishFindingMessage(unknownFinding, locale)}</p>
        <PublishVerificationResultRows results={publishSuiteResults} locale={locale} />
      </>);
      expect(markup).toContain(htmlText(publishTicViolationText(tic, locale)));
      expect(markup).toContain(PUBLISH_ADVANCED_COPY[locale].ticFindingUnknown);
      expect(markup).toContain(PUBLISH_ADVANCED_COPY[locale].findingUnknown);
      for (const result of publishSuiteResults) {
        const copy = publishVerificationResultText(result.id, result.status, locale);
        expect(markup).toContain(copy.name);
        expect(markup).toContain(copy.description);
        expect(markup).toContain(copy.status);
        expect(markup).not.toContain(result.name);
        expect(markup).not.toContain(result.details);
      }
      expect(Object.keys(PUBLISH_ADVANCED_COPY[locale].suiteResults).sort()).toEqual(Object.keys(PUBLISH_ADVANCED_COPY['en-US'].suiteResults).sort());
      expect(Object.keys(PUBLISH_ADVANCED_COPY[locale].profileDescriptions).sort()).toEqual(Object.keys(PUBLISH_ADVANCED_COPY['en-US'].profileDescriptions).sort());
    }
  });
});
