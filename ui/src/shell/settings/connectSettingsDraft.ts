// STATUS: GOLD — maps stored mail profiles into non-secret editable form state.
import { connectAccountEndpoint } from './connectSettingsCore';
import type { ConnectAccount } from '../../platform/connectors/connectCoreTypes';

export interface MailProfileDraft {
  accountName: string;
  displayName: string;
  address: string;
  username: string;
  imapHost: string;
  imapPort: string;
  imapTls: 'tls' | 'starttls-required';
  smtpHost: string;
  smtpPort: string;
  smtpTls: 'tls' | 'starttls-required';
}

export const EMPTY_MAIL_PROFILE_DRAFT: MailProfileDraft = {
  accountName: '', displayName: '', address: '', username: '',
  imapHost: '', imapPort: '993', imapTls: 'tls',
  smtpHost: '', smtpPort: '587', smtpTls: 'starttls-required',
};

export function draftFromAccount(account: ConnectAccount): MailProfileDraft {
  const identity = account.identities.find((item) => item.id === account.defaultIdentityId) ?? account.identities[0];
  const imap = connectAccountEndpoint(account, 'imap');
  const smtp = connectAccountEndpoint(account, 'smtp');
  return {
    accountName: account.name,
    displayName: identity?.displayName ?? '',
    address: identity?.address ?? '',
    username: account.username ?? identity?.address ?? '',
    imapHost: imap?.host ?? '',
    imapPort: String(imap?.port ?? 993),
    imapTls: imap?.tls === 'starttls-required' ? 'starttls-required' : 'tls',
    smtpHost: smtp?.host ?? '',
    smtpPort: String(smtp?.port ?? 587),
    smtpTls: smtp?.tls === 'tls' ? 'tls' : 'starttls-required',
  };
}
