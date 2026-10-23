// STATUS: GOLD — verifies that non-secret account form drafts preserve stored mail-profile fields.
import { describe, expect, it } from 'vitest';
import { buildConnectMailAccount } from '../connectSettingsCore';
import { draftFromAccount, EMPTY_MAIL_PROFILE_DRAFT } from '../connectSettingsDraft';

describe('Connect Settings draft mapping', () => {
  it('starts with secure transport defaults and no credential material', () => {
    expect(EMPTY_MAIL_PROFILE_DRAFT).toEqual({
      accountName: '',
      displayName: '',
      address: '',
      username: '',
      imapHost: '',
      imapPort: '993',
      imapTls: 'tls',
      smtpHost: '',
      smtpPort: '587',
      smtpTls: 'starttls-required',
    });
  });

  it('projects the default identity and endpoint settings without copying a credential handle', () => {
    let generatedId = 0;
    const account = buildConnectMailAccount({
      accountName: 'Research',
      displayName: 'Account Owner',
      address: 'owner@example.test',
      username: 'mail-owner',
      imapHost: 'imap.example.test',
      imapPort: 993,
      imapTls: 'tls',
      smtpHost: 'smtp.example.test',
      smtpPort: 587,
      smtpTls: 'starttls-required',
      credentialHandle: 'keyvault:/connect/5b04eefd-7cc2-4dcb-82cf-862e49f6a759',
    }, undefined, 42, () => `generated-${++generatedId}`);

    expect(draftFromAccount(account)).toEqual({
      accountName: 'Research',
      displayName: 'Account Owner',
      address: 'owner@example.test',
      username: 'mail-owner',
      imapHost: 'imap.example.test',
      imapPort: '993',
      imapTls: 'tls',
      smtpHost: 'smtp.example.test',
      smtpPort: '587',
      smtpTls: 'starttls-required',
    });
  });
});
