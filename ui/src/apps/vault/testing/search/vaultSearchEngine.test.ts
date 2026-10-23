// STATUS: PLATIN — Suchindex: Sperre, Datenschutz und Budgets.
//
// `vaultSearchEngine.ts` trug die Sicherheitszusage des Vaults für Suche („gesperrter Tresor liefert keine
// Geheimnisse") und hatte **keinen** Test. Der Index ist die einzige Stelle im Vault, an der Datei**inhalte**
// im Klartext außerhalb des Containers liegen (`protection: 'vault_container_aead'`) — genau deshalb wird
// hier gemessen, was hineinkommt, was ausgeschlossen wird und was die Abfrage bei Sperre tut.
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultFolder, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  applyVaultSearchPrivacyPolicy,
  buildVaultSearchIndex,
  DEFAULT_VAULT_SEARCH_POLICY,
  normalizeVaultSearchPolicy,
  searchVaultIndex,
  vaultSearchIndexIsStale,
  type VaultSearchAdapters,
} from '../../../../shared/vault/search/vaultSearchEngine';

const NOW = 1_700_000_000_000;

const file = (id: string, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 10, encryptedHash: 'a'.repeat(64),
  lastModified: NOW, sourceType: 'attachment', mimeType: 'text/plain', folderId: null,
  tags: [], properties: {}, ...overrides,
});

const folder = (id: string, parentId: string | null = null): VaultFolder => ({ id, name: id, parentId, createdAt: 1, modifiedAt: 1 });

const document = (id: string, title: string): WorkspaceDocument => ({
  schema_version: 1, id, title, kind: 'Grid', created_at: 1, modified_at: 1, version: 1, theme_id: 'default',
  root_object_ids: [], objects: {}, vaultData: { files: [], folders: [], spaces: [], shares: [], trash: [] },
} as unknown as WorkspaceDocument);

const adapters = (text = 'inhalt'): VaultSearchAdapters => ({
  extractAttachmentText: async () => text,
  extractWorkspaceText: async () => text,
});

describe('Suchpolitik: Grenzen und Standardwerte', () => {
  it('der Standard indexiert Inhalt, aber kein OCR', () => {
    expect(DEFAULT_VAULT_SEARCH_POLICY).toMatchObject({ version: 1, contentIndexingEnabled: true, ocrIndexingEnabled: false });
    expect(DEFAULT_VAULT_SEARCH_POLICY.excludedFileIds).toEqual([]);
    expect(DEFAULT_VAULT_SEARCH_POLICY.excludedFolderIds).toEqual([]);
  });

  it('Ausschlusslisten werden bereinigt, entdoppelt und begrenzt', () => {
    const policy = normalizeVaultSearchPolicy({ excludedFileIds: [' a ', 'a', '', 'b'], excludedFolderIds: ['f'] });
    expect(policy.excludedFileIds).toEqual(['a', 'b']);
    expect(policy.excludedFolderIds).toEqual(['f']);
    const many = normalizeVaultSearchPolicy({ excludedFileIds: Array.from({ length: 20_000 }, (_, index) => `f${index}`) });
    expect(many.excludedFileIds).toHaveLength(10_000);
  });

  it('`contentIndexingEnabled` lässt sich abschalten, `version` bleibt fest', () => {
    expect(normalizeVaultSearchPolicy({ contentIndexingEnabled: false }).contentIndexingEnabled).toBe(false);
    expect(normalizeVaultSearchPolicy({ version: 99 as never }).version).toBe(1);
  });
});

describe('Indexaufbau: was hineinkommt und was nicht', () => {
  it('der Index trägt die Schutzbehauptung und die Einträge', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], undefined, adapters('geheim'), NOW);
    expect(index.protection).toBe('vault_container_aead');
    expect(index.builtAt).toBe(NOW);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({ fileId: 'a', name: 'a.txt', contentText: 'geheim' });
  });

  it('Quarantäne, Beschädigung und Fehlen werden NICHT indiziert', async () => {
    const index = await buildVaultSearchIndex([
      file('ok'), file('q', { status: 'quarantined' }), file('c', { status: 'corrupt' }), file('m', { status: 'missing' }),
    ], [], [], [], undefined, adapters('geheim'), NOW);
    // Alle vier bekommen einen Eintrag (Metadaten bleiben sichtbar), aber nur der gesunde Inhaltstext.
    expect(index.entries).toHaveLength(4);
    expect(index.entries.find((entry) => entry.fileId === 'ok')?.contentText).toBe('geheim');
    for (const id of ['q', 'c', 'm']) {
      expect(index.entries.find((entry) => entry.fileId === id)?.contentText, id).toBe('');
    }
  });

  it('der Inhaltsausschluss gilt auch für Unterordner', async () => {
    const folders = [folder('parent'), folder('child', 'parent')];
    const policy = { excludedFolderIds: ['parent'] };
    const index = await buildVaultSearchIndex([file('a', { folderId: 'child' })], folders, [], [], policy, adapters('geheim'), NOW);
    expect(index.entries[0]?.privacyExcluded).toBe(true);
    expect(index.entries[0]?.contentText).toBe('');
  });

  it('ein Ausschluss auf Dateiebene gewinnt gegen den Ordner', async () => {
    const index = await buildVaultSearchIndex([file('a', { folderId: 'f1' })], [folder('f1')], [], [], { excludedFileIds: ['a'] }, adapters('geheim'), NOW);
    expect(index.entries[0]?.privacyExcluded).toBe(true);
  });

  it('ohne Inhaltsindizierung bleiben die Metadaten, aber kein Text', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], { contentIndexingEnabled: false }, adapters('geheim'), NOW);
    expect(index.entries[0]?.contentText).toBe('');
    expect(index.entries[0]?.name).toBe('a.txt');
  });

  it('ein Workspace-Dokument wird über das verknüpfte Dokument indiziert', async () => {
    const documents = [document('d1', 'Meine Tabelle')];
    const index = await buildVaultSearchIndex(
      [file('a', { sourceType: 'workspace-document', documentId: 'd1', documentVersion: 7 })], [], [], documents, undefined, adapters('aus dem Dokument'), NOW,
    );
    expect(index.entries[0]?.contentText).toBe('aus dem Dokument');
    // `documentVersion` kommt aus dem **Eintrag**, nicht aus dem Dokument: der Index beschreibt den Stand,
    // zu dem er gebaut wurde. Ist der Eintrag versioniert, trägt der Index diese Version.
    expect(index.entries[0]?.documentVersion).toBe(7);
    expect(index.entries[0]?.sourceDigest).toBe('a'.repeat(64));
  });

  it('ein verknüpftes Dokument, das fehlt, ergibt keinen Inhalt statt eines Absturzes', async () => {
    const index = await buildVaultSearchIndex([file('a', { sourceType: 'workspace-document', documentId: 'weg' })], [], [], [], undefined, adapters('x'), NOW);
    expect(index.entries[0]?.contentText).toBe('');
  });

  it('der Inhalt wird auf 512 000 Zeichen je Datei begrenzt', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], undefined, adapters('x'.repeat(600_000)), NOW);
    expect(index.entries[0]?.contentText).toHaveLength(512_000);
  });

  it('oberhalb der Dateigrenze wird der Indexaufbau abgelehnt', async () => {
    const files = Array.from({ length: 10_001 }, (_, index) => file(`f${index}`));
    await expect(buildVaultSearchIndex(files, [], [], [], undefined, adapters(), NOW)).rejects.toThrow('vault_search_file_limit_exceeded');
  });

  it('das Gesamtinhaltsbudget wird geprüft und abgelehnt, nicht gekürzt', async () => {
    // 40 Dateien mit je 512 000 Zeichen ergeben 20,48 Mio. Zeichen > 16 Mio. Budget.
    const files = Array.from({ length: 40 }, (_, index) => file(`f${index}`));
    await expect(buildVaultSearchIndex(files, [], [], [], undefined, adapters('x'.repeat(512_000)), NOW))
      .rejects.toThrow('vault_search_content_budget_exceeded');
  });

  it('OCR-Text wird nur bei aktivierter Politik und vorhandenem Adapter erhoben', async () => {
    const withOcr: VaultSearchAdapters = { ...adapters('a'), extractOcrText: async () => 'ocr-text' };
    const off = await buildVaultSearchIndex([file('a')], [], [], [], { ocrIndexingEnabled: false }, withOcr, NOW);
    expect(off.entries[0]?.ocrText).toBe('');
    const on = await buildVaultSearchIndex([file('a')], [], [], [], { ocrIndexingEnabled: true }, withOcr, NOW);
    expect(on.entries[0]?.ocrText).toBe('ocr-text');
    // Ein fehlschlagender OCR-Adapter darf den ganzen Index nicht verhindern.
    const failing: VaultSearchAdapters = { ...adapters('a'), extractOcrText: async () => { throw new Error('ocr kaputt'); } };
    const tolerated = await buildVaultSearchIndex([file('a')], [], [], [], { ocrIndexingEnabled: true }, failing, NOW);
    expect(tolerated.entries[0]?.ocrText).toBe('');
  });

  it('Nullzeichen werden entfernt und die Normalform angewendet', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], undefined, adapters('a\u0000b'), NOW);
    expect(index.entries[0]?.contentText).toBe('ab');
  });
});

describe('Sperre: ein gesperrter Tresor liefert keine Geheimnisse', () => {
  it('eine Abfrage bei gesperrtem Zustand wirft, statt Treffer zu liefern', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], undefined, adapters('geheim'), NOW);
    expect(() => searchVaultIndex(index, { text: 'geheim' }, { unlocked: false })).toThrow('vault_search_locked');
  });

  it('ein Index ohne die Schutzbehauptung wird abgelehnt', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], undefined, adapters('geheim'), NOW);
    // Ein fremd geladener Index, der die Zusage nicht trägt, darf nicht durchsucht werden.
    expect(() => searchVaultIndex({ ...index, protection: 'none' as never }, { text: 'x' }, { unlocked: true }))
      .toThrow('vault_search_index_unprotected');
  });

  it('ein fehlender Index ergibt keine Treffer, aber keinen Fehler', () => {
    expect(searchVaultIndex(undefined, { text: 'x' }, { unlocked: true })).toEqual([]);
  });
});

describe('Abfrage: Filter, Bewertung, Grenzen', () => {
  const build = async () => buildVaultSearchIndex([
    file('a', { name: 'Gehaltsliste.txt', tags: ['hr', 'geheim'], owner: 'Ada', properties: { abteilung: 'Finanzen' } }),
    file('b', { name: 'urlaub.txt', tags: ['hr'], kind: 'Grid', owner: 'Bob' }),
    file('c', { name: 'notizen.txt', folderId: 'f1' }),
  ], [folder('f1')], [{ id: 'space-1', documentIds: [], sharedFolders: ['f1'] }], [], undefined, adapters('vertraulich'), NOW);

  it('Textsuche über Name, Inhalt, Tags und Eigenschaften', async () => {
    const index = await build();
    expect(searchVaultIndex(index, { text: 'gehaltsliste' }, { unlocked: true }).map((result) => result.fileId)).toEqual(['a']);
    expect(searchVaultIndex(index, { text: 'vertraulich' }, { unlocked: true })).toHaveLength(3);
    expect(searchVaultIndex(index, { text: 'finanzen' }, { unlocked: true }).map((result) => result.fileId)).toEqual(['a']);
    expect(searchVaultIndex(index, { text: 'gibtesnicht' }, { unlocked: true })).toEqual([]);
  });

  it('mehrere Begriffe müssen alle vorkommen (UND, nicht ODER)', async () => {
    const index = await build();
    expect(searchVaultIndex(index, { text: 'gehaltsliste hr' }, { unlocked: true }).map((result) => result.fileId)).toEqual(['a']);
    expect(searchVaultIndex(index, { text: 'gehaltsliste urlaub' }, { unlocked: true })).toEqual([]);
  });

  it('Typ, Eigentümer, Tags und Zeitraum filtern', async () => {
    const index = await build();
    expect(searchVaultIndex(index, { type: 'Grid' }, { unlocked: true }).map((result) => result.fileId)).toEqual(['b']);
    expect(searchVaultIndex(index, { type: 'all' }, { unlocked: true })).toHaveLength(3);
    expect(searchVaultIndex(index, { owner: 'Ada' }, { unlocked: true }).map((result) => result.fileId)).toEqual(['a']);
    expect(searchVaultIndex(index, { tags: ['hr'] }, { unlocked: true }).map((result) => result.fileId).sort()).toEqual(['a', 'b']);
    expect(searchVaultIndex(index, { tags: ['hr', 'geheim'] }, { unlocked: true }).map((result) => result.fileId)).toEqual(['a']);
    expect(searchVaultIndex(index, { modifiedAfter: NOW + 1 }, { unlocked: true })).toEqual([]);
    expect(searchVaultIndex(index, { modifiedBefore: NOW - 1 }, { unlocked: true })).toEqual([]);
  });

  it('die Zugehörigkeit zu einem Space wird über geteilte Ordner erkannt', async () => {
    const index = await build();
    expect(searchVaultIndex(index, { spaceId: 'space-1' }, { unlocked: true }).map((result) => result.fileId)).toEqual(['c']);
    expect(searchVaultIndex(index, { spaceId: 'gibt-es-nicht' }, { unlocked: true })).toEqual([]);
  });

  it('ein Treffer mit Inhaltsausschluss zeigt den Grund statt eines Inhaltsausschnitts', async () => {
    const index = await buildVaultSearchIndex([file('a', { name: 'geheim.txt' })], [], [], [], { excludedFileIds: ['a'] }, adapters('streng geheim'), NOW);
    const result = searchVaultIndex(index, { text: 'geheim' }, { unlocked: true });
    expect(result[0]).toMatchObject({ fileId: 'a', privacyExcluded: true, snippet: 'Content indexing disabled by privacy policy.' });
  });

  it('die Abfrage wird auf 512 Zeichen begrenzt und auf höchstens 16 Begriffe zerlegt', async () => {
    const index = await build();
    // Ein sehr langer Begriff wird abgeschnitten, nicht als Fehler behandelt.
    expect(() => searchVaultIndex(index, { text: 'x'.repeat(5000) }, { unlocked: true })).not.toThrow();
    // **Gemessen:** nur die ersten 16 Begriffe werden berücksichtigt. Ein Begriff an Position 3 wird
    // verlangt (UND), einer an Position 18 **ignoriert** — die Abfrage liefert dann die Treffer der ersten
    // 16 Begriffe. Das ist die Folge des Deckels, und der Test hält beide Seiten fest, damit die Grenze
    // nicht unbemerkt verschwindet.
    const inside = Array.from({ length: 20 }, (_, position) => (position === 2 ? 'gibtesnicht' : 'hr'));
    expect(searchVaultIndex(index, { text: inside.join(' ') }, { unlocked: true })).toEqual([]);
    const outside = Array.from({ length: 20 }, (_, position) => (position === 17 ? 'gibtesnicht' : 'hr'));
    expect(searchVaultIndex(index, { text: outside.join(' ') }, { unlocked: true }).map((result) => result.fileId).sort()).toEqual(['a', 'b']);
  });

  it('Treffer sind nach Bewertung sortiert und die Liste ist begrenzt', async () => {
    const files = Array.from({ length: 600 }, (_, index) => file(`f${index}`, { name: `treffer${index}.txt` }));
    const index = await buildVaultSearchIndex(files, [], [], [], undefined, adapters('treffer'), NOW);
    const results = searchVaultIndex(index, { text: 'treffer' }, { unlocked: true });
    expect(results).toHaveLength(500);
    for (let position = 1; position < results.length; position += 1) {
      expect(results[position - 1]!.score).toBeGreaterThanOrEqual(results[position]!.score);
    }
  });
});

describe('Datenschutzpolitik nachträglich anwenden', () => {
  it('entfernt Inhalt wirklich aus dem Index, nicht nur ein Kennzeichen', async () => {
    const index = await buildVaultSearchIndex([file('a'), file('b')], [], [], [], undefined, adapters('geheim'), NOW);
    const next = applyVaultSearchPrivacyPolicy(index, [file('a'), file('b')], [], { excludedFileIds: ['a'] });
    expect(next?.entries.find((entry) => entry.fileId === 'a')?.contentText).toBe('');
    expect(next?.entries.find((entry) => entry.fileId === 'a')?.privacyExcluded).toBe(true);
    expect(next?.entries.find((entry) => entry.fileId === 'b')?.contentText).toBe('geheim');
    // Ein ausgeschlossenes OCR-Feld wird ebenfalls geleert.
    expect(next?.entries.find((entry) => entry.fileId === 'a')?.ocrText).toBe('');
  });

  it('ein fehlender Index bleibt fehlend', () => {
    expect(applyVaultSearchPrivacyPolicy(undefined, [], [], undefined)).toBeUndefined();
  });

  it('eine Datei, die nicht mehr existiert, gilt als ausgeschlossen', async () => {
    const index = await buildVaultSearchIndex([file('a')], [], [], [], undefined, adapters('geheim'), NOW);
    const next = applyVaultSearchPrivacyPolicy(index, [], [], undefined);
    expect(next?.entries[0]?.privacyExcluded).toBe(true);
    expect(next?.entries[0]?.contentText).toBe('');
  });
});

describe('Indexverfall', () => {
  it('ein fehlender Index ist immer veraltet', () => {
    expect(vaultSearchIndexIsStale(undefined, [])).toBe(true);
  });

  it('eine geänderte Anzahl oder ein geänderter Digest macht den Index veraltet', async () => {
    const files = [file('a'), file('b')];
    const index = await buildVaultSearchIndex(files, [], [], [], undefined, adapters('x'), NOW);
    expect(vaultSearchIndexIsStale(index, files)).toBe(false);
    expect(vaultSearchIndexIsStale(index, [...files, file('c')])).toBe(true);
    // Gleiche Anzahl, aber ein anderer Inhaltsdigest.
    expect(vaultSearchIndexIsStale(index, [file('a', { contentDigest: 'b'.repeat(64) }), file('b')])).toBe(true);
    // Gleicher Digest, aber andere Änderungszeit.
    expect(vaultSearchIndexIsStale(index, [file('a', { lastModified: NOW + 1 }), file('b')])).toBe(true);
  });
});
