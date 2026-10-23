// STATUS: PLATIN — der eine Weg für Richtliniendokumente hinein und hinaus.
//
// **Warum dieses Modul existiert (gemessen, nicht vermutet):** Drei fertige, geprüfte Module lagen tot:
// `adminInterchangeCore.ts` (Portable-Paket, Zusammenfassungs-CSV), `adminEncryptedStore.ts`
// (authentifizierter `.vadmin`-Container) und `adminPolicySignatureCore.ts` (signiertes Manifest).
// Kein Bauteil importierte eines davon; die Oberfläche hatte deshalb **keinen** Speicher-, Öffnen-,
// Export- oder Versionsweg. „Neues .vpolicy öffnen und Regeln bearbeiten" war damit nicht erfüllbar.
//
// **Kein zweiter Parser:** dieses Modul formatiert nicht selbst. Es ruft genau die vorhandenen
// Funktionen und fügt ihre Ergebnisse zusammen. Ein zweiter Parser wäre der Fehler, den dieses Projekt
// schon mehrfach bezahlt hat.

import type { AdminPolicyModel, PolicyVersion } from '../model/types';
import { exportAdminPortablePackage, exportAdminSummaryCsv, importAdminPortablePackage, type AdminPortablePackage } from './adminInterchangeCore';
import { AdminStoreError, packVAdmin, unpackVAdmin } from './adminEncryptedStore';
import { addPolicyVersion, diffPolicy, rollbackPolicy } from '../policies/adminLifecycleCore';
import { exportAuditNdjson, queryAudit } from '../compliance/adminAuditCore';
import { canonicalOrganizationPolicyPayload, verifyOrganizationPolicyManifest, type SignedOrganizationPolicyManifest } from '../security/adminPolicySignatureCore';
import { strictestAdminPolicy } from '../model/adminStrictestPolicy';

export const POLICY_DOCUMENT_EXTENSION = '.vpolicy';
export const POLICY_STORE_EXTENSION = '.vadmin';
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export type PolicyExportFormat = 'portable-json' | 'summary-csv';

export interface PolicyDocumentExport {
  fileName: string;
  format: PolicyExportFormat;
  bytes: Uint8Array;
  /** Nur für textuelle Formate gesetzt — die Leseansicht braucht keine zweite Serialisierung. */
  text?: string;
}

export class PolicyInterchangeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PolicyInterchangeError';
  }
}

/**
 * Exportiert das Richtliniendokument in eine extern lesbare Form.
 *
 * `unsupported` nimmt Felder auf, die das Paket bewusst **nicht** trägt; sie werden gezählt und benannt
 * statt stillschweigend verworfen.
 */
export function exportPolicyDocument(model: AdminPolicyModel, format: PolicyExportFormat, unsupported: readonly unknown[] = []): PolicyDocumentExport {
  const stamp = new Date(model.updatedAt || Date.now()).toISOString().slice(0, 10);
  if (format === 'summary-csv') {
    const text = exportAdminSummaryCsv(model);
    return { fileName: `admin-policy-summary-${stamp}.csv`, format, bytes: new TextEncoder().encode(text), text };
  }
  const bytes = exportAdminPortablePackage(model, [...unsupported]);
  return { fileName: `admin-policy-${stamp}${POLICY_DOCUMENT_EXTENSION}`, format, bytes, text: new TextDecoder().decode(bytes) };
}

export interface PolicyPackagePreview {
  package: AdminPortablePackage;
  /** Felder, die der Import **nicht** aus dem Paket übernimmt — benannt, nicht verschwiegen. */
  retainedLocally: readonly string[];
}

const PACKAGE_FIELDS = ['organization', 'roles', 'deployment', 'encryption', 'dlp', 'retention', 'network', 'continuity', 'privacy', 'lifecycle'] as const;
/** Lokale Sicherheitsfakten, die ein Fremdpaket nicht überschreiben darf. */
const LOCAL_ONLY_FIELDS = ['assignments', 'breakGlass', 'devices', 'audit'] as const;

/**
 * Liest ein Fremdpaket und sagt, **was es ändern würde** — ohne es anzuwenden.
 *
 * Der Import ist eine Vorschau-Stufe, weil ein Richtliniendokument feindliche Eingabe ist: der Nutzer
 * sieht erst die Feldliste, dann wird angewendet.
 */
export function previewPolicyPackage(bytes: Uint8Array): PolicyPackagePreview {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_IMPORT_BYTES) throw new PolicyInterchangeError('policy-import-size');
  try {
    const parsed = importAdminPortablePackage(bytes);
    return { package: parsed, retainedLocally: [...LOCAL_ONLY_FIELDS] };
  } catch (error) {
    // Alle Ablehnungen des Paketlesers werden zu **einem** Fehlertyp mit dem **ursprünglichen** Code:
    // der Aufrufer hat eine Sorte Fehler zu behandeln, und der Code bleibt der benannte des Prüfers.
    const code = error instanceof Error && error.message ? error.message.split(':')[0] : 'admin-portable-invalid';
    throw new PolicyInterchangeError(code.trim().slice(0, 192) || 'admin-portable-invalid');
  }
}

/**
 * Wendet ein Paket an. Die zehn Paketfelder ersetzen die lokalen; Zuordnungen, Break-Glass-Sitzungen,
 * Geräte und das Auditprotokoll bleiben lokal — ein importiertes Dokument darf die eigene
 * Berechtigungslage und den eigenen Nachweis nicht überschreiben.
 */
export function applyPolicyPackage(model: AdminPolicyModel, pkg: AdminPortablePackage, now = Date.now()): AdminPolicyModel {
  if (pkg.schema !== 'vgt.admin.portable/1') throw new PolicyInterchangeError('admin-portable-schema');
  const next: AdminPolicyModel = {
    ...model,
    organization: pkg.organization,
    roles: pkg.roles,
    deployment: pkg.deployment,
    encryption: pkg.encryption,
    dlp: pkg.dlp,
    retention: pkg.retention,
    network: pkg.network,
    continuity: pkg.continuity,
    privacy: pkg.privacy,
    lifecycle: pkg.lifecycle,
    updatedAt: now,
  };
  return next;
}

export function packageFieldNames(): readonly string[] {
  return [...PACKAGE_FIELDS];
}

export function localOnlyFieldNames(): readonly string[] {
  return [...LOCAL_ONLY_FIELDS];
}

/** Authentifiziertes Speichern der lokalen Richtlinie. Passwortlänge und Container prüft der Store. */
export async function saveEncryptedPolicyDocument(model: AdminPolicyModel, password: string, savedAt = Date.now()): Promise<Uint8Array> {
  if (!model || model.schema !== 'vgt.admin.policy/1') throw new PolicyInterchangeError('admin-policy-schema');
  return packVAdmin({ schema: 'vgt.admin.store/1', model, savedAt }, password);
}

/**
 * Öffnet einen gespeicherten Container. Fail-closed: ein unlesbares oder fremd-versioniertes Dokument
 * ergibt einen **benannten** Fehler, niemals ein Teildokument und niemals ein stilles Zugeständnis.
 */
export async function openEncryptedPolicyDocument(bytes: Uint8Array, password: string): Promise<AdminPolicyModel> {
  try {
    const store = await unpackVAdmin(bytes, password);
    if (store.schema !== 'vgt.admin.store/1' || store.model.schema !== 'vgt.admin.policy/1') {
      throw new PolicyInterchangeError('vadmin-schema');
    }
    return store.model;
  } catch (error) {
    if (error instanceof AdminStoreError) throw error;
    if (error instanceof PolicyInterchangeError) throw error;
    throw new PolicyInterchangeError('vadmin-unreadable');
  }
}

function nextSequence(model: AdminPolicyModel): number {
  return Math.max(0, ...model.lifecycle.versions.map((version) => version.sequence)) + 1;
}

/** Legt eine Version des **jetzigen** Richtlinienstands an (ohne Zuordnungen/Audit zu duplizieren). */
export function snapshotPolicyVersion(model: AdminPolicyModel, actor: string, now = Date.now()): AdminPolicyModel {
  const payload = { ...model, assignments: [], breakGlass: [], devices: [], audit: { ...model.audit, events: [] } };
  const version: PolicyVersion<unknown> = {
    id: `policy-v${nextSequence(model)}-${now}`,
    schemaVersion: 1,
    sequence: nextSequence(model),
    createdAt: now,
    createdBy: String(actor ?? '').slice(0, 192) || 'local-owner',
    status: 'draft',
    payload,
  };
  return { ...model, lifecycle: addPolicyVersion(model.lifecycle, version), updatedAt: now };
}

export function rollbackToPolicyVersion(model: AdminPolicyModel, targetId: string, actor: string, now = Date.now()): AdminPolicyModel {
  return { ...model, lifecycle: rollbackPolicy(model.lifecycle, targetId, actor, now), updatedAt: now };
}

export interface PolicyVersionDiff {
  fromId?: string;
  toId?: string;
  changes: Array<{ path: string; before: unknown; after: unknown }>;
}

/** Vergleicht zwei Versionen über die **eine** vorhandene Diff-Funktion. */
export function diffPolicyVersions(model: AdminPolicyModel, fromId: string, toId: string): PolicyVersionDiff {
  const from = model.lifecycle.versions.find((version) => version.id === fromId);
  const to = model.lifecycle.versions.find((version) => version.id === toId);
  if (!from || !to) throw new PolicyInterchangeError('admin-policy-version-missing');
  return { fromId, toId, changes: diffPolicy(from.payload, to.payload) };
}

export interface AuditExport {
  ndjson: string;
  eventCount: number;
}

/**
 * Exportiert das Auditprotokoll über die vorhandene Abfrage. Der Export ist **auf die im Dokument
 * vorhandenen Hashes begrenzt** (`exportAuditNdjson` filtert), damit keine erfundenen Zeilen entstehen.
 */
export function exportPolicyAudit(model: AdminPolicyModel, limit = 1000): AuditExport {
  const events = queryAudit(model.audit, {}, Math.max(1, Math.min(5000, Math.trunc(limit))));
  return { ndjson: exportAuditNdjson(model.audit, events), eventCount: events.length };
}

/** Ein `.vpolicy` gilt als benutzbares Dokument nur mit passendem Schema — sonst fail-closed. */
export function assertUsablePolicyDocument(candidate: unknown): AdminPolicyModel {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new PolicyInterchangeError('admin-policy-schema');
  const model = candidate as Partial<AdminPolicyModel>;
  if (model.schema !== 'vgt.admin.policy/1') throw new PolicyInterchangeError('admin-policy-schema');
  if (!model.organization || !Array.isArray(model.roles) || !model.audit || !Array.isArray(model.audit.events)) {
    throw new PolicyInterchangeError('admin-policy-schema');
  }
  return model as AdminPolicyModel;
}

/**
 * Textform eines Containers für die Zwischenablage.
 *
 * `btoa(String.fromCharCode(...bytes))` wirft bei großen Feldern (`Maximum call stack size exceeded`);
 * deshalb in Blöcken. Die Länge ist vorher begrenzt, damit eine feindliche Eingabe nicht den
 * Hauptthread blockiert.
 */
export function encodeContainerBase64(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new PolicyInterchangeError('vadmin-container-size');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function decodeContainerBase64(value: string): Uint8Array {
  const text = String(value ?? '').trim();
  if (text.length === 0 || text.length > MAX_IMPORT_BYTES * 2) throw new PolicyInterchangeError('vadmin-container-size');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) throw new PolicyInterchangeError('vadmin-container-invalid');
  let binary: string;
  try {
    binary = atob(text.replace(/\s+/g, ''));
  } catch {
    throw new PolicyInterchangeError('vadmin-container-invalid');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORT_BYTES) throw new PolicyInterchangeError('vadmin-container-size');
  return bytes;
}

/** Die Rohbytes eines öffentlichen Enterprise-Root-Schlüssels: 32 Bytes, sonst fail-closed. */
export function decodeRootPublicKey(value: string): Uint8Array {
  const text = String(value ?? '').trim();
  if (text.length === 0 || text.length > 512) throw new PolicyInterchangeError('admin-root-key-length');
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }
  try {
    const bytes = decodeContainerBase64(text);
    if (bytes.byteLength !== 32) throw new PolicyInterchangeError('admin-root-key-length');
    return bytes;
  } catch {
    throw new PolicyInterchangeError('admin-root-key-length');
  }
}

export interface SignedManifestOutcome {
  accepted: boolean;
  reason: 'verified-enterprise-root' | 'signature-invalid' | 'manifest-invalid' | 'payload-unusable';
  /** Der anzuwendende Zustand: bei Erfolg die Nutzlast, sonst die strengste Richtlinie. */
  model: AdminPolicyModel;
}

/**
 * Prüft ein signiertes Organisationsmanifest und liefert **den anzuwendenden Zustand**.
 *
 * Fail-closed in zwei Stufen: eine abgelehnte Signatur ergibt den strengsten Rückfall, und eine
 * akzeptierte, aber unbrauchbare Nutzlast ergibt ihn ebenfalls — ein gültiger Umschlag um einen
 * kaputten Inhalt darf nicht angewendet werden.
 */
export async function verifySignedPolicyManifest(
  current: AdminPolicyModel,
  manifest: SignedOrganizationPolicyManifest<unknown>,
  rootPublicKeyRaw: Uint8Array,
): Promise<SignedManifestOutcome> {
  const fallback = strictestAdminPolicy(current);
  const outcome = await verifyOrganizationPolicyManifest(manifest, rootPublicKeyRaw, fallback);
  if (!outcome.accepted) return { accepted: false, reason: outcome.reason, model: fallback };
  try {
    return { accepted: true, reason: 'verified-enterprise-root', model: assertUsablePolicyDocument(outcome.payload) };
  } catch {
    return { accepted: false, reason: 'payload-unusable', model: fallback };
  }
}

/** Nur für Nachweis/Diagnose: die Bytes, über die eine Signatur gebildet wird. */
export function manifestSignedBytes<T>(manifest: Pick<SignedOrganizationPolicyManifest<T>, 'schema' | 'keyId' | 'payload'>): Uint8Array {
  return canonicalOrganizationPolicyPayload(manifest);
}
