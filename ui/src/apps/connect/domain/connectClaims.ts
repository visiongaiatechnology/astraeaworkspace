// STATUS: PLATIN — BATCH-CONNECT-1: one place that decides what a Connect status claim may say.
//
// PHASE 0 CLAIM AUDIT (measured before this batch, `Datei:Zeile` proof):
//  - `components/ConnectMailViewer.tsx:71` stored `folder: 'sent'` for a message that `queueCompose`
//    (`application/connectUiBridge.ts:12` = `queueDraft(...)`, `domain/connectMailCore.ts:149`) never
//    sent. BATCH-60 already added `delivery: 'queued'` next to it — re-measured here and still green.
//  - `components/ConnectSidebar.tsx:169` renders a hardcoded green dot + `engineer@example.test`
//    footer: a permanent "connected" claim with no state behind it. → ConnectAccount.status.
//  - `components/ConnectMailList.tsx:88` / `ConnectMailViewer.tsx:241` show a lock badge from
//    `isEncrypted`. Nothing in apps/connect derives that field from a key operation for outgoing mail.
//  - `components/ConnectMailViewer.tsx:247` shows "verified signature" from `signatureStatus`, which
//    no code path in apps/connect ever sets.
//  - `locale/connectLocale.ts:35,38` claim a cryptographically verified GPG address book and a
//    CalDAV-conformant calendar; neither exists in the UI.
//
// This module is the single resolver: a claim is only allowed when the operation that produces it
// is named in `evidence` AND the stored field carries it. `findFalseClaims` is the executable check
// used by `testing/connectClaims.test.ts`.

import type { ConnectMessage } from '../domain/types';

export type ConnectClaim =
  | 'sent'
  | 'queued'
  | 'failed'
  | 'encrypted'
  | 'delivered'
  | 'synchronised'
  | 'retried'
  | 'key-verified'
  | 'caldav-synced'
  | 'carddav-synced';

/** Named operations that can make a claim true. A claim without one of these is a false claim. */
export type ConnectClaimEvidence =
  | 'smtp-accepted-by-relay'
  | 'local-queue-entry-created'
  /**
   * GAP-0058, Runde 295: `queued` UND `failed` verlangten BEIDE
   * `'local-queue-entry-created'`. Damit belegte die Evidenz der einen Zusage
   * die andere: `proveClaim('queued', ['local-queue-entry-created'])` und
   * `proveClaim('failed', [...])` waren beide wahr. Der Resolver konnte "in der
   * Warteschlange" nicht von "der Versuch ist fehlgeschlagen" unterscheiden —
   * und wer die Anzeige auf ihn umstellt, gibt einer fehlgeschlagenen Nachricht
   * das Warteschlangen-Abzeichen.
   */
  | 'delivery-attempt-failed'
  | 'webcrypto-ciphertext-created'
  | 'remote-imap-uid-moved'
  | 'imap-fetch-completed'
  | 'retry-attempt-recorded'
  | 'openpgp-signature-verified'
  | 'caldav-put-confirmed'
  | 'carddav-put-confirmed';

export interface ConnectClaimProof {
  readonly claim: ConnectClaim;
  readonly proven: boolean;
  readonly reason: string;
}

const EVIDENCE_LABEL: Readonly<Record<ConnectClaimEvidence, string>> = {
  'smtp-accepted-by-relay': 'an SMTP relay accepted the message',
  'local-queue-entry-created': 'a local queue entry was created',
  'delivery-attempt-failed': 'a delivery attempt was recorded as failed',
  'webcrypto-ciphertext-created': 'a WebCrypto operation produced ciphertext',
  'remote-imap-uid-moved': 'the server confirmed the UID move',
  'imap-fetch-completed': 'an IMAP fetch completed',
  'retry-attempt-recorded': 'a retry attempt was recorded',
  'openpgp-signature-verified': 'a signature verifier returned valid',
  'caldav-put-confirmed': 'a CalDAV PUT was confirmed',
  'carddav-put-confirmed': 'a CardDAV PUT was confirmed',
};

export function proveClaim(claim: ConnectClaim, evidence: readonly ConnectClaimEvidence[]): ConnectClaimProof {
  const required: Readonly<Record<ConnectClaim, ConnectClaimEvidence>> = {
    sent: 'smtp-accepted-by-relay',
    queued: 'local-queue-entry-created',
    failed: 'delivery-attempt-failed',
    encrypted: 'webcrypto-ciphertext-created',
    delivered: 'smtp-accepted-by-relay',
    synchronised: 'imap-fetch-completed',
    retried: 'retry-attempt-recorded',
    'key-verified': 'openpgp-signature-verified',
    'caldav-synced': 'caldav-put-confirmed',
    'carddav-synced': 'carddav-put-confirmed',
  };
  const needed = required[claim];
  const proven = evidence.includes(needed);
  return {
    claim,
    proven,
    reason: proven
      ? `allowed: ${EVIDENCE_LABEL[needed]}`
      : `blocked: no evidence that ${EVIDENCE_LABEL[needed]}`,
  };
}

/**
 * Which claims a stored message actually carries. This reads only fields that are produced by a
 * measured operation, so the result is a statement about the data, not about the wording.
 */
export function storedClaims(message: ConnectMessage): ConnectClaim[] {
  const claims: ConnectClaim[] = [];
  if (message.delivery === 'queued') claims.push('queued');
  if (message.delivery === 'sent') claims.push('sent');
  if (message.delivery === 'failed') claims.push('failed');
  if (message.deliveryAck === 'relay-accepted') claims.push('delivered');
  if (message.isEncrypted) claims.push('encrypted');
  if (message.signatureStatus === 'verified') {
    claims.push('encrypted');
    claims.push('key-verified');
  }
  if ((message.deliveryAttempts ?? 0) > 0) claims.push('retried');
  if (message.remoteUid !== undefined) claims.push('synchronised');
  return claims;
}

/**
 * The negative test for the defect class "success without the operation": every claim stored on a
 * message must be backed by evidence. A stored `sent`/`encrypted` claim with an empty evidence list
 * is exactly the defect BATCH-60 found, and this function must report it.
 */
export function findFalseClaims(message: ConnectMessage, evidence: readonly ConnectClaimEvidence[]): ConnectClaimProof[] {
  return storedClaims(message)
    .map((claim) => proveClaim(claim, evidence))
    .filter((proof) => !proof.proven);
}

/** Convenience guard for the components: only the proven claims may be rendered. */
export function mayRenderClaim(claim: ConnectClaim, evidence: readonly ConnectClaimEvidence[]): boolean {
  return proveClaim(claim, evidence).proven;
}

/**
 * GAP-0057, Runde 295: DIE EVIDENZ, DIE EINE GESPEICHERTE NACHRICHT SELBST TRAEGT.
 *
 * Dieses Modul nannte sich "the single resolver" — und hatte NULL
 * Produktionsverbraucher, weil es keinen Weg gab, aus einer gespeicherten
 * Nachricht an ihre Evidenz zu kommen. `storedClaims` sagt, WAS eine Nachricht
 * behauptet; hier steht, WOMIT sie es belegt.
 *
 * Die Zuordnung ist eng und absichtlich unvollstaendig: nur Felder, die eine
 * gemessene Operation hinterlaesst, erzeugen Evidenz. `isEncrypted` allein
 * erzeugt KEINE — es ist die Behauptung, nicht der Beweis.
 */
export function messageEvidence(message: ConnectMessage): ConnectClaimEvidence[] {
  const evidence: ConnectClaimEvidence[] = [];
  if (message.encryptionEvidence === 'webcrypto-ciphertext-created') {
    evidence.push('webcrypto-ciphertext-created');
  }
  if (message.deliveryAck === 'relay-accepted') evidence.push('smtp-accepted-by-relay');
  // GAP-0058: NUR der jeweilige Zustand erzeugt seine Evidenz. Beide
  // Zustandswerte auf dieselbe Evidenz abzubilden war der Fehler — dann belegt
  // die Evidenz der einen Zusage die andere.
  if (message.delivery === 'queued') evidence.push('local-queue-entry-created');
  if (message.delivery === 'failed') evidence.push('delivery-attempt-failed');
  if ((message.deliveryAttempts ?? 0) > 0) evidence.push('retry-attempt-recorded');
  if (message.remoteUid !== undefined) evidence.push('imap-fetch-completed');
  return evidence;
}

/**
 * DIE ANZEIGE-ENTSCHEIDUNG fuer eine gespeicherte Nachricht. Dies ist der
 * Verbraucher, den dieses Modul immer haette haben sollen: die Komponenten
 * rufen ihn, statt ein Feld zu lesen.
 *
 * In DIESEM Build ist das Ergebnis fuer `encrypted` immer `false`, weil keine
 * WebCrypto-Operation existiert, die `encryptionEvidence` setzen koennte. Das
 * ist keine Luecke, sondern die ehrliche Antwort: eine Anwendung, die nicht
 * verschluesselt, zeigt kein Schloss.
 */
export function mayRenderStoredClaim(message: ConnectMessage, claim: ConnectClaim): boolean {
  return mayRenderClaim(claim, messageEvidence(message));
}

// ---------------------------------------------------------------------------------------------
// Evidence read from real state. These helpers never invent an operation.

export interface ConnectAccountTransportState {
  /** Adapter that a real transport is connected for, `undefined` when nothing is connected. */
  readonly connectedAdapter: 'imap' | 'smtp' | 'caldav' | 'carddav' | undefined;
}

/**
 * The evidence a compose action can honestly produce. In this build there is no SMTP transport, so
 * it is exactly what the local queue recorded — never more.
 */
export function composeEvidence(queueEntryCreated: boolean, ciphertextCreated = false): ConnectClaimEvidence[] {
  const evidence: ConnectClaimEvidence[] = [];
  if (queueEntryCreated) evidence.push('local-queue-entry-created');
  if (ciphertextCreated) evidence.push('webcrypto-ciphertext-created');
  return evidence;
}
