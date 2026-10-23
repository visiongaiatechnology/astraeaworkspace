// STATUS: PLATIN — Zugriffsautorität für Workspace-Verweise auf Vault-Assets (V-016).
//
// **Warum es dieses Modul gibt (gemessen, nicht vermutet):** `VaultFreeRuntime.handleOpenVaultFile`
// entschied bis hierher allein danach, ob der Tresor **gesperrt** ist und ob die Dokumentart zur
// Zielanwendung passt. Es gab **keine** Berechtigungsprüfung: `shareGrants` wurde nie gelesen, die
// Klassifikation (`Public`…`Restricted`) wurde angezeigt und sortiert, aber nie durchgesetzt. Jede
// Anwendung durfte damit jedes Asset öffnen, solange der Tresor entsperrt war — die vom Nutzer gesetzten
// Einschränkungen waren eine Anzeige, keine Autorität.
//
// **Kein zweiter Mechanismus:** das Modul erfindet kein neues Rechteobjekt. Es benutzt genau die Felder,
// die der Vertrag schon hat (`VaultShareGrant` mit `permissions`, `status`, `expiresAt`, `revokedAt`,
// `delivery`, `copyControl`) und die Klassifikation aus `VaultFile`. Der Befund war nicht „das Modell fehlt",
// sondern „das Modell wird nicht gelesen".
//
// **Fail-closed:** Jede unbrauchbare Eingabe führt zu einer Ablehnung, nie zu einem stillen Zugeständnis.
// Ein `Public`-Asset ist ausdrücklich als teilbar modelliert (das ist die Bedeutung dieser Stufe), alles
// darüber verlangt eine Autorisierung.
import type { DocumentKind, VaultClassification, VaultFile, VaultShareGrant } from '../../contracts/workspace';

/** Aktionen, die eine Anwendung mit einem Vault-Asset ausführen will. */
export type VaultAccessAction = 'open' | 'preview' | 'export' | 'download';

export type VaultAccessReason =
  | 'policy_allow'
  | 'policy_deny_classification'
  | 'policy_deny_no_grant'
  | 'policy_deny_grant_expired'
  | 'policy_deny_grant_revoked'
  | 'policy_deny_grant_wrong_file'
  | 'policy_deny_grant_permission'
  | 'policy_deny_export_copy_unrevocable'
  | 'policy_deny_invalid_request'
  | 'policy_deny_unknown_classification';

export interface VaultAccessDecision {
  allowed: boolean;
  reason: VaultAccessReason;
  /** Der Grant, der den Zugriff getragen hat — nur bei `allowed` gesetzt. */
  grantId?: string;
  /** Kurzbegründung für die Oberfläche; nennt die Stufe und die Anwendung. */
  message: string;
}

export interface VaultAccessRequest {
  file: Pick<VaultFile, 'id' | 'name' | 'classification' | 'status' | 'securityLabel'>;
  /** Die Anwendung, die zugreifen will. `null` bedeutet: kein App-Bezug (z. B. reine Anzeige). */
  app?: DocumentKind | null;
  action: VaultAccessAction;
  grants?: readonly VaultShareGrant[] | null;
  now?: number;
}

/**
 * Matrix „welche Anwendung darf ein Asset dieser Stufe öffnen".
 *
 * Die Stufen sind aus dem Vertrag übernommen (`VaultClassification`). Die Zuordnung ist **bewusst eng**:
 *  • `Public`     — jede Anwendung. Das ist die Bedeutung dieser Stufe, und sie ist ausdrücklich so gewählt.
 *  • `Internal`   — die Arbeitsbereichs-Anwendungen, aber **nicht** `Publish`, `Connect`, `Automate`,
 *                   `GaiaCom` und `AdminPolicy`: das sind Kanäle, die Inhalte **nach außen** tragen oder
 *                   fremdgesteuert laufen. „Intern" heißt nicht „versendbar".
 *  • `Confidential` / `Restricted` — nur mit gültigem Grant (siehe `evaluateVaultAccess`).
 */
const WORKSPACE_APPS: readonly DocumentKind[] = ['Writer', 'Grid', 'Present', 'Notes', 'Draw', 'Whiteboard', 'PdfStudio', 'Tasks', 'Insight', 'Vault', 'Spaces'];

const CLASSIFICATION_RULES: Readonly<Record<VaultClassification, 'allow' | 'grant_required'>> = Object.freeze({
  Public: 'allow',
  Internal: 'allow',
  Confidential: 'grant_required',
  Restricted: 'grant_required',
});

const KNOWN_CLASSIFICATIONS = new Set<string>(Object.keys(CLASSIFICATION_RULES));

/** `edit` schließt `download` und `view` ein; `download` schließt `view` ein. */
const PERMISSION_RANK: Readonly<Record<VaultShareGrant['permissions'][number], number>> = Object.freeze({
  view: 1, download: 2, edit: 3,
});

/**
 * Welche Berechtigungsstufe eine Aktion verlangt.
 *
 * **Befund + Fix (Runde 82, V-042):** Meine erste Fassung gab `open` die Stufe 2 — dieselbe wie `download`.
 * Damit konnte ein Grant mit `permissions: ['view']` ein Asset **nicht öffnen**, obwohl „ansehen" genau
 * das ist, was `view` bedeutet. Das war keine strenge Regel, sondern eine falsche: `view` muss `preview`
 * **und** `open` abdecken. `export` verlangt `edit`, weil es eine Kopie erzeugt, die sich nicht
 * zurücknehmen lässt; `download` liegt dazwischen.
 */
function actionRank(action: VaultAccessAction): number {
  if (action === 'preview') return 1;
  if (action === 'open') return 1;      // „öffnen" ist „ansehen" in einer Anwendung
  if (action === 'download') return 2;  // erzeugt eine lokale Kopie
  return 3;                             // export — die stärkste Aktion
}

/**
 * Prüft die Anfrage **bevor** irgendein Feld gelesen wird.
 *
 * **Befund + Fix (Runde 82, V-042):** Der ursprüngliche Wächter `if (!request || typeof request !== 'object')`
 * stand zwar da, aber die Meldung rief `message(reason, request)` auf, das wiederum `request.app` liest —
 * bei `null` also `TypeError: Cannot read properties of null`. Gemessen: `evaluateVaultAccess(null)` warf,
 * statt eine Ablehnung zurückzugeben. Für eine Autoritätsfunktion ist das die falsche Reaktion: ein
 * unbrauchbares Argument muss **ablehnen**, nicht abstürzen.
 */
function invalidRequestDecision(): VaultAccessDecision {
  return { allowed: false, reason: 'policy_deny_invalid_request', message: 'Denied: the access request is malformed.' };
}

function message(reason: VaultAccessReason, request: VaultAccessRequest): string {
  const app = request?.app ?? 'no app';
  const classification = request?.file?.classification ?? 'unknown';
  switch (reason) {
    case 'policy_allow': return `Allowed: ${classification} asset for ${app}.`;
    case 'policy_deny_no_grant': return `Denied: ${classification} assets are not shared with ${app} without an explicit grant.`;
    case 'policy_deny_grant_expired': return 'Denied: the grant for this asset has expired.';
    case 'policy_deny_grant_revoked': return 'Denied: the grant for this asset was revoked.';
    case 'policy_deny_grant_wrong_file': return 'Denied: the grant does not belong to this asset.';
    case 'policy_deny_grant_permission': return `Denied: the grant does not cover ${request.action} for ${app}.`;
    case 'policy_deny_export_copy_unrevocable': return 'Denied: this grant already produced an exported copy that cannot be revoked, so further export is blocked.';
    case 'policy_deny_invalid_request': return 'Denied: the access request is malformed.';
    case 'policy_deny_unknown_classification': return 'Denied: the asset carries an unknown classification.';
    default: return `Denied: ${classification} assets are not accessible to ${app}.`;
  }
}

function deny(reason: VaultAccessReason, request: VaultAccessRequest): VaultAccessDecision {
  return { allowed: false, reason, message: message(reason, request) };
}

function allow(reason: VaultAccessReason, request: VaultAccessRequest, grantId?: string): VaultAccessDecision {
  return { allowed: true, reason, message: message(reason, request), grantId };
}

/** Ein Grant ist nur gültig, wenn er zum Asset gehört, aktiv und nicht abgelaufen ist. */
function grantUsability(grant: VaultShareGrant, request: VaultAccessRequest, now: number): VaultAccessReason | null {
  if (!grant || typeof grant.id !== 'string' || !grant.id) return 'policy_deny_invalid_request';
  if (grant.fileId !== request.file.id) return 'policy_deny_grant_wrong_file';
  if (grant.revokedAt !== undefined || grant.status === 'revoked') return 'policy_deny_grant_revoked';
  if (typeof grant.expiresAt === 'number' && grant.expiresAt <= now) return 'policy_deny_grant_expired';
  if (!Array.isArray(grant.permissions) || grant.permissions.length === 0) return 'policy_deny_grant_permission';
  return null;
}

/**
 * Entscheidet, ob eine Anwendung auf ein Vault-Asset zugreifen darf.
 *
 * **Reihenfolge ist die Regel:** Zuerst wird die Anfrage als solche geprüft (unbrauchbare Eingabe →
 * Ablehnung), dann die Klassifikation, dann der Grant. Ein Nutzer, der ein `Confidential`-Asset für eine
 * Anwendung freigegeben hat, bekommt genau diese Anwendung — und keine andere, weil die Grants
 * dateibezogen sind und die Anwendung im Grant nicht steht. Deshalb gilt: **ein Grant autorisiert Zugriff,
 * aber er hebt die Klassifikationsmatrix nicht auf** — er ist die Ausnahme, die sie vorsieht.
 */
export function evaluateVaultAccess(request: VaultAccessRequest): VaultAccessDecision {
  // 1. Anfrage prüfen — vollständig, bevor irgendein Feld gelesen wird.
  if (!request || typeof request !== 'object') return invalidRequestDecision();
  if (!request.file || typeof request.file.id !== 'string' || !request.file.id) return invalidRequestDecision();
  if (request.action !== 'open' && request.action !== 'preview' && request.action !== 'export' && request.action !== 'download') {
    return invalidRequestDecision();
  }
  const now = typeof request.now === 'number' && Number.isFinite(request.now) ? request.now : Date.now();

  // 2. Ein ungesundes Asset wird nie geöffnet, unabhängig von Rechten. (Gürtel und Hosenträger: die
  //    Quarantäne blockiert bereits die Vorschau, aber ein `handleOpenVaultFile` darf sie nicht umgehen.)
  if (request.file.status === 'quarantined' || request.file.status === 'corrupt' || request.file.status === 'missing') {
    return deny('policy_deny_classification', request);
  }

  // 3. Klassifikation. Eine unbekannte oder fehlende Stufe ist **nicht** „Public": sie wird abgelehnt.
  const classification = request.file.classification;
  if (classification === undefined || !KNOWN_CLASSIFICATIONS.has(classification)) {
    return deny('policy_deny_unknown_classification', request);
  }
  const rule = CLASSIFICATION_RULES[classification];

  if (rule === 'allow') {
    // `Internal` ist auf Arbeitsbereichs-Anwendungen begrenzt; `Public` ist offen.
    if (classification === 'Internal' && request.app && !WORKSPACE_APPS.includes(request.app)) {
      // Eine nach außen tragende Anwendung wird für „intern" auf den Grant-Weg verwiesen, statt still
      // zuzugreifen. Ohne Grant ist das eine Ablehnung.
      const denied = evaluateGrantRequirement(request, now);
      return denied ?? deny('policy_deny_no_grant', request);
    }
    return allow('policy_allow', request);
  }

  // 5. Grant erforderlich.
  const outcome = evaluateGrantRequirement(request, now);
  return outcome ?? deny('policy_deny_no_grant', request);
}

/**
 * Prüft, ob ein gültiger Grant den Zugriff trägt. Gibt `null` zurück, wenn **kein** Grant passt — dann
 * entscheidet der Aufrufer, welche Ablehnung er meldet.
 */
function evaluateGrantRequirement(request: VaultAccessRequest, now: number): VaultAccessDecision | null {
  const grants = request.grants;
  if (!Array.isArray(grants) || grants.length === 0) return null;

  // Die **spezifischste** Ablehnung gewinnt: ein vorhandener, aber abgelaufener Grant wird als
  // „abgelaufen" gemeldet und nicht als „kein Grant" — sonst wäre die Meldung für den Nutzer irreführend.
  const candidates = grants.filter((grant) => grant && grant.fileId === request.file.id);
  if (candidates.length === 0) {
    const hasForeign = grants.some((grant) => grant && typeof grant.fileId === 'string' && grant.fileId !== request.file.id);
    return hasForeign ? deny('policy_deny_grant_wrong_file', request) : null;
  }

  const needed = actionRank(request.action);
  let sawRevoked = false;
  let sawExpired = false;
  let sawInsufficient = false;

  for (const grant of candidates) {
    const unusable = grantUsability(grant, request, now);
    if (unusable === 'policy_deny_grant_revoked') { sawRevoked = true; continue; }
    if (unusable === 'policy_deny_grant_expired') { sawExpired = true; continue; }
    if (unusable === 'policy_deny_grant_permission') { sawInsufficient = true; continue; }
    if (unusable) continue;

    // Eine exportierte Kopie lässt sich nicht zurücknehmen — weiterer Export wird blockiert.
    if (request.action === 'export' && grant.copyControl === 'exported_copy_unrevocable') {
      return deny('policy_deny_export_copy_unrevocable', request);
    }

    /*
     * `grant.permissions` ist im Vertrag als `VaultSharePermission[]` deklariert; die Rangtabelle ist ein
     * `Record` über genau diesen Typ. Ich indiziere deshalb über den deklarierten Typ und **nicht** über
     * einen freien String, damit ein unbekannter Berechtigungswert nicht stillschweigend Rang 0 („alles
     * verboten") bekommt, sondern beim Typecheck auffällt.
     */
    const ranks = grant.permissions.map((permission: VaultShareGrant['permissions'][number]) => PERMISSION_RANK[permission] ?? 0);
    const best = ranks.length ? Math.max(...ranks) : 0;
    if (best >= needed) return allow('policy_allow', request, grant.id);
    sawInsufficient = true;
  }

  if (sawRevoked) return deny('policy_deny_grant_revoked', request);
  if (sawExpired) return deny('policy_deny_grant_expired', request);
  if (sawInsufficient) return deny('policy_deny_grant_permission', request);
  return null;
}

/** Nur für Diagnose/Anzeige: darf diese Anwendung Assets dieser Stufe ohne Grant öffnen? */
export function vaultClassificationAllowsApp(classification: VaultClassification, app?: DocumentKind | null): boolean {
  if (!KNOWN_CLASSIFICATIONS.has(classification)) return false;
  if (CLASSIFICATION_RULES[classification] === 'grant_required') return false;
  if (classification === 'Public' || !app) return true;
  return WORKSPACE_APPS.includes(app);
}

/** Die Stufen in aufsteigender Vertraulichkeit — für Sortierung und Anzeige. */
export const VAULT_CLASSIFICATION_ORDER: readonly VaultClassification[] = Object.freeze(['Public', 'Internal', 'Confidential', 'Restricted']);
