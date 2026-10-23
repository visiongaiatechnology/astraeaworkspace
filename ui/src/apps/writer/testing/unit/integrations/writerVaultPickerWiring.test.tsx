// STATUS: PLATIN — Zeuge (AST-1226 / AST-1227): der Cross-App-Vault-Picker ist aus **Writer** erreichbar.
//
// **Warum dieser Zeuge so gebaut ist.** Ein Zeuge, der nur *Anwesenheit* prüft, ist wertlos: bei der
// Mutation „Element behalten, Wirkung entfernen" bliebe er grün. Deshalb fährt dieser Zeuge die
// **Wirkung**:
//
//   Einstieg auflösen → Auswahl mit der Autorität filtern → Auswahl **erneut** urteilen →
//   den echten Writer-Aufruf `createWriterWorkspaceEmbed` ausführen → das Ergebnis lesen.
//
// Die Markup-Prüfung steht daneben und ist ausdrücklich die **schwächere** Hälfte; sie belegt, dass ein
// gerendertes Element mit `data-vault-picker-entry` existiert, und nichts darüber, was es bewirkt.
//
// **Kein jsdom, kein happy-dom, kein @testing-library.** `renderToStaticMarkup` rendert nicht neu und löst
// keine Ereignisse aus. Die echte Bedienung (Klick, Tab, Escape) bleibt `NOT_TESTED`; geprüft wird die
// Logik, die die Komponente ausführt.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultShareGrant, WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { createNewDocument } from '../../../../../edition/contracts/documentFactory';
import { listVaultPickerCandidates } from '../../../../../shared/vault/picker/vaultPickerEngine';
import { persistVaultLockRecord } from '../../../../../shared/vault/persistence/vaultPersistenceEngine';
import { deriveVaultLockState, vaultLockRecord } from '../../../../../shared/vault/security/vaultSessionLock';
import { DEFAULT_VAULT_KEY_POLICY } from '../../../../../shared/vault/security/vaultKeyPolicyEngine';
import { vaultShouldAutoLock } from '../../../../../shared/vault/security/vaultKeyPolicyEngine';
import { WriterGridEmbedModal } from '../../../integrations/grid/WriterGridEmbedModal';
import {
  resolveWriterVaultPickerEntry,
  resolveWriterVaultPickerOutcome,
  WRITER_VAULT_PICKER_ACTION,
  WRITER_VAULT_PICKER_APP,
  WRITER_VAULT_PICKER_ENTRY_LABEL,
} from '../../../integrations/vault/writerVaultPicker';
import { createWriterWorkspaceEmbed } from '../../../public/workspace/writerWorkspaceIntegration';

const noop = (): void => undefined;

/** Feste Uhr: der Sperrzustand hängt an der Zeit, ein `Date.now()` im Zeugen wäre nicht reproduzierbar. */
const NOW = 1_800_000_000_000;

function vaultFile(id: string, classification: VaultFile['classification'], name: string): VaultFile {
  return {
    id, name, kind: 'Writer', sizeBytes: 100, encryptedHash: 'a'.repeat(64), lastModified: 1,
    status: 'available', sourceType: 'attachment', mimeType: 'text/plain', classification,
  };
}

/** Die kanonische Fabrik statt eines `as unknown as WorkspaceDocument` — dieses Projekt verbietet den Cast. */
function vaultDocumentWith(files: readonly VaultFile[], grants: readonly VaultShareGrant[] = []): WorkspaceDocument {
  const document = createNewDocument('Vault');
  if (!document.vaultData) throw new Error('Zeuge: Die Fabrik lieferte kein Vault-Dokument mit vaultData.');
  return { ...document, id: 'vault-1', vaultData: { ...document.vaultData, files: [...files], shareGrants: [...grants] } };
}

function writerDocument(): WorkspaceDocument {
  return createNewDocument('Writer');
}

/** Der Absatzanker, den `createWriterWorkspaceEmbed` verlangt — aus dem Dokument gelesen, nicht geraten. */
function writerAnchor(document: WorkspaceDocument): string {
  const block = document.root_object_ids.map((id) => document.objects[id]).find((object) => object?.type === 'TextBlock');
  const paragraph = block?.type === 'TextBlock' ? block.data.paragraphs[0] : undefined;
  if (!paragraph) throw new Error('Zeuge: Das Writer-Dokument hat keinen Absatz.');
  return paragraph.id;
}

const FILES: readonly VaultFile[] = [
  vaultFile('pub', 'Public', 'pub.txt'),
  vaultFile('int', 'Internal', 'int.txt'),
  vaultFile('con', 'Confidential', 'GEHEIM.txt'),
];

describe('AST-1226: der Vault-Picker ist aus Writer erreichbar — Wirkung, nicht Markup', () => {
  it('ein nie benutzter Tresor gilt nach der geladenen Regel als GESPERRT (gemessen, nicht angenommen)', () => {
    /*
     * **Diese Messung steht hier, weil sie den Einstieg bestimmt.** Das ausgelieferte Seed-Dokument
     * `vault-enclave` (seedData.ts:297) trägt `vaultData: { files, shares }` — **kein** `keyPolicy`. Der
     * Vorgabewert ist `autoLockMinutes: 15`, und ohne bekannte Aktivität sperrt `deriveVaultLockState`
     * fail-closed. Genau dieselbe Ableitung benutzt `VaultFreeRuntime` beim Laden für `runtimeLocked`.
     * Ein Einstieg, der das ignorierte, würde Namen verschlüsselter Assets über einem gesperrten Tresor
     * zeigen — deshalb ist der Einstieg dann **deaktiviert und benannt**, nicht offen.
     */
    const fresh = vaultDocumentWith(FILES);
    const lock = deriveVaultLockState({ lockedAt: null, lastActivityAt: null, autoLockMinutes: DEFAULT_VAULT_KEY_POLICY.autoLockMinutes, now: NOW });
    expect(lock).toEqual({ locked: true, reason: 'auto_lock' });
    expect(resolveWriterVaultPickerEntry([writerDocument(), fresh], NOW)).toEqual({ state: 'locked', vaultDocumentId: 'vault-1' });
  });

  it('nach dem Entsperren im Vault ist der Einstieg bereit — und trägt die Anwendung Writer', () => {
    const unlocked = persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
    const entry = resolveWriterVaultPickerEntry([writerDocument(), unlocked], NOW);
    expect(entry.state).toBe('ready');
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    expect(entry.vaultDocumentId).toBe('vault-1');
    expect(entry.files.map((file) => file.id)).toEqual(['pub', 'int', 'con']);
    expect(entry.request.app).toBe(WRITER_VAULT_PICKER_APP);
    expect(entry.request.action).toBe(WRITER_VAULT_PICKER_ACTION);
    /*
     * **Gegenprobe gegen eine zweite Sperrregel:** die Autoren-Regel des Nachbarn
     * (`taskVaultAttachments` benutzt `vaultShouldAutoLock`) muss dasselbe sagen. Sie sagt es hier —
     * die beiden Regeln driften für diesen Eingabesatz nicht.
     */
    expect(vaultShouldAutoLock(DEFAULT_VAULT_KEY_POLICY, NOW, NOW)).toBe(false);
    expect(vaultShouldAutoLock(DEFAULT_VAULT_KEY_POLICY, 0, NOW)).toBe(true);
  });

  it('die Autorität filtert: Writer sieht pub und int, das vertrauliche Asset ist unsichtbar', () => {
    const unlocked = persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
    const entry = resolveWriterVaultPickerEntry([writerDocument(), unlocked], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const listing = listVaultPickerCandidates(entry.files, entry.request);
    expect(listing.candidates.map((candidate) => candidate.name)).toEqual(['int.txt', 'pub.txt']);
    expect(listing.withheldCount).toBe(1);
    // Der Name des zurückgehaltenen Assets steht in der Liste **nicht** — auch nicht als Treffer einer Suche.
    expect(listVaultPickerCandidates(entry.files, { ...entry.request, query: 'geheim' }).candidates).toEqual([]);
  });

  it('die Wahl fällt durch dieselbe Autorität: das vertrauliche Asset ist nicht wählbar', () => {
    const unlocked = persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
    const entry = resolveWriterVaultPickerEntry([writerDocument(), unlocked], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    expect(resolveWriterVaultPickerOutcome(entry, 'con')).toEqual({ ok: false, reason: 'policy_deny_no_grant' });
    expect(resolveWriterVaultPickerOutcome(entry, 'erfunden')).toEqual({ ok: false, reason: 'vault_picker_selection_missing' });
    expect(resolveWriterVaultPickerOutcome(entry, 'int')).toEqual({ ok: true, fileId: 'int', name: 'int.txt' });
  });

  it('WIRKUNG: die getroffene Wahl wird zum echten Writer-Embed mit diesem Asset', () => {
    /*
     * Das ist die Zusicherung, die bei „Element behalten, Wirkung entfernen" rot wird. Sie führt
     * **denselben** Aufruf aus, den die Komponente ausführt (`createWriterWorkspaceEmbed`), mit dem
     * Ergebnis des Pickers als Eingabe — kein zweiter Einfügeweg, kein Nachbau.
     */
    const document = writerDocument();
    const unlocked = persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
    const entry = resolveWriterVaultPickerEntry([document, unlocked], NOW);
    if (entry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const outcome = resolveWriterVaultPickerOutcome(entry, 'int');
    if (!outcome.ok) throw new Error(`Zeuge: Die Auswahl wurde abgelehnt (${outcome.reason}).`);

    const embed = createWriterWorkspaceEmbed({
      writerDocument: document,
      sourceDocument: unlocked,
      kind: 'vault-asset',
      mode: 'Snapshot',
      anchorParagraphId: writerAnchor(document),
      sourceObjectId: outcome.fileId,
      id: 'embed-1',
      now: NOW,
    });
    expect(embed.kind).toBe('vault-asset');
    expect(embed.sourceDocumentId).toBe('vault-1');
    expect(embed.sourceObjectId).toBe('int');
    expect(embed.snapshot).toMatchObject({ type: 'vault-asset', fileId: 'int', name: 'int.txt', mimeType: 'text/plain' });
    expect(embed.uri).toContain('int');
    // Und **keine** Nutzdaten: der Embed trägt Metadaten, nicht die Bytes des geschützten Assets.
    expect(JSON.stringify(embed)).not.toContain('data:text/plain;base64');
  });

  it('die Anwendung im Auftrag ist nicht dekorativ: Publish sähe weniger', () => {
    // Wenn `WRITER_VAULT_PICKER_APP` versehentlich auf eine nach außen tragende Anwendung zeigt, ändert
    // sich die sichtbare Menge. Die Zahl steht hier als Messung, nicht als Meinung.
    const unlocked = persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
    const writerEntry = resolveWriterVaultPickerEntry([writerDocument(), unlocked], NOW);
    if (writerEntry.state !== 'ready') throw new Error('Zeuge: Der Einstieg ist nicht bereit.');
    const asPublish = listVaultPickerCandidates(writerEntry.files, { ...writerEntry.request, app: 'Publish' });
    expect(asPublish.candidates.map((candidate) => candidate.name)).toEqual(['pub.txt']);
    expect(asPublish.withheldCount).toBe(2);
  });

  it('SICHTBARER EINSTIEG: das gerenderte Element trägt data-vault-picker-entry und eine Beschriftung', () => {    const document = writerDocument();
    const unlocked = persistVaultLockRecord(vaultDocumentWith(FILES), vaultLockRecord(false, NOW), NOW);
    const openMarkup = renderToStaticMarkup(
      <WriterGridEmbedModal
        isOpen
        onClose={noop}
        onInsertTable={noop}
        onInsertWorkspaceEmbed={noop}
        writerDocument={document}
        anchorParagraphId={writerAnchor(document)}
        workspaceDocuments={[document, unlocked]}
      />,
    );
    expect(openMarkup).toContain('data-vault-picker-entry="Writer"');
    expect(openMarkup).toContain(WRITER_VAULT_PICKER_ENTRY_LABEL);
    // Der Picker selbst ist **zu**, solange niemand den Einstieg bedient hat.
    expect(openMarkup).not.toContain('data-vault-picker="true"');

    // Und über einem gesperrten Tresor ist der Einstieg deaktiviert — nicht heimlich offen.
    const lockedMarkup = renderToStaticMarkup(
      <WriterGridEmbedModal
        isOpen
        onClose={noop}
        onInsertTable={noop}
        onInsertWorkspaceEmbed={noop}
        writerDocument={document}
        anchorParagraphId={writerAnchor(document)}
        workspaceDocuments={[document, vaultDocumentWith(FILES)]}
      />,
    );
    expect(lockedMarkup).toContain('data-vault-picker-entry="Writer"');
    expect(lockedMarkup).toContain('disabled');
    expect(lockedMarkup).toContain('Gesperrt — die Auswahl ist deshalb nicht verfügbar.');
  });

  it('VERDRAHTUNG: der Einstieg setzt genau den Zustand, der den Picker öffnet (nicht nur Anwesenheit)', () => {
    /*
     * **Warum diese Prüfung hier steht.** Anwesenheit ist kein Beweis: ein Zeuge mit vier
     * Anwesenheits-Zusicherungen blieb bei der Mutation „Element behalten, Wirkung entfernt" grün. Diese
     * Zusicherungen verfolgen deshalb die **Kette** — das Element setzt `vaultPickerOpen`, und genau
     * dieser Zustand schaltet `<VaultPickerModal>`. Wird der `onClick` zur Attrappe, werden sie rot und
     * die Markup-Zusicherungen darüber bleiben grün; genau das ist der Unterschied.
     */
    const component = readFileSync('src/apps/writer/integrations/grid/WriterGridEmbedModal.tsx', 'utf8');
    expect(component).toContain('data-vault-picker-entry="Writer"');
    const clickIndex = component.indexOf('onClick={() => setVaultPickerOpen(true)}');
    expect(clickIndex, 'Der Einstieg muss den Picker-Zustand setzen.').toBeGreaterThan(-1);
    const gateIndex = component.indexOf('{vaultPickerOpen && (');
    expect(gateIndex, 'Der Zustand muss den Dialog schalten.').toBeGreaterThan(clickIndex);
    expect(component.slice(gateIndex, gateIndex + 200)).toContain('<VaultPickerModal');
    // Und die Wahl geht durch die Autorität, nicht direkt in die Auswahl.
    expect(component).toContain('resolveWriterVaultPickerOutcome(vaultPickerEntry, candidate.fileId)');
    expect(component).toContain('setObjectValue(outcome.fileId)');
  });
});
