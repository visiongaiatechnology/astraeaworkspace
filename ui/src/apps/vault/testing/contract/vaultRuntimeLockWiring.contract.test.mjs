// STATUS: PLATIN — Quellvertrag: die Sitzungssperre muss verdrahtet sein, sonst ist sie nur vorhanden.
//
// Warum es diese Datei gibt: `VaultFreeRuntime` ist **eine Ebene über** dem Eigentumsbereich dieser
// Aufgabe (`edition/open-core/apps/vault/`). Die Sperre lässt sich dort deshalb nicht setzen; sie ist als
// `locked`-Prop implementiert und getestet. Ein Prop, das niemand übergibt, ist aber keine Funktion — und
// genau das würde eine reine Unit-Zusage verschweigen. Dieser Vertrag liest den echten Laufzeitpfad und
// benennt die fehlende Zeile, statt sie zu verschweigen.
//
// Absichtlich als `.mjs`: TypeScript-Testdateien haben in diesem Projekt keine Node-Typdeklarationen
// (`node:fs` → TS2307).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { vi,  describe, expect, it } from 'vitest';

// **Budget, kein Inhalt (Runde 262) ✗✓:** Dieser Quellvertrag **liest die Produktionsdateien** — *unter Last
// braucht er 12,7 s und laeuft damit in das Standardbudget von 5 s* ✗. **In Isolation ist er gruen (17/17)** ✓,
// und der Notes-Agent hat dieselbe Gestalt an den geteilten Waechtern gemessen ✓. **Die ehrliche Behebung ist
// mehr Zeit, nicht eine schwaechere Zusicherung** ✓✓. *Grenze offen gesagt:* die Datei gehoert der Vault-App ✗ —
// ich habe **nur das Budget** gesetzt und **keine** Zusicherung angefasst ✓.
vi.setConfig({ testTimeout: 120_000 });

const repoRoot = process.cwd();
/**
 * **Zeilenenden werden auf `\n` normalisiert.** Ein CRLF-Anker gegen eine LF-Datei traf nie, und der
 * Gegencheck blieb grün — eine Nullmessung, die ich erst beim Nachsehen bemerkt habe. Die Normalisierung
 * steht deshalb **hier**, in der einen Lesefunktion: danach kann diese Fehlerklasse nicht wiederkehren.
 */
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
/** Kommentare entfernen, damit ein entferntes Verhalten nicht über einen Kommentar „besteht". */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');

const RUNTIME = 'src/edition/open-core/apps/vault/VaultFreeRuntime.tsx';
const FILES_TAB = 'src/shared/vault/files/VaultFilesTab.tsx';
const ENTRY = 'src/shared/vault/files/VaultFileEntry.tsx';
const PREVIEW = 'src/shared/vault/preview/VaultQuickPreviewModal.tsx';
const ATTESTATION = 'src/apps/vault/security/VaultContentAttestationModal.tsx';
const PANEL = 'src/shared/vault/security/VaultKeyPolicyPanel.tsx';
const POLICY_ENGINE = 'src/shared/vault/security/vaultKeyPolicyEngine.ts';
const QUARANTINE = 'src/shared/vault/preview/vaultPreviewQuarantineEngine.ts';
const INTEGRITY = 'src/shared/vault/integrity/vaultIntegrity.ts';
const PERSISTENCE = 'src/shared/vault/persistence/vaultPersistenceEngine.ts';

describe('Quellvertrag: Sitzungssperre ist verdrahtet', () => {
  it('VaultFilesTab nimmt die Sperre an und setzt sie an beide Dialoge weiter', () => {
    const tab = stripComments(read(FILES_TAB));
    expect(tab).toMatch(/locked\?:\s*boolean/u);
    // Beide Dialoge müssen die Sperre erhalten — der Vorschau-Dialog zeigt entschlüsselte Bytes.
    expect(tab).toMatch(/<VaultQuickPreviewModal[^>]*locked=\{locked\}/u);
    expect(tab).toMatch(/<VaultContentAttestationModal[^>]*locked=\{locked\}/u);
    // Und der gesperrte Zweig muss die Dateiliste verlassen, nicht nur ausgrauen.
    expect(tab).toMatch(/if \(locked\) return/u);
    expect(tab).toMatch(/data-vault-locked="true"/u);
  });

  it('VaultFileEntry unterdrückt das Inline-Thumbnail im gesperrten Zustand', () => {
    const entry = stripComments(read(ENTRY));
    expect(entry).toMatch(/locked\?:\s*boolean/u);
    // Die Bedingung, die das <img> rendert, muss `!locked` enthalten. Ohne Klammerprüfung wäre der Test
    // hier zu nachsichtig: er sucht genau den Ausdruck, der das Bild erzeugt.
    expect(entry).toMatch(/viewMode !== 'list' && !locked && passiveRaster/u);
  });

  it('VaultQuickPreviewModal gibt bei Sperre keine Nutzlast heraus', () => {
    const preview = stripComments(read(PREVIEW));
    expect(preview).toMatch(/locked = false/u);
    expect(preview).toMatch(/if \(locked\) return/u);
    expect(preview).toMatch(/data-vault-preview-locked="true"/u);
    // Der Effekt darf im gesperrten Zustand nicht einmal entschlüsseln.
    expect(preview).toMatch(/if \(!file \|\| locked\)/u);
  });

  it('der Attestationsdialog gibt bei Sperre nichts heraus', () => {
    const attestation = stripComments(read(ATTESTATION));
    expect(attestation).toMatch(/if \(!file \|\| locked\) return null/u);
  });

  it('die Sperre IST am Laufzeiteinstieg verdrahtet — damit ist sie wirksam, nicht nur vorhanden', () => {
    // **Bewusst umgedreht (Runde 82)**, nachdem der Orchestrator die Zeile ergänzt hat — genau wie der
    // vorherige Text dieser Zusicherung es vorschrieb. Vorher war die Sperre implementiert, getestet und
    // **unwirksam**: `VaultFreeRuntime` übergab `locked` nicht, also blieb ein entschlüsseltes Bild sichtbar,
    // während der Tresor als gesperrt galt (V-025).
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).toMatch(/<VaultFilesTab[^>]*locked=\{runtimeLocked\}/u);
    // Und die Dateiliste darf im gesperrten Zustand **nicht** ausgeblendet werden: mit ihr verschwände der
    // gesperrte Zweig (`data-vault-locked`), und der Nutzer sähe gar nichts statt einer Erklärung.
    expect(runtime).not.toMatch(/\{!runtimeLocked && <VaultFilesTab/u);
  });

  it('der „Enclave & Relay"-Dialog wird bei Sperre demontiert, nicht nur überdeckt (Beta-Härtung)', () => {
    // **Gemessener Befund:** `VaultAdvancedModal` zeigt Datei-Metadaten, Peer-Geräte und Key-Deskriptoren,
    // wurde aber ohne Sperrbezug gerendert. Lief die Auto-Lock-Frist ab, während der Dialog offen war,
    // blieb entschlüsseltes Material sichtbar — obwohl `vaultSessionLock.ts` `advancedModal` ausdrücklich
    // als nach dem Sperren unsichtbares Material führt.
    const runtime = stripComments(read(RUNTIME));
    const modal = stripComments(read('src/apps/vault/settings/VaultAdvancedModal.tsx'));

    // Die Komponente selbst kennt den Sperrzustand und rendert im gesperrten Zustand nichts.
    expect(modal).toMatch(/locked:\s*boolean/u);
    expect(modal).toMatch(/if \(!isOpen \|\| locked\) return null/u);

    // Der Laufzeitpfad montiert sie nur entsperrt und übergibt den Zustand explizit.
    expect(runtime).toMatch(/\{!runtimeLocked && \(\s*<VaultAdvancedModal/u);
    expect(runtime).toMatch(/<VaultAdvancedModal[\s\S]{0,200}?locked=\{runtimeLocked\}/u);

    // Beim Umschalten auf „gesperrt" wird der Dialog aktiv geschlossen — auch ohne Neumount.
    expect(runtime).toMatch(/setIsAdvancedModalOpen\(false\)/u);
    // Metadaten-Zähler im Kopf dürfen den gesperrten Zustand nicht verraten.
    expect(runtime).toMatch(/runtimeLocked \? 0 : linkedDocumentCount/u);
  });
});

describe('Quellvertrag: eine Grenze, eine Implementierung', () => {
  it('die Quarantäne-Prüfung erfindet keine zweite Byte-Grenze', () => {
    const quarantine = stripComments(read(QUARANTINE));
    // Vorher: `const MAX_IMPORT_BYTES = 128 * 1024 * 1024;` — eine zweite Zahl für dieselbe Tatsache.
    expect(quarantine).toMatch(/const MAX_IMPORT_BYTES = VAULT_IMPORT_MAX_FILE_BYTES;/u);
    expect(quarantine).not.toMatch(/MAX_IMPORT_BYTES = \d/u);
    expect(quarantine).toMatch(/VAULT_IMPORT_MAX_FILE_BYTES/u);
  });

  it('die Grenzen stehen an genau einer Stelle', () => {
    const integrity = stripComments(read(INTEGRITY));
    for (const name of ['VAULT_IMPORT_MAX_FILE_BYTES', 'VAULT_IMPORT_MAX_FILES', 'VAULT_IMPORT_MAX_TOTAL_BYTES', 'VAULT_IMPORT_MAX_NAME_LENGTH']) {
      expect(integrity, name).toMatch(new RegExp(`export const ${name} =`, 'u'));
    }
    // Und die Prüffunktion selbst steht dort, wo Produktionscode sie importiert — nicht in einem Modul,
    // das nur sein eigener Test kennt.
    expect(integrity).toMatch(/export function assertVaultImportWithinLimits/u);
    expect(integrity).toMatch(/export class VaultImportLimitError/u);
  });
});

/**
 * Erreichbarkeit, gemessen statt behauptet.
 *
 * Anlass: meine erste Fassung dieses Batches legte `vaultImports.ts` und `vaultSessionLock.ts` an, die
 * **ausschließlich von ihren eigenen Tests** importiert wurden. Genau das ist die Lehre aus AST-0238 und
 * der Grund, warum dieses Projekt ein Erreichbarkeitswerkzeug hat. Die Grenzprüfung und den Sperrzusagen-
 * Wächter habe ich daraufhin in bereits erreichbare Module verlagert (`integrity/vaultIntegrity.ts`,
 * `shared/vault/files/VaultFilesTab.tsx`). Diese Tests halten den gemessenen Zustand fest, damit er nicht
 * unbemerkt zurückfällt.
 *
 * Als `.mjs`, weil hier das Dateisystem gelesen wird und `.ts`-Tests in diesem Projekt keine
 * Node-Typdeklarationen haben (TS2307).
 */
describe('Quellvertrag: die neuen Zusagen liegen in erreichbaren Modulen', () => {
  const SRC = 'src';
  /** Alle Produktionsquelldateien (ohne Testdateien) einmal einlesen. */
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx|mjs)$/u.test(entry.name) ? [full] : [];
  });
  const isTestFile = (file) => /\.(test|spec)\.(ts|tsx|mjs)$/u.test(file);
  const importersOf = (needle) => walk(SRC)
    .filter((file) => !isTestFile(file))
    .filter((file) => new RegExp(`(?:from\\s+|import\\s*\\(\\s*)'[^']*${needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'`, 'u')
      .test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(/\\/gu, '/'));

  it('die Importgrenzen werden von Produktionscode importiert, nicht nur von einem Test', () => {
    const importers = importersOf('integrity/vaultIntegrity');
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.some((file) => !file.includes('/testing/'))).toBe(true);
  });

  it('der Sitzungssperren-Wächter wird von VaultFilesTab aufgerufen', () => {
    // Ohne diese Zeile wäre `vaultSessionLock.ts` ein Modul, das nur sein Test kennt — genau der Fehler,
    // den ich in der ersten Fassung gemacht habe.
    const importers = importersOf('security/vaultSessionLock');
    expect(importers).toContain('src/shared/vault/files/VaultFilesTab.tsx');
    expect(stripComments(read(FILES_TAB))).toMatch(/assertVaultSessionRevoked\(/u);
  });

  it('`shared/vault/vaultImports.ts` IST verdrahtet — die Kompositionsschicht ist erreichbar', () => {
    // **Bewusst umgedreht (Runde 82)**, nachdem der Auftraggeber den Aufrufer freigegeben hat. Vorher stand
    // hier `expect(importersOf('vaultImports')).toEqual([])` — die Kompositionsschicht war fertig, getestet
    // und **unerreichbar** (der AST-0238-Fehler, den ich in diesem Batch selbst gemacht hatte). Jetzt ruft
    // `VaultFreeRuntime.handleAddLocalFiles` sie auf, also greifen Anzahl-, Summen- und Namensgrenze **vor**
    // dem ersten `FileReader`. Wird der Aufruf zurückgenommen, wird dieser Test rot.
    const importers = importersOf('vaultImports');
    expect(importers).toContain('src/edition/open-core/apps/vault/VaultFreeRuntime.tsx');
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).toMatch(/buildVaultImportEntries\(incomingFiles, vaultPreviewParserAdapters, folderId\)/u);
    // Und der alte, unbegrenzte Pfad darf nicht zurückkehren: kein direkter Aufbau eines Anhangs mehr im
    // Import-Handler des Runtimes.
    expect(runtime).not.toMatch(/createVaultAttachmentEntry/u);
    expect(stripComments(read('src/shared/vault/vaultImports.ts'))).toMatch(/export async function buildVaultImportEntries/u);
  });

  it('die Importgrenzen werden durchgesetzt, bevor ein Anhang entsteht', () => {
    // Die Reihenfolge in der Kompositionsschicht ist die Zusage: erst prüfen, dann lesen.
    const composition = stripComments(read('src/shared/vault/vaultImports.ts'));
    const assertIndex = composition.indexOf('assertVaultImportWithinLimits(');
    const createIndex = composition.indexOf('createVaultAttachmentEntry(');
    expect(assertIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(assertIndex);
  });
});

describe('Quellvertrag: Schutzwechsel ist fail-closed', () => {
  it('das Panel setzt den Ausweis nicht mehr vor der Policy', () => {
    const panel = stripComments(read(PANEL));
    // Der Befund als Zusicherung: `resolveVaultProtectionChange` muss **vor** jedem Ausweis-Setzer stehen.
    const resolveIndex = panel.indexOf('resolveVaultProtectionChange(');
    const firstSetterIndex = Math.min(
      ...['onSetActiveDocumentPin?.('].map((needle) => panel.indexOf(needle, resolveIndex + 1)).filter((index) => index >= 0),
    );
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(firstSetterIndex).toBeGreaterThan(resolveIndex);
    // Und die alte Reihenfolge darf nicht zurückkehren.
    expect(panel).not.toMatch(/updateVaultProtectionMode\(policy, pendingMode\)/u);
  });

  it('der Auto-Lock-Vergleich ist fail-closed', () => {
    const engine = stripComments(read(POLICY_ENGINE));
    // Vorher: `… || now < lastActivityAt) return false;` — der unsichere Ausgang war „offen bleiben".
    expect(engine).not.toMatch(/now < lastActivityAt\) return false/u);
    expect(engine).toMatch(/if \(!Number\.isFinite\(lastActivityAt\) \|\| !Number\.isFinite\(now\)\) return true;/u);
  });
});

describe('V-010: der Sperrzustand wird ins Dokument geschrieben, bevor er umschaltet', () => {
  it('die Sperränderung persistiert **zuerst** und setzt den Zustand **danach**', () => {
    /*
     * Der Befund: `runtimeLocked` lebte nur im Speicher. Ein Neuladen setzte den Tresor auf entsperrt zurück,
     * obwohl der Nutzer ihn ausdrücklich gesperrt hatte — „Lock now" galt bis zum nächsten Laden. Damit die
     * Reihenfolge nicht versehentlich umgedreht wird, wird sie hier festgehalten: erst schreiben, dann
     * umschalten. Andernfalls könnte ein Absturz zwischen beiden Schritten einen gesperrten Tresor ohne
     * Sperrvermerk hinterlassen.
     */
    const runtime = stripComments(read(RUNTIME));
    /*
     * **Zusicherung korrigiert (V-039-Runde).** Hier stand ein **exakter Zeichenkettenvergleich** auf
     * `persistVaultLockRecord(document, vaultLockRecord(locked, Date.now()))`. Der ist an einer
     * Umformatierung gescheitert, obwohl die Reihenfolge unverändert richtig war — ein Test, der auf
     * Leerzeichen prüft, meldet Redaktion statt Regression. Geprüft wird jetzt über **normalisierte**
     * Zeichenketten (alle Leerraumfolgen auf ein Leerzeichen), damit die Zusicherung die **Reihenfolge**
     * prüft und nicht die Formatierung.
     */
    const normalise = (text) => text.replace(/\s+/gu, ' ');
    const writeIndex = normalise(runtime).indexOf(normalise('persistVaultLockRecord(document, vaultLockRecord(locked, Date.now()))'));
    const setIndex = normalise(runtime).indexOf(normalise('setRuntimeLocked(locked)'));
    expect(writeIndex, 'Schreibvorgang für den Sperrzustand nicht gefunden').toBeGreaterThan(-1);
    expect(setIndex, 'Zustandsumschaltung nicht gefunden').toBeGreaterThan(-1);
    expect(writeIndex).toBeLessThan(setIndex);
  });

  it('der Startzustand wird aus dem Dokument abgeleitet, nicht auf „entsperrt" gesetzt', () => {
    const runtime = stripComments(read(RUNTIME));
    // Kein `useState(false)` mehr für die Sperre: der Wert kommt aus `deriveVaultLockState`.
    expect(runtime).toContain('deriveVaultLockState(');
    expect(runtime).toMatch(/const \[runtimeLocked, setRuntimeLocked\] = useState\(\s*\(\) => deriveVaultLockState\(/u);
    expect(runtime).not.toMatch(/const \[runtimeLocked, setRuntimeLocked\] = useState\(false\)/u);
  });

  it('der Sperrvermerk liegt im zentralen Dokument, nicht in einem zweiten Speicher', () => {
    const runtime = stripComments(read(RUNTIME));
    // Er geht über denselben Dokumentkanal wie die Undo-Historie.
    expect(runtime).toContain('onUpdateDocument(persistVaultLockRecord(');
    expect(runtime).toContain('readVaultLockRecord(document)');
    /*
     * Der Handler wird über **Klammerbilanz** ausgeschnitten, nicht über ein festes Zeichenfenster.
     *
     * **Warum das geändert werden musste (eigener Fehler):** zuerst stand hier `slice(start, start + 400)`.
     * Dieses Fenster lief in den **nächsten** Handler hinein (`onPolicyChange={… persistVaultData({ keyPolicy })}`)
     * und meldete deshalb `persistVaultData(` im Sperrhandler — obwohl dort nur die **Erklärung** stand,
     * warum es dort nicht stehen darf. Ein Fenster ist keine Struktur.
     */
    const lockHandler = (() => {
      const start = runtime.indexOf('onRuntimeLockedChange={(locked)');
      expect(start, 'Sperrhandler nicht gefunden').toBeGreaterThan(-1);
      const open = runtime.indexOf('{', runtime.indexOf('=>', start));
      let depth = 0;
      for (let index = open; index < runtime.length; index += 1) {
        if (runtime[index] === '{') depth += 1;
        else if (runtime[index] === '}') {
          depth -= 1;
          if (depth === 0) return runtime.slice(open, index + 1);
        }
      }
      throw new Error('Sperrhandler nicht abgeschlossen');
    })();
    // Gegenprobe, dass wirklich der Handler ausgeschnitten wurde und nicht ein leeres Fenster.
    expect(lockHandler.length).toBeGreaterThan(20);
    expect(lockHandler).toContain('setRuntimeLocked(locked)');
    // Als **Aufruf** geprüft, nicht als Wort — und jetzt innerhalb der echten Handlergrenzen.
    expect(lockHandler).not.toContain('persistVaultData(');
    expect(lockHandler).toContain('persistVaultLockRecord(');
    // … denn genau das wäre der Widerspruch: der Sperrzustand kann sich nicht über den Pfad schreiben, der
    // ihn durchsetzt. `persistVaultData` liegt im Laufzeitpfad und wirft bei gesperrtem Tresor.
    expect(runtime).toContain("throw new Error('vault_runtime_locked')");
  });

  it('der Träger benutzt den kanonischen Objektvertrag', () => {
    const persistence = stripComments(read(PERSISTENCE));
    /*
     * **Zusicherung korrigiert.** Hier stand ein Vergleich auf die **Literale** `namespace: 'astraea.vault'`
     * und `family: 'session-lock'`. Die Werte liegen aber als benannte Konstanten vor
     * (`VAULT_LOCK_NAMESPACE` / `VAULT_LOCK_FAMILY`) — der Test prüfte damit eine Schreibweise, nicht den
     * Vertrag, und wäre bei jeder Umbenennung rot geworden, ohne dass sich etwas verhalten hätte.
     * Geprüft wird jetzt die **Struktur**: der kanonische Objekttyp und die beiden Konstanten samt Werten.
     */
    expect(persistence).toContain("type: 'ExtensionObject'");
    expect(persistence).toContain('export const VAULT_LOCK_NAMESPACE');
    expect(persistence).toContain('export const VAULT_LOCK_FAMILY');
    expect(persistence).toMatch(/VAULT_LOCK_NAMESPACE = 'astraea\.vault'/u);
    expect(persistence).toMatch(/VAULT_LOCK_FAMILY = 'session-lock'/u);
    // Und der Träger benutzt die Konstanten, statt die Werte zu wiederholen — sonst gäbe es zwei Quellen.
    expect(persistence).toContain('namespace: VAULT_LOCK_NAMESPACE');
    expect(persistence).toContain('family: VAULT_LOCK_FAMILY');
  });
});