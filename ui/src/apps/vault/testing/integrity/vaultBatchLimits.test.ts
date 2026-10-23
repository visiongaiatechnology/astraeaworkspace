// STATUS: PLATIN — eine Obergrenze für Batch-Operationen (V-006).
//
// **Der Befund:** Verschieben, Kopieren und Duplizieren verarbeiteten eine **beliebig große** Auswahl auf
// einmal — keine Zahl, keine Byte-Grenze, keine Rückfrage. Zwei echte Folgen:
//   • **Speicher:** `copyVaultFiles`/`duplicateVaultFiles` erzeugen neue Einträge, und bei Anhängen trägt
//     jeder Eintrag seine Nutzlast als Base64-Zeichenkette (~4/3 der Dateigröße, gemessen in Runde 83f).
//     Tausend Anhänge auf einmal zu duplizieren ist kein Bedienvorgang mehr, sondern ein Speicherunfall.
//   • **Unumkehrbarkeit:** ein versehentliches „alles auswählen + kopieren" ist ohne Grenze ein Vorgang, den
//     niemand mehr überschaut.
//
// **Keine zweite Autorität:** die Zahl leitet sich aus der **vorhandenen** Importgrenze ab, denn eine
// Batch-Operation ist der zweite Weg, auf dem Nutzlast in den Vault kommt.
import { describe, expect, it } from 'vitest';
import {
  assertVaultBatchWithinLimits,
  VAULT_BATCH_MAX_FILES,
  VAULT_BATCH_OPERATIONS,
  vaultBatchLimitMessage,
  VAULT_IMPORT_MAX_FILES,
  VAULT_IMPORT_MAX_TOTAL_BYTES,
  VaultImportLimitError,
} from '../../../../shared/vault/integrity/vaultIntegrity';

const entry = (sizeBytes: number) => ({ sizeBytes });

describe('Die Grenze ist genau eine und leitet sich ab', () => {
  it('die Batch-Grenze ist die Importgrenze, kein zweiter Zahlenwert', () => {
    expect(VAULT_BATCH_MAX_FILES).toBe(VAULT_IMPORT_MAX_FILES);
    expect(VAULT_BATCH_MAX_FILES).toBe(256);
  });

  it('es gibt genau drei Batch-Vorgänge', () => {
    expect(VAULT_BATCH_OPERATIONS).toEqual(['move', 'copy', 'duplicate']);
  });
});

describe('Die Anzahl ist begrenzt', () => {
  it('genau an der Grenze wird angenommen, ein Eintrag darüber abgelehnt', () => {
    const atLimit = Array.from({ length: VAULT_BATCH_MAX_FILES }, () => entry(10));
    expect(assertVaultBatchWithinLimits('copy', atLimit)).toEqual({ count: VAULT_BATCH_MAX_FILES, totalBytes: VAULT_BATCH_MAX_FILES * 10 });
    const overLimit = [...atLimit, entry(10)];
    expect(() => assertVaultBatchWithinLimits('copy', overLimit)).toThrow(VaultImportLimitError);
    expect(() => assertVaultBatchWithinLimits('copy', overLimit)).toThrow('vault_import_batch_count');
  });

  it('die Ablehnung nennt die Grenze und sagt, was zu tun ist', () => {
    const message = vaultBatchLimitMessage('duplicate', 'count');
    expect(message).toContain('256');
    expect(message).toContain('Select fewer entries');
    expect(message).toContain('duplicate');
  });

  it('eine leere Auswahl wird abgelehnt, nicht als Erfolg gemeldet', () => {
    expect(() => assertVaultBatchWithinLimits('move', [])).toThrow('vault_import_empty_batch');
    expect(() => assertVaultBatchWithinLimits('move', undefined as never)).toThrow('vault_import_empty_batch');
  });

  it('ein unbekannter Vorgang wird abgelehnt — fail-closed', () => {
    expect(() => assertVaultBatchWithinLimits('loeschen' as never, [entry(1)])).toThrow('vault_batch_operation_invalid');
  });
});

describe('Nur vervielfachende Vorgänge werden zusätzlich über die Bytes begrenzt', () => {
  it('`copy` und `duplicate` verdoppeln Nutzlast und sind byte-begrenzt', () => {
    // Eine Auswahl knapp an der Byte-Grenze ist erlaubt …
    const large = [entry(Math.floor(VAULT_IMPORT_MAX_TOTAL_BYTES / 2)), entry(Math.floor(VAULT_IMPORT_MAX_TOTAL_BYTES / 2))];
    expect(assertVaultBatchWithinLimits('copy', large).totalBytes).toBeLessThanOrEqual(VAULT_IMPORT_MAX_TOTAL_BYTES);
    // … eine darüber nicht.
    const over = [entry(VAULT_IMPORT_MAX_TOTAL_BYTES), entry(1)];
    expect(() => assertVaultBatchWithinLimits('copy', over)).toThrow('vault_import_batch_total_bytes');
    expect(() => assertVaultBatchWithinLimits('duplicate', over)).toThrow('vault_import_batch_total_bytes');
    // Und die Meldung erklärt, **warum** hier zusätzlich begrenzt wird.
    expect(vaultBatchLimitMessage('copy', 'total_bytes')).toContain('multiplies the stored payload');
  });

  it('`move` berührt die Nutzlast nicht und ist deshalb nur über die Anzahl begrenzt', () => {
    /*
     * Ein Verschieben ändert **nur** den Ordner. Eine Byte-Grenze wäre dort eine Regel ohne Grund — und
     * Regeln ohne Grund werden umgangen. Die Anzahl bleibt begrenzt, weil eine Auswahl von 10 000 Einträgen
     * auch ohne Nutzlast kein Bedienvorgang ist.
     */
    const large = [entry(VAULT_IMPORT_MAX_TOTAL_BYTES), entry(VAULT_IMPORT_MAX_TOTAL_BYTES)];
    expect(assertVaultBatchWithinLimits('move', large)).toEqual({ count: 2, totalBytes: VAULT_IMPORT_MAX_TOTAL_BYTES * 2 });
    expect(() => assertVaultBatchWithinLimits('move', Array.from({ length: VAULT_BATCH_MAX_FILES + 1 }, () => entry(1))))
      .toThrow('vault_import_batch_count');
  });
});

describe('Fail-closed bei unbrauchbaren Größen', () => {
  it('eine unbrauchbare Größe wird abgelehnt, nicht als 0 gezählt', () => {
    // Eine verborgene Größe könnte eine beliebig große Nutzlast sein — sie darf die Grenze nicht umgehen.
    expect(() => assertVaultBatchWithinLimits('copy', [entry(Number.NaN)])).toThrow('vault_batch_size_invalid');
    expect(() => assertVaultBatchWithinLimits('copy', [entry(Number.POSITIVE_INFINITY)])).toThrow('vault_batch_size_invalid');
    expect(() => assertVaultBatchWithinLimits('copy', [entry(-1)])).toThrow('vault_batch_size_invalid');
    expect(() => assertVaultBatchWithinLimits('copy', [{ sizeBytes: 'gross' } as never])).toThrow('vault_batch_size_invalid');
  });

  it('eine fehlende Größe wird **abgelehnt** — fail-closed, kein stiller Nullwert', () => {
    /*
     * **Gemessene Korrektur meiner Erwartung.** Ich hatte angenommen, ein fehlendes `sizeBytes` (z. B. bei
     * einem Workspace-Verweis) dürfe als 0 zählen. Der Code lehnt es ab (`Number(undefined)` ist `NaN`), und
     * **das ist die bessere Regel**: wer eine Größe **verschweigt**, darf die Grenze nicht dadurch umgehen,
     * dass er das Feld weglässt. Ein `undefined` ist kein „null Bytes", sondern „unbekannt" — und bei einer
     * Grenze zählt das Unbekannte gegen den Antragsteller, nicht für ihn.
     */
    expect(() => assertVaultBatchWithinLimits('move', [{ sizeBytes: undefined } as never])).toThrow('vault_batch_size_invalid');
    // Eine **ausdrückliche** 0 ist dagegen gültig: der Aufrufer sagt, es gibt keine Nutzlast.
    expect(assertVaultBatchWithinLimits('move', [entry(0)])).toEqual({ count: 1, totalBytes: 0 });
  });
});
