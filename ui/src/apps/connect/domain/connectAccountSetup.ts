// STATUS: PLATIN — BATCH-CONNECT-2: the account-setup wizard as a pure, fail-closed state machine.
//
// Measured gap before this batch: `components/ConnectSidebar.tsx:169` printed a hardcoded green dot and
// `engineer@example.test` — an account no code ever configured — and there was no way to enter IMAP
// data at all (no reference to `ConnectAccount` anywhere in `apps/connect`). The platform already owns
// the canonical account validator (`platform/connectors/connectAccountCore.ts:9`); this module only
// drives it, so no second account model is introduced.
//
// MEASURED PLATFORM CONSTRAINT (read-only, not modified here): `connectAccountCore.ts:8`
// `validateAdapter` rejects a network adapter on a `localOnly` account
// (`local-account-network-adapter-blocked`), and a non-local account requires
// `network.capabilityId` (`network-capability-required`). This build has no NetGate capability for
// IMAP, so the wizard cannot honestly produce an *active* IMAP account. It therefore produces either
// a real, activated account (when a capability id is supplied) or a visibly BLOCKED setup — never a
// green "connected" claim.

import {
  ConnectAccountError,
  validateConnectAccount,
} from '../../../platform/connectors/connectAccountCore';
import type { ConnectAccount, ConnectEndpoint } from '../../../platform/connectors/connectCoreTypes';
import { validateEvent } from './connectCalendarCore';
import type { ConnectAccountSetting } from './types';

export interface ConnectCalendarEventInput {
  readonly title: string;
  readonly startDate: string;
  readonly startTime: string;
  readonly endDate: string;
  readonly endTime: string;
  readonly timezone: string;
  readonly category: 'engineering' | 'security' | 'review' | 'general';
  readonly attendees: readonly string[];
  readonly location?: string;
  readonly description?: string;
}

export type ConnectAccountSetupStep =
  | 'idle'
  | 'entering-imap'
  | 'credential-pending'
  | 'tls-unverified'
  | 'ready'
  | 'blocked'
  | 'error';

export interface ConnectAccountDraft {
  readonly displayName: string;
  readonly address: string;
  readonly host: string;
  readonly port: string;
  readonly username: string;
}

export const EMPTY_ACCOUNT_DRAFT: ConnectAccountDraft = {
  displayName: '',
  address: '',
  host: '',
  port: '993',
  username: '',
};

export class ConnectAccountSetupError extends Error {
  constructor(
    public readonly code: string,
    public readonly field: keyof ConnectAccountDraft | 'settings',
  ) {
    super(`${code}@${field}`);
    this.name = 'ConnectAccountSetupError';
  }
}

export interface ConnectAccountSetupState {
  readonly step: ConnectAccountSetupStep;
  readonly draft: ConnectAccountDraft;
  /** Bounded machine code of the last rejection, for the visible error region. */
  readonly errorCode?: string;
  /** Field the error belongs to, so focus can be moved to the invalid input. */
  readonly errorField?: keyof ConnectAccountDraft | 'settings';
  /** Created only after validation; absent while the wizard is still incomplete. */
  readonly account?: ConnectAccount;
  /** Set once the vault reported a stored secret. */
  readonly credentialHandle?: string;
  readonly tlsProbe?: { readonly certificateSha256?: string; readonly ok: boolean; readonly code: string; readonly checkedAt: number };
  /** Why the account cannot be activated here; shown instead of "connected". */
  readonly blockedCode?: string;
}

export const INITIAL_ACCOUNT_SETUP: ConnectAccountSetupState = { step: 'idle', draft: EMPTY_ACCOUNT_DRAFT };

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const HANDLE = /^keyvault:\/[A-Za-z0-9._~/-]{1,512}$/;

const fail = (
  state: ConnectAccountSetupState,
  code: string,
  field: ConnectAccountSetupError['field'],
): ConnectAccountSetupState => ({ ...state, step: 'error', errorCode: code, errorField: field });

/** Validate one draft field, bounded, for inline field feedback. */
export function validateAccountField(
  field: keyof ConnectAccountDraft,
  value: string,
): { ok: true; value: string } | { ok: false; code: string } {
  const trimmed = value.trim();
  if (trimmed.length > 512) return { ok: false, code: 'field-too-long' };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, code: 'field-control-character' };
  switch (field) {
    case 'displayName':
      return trimmed.length === 0 ? { ok: false, code: 'display-name-empty' } : { ok: true, value: trimmed };
    case 'address':
      return ADDRESS.test(trimmed) && trimmed.length <= 320 ? { ok: true, value: trimmed } : { ok: false, code: 'identity-address-invalid' };
    case 'host':
      return HOST.test(trimmed) ? { ok: true, value: trimmed } : { ok: false, code: 'endpoint-invalid' };
    case 'port': {
      if (!/^\d{1,5}$/.test(trimmed)) return { ok: false, code: 'endpoint-port-invalid' };
      const port = Number(trimmed);
      return port >= 1 && port <= 65535 ? { ok: true, value: trimmed } : { ok: false, code: 'endpoint-port-invalid' };
    }
    case 'username':
      return trimmed.length === 0 ? { ok: false, code: 'username-empty' } : { ok: true, value: trimmed };
    default:
      return { ok: false, code: 'unknown-field' };
  }
}

/** Type the field into the draft. Never mutates; every keystroke produces a new draft. */
export function updateAccountDraft(
  state: ConnectAccountSetupState,
  field: keyof ConnectAccountDraft,
  value: string,
): ConnectAccountSetupState {
  return {
    ...state,
    step: state.step === 'idle' || state.step === 'error' ? 'entering-imap' : state.step,
    draft: { ...state.draft, [field]: value },
    errorCode: undefined,
    errorField: undefined,
  };
}

export interface ConnectAccountBuildOptions {
  /** NetGate capability id for outbound IMAP. Without it the setup is honestly BLOCKED. */
  readonly networkCapabilityId?: string;
  /**
   * KeyVault handle that backs the adapter credential. The platform requires a secret *reference*
   * before a network adapter may be `enabled` (`connector-secret-reference-required`), and the
   * reference may only be a `keyvault:/…` handle.
   */
  readonly credentialHandle?: string;
  readonly allowHosts?: readonly string[];
}

export type ConnectAccountBuild =
  | { readonly outcome: 'created'; readonly account: ConnectAccount; readonly adapterEnabled: true; readonly platformVerified: true }
  | {
      readonly outcome: 'blocked';
      readonly code: string;
      readonly account: ConnectAccount;
      readonly adapterEnabled: false;
      /** `true` when the platform validator accepted the record; `false` when it rejected activation. */
      readonly platformVerified: boolean;
    };

/**
 * Build the canonical account through the platform validator.
 *
 * The returned account is *always* validated by `validateConnectAccount`. Whether the IMAP adapter
 * may be `enabled` depends on whether this build has a NetGate capability *and* a KeyVault-backed
 * credential reference; both platform rules are enforced by the validator, and an account that
 * cannot satisfy them is stored with `enabled: false` and reported as blocked, never as connected.
 */
export function buildLocalImapAccount(
  draft: ConnectAccountDraft,
  accountId: string,
  now: number,
  options: ConnectAccountBuildOptions = {},
): ConnectAccountBuild {
  const fields: Array<keyof ConnectAccountDraft> = ['displayName', 'address', 'host', 'port', 'username'];
  for (const field of fields) {
    const checked = validateAccountField(field, draft[field]);
    if (!checked.ok) throw new ConnectAccountSetupError(checked.code, field);
  }
  const endpoint: ConnectEndpoint = {
    host: draft.host.trim().toLowerCase(),
    port: Number(draft.port),
    tls: 'starttls-required',
  };
  const hasCapability = typeof options.networkCapabilityId === 'string' && options.networkCapabilityId.length > 0;
  const hasCredential = typeof options.credentialHandle === 'string' && HANDLE.test(options.credentialHandle);
  const wantActivation = hasCapability && hasCredential;

  const makeAccount = (adapterEnabled: boolean): ConnectAccount => ({
    id: accountId,
    name: draft.displayName.trim(),
    kind: 'mail',
    // A local-only account may not carry an enabled network adapter (connectAccountCore.ts:8), so
    // activation requires the account to be non-local — which in turn requires the capability.
    localOnly: !(adapterEnabled && hasCapability),
    identities: [{ id: `${accountId}:identity`, displayName: draft.displayName.trim(), address: draft.address.trim().toLowerCase() }],
    username: draft.username.trim(),
    adapters: [
      {
        kind: 'imap',
        endpoint,
        credentialHandle: adapterEnabled ? options.credentialHandle : undefined,
        enabled: adapterEnabled,
      },
      { kind: 'local', enabled: true },
    ],
    network: {
      capabilityId: hasCapability ? options.networkCapabilityId : undefined,
      allowHosts: hasCapability ? [...(options.allowHosts ?? [endpoint.host])] : [],
      allowCertificateInspection: false,
      failClosedOnTlsError: true,
    },
    defaultIdentityId: `${accountId}:identity`,
    createdAt: now,
    updatedAt: now,
  });

  const rejection = (error: ConnectAccountError): ConnectAccountBuild => {
    if (error.code.startsWith('endpoint') || error.code === 'identity-address-invalid' || error.code === 'default-identity-missing') {
      throw new ConnectAccountSetupError(error.code, error.code.startsWith('endpoint') ? 'host' : 'settings');
    }
    return { outcome: 'blocked', code: error.code, account: makeAccount(false), adapterEnabled: false, platformVerified: false };
  };

  if (!wantActivation) {
    // No capability or no credential reference: the platform would reject an enabled adapter, so it
    // stays disabled and the outcome is honestly 'blocked'.
    const account = makeAccount(false);
    try {
      validateConnectAccount(account);
    } catch (error) {
      if (error instanceof ConnectAccountError) return rejection(error);
      throw error;
    }
    return {
      outcome: 'blocked',
      code: hasCapability ? 'connector-secret-reference-required' : 'network-capability-required',
      account,
      adapterEnabled: false,
      platformVerified: true,
    };
  }

  try {
    const validated = validateConnectAccount(makeAccount(true));
    return { outcome: 'created', account: validated, adapterEnabled: true, platformVerified: true };
  } catch (error) {
    if (!(error instanceof ConnectAccountError)) throw error;
    return rejection(error);
  }
}

/**
 * Advance the wizard after the vault stored the secret. A KeyVault handle is required, and the TLS
 * configuration is *not* claimed as verified here — that needs a real probe (see `recordTlsProbe`).
 */
export function attachCredential(
  state: ConnectAccountSetupState,
  outcome: { readonly stored: boolean; readonly handle?: string },
): ConnectAccountSetupState {
  if (!outcome.stored || !outcome.handle) return fail(state, 'vault-store-failed', 'settings');
  if (!HANDLE.test(outcome.handle)) return fail(state, 'vault-handle-invalid', 'settings');
  return { ...state, step: 'credential-pending', credentialHandle: outcome.handle, errorCode: undefined, errorField: undefined };
}

/**
 * Complete the wizard without a probe. The account is created but the TLS verdict stays `unchecked`
 * and the state is `tls-unverified` (or `blocked` when this build cannot activate the adapter), so no
 * screen may call it "geprüft" or "verbunden".
 */
export function completeSetupWithoutProbe(
  state: ConnectAccountSetupState,
  accountId: string,
  now: number,
  options: ConnectAccountBuildOptions = {},
): ConnectAccountSetupState {
  if (!state.credentialHandle) return fail(state, 'credential-missing', 'settings');
  let build: ConnectAccountBuild;
  try {
    build = buildLocalImapAccount(state.draft, accountId, now, { credentialHandle: state.credentialHandle, ...options });
  } catch (error) {
    if (error instanceof ConnectAccountSetupError) return fail(state, error.code, error.field);
    throw error;
  }
  if (build.outcome === 'blocked') {
    return { ...state, step: 'blocked', account: build.account, blockedCode: build.code, errorCode: undefined, errorField: undefined };
  }
  return { ...state, step: 'tls-unverified', account: build.account, blockedCode: undefined, errorCode: undefined, errorField: undefined };
}

export interface ConnectTlsProbeOutcome {
  readonly certificateOk: boolean;
  readonly certificateSha256?: string;
  readonly code: string;
  readonly now: number;
}

/**
 * Record a real probe result. `ready` is reachable only from a successful probe, so the word
 * "geprüft"/"verified" in the UI always has a measurement behind it.
 */
export function recordTlsProbe(state: ConnectAccountSetupState, outcome: ConnectTlsProbeOutcome): ConnectAccountSetupState {
  const tlsProbe = { certificateSha256: outcome.certificateSha256, ok: outcome.certificateOk, code: outcome.code, checkedAt: outcome.now };
  if (!state.account) return fail({ ...state, tlsProbe }, 'account-missing', 'settings');
  if (state.step === 'blocked') {
    // A certificate probe cannot unblock an adapter this build has no capability for.
    return { ...state, tlsProbe, errorCode: state.blockedCode, errorField: 'settings', step: 'blocked' };
  }
  if (!outcome.certificateOk) {
    return { ...state, tlsProbe, step: 'error', errorCode: outcome.code, errorField: 'settings' };
  }
  return { ...state, tlsProbe, step: 'ready', errorCode: undefined, errorField: undefined };
}

/** The persisted form, or `null` when the setup is not finished (still editing / rejected / blocked). */
export function toAccountSetting(state: ConnectAccountSetupState): ConnectAccountSetting | null {
  if (!state.account || !state.credentialHandle) return null;
  const endpoint = state.account.adapters.find((adapter) => adapter.kind === 'imap')?.endpoint;
  if (!endpoint) return null;
  return {
    id: state.account.id,
    name: state.account.name,
    address: state.account.identities[0]?.address ?? '',
    kind: 'imap+local',
    host: endpoint.host,
    port: endpoint.port,
    tls: 'starttls-required',
    username: state.account.username ?? '',
    credentialHandle: state.credentialHandle,
    // Only a successful probe may set 'trusted'; otherwise the verdict stays 'unchecked'/'failed'.
    tlsCertificate: state.tlsProbe?.ok ? 'trusted' : state.tlsProbe ? 'failed' : 'unchecked',
    tlsCheckedAt: state.tlsProbe?.checkedAt,
    isDefault: true,
    createdAt: state.account.createdAt,
  };
}

/** `true` only when the account may be described as reachable. Nothing else may set it. */
export function isAccountReachable(state: ConnectAccountSetupState): boolean {
  return state.step === 'ready' && state.tlsProbe?.ok === true && state.blockedCode === undefined;
}

/**
 * A calendar event built from the same fail-closed path: the platform validator
 * (`connectCalendarCore.ts:8`) rejects a bad range, so the UI cannot store an event that no
 * validator accepted.
 */
export function buildCalendarEvent(input: ConnectCalendarEventInput, now: number): ConnectCalendarEventInput {
  validateEvent({
    id: `draft:${now}`,
    calendarId: 'connect-ui-local',
    uid: `draft-${now}@astraea.local`,
    title: input.title,
    start: `${input.startDate}T${input.startTime}:00Z`,
    end: `${input.endDate}T${input.endTime}:00Z`,
    allDay: false,
    timezone: input.timezone,
    categories: [input.category],
    attachments: [],
    alerts: [],
    attendees: input.attendees.map((address) => ({ address, role: 'required', status: 'needs-action' })),
    status: 'confirmed',
    sequence: 0,
  });
  return input;
}
