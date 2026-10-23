import type { KeyVaultStatus, VaultBackupKeyMode, VaultKeyPolicyModel, WorkspaceDocument } from '../../contracts/workspace';
import { packContainer, unpackContainer } from '../../../platform/containers/container';
import { packVaultByPolicy, type VaultPolicyCredentials } from '../security/vaultKeyPolicyCrypto';
import { validateVaultCredential } from '../security/vaultKeyPolicyEngine';
import { validateVaultBackupBundle, type VaultBackupBundle } from './vaultBackupEngine';

const BACKUP_OBJECT_ID = 'vault_backup_payload';

function wrapBundle(bundle: VaultBackupBundle): WorkspaceDocument {
  const text = JSON.stringify(bundle);
  return {
    id: `backup-wrapper:${bundle.id}`, title: 'Astraea Vault encrypted backup', kind: 'Vault',
    created_at: bundle.createdAt, modified_at: bundle.createdAt, version: 1, theme_id: 'default',
    root_object_ids: [BACKUP_OBJECT_ID],
    objects: { [BACKUP_OBJECT_ID]: { type:'TextBlock', data:{ id:BACKUP_OBJECT_ID, paragraphs:[{ id:'backup-payload', style:{alignment:'left',line_height:1,space_before:0,space_after:0}, spans:[{text}] }] } } },
  };
}

function unwrapBundle(document: WorkspaceDocument): VaultBackupBundle {
  const block = document.objects?.[BACKUP_OBJECT_ID];
  if (!block || block.type !== 'TextBlock') throw new Error('vault_backup_payload_missing');
  const text = block.data.paragraphs[0]?.spans[0]?.text;
  if (!text) throw new Error('vault_backup_payload_missing');
  const parsed = JSON.parse(text) as VaultBackupBundle;
  return parsed;
}

export async function packVaultBackup(
  bundle: VaultBackupBundle,
  keyMode: VaultBackupKeyMode,
  vaultPolicy: VaultKeyPolicyModel,
  vaultCredentials: VaultPolicyCredentials,
  vaultStatus: KeyVaultStatus,
  independentPassword?: string | null,
): Promise<Uint8Array> {
  await validateVaultBackupBundle(bundle);
  const wrapper = wrapBundle(bundle);
  if (keyMode === 'independent_password') {
    const password = validateVaultCredential('portable_password', independentPassword);
    if (!password) throw new Error('vault_backup_password_required');
    return packContainer(wrapper,{password});
  }
  return packVaultByPolicy(wrapper,vaultPolicy,vaultCredentials,vaultStatus);
}

export async function unpackVaultBackup(
  bytes: Uint8Array,
  keyMode: VaultBackupKeyMode,
  vaultPolicy: VaultKeyPolicyModel,
  vaultCredentials: VaultPolicyCredentials,
  independentPassword?: string | null,
): Promise<VaultBackupBundle> {
  let document: WorkspaceDocument;
  if (keyMode === 'independent_password') {
    const password = validateVaultCredential('portable_password', independentPassword);
    if (!password) throw new Error('vault_backup_password_required');
    document = await unpackContainer(bytes,{password});
  } else if (vaultPolicy.protectionMode === 'device_pin') {
    document = await unpackContainer(bytes,{pin: validateVaultCredential('device_pin',vaultCredentials.pin) ?? undefined});
  } else if (vaultPolicy.protectionMode === 'portable_password') {
    document = await unpackContainer(bytes,{password: validateVaultCredential('portable_password',vaultCredentials.password) ?? undefined});
  } else {
    document = await unpackContainer(bytes);
  }
  return validateVaultBackupBundle(unwrapBundle(document));
}
