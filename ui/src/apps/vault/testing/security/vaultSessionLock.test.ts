// STATUS: PLATIN — Die Sperrzusage als messbare Liste, nicht als Behauptung.
import { describe, expect, it } from 'vitest';
import {
  assertVaultSessionMaterialHidden,
  assertVaultSessionRevoked,
  VAULT_SESSION_LOCKED_VIEW,
  VAULT_SESSION_MATERIALS,
  vaultLockRevocation,
  vaultSessionViewOf,
} from '../../../../shared/vault/security/vaultSessionLock';

describe('Vault-Sitzungssperre: was sichtbar bleibt, wird benannt', () => {
  it('„nichts sichtbar" ist der einzige Zustand, der als gesperrt gilt', () => {
    expect(vaultLockRevocation(VAULT_SESSION_LOCKED_VIEW).revoked).toBe(true);
    expect(vaultLockRevocation(VAULT_SESSION_LOCKED_VIEW).stillVisible).toEqual([]);
    expect(() => assertVaultSessionRevoked(VAULT_SESSION_LOCKED_VIEW)).not.toThrow();
  });

  it('jedes einzelne noch sichtbare Material wird namentlich gemeldet', () => {
    for (const material of VAULT_SESSION_MATERIALS) {
      const view = vaultSessionViewOf({ [material]: true });
      const revocation = vaultLockRevocation(view);
      expect(revocation.revoked, material).toBe(false);
      expect(revocation.stillVisible, material).toEqual([material]);
      expect(() => assertVaultSessionRevoked(view), material).toThrow(new RegExp(`vault_session_not_revoked:${material}`, 'u'));
    }
  });

  it('mehrere Undichtigkeiten werden vollständig aufgezählt, nicht auf die erste gekürzt', () => {
    const view = vaultSessionViewOf({ preview: true, fileList: true, searchResults: true });
    const revocation = vaultLockRevocation(view);
    // Sortierung folgt der kanonischen Reihenfolge, damit die Meldung stabil ist.
    expect(revocation.stillVisible).toEqual(['preview', 'fileList', 'searchResults']);
    expect(() => assertVaultSessionRevoked(view)).toThrow(/preview,fileList,searchResults/u);
  });

  it('ein unbekannter Schlüssel kann die Sperre nicht aufweichen', () => {
    const view = vaultSessionViewOf({ irgendwas: true } as never);
    expect(vaultLockRevocation(view).revoked).toBe(true);
  });

  it('der Einzelaufruf prüft genau ein Material und ist der Weg, den die Komponente nimmt', () => {
    expect(() => assertVaultSessionMaterialHidden('preview', false)).not.toThrow();
    expect(() => assertVaultSessionMaterialHidden('preview', true)).toThrow(/vault_session_not_revoked:preview/u);
    expect(() => assertVaultSessionMaterialHidden('inlineThumbnails', true)).toThrow(/inlineThumbnails/u);
  });

  it('die Materialliste deckt die Komponenten ab, die entschlüsselten Inhalt halten', () => {
    // Diese Zusicherung hält den Befund fest: jede dieser Positionen existierte als State in einer
    // Kindkomponente und wurde vom Sperren des Elternteils nicht zurückgenommen.
    for (const material of ['preview', 'attestation', 'fileList', 'searchResults', 'inlineThumbnails'] as const) {
      expect(VAULT_SESSION_MATERIALS).toContain(material);
    }
  });
});
