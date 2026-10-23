// STATUS: DIAMANT VGT SUPREME — Der Vault-Sicherheitsselbsttest läuft in der Testsuite, nicht nur per Klick
//
// Befund (Runde 64, gemessen): `runVaultTestSuite()` fährt die **Produktionspfade** des Tresors und ist die
// stärkste Sicherheitsaussage, die dieses Programm hat — VGT3-Container mit Klartext-Prüfung und Fail-Closed
// bei falschem Kennwort, nicht-exportierbares Signieren mit Selbstprüfung, SHA-256-Chunkintegrität mit
// Ein-Byte-Manipulation, Ausführbar-Erkennung und Zeroisierung.
//
// Erreichbar war sie **nur** über `VaultAdvancedModal` — also erst, wenn ein Nutzer einen Dialog öffnet und
// auf „Selbsttest starten" klickt. In der Testsuite kam sie **nicht** vor: kein einziger Testaufrufer. Ein
// Sicherheitsnachweis, den niemand automatisch fährt, ist eine Behauptung auf Vorrat.
//
// **Was headless läuft und was nicht — gemessen, nicht angenommen:** Container-Rundlauf, Chunkintegrität,
// Ausführbar-Erkennung und Zeroisierung laufen in Node und sind damit dauerhaft geprüft. Der Signierfall
// braucht echtes `crypto.subtle` und scheitert hier **geschlossen** („WebCrypto SubtleCrypto is unavailable")
// — er bleibt ehrlich `NOT_TESTED` und wird **nicht** als bestanden gemeldet. Genau diese Unterscheidung pinnt
// der Test: die Umgebungsgrenze darf nie zu einem stillen Erfolg werden.
import { describe, expect, it } from 'vitest';
import { runVaultTestSuite } from '../../diagnostics/roundtrip/vaultRoundtripTestSuite';
import { packBrowserCredentialContainer, unpackBrowserCredentialContainer } from '../../../../platform/containers/browserContainerCrypto';
import { buildVaultChunkIntegrity, verifyVaultChunkIntegrity } from '../../../../shared/vault/integrity/vaultIntegrity';
import { detectVaultExecutable } from '../../../../shared/vault/preview/vaultPreviewQuarantineEngine';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';

/** Fälle, die ohne Browser laufen müssen. */
const HEADLESS_CASES = ['VGT3_CONTAINER_ROUNDTRIP', 'CHUNK_INTEGRITY', 'QUARANTINE_EXECUTABLE', 'MEMORY_ZEROIZE'] as const;
/** Fälle, die eine Browser-Umgebung brauchen: sie dürfen hier **nicht** bestanden melden. */
const BROWSER_ONLY_CASES = ['NON_EXTRACTABLE_SIGNING'] as const;

const sampleDocument = (): WorkspaceDocument => ({
  schema_version: 1, id: 'vault-suite-test', title: 'Vault suite test', kind: 'Vault',
  created_at: 1, modified_at: 1, version: 1, theme_id: 'default',
  root_object_ids: [], objects: {},
  vaultData: { files: [], folders: [], spaces: [], shares: [], trash: [] },
} as unknown as WorkspaceDocument);

describe('der Vault-Selbsttest ist jetzt ein Gate', () => {
  it('besteht für jeden Fall, der headless laufen kann', async () => {
    const report = await runVaultTestSuite();
    const byId = new Map(report.results.map((result) => [result.id, result]));
    for (const id of HEADLESS_CASES) {
      const result = byId.get(id);
      expect(result, `${id} fehlt im Selbsttest`).toBeDefined();
      expect(result!.passed, `${id}: ${result!.message}`).toBe(true);
    }
    // Die Sicherheitsfälle müssen vollständig vorhanden sein — nicht weniger, nicht andere.
    expect([...byId.keys()].sort()).toEqual([...HEADLESS_CASES, ...BROWSER_ONLY_CASES].sort());
  }, 30_000);

  it('meldet einen Browser-Fall NICHT als bestanden, sondern benennt die Umgebungsgrenze', async () => {
    // Die wichtigste Zusicherung dieser Datei: eine fehlende Fähigkeit darf nie ein stiller Erfolg werden.
    const report = await runVaultTestSuite();
    const signing = report.results.find((result) => result.id === 'NON_EXTRACTABLE_SIGNING');
    expect(signing).toBeDefined();
    if (signing!.passed) {
      // Läuft die Umgebung doch mit WebCrypto, muss der Fall die Selbstprüfung bestanden haben.
      expect(signing!.message).toContain('Non-extractable');
    } else {
      expect(signing!.message).toMatch(/WebCrypto|SubtleCrypto|unavailable/iu);
      // Ein nicht gelaufener Fall darf die Gesamtsumme nicht als bestanden ausgeben.
      expect(report.overallPassed).toBe(false);
    }
  }, 30_000);

  it('zählt bestandene Fälle ehrlich', async () => {
    const report = await runVaultTestSuite();
    expect(report.passedCount).toBe(report.results.filter((result) => result.passed).length);
    expect(report.totalCount).toBe(report.results.length);
    expect(report.overallPassed).toBe(report.passedCount === report.totalCount);
  }, 30_000);
});

describe('die einzelnen Sicherheitszusagen sind direkt geprüft, nicht nur zusammengefasst', () => {
  it('VGT3: Kopfzeile, kein Klartext, Identität, und ein falsches Kennwort scheitert', async () => {
    const password = 'orchestrator-independent-check-2026';
    const bytes = await packBrowserCredentialContainer(sampleDocument(), 'password', password);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('VGT3');
    // Der Titel steht im Dokument; er darf in den verschlüsselten Bytes **nicht** vorkommen.
    expect(new TextDecoder().decode(bytes)).not.toContain('Vault suite test');
    const opened = await unpackBrowserCredentialContainer(bytes, password);
    expect(opened.id).toBe('vault-suite-test');
    // Fail-closed: ein falsches Kennwort darf nicht durchgehen — geprüft, nicht angenommen.
    await expect(unpackBrowserCredentialContainer(bytes, 'definitely-wrong-password')).rejects.toThrow();
  }, 30_000);

  it('Integrität: sauber besteht, ein gekipptes Bit fällt durch', async () => {
    const bytes = new Uint8Array(64 * 1024);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 17) % 256;
    const manifest = await buildVaultChunkIntegrity(bytes, 32 * 1024);
    expect(await verifyVaultChunkIntegrity(bytes, manifest)).toBe(true);
    const tampered = new Uint8Array(bytes);
    tampered[1234] ^= 0x01;
    expect(await verifyVaultChunkIntegrity(tampered, manifest)).toBe(false);
  }, 30_000);

  it('Quarantäne: PE und ELF werden erkannt, ein PDF nicht', () => {
    expect(detectVaultExecutable(new Uint8Array([0x4d, 0x5a, 0, 0]), 'rechnung.pdf.exe')).toBe(true);
    expect(detectVaultExecutable(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), 'nutzlast.bin')).toBe(true);
    expect(detectVaultExecutable(new TextEncoder().encode('%PDF-1.7'), 'bericht.pdf')).toBe(false);
  });
});
