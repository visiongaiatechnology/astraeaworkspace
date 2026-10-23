// STATUS: GOLD — verifies localized engine error classes and generic unknown fallback.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { VAULT_BACKUP_ENGINE_ERROR_COPY, vaultBackupEngineErrorText } from '../../vaultBackupEngineErrorLocale';

describe('Vault backup engine error locale coverage', () => {
  it('keeps the error categories complete and renders localized outcomes', () => {
    type BackupErrorKey = keyof (typeof VAULT_BACKUP_ENGINE_ERROR_COPY)['en-US'];
    const expectedKeys = Object.keys(VAULT_BACKUP_ENGINE_ERROR_COPY['en-US']).sort() as BackupErrorKey[];
    for (const locale of WORKSPACE_LOCALES) {
      const copy = VAULT_BACKUP_ENGINE_ERROR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
      const credentials = vaultBackupEngineErrorText(new Error('vault_backup_password_required'), locale);
      const integrity = vaultBackupEngineErrorText(new Error('vault_backup_chain_integrity_failed'), locale);
      const unknown = vaultBackupEngineErrorText(new Error('private platform diagnostic'), locale);
      expect(renderToStaticMarkup(<div role="alert">{credentials}</div>)).toContain(copy.credentials);
      expect(integrity).toBe(copy.integrity);
      expect(unknown).toBe(copy.generic);
      expect(unknown).not.toContain('private platform diagnostic');
    }
  });
});
