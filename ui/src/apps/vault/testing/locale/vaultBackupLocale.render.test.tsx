// STATUS: GOLD — checks Vault backup catalog parity and localized rendered controls.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { normalizeVaultBackupPolicy } from '../../../../shared/vault/backup/vaultBackupEngine';
import { VAULT_BACKUP_COPY } from '../../vaultBackupLocale';
import { VaultBackupPanel } from '../../backup/VaultBackupPanel';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const policy = normalizeVaultBackupPolicy();
policy.schedule = { enabled: true, executor: 'local_agent', cadence: 'daily', hourLocal: 3 };
const props = {
  policy, catalog: [], networkCapability: 'None', vaultPin: null,
  onUpdatePolicy: () => undefined,
  onCreateBackup: async () => { throw new Error('unused'); }, onPreview: async () => { throw new Error('unused'); },
  onRestoreAll: async () => { throw new Error('unused'); }, onRestoreFiles: async () => { throw new Error('unused'); },
  onApplyDisasterRecovery: () => undefined, onApplyFileRecovery: () => undefined,
} satisfies ComponentProps<typeof VaultBackupPanel>;
const noop = (): void => undefined;
const htmlText = (value: string): string => value.replaceAll('&', '&amp;');

describe('Vault backup locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const keys = Object.keys(VAULT_BACKUP_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      expect(Object.keys(VAULT_BACKUP_COPY[locale]).sort(), locale).toEqual(keys);
      for (const key of keys as (keyof typeof VAULT_BACKUP_COPY['en-US'])[]) expect(VAULT_BACKUP_COPY[locale][key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized backup, schedule, and browser-permission controls', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = VAULT_BACKUP_COPY[locale];
      const markup = renderToStaticMarkup(<VaultBackupPanel {...props} />);
      for (const key of ['heading', 'description', 'target', 'localFolder', 'mode', 'backupKey', 'authorizeFolder', 'scheduledJob', 'scheduleInfo', 'createVerify'] as const) expect(markup).toContain(htmlText(copy[key]));
      expect(markup).toContain(copy.scheduleHour);
      expect(markup).toContain(`placeholder="${copy.hostTargetReference}"`);
    }
  });
});
