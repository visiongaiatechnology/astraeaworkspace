// STATUS: PLATIN — **eine** Autorität für Vault-Namen (V-004).
//
// **Der Befund (gemessen):** Auf dieselbe Frage — „wie lang darf ein Name sein?" — gab es **zwei**
// Antworten mit **verschiedenem Verhalten**:
//   • `vaultIntegrity.assertVaultImportWithinLimits` **lehnt ab**: `if (candidate.name.length > 240) throw … 'name'`.
//   • `vaultFileSystemEngine.normalizedName` **kürzt still**: `return trimmed.slice(0, 240)`.
// Ein 300 Zeichen langer Importname wurde also abgelehnt, ein 300 Zeichen langer Ordnername still auf 240
// gekürzt — und der Nutzer erfuhr nichts. Der Auftrag ist an dieser Stelle eindeutig: **ablehnen statt still
// kürzen**. Zwei Regeln für eine Frage sind außerdem genau die Doppelung, die dieses Projekt mehrfach bezahlt
// hat; ein Test vergleicht deshalb beide Wege ab jetzt gegen **dieselbe** Funktion.
//
// **Warum Ablehnen und nicht Kürzen:** ein gekürzter Name ist ein **anderer** Name. Bei einem Tresor kann das
// zwei Einträge ununterscheidbar machen, und der Nutzer hat nie zugestimmt.
// **Eine** Autorität für die Grenze — und zwar **hier**, nicht in `integrity`.
//
// Gemessener nativer Befund (2026-10-18): `vaultIntegrity` importiert `inferVaultFileAssociation` aus
// `vaultFileSystemEngine`, das seinerseits `vaultNames` importiert. Der Wert-Import der Grenze aus
// `vaultIntegrity` schloss den Kreis; im gebündelten Produktions-Chunk wurde `vaultNames` vor der
// Konstantendefinition ausgewertet und warf `ReferenceError: Cannot access 'g' before initialization`.
// Das riss beim Öffnen eines Grid-Dokuments den ganzen Modulbaum ab (Recovery-Maske). Der Wert steht
// deshalb im Blatt-Modul; `vaultIntegrity` re-exportiert ihn unter dem alten Namen.
export const VAULT_MAX_NAME_LENGTH = 240;



/** Die Fälle, in denen ein Name als Ganzes unbrauchbar ist (nicht bloß zu lang). */
export const VAULT_UNUSABLE_NAME_REASONS = Object.freeze(['empty', 'dot', 'dotdot', 'control_characters'] as const);
export type VaultUnusableNameReason = typeof VAULT_UNUSABLE_NAME_REASONS[number];

export class VaultNameError extends Error {
  readonly reason: VaultUnusableNameReason | 'too_long';
  constructor(reason: VaultUnusableNameReason | 'too_long', message: string) {
    super(`vault_name_${reason}: ${message}`);
    this.name = 'VaultNameError';
    this.reason = reason;
  }
}

export interface VaultNameCheck {
  ok: boolean;
  reason?: VaultUnusableNameReason | 'too_long';
  message?: string;
  /** Der bereinigte Name — nur bei `ok`. */
  name?: string;
}

function unusableReasonOf(trimmed: string): VaultUnusableNameReason | null {
  if (!trimmed) return 'empty';
  if (trimmed === '.') return 'dot';
  if (trimmed === '..') return 'dotdot';
  if (/[\u0000-\u001f]/.test(trimmed)) return 'control_characters';
  return null;
}

export function vaultNameErrorMessage(reason: VaultUnusableNameReason | 'too_long'): string {
  switch (reason) {
    case 'empty': return 'A Vault name cannot be empty.';
    case 'dot': return 'A Vault name cannot be “.”.';
    case 'dotdot': return 'A Vault name cannot be “…”.';
    case 'control_characters': return 'A Vault name cannot contain control characters.';
    case 'too_long': return `A Vault name accepts at most ${VAULT_MAX_NAME_LENGTH} characters — it was not shortened, because a shortened name is a different name.`;
    default: return 'This name is not usable in the Vault.';
  }
}

/**
 * Prüft einen Namen und **gibt das Ergebnis zurück**, statt zu werfen. Das ist der gemeinsame Kern für
 * Datei- und Ordnerwege; `assertVaultNameUsable` wirft für die Aufrufer, die einen Fehler erwarten.
 */
export function checkVaultName(value: unknown): VaultNameCheck {
  if (typeof value !== 'string') return { ok: false, reason: 'empty', message: vaultNameErrorMessage('empty') };
  const trimmed = value.trim();
  const unusable = unusableReasonOf(trimmed);
  if (unusable) return { ok: false, reason: unusable, message: vaultNameErrorMessage(unusable) };
  // **Genau hier** war die Abweichung: `slice(0, 240)` hätte abgeschnitten, diese Prüfung lehnt ab.
  if (trimmed.length > VAULT_MAX_NAME_LENGTH) return { ok: false, reason: 'too_long', message: vaultNameErrorMessage('too_long') };
  return { ok: true, name: trimmed };
}

export function assertVaultNameUsable(value: unknown): string {
  const check = checkVaultName(value);
  if (!check.ok) throw new VaultNameError(check.reason!, check.message!);
  return check.name!;
}

/**
 * Für Anzeige und Eingabefelder: die Grenze, die **tatsächlich** gilt. Ein Feld mit `maxLength` darunter
 * würde Namen verhindern, die der Vault annimmt; eines darüber würde sie durchlassen und dann ablehnen.
 */
export function vaultNameInputMaxLength(): number {
  return VAULT_MAX_NAME_LENGTH;
}
