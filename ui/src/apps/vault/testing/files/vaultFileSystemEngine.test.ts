// STATUS: PLATIN — Dateisystem des Vaults: Hierarchie, Auswahl und Suchvertrag.
//
// `vaultFileSystemEngine.ts` ist das Rückgrat der sichtbaren Dateiliste — `createVaultFolder`,
// `moveVaultFiles`, `duplicateVaultFiles`, `renameVaultFile`, `updateVaultFileMetadata`, `queryVaultFiles`,
// `buildVaultFolderTree`, `vaultOpenTargets`, `buildVaultQuickPreview` — und hatte bis hierher **keinen
// einzigen Test**. Zwei der Funktionen (`renameVaultFolder`, `moveVaultFolder`) haben außerdem **keinen
// Aufrufer** in der Oberfläche; das ist im Inventar als Lücke vermerkt und wird hier trotzdem mitgemessen,
// damit „unbenutzt" nicht mit „unbekannt" verwechselt wird.
//
// Besonders relevant ist `isDescendant`: eine falsche Zyklusprüfung macht aus einem Ordnerbaum eine
// Endlosschleife. Der Test prüft deshalb nicht nur den einfachen Zyklus, sondern auch einen **längeren**
// Kreis (A→B→C→A) und den Selbstbezug.
import { describe, expect, it } from 'vitest';
import type { VaultFile, VaultFolder } from '../../../../shared/contracts/workspace';
import {
  buildVaultFolderTree,
  buildVaultQuickPreview,
  copyVaultFiles,
  createVaultFolder,
  duplicateVaultFiles,
  inferVaultFileAssociation,
  inferVaultKindFromFilename,
  markVaultFileAccessed,
  moveVaultFiles,
  moveVaultFolder,
  normalizeVaultFile,
  normalizeVaultFileSystem,
  queryVaultFiles,
  renameVaultFile,
  renameVaultFolder,
  updateVaultFileMetadata,
  vaultOpenTargets,
  type VaultFileSystemState,
} from '../../../../shared/vault/files/vaultFileSystemEngine';

const NOW = 1_700_000_000_000;

const folder = (id: string, name = id, parentId: string | null = null): VaultFolder => ({
  id, name, parentId, createdAt: NOW, modifiedAt: NOW,
});

const file = (id: string, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 10,
  encryptedHash: 'a'.repeat(64), lastModified: NOW, folderId: null, ...overrides,
});

const state = (files: VaultFile[], folders: VaultFolder[] = []): VaultFileSystemState => ({ files, folders });

describe('Ordner anlegen und normalisieren', () => {
  it('ein leerer oder unbrauchbarer Name bekommt einen Ersatznamen, kein leerer Eintrag entsteht', () => {
    expect(createVaultFolder('   ', null, NOW).name).toBe('New Folder');
    expect(createVaultFolder('.', null, NOW).name).toBe('New Folder');
    expect(createVaultFolder('..', null, NOW).name).toBe('New Folder');
    expect(createVaultFolder('mit\u0000Steuerzeichen', null, NOW).name).toBe('New Folder');
    expect(createVaultFolder('  Gültig  ', null, NOW).name).toBe('Gültig');
  });

  it('ein zu langer Name wird ABGELEHNT, nicht gekürzt — dieselbe Regel wie beim Import (V-004 behoben)', () => {
    /*
     * **Zusicherung geändert, weil sich das Verhalten geändert hat.** Hier stand: `expect(…name).toHaveLength(240)`
     * mit dem Vermerk, dass Ordnernamen still gekürzt werden, Importnamen dagegen abgelehnt — die gemessene
     * Divergenz V-004. Der Test hielt den Ist-Zustand fest, damit die Divergenz nicht unbemerkt verschwindet.
     * Jetzt sind beide Wege auf **eine** Autorität umgestellt (`vaultNames.ts`), und die Regel lautet
     * „ablehnen statt still kürzen": ein gekürzter Name ist ein **anderer** Name.
     */
    const long = 'a'.repeat(300);
    expect(() => createVaultFolder(long, null, NOW)).toThrow('vault_name_too_long');
    // Genau an der Grenze wird angenommen, ein Zeichen darüber nicht.
    expect(createVaultFolder('a'.repeat(240), null, NOW).name).toHaveLength(240);
    expect(() => createVaultFolder('a'.repeat(241), null, NOW)).toThrow('vault_name_too_long');
  });

  it('die ID wird zufällig und kryptografisch gezogen, nicht aus der Zeit abgeleitet', () => {
    const first = createVaultFolder('A', null, NOW);
    const second = createVaultFolder('A', null, NOW);
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^vfolder-\d+-[0-9a-f]{16}$/u);
  });

  it('Ordner ohne Namen und Duplikate werden beim Normalisieren verworfen', () => {
    const normalized = normalizeVaultFileSystem(state([], [
      folder('f1', 'Eins'), folder('f1', 'Doppelt'), folder('', 'Ohne ID'),
    ]), NOW);
    expect(normalized.folders.map((item) => item.id)).toEqual(['f1']);
    expect(normalized.folders[0]?.name).toBe('Eins');
  });

  it('ein verwaister parentId wird auf die Wurzel zurückgesetzt statt zu verschwinden', () => {
    const normalized = normalizeVaultFileSystem(state([], [folder('f1', 'Eins'), folder('f2', 'Zwei', 'gibt-es-nicht')]), NOW);
    expect(normalized.folders.find((item) => item.id === 'f2')?.parentId).toBeNull();
    expect(normalized.folders).toHaveLength(2);
  });

  it('eine Datei in einem verschwundenen Ordner landet an der Wurzel, statt unsichtbar zu werden', () => {
    const normalized = normalizeVaultFileSystem(state([file('a', { folderId: 'weg' })], []), NOW);
    expect(normalized.files[0]?.folderId).toBeNull();
  });
});

describe('Ordner verschieben: Zyklen sind der Fehler, den es zu verhindern gilt', () => {
  it('ein Ordner kann nicht in sich selbst verschoben werden', () => {
    expect(() => moveVaultFolder(state([], [folder('a')]), 'a', 'a')).toThrow('vault_folder_cycle');
  });

  it('ein längerer Kreis A→B→C→A wird erkannt', () => {
    // C unter A hängen, wenn A bereits (über B) unter C hängt, wäre ein Kreis.
    const tree = [folder('a'), folder('b', 'b', 'a'), folder('c', 'c', 'b')];
    expect(() => moveVaultFolder(state([], tree), 'a', 'c')).toThrow('vault_folder_cycle');
    // Und die Umkehrrichtung ist zulässig, weil sie keinen Kreis bildet.
    expect(moveVaultFolder(state([], tree), 'c', 'a').folders.find((item) => item.id === 'c')?.parentId).toBe('a');
  });

  it('ein unbekannter Ordner oder ein unbekanntes Ziel wird abgelehnt', () => {
    expect(() => moveVaultFolder(state([], [folder('a')]), 'weg', null)).toThrow('vault_folder_not_found');
    expect(() => moveVaultFolder(state([], [folder('a')]), 'a', 'weg')).toThrow('vault_parent_not_found');
  });

  it('in die Wurzel verschieben ist erlaubt', () => {
    const result = moveVaultFolder(state([], [folder('a'), folder('b', 'b', 'a')]), 'b', null, NOW + 5);
    expect(result.folders.find((item) => item.id === 'b')?.parentId).toBeNull();
    expect(result.folders.find((item) => item.id === 'b')?.modifiedAt).toBe(NOW + 5);
  });

  it('Umbenennen wirkt nur auf den genannten Ordner und lehnt Unbekanntes ab', () => {
    const result = renameVaultFolder(state([], [folder('a', 'Alt'), folder('b', 'B')]), 'a', 'Neu', NOW + 7);
    expect(result.folders.find((item) => item.id === 'a')).toMatchObject({ name: 'Neu', modifiedAt: NOW + 7 });
    expect(result.folders.find((item) => item.id === 'b')?.name).toBe('B');
    expect(() => renameVaultFolder(state([], [folder('a')]), 'weg', 'X')).toThrow('vault_folder_not_found');
  });
});

describe('Dateien verschieben, kopieren, umbenennen', () => {
  it('Verschieben setzt den Ordner und die Änderungszeit, ein unbekanntes Ziel wird abgelehnt', () => {
    const result = moveVaultFiles(state([file('a'), file('b')], [folder('f1')]), ['a'], 'f1', NOW + 3);
    expect(result.files.find((item) => item.id === 'a')).toMatchObject({ folderId: 'f1', lastModified: NOW + 3 });
    expect(result.files.find((item) => item.id === 'b')?.folderId).toBeNull();
    expect(() => moveVaultFiles(state([file('a')]), ['a'], 'weg')).toThrow('vault_target_folder_not_found');
  });

  it('Verschieben in die Wurzel ist erlaubt (null ist ein gültiges Ziel)', () => {
    expect(moveVaultFiles(state([file('a', { folderId: 'f1' })], [folder('f1')]), ['a'], null).files[0]?.folderId).toBeNull();
  });

  it('Duplizieren erzeugt neue IDs, einen „copy"-Namen und behält die Endung', () => {
    const result = duplicateVaultFiles(state([file('a', { name: 'bericht.pdf' })]), ['a'], undefined, NOW + 9);
    expect(result.files).toHaveLength(2);
    const copy = result.files[0]!;
    expect(copy.id).not.toBe('a');
    expect(copy.name).toBe('bericht copy.pdf');
    expect(copy.createdAt).toBe(NOW + 9);
    expect(copy.lastModified).toBe(NOW + 9);
  });

  it('eine Datei ohne Endung bekommt den Zusatz hinten angehängt', () => {
    expect(duplicateVaultFiles(state([file('a', { name: 'ohneendung' })]), ['a']).files[0]?.name).toBe('ohneendung copy');
    // Ein führender Punkt ist kein Endungstrenner.
    expect(duplicateVaultFiles(state([file('a', { name: '.versteckt' })]), ['a']).files[0]?.name).toBe('.versteckt copy');
  });

  it('Duplizieren ohne Treffer und mit unbekanntem Zielordner wird abgelehnt', () => {
    expect(() => duplicateVaultFiles(state([file('a')]), ['weg'])).toThrow('vault_file_not_found');
    expect(() => duplicateVaultFiles(state([file('a')]), ['a'], 'weg')).toThrow('vault_target_folder_not_found');
  });

  it('Duplizieren ohne Zielordner behält den Ordner der Quelldatei', () => {
    expect(duplicateVaultFiles(state([file('a', { folderId: 'f1' })], [folder('f1')]), ['a']).files[0]?.folderId).toBe('f1');
  });

  it('`copyVaultFiles` ist dieselbe Operation wie Duplizieren (keine zweite Regel)', () => {
    const input = state([file('a', { name: 'x.txt' })], [folder('f1')]);
    expect(copyVaultFiles(input, ['a'], 'f1').files[0]?.name).toBe(duplicateVaultFiles(input, ['a'], 'f1').files[0]?.name);
  });

  it('Umbenennen zieht Dokumentart und Zuordnung mit (Fix V-032)', () => {
    const before = state([file('a', { name: 'notiz.txt', kind: 'Writer' })]);
    // Gemessen vor dem Fix: `{action:'workspace', app:'Writer', source:'fallback'}` — also „Open with
    // Writer" für eine Grid-Datei, weil `kind` nicht mitgezogen wurde.
    const renamed = renameVaultFile(before, 'a', 'tabelle.vgrid').files[0]!;
    expect(renamed.kind).toBe('Grid');
    expect(renamed.association).toMatchObject({ action: 'workspace', app: 'Grid', source: 'extension' });
    // Ohne erkannte Endung fällt sie auf `Writer` zurück (die Vault-Standardart) und meldet das als Rückfall.
    const plain = renameVaultFile(before, 'a', 'ganz-neu').files[0]!;
    expect(plain.kind).toBe('Writer');
    expect(plain.association).toMatchObject({ action: 'workspace', app: 'Writer', source: 'fallback' });
    // Ein verknüpftes Workspace-Dokument behält seine Art: der Name darf sie nicht umdeuten.
    const linked = renameVaultFile(state([file('a', { sourceType: 'workspace-document', documentId: 'd1', kind: 'Grid' })]), 'a', 'x.txt').files[0]!;
    expect(linked.kind).toBe('Grid');
    expect(linked.association).toMatchObject({ action: 'workspace', app: 'Grid', source: 'native' });
  });

  it('die Endungstabelle hier und in `vaultIntegrity` laufen nicht auseinander (V-033)', async () => {
    /*
     * Dieses Modul **kann** `inferVaultKindFromFilename` aus `integrity/vaultIntegrity.ts` nicht benutzen:
     * `vaultIntegrity` importiert `inferVaultFileAssociation` aus diesem Modul, ein Rückimport wäre ein
     * Zyklus. Die Abbildung existiert deshalb zweimal — genau das Muster, das dieses Projekt schon mehrfach
     * getroffen hat. Dieser Test ist die Klammer dazwischen: er vergleicht beide Tabellen über dieselben
     * Endungen und wird rot, sobald eine Seite erweitert wird.
     */
    const { inferVaultKindFromFilename: fromIntegrity } = await import('../../../../shared/vault/integrity/vaultIntegrity');
    // `docx` steht bewusst mit in der Liste: genau dieser Eintrag fehlte in meiner ersten Fassung der
    // Tabelle, und `a.docx` fiel dadurch still auf den Rückfall zurück. Ein Divergenztest, der die
    // betroffene Endung nicht enthält, hätte den Fehler nicht gefunden.
    const samples = ['a.docx', 'a.vgrid', 'a.csv', 'a.xlsx', 'a.ods', 'a.vpresent', 'a.pptx', 'a.odp', 'a.vnote', 'a.md',
      'a.vpdf', 'a.pdf', 'a.vboard', 'a.vtask', 'a.txt', 'a.bin', 'ohneendung', 'a.', 'a.VGRID', 'a.DOCX'];
    for (const name of samples) {
      expect(inferVaultKindFromFilename(name), name).toBe(fromIntegrity(name));
    }
  });

  it('Umbenennen mit leerem Namen behält den alten Namen und lehnt Unbekanntes ab', () => {
    const result = renameVaultFile(state([file('a', { name: 'bleibt.txt' })]), 'a', '   ');
    expect(result.files[0]?.name).toBe('bleibt.txt');
    expect(() => renameVaultFile(state([file('a')]), 'weg', 'x')).toThrow('vault_file_not_found');
  });

  it('die Zugriffszeit wird gesetzt und Unbekanntes abgelehnt', () => {
    expect(markVaultFileAccessed(state([file('a')]), 'a', NOW + 11).files[0]?.lastAccessedAt).toBe(NOW + 11);
    expect(() => markVaultFileAccessed(state([file('a')]), 'weg')).toThrow('vault_file_not_found');
  });
});

describe('Metadaten: Grenzen werden durchgesetzt', () => {
  it('Tags werden bereinigt, entdoppelt und auf 32 begrenzt', () => {
    const result = updateVaultFileMetadata(state([file('a')]), ['a'], { tags: ['  eins  ', 'eins', '', 'zwei'] });
    expect(result.files[0]?.tags).toEqual(['eins', 'zwei']);
    const many = updateVaultFileMetadata(state([file('a')]), ['a'], { tags: Array.from({ length: 50 }, (_, index) => `t${index}`) });
    expect(many.files[0]?.tags).toHaveLength(32);
  });

  it('leere Eigenschaftsschlüssel fallen weg, leere Werte werden getrimmt und Längen begrenzt', () => {
    const result = updateVaultFileMetadata(state([file('a')]), ['a'], {
      properties: { '  ': 'x', leer: '   ', ok: '  wert  ' },
    });
    const properties = result.files[0]?.properties ?? {};
    // Gemessen: **beide** leeren Fälle fallen weg — ein leerer Schlüssel und ein Wert, der nach dem Trimmen
    // leer ist. Mein erster Testlauf erwartete, dass `leer: '   '` erhalten bleibt; die Erwartung war
    // falsch. Der Ist-Zustand steht jetzt hier fest.
    expect(Object.keys(properties)).toEqual(['ok']);
    expect(properties.ok).toBe('wert');
    // Überlange Schlüssel/Werte werden begrenzt (80/512), nicht verworfen.
    const bounded = updateVaultFileMetadata(state([file('a')]), ['a'], { properties: { ['k'.repeat(200)]: 'v'.repeat(2000) } }).files[0]?.properties ?? {};
    const boundedKey = Object.keys(bounded)[0]!;
    expect(boundedKey).toHaveLength(80);
    expect(bounded[boundedKey]).toHaveLength(512);
  });

  it('mehr als 64 Eigenschaften werden abgeschnitten', () => {
    const properties = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`k${index}`, `v${index}`]));
    expect(Object.keys(updateVaultFileMetadata(state([file('a')]), ['a'], { properties }).files[0]?.properties ?? {})).toHaveLength(64);
  });

  it('ein leerer Besitzer fällt auf den lokalen Nutzer zurück', () => {
    expect(updateVaultFileMetadata(state([file('a')]), ['a'], { owner: '   ' }).files[0]?.owner).toBe('local-user');
    expect(updateVaultFileMetadata(state([file('a')]), ['a'], { owner: '  Ada  ' }).files[0]?.owner).toBe('Ada');
  });

  it('nicht genannte Dateien bleiben unverändert, und zwar als eigenes Objekt', () => {
    const input = state([file('a'), file('b', { name: 'b-bleibt.txt' })]);
    const result = updateVaultFileMetadata(input, ['a'], { favorite: true });
    expect(result.files.find((item) => item.id === 'b')?.name).toBe('b-bleibt.txt');
    // Die Eingabe darf nicht mutiert worden sein.
    expect(input.files.find((item) => item.id === 'a')?.favorite).toBeUndefined();
  });

  it('spaceIds werden bereinigt, entdoppelt und begrenzt', () => {
    expect(normalizeVaultFile(file('a', { spaceIds: [' s1 ', 's1', '', 's2'] })).spaceIds).toEqual(['s1', 's2']);
    expect(normalizeVaultFile(file('a', { spaceIds: Array.from({ length: 50 }, (_, index) => `s${index}`) })).spaceIds).toHaveLength(32);
  });

  it('ein Integritätskonflikt wird beim Normalisieren zu „corrupt", ohne den Status zu überschreiben', () => {
    expect(normalizeVaultFile(file('a', { integrityState: 'mismatch' })).status).toBe('corrupt');
    expect(normalizeVaultFile(file('a', { integrityState: 'mismatch', status: 'quarantined' })).status).toBe('quarantined');
    expect(normalizeVaultFile(file('a')).status).toBe('available');
  });
});

describe('Abfrage und Sortierung', () => {
  const files = [
    file('a', { name: 'Zebra.txt', sizeBytes: 300, lastModified: 3, tags: ['rot'], kind: 'Writer', owner: 'Ada', classification: 'Confidential' }),
    file('b', { name: 'apfel.txt', sizeBytes: 100, lastModified: 1, tags: ['rot', 'gruen'], kind: 'Grid', owner: 'Bob' }),
    file('c', { name: 'Mitte.txt', sizeBytes: 200, lastModified: 2, folderId: 'f1', tags: [], kind: 'Writer' }),
  ];

  it('nach Name wird natürlich sortiert (Zahlen in Namen zählen als Zahlen)', () => {
    const result = queryVaultFiles(files, { sortKey: 'name' });
    expect(result.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    // Natürliche Sortierung: date10 nach date9, nicht davor.
    const numbered = [file('x', { name: 'date10.txt' }), file('y', { name: 'date9.txt' })];
    expect(queryVaultFiles(numbered, { sortKey: 'name' }).map((item) => item.id)).toEqual(['y', 'x']);
  });

  it('alle Sortierschlüssel funktionieren und die Richtung lässt sich umkehren', () => {
    expect(queryVaultFiles(files, { sortKey: 'size', sortDirection: 'desc' }).map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(queryVaultFiles(files, { sortKey: 'modified' }).map((item) => item.id)).toEqual(['b', 'c', 'a']);
    // Gemessen mit dem Fix: eine Datei **ohne** Besitzer sortiert als leerer String, also vor 'Ada'.
    expect(queryVaultFiles(files, { sortKey: 'owner' }).map((item) => item.id)[0]).toBe('c');
    expect(queryVaultFiles(files, { sortKey: 'owner', sortDirection: 'desc' }).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    /*
     * **Befund + Fix (V-030):** Ein fehlender Wert wurde über `String(undefined)` zum Text „undefined" und
     * sortierte damit alphabetisch unter echten Werten ein. Gemessen vor dem Fix: `owner` absteigend ergab
     * `['x', 'y']` statt `['x', 'y']` … genauer: aufsteigend kam die Datei **ohne** Besitzer zuerst, weil
     * „undefined" alphabetisch vor „Zed" liegt. Für die Sortierung nach Klassifikation hieß das, dass eine
     * **unbekannte** Einstufung zwischen den bekannten landen konnte. Jetzt wird ein fehlender Wert als
     * leerer String geführt und gehört ans Ende.
     */
    expect(queryVaultFiles([file('x', { owner: 'Zed' }), file('y', { owner: undefined })], { sortKey: 'owner' }).map((item) => item.id)).toEqual(['y', 'x']);
    expect(queryVaultFiles([file('x', { owner: 'Zed' }), file('y', { owner: undefined })], { sortKey: 'owner', sortDirection: 'desc' }).map((item) => item.id)).toEqual(['x', 'y']);
    // Und die Sortierung nach Klassifikation läuft weiterhin über die normalisierten Werte
    // (`normalizeVaultFile` setzt fehlende Einstufungen auf 'Internal', deshalb sind hier alle gleich).
    expect(queryVaultFiles(files, { sortKey: 'classification' })).toHaveLength(3);
    expect(queryVaultFiles(files, { sortKey: 'classification', sortDirection: 'desc' })).toHaveLength(3);
  });

  it('die Sortierung ist stabil: gleiche Schlüssel werden nach ID entschieden', () => {
    const same = [file('z', { name: 'gleich.txt' }), file('a', { name: 'gleich.txt' })];
    expect(queryVaultFiles(same, { sortKey: 'name' }).map((item) => item.id)).toEqual(['a', 'z']);
    expect(queryVaultFiles(same, { sortKey: 'size' }).map((item) => item.id)).toEqual(['a', 'z']);
  });

  it('Ordnerfilter, Typfilter und Sonderfilter greifen', () => {
    expect(queryVaultFiles(files, { folderId: 'f1' }).map((item) => item.id)).toEqual(['c']);
    expect(queryVaultFiles(files, { folderId: null }).map((item) => item.id)).toEqual(['b', 'a']);
    expect(queryVaultFiles(files, { kind: 'Grid' }).map((item) => item.id)).toEqual(['b']);
    expect(queryVaultFiles(files, { kind: 'all' })).toHaveLength(3);
    expect(queryVaultFiles(files, { kind: 'grid' }).map((item) => item.id)).toEqual(['b']);
    expect(queryVaultFiles([...files, file('d', { favorite: true })], { favoriteOnly: true }).map((item) => item.id)).toEqual(['d']);
  });

  it('die Suche deckt Name, Typ, Eigentümer, Klassifikation, Tags und Digest ab', () => {
    expect(queryVaultFiles(files, { search: 'zebra' }).map((item) => item.id)).toEqual(['a']);
    expect(queryVaultFiles(files, { search: 'GRID' }).map((item) => item.id)).toEqual(['b']);
    expect(queryVaultFiles(files, { search: 'ada' }).map((item) => item.id)).toEqual(['a']);
    expect(queryVaultFiles(files, { search: 'confidential' }).map((item) => item.id)).toEqual(['a']);
    expect(queryVaultFiles(files, { search: 'gruen' }).map((item) => item.id)).toEqual(['b']);
    // Die Digest-Suche gehört dazu — aber die Standard-Hashes der Fixtures bestehen aus `'a'.repeat(64)`,
    // also darf der Suchbegriff nicht selbst ein Hash-Präfix sein. Gemessener Befund meines ersten Laufs.
    expect(queryVaultFiles([file('d', { contentDigest: 'f'.repeat(64) }), file('e', { contentDigest: 'a'.repeat(64) })], { search: 'f'.repeat(64) }).map((item) => item.id)).toEqual(['d']);
    expect(queryVaultFiles([file('e', { contentDigest: 'a'.repeat(64) })], { search: 'f'.repeat(64) })).toEqual([]);
    expect(queryVaultFiles(files, { search: 'gibtesnicht' })).toEqual([]);
  });

  it('die Tag-Filterung verlangt alle genannten Tags', () => {
    expect(queryVaultFiles(files, { tags: ['rot'] }).map((item) => item.id).sort()).toEqual(['a', 'b']);
    expect(queryVaultFiles(files, { tags: ['rot', 'gruen'] }).map((item) => item.id)).toEqual(['b']);
  });

  it('die „kürzlich"-Filterung nutzt die Zugriffszeit', () => {
    const recent = file('r', { lastAccessedAt: NOW });
    const old = file('o', { lastAccessedAt: NOW - 400 * 86_400_000 });
    expect(queryVaultFiles([recent, old], { recentOnly: true, recentAfter: NOW - 86_400_000 }).map((item) => item.id)).toEqual(['r']);
  });

  it('ohne Suchtext und Filter kommt alles zurück und die Eingabe bleibt unverändert', () => {
    const input = [file('a'), file('b')];
    expect(queryVaultFiles(input, {})).toHaveLength(2);
    expect(input.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('Ordnerbaum', () => {
  it('baut Tiefe, Kindzahl und Dateizahl je Ordner', () => {
    const tree = [folder('a', 'A'), folder('b', 'B', 'a'), folder('c', 'C', 'b'), folder('d', 'D')];
    const files = [file('x', { folderId: 'a' }), file('y', { folderId: 'b' }), file('z', { folderId: 'b' })];
    const nodes = buildVaultFolderTree(tree, files);
    expect(nodes.map((node) => [node.folder.id, node.depth, node.childCount, node.fileCount])).toEqual([
      ['a', 0, 1, 1], ['b', 1, 1, 2], ['c', 2, 0, 0], ['d', 0, 0, 0],
    ]);
  });

  it('jeder Ordner erscheint genau einmal, auch bei einem Kreis im Bestand', () => {
    // Ein Kreis kann durch die Normalisierung nicht entstehen — aber ein **fremd geladener** Bestand könnte
    // einen enthalten. Der Baum darf dann nicht hängen bleiben oder doppeln.
    const cyclic = [folder('a', 'A', 'b'), folder('b', 'B', 'a')];
    const nodes = buildVaultFolderTree(cyclic, []);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map((node) => node.folder.id)).size).toBe(2);
  });

  it('ein verwaister Ordner erscheint an der Wurzel, statt zu fehlen', () => {
    const nodes = buildVaultFolderTree([folder('a', 'A', 'verschwunden')], []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.depth).toBe(0);
  });

  it('ein leerer Bestand ergibt einen leeren Baum', () => {
    expect(buildVaultFolderTree([], [])).toEqual([]);
  });
});

describe('Zuordnung und Öffnungsziele', () => {
  it('die Zuordnung folgt Endung, dann MIME, dann der Dokumentart (in dieser Reihenfolge)', () => {
    // 1. Endung.
    expect(inferVaultFileAssociation({ name: 'a.docx', kind: 'Writer', sourceType: 'attachment' })).toMatchObject({ action: 'workspace', app: 'Writer', source: 'extension' });
    expect(inferVaultFileAssociation({ name: 'a.XLSX', kind: 'Grid', sourceType: 'attachment' })).toMatchObject({ app: 'Grid' });
    expect(inferVaultFileAssociation({ name: 'a.pptx', kind: 'Present', sourceType: 'attachment' })).toMatchObject({ app: 'Present' });
    // 2. MIME — auch wenn die **Endung** unbekannt ist.
    expect(inferVaultFileAssociation({ name: 'a.unbekannt', kind: 'Writer', sourceType: 'attachment', mimeType: 'image/png' })).toMatchObject({ action: 'preview', source: 'mime' });
    expect(inferVaultFileAssociation({ name: 'a.unbekannt', kind: 'Writer', sourceType: 'attachment', mimeType: 'application/pdf' })).toMatchObject({ action: 'preview' });
    expect(inferVaultFileAssociation({ name: 'a.unbekannt', kind: 'Writer', sourceType: 'attachment', mimeType: 'text/plain' })).toMatchObject({ action: 'preview' });
    // 3. Dokumentart als **letzter** Hinweis — die Erweiterung ist absichtlich eng.
    // Gemessene Einschränkung (V-034): `kind` ist der Standard `Writer`, wenn die Endung unbekannt ist, also
    // ist eine unbekannte Binärdatei von einem echten Writer-Dokument nicht unterscheidbar. Sie bekommt
    // deshalb „Open with Writer" angeboten statt nur „Download" — ein Angebot, das der Nutzer ablehnen kann,
    // kein stiller Fehler. Der Ist-Zustand steht hier fest; eine feinere Regel bräuchte `kind: 'Unknown'`
    // im Vertrag.
    expect(inferVaultFileAssociation({ name: 'ohneendung', kind: 'Writer', sourceType: 'attachment' })).toMatchObject({ action: 'workspace', app: 'Writer', source: 'fallback' });
    expect(inferVaultFileAssociation({ name: 'ohneendung', kind: 'Vault', sourceType: 'attachment' })).toMatchObject({ action: 'download' });
    expect(inferVaultFileAssociation({ name: 'ohneendung', kind: 'PdfStudio', sourceType: 'attachment', mimeType: 'application/octet-stream' })).toMatchObject({ action: 'download' });
    // Ohne `kind` (Aufrufer kennt die Art nicht) bleibt eine unbekannte Binärdatei ein Download.
    expect(inferVaultFileAssociation({ name: 'ohneendung', kind: '' as never, sourceType: 'attachment' })).toMatchObject({ action: 'download' });
    // Ein verknüpftes Workspace-Dokument gewinnt gegen alles.
    expect(inferVaultFileAssociation({ name: 'a.bin', kind: 'Grid', sourceType: 'workspace-document', documentId: 'd1' })).toMatchObject({ action: 'workspace', app: 'Grid', source: 'native' });
  });

  it('Öffnungsziele richten sich nach der Zuordnung und der Herkunft', () => {
    const workspace = file('a', { sourceType: 'workspace-document', documentId: 'd1', kind: 'Grid' });
    expect(vaultOpenTargets(workspace).map((target) => target.action)).toEqual(['workspace']);

    const image = file('b', { sourceType: 'attachment', mimeType: 'image/png', name: 'b.png' });
    expect(vaultOpenTargets(image).map((target) => target.action)).toEqual(['preview', 'download']);

    // Die Dokumentart aus dem Dateinamen ist die maßgebliche Quelle; eine unbekannte Endung führt auf den
    // Standard `Writer` (siehe V-034). Damit ist `c.bin` kein reiner Download mehr.
    expect(inferVaultFileAssociation({ name: 'c.bin', kind: 'PdfStudio', sourceType: 'attachment', mimeType: 'application/octet-stream' })).toMatchObject({ action: 'download' });

    // **Befund + Fix (V-029):** eine manuell gesetzte Zuordnung wurde von `vaultOpenTargets` ignoriert —
    // die Oberfläche zeigte die Zuordnung an (`VaultFileEntry` liest `file.association`), handelte aber
    // nach der abgeleiteten. Jetzt gewinnt `source: 'manual'`.
    const overriddenDownload = file('d', { sourceType: 'attachment', mimeType: 'image/png', name: 'd.png', association: { action: 'download', source: 'manual' } });
    expect(vaultOpenTargets(overriddenDownload).map((target) => target.action)).toEqual(['download']);
    const overriddenWorkspace = file('e', { sourceType: 'attachment', name: 'e.bin', association: { action: 'workspace', app: 'Notes', source: 'manual' } });
    expect(vaultOpenTargets(overriddenWorkspace).map((target) => target.action)).toEqual(['workspace']);
    const overriddenPreview = file('f', { sourceType: 'attachment', mimeType: 'application/octet-stream', name: 'f.bin', association: { action: 'preview', source: 'manual' } });
    expect(vaultOpenTargets(overriddenPreview).map((target) => target.action)).toEqual(['preview']);
  });
});

describe('Schnellvorschau: begrenzt und ohne Ausführung', () => {
  it('ein Workspace-Eintrag verweist auf das Dokument, statt Inhalt zu kopieren', () => {
    const preview = buildVaultQuickPreview(file('a', { sourceType: 'workspace-document', documentId: 'd1', kind: 'Grid', name: 'Tabelle' }));
    expect(preview).toMatchObject({ kind: 'workspace', documentId: 'd1' });
    // Kein `dataUrl`: der Inhalt wird nicht kopiert, sondern das Dokument referenziert.
    expect(preview).not.toHaveProperty('dataUrl');
  });

  it('ohne Nutzlast wird ausdrücklich gewarnt, statt leer anzuzeigen', () => {
    const preview = buildVaultQuickPreview(file('a', { payloadDataUrl: undefined }));
    expect(preview.kind).toBe('binary');
    expect(preview.warning).toContain('No local payload');
  });

  it('Bild und PDF liefern die Data-URL, Text wird dekodiert', () => {
    const dataUrl = `data:image/png;base64,${btoa('png')}`;
    expect(buildVaultQuickPreview(file('a', { mimeType: 'image/png', payloadDataUrl: dataUrl }))).toMatchObject({ kind: 'image', dataUrl });
    expect(buildVaultQuickPreview(file('b', { mimeType: 'application/pdf', payloadDataUrl: dataUrl }))).toMatchObject({ kind: 'pdf' });
    const text = `data:text/plain;base64,${btoa('hallo welt')}`;
    expect(buildVaultQuickPreview(file('c', { mimeType: 'text/plain', payloadDataUrl: text }))).toMatchObject({ kind: 'text', text: 'hallo welt' });
  });

  it('Text oberhalb der Vorschaugrenze wird NICHT dekodiert, sondern abgelehnt', () => {
    // Grenze ist 256 KiB; `sizeBytes` ist die gemeldete Größe und entscheidet vor dem Dekodieren.
    const preview = buildVaultQuickPreview(file('a', { mimeType: 'text/plain', sizeBytes: 256 * 1024 + 1, payloadDataUrl: 'data:text/plain;base64,AA==' }));
    expect(preview.kind).toBe('text');
    expect(preview.text).toBeUndefined();
    expect(preview.warning).toContain('256 KiB');
  });

  it('ein unbekannter Binärtyp wird nicht angezeigt', () => {
    const preview = buildVaultQuickPreview(file('a', { mimeType: 'application/x-unbekannt', payloadDataUrl: 'data:application/x-unbekannt;base64,AA==' }));
    expect(preview.kind).toBe('binary');
    expect(preview.warning).toContain('intentionally disabled');
  });

  it('eine unbrauchbare Data-URL wirft, statt still leeren Text zu liefern', () => {
    expect(() => buildVaultQuickPreview(file('a', { mimeType: 'text/plain', payloadDataUrl: 'ohne-komma' })))
      .toThrow('vault_preview_invalid_data_url');
  });
});
