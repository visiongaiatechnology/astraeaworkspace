// STATUS: PLATIN — Vertrauliche Freigabe: Empfänger, Ablauf, Widerruf, Audit (V-014).
//
// **Warum es dieses Modul gibt (gemessen, nicht vermutet):** Im Vault existierte eine Schaltfläche
// „Export recipient package", die einen Container mit einem öffentlichen Schlüssel packte. Es gab **keine**
// Empfängerliste, **keinen** Ablauf und **keinen** Widerruf — der Vertrag hatte die Felder
// (`expiresAt`, `revokedAt`, `recipientFingerprint`, `copyControl`, `VaultShareAuditEntry`), aber **keine
// Funktion schrieb sie**. Drei persistierte Felder ohne Schreiber. Die Bezeichnung „vertrauliche
// Linkfreigabe" versprach damit eine Kontrolle, die nicht existierte.
//
// **Kein zweiter Mechanismus:** dieses Modul füllt genau den vorhandenen Vertrag (`VaultShareGrant`,
// `VaultShareAuditEntry`) und liefert die Entscheidungen, die `vaultAccessPolicyEngine` bereits auswertet.
// Die Trennung ist bewusst: **dieses Modul verwaltet** Freigaben, `evaluateVaultAccess` **urteilt** über
// Zugriffe. Es gibt nur eine Urteilsinstanz.
import type { VaultShareAuditEntry, VaultShareDelivery, VaultShareGrant, VaultSharePermission } from '../../contracts/workspace';

export const MAX_VAULT_SHARES = 512;
export const MAX_VAULT_SHARE_AUDIT = 1024;
export const MIN_VAULT_SHARE_TTL_MS = 60_000;
export const MAX_VAULT_SHARE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const VAULT_SHARE_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/i;
export const VAULT_RECIPIENT_KEY_PATTERN = /^(?:x25519:)?[0-9a-f]{64}$/i;

const PERMISSIONS = new Set<VaultSharePermission>(['view', 'download', 'edit']);
const DELIVERIES = new Set<VaultShareDelivery>(['encrypted_export', 'gaiacom', 'space', 'hosted_live']);

export interface VaultShareRequest {
  fileId: string;
  delivery: VaultShareDelivery;
  permissions: readonly VaultSharePermission[];
  /** Empfänger-Fingerabdruck (64 Hex) — **erforderlich**, denn eine Freigabe ohne Empfänger ist keine. */
  recipientFingerprint: string;
  recipientKey?: string;
  spaceId?: string;
  serviceRef?: string;
  /** Ablauf in Millisekunden ab `now`. **Erforderlich** — es gibt keine unbegrenzte Freigabe. */
  ttlMs: number;
  now?: number;
}

export interface VaultShareResult {
  grant: VaultShareGrant;
  audit: VaultShareAuditEntry;
}

function auditEntry(at: number, grant: Pick<VaultShareGrant, 'id' | 'fileId'>, action: VaultShareAuditEntry['action'], detail: string): VaultShareAuditEntry {
  return { id: `vault-share-audit-${at}-${grant.id}-${action}`, at, shareId: grant.id, fileId: grant.fileId, action, detail };
}

function requireFileId(fileId: unknown): string {
  if (typeof fileId !== 'string' || !fileId.trim()) throw new Error('vault_share_file_required');
  return fileId.trim().slice(0, 200);
}

function requirePermissions(permissions: unknown): VaultSharePermission[] {
  if (!Array.isArray(permissions) || permissions.length === 0) throw new Error('vault_share_permissions_required');
  const accepted = [...new Set(permissions)].filter((permission): permission is VaultSharePermission => PERMISSIONS.has(permission as VaultSharePermission));
  if (accepted.length !== new Set(permissions).size) throw new Error('vault_share_permission_invalid');
  if (accepted.length === 0) throw new Error('vault_share_permissions_required');
  return accepted;
}

/**
 * Erzeugt eine Freigabe. Jede Grenzverletzung wird **abgelehnt**, nicht gekürzt: eine Freigabe ohne
 * Empfänger, ohne Ablauf oder mit unbekannter Berechtigung wäre genau die Kontrolle, die der Befund
 * vermisst hat.
 */
export function createVaultShare(
  request: VaultShareRequest,
  existing: readonly VaultShareGrant[] = [],
): VaultShareResult {
  if (!request || typeof request !== 'object') throw new Error('vault_share_request_invalid');
  const fileId = requireFileId(request.fileId);
  if (!DELIVERIES.has(request.delivery)) throw new Error('vault_share_delivery_invalid');
  const permissions = requirePermissions(request.permissions);

  const recipientFingerprint = typeof request.recipientFingerprint === 'string' ? request.recipientFingerprint.trim() : '';
  if (!VAULT_SHARE_FINGERPRINT_PATTERN.test(recipientFingerprint)) throw new Error('vault_share_recipient_fingerprint_invalid');

  if (request.recipientKey !== undefined) {
    if (typeof request.recipientKey !== 'string' || !VAULT_RECIPIENT_KEY_PATTERN.test(request.recipientKey.trim())) {
      throw new Error('vault_share_recipient_key_invalid');
    }
  }

  const ttlMs = Number(request.ttlMs);
  if (!Number.isSafeInteger(ttlMs) || ttlMs < MIN_VAULT_SHARE_TTL_MS || ttlMs > MAX_VAULT_SHARE_TTL_MS) {
    throw new Error('vault_share_ttl_invalid');
  }

  if (existing.length >= MAX_VAULT_SHARES) throw new Error('vault_share_limit_reached');

  const now = typeof request.now === 'number' && Number.isFinite(request.now) ? request.now : Date.now();
  const expiresAt = now + ttlMs;
  /**
   * `copyControl` folgt aus der Zustellart und ist **keine** freie Wahl:
   *  • `encrypted_export` erzeugt eine Datei beim Empfänger. Die lässt sich nicht zurücknehmen — das wird
   *    ehrlich als `exported_copy_unrevocable` ausgewiesen, statt Widerrufbarkeit zu behaupten.
   *  • alles andere bleibt kontrollierter Zugriff.
   */
  const copyControl: VaultShareGrant['copyControl'] = request.delivery === 'encrypted_export' ? 'exported_copy_unrevocable' : 'controlled_future_access';

  const grant: VaultShareGrant = {
    id: `vault-share-${now}-${recipientFingerprint.slice(0, 8)}`,
    fileId,
    delivery: request.delivery,
    permissions,
    createdAt: now,
    recipientFingerprint: recipientFingerprint.toLowerCase(),
    recipientKey: request.recipientKey?.trim(),
    spaceId: request.spaceId?.trim() || undefined,
    serviceRef: request.serviceRef?.trim().slice(0, 200) || undefined,
    expiresAt,
    status: copyControl === 'exported_copy_unrevocable' ? 'exported_copy' : 'active',
    copyControl,
  };

  return {
    grant,
    audit: auditEntry(now, grant, 'created', `Share created for ${request.delivery} with ${permissions.join('/')}; expires in ${Math.round(ttlMs / 3_600_000)} h.${copyControl === 'exported_copy_unrevocable' ? ' The recipient holds an exported copy that cannot be revoked.' : ''}`),
  };
}

export interface VaultShareMutationResult {
  grants: VaultShareGrant[];
  audit: VaultShareAuditEntry;
}

/**
 * Widerruft eine Freigabe.
 *
 * **Ehrlichkeitsregel:** eine bereits exportierte Kopie lässt sich **nicht** zurücknehmen. Der Widerruf
 * setzt den Status trotzdem auf `revoked` (damit künftiger Zugriff fail-closed ist), aber der Audit-Text
 * und der Aktionsname sagen ausdrücklich, dass die Kopie beim Empfänger bleibt. Genau diese Unterscheidung
 * hat im Vault gefehlt.
 */
export function revokeVaultShare(
  grants: readonly VaultShareGrant[],
  shareId: string,
  now = Date.now(),
): VaultShareMutationResult {
  const index = grants.findIndex((grant) => grant.id === shareId);
  if (index < 0) throw new Error('vault_share_not_found');
  const current = grants[index]!;
  if (current.status === 'revoked') throw new Error('vault_share_already_revoked');

  const revoked: VaultShareGrant = { ...current, status: 'revoked', revokedAt: now };
  const next = grants.map((grant, position) => position === index ? revoked : grant);
  const copyRemains = current.copyControl === 'exported_copy_unrevocable';
  return {
    grants: next,
    audit: auditEntry(now, current, copyRemains ? 'revoke_not_applicable' : 'revoked',
      copyRemains
        ? 'Future access is revoked, but the recipient already holds an exported copy that cannot be recalled. This is not a recall.'
        : 'Share revoked; future access is denied.'),
  };
}

/** Verlängert die Laufzeit einer Freigabe — nur im erlaubten Fenster und nur, wenn sie noch aktiv ist. */
export function extendVaultShare(
  grants: readonly VaultShareGrant[],
  shareId: string,
  additionalTtlMs: number,
  now = Date.now(),
): VaultShareMutationResult {
  const index = grants.findIndex((grant) => grant.id === shareId);
  if (index < 0) throw new Error('vault_share_not_found');
  const current = grants[index]!;
  if (current.status === 'revoked' || current.revokedAt !== undefined) throw new Error('vault_share_already_revoked');
  const ttl = Number(additionalTtlMs);
  if (!Number.isSafeInteger(ttl) || ttl < MIN_VAULT_SHARE_TTL_MS || ttl > MAX_VAULT_SHARE_TTL_MS) throw new Error('vault_share_ttl_invalid');
  const base = typeof current.expiresAt === 'number' && current.expiresAt > now ? current.expiresAt : now;
  const expiresAt = Math.min(base + ttl, now + MAX_VAULT_SHARE_TTL_MS);
  const extended: VaultShareGrant = { ...current, expiresAt };
  return {
    grants: grants.map((grant, position) => position === index ? extended : grant),
    audit: auditEntry(now, current, 'created', `Share extended until ${new Date(expiresAt).toISOString()}.`),
  };
}

/** Alle Freigaben zu einem Asset, neueste zuerst. */
export function vaultSharesForFile(grants: readonly VaultShareGrant[], fileId: string): VaultShareGrant[] {
  return grants.filter((grant) => grant.fileId === fileId).sort((a, b) => b.createdAt - a.createdAt);
}

/** Ist die Freigabe **jetzt** wirksam? Abgelaufen und widerrufen sind ausdrücklich verschiedene Antworten. */
export function vaultShareState(grant: VaultShareGrant, now = Date.now()): 'active' | 'expired' | 'revoked' {
  if (grant.revokedAt !== undefined || grant.status === 'revoked') return 'revoked';
  if (typeof grant.expiresAt === 'number' && grant.expiresAt <= now) return 'expired';
  return 'active';
}

/** Nur die wirksamen Freigaben — die Liste, die `evaluateVaultAccess` als `grants` bekommen sollte. */
export function activeVaultShares(grants: readonly VaultShareGrant[], now = Date.now()): VaultShareGrant[] {
  return grants.filter((grant) => vaultShareState(grant, now) === 'active');
}

/** Der Audit-Verlauf wird auf `MAX_VAULT_SHARE_AUDIT` begrenzt, neueste zuerst. */
export function appendVaultShareAudit(
  current: readonly VaultShareAuditEntry[] | undefined,
  entry: VaultShareAuditEntry,
): VaultShareAuditEntry[] {
  return [entry, ...(current ?? []).filter((candidate) => candidate.id !== entry.id)].slice(0, MAX_VAULT_SHARE_AUDIT);
}

/** Für die Oberfläche: eine Zeile pro Freigabe, ohne den vollständigen Fingerabdruck zu zeigen. */
export function vaultShareSummary(grant: VaultShareGrant, now = Date.now()): {
  id: string; recipient: string; state: 'active' | 'expired' | 'revoked'; delivery: VaultShareDelivery;
  permissions: string; expiresAt?: number; copyRemains: boolean; revocable: boolean;
} {
  const state = vaultShareState(grant, now);
  const copyRemains = grant.copyControl === 'exported_copy_unrevocable';
  return {
    id: grant.id,
    recipient: `${(grant.recipientFingerprint ?? '').slice(0, 12)}…`,
    state,
    delivery: grant.delivery,
    permissions: [...(grant.permissions ?? [])].sort().join('/'),
    expiresAt: grant.expiresAt,
    copyRemains,
    // Ein Widerruf beendet künftigen Zugriff, nimmt eine bereits exportierte Kopie aber nicht zurück.
    revocable: state === 'active' && !copyRemains,
  };
}
