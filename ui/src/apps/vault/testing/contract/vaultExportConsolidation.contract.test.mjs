// STATUS: PLATIN — Quellverträge für V-001 und V-043 (Konsolidierung ist tragend).
//
// **Warum diese Datei `.mjs` ist:** sie liest Dateien mit `node:fs`. Ein `.ts`/`.tsx`-Test hat in diesem
// Projekt **keine** Node-Typdeklarationen (`TS2307: Cannot find module 'node:fs'`, `TS2580: Cannot find name
// 'require'`) — genau der Fall, den die Aufgabe nennt. Ich hatte diese zwei Zusicherungen zuerst im
// `.tsx`-Render-Test; `tsc -b` hat sie angemahnt, und sie gehören ohnehin hierher.
//
// **Kommentare werden vor jeder Prüfung entfernt.** Ohne das „bestünde" entferntes Verhalten über seinen
// eigenen Kommentar: der Hinweistext, der die entfernte Schaltfläche erklärt, enthält ihren Namen. Mein
// erster Lauf war aus genau diesem Grund rot, obwohl der Code korrekt war.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
/**
 * Liest eine Datei und **normalisiert die Zeilenenden auf `\n`**.
 *
 * **Warum das hier strukturell steht und nicht als Vorsatz:** Ich habe einen Quellvertrag an einem
 * **CRLF-Anker** scheitern lassen, während die Datei **LF** hatte — die Ersetzung wurde nie angewendet, der
 * Gegencheck blieb **grün** und war damit eine Nullmessung. Dieselbe Fehlerklasse hat mich über drei
 * verschiedene Werkzeuge erwischt (ein festes Zeichenfenster, ein Wortvergleich gegen einen Kommentar und
 * dieser Anker). Jedes Mal war die Antwort, das **Muster durch eine Struktur** zu ersetzen. Diese Funktion
 * ist diese Struktur: nach ihr kann ein Zeilenenden-Unterschied keinen vakanten Treffer mehr erzeugen.
 */
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');

const KEY_POLICY_PANEL = 'src/shared/vault/security/VaultKeyPolicyPanel.tsx';
const SHARE_PANEL = 'src/shared/vault/security/VaultSharePanel.tsx';
const FILES_TAB = 'src/shared/vault/files/VaultFilesTab.tsx';
const SHARE_ENGINE = 'src/shared/vault/security/vaultShareEngine.ts';
const ACCESS_ENGINE = 'src/shared/vault/security/vaultAccessPolicyEngine.ts';

describe('V-043: der zweite, grant-lose Freigabeweg ist gelöscht, nicht versteckt', () => {
  it('das Schlüssel-Panel enthält weder die Schaltfläche noch den Aufruf noch den Eingabestatus', () => {
    const code = stripComments(read(KEY_POLICY_PANEL));
    // Vorher stand hier ein Empfängerpaket-Export ohne Fingerabdruck, Ablauf, Widerruf und Audit.
    expect(code).not.toContain('Export recipient package');
    expect(code).not.toContain('exportRecipientEncryptedVaultPackage');
    expect(code).not.toContain('recipientKey');
  });

  it('der Hinweis auf den verbliebenen Weg steht im gerenderten Markup, nicht nur im Kommentar', () => {
    const code = stripComments(read(KEY_POLICY_PANEL));
    // Der Satz muss im JSX stehen — `stripComments` entfernt Kommentare, der Satz bleibt also nur übrig,
    // wenn er tatsächlich gerendert wird.
    expect(code).toContain('Recipient-encrypted packages are created from');
    expect(code).toContain('no longer offers a second, uncontrolled export path');
  });

  it('es gibt genau **einen** Ort, an dem ein Grant entsteht', () => {
    // `createVaultShare` darf nur aus dem Freigabe-Panel gerufen werden. Ein zweiter Aufrufer wäre ein
    // zweiter Weg — und genau das war der Befund.
    const callers = [KEY_POLICY_PANEL, FILES_TAB, ACCESS_ENGINE].filter((file) => stripComments(read(file)).includes('createVaultShare('));
    expect(callers).toEqual([]);
    expect(stripComments(read(SHARE_PANEL))).toContain('createVaultShare(');
  });

  it('der Export ist eine Zustellart und wird erst **nach** dem Grant ausgelöst', () => {
    const panel = stripComments(read(SHARE_PANEL));
    const createIndex = panel.indexOf('createVaultShare(');
    const exportIndex = panel.indexOf("if (delivery === 'encrypted_export' && onExportEncryptedPackage)");
    expect(createIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(createIndex);
  });

  it('ohne verdrahteten Exporter behauptet das Panel keinen Export', () => {
    // Kein stiller Fehlschlag und kein Versprechen: der Zustand wird benannt.
    expect(stripComments(read(SHARE_PANEL))).toContain('no encrypted-package exporter wired');
  });
});

describe('V-001: der Klartext-Export ist bestätigungspflichtig und benennt die Grenze', () => {
  it('der Download-Zweig öffnet zuerst die Bestätigung, statt sofort zu schreiben', () => {
    const tab = stripComments(read(FILES_TAB));
    // Der `download`-Zweig setzt den Bestätigungszustand …
    expect(tab).toMatch(/if \(target\.action === 'download'\) \{ setPlaintextExport\(/u);
    // … und der Bestätigungspfad ruft `onOpenWith` erst danach.
    expect(tab).toMatch(/const openTargetAfterConfirmation/u);
    const confirmIndex = tab.indexOf('const openTargetAfterConfirmation');
    const callIndex = tab.indexOf('void openTargetAfterConfirmation(pending.file, pending.target)');
    expect(callIndex).toBeGreaterThan(confirmIndex);
  });

  it('die Warnung benennt, was NICHT geschützt ist — nicht bloß „unsicher"', () => {
    const tab = stripComments(read(FILES_TAB));
    for (const phrase of ['not encrypted', 'cannot be recalled', 'does not remove it', 'plaintext']) {
      expect(tab, phrase).toContain(phrase);
    }
    // Und sie ist eine echte Sperre, keine Durchklick-Meldung.
    expect(tab).toContain("PLAINTEXT_EXPORT_CONFIRMATION = 'EXPORT PLAINTEXT'");
    expect(tab).toMatch(/requiredText=\{PLAINTEXT_EXPORT_CONFIRMATION\}/u);
  });

  it('derselbe Wortlaut steht im Freigabeweg für die exportierte Kopie', () => {
    expect(stripComments(read(SHARE_PANEL))).toContain('The exported copy is not encrypted and cannot be recalled');
  });

  it('das Freigabe-Audit sagt für eine exportierte Kopie ausdrücklich, dass es kein Rückruf ist', () => {
    const engine = stripComments(read(SHARE_ENGINE));
    expect(engine).toContain('This is not a recall');
    expect(engine).toContain('revoke_not_applicable');
  });
});

const KEY_POLICY_PANEL_FOR_V011 = KEY_POLICY_PANEL;

describe('V-011: die Ablehnung ist sichtbar und benannt, nicht ein gesperrter Knopf', () => {
  it('der Knopf bleibt bedienbar, damit der Grund überhaupt erscheinen kann', () => {
    /*
     * Ein gesperrter Knopf ist eine **stumme** Ablehnung: der Nutzer erfährt nicht, warum. Der Auftrag
     * verlangt eine sichtbare, benannte Ablehnung. Deshalb darf „Apply protection" **nicht** an die
     * Bestätigung gebunden werden — die Prüfung liegt im Aufruf und wirft einen benannten Fehler, den die
     * Oberfläche als Meldung zeigt.
     */
    const code = stripComments(read(KEY_POLICY_PANEL_FOR_V011));
    const applyButton = code.match(/<button[^>]*onClick=\{applyProtection\}[^>]*>/u);
    expect(applyButton, 'Apply-protection-Knopf nicht gefunden').not.toBeNull();
    expect(applyButton[0]).not.toContain('disabled');
    // Und der Zustand geht tatsächlich in die Prüfung ein.
    expect(code).toContain('credentialConfirmation,');
  });

  it('die abweichende Eingabe wird im Markup sichtbar gemeldet', () => {
    const code = stripComments(read(KEY_POLICY_PANEL_FOR_V011));
    expect(code).toContain('The two entries do not match.');
    // Als Warnung für Screenreader, nicht nur als Farbe — Farbe allein wäre kein Unterscheidungsmerkmal.
    expect(code).toMatch(/role="alert"/u);
  });

  it('die Folge eines Tippfehlers steht im JSX, nicht nur im Kommentar', () => {
    // `stripComments` entfernt Kommentare: der Satz bleibt nur übrig, wenn er wirklich gerendert wird.
    const code = stripComments(read(KEY_POLICY_PANEL_FOR_V011));
    expect(code).toContain('There is no universal recovery key');
    expect(code).toContain('permanently unreadable');
    expect(code).toContain('independent encrypted backup');
    /*
     * **Korrigierte Erwartung (V-044).** Hier stand `!activeCredentialSet`. Das war zu eng: sobald ein
     * Kennwort aktiv war, verschwand die Warnung — auch dann, wenn der Nutzer gerade ein **neues** Kennwort
     * setzte. Das war Teil desselben Befunds, dass ein Wechsel unmöglich war. Jetzt hängt die Warnung an
     * „es wird gerade ein neues Kennwort gesetzt".
     */
    expect(code).toMatch(/pendingMode === 'portable_password' && creditingNewCredential/u);
  });

  it('die Wiederholungseingabe erscheint, sobald ein neues Kennwort gesetzt wird', () => {
    const code = stripComments(read(KEY_POLICY_PANEL_FOR_V011));
    const confirmField = code.match(/aria-label=\{pendingMode === 'device_pin' \? 'Repeat the PIN' : 'Repeat the password'\}/u);
    expect(confirmField, 'Wiederholungsfeld nicht gefunden').not.toBeNull();
    // Nicht mehr „nur wenn kein Ausweis aktiv ist": auch ein **Wechsel** muss bestätigt werden (V-044).
    expect(code).toMatch(/pendingMode !== 'device' && creditingNewCredential && <input/u);
    expect(code).toContain('const creditingNewCredential = !activeCredentialSet || credential.length > 0;');
  });
});

const RUNTIME = 'src/edition/open-core/apps/vault/VaultFreeRuntime.tsx';
const SHARE_PANEL_V039 = 'src/shared/vault/security/VaultSharePanel.tsx';
const ADVANCED_MODAL = 'src/apps/vault/settings/VaultAdvancedModal.tsx';

describe('V-039: BEIDE Klartext-Wege gehen durch dieselbe Pforte', () => {
  /*
   * **Warum diese Zusicherungen hier stehen und nicht im `.tsx`-Test:** sie lesen Dateien mit `node:fs`, und
   * ein `.ts`/`.tsx`-Test hat in diesem Projekt **keine** Node-Typdeklarationen (`TS2580`, `TS2307`). Genau
   * dieser Fehler ist mir in dieser Runde zweimal passiert — die Zusicherungen gehören in den `.mjs`-Vertrag.
   */
  it('der Backup-Export läuft durch die Pforte', () => {
    const runtime = stripComments(read(RUNTIME));
    // Vorher: `onExportEncryptedBackup={() => exportVaultQuickBackup(…)}` — direkt, ohne Warnung.
    const backupIndex = runtime.indexOf('onExportEncryptedBackup={async () => {');
    expect(backupIndex, 'Backup-Handler nicht gefunden').toBeGreaterThan(-1);
    expect(runtime.indexOf('setPendingPlaintextExport({', backupIndex)).toBeGreaterThan(backupIndex);
  });

  it('der Empfängerpaket-Export läuft durch dieselbe Pforte', () => {
    const runtime = stripComments(read(RUNTIME));
    const recipientIndex = runtime.indexOf('onExportEncryptedPackage={() => {');
    expect(recipientIndex, 'Paket-Handler nicht gefunden').toBeGreaterThan(-1);
    expect(runtime.indexOf('setPendingPlaintextExport({', recipientIndex)).toBeGreaterThan(recipientIndex);
  });

  it('beide melden „nicht geschrieben", und beide Aufrufer melden keinen Erfolg', () => {
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).toContain('return Promise.resolve(null);');
    expect((runtime.match(/return null;/gu) ?? []).length).toBeGreaterThanOrEqual(1);
    // Zwei Erfolgsmeldungen ohne Vorgang, die diese Runde entfernt hat.
    expect(stripComments(read(SHARE_PANEL_V039))).toContain('if (!filename) return;');
    expect(stripComments(read(ADVANCED_MODAL))).toContain('if (!filename) return;');
  });

  it('die Pforte wird genau einmal gerendert und ist bei gesperrtem Tresor unwirksam', () => {
    const runtime = stripComments(read(RUNTIME));
    expect((runtime.match(/<VaultPlaintextExportGate/gu) ?? []).length).toBe(1);
    expect(runtime).toMatch(/pendingPlaintextExport && !runtimeLocked && <VaultPlaintextExportGate/u);
  });

  it('der alte Backup-Weg ohne Warnung ist verschwunden', () => {
    const runtime = stripComments(read(RUNTIME));
    // Der direkte Aufruf im Prop wäre der Befund: er schreibt, ohne zu fragen.
    expect(runtime).not.toMatch(/onExportEncryptedBackup=\{\(\) => exportVaultQuickBackup\(/u);
    expect(runtime).not.toMatch(/onExportEncryptedPackage=\{\(\) => exportVaultQuickBackup\(/u);
  });
});
describe('V-004: die alte zweite Namensregel ist verschwunden', () => {
  it('`normalizedName` kürzt nicht mehr, sondern prüft', () => {
    /*
     * Ein **Wortvergleich** wäre hier falsch: der Kommentar in der Datei nennt die alte Form
     * (`slice(0, 240)`), um zu erklären, was geändert wurde. Geprüft wird deshalb der **Aufruf** — und
     * genau diese Unterscheidung ist die Lektion, die mich in dieser Sitzung mehrfach eingeholt hat.
     */
    const engine = stripComments(read('src/shared/vault/files/vaultFileSystemEngine.ts'));
    expect(engine).toContain('checkVaultName(value)');
    expect(engine).not.toMatch(/trimmed\.slice\(0, 240\)/u);
  });

  it('beide Namenswege hängen an **einer** Autorität', () => {
    const integrity = stripComments(read('src/shared/vault/integrity/vaultIntegrity.ts'));
    const names = stripComments(read('src/shared/vault/files/vaultNames.ts'));
    // Die Grenze wird nicht wiederholt, sondern importiert — sonst gäbe es zwei Zahlen.
    // Seit dem nativen Chunk-Crash (ReferenceError "Cannot access 'g' before initialization",
    // 2026-10-18) liegt die Wert-Autorität in `vaultNames` (Blatt-Modul); `vaultIntegrity`
    // re-exportiert sie. Der umgekehrte Import schloss den Zyklus
    // vaultIntegrity → vaultFileSystemEngine → vaultNames → vaultIntegrity.
    expect(names).toContain('export const VAULT_MAX_NAME_LENGTH = 240');
    expect(names).not.toContain('integrity/vaultIntegrity');
    expect(integrity).toContain('export const VAULT_IMPORT_MAX_NAME_LENGTH = VAULT_MAX_NAME_LENGTH');
  });
});
describe('V-005: die Tastaturalternative ist wirklich verdrahtet', () => {
  it('der Rückruf bekommt den Ordnernamen als ID, die Wurzel als `null`', () => {
    const entry = stripComments(read('src/shared/vault/files/VaultFileEntry.tsx'));
    expect(entry).toMatch(/onMoveToFolder\(value==='__root'\?null:value\)/u);
    // Und der Dateibereich reicht die Verschiebung durch — sonst wäre die Auswahl wirkungslos.
    const tab = stripComments(read('src/shared/vault/files/VaultFilesTab.tsx'));
    expect(tab).toContain('onMoveToFolder={(folderId)=>apply(moveVaultFiles(fileSystem,[file.id],folderId))}');
    expect(tab).toContain('folders={folders}');
  });

  it('der Zeigerweg bleibt erhalten — die Tastaturalternative ersetzt ihn nicht', () => {
    /*
     * **Zusicherung entkoppelt (AST-1137).** Hier stand `expect(sidebar).toContain('onDrop={(e)=>drop(e,folder.id)}')`
     * — ein Vergleich auf **Markup**, nicht auf die Fähigkeit. Mit dem Ordner-Umbau (der Ordner ist jetzt
     * eine Zeile mit Auswahl, Umbenennen und Verschieben statt eines einzelnen Knopfes) ändert sich die
     * Schreibweise, der **Zeigerweg** bleibt aber vorhanden. Ein Test, der die Fähigkeit meint und das
     * Markup prüft, meldet Redaktion statt Regression. Geprüft wird jetzt die Fähigkeit.
     */
    const sidebar = stripComments(read('src/apps/vault/browser/VaultBrowserSidebar.tsx'));
    expect(sidebar).toContain('drop(e,folder.id)');
    expect(sidebar).toContain('onDragOver={(e)=>e.preventDefault()}');
    expect(sidebar).toContain('draggable');
    // Und der Datei-auf-Wurzel-Weg bleibt ebenfalls.
    expect(sidebar).toContain('drop(e,null)');
  });
});
describe('V-006: alle drei Batch-Knöpfe laufen durch die Grenzprüfung', () => {
  it('Move, Copy und Duplicate sind umhüllt — keiner ruft die Engine direkt', () => {
    /*
     * Der Test prüft die **Aufrufe**, nicht Wörter: vorher stand dort direkt
     * `apply(moveVaultFiles(fileSystem,selected,…))`. Läuft einer der drei Knöpfe wieder direkt, ist die
     * Grenze für diesen Weg wirkungslos — und genau das wäre der Befund.
     */
    const tab = stripComments(read('src/shared/vault/files/VaultFilesTab.tsx'));
    for (const operation of ['move', 'copy', 'duplicate']) {
      expect(tab, operation).toContain(`runBatch('${operation}'`);
    }
    expect((tab.match(/runBatch\(/gu) ?? []).length).toBeGreaterThanOrEqual(3);
    // Und kein direkter Aufruf mehr in einem Klick-Handler.
    expect(tab).not.toMatch(/onClick=\{\(\)=>\{apply\((?:move|copy|duplicate)VaultFiles/u);
  });

  it('die Ablehnung wird sichtbar gemeldet, nicht verschluckt', () => {
    const tab = stripComments(read('src/shared/vault/files/VaultFilesTab.tsx'));
    // `runBatch` fängt und schreibt in den Fehlerzustand, den die Oberfläche rendert.
    expect(tab).toContain('setAddError(error instanceof Error ? error.message');
    expect(tab).toContain('addError &&');
  });

  it('die Grenze kommt aus der vorhandenen Import-Autorität', () => {
    const integrity = stripComments(read('src/shared/vault/integrity/vaultIntegrity.ts'));
    expect(integrity).toContain('export const VAULT_BATCH_MAX_FILES = VAULT_IMPORT_MAX_FILES;');
    // Kein zweiter Zahlenwert: die Batch-Grenze darf keine eigene Zahl tragen.
    expect(integrity).not.toMatch(/VAULT_BATCH_MAX_FILES = \d/u);
  });
});

describe('V-003: der Stapelfehler bleibt im Stapelbereich, der Dateifehler nicht', () => {
  it('die Zuordnung läuft über die Datei-ID, nicht über einen globalen Text', () => {
    /*
     * Der Kern: `fileError` trägt eine `fileId`. Ohne sie würde **jede** Zeile denselben Fehler zeigen — aus
     * „weit weg von der Zeile" würde „an jeder Zeile", und das wäre nicht besser.
     */
    const tab = stripComments(read('src/shared/vault/files/VaultFilesTab.tsx'));
    expect(tab).toMatch(/setFileError\(\{ fileId: file\.id, message:/u);
    expect(tab).toContain('fileError={fileError?.fileId===file.id?fileError.message:null}');
    // Und der „Open With"-Fehler läuft nicht mehr in den Stapelbereich.
    expect(tab).not.toMatch(/setAddError\(error instanceof Error \? error\.message : 'Open With failed\.'/u);
  });

  it('der Stapelbereich behält die Fehler, die wirklich dorthin gehören', () => {
    const tab = stripComments(read('src/shared/vault/files/VaultFilesTab.tsx'));
    // Import und Verknüpfen betreffen keinen einzelnen Eintrag und melden weiterhin oben.
    expect(tab).toContain("'File could not be added to Vault.'");
    expect(tab).toContain("'Workspace document could not be linked.'");
    expect(tab).toContain('addError &&');
  });
});
describe('V-012: die Bündelgrenze steht VOR dem Lauf, nicht erst beim Abbruch', () => {
  const BACKUP_PANEL = 'src/apps/vault/backup/VaultBackupPanel.tsx';

  it('das Panel reicht den Plan durch und zeigt die Meldung', () => {
    /*
     * Der Befund war ein **Zeitpunkt**, kein fehlender Text: `createVaultBackupBundle` warf die
     * 96-MiB-Grenze **mitten im Durchlauf**. Der Plan muss deshalb **vor** dem Knopf stehen, und der Knopf
     * muss bei einer Überschreitung gesperrt sein — **mit** Begründung daneben.
     */
    const panel = stripComments(read(BACKUP_PANEL));
    /*
     * **Gemessene Korrektur meiner Zusicherung.** Hier stand `expect(panel).toContain('bundlePlan={props.bundlePlan}')`
     * — das wäre das Durchreichen an eine **Kindkomponente**. Das Panel **verbraucht** den Wert aber selbst
     * (`props.bundlePlan`); es reicht ihn nirgends weiter. Geprüft wird deshalb der **Verbrauch** und die
     * Prop-Deklaration, nicht ein Durchreichen, das es nicht gibt.
     */
    expect(panel).toContain('bundlePlan?: VaultBackupBundlePlan;');
    expect(panel).toContain('vaultBackupBundlePlanMessage(props.bundlePlan)');
    // Der Knopf ist bei einer Überschreitung gesperrt …
    expect(panel).toContain('disabled={busy||!target||props.bundlePlan?.fits===false}');
    // … und die Begründung ist eine Warnung für Screenreader, nicht nur eine Farbe.
    expect(panel).toMatch(/role=\{props\.bundlePlan\.fits \? undefined : 'alert'\}/u);
  });

  it('die Vorabanzeige steht im Markup, nicht nur im Kommentar', () => {
    // `stripComments` entfernt Kommentare — der Ausdruck bleibt nur übrig, wenn er wirklich gerendert wird.
    const panel = stripComments(read(BACKUP_PANEL));
    expect(panel).toMatch(/\{props\.bundlePlan && <p/u);
  });

  it('der Laufzeitpfad rechnet den Plan aus den vorhandenen Dokumenten', () => {
    const runtime = stripComments(read('src/edition/open-core/apps/vault/VaultFreeRuntime.tsx'));
    expect(runtime).toContain('bundlePlan={planVaultBackupBundle(documents)}');
  });
});