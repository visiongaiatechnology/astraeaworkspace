// STATUS: PLATIN — Typisierter Cross-App-Picker für Vault-Assets (V-023).
//
// **Warum es dieses Modul gibt:** es gab keinen Weg für eine andere Anwendung, ein Vault-Asset gezielt
// auszuwählen. Der einzige Auswahlweg war die Vault-eigene Dateiliste. Damit fehlte nicht nur Komfort,
// sondern jede Grundlage für eine **autoritätsgeprüfte** Auswahl aus Writer, Publish oder Present.
//
// **Reihenfolge ist die Sicherheit:** dieses Modul **filtert zuerst** mit `evaluateVaultAccess` und bietet
// dem Nutzer nur an, was die Autorität ohnehin erlaubt. Ein Picker, der alles anzeigt und erst beim Öffnen
// ablehnt, wäre ein Leck in der Oberfläche: er würde Existenz, Namen und Klassifikation von Assets
// preisgeben, auf die die aufrufende Anwendung kein Recht hat. Der Picker ist deshalb kein zweiter
// Urteilsweg, sondern ein **gefilterter Blick** auf das Urteil, das `vaultAccessPolicyEngine` schon fällt.
//
// **Was dieses Modul nicht tut:** es entscheidet nichts. Es gibt kein `allowed` zurück, das nicht aus
// `evaluateVaultAccess` stammt, und es gibt **keinen** Weg, eine gesperrte Datei auszuwählen.
import type { DocumentKind, VaultFile, VaultShareGrant } from '../../contracts/workspace';
import { evaluateVaultAccess, type VaultAccessAction } from '../security/vaultAccessPolicyEngine';

export const MAX_VAULT_PICKER_RESULTS = 500;
export const MAX_VAULT_PICKER_QUERY = 200;

export interface VaultPickerRequest {
  /** Die Anwendung, die auswählt. Bestimmt die Klassifikationsgrenze. */
  app: DocumentKind;
  /** Was die aufrufende Anwendung mit dem Asset tun will. */
  action: VaultAccessAction;
  grants?: readonly VaultShareGrant[] | null;
  now?: number;
}

export interface VaultPickerCandidate {
  fileId: string;
  name: string;
  kind: DocumentKind;
  classification: NonNullable<VaultFile['classification']>;
  sizeBytes: number;
  /** Ob ein Grant den Zugriff trägt (`true`) oder die Klassifikation ihn ohnehin erlaubt (`false`). */
  granted: boolean;
  grantId?: string;
}

export interface VaultPickerListing {
  candidates: VaultPickerCandidate[];
  /** Wie viele Assets die Autorität **nicht** angeboten hat. Wird gezählt und angezeigt, nicht verschwiegen. */
  withheldCount: number;
  /** `true`, wenn die Liste wegen `MAX_VAULT_PICKER_RESULTS` gekürzt wurde. */
  truncated: boolean;
}

/**
 * Baut die Auswahlliste: erst urteilen, dann anzeigen.
 *
 * Die Reihenfolge ist bewusst und wird durch einen Test festgehalten — würde zuerst gefiltert und dann
 * geurteilt, könnte ein `deny` durch einen Suchtreffer sichtbar werden.
 */
export function listVaultPickerCandidates(
  files: readonly VaultFile[],
  request: VaultPickerRequest & { query?: string },
): VaultPickerListing {
  if (!request || typeof request !== 'object' || !request.app) throw new Error('vault_picker_request_invalid');
  const query = typeof request.query === 'string' ? request.query.trim().slice(0, MAX_VAULT_PICKER_QUERY).toLowerCase() : '';

  const accepted: VaultPickerCandidate[] = [];
  let withheldCount = 0;

  for (const file of files) {
    // 1. Urteil. Alles, was hier abgelehnt wird, ist für die aufrufende Anwendung **unsichtbar**.
    const decision = evaluateVaultAccess({
      file,
      app: request.app,
      action: request.action,
      grants: request.grants,
      now: request.now,
    });
    if (!decision.allowed) { withheldCount += 1; continue; }

    // 2. Suche — erst nach dem Urteil, damit ein Treffer kein `deny` sichtbar machen kann.
    if (query && !file.name.toLowerCase().includes(query)) continue;

    accepted.push({
      fileId: file.id,
      name: file.name,
      kind: file.kind,
      classification: file.classification ?? 'Internal',
      sizeBytes: Math.max(0, file.sizeBytes || 0),
      granted: decision.grantId !== undefined,
      grantId: decision.grantId,
    });
  }

  // Stabile Reihenfolge (Name, dann ID), damit die Liste nicht von der Eingabereihenfolge abhängt.
  accepted.sort((a, b) => a.name.localeCompare(b.name) || a.fileId.localeCompare(b.fileId));
  const truncated = accepted.length > MAX_VAULT_PICKER_RESULTS;
  return { candidates: accepted.slice(0, MAX_VAULT_PICKER_RESULTS), withheldCount, truncated };
}

/**
 * Prüft eine **getroffene Auswahl** erneut.
 *
 * Der Picker übergibt eine ID; zwischen Anzeige und Auswahl kann sich der Grant widerrufen haben oder der
 * Tresor gesperrt worden sein. Dieses Modul verlässt sich deshalb **nicht** darauf, dass die ID aus seiner
 * eigenen Liste stammt: es urteilt erneut. Ein Aufrufer, der nur die Liste prüfen würde, hätte ein
 * Zeitfenster, in dem eine widerrufene Freigabe noch greift — genau die Klasse Fehler, die dieses Projekt
 * schon getroffen hat („zwischen Anzeige und Aktion").
 */
export function resolveVaultPickerSelection(
  files: readonly VaultFile[],
  request: VaultPickerRequest,
  fileId: string,
): { ok: true; candidate: VaultPickerCandidate } | { ok: false; reason: string } {
  if (typeof fileId !== 'string' || !fileId) return { ok: false, reason: 'vault_picker_selection_invalid' };
  const file = files.find((candidate) => candidate.id === fileId);
  if (!file) return { ok: false, reason: 'vault_picker_selection_missing' };
  const decision = evaluateVaultAccess({
    file,
    app: request.app,
    action: request.action,
    grants: request.grants,
    now: request.now,
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason };
  return {
    ok: true,
    candidate: {
      fileId: file.id,
      name: file.name,
      kind: file.kind,
      classification: file.classification ?? 'Internal',
      sizeBytes: Math.max(0, file.sizeBytes || 0),
      granted: decision.grantId !== undefined,
      grantId: decision.grantId,
    },
  };
}

/**
 * Was die aufrufende Anwendung **wissen darf**, ohne dass Assets sichtbar werden: wie viele Einträge sie
 * überhaupt sehen könnte. Für Writer sind das mehr als für Publish — die Zahl ist die ehrliche Auskunft
 * „es gibt Einträge, die du nicht siehst", ohne deren Namen zu verraten.
 */
export function vaultPickerReachability(
  files: readonly VaultFile[],
  request: VaultPickerRequest,
): { visible: number; withheld: number } {
  const listing = listVaultPickerCandidates(files, request);
  return { visible: listing.candidates.length, withheld: listing.withheldCount };
}
