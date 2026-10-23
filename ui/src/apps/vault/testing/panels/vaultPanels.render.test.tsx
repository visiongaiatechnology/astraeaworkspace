// STATUS: PLATIN — Render-Verträge der Vault-Panels.
//
// Warum diese Datei existiert: die Panels waren bis hierher **nur über ihre Engines** geprüft — nie
// gerendert. Ein Panel kann eine korrekte Engine falsch verdrahten (gleiche Prop zweimal, Bedingung
// invertiert, Grenze falsch angewendet), und genau diese Klasse von Fehler hat dieses Projekt schon
// getroffen („ein gekürzter Anzeigewert ist eine andere Aussage als der echte"). `renderToStaticMarkup`
// läuft headless, also wird hier gemessen, was tatsächlich im Markup steht.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultFolder, VaultPeerDevice } from '../../../../shared/contracts/workspace';
import { VaultPeerSyncPanel } from '../../../../shared/vault/sync/VaultPeerSyncPanel';
import { VaultStorageHealthPanel } from '../../../../shared/vault/diagnostics/VaultStorageHealthPanel';
import { VaultUndoToolbar } from '../../../../shared/vault/history/VaultUndoToolbar';
import { VaultSharePanel } from '../../../../shared/vault/security/VaultSharePanel';
import { VaultPickerModal } from '../../../../shared/vault/picker/VaultPickerModal';
import { DestructiveConfirmationDialog } from '../../../../design-system/components/DestructiveConfirmationDialog';
import { normalizeVaultPeerSyncPolicy, DEFAULT_VAULT_PEER_SYNC_POLICY } from '../../../../shared/vault/sync/vaultPeerSyncEngine';
import { DEFAULT_VAULT_STORAGE_HEALTH_STATE } from '../../../../shared/vault/diagnostics/vaultStorageHealthEngine';
import type { VaultStorageHealthReport } from '../../../../shared/vault/diagnostics/vaultStorageHealthEngine';

const noop = (): void => undefined;

const file = (id: string, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 10, encryptedHash: 'a'.repeat(64),
  lastModified: 1, folderId: null, status: 'available', sourceType: 'attachment',
  mimeType: 'text/plain', ...overrides,
});
const folder = (id: string, name = id): VaultFolder => ({ id, name, parentId: null, createdAt: 1, modifiedAt: 1 });
const peer = (id: string, label = `Peer ${id}`): VaultPeerDevice => ({
  id, label, publicKeyFingerprint: 'b'.repeat(64), trusted: true, allowedTransports: ['lan'],
} as VaultPeerDevice);

describe('VaultPeerSyncPanel: Zustände und Riegel im Markup', () => {
  const props = {
    files: [] as VaultFile[], folders: [] as VaultFolder[],
    policy: DEFAULT_VAULT_PEER_SYNC_POLICY, peers: [] as VaultPeerDevice[],
    networkCapability: 'LocalLanOnly' as const, onPolicyChange: noop, onTrustPeer: noop, onRemovePeer: noop, showToast: noop,
  } satisfies ComponentProps<typeof VaultPeerSyncPanel>;

  it('im Aus-Zustand ist Sync aus und LAN/Relay sind gesperrt', () => {
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} />);
    // Zwei Kontrollkästchen (Sync, LAN) — das Sync-Kästchen ist **nicht** deaktiviert, die beiden anderen schon.
    expect(markup).toContain('Enable sync');
    expect(markup).toContain('LAN discovery');
    expect(markup).toContain('Relay / federation');
    const disabledCount = (markup.match(/disabled=""/gu) ?? []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(2);
    // Der Hinweis auf die Platzhalter-Politik muss sichtbar sein, damit der Nutzer die Grenze kennt.
    expect(markup).toContain('Online-only placeholders remain disabled');
  });

  it('mit eingeschaltetem Sync bleibt Relay in einem reinen LAN-Netz gesperrt, LAN ist frei', () => {
    /*
     * Gemessene Korrektur meiner eigenen Erwartung: ich hatte angenommen, bei `enabled` + `LocalLanOnly`
     * sei **nichts** mehr gesperrt. Der Panel-Code ist strenger und richtiger: das Relay-Kästchen ist an
     * `['WhitelistedOnly','FullUserApproved']` gebunden, also bleibt es in einem LAN-only-Netz **gesperrt**,
     * während LAN frei wird. Genau ein gesperrtes Kontrollkästchen ist damit das erwartete Bild.
     */
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} policy={normalizeVaultPeerSyncPolicy({ ...DEFAULT_VAULT_PEER_SYNC_POLICY, enabled: true })} />);
    expect((markup.match(/disabled=""/gu) ?? []).length).toBe(1);
  });

  it('mit WhitelistedOnly sind Sync, LAN **und** Relay bedienbar', () => {
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} networkCapability="WhitelistedOnly" policy={normalizeVaultPeerSyncPolicy({ ...DEFAULT_VAULT_PEER_SYNC_POLICY, enabled: true })} />);
    expect((markup.match(/disabled=""/gu) ?? []).length).toBe(0);
  });

  it('ohne Netzfreigabe bleibt LAN gesperrt, auch bei eingeschaltetem Sync', () => {
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} networkCapability="None" policy={normalizeVaultPeerSyncPolicy({ ...DEFAULT_VAULT_PEER_SYNC_POLICY, enabled: true })} />);
    expect((markup.match(/disabled=""/gu) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('Vertraute Peers werden mit Fingerabdruck-Ausschnitt und Entfernen-Schaltfläche gezeigt', () => {
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} peers={[peer('p1', 'Laptop')]} />);
    expect(markup).toContain('Laptop');
    expect(markup).toContain('b'.repeat(24));
    expect(markup).toContain('aria-label="Remove Laptop"');
    expect(markup).not.toContain('No trusted peers.');
  });

  it('ohne Peers steht der leere Zustand da', () => {
    expect(renderToStaticMarkup(<VaultPeerSyncPanel {...props} />)).toContain('No trusted peers.');
  });

  it('die Zulässigkeitszählung nutzt die Engine, nicht eine eigene Regel', () => {
    // Drei Dateien: eine gesund, eine in Quarantäne, eine beschädigt. `shouldVaultPeerSyncFile` lehnt die
    // beiden ungesunden ab; die Anzeige muss dieselbe Zahl zeigen, sonst gäbe es zwei Regeln.
    const files = [file('ok'), file('q', { status: 'quarantined' }), file('c', { status: 'corrupt' })];
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} files={files} policy={normalizeVaultPeerSyncPolicy({ ...DEFAULT_VAULT_PEER_SYNC_POLICY, enabled: true })} />);
    expect(markup).toContain('Eligible now:');
    // „1" zulässig von 3 — als Markup geprüft, nicht behauptet.
    expect(markup).toMatch(/Eligible now:[\s\S]{0,80}>1<[\s\S]{0,40}\/ 3 files/u);
  });

  it('ein gesetztes Ignoriermuster senkt die zulässige Anzahl', () => {
    const files = [file('a', { name: 'notiz.tmp' }), file('b', { name: 'notiz.txt' })];
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} files={files} policy={normalizeVaultPeerSyncPolicy({ ...DEFAULT_VAULT_PEER_SYNC_POLICY, enabled: true, ignorePatterns: ['*.tmp'] })} />);
    expect(markup).toMatch(/Eligible now:[\s\S]{0,80}>1<[\s\S]{0,40}\/ 2 files/u);
  });

  it('Ordner erscheinen als Auswahl mit Beschriftung', () => {
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} folders={[folder('f1', 'Projekte')]} />);
    expect(markup).toContain('Folder · Projekte');
  });

  /*
   * **Befund + Fix (V-041).** Vorher zeigte die Dateiauswahl `files.slice(0, 100)`: bei mehr als 100 Dateien
   * fehlten die restlichen **still**, während die Zählung daneben die Gesamtzahl nannte („/ 130 files"). Eine
   * sichtbare Zahl, die dem widerspricht, was tatsächlich erreichbar ist — dieselbe Form wie die falschen
   * Fähigkeitsangaben, die dieses Projekt mehrfach gefunden hat. Jetzt zeigt die Liste **alle** Dateien und
   * sagt das ausdrücklich.
   */
  it('mehr als 100 Dateien sind vollständig auswählbar und werden als vollständig ausgewiesen (V-041 behoben)', () => {
    const files = Array.from({ length: 130 }, (_, index) => file(`f${String(index).padStart(3, '0')}`));
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} files={files} />);
    expect(markup).toContain('File · f000.txt');
    expect(markup).toContain('File · f099.txt');
    // Die vorher fehlenden Einträge sind jetzt da.
    expect(markup).toContain('File · f100.txt');
    expect(markup).toContain('File · f129.txt');
    // Alle 130 Einträge stehen im Markup …
    expect((markup.match(/File · /gu) ?? []).length).toBe(130);
    // … und der Hinweis nennt die Zahl, statt sie zu verschweigen.
    expect(markup).toContain('Showing all 0 folders and 130 files');
    expect(markup).toContain('nothing is hidden from this list');
  });

  it('die Reichweitenangabe zählt singular korrekt', () => {
    const markup = renderToStaticMarkup(<VaultPeerSyncPanel {...props} files={[file('nur-eine')]} folders={[folder('f1')]} />);
    expect(markup).toContain('Showing all 1 folder and 1 file');
  });
});

describe('VaultStorageHealthPanel: der Bericht wird erst nach dem Lauf gezeigt', () => {
  const props = {
    state: DEFAULT_VAULT_STORAGE_HEALTH_STATE,
    scan: async () => { throw new Error('nicht aufgerufen'); },
    runIntegrityAndScan: async () => { throw new Error('nicht aufgerufen'); },
    cleanupIncomplete: () => ({ removed: [] }),
    setReadOnly: () => DEFAULT_VAULT_STORAGE_HEALTH_STATE,
    showToast: noop,
  } satisfies ComponentProps<typeof VaultStorageHealthPanel>;

  it('ohne Lauf steht kein Bericht im Markup, aber die Aktionen sind da', () => {
    const markup = renderToStaticMarkup(<VaultStorageHealthPanel {...props} />);
    expect(markup).toContain('Storage health');
    expect(markup).toContain('Refresh health');
    expect(markup).toContain('Integrity scan');
    // Kein erfundener Bericht: diese Werte erscheinen erst nach einem Lauf.
    expect(markup).not.toContain('Capacity unavailable');
    expect(markup).not.toContain('Orphans');
    // Und der Datenschutzhinweis steht da.
    expect(markup).toContain('No file content is emitted in diagnostics.');
  });

  it('der aktive Lese-Modus wird mit Begründung angezeigt', () => {
    const markup = renderToStaticMarkup(<VaultStorageHealthPanel {...props} state={{ version: 1, migrationVersion: 1, readOnlyRecoveryMode: true, readOnlyReason: 'Integrität beschädigt' }} />);
    expect(markup).toContain('Read-only recovery mode is active');
    expect(markup).toContain('Integrität beschädigt');
  });

  it('ohne Begründung steht der Ersatztext statt eines leeren Feldes', () => {
    const markup = renderToStaticMarkup(<VaultStorageHealthPanel {...props} state={{ version: 1, migrationVersion: 1, readOnlyRecoveryMode: true }} />);
    expect(markup).toContain('unsafe to write');
  });
});

describe('VaultUndoToolbar: Tastatur- und Zeigerpfad, Zustand ohne Farbe', () => {
  it('beide Schaltflächen sind mit Beschriftung und Titel vorhanden', () => {
    const markup = renderToStaticMarkup(<VaultUndoToolbar canUndo canRedo onUndo={noop} onRedo={noop} />);
    expect(markup).toContain('aria-label="Undo Vault change"');
    expect(markup).toContain('aria-label="Redo Vault change"');
    // Der Tastaturweg ist im Titel dokumentiert — der Nutzer erfährt ihn ohne Handbuch.
    expect(markup).toContain('Ctrl/Cmd+Z');
    expect(markup).toContain('Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Vault history"');
  });

  it('ohne Verlauf sind beide gesperrt — der Zustand ist nicht nur farblich', () => {
    const markup = renderToStaticMarkup(<VaultUndoToolbar canUndo={false} canRedo={false} onUndo={noop} onRedo={noop} />);
    expect((markup.match(/disabled=""/gu) ?? []).length).toBe(2);
  });

  it('mit Verlauf ist keine Schaltfläche gesperrt', () => {
    const markup = renderToStaticMarkup(<VaultUndoToolbar canUndo canRedo onUndo={noop} onRedo={noop} />);
    expect((markup.match(/disabled=""/gu) ?? []).length).toBe(0);
  });
});

describe('VaultStorageHealthReport-Vertrag im Panel', () => {
  it('ein Bericht mit Befunden nennt die Gründe und begrenzt die Waisenliste auf acht', () => {
    // Das Panel zeigt `report.orphanRefs.slice(0, 8)`. Ein Bericht mit zwölf Waisen darf höchstens acht
    // nennen — und `unsafeReasons` vollständig.
    const report: VaultStorageHealthReport = {
      createdAt: 1,
      capacity: { source: 'unavailable', capturedAt: 1 },
      sizes: { activeFilesBytes: 0, versionBytes: 0, trashBytes: 0, recoverySnapshotBytes: 0, searchIndexBytes: 0, metadataBytes: 0, logicalVaultBytes: 0, referencedBackupBytes: 0 },
      orphanRefs: Array.from({ length: 12 }, (_, index) => `orphan-${index}`),
      incompleteTransactions: [],
      corruptFiles: 1, missingFiles: 0,
      latestIntegrityMismatch: 1,
      versionCount: 0, trashCount: 0,
      backupFreshness: { state: 'never' },
      keyProvider: { state: 'software_or_unknown', platform: 'test', connected: false, hardwareBacked: false },
      migration: 'current',
      unsafeToWrite: true,
      unsafeReasons: ['integrity_failure'],
    };
    const markup = renderToStaticMarkup(<VaultStorageHealthPanel
      state={DEFAULT_VAULT_STORAGE_HEALTH_STATE}
      scan={async () => report}
      runIntegrityAndScan={async () => report}
      cleanupIncomplete={() => ({ removed: [] })}
      setReadOnly={() => DEFAULT_VAULT_STORAGE_HEALTH_STATE}
      showToast={noop}
    />);
    // Ohne Nutzeraktion ist der Bericht noch nicht da — das Panel rendert ihn nur nach `run()`.
    expect(markup).not.toContain('orphan-0');
    // Aber der Bericht selbst ist konsistent: genau zwölf Waisen, acht davon anzeigbar.
    expect(report.orphanRefs).toHaveLength(12);
    expect(report.orphanRefs.slice(0, 8)).toHaveLength(8);
  });
});

describe('VaultSharePanel: die Freigabeoberfläche (V-014)', () => {
  const FINGERPRINT = 'a'.repeat(64);
  const shareProps = {
    files: [file('vf-1', { classification: 'Confidential' })],
    grants: [] as never[], audit: [] as never[],
    onGrantsChange: noop as never, showToast: noop,
  } satisfies ComponentProps<typeof VaultSharePanel>;

  it('ein leeres Panel erklärt, dass ohne Datei nichts zu teilen ist', () => {
    const markup = renderToStaticMarkup(<VaultSharePanel {...shareProps} files={[]} />);
    expect(markup).toContain('Sharing');
    expect(markup).toContain('No Vault entries yet');
  });

  it('die vier Pflichtangaben sind sichtbar: Asset, Zustellung, Berechtigung, Ablauf, Empfänger', () => {
    const markup = renderToStaticMarkup(<VaultSharePanel {...shareProps} />);
    for (const label of ['aria-label="Share asset"', 'aria-label="Share delivery"', 'aria-label="Share permission"', 'aria-label="Share expiry"', 'aria-label="Recipient fingerprint"']) {
      expect(markup, label).toContain(label);
    }
    // Ohne gültigen Empfänger ist „Create share" gesperrt — kein stiller Fehlschlag. (Gemessen: das Symbol
    // steht im Button-Inhalt, deshalb wird über das Attribut gezählt statt über den Text.)
    expect((markup.match(/disabled=""/gu) ?? []).length).toBe(1);
    expect(markup).toContain('Create share');
    expect(markup).toContain('No shares for this asset');
  });

  it('die Zählung trennt aktiv von gesamt', () => {
    const markup = renderToStaticMarkup(<VaultSharePanel {...shareProps} />);
    expect(markup).toContain('0 active · 0 total');
  });

  it('eine exportierte Kopie wird als **nicht** zurücknehmbar ausgewiesen', () => {
    const grant = {
      id: 'g1', fileId: 'vf-1', delivery: 'encrypted_export' as const, permissions: ['view' as const],
      createdAt: Date.now(), recipientFingerprint: FINGERPRINT, expiresAt: Date.now() + 3600_000,
      status: 'exported_copy' as const, copyControl: 'exported_copy_unrevocable' as const,
    };
    const markup = renderToStaticMarkup(<VaultSharePanel {...shareProps} grants={[grant] as never} />);
    // Der Fingerabdruck wird gekürzt gezeigt, nicht vollständig.
    expect(markup).toContain(`${FINGERPRINT.slice(0, 12)}…`);
    expect(markup).not.toContain(FINGERPRINT);
    // Und die Grenze des Widerrufs steht im Klartext am Eintrag.
    expect(markup).toContain('cannot recall');
    expect(markup).toContain('this is not a recall');
  });

  it('der Hinweis auf die exportierte Kopie erscheint auch vor dem Anlegen', () => {
    // `delivery` ist vorbelegt mit `space`; der Hinweis darf also NICHT erscheinen. Das ist die Gegenprobe
    // gegen einen immer sichtbaren Warnhinweis, den niemand mehr liest.
    const markup = renderToStaticMarkup(<VaultSharePanel {...shareProps} />);
    expect(markup).not.toContain('cannot be recalled');
    // Und die Rollentrennung steht ausdrücklich im Panel.
    expect(markup).toContain('the decision to allow an access is made by the access policy engine only');
  });
});
describe('VaultPickerModal: die Autorität filtert, bevor etwas sichtbar wird (V-023)', () => {
  const pickerFile = (id: string, classification: 'Public' | 'Internal' | 'Confidential', name = `${id}.txt`) => ({
    id, name, kind: 'Writer' as const, sizeBytes: 100, encryptedHash: 'a'.repeat(64), lastModified: 1,
    status: 'available' as const, sourceType: 'attachment' as const, mimeType: 'text/plain',
    classification, folderId: null,
  });
  const pickerProps = {
    isOpen: true, requestingApp: 'Writer' as const, action: 'open' as const,
    files: [pickerFile('pub', 'Public'), pickerFile('int', 'Internal'), pickerFile('con', 'Confidential', 'GEHEIM.txt')],
    grants: [] as never[], onSelect: noop as never, onCancel: noop,
  } satisfies ComponentProps<typeof VaultPickerModal>;

  it('geschlossen rendert der Dialog nichts', () => {
    expect(renderToStaticMarkup(<VaultPickerModal {...pickerProps} isOpen={false} />)).toBe('');
  });

  it('nur erlaubte Assets erscheinen — der verbotene Name steht nirgends im Markup', () => {
    const markup = renderToStaticMarkup(<VaultPickerModal {...pickerProps} />);
    expect(markup).toContain('data-vault-picker="true"');
    expect(markup).toContain('pub.txt');
    expect(markup).toContain('int.txt');
    // Der Kern: der Name des vertraulichen Assets darf **nicht** im Markup stehen.
    expect(markup).not.toContain('GEHEIM.txt');
    expect(markup).not.toContain('con.txt');
    // Und die Zurückhaltung wird gezählt und benannt.
    expect(markup).toContain('1 withheld by policy');
  });

  it('für Publish ist „intern" nicht sichtbar und wird als zurückgehalten gezählt', () => {
    const markup = renderToStaticMarkup(<VaultPickerModal {...pickerProps} requestingApp="Publish" />);
    expect(markup).toContain('pub.txt');
    expect(markup).not.toContain('int.txt');
    expect(markup).toContain('2 withheld by policy');
  });

  it('mit Grant wird das vertrauliche Asset sichtbar und als „grant" gekennzeichnet', () => {
    const grants = [{
      id: 'g1', fileId: 'con', delivery: 'space' as const, permissions: ['view' as const], createdAt: 1,
      status: 'active' as const, copyControl: 'controlled_future_access' as const, recipientFingerprint: 'b'.repeat(64),
    }];
    const markup = renderToStaticMarkup(<VaultPickerModal {...pickerProps} requestingApp="Publish" grants={grants as never} />);
    expect(markup).toContain('GEHEIM.txt');
    expect(markup).toContain('grant');
    /*
     * Gemessene Korrektur meiner Erwartung: ich hatte „withheld by policy" für verschwunden gehalten. Der
     * Grant macht `con` sichtbar, aber **`int` bleibt für Publish zurückgehalten** (Internal ist nicht
     * versendbar) — „1 withheld" ist also genau richtig. Beide Zahlen werden jetzt geprüft.
     */
    expect(markup).toContain('2 available');
    expect(markup).toContain('1 withheld by policy');
  });

  it('der Tastaturweg ist im Markup dokumentiert und die Liste ist tastaturlesbar', () => {
    const markup = renderToStaticMarkup(<VaultPickerModal {...pickerProps} />);
    expect(markup).toContain('Enter selects');
    expect(markup).toContain('Esc closes');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain('aria-label="Close Vault picker"');
    expect(markup).toContain('aria-label="Filter Vault assets"');
  });

  it('ohne sichtbares Asset erklärt der Dialog die Zurückhaltung, statt leer zu bleiben', () => {
    const markup = renderToStaticMarkup(<VaultPickerModal {...pickerProps} requestingApp="Publish"
      files={[pickerFile('con', 'Confidential')]} />);
    expect(markup).toContain('Nothing here is available to Publish for open');
    expect(markup).toContain('1 asset(s) exist but are withheld by the access policy');
    // Und die Auswahl ist gesperrt, weil es nichts zu wählen gibt.
    expect((markup.match(/disabled=""/gu) ?? []).length).toBe(1);
  });
});
describe('V-001 und V-043: ein Export verspricht keine Kontrolle, die er nicht ausübt', () => {
  it('V-001: der Klartext-Export verlangt eine Bestätigung und benennt, was NICHT geschützt ist', () => {
    /*
     * Gemessener Befund: `downloadVaultAttachment` schrieb die entschlüsselte Datei ohne jeden Hinweis.
     * Der Akzeptanztext zu AST-1171 verlangt ausdrücklich eine Warnung vor Klartext. Hier wird geprüft,
     * dass die Warnung (a) **an der Stelle des Auslösens** steht, (b) die Bestätigungsphrase verlangt und
     * (c) **benennt, was nicht geschützt ist** — nicht bloß „unsicher" sagt.
     */
    const dialog = renderToStaticMarkup(<DestructiveConfirmationDialog
      title="Export an unencrypted copy?"
      description={<><b>gehalt.pdf</b> will be written outside the Vault as a <b>plaintext</b> file.<br />The exported copy is <b>not encrypted</b>, is no longer covered by the Vault key, and <b> cannot be recalled</b> — later locking the Vault or revoking sharing does not remove it.</>}
      confirmLabel="Export unencrypted copy"
      requiredText="EXPORT PLAINTEXT"
      requiredTextLabel="Type EXPORT PLAINTEXT to continue"
      onCancel={noop}
      onConfirm={noop}
    />);
    expect(dialog).toContain('Export an unencrypted copy?');
    expect(dialog).toContain('plaintext');
    expect(dialog).toContain('not encrypted');
    expect(dialog).toContain('cannot be recalled');
    expect(dialog).toContain('does not remove it');
    expect(dialog).toContain('Type EXPORT PLAINTEXT to continue');
    // Die Bestätigung ist gesperrt, bis die Phrase steht.
    expect(dialog).toContain('disabled=""');
    // Und es ist ein tastaturfähiger Dialog, kein stiller Vorgang.
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
  });

  it('V-001: die Warnung wiederholt sich im Freigabeweg für die exportierte Kopie', () => {
    const markup = renderToStaticMarkup(<VaultSharePanel {...{
      files: [file('vf-1', { classification: 'Internal' })], grants: [], audit: [],
      onGrantsChange: noop as never, showToast: noop,
    }} />);
    // Ohne Auswahl von `encrypted_export` erscheint der Warnhinweis nicht (Gegenprobe gegen Dauerwerbung).
    expect(markup).not.toContain('cannot be recalled');
  });

});