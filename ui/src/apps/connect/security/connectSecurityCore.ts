// STATUS: DIAMANT VGT SUPREME — Connect mail/privacy security policy
import type { ConnectSecurityDecision } from '../../../platform/connectors/connectCoreTypes';
import { evaluateRichTextLink } from '../../../platform/security/richTextLinkSecurity';

export class ConnectSecurityError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ConnectSecurityError';
  }
}

const MAX_URL = 8192;
const MAX_SIGNED_BYTES = 16 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 64 * 1024;

export type ConnectSignatureKind = 'pgp' | 'smime';
export type ConnectSignatureStatus = 'verified' | 'invalid' | 'expired' | 'not-yet-valid';

export interface ConnectSignatureEnvelope {
  kind: ConnectSignatureKind;
  signedBytes: Uint8Array;
  signatureBytes: Uint8Array;
  validFrom?: number;
  validUntil?: number;
}

export interface ConnectSignatureVerification {
  kind: ConnectSignatureKind;
  status: ConnectSignatureStatus;
  trusted: boolean;
  badge: 'VERIFIED SIGNATURE' | 'UNSICHER / MANIPULIERT';
  reason: string;
}

export type ConnectDetachedSignatureVerifier = (
  kind: ConnectSignatureKind,
  signedBytes: Uint8Array,
  signatureBytes: Uint8Array,
) => Promise<boolean>;

function unsafeSignature(kind: ConnectSignatureKind, status: Exclude<ConnectSignatureStatus, 'verified'>, reason: string): ConnectSignatureVerification {
  return { kind, status, trusted: false, badge: 'UNSICHER / MANIPULIERT', reason };
}

export async function verifyMailSignature(
  envelope: ConnectSignatureEnvelope,
  verifier: ConnectDetachedSignatureVerifier,
  now = Date.now(),
): Promise<ConnectSignatureVerification> {
  if (!(envelope.signedBytes instanceof Uint8Array) || envelope.signedBytes.byteLength === 0 || envelope.signedBytes.byteLength > MAX_SIGNED_BYTES) {
    return unsafeSignature(envelope.kind, 'invalid', 'Signed mail content violates verification boundaries.');
  }
  if (!(envelope.signatureBytes instanceof Uint8Array) || envelope.signatureBytes.byteLength === 0 || envelope.signatureBytes.byteLength > MAX_SIGNATURE_BYTES) {
    return unsafeSignature(envelope.kind, 'invalid', 'Signature violates verification boundaries.');
  }
  if (!Number.isFinite(now) || now < 0) return unsafeSignature(envelope.kind, 'invalid', 'Verification time is invalid.');
  if (envelope.validFrom !== undefined && (!Number.isFinite(envelope.validFrom) || now < envelope.validFrom)) {
    return unsafeSignature(envelope.kind, 'not-yet-valid', 'Signing certificate/key is not yet valid.');
  }
  if (envelope.validUntil !== undefined && (!Number.isFinite(envelope.validUntil) || now > envelope.validUntil)) {
    return unsafeSignature(envelope.kind, 'expired', 'Signing certificate/key has expired.');
  }
  try {
    const valid = await verifier(envelope.kind, envelope.signedBytes.slice(), envelope.signatureBytes.slice());
    if (!valid) return unsafeSignature(envelope.kind, 'invalid', 'Cryptographic signature verification failed.');
    return { kind: envelope.kind, status: 'verified', trusted: true, badge: 'VERIFIED SIGNATURE', reason: 'Cryptographic signature verified.' };
  } catch {
    return unsafeSignature(envelope.kind, 'invalid', 'Signature verifier rejected the message.');
  }
}

export function normalizeConnectUrl(raw: string): ConnectSecurityDecision {
  if (raw.length > MAX_URL) return { allowed: false, code: 'url-too-long', explanation: 'URL exceeds bounded length' };
  const decision = evaluateRichTextLink(raw);
  if (!decision.allowed) return { allowed: false, code: decision.code, explanation: 'Unsafe or unsupported rich-text link blocked' };
  const url = new URL(decision.normalizedUrl);
  const host = url.hostname.toLowerCase();
  if (host.includes('xn--')) {
    return {
      allowed: false,
      code: 'idn-homograph-review-required',
      explanation: 'Internationalized external domain requires explicit homograph review',
      normalizedUrl: url.toString(),
      displayHost: host,
    };
  }
  return {
    allowed: true,
    code: decision.kind === 'external' ? 'external-link-warning' : 'vgt-deep-link',
    explanation: decision.kind === 'external' ? 'External link requires a user-visible warning before opening' : 'Astraea deep link accepted',
    normalizedUrl: url.toString(),
    displayHost: host,
  };
}

export function remoteContentDecision(messageId: string, host: string, allow: false | { scope: 'message' | 'domain'; value: string }): ConnectSecurityDecision {
  if (!allow) return { allowed: false, code: 'remote-content-blocked', explanation: 'Remote images/resources are blocked by default' };
  if (allow.scope === 'message' && allow.value !== messageId) return { allowed: false, code: 'message-allow-mismatch', explanation: 'Remote-content grant does not match this message' };
  if (allow.scope === 'domain' && allow.value.toLowerCase() !== host.toLowerCase()) return { allowed: false, code: 'domain-allow-mismatch', explanation: 'Remote-content grant does not match this domain' };
  return { allowed: true, code: 'explicit-remote-content-grant', explanation: 'User explicitly allowed this remote content' };
}

export function assertTlsTransport(protocol: 'imap' | 'smtp' | 'caldav' | 'carddav', tls: 'tls' | 'starttls-required' | 'none', certificateOk: boolean): true {
  if (tls === 'none') throw new ConnectSecurityError(`${protocol}-plaintext-downgrade-blocked`);
  if (!certificateOk) throw new ConnectSecurityError(`${protocol}-certificate-failure`);
  return true;
}

export function assertAutocompletePrivacy(provider: 'local' | 'remote', explicitlyAllowed: boolean): true {
  if (provider === 'remote' && !explicitlyAllowed) throw new ConnectSecurityError('remote-enrichment-not-configured');
  return true;
}

export function renderHtmlSandboxPolicy(): Readonly<{ sandbox: string; csp: string; remoteDefault: 'blocked'; scripts: 'blocked' }> {
  return {
    sandbox: 'allow-popups-to-escape-sandbox',
    csp: "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'",
    remoteDefault: 'blocked',
    scripts: 'blocked',
  };
}

export function advisoryPhishingLabel(indicators: readonly { severity: 'info' | 'warning'; explanation: string }[]): { level: 'none' | 'info' | 'warning'; text: string } {
  const level = indicators.some((indicator) => indicator.severity === 'warning') ? 'warning' : indicators.length ? 'info' : 'none';
  return { level, text: level === 'none' ? 'No advisory indicators detected' : `Advisory only: ${indicators.map((indicator) => indicator.explanation).slice(0, 8).join('; ')}` };
}
