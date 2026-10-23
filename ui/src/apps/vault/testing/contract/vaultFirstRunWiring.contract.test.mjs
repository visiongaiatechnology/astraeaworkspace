// STATUS: PLATIN — der Ersteinrichtungs-Einstieg ist verdrahtet und der Vermerk ist abgeleitet (Paket 1).
//
// **Warum diese Datei `.mjs` ist:** sie liest Produktionsdateien mit `node:fs`. In einem `.ts`/`.tsx`-Test
// fehlen dafür die Node-Typdeklarationen (`TS2307`/`TS2580`) — die Regel, die dieses Projekt wiederholt
// Zeit gekostet hat. Der eigene Importtiefen-Wächter prüft sie inzwischen mit.
//
// **Was hier festgehalten wird:** die Zusicherung des Auftrags lautet *„eine Fähigkeit ohne Aufrufer ist
// nicht geliefert"*. Genau das war der Zustand der letzten Runde: das Panel existierte, hatte aber **keinen**
// Produktionsimporteur. Ein Test auf der Komponente allein hätte das **nicht** bemerkt — er hätte grün
// gemeldet, während die Fähigkeit unerreichbar war. Dieser Vertrag prüft deshalb den **Aufrufer**.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
/** Zeilenenden normalisieren — dieselbe Härtung wie in den übrigen Verträgen. */
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1 ');

const RUNTIME = 'src/edition/open-core/apps/vault/VaultFreeRuntime.tsx';
const PANEL = 'src/apps/vault/setup/VaultFirstRunPanel.tsx';
const LOGIC = 'src/apps/vault/setup/vaultFirstRun.ts';

describe('Paket 1 (AST-1126/1127): der Einstieg ist verdrahtet, nicht nur vorhanden', () => {
  it('der Laufzeitpfad importiert und montiert das Panel', () => {
    const runtime = stripComments(read(RUNTIME));
    // Import aus dem eigenen Bereich, nicht aus einem zweiten Pfad.
    expect(runtime).toMatch(/from '[^']*apps\/vault\/setup\/VaultFirstRunPanel'/u);
    // Und die Montage steht im Markup.
    expect(runtime).toContain('<VaultFirstRunPanel');
    // Gegenprobe, dass die Montage nicht hinter `false` deaktiviert ist.
    expect(runtime).not.toMatch(/\{false && <VaultFirstRunPanel/u);
  });

  it('die Fakten werden aus dem vorhandenen Zustand gebaut — eine Quelle, keine zweite Liste', () => {
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).toContain('vaultFirstRunFactsFrom({');
    // Die Zahlen kommen aus den tatsächlichen Beständen, nicht aus einem zweiten Zähler.
    expect(runtime).toMatch(/fileCount: vaultData\.files\.length/u);
    expect(runtime).toMatch(/folderCount: vaultData\.folders\.length/u);
    expect(runtime).toMatch(/activePin: activeDocumentPin/u);
    expect(runtime).toMatch(/activePassword: activeDocumentPassword/u);
  });

  it('der Einstieg ist bei gesperrtem Tresor **nicht** sichtbar', () => {
    /*
     * Ein Einrichtungsformular im gesperrten Zustand wäre ein zweiter Weg am Schloss vorbei — und der
     * Auftrag verlangt für jede Sperre **eine** Quelle der Wahrheit.
     */
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).toMatch(/\{!runtimeLocked && <VaultFirstRunPanel/u);
  });

  it('Policy und Ausweis entstehen gemeinsamen — kein halber Zustand', () => {
    const runtime = stripComments(read(RUNTIME));
    // Der Ausweis wird gesetzt, **und** die Policy wird persistiert; beides im selben Rückruf.
    const handler = runtime.slice(runtime.indexOf('onCreate={({ name, policy, pin, password })'), runtime.indexOf('onCreate={({ name, policy, pin, password })') + 700);
    expect(handler).toContain('onSetActiveDocumentPin?.(pin)');
    expect(handler).toContain('onSetActiveDocumentPassword?.(password)');
    expect(handler).toContain('persistVaultData({ keyPolicy: policy })');
  });

  it('kein erfundener Aufruf: die Montage benutzt nur vorhandene Rückrufe', () => {
    /*
     * Mein erster Entwurf rief `setAdvancedSectionHint('files')` — **gemessen existierte diese Funktion
     * nicht**. Ein Quellvertrag kann einen erfundenen Bezeichner nicht „falsch" nennen, aber er kann
     * festhalten, dass die Montage **keine** Funktion benutzt, die im Laufzeitpfad nicht deklariert ist.
     * Deshalb wird hier ausdrücklich geprüft, dass der frühere Platzhalter **weg** ist.
     */
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).not.toContain('setAdvancedSectionHint');
    // Und das Panel erhält **keinen** `onOpenFiles`-Rückruf: der Dateibereich steht ohnehin darunter, ein
    // Rückruf wäre eine Attrappe ohne Aufgabe.
    const panel = runtime.slice(runtime.indexOf('<VaultFirstRunPanel'), runtime.indexOf('onCreate={({ name, policy, pin, password })'));
    expect(panel).not.toContain('onOpenFiles');
  });
});

describe('Paket 1: der Einrichtungsvermerk ist abgeleitet, nicht erfunden', () => {
  it('die Ableitung steht an genau einer Stelle', () => {
    const logic = stripComments(read(LOGIC));
    expect(logic).toContain('export function isVaultInitialized');
    // Nur eine Definition — eine zweite Ableitung wäre eine zweite Wahrheit über „eingerichtet".
    expect((logic.match(/function isVaultInitialized/gu) ?? []).length).toBe(1);
    // Und der Laufzeitpfad leitet **nicht** selbst ab.
    const runtime = stripComments(read(RUNTIME));
    expect(runtime).not.toMatch(/keyGeneration\s*>=/u);
  });

  it('die Montage benutzt den vorhandenen Zustand und kein neues Vertragsfeld', () => {
    // `initializedAt` o. Ä. gibt es nicht; der Vermerk kommt aus `keyGeneration` (shared, nur lesend).
    const logic = stripComments(read(LOGIC));
    expect(logic).toContain('keyGeneration');
    expect(logic).not.toContain('initializedAt');
  });
});
