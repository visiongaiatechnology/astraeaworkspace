// STATUS: PLATIN — **eine** Warnpforte für **jeden** Klartext-Austritt (V-001, V-039).
//
// **Der Befund:** Es gab **zwei** Wege, auf denen eine entschlüsselte Kopie den Tresor verließ, und der
// **zweite** schrieb ohne Warnung: `VaultFreeRuntime` → `exportVaultQuickBackup` → `anchor.download`
// (V-039). Der erste (`VaultFilesTab` → Download) war in Runde 83c geheilt (V-001). Eine Warnung, die an
// einem von zwei Wegen fehlt, ist keine Zusage. Deshalb liegt der Wortlaut **einmal** in
// `vaultExportWarnings` und **beide** Wege gehen durch dieselbe Pforte.
//
// **Zwei Ehrlichkeitskorrekturen, die diese Runde erzwungen hat** und die hier gepinnt sind:
//   1. `exportVaultQuickBackup` ist **nicht** unverschlüsselt — es erzeugt einen Container. Der Text darf
//      das nicht behaupten; er benennt die Folge: die Kopie liegt außerhalb des Tresors und ist nicht
//      rückholbar.
//   2. Das Freigabe-Panel meldete „… written", obwohl die Warnpforte noch gar nicht bestätigt war, und
//      `VaultAdvancedModal` meldete „Encrypted Vault backup exported: …" **vor** der Bestätigung. Beides
//      waren Erfolgsmeldungen ohne den Vorgang.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  VAULT_BACKUP_EXPORT_KINDS,
  vaultPlaintextExportSubject,
  vaultPlaintextExportWarning,
  type VaultBackupExportKind,
} from '../../../../shared/vault/backup/vaultExportWarnings';
import {
  VAULT_PLAINTEXT_EXPORT_CONFIRMATION,
  VaultPlaintextExportGate,
} from '../../../../shared/vault/backup/VaultPlaintextExportGate';

const noop = () => {};

describe('Der Wortlaut benennt, was NICHT geschützt ist', () => {
  it('jede Austrittsart sagt, dass die Kopie nicht rückholbar ist', () => {
    for (const kind of VAULT_BACKUP_EXPORT_KINDS) {
      const text = vaultPlaintextExportWarning(kind);
      expect(text.length, kind).toBeGreaterThan(40);
      // Die gemeinsame Wahrheit aller Wege: die Kopie ist draußen und kommt nicht zurück.
      expect(/cannot (be recalled|recall|withdraw)/iu.test(text), kind).toBe(true);
    }
  });

  it('der Datei-Download sagt ausdrücklich „nicht verschlüsselt" — das ist der Fall, wo es zutrifft', () => {
    const text = vaultPlaintextExportWarning('file_download');
    expect(text).toContain('not encrypted');
    expect(text).toContain('cannot be recalled');
    expect(text).toContain('does not remove it');
  });

  it('das Backup behauptet NICHT, unverschlüsselt zu sein — es ist ein Container', () => {
    /*
     * **Korrigierte Zusage.** `packVaultByPolicy` erzeugt einen Container; „not encrypted" wäre für diesen
     * Weg schlicht falsch. Der Text benennt stattdessen die Folge und sagt, wo die Kopie hingehört.
     */
    const text = vaultPlaintextExportWarning('backup');
    expect(text).not.toContain('not encrypted');
    expect(text).toContain('outside its key');
    expect(text).toContain('cannot withdraw it');
    expect(text).toContain('Keep it in a place you control');
  });

  it('das Empfängerpaket verknüpft Widerruf und Kopie ausdrücklich', () => {
    const text = vaultPlaintextExportWarning('recipient_package');
    expect(text).toContain('Revoking the share afterwards');
    expect(text).toContain('cannot recall this copy');
  });

  it('eine unbekannte Art fällt auf einen ehrlichen Satz zurück, statt leer zu bleiben', () => {
    expect(vaultPlaintextExportWarning('erfunden' as VaultBackupExportKind)).toContain('cannot be recalled');
  });

  it('es gibt genau drei Austrittsarten — ein vierter Weg müsste hier auftauchen', () => {
    expect(VAULT_BACKUP_EXPORT_KINDS).toEqual(['file_download', 'backup', 'recipient_package']);
  });
});

describe('Der Name wird VORHER genannt — der Browser fragt keinen Speicherort', () => {
  it('der Dateiname steht fest, bevor geschrieben wird', () => {
    // Das ist der zweite Teil von V-039: ohne Pfadwahl muss der Nutzer wissen, wonach er suchen muss.
    expect(vaultPlaintextExportSubject('backup', { documentTitle: 'Tresor', extension: '.vault' })).toBe('Tresor.backup.vault');
    expect(vaultPlaintextExportSubject('recipient_package', { documentTitle: 'Tresor', extension: '.vault' })).toBe('Tresor.recipient.vault');
    // Eine Endung ohne Punkt wird nicht doppelt gesetzt.
    expect(vaultPlaintextExportSubject('backup', { documentTitle: 'Tresor', extension: 'vault' })).toBe('Tresor.backup.vault');
  });

  it('für eine Datei ist der Name der Dateiname', () => {
    expect(vaultPlaintextExportSubject('file_download', { file: { name: 'gehalt.pdf' } })).toBe('gehalt.pdf');
  });
});

describe('Die Pforte rendert die Warnung und verlangt die Phrase', () => {
  const markup = () => renderToStaticMarkup(
    <VaultPlaintextExportGate kind="backup" subject="Tresor.backup.vault" onCancel={noop} onConfirm={noop} />,
  );

  it('der Dialog nennt den Gegenstand und die Folge', () => {
    const html = markup();
    expect(html).toContain('Write a backup copy outside the Vault?');
    expect(html).toContain('Tresor.backup.vault');
    expect(html).toContain('cannot withdraw it');
    // Tastaturfähiger Dialog, kein stiller Vorgang.
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it('die Bestätigung ist gesperrt, bis die Phrase steht', () => {
    const html = markup();
    expect(html).toContain(`Type ${VAULT_PLAINTEXT_EXPORT_CONFIRMATION} to continue`);
    expect(html).toContain('disabled=""');
  });

  it('eine Datei-Warnung sagt „nicht verschlüsselt", eine Backup-Warnung nicht', () => {
    const file = renderToStaticMarkup(
      <VaultPlaintextExportGate kind="file_download" subject="gehalt.pdf" onCancel={noop} onConfirm={noop} />,
    );
    expect(file).toContain('Export an unencrypted copy?');
    expect(file).toContain('not encrypted');
    expect(file).not.toContain('Write a backup copy');
  });

  it('die Phrase ist bei allen Wegen dieselbe — zwei Phrasen wären zwei Regeln', () => {
    const kinds: VaultBackupExportKind[] = ['file_download', 'backup', 'recipient_package'];
    for (const kind of kinds) {
      const html = renderToStaticMarkup(
        <VaultPlaintextExportGate kind={kind} subject="x" onCancel={noop} onConfirm={noop} />,
      );
      expect(html, kind).toContain(VAULT_PLAINTEXT_EXPORT_CONFIRMATION);
    }
    expect(VAULT_PLAINTEXT_EXPORT_CONFIRMATION).toBe('EXPORT PLAINTEXT');
  });
});
