// STATUS: PLATIN — Sperr-Revokation für den „Enclave & Relay"-Dialog.
//
// **Der Befund:** `VaultAdvancedModal` zeigt Datei-Metadaten, Peer-Geräte und Key-Deskriptoren. Er wurde
// vom Laufzeitpfad **ohne** Sperrbezug gerendert. Lief die Auto-Lock-Frist ab, während der Dialog offen
// war, blieb entschlüsseltes Material sichtbar, obwohl der Tresor als gesperrt galt. Die Sperr-Zusage in
// `shared/vault/security/vaultSessionLock.ts` nennt `advancedModal` ausdrücklich als Material, das nach
// dem Sperren unsichtbar sein muss.
//
// Dieser Test prüft die Komponente selbst; der Quellvertrag
// (`testing/contract/vaultRuntimeLockWiring.contract.test.mjs`) prüft zusätzlich, dass der Laufzeitpfad
// den Dialog nur entsperrt montiert und ihn beim Sperren schließt.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VaultAdvancedModal } from '../../settings/VaultAdvancedModal';
import { DEFAULT_VAULT_PEER_SYNC_POLICY } from '../../../../shared/vault/sync/vaultPeerSyncEngine';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: 'en-US' }),
}));

const noop = (): void => undefined;
const props: ComponentProps<typeof VaultAdvancedModal> = {
  isOpen: true,
  locked: false,
  onClose: noop,
  vaultFiles: [],
  onExportEncryptedBackup: async () => 'backup.vvault',
  showToast: noop,
  peerSyncPolicy: DEFAULT_VAULT_PEER_SYNC_POLICY,
  peerDevices: [],
  vaultFolders: [],
  networkCapability: 'None',
  onPeerSyncPolicyChange: noop,
  onTrustPeer: noop,
  onRemovePeer: noop,
};

describe('VaultAdvancedModal lock revocation', () => {
  it('renders nothing at all while the Vault session is locked', () => {
    const markup = renderToStaticMarkup(<VaultAdvancedModal {...props} locked />);
    expect(markup).toBe('');
  });

  it('renders the dialog only when the session is unlocked', () => {
    const markup = renderToStaticMarkup(<VaultAdvancedModal {...props} locked={false} />);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Astraea Vault');
  });

  it('is not mounted while closed, independent of the lock state', () => {
    expect(renderToStaticMarkup(<VaultAdvancedModal {...props} isOpen={false} locked={false} />)).toBe('');
    expect(renderToStaticMarkup(<VaultAdvancedModal {...props} isOpen={false} locked />)).toBe('');
  });
});
