// STATUS: PLATIN — die Aufrufer der Ordner-Aktionen sind da (AST-1137 / AST-1138).
//
// **Der Befund, den dieser Vertrag festhält:** `renameVaultFolder` und `moveVaultFolder` waren **definiert**
// und hatten **0 Produktionsaufrufer**. Ein Test auf der Engine allein war grün, während die Fähigkeit im
// Produkt **fehlte** — genau die Falle, die der Auftrag mit *„eine Fähigkeit ohne Aufrufer ist nicht
// geliefert"* benennt. Deshalb prüft dieser Vertrag den **Aufrufer**, nicht die Engine.
//
// **Warum `.mjs`:** er liest Produktionsdateien mit `node:fs`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
/** Zeilenenden normalisieren — dieselbe Härtung wie in den übrigen Verträgen. */
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');

const ENGINE = 'src/shared/vault/files/vaultFileSystemEngine.ts';
const FILES_TAB = 'src/shared/vault/files/VaultFilesTab.tsx';
const SIDEBAR = 'src/apps/vault/browser/VaultBrowserSidebar.tsx';

/** Zählt Aufrufe einer Funktion in einer Datei — **ohne** die Definition selbst. */
function callSites(source, name) {
  const pattern = new RegExp(`\\b${name}\\s*\\(`, 'gu');
  return [...source.matchAll(pattern)]
    .filter((match) => !/function\s+$/u.test(source.slice(Math.max(0, match.index - 12), match.index)))
    .length;
}

describe('AST-1137: die Ordner-Aktionen haben Aufrufer', () => {
  it('beide Funktionen sind definiert — die Ausgangslage', () => {
    const engine = stripComments(read(ENGINE));
    expect(engine).toContain('export function renameVaultFolder');
    expect(engine).toContain('export function moveVaultFolder');
  });

  it('**beide werden im Dateibereich aufgerufen** — vorher hatten sie 0 Aufrufer', () => {
    /*
     * Der Kern. `VaultFilesTab` ist der Ort, an dem die Engine schon liegt; dort entstehen die Aufrufer.
     * Geprüft wird der **Aufruf**, nicht ein Wort: eine Erwähnung im Kommentar darf nicht zählen.
     */
    const tab = stripComments(read(FILES_TAB));
    expect(tab).toMatch(/renameVaultFolder\(fileSystem,\s*folderId,\s*name\)/u);
    expect(tab).toMatch(/moveVaultFolder\(fileSystem,\s*folderId,\s*parentId\)/u);
    // Und beide sind an die Seitenleiste durchgereicht.
    expect(tab).toContain('onRenameFolder={(folderId,name)=>apply(renameVaultFolder(fileSystem,folderId,name))}');
    expect(tab).toContain('onMoveFolder={(folderId,parentId)=>apply(moveVaultFolder(fileSystem,folderId,parentId))}');
  });

  it('die Seitenleiste nimmt beide Rückrufe an und ruft sie auf', () => {
    const sidebar = stripComments(read(SIDEBAR));
    expect(sidebar).toContain('onRenameFolder?: (folderId: string, name: string) => void;');
    expect(sidebar).toContain('onMoveFolder?: (folderId: string, parentId: string | null) => void;');
    expect(sidebar).toContain('onRenameFolder(folder.id, next)');
    expect(sidebar).toContain('onMoveFolder(folder.id, target === \'__root\' ? null : target)');
  });

  it('eine Ablehnung der Engine wird sichtbar gemeldet, nicht verschluckt', () => {
    const sidebar = stripComments(read(SIDEBAR));
    // Beide Wege fangen und schreiben in denselben Fehlerzustand, den die Oberfläche rendert.
    expect(sidebar).toContain('setFolderError(error instanceof Error ? error.message');
    expect(sidebar).toContain('role="alert"');
  });

  it('**eine** Quelle für „was liegt unter diesem Ordner" — nicht zwei', () => {
    /*
     * Die Oberfläche blendet unmögliche Ziele aus, die Engine wirft `vault_folder_cycle`. Beide müssen
     * **dieselbe** Funktion benutzen; zwei Durchlaufregeln wären zwei Wahrheiten über den Baum.
     */
    const engine = stripComments(read(ENGINE));
    const sidebar = stripComments(read(SIDEBAR));
    expect(engine).toContain('export function descendantVaultFolderIds');
    // Genau eine Definition.
    expect((engine.match(/function descendantVaultFolderIds/gu) ?? []).length).toBe(1);
    // Die Engine benutzt sie für ihre eigene Zyklusprüfung …
    expect(engine).toContain('descendantVaultFolderIds(folders, ancestorId).includes(candidateId)');
    // … und die Oberfläche für die Auswahl.
    expect(sidebar).toContain('descendantVaultFolderIds(folders, folder.id)');
    // Und die Seitenleiste definiert **keine** eigene Durchlaufregel.
    expect(sidebar).not.toMatch(/function\s+\w*[Dd]escendant/u);
  });

  it('kein zweiter Ordnername-Pfad: die Namensregel bleibt die vorhandene', () => {
    // `renameVaultFolder` benutzt `normalizedName`; die Seitenleiste bringt keine eigene Längenregel mit.
    const sidebar = stripComments(read(SIDEBAR));
    expect(sidebar).not.toContain('slice(0, 240)');
    expect(sidebar).not.toMatch(/name\.length\s*>/u);
  });
});
