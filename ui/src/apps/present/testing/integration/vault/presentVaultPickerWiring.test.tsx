// STATUS: PLATIN — Zeuge (AST-1226 / AST-1227): der Cross-App-Vault-Picker ist aus **Present** erreichbar.
//
// **Reihenfolge dieses Zeugen — und warum sie so ist.** Er wurde **vor** der Verdrahtung geschrieben und
// **rot** gemessen: Present hatte den Ort (`PresentWorkspaceIntegrationModal`), aber keinen einzigen
// Treffer für `VaultPicker` — der Einstieg existierte nicht. Abwesenheit ist die eine Hälfte; die andere
// ist die **Wirkung**, denn ein Zeuge, der nur Anwesenheit prüft, bleibt bei „Element behalten, Wirkung
// entfernt" grün.
//
// Deshalb fährt dieser Zeuge die Kette: Einstieg auflösen → mit der Autorität filtern → Wahl **erneut**
// urteilen → Ziel **aus der Liste der Anwendung** suchen → den echten `createPresentWorkspaceObject`
// ausführen → das Ergebnis lesen.
//
// **Kein jsdom, kein happy-dom, kein @testing-library.** `renderToStaticMarkup` rendert nicht neu und löst
// keine Ereignisse aus: die echte Bedienung (Klick, Tab, Escape) bleibt `NOT_TESTED`.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { VaultFile, VaultShareGrant, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../../edition/contracts/documentFactory';
import { listVaultPickerCandidates } from '../../../../../shared/vault/picker/vaultPickerEngine';
import { persistVaultLockRecord } from '../../../../../shared/vault/persistence/vaultPersistenceEngine';
import { deriveVaultLockState, vaultLockRecord } from '../../../../../shared/vault/security/vaultSessionLock';
import { DEFAULT_VAULT_KEY_POLICY, vaultShouldAutoLock } from '../../../../../shared/vault/security/vaultKeyPolicyEngine';
// **Die Produktions-Verdrahtung des Snapshot-Ports, kein Nachbau.** `App.tsx:16` installiert genau
// diesen Anbieter; ohne ihn wirft der Port (`WorkspaceSnapshotProviderUnavailableError`, gemessen).
import { installWriterWorkspaceSnapshotHost } from '../../../../writer/interchange/workspace/workspaceSnapshotHostAdapter';
import { PresentWorkspaceIntegrationModal } from '../../../integrations/PresentWorkspaceIntegrationModal';
import { createPresentWorkspaceObject, listPresentWorkspaceIntegrationTargets } from '../../../integrations/presentWorkspaceIntegration';
import {
  PRESENT_VAULT_PICKER_ACTION,
  PRESENT_VAULT_PICKER_APP,
  PRESENT_VAULT_PICKER_ENTRY_LABEL,
  resolvePresentVaultPickerEntry,
  resolvePresentVaultPickerOutcome,
} from '../../../integrations/presentVaultPicker';

const noop = (): void => undefined;
const NOW = 1_800_000_000_000;

/** Der Quelltext der verdrahteten Komponente — der Vertrag zwischen Element, Zustand und Dialog. */
const MODAL_SOURCE = 'src/apps/present/integrations/PresentWorkspaceIntegrationModal.tsx';

let releaseSnapshotProvider: (() => void) | undefined;
afterEach(() => {
  releaseSnapshotProvider?.();
  releaseSnapshotProvider = undefined;
});

function vaultFile(id: string, classification: VaultFile['classification'], name: string): VaultFile {
  return {
    id, name, kind: 'Writer', sizeBytes: 100, encryptedHash: 'a'.repeat(64), lastModified: 1,
    status: 'available', sourceType: 'attachment', mimeType: 'text/plain', classification,
  };
}

function vaultDocumentWith(files: readonly VaultFile[], grants: readonly VaultShareGrant[] = []): WorkspaceDocument {
  const document = createNewDocument('Vault');
  if (!document.vaultData) throw new Error('Zeuge: Die Fabrik lieferte kein Vault-Dokument mit vaultData.');
  return { ...document, id: 'vault-1', vaultData: { ...document.vaultData, files: [...files], shareGrants: [...grants] } };
}

const FILES: readonly VaultFile[] = [
  vaultFile('pub', 'Public', 'pub.txt'),
  vaultFile('int', 'Internal', 'int.txt'),
  vaultFile('con', 'Confidential', 'GEHEIM.txt'),
];

function unlockedVault(): WorkspaceDocument {
  return persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
}

describe('AST-1226: der Vault-Picker ist aus Present erreichbar — Wirkung, nicht Markup', () => {
  it('ein nie benutzter Tresor gilt nach der geladenen Regel als GESPERRT (gemessen)', () => {
    const lock = deriveVaultLockState({ lockedAt: null, lastActivityAt: null, autoLockMinutes: DEFAULT_VAULT_KEY_POLICY.autoLockMinutes, now: NOW });
    expect(lock).toEqual({ locked: true, reason: 'auto_lock' });
    expect(resolvePresentVaultPickerEntry([vaultDocumentWith(FILES)], NOW)).toEqual({ state: 'locked', vaultDocumentId: 'vault-1' });
    // Gegenprobe gegen eine zweite Sperrregel: `vaultShouldAutoLock` (der Weg des Nachbarn `taskVaultAttachments`)
    // sagt für dieselben Werte dasselbe.
    expect(vaultShouldAutoLock(DEFAULT_VAULT_KEY_POLICY, 0, NOW)).toBe(true);
  });

  it('nach dem Entsperren ist der Einstieg bereit und trägt die Anwendung Present', () => {
    const entry = resolvePresentVaultPickerEntry([unlockedVault()], NOW);
    expect(entry.state).toBe('ready');
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    expect(entry.request.app).toBe(PRESENT_VAULT_PICKER_APP);
    expect(entry.request.action).toBe(PRESENT_VAULT_PICKER_ACTION);
    expect(entry.files).toHaveLength(3);
  });

  it('die Autorität filtert: Present sieht pub und int, das vertrauliche Asset ist unsichtbar', () => {
    const entry = resolvePresentVaultPickerEntry([unlockedVault()], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const listing = listVaultPickerCandidates(entry.files, entry.request);
    expect(listing.candidates.map((candidate) => candidate.name)).toEqual(['int.txt', 'pub.txt']);
    expect(listing.withheldCount).toBe(1);
    expect(listVaultPickerCandidates(entry.files, { ...entry.request, query: 'geheim' }).candidates).toEqual([]);
  });

  it('die Wahl wird gegen die Autorität erneut geprüft und ins Ziel der Anwendung übersetzt', () => {
    const vault = unlockedVault();
    const entry = resolvePresentVaultPickerEntry([vault], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const targets = listPresentWorkspaceIntegrationTargets(vault, 'en-US');

    const refused = resolvePresentVaultPickerOutcome(entry, targets, 'con');
    expect(refused).toEqual({ ok: false, reason: 'policy_deny_no_grant' });

    const chosen = resolvePresentVaultPickerOutcome(entry, targets, 'int');
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) throw new Error('Zeuge: Die Auswahl wurde abgelehnt.');
    expect(chosen.selection.sourceDocumentId).toBe('vault-1');
    expect(chosen.selection.target.integrationKind).toBe('vault-asset');
    expect(chosen.selection.target.sourceObjectId).toBe('int');
    // Die Ziel-ID kommt aus der Liste der Anwendung — der Zeuge baut sie **nicht** nach.
    expect(chosen.selection.target.id).toBe(targets.find((target) => target.sourceObjectId === 'int')?.id);
  });

  it('WIRKUNG: die getroffene Wahl wird zum echten Present-Objekt mit diesem Asset', () => {
    /*
     * Der Snapshot-Port wird mit der **Produktions-Verdrahtung** installiert (`App.tsx:16` →
     * `installWriterWorkspaceSnapshotHost`). Ohne ihn wirft der Port — auch das ist eine Messung, sie
     * steht unten als eigene Zusicherung.
     */
    releaseSnapshotProvider = installWriterWorkspaceSnapshotHost();
    const vault = unlockedVault();
    const entry = resolvePresentVaultPickerEntry([vault], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const targets = listPresentWorkspaceIntegrationTargets(vault, 'en-US');
    const chosen = resolvePresentVaultPickerOutcome(entry, targets, 'int');
    if (!chosen.ok) throw new Error(`Zeuge: Die Auswahl wurde abgelehnt (${chosen.reason}).`);

    // **Derselbe** Aufruf, den der Dialog beim Einfügen ausführt.
    const object = createPresentWorkspaceObject({
      sourceDocument: vault,
      integrationKind: chosen.selection.target.integrationKind,
      mode: 'Live',
      sourceObjectId: chosen.selection.target.sourceObjectId,
      sourceSelector: chosen.selection.target.sourceSelector,
      title: `Vault · ${chosen.selection.target.label}`,
    }, 'present-vault-1', []);

    expect(object.kind).toBe('workspace');
    expect(object.integrationKind).toBe('vault-asset');
    expect(object.sourceDocumentId).toBe('vault-1');
    expect(object.sourceObjectId).toBe('int');
    expect(object.uri).toContain('vault-1');
    // Der Schnappschuss kommt aus der echten Projektion — er trägt den Namen des gewählten Assets.
    expect(object.snapshot).toMatchObject({ type: 'vault-asset', fileId: 'int', name: 'int.txt' });
    // Keine Nutzdaten: die Referenz trägt Metadaten, nicht die Bytes des geschützten Assets.
    expect(JSON.stringify(object)).not.toContain('base64');
  });

  it('der Snapshot-Port ohne Anbieter verweigert — die Umgebungsgrenze ist benannt, nicht verschwiegen', () => {
    const vault = unlockedVault();
    expect(() => createPresentWorkspaceObject({
      sourceDocument: vault, integrationKind: 'vault-asset', mode: 'Live', sourceObjectId: 'int',
    }, 'present-vault-2', [])).toThrow('Workspace snapshot service is not available.');
  });

  it('VERDRAHTUNG: der Einstieg setzt genau den Zustand, der den Picker öffnet (nicht nur Anwesenheit)', () => {
    /*
     * **Warum diese Prüfung hier steht:** Anwesenheit ist kein Beweis. Ein Zeuge mit vier
     * Anwesenheits-Zusicherungen blieb bei der Mutation „Element behalten, Wirkung entfernt" grün. Diese
     * Zusicherungen verfolgen deshalb die **Kette**: das Element setzt `vaultPickerOpen`, und genau dieser
     * Zustand schaltet `<VaultPickerModal>`. Wird der `onClick` zur Attrappe, werden sie rot.
     */
    const component = readFileSync(MODAL_SOURCE, 'utf8');
    expect(component).toContain('data-vault-picker-entry="Present"');
    const clickIndex = component.indexOf('onClick={() => setVaultPickerOpen(true)}');
    expect(clickIndex, 'Der Einstieg muss den Picker-Zustand setzen.').toBeGreaterThan(-1);
    const gateIndex = component.indexOf('{vaultPickerOpen && (');
    expect(gateIndex, 'Der Zustand muss den Dialog schalten.').toBeGreaterThan(clickIndex);
    expect(component.slice(gateIndex, gateIndex + 200)).toContain('<VaultPickerModal');
    // Und die Wahl geht durch die Autorität, nicht direkt in die Auswahl.
    expect(component).toContain('resolvePresentVaultPickerOutcome(vaultPickerEntry, targets, candidate.fileId)');
    expect(component).toContain('setTargetId(outcome.selection.target.id)');
  });

  it('SICHTBARER EINSTIEG: das gerenderte Element trägt data-vault-picker-entry und eine Beschriftung', () => {
    const vault = unlockedVault();
    const markup = renderToStaticMarkup(
      <PresentWorkspaceIntegrationModal isOpen sourceDocuments={[vault]} existingObjects={[]} onClose={noop} onInsert={noop} />,
    );
    expect(markup).toContain('data-vault-picker-entry="Present"');
    expect(markup).toContain(PRESENT_VAULT_PICKER_ENTRY_LABEL);
    // Der Picker selbst ist zu, solange niemand den Einstieg bedient hat.
    expect(markup).not.toContain('data-vault-picker="true"');
  });

  it('über einem gesperrten Tresor ist der Einstieg deaktiviert und benannt', () => {
    const markup = renderToStaticMarkup(
      <PresentWorkspaceIntegrationModal isOpen sourceDocuments={[vaultDocumentWith(FILES)]} existingObjects={[]} onClose={noop} onInsert={noop} />,
    );
    expect(markup).toContain('data-vault-picker-entry="Present"');
    expect(markup).toContain('disabled');
  });
});
