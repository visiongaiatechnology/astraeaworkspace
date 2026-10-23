// STATUS: PLATIN — W-229: Warum ein Speichern scheiterte, ohne Inhalte zu verraten
//
// Die Autosave-Stelle trägt seit je den Kommentar: „Avoid serializing exception details that may contain
// paths/content." Das ist richtig — eine rohe Fehlermeldung kann einen Pfad oder einen Dokumentnamen
// enthalten. Es erklärt aber nicht, warum der Nutzer **gar nichts** erfährt.
//
// Diese Datei trennt beides: Sie liest **nur** den Fehlernamen und bekannte Kennungen und bildet sie auf einen
// kleinen, festen Wortschatz ab. Der Grund ist damit erklärbar, ohne etwas preiszugeben — und er ist rein,
// also ohne Browser prüfbar.
//
// Release Beta 0.1 (blocker #1) ergänzt die **Stufe**: Seit echte Dokumentdateien geschrieben werden, ist
// „Speichern" erst dann erfüllt, wenn die Datei bestätigt ist. Ein Fehler beim Dateischreiben, bei der
// Bestätigungsprüfung oder im Browser-Cache ist nicht mehr derselbe Fall — die Stufe sagt, welche Schicht
// scheiterte, ohne Pfade oder Inhalte auszugeben.
import type {
  WorkspaceFilePersistenceErrorCode,
} from '../../platform/workspace/persistence/workspaceFilePersistence';
import { WorkspaceFilePersistenceError } from '../../platform/workspace/persistence/workspaceFilePersistence';

/** Warum ein Speicherversuch scheiterte — bewusst grob, damit kein Inhalt durchsickert. */
export type WorkspaceSaveFailureCode =
  /** Der Ablageplatz ist voll — der Nutzer kann Platz freigeben. */
  | 'storage-full'
  /** Ein anderer Speichervorgang hält die Sperre — ein zweiter Versuch hilft. */
  | 'save-blocked'
  /** Die native Ablage ist nicht erreichbar (Desktop-Schicht fehlt oder antwortet nicht). */
  | 'native-unavailable'
  /** Alles andere. Bewusst unspezifisch: der Fehlertext wird **nicht** angezeigt. */
  | 'unknown';

/** Welche Persistenzstufe scheiterte — präzisiert den Grund, ohne den Fehlertext zu zeigen. */
export type WorkspaceSaveFailureDetail =
  /** Die Dokumentdatei konnte nicht geschrieben werden (Platz, Rechte, Dienst). */
  | 'file-write-failed'
  /** Die Datei wurde geschrieben, aber ihre Bestätigung (Name/Größe/SHA-256) stimmt nicht. */
  | 'file-verification-failed'
  /** Dokument-ID oder Dateiname verletzten die Vertragsgrenze der Ablage. */
  | 'document-id-rejected'
  /** Die native Ablage antwortet nicht. */
  | 'store-unavailable'
  /** Der verschlüsselte Container konnte nicht gepackt werden (z. B. Provider fehlt). */
  | 'container-pack-failed'
  /** PIN/Passwort fehlt für einen geschützten Container. */
  | 'credential-required'
  /** Die IndexedDB-Krächsicherung konnte nicht geschrieben werden. */
  | 'cache-write-failed';

const FILE_ERROR_DETAIL: Readonly<Record<WorkspaceFilePersistenceErrorCode, WorkspaceSaveFailureDetail | null>> = {
  'invalid-document': 'document-id-rejected',
  'container-pack-failed': 'container-pack-failed',
  'container-unpack-failed': 'container-pack-failed',
  'store-unavailable': 'store-unavailable',
  'write-failed': 'file-write-failed',
  'read-failed': 'store-unavailable',
  'verification-failed': 'file-verification-failed',
  'credential-required': 'credential-required',
};

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return typeof error === 'string' ? error : '';
}

function isStorageFull(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  return /quota|quotaexceeded|storage_full|no space|enospc|disk full/u.test(`${errorText(error)} ${code}`.toLowerCase());
}

/**
 * Bildet einen Fehler auf einen Grund ab. Liest **ausschließlich** `name`, `code` und den Nachrichtentext auf
 * **bekannte Kennungen** — der Text selbst wird nie zurückgegeben, gespeichert oder angezeigt.
 */
export function classifyWorkspaceSaveFailure(error: unknown): WorkspaceSaveFailureCode {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const alle = `${name} ${code} ${message}`.toLowerCase();

  if (/quota|quotaexceeded|storage_full|no space|enospc/u.test(alle)) return 'storage-full';
  if (/lease|locked|busy|blocked|in flight|inflight/u.test(alle)) return 'save-blocked';
  if (/native|tauri|ipc|bridge|unavailable|unsupported/u.test(alle)) return 'native-unavailable';
  return 'unknown';
}

/** Welche Stufe eine Persistenz ausführt — die Klassifizierung darf nicht raten müssen. */
export type WorkspaceSaveStage = 'native-file' | 'indexeddb-cache' | 'unknown';

export interface WorkspaceSaveFailureClassification {
  readonly code: WorkspaceSaveFailureCode;
  readonly detail: WorkspaceSaveFailureDetail | null;
}

/**
 * Klassifiziert Stufe **und** Grund. Der Code bleibt der bestehende kleine Wortschatz (andere Oberflächen
 * hängen daran), das optionale `detail` trägt die präzise Ursache für Statusleiste und Banner.
 */
export function classifyWorkspaceSaveFailureDetailed(
  error: unknown,
  stage: WorkspaceSaveStage = 'unknown',
): WorkspaceSaveFailureClassification {
  if (error instanceof WorkspaceFilePersistenceError) {
    const detail = FILE_ERROR_DETAIL[error.code] ?? null;
    let code: WorkspaceSaveFailureCode;
    switch (error.code) {
      case 'store-unavailable':
      case 'read-failed':
        code = 'native-unavailable';
        break;
      case 'write-failed':
        code = isStorageFull(error.cause) ? 'storage-full' : 'unknown';
        break;
      case 'credential-required':
        code = 'save-blocked';
        break;
      default:
        code = 'unknown';
    }
    return { code, detail };
  }
  const code = classifyWorkspaceSaveFailure(error);
  if (stage === 'indexeddb-cache') return { code, detail: 'cache-write-failed' };
  if (code === 'storage-full') return { code, detail: 'file-write-failed' };
  return { code, detail: null };
}

/** Ein Grund mit Zeitpunkt — mehr wird nicht festgehalten. */
export interface WorkspaceSaveFailure {
  readonly code: WorkspaceSaveFailureCode;
  readonly at: number;
  /** Release Beta 0.1: die konkrete Stufe, damit die Oberfläche den echten Grund nennen kann. */
  readonly detail?: WorkspaceSaveFailureDetail;
}

/**
 * Präzise Stufe eines Datei-Persistenzfehlers, für Statusleiste und Banner. Liefert `null` für
 * Fehler, die nicht aus der Dateiablage stammen — dann gilt der allgemeine Katalogtext.
 */
export function workspaceFilePersistenceFailureDetail(error: unknown): WorkspaceSaveFailureDetail | null {
  return error instanceof WorkspaceFilePersistenceError ? FILE_ERROR_DETAIL[error.code] ?? null : null;
}
