// STATUS: PLATIN — Zeuge (AST-1226 / AST-1227): der Cross-App-Vault-Picker ist aus **Publish** erreichbar.
//
// **Reihenfolge dieses Zeugen.** Er wurde **vor** der Verdrahtung geschrieben und **rot** gemessen: Publish
// hatte die Fähigkeit (`placeWorkspaceAsset` kennt `Vault` → `vault-asset`), aber keinen einzigen Treffer
// für `VaultPicker` — der Einstieg existierte nicht.
//
// **Und die Wirkung, nicht die Anwesenheit.** Der Zeuge führt die Kette aus: Einstieg auflösen → mit der
// Autorität filtern → Wahl **erneut** urteilen → `placeWorkspaceAsset` ausführen → die Referenz und den
// Rahmen lesen. Zusätzlich verfolgt er im Quelltext die Verdrahtung *Element → Zustand →
// `<VaultPickerModal>`*, weil ein Zeuge, der nur Anwesenheit prüft, bei „Element behalten, Wirkung
// entfernt" grün bliebe.
//
// **Kein jsdom, kein happy-dom, kein @testing-library.** `renderToStaticMarkup` rendert nicht neu und löst
// keine Ereignisse aus: die echte Bedienung bleibt `NOT_TESTED`.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VaultFile, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../../edition/contracts/documentFactory';
import { listVaultPickerCandidates } from '../../../../../shared/vault/picker/vaultPickerEngine';
import { persistVaultLockRecord } from '../../../../../shared/vault/persistence/vaultPersistenceEngine';
import { deriveVaultLockState, vaultLockRecord } from '../../../../../shared/vault/security/vaultSessionLock';
import { DEFAULT_VAULT_KEY_POLICY, vaultShouldAutoLock } from '../../../../../shared/vault/security/vaultKeyPolicyEngine';
import { PublishToolbar } from '../../../editor/PublishToolbar';
import { placeWorkspaceAsset } from '../../../integrations/publishWorkspaceIntegration';
import {
  PUBLISH_VAULT_PICKER_ACTION,
  PUBLISH_VAULT_PICKER_APP,
  PUBLISH_VAULT_PICKER_ENTRY_LABEL,
  resolvePublishVaultPickerEntry,
  resolvePublishVaultPickerOutcome,
} from '../../../integrations/publishVaultPicker';

const noop = (): void => undefined;
const NOW = 1_800_000_000_000;
const TOOLBAR_SOURCE = 'src/apps/publish/editor/PublishToolbar.tsx';
const VIEW_SOURCE = 'src/apps/publish/PublishView.tsx';

function vaultFile(id: string, classification: VaultFile['classification'], name: string): VaultFile {
  return {
    id, name, kind: 'Writer', sizeBytes: 100, encryptedHash: 'a'.repeat(64), lastModified: 1,
    status: 'available', sourceType: 'attachment', mimeType: 'text/plain', classification,
  };
}

function vaultDocumentWith(files: readonly VaultFile[]): WorkspaceDocument {
  const document = createNewDocument('Vault');
  if (!document.vaultData) throw new Error('Zeuge: Die Fabrik lieferte kein Vault-Dokument mit vaultData.');
  return { ...document, id: 'vault-1', vaultData: { ...document.vaultData, files: [...files] } };
}

const FILES: readonly VaultFile[] = [
  vaultFile('pub', 'Public', 'pub.txt'),
  vaultFile('int', 'Internal', 'int.txt'),
  vaultFile('con', 'Confidential', 'GEHEIM.txt'),
];

function unlockedVault(): WorkspaceDocument {
  return persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
}

function publishModel() {
  const document = createNewDocument('Publish');
  if (!document.publishData) throw new Error('Zeuge: Die Fabrik lieferte kein Publish-Dokument mit publishData.');
  const frame = document.publishData.frames[0];
  if (!frame) throw new Error('Zeuge: Das Publish-Dokument hat keinen Rahmen.');
  return { model: { ...document.publishData, selectedFrameId: frame.id }, frameId: frame.id };
}

describe('AST-1226: der Vault-Picker ist aus Publish erreichbar — Wirkung, nicht Markup', () => {
  it('ein nie benutzter Tresor gilt nach der geladenen Regel als GESPERRT (gemessen)', () => {
    const lock = deriveVaultLockState({ lockedAt: null, lastActivityAt: null, autoLockMinutes: DEFAULT_VAULT_KEY_POLICY.autoLockMinutes, now: NOW });
    expect(lock).toEqual({ locked: true, reason: 'auto_lock' });
    expect(resolvePublishVaultPickerEntry([vaultDocumentWith(FILES)], NOW)).toEqual({ state: 'locked', vaultDocumentId: 'vault-1' });
    // Gegenprobe gegen eine zweite Sperrregel: `vaultShouldAutoLock` (der Weg des Nachbarn) sagt dasselbe.
    expect(vaultShouldAutoLock(DEFAULT_VAULT_KEY_POLICY, 0, NOW)).toBe(true);
  });

  it('nach dem Entsperren ist der Einstieg bereit und trägt die Anwendung Publish', () => {
    const entry = resolvePublishVaultPickerEntry([unlockedVault()], NOW);
    expect(entry.state).toBe('ready');
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    expect(entry.request.app).toBe(PUBLISH_VAULT_PICKER_APP);
    expect(entry.request.action).toBe(PUBLISH_VAULT_PICKER_ACTION);
    expect(entry.vaultDocument.kind).toBe('Vault');
    expect(entry.files).toHaveLength(3);
  });

  it('die Autorität filtert ENGER als bei Writer: für Publish ist auch „intern" zurückgehalten', () => {
    /*
     * `vaultAccessPolicyEngine.WORKSPACE_APPS` enthält `Publish` **nicht** — „intern" ist keine
     * versendbare Stufe. Diese Zahl ist die Messung der einen Autorität, nicht dieses Moduls.
     */
    const entry = resolvePublishVaultPickerEntry([unlockedVault()], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const listing = listVaultPickerCandidates(entry.files, entry.request);
    expect(listing.candidates.map((candidate) => candidate.name)).toEqual(['pub.txt']);
    expect(listing.withheldCount).toBe(2);
    // Gegenprobe: dieselben Dateien, andere Anwendung — Writer sieht mehr. Die Anwendung ist nicht dekorativ.
    const asWriter = listVaultPickerCandidates(entry.files, { ...entry.request, app: 'Writer' });
    expect(asWriter.candidates.map((candidate) => candidate.name)).toEqual(['int.txt', 'pub.txt']);
  });

  it('die Wahl fällt durch dieselbe Autorität: intern und vertraulich sind nicht wählbar', () => {
    const entry = resolvePublishVaultPickerEntry([unlockedVault()], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    expect(resolvePublishVaultPickerOutcome(entry, 'int')).toEqual({ ok: false, reason: 'policy_deny_no_grant' });
    expect(resolvePublishVaultPickerOutcome(entry, 'con')).toEqual({ ok: false, reason: 'policy_deny_no_grant' });
    expect(resolvePublishVaultPickerOutcome(entry, 'pub')).toEqual({ ok: true, fileId: 'pub', name: 'pub.txt' });
  });

  it('WIRKUNG: die getroffene Wahl wird zur echten vault-asset-Referenz am gewählten Rahmen', () => {
    const vault = unlockedVault();
    const entry = resolvePublishVaultPickerEntry([vault], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const outcome = resolvePublishVaultPickerOutcome(entry, 'pub');
    if (!outcome.ok) throw new Error(`Zeuge: Die Auswahl wurde abgelehnt (${outcome.reason}).`);

    const { model, frameId } = publishModel();
    // **Derselbe** Aufruf, den die Ansicht ausführt — die vorhandene Ablage, kein zweiter Weg.
    const next = placeWorkspaceAsset(model, frameId, entry.vaultDocument, outcome.fileId, 'live');

    expect(next.workspaceReferences).toHaveLength(1);
    const reference = next.workspaceReferences[0];
    expect(reference).toBeDefined();
    if (!reference) throw new Error('Zeuge: Die Referenz fehlt.');
    expect(reference.sourceKind).toBe('vault-asset');
    expect(reference.selector).toBe('pub');
    expect(reference.sourceDocumentId).toBe('vault-1');
    expect(reference.mode).toBe('live');
    const frame = next.frames.find((candidate) => candidate.id === frameId);
    expect(frame?.workspaceReferenceId).toBe(reference.id);
    // Und die Referenz trägt **keine** Nutzdaten des geschützten Assets.
    expect(JSON.stringify(reference)).not.toContain('base64');
  });

  it('SICHTBARER EINSTIEG: das gerenderte Element trägt data-vault-picker-entry und eine Beschriftung', () => {
    const { model } = publishModel();
    const markup = renderToStaticMarkup(
      <PublishToolbar
        model={model}
        onUpdateModel={noop}
        onAddFrame={noop}
        onPickVaultAsset={noop}
        vaultAssetBlockedReason={null}
        showPreflight={false}
        onTogglePreflight={noop}
        onUndo={noop}
        onRedo={noop}
        canUndo={false}
        canRedo={false}
        zoomPercent={100}
        onZoomOut={noop}
        onZoomIn={noop}
      />,
    );
    expect(markup).toContain('data-vault-picker-entry="Publish"');
    expect(markup).toContain(PUBLISH_VAULT_PICKER_ENTRY_LABEL);
    expect(markup).not.toContain('data-vault-picker="true"');
  });

  it('VERDRAHTUNG: der Einstieg setzt genau den Zustand, der den Picker öffnet (nicht nur Anwesenheit)', () => {
    /*
     * Anwesenheit ist kein Beweis: ein Zeuge mit vier Anwesenheits-Zusicherungen blieb bei der Mutation
     * „Element behalten, Wirkung entfernt" grün. Diese Prüfung verfolgt die **Kette** über zwei Dateien:
     * der Knopf ruft `onPickVaultAsset`, die Ansicht setzt damit `vaultPickerOpen`, und genau dieser
     * Zustand schaltet `<VaultPickerModal>`. Wird die Kette unterbrochen, wird sie rot.
     */
    const toolbar = readFileSync(TOOLBAR_SOURCE, 'utf8');
    expect(toolbar).toContain('data-vault-picker-entry="Publish"');
    const buttonIndex = toolbar.indexOf('data-vault-picker-entry="Publish"');
    const clickIndex = toolbar.indexOf('onClick={onPickVaultAsset}', buttonIndex);
    expect(clickIndex, 'Der Einstieg muss den Rückruf der Ansicht auslösen.').toBeGreaterThan(buttonIndex);

    const view = readFileSync(VIEW_SOURCE, 'utf8');
    const handlerIndex = view.indexOf('onPickVaultAsset={() =>');
    expect(handlerIndex, 'Die Ansicht muss den Einstieg verdrahten.').toBeGreaterThan(-1);
    const openIndex = view.indexOf('setVaultPickerOpen(true)', handlerIndex);
    expect(openIndex, 'Der Einstieg muss den Picker-Zustand setzen.').toBeGreaterThan(handlerIndex);
    const gateIndex = view.indexOf('{vaultPickerOpen && (');
    expect(gateIndex, 'Der Zustand muss den Dialog schalten.').toBeGreaterThan(openIndex);
    expect(view.slice(gateIndex, gateIndex + 200)).toContain('<VaultPickerModal');
    // Und die Wirkung geht durch die vorhandene Ablage, nicht durch einen zweiten Weg.
    expect(view).toContain('placeWorkspaceAsset(prev, frameId, entry.vaultDocument, outcome.fileId');
    expect(view).toContain('resolvePublishVaultPickerOutcome(entry, candidate.fileId)');
  });
});
