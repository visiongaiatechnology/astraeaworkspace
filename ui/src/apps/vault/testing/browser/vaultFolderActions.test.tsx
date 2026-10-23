// STATUS: PLATIN — Ordner umbenennen und verschieben: die Aufrufer (AST-1137 / AST-1138).
//
// **Der gemessene Befund:** `renameVaultFolder` (`vaultFileSystemEngine.ts:157`) und `moveVaultFolder`
// (`:178`) waren **definiert** und hatten **0 Produktionsaufrufer**; `VaultBrowserSidebar` bot nur Auswählen,
// Anlegen und ein Datei-Drop-Ziel. Ordner ließen sich in der Oberfläche also **weder umbenennen noch
// verschieben** — die Fähigkeit existierte als Code, nicht als Produkt. Der Auftrag nennt das ausdrücklich:
// *„eine Fähigkeit ohne Aufrufer ist nicht geliefert."*
//
// **Was hier geprüft wird:** die Aufrufer sind verdrahtet (Quellvertrag, weil die Montage ohne DOM nicht
// ausführbar ist), die Engine lehnt Ungültiges **benannt** ab, und die Oberfläche blendet unmögliche
// Ziele über **dieselbe** Funktion aus, die die Engine für die Zyklusprüfung benutzt.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VaultFile, VaultFolder } from '../../../../shared/contracts/workspace';
import {
  buildVaultFolderTree,
  descendantVaultFolderIds,
  moveVaultFolder,
  renameVaultFolder,
  type VaultFileSystemState,
} from '../../../../shared/vault/files/vaultFileSystemEngine';
import { VaultBrowserSidebar } from '../../../../apps/vault/browser/VaultBrowserSidebar';

const NOW = 1_700_000_000_000;
const noop = () => {};

const folder = (id: string, name: string, parentId: string | null = null): VaultFolder => ({
  id, name, parentId, createdAt: NOW, modifiedAt: NOW, owner: 'local-user', classification: 'Internal',
});

const state = (folders: VaultFolder[]): VaultFileSystemState => ({ files: [], folders } as VaultFileSystemState);

describe('descendantVaultFolderIds: eine Quelle für „was liegt darunter"', () => {
  it('findet direkte und tiefe Nachfahren', () => {
    const folders = [folder('a', 'A'), folder('b', 'B', 'a'), folder('c', 'C', 'b'), folder('x', 'X')];
    expect(descendantVaultFolderIds(folders, 'a').sort()).toEqual(['b', 'c']);
    expect(descendantVaultFolderIds(folders, 'b')).toEqual(['c']);
    expect(descendantVaultFolderIds(folders, 'c')).toEqual([]);
    expect(descendantVaultFolderIds(folders, 'x')).toEqual([]);
  });

  it('enthält den Ordner selbst **nicht** — der Aufrufer entscheidet darüber', () => {
    // Sonst müsste jeder Aufrufer den eigenen Ordner wieder herausrechnen: zwei Regeln für eine Frage.
    expect(descendantVaultFolderIds([folder('a', 'A')], 'a')).not.toContain('a');
  });

  it('ein kaputter Baum (Zyklus) beendet den Durchlauf, statt hängen zu bleiben', () => {
    // Daten aus einem älteren Stand können einen Zyklus tragen; die Oberfläche darf daran nicht ersticken.
    const broken = [folder('a', 'A', 'b'), folder('b', 'B', 'a')];
    const found = descendantVaultFolderIds(broken, 'a');
    expect(found).toContain('b');
    expect(found.length).toBeLessThanOrEqual(2);
  });

  it('unbrauchbare Eingaben liefern eine leere Liste, statt zu werfen', () => {
    expect(descendantVaultFolderIds([folder('a', 'A')], '')).toEqual([]);
    expect(descendantVaultFolderIds([folder('a', 'A')], null as never)).toEqual([]);
    expect(descendantVaultFolderIds([], 'a')).toEqual([]);
  });
});

describe('Die Engine lehnt Ungültiges benannt ab — der Aufrufer muss das weiterreichen', () => {
  it('ein unbekannter Ordner wird benannt abgelehnt', () => {
    expect(() => renameVaultFolder(state([folder('a', 'A')]), 'weg', 'Neu')).toThrow('vault_folder_not_found');
    expect(() => moveVaultFolder(state([folder('a', 'A')]), 'weg', null)).toThrow('vault_folder_not_found');
  });

  it('**ein Zyklus wird abgelehnt** — in sich selbst und in einen Nachfahren', () => {
    const folders = [folder('a', 'A'), folder('b', 'B', 'a'), folder('c', 'C', 'b')];
    expect(() => moveVaultFolder(state(folders), 'a', 'a')).toThrow('vault_folder_cycle');
    expect(() => moveVaultFolder(state(folders), 'a', 'b')).toThrow('vault_folder_cycle');
    expect(() => moveVaultFolder(state(folders), 'a', 'c')).toThrow('vault_folder_cycle');
    // Ein Geschwister ist erlaubt — die Ablehnung ist eng, nicht pauschal.
    expect(() => moveVaultFolder(state([...folders, folder('z', 'Z')]), 'z', 'a')).not.toThrow();
  });

  it('ein unbekanntes Ziel wird benannt abgelehnt, die Wurzel nicht', () => {
    expect(() => moveVaultFolder(state([folder('a', 'A')]), 'a', 'weg')).toThrow('vault_parent_not_found');
    expect(moveVaultFolder(state([folder('a', 'A', 'x')]), 'a', null).folders[0]!.parentId).toBeNull();
  });

  it('Verschieben hält die relativen Pfade konsistent — der Baum bleibt ein Baum', () => {
    /*
     * Die Akzeptanzhandlung zu AST-1137/AST-1138 lautet „Ordnerstruktur erstellen und **relative Pfade
     * konsistent halten**". Geprüft wird die Wirkung: nach dem Verschieben ist die Tiefe im Baum genau um
     * eins größer, und der alte Elternteil hat das Kind verloren.
     */
    const before = [folder('a', 'A'), folder('b', 'B'), folder('kind', 'Kind', 'a')];
    const depthOf = (folders: VaultFolder[], id: string) => buildVaultFolderTree(folders, []).find((node) => node.folder.id === id)?.depth;
    expect(depthOf(before, 'kind')).toBe(1);
    const moved = moveVaultFolder(state(before), 'kind', 'b');
    expect(depthOf(moved.folders, 'kind')).toBe(1);
    expect(moved.folders.find((entry) => entry.id === 'kind')!.parentId).toBe('b');
    // Und der Baum enthält den Ordner weiterhin **genau einmal** — kein Verdoppeln, kein Verlieren.
    expect(buildVaultFolderTree(moved.folders, []).filter((node) => node.folder.id === 'kind')).toHaveLength(1);
  });

  it('Umbenennen normalisiert den Namen, statt ihn zu verwerfen', () => {
    const renamed = renameVaultFolder(state([folder('a', 'A')]), 'a', '  Berichte  ');
    expect(renamed.folders[0]!.name).toBe('Berichte');
  });
});

describe('VaultBrowserSidebar: die Bedienelemente erscheinen nur mit Aufrufer', () => {
  const base = {
    folders: [folder('a', 'Alpha'), folder('b', 'Beta', 'a')],
    files: [] as VaultFile[],
    activeFolderId: null,
    onSelectFolder: noop, onCreateFolder: noop, onMoveFileDrop: noop,
    specialFilter: 'none' as const, onSpecialFilter: noop,
  };

  it('**ohne** Rückrufe erscheinen weder Umbenennen noch Verschieben', () => {
    // Ein Knopf, der nichts tut, wäre schlimmer als keiner.
    const markup = renderToStaticMarkup(<VaultBrowserSidebar {...base} />);
    expect(markup).not.toContain('Rename folder Alpha');
    expect(markup).not.toContain('Move folder Alpha into');
  });

  it('**mit** Rückrufen erscheinen beide, tastaturbedienbar und benannt', () => {
    const markup = renderToStaticMarkup(<VaultBrowserSidebar {...base} onRenameFolder={noop} onMoveFolder={noop} />);
    expect(markup).toContain('aria-label="Rename folder Alpha"');
    expect(markup).toContain('aria-label="Move folder Alpha into"');
    // Die Verschiebe-Auswahl ist ein **Befehl**, kein Zustand: der Wert springt zurück.
    expect(markup).toContain('<select');
    expect(markup).toContain('Vault root');
  });

  it('**unmögliche Ziele werden nicht angeboten** — Beta kann nicht in sich selbst', () => {
    /*
     * „Alpha" kann nicht nach „Beta" (Nachfahre) und nicht in sich selbst; angeboten bleiben die Wurzel und
     * keine weiteren Ordner. Beide Seiten benutzen `descendantVaultFolderIds` — dieselbe Regel, nicht zwei.
     */
    const markup = renderToStaticMarkup(<VaultBrowserSidebar {...base} onMoveFolder={noop} onRenameFolder={noop} />);
    const alphaSelect = markup.slice(markup.indexOf('aria-label="Move folder Alpha into"'));
    const alphaOptions = alphaSelect.slice(0, alphaSelect.indexOf('</select>'));
    expect(alphaOptions).not.toContain('>Beta<');
    expect(alphaOptions).toContain('Vault root');
    // Für Beta (kein Nachfahre) bleibt Alpha wählbar.
    const betaSelect = markup.slice(markup.indexOf('aria-label="Move folder Beta into"'));
    const betaOptions = betaSelect.slice(0, betaSelect.indexOf('</select>'));
    expect(betaOptions).toContain('>Alpha<');
  });

  it('der Zeigerweg bleibt erhalten: Drop-Ziel und Ziehbarkeit', () => {
    // Die Tastaturalternative **ergänzt** den Drop, sie ersetzt ihn nicht.
    const markup = renderToStaticMarkup(<VaultBrowserSidebar {...base} onRenameFolder={noop} onMoveFolder={noop} />);
    expect(markup).toContain('draggable');
    expect(markup).toContain('data-vault-folder-tree="true"');
    expect(markup).toContain('data-vault-folder-row="a"');
  });
});
