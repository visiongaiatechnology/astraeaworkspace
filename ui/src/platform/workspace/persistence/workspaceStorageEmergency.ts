// STATUS: DIAMANT VGT SUPREME — encrypted Workspace persistence boundary.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { securityPolicyForDocument } from '../../security/securityProfiles';

const EMERGENCY_SNAPSHOT_KEY = 'vgt_emergency_snapshot_v1';
const ACTIVE_DOC_KEY = 'vgt_active_doc_id';

interface EmergencyMarker { version: 2; timestamp: number; documentIds: string[]; }

/**
 * Stores only a non-sensitive crash marker synchronously. The document payload itself is
 * never serialized into LocalStorage because beforeunload cannot perform authenticated
 * asynchronous encryption safely. Real document recovery uses IndexedDB autosave and,
 * on desktop, the encrypted VGT recovery-container path.
 */
export function saveEmergencySnapshot(docs: Record<string, WorkspaceDocument>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const marker: EmergencyMarker = {
      version: 2,
      timestamp: Date.now(),
      documentIds: Object.values(docs).filter((doc) => securityPolicyForDocument(doc).profile !== 'VGT_TOP_SECRET').map((doc) => doc.id).slice(0, 1024),
    };
    window.localStorage.setItem(EMERGENCY_SNAPSHOT_KEY, JSON.stringify(marker));
  } catch (err) {
    console.warn('[WorkspaceStorage] Emergency marker write failed:', err instanceof Error ? err.name : 'Error');
  }
}

/**
 * Legacy compatibility shim. Version-1 plaintext emergency snapshots are deliberately
 * not returned. Reading this function also removes any legacy payload so old installs
 * cannot keep sensitive document JSON in LocalStorage indefinitely.
 */
export function loadEmergencySnapshot(): Record<string, WorkspaceDocument> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(EMERGENCY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EmergencyMarker> & { documents?: unknown };
    if (parsed.documents !== undefined || parsed.version !== 2) {
      window.localStorage.removeItem(EMERGENCY_SNAPSHOT_KEY);
      return null;
    }
  } catch {
    try {
      window.localStorage.removeItem(EMERGENCY_SNAPSHOT_KEY);
    } catch {
      // Ignore cleanup failure.
    }
  }
  return null;
}

/**
 * Clears the emergency snapshot once successfully committed to primary storage.
 */
export function clearEmergencySnapshot(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(EMERGENCY_SNAPSHOT_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Saves or updates the last active document ID in LocalStorage.
 */
export function persistActiveDocId(id: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_DOC_KEY, id);
    }
  } catch {
    // ignore
  }
}

/**
 * Retrieves the last active document ID from LocalStorage.
 */
export function getPersistedActiveDocId(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(ACTIVE_DOC_KEY);
    }
  } catch {
    // ignore
  }
  return null;
}
