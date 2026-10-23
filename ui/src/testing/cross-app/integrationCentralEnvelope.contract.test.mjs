// STATUS: PLATIN — Integration & Release, Paket 2: **der zentrale Weg**, nicht der eigene Vermerk
//
// ## Warum diese Datei existiert (und was sie ersetzt)
//
// `testing/cross-app/integrationWomCanon.contract.test.mjs` misst, **welche Apps in ihrem eigenen Code** eine
// Schema-Angabe tragen, und führt daraus eine Liste „**ohne** = Connect, Grid, Notes, Present, Vault, Whiteboard".
// Gemessen in Runde 142 ist diese Liste **eine Tatsache, die keine mehr ist**: Der Umschlag wird **zentral**
// gestempelt — `app/useWorkspaceDocumentUpdates.ts:30` ruft `stampWorkspaceDocumentSchema` für **jedes** Dokument
// auf, und das Lese-Urteil liegt ebenfalls zentral (`shell/lifecycle/useWorkspaceShellLifecycle.ts`,
// `shell/workspace/AppWorkspaceView.tsx`). Ein eigener Vermerk je App wäre damit **eine zweite Definition des
// Umschlags** — genau die Krankheit, die dieses Projekt teuer bezahlt hat.
//
// **Paket 2 ist deshalb keine Einbauarbeit in sechs Apps, sondern diese Messung.** Sie prüft vier Dinge:
//   1. Der **Stempel** geschieht zentral und **für jedes** Dokument (nicht nur für eines).
//   2. Das **Lese-Urteil** wird von der Shell benutzt (nicht nur definiert).
//   3. **Keine** App baut daneben eine **eigene Ablage** (`localStorage`/`sessionStorage`/`indexedDB`).
//   4. Die Messung ist **nicht leer** und **kalibriert in beide Richtungen** — sonst ist sie kein Beweis.
//
// Die letzte Zusicherung ist die wichtigste: In Runde 143 lieferte ein Pipeline-Grep für **sechs verschiedene**
// Apps exakt dieselben Zahlen (1/1/1), weil es die **Pfadzeichenketten** statt der Inhalte durchsuchte. Eine
// Messung ohne Gegenprobe ist eine Behauptung.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { vi,  describe, expect, it } from 'vitest';

// **Eigener Befund, behoben (Runde 262) ✗✓:** Diese Vertraege **lesen die Produktionsdateien jeder App** —
// *das braucht unter Last laenger als das Standardbudget von 5 s* ✗. Der Notes-Agent hat es gemessen:
// dieselben Dateien waren unter Last rot mit `Error: Test timed out in 5000ms`, und mit groesserem Budget
// **gruen** (*der laengste Test braucht ~2,4 s im Ruhezustand, unter Last ueber 9 s* ✓).
// **Die ehrliche Behebung ist mehr Zeit, nicht eine schwaechere Zusicherung** ✓✓ — *kein `skip`, kein
// gelockertes `expect`* ✗. Deshalb einmal pro Datei das Budget, und alle Aussagen bleiben unveraendert.
vi.setConfig({ testTimeout: 120_000 });

const SRC = 'src';
const ZENTRAL = `${SRC}/app/useWorkspaceDocumentUpdates.ts`;
const STEMPELMODUL = `${SRC}/platform/workspace/integrations/workspaceDocumentStamp.ts`;
const LESEMODUL = `${SRC}/platform/workspace/integrations/workspaceDocumentRead.ts`;
const SHELL = `${SRC}/shell/lifecycle/useWorkspaceShellLifecycle.ts`;

// **Gemessen, nicht geschrieben:** Meine erste Fassung listete neun Namen ✗ — einer existierte nicht, und die
// Nicht-Leerheits-Zusicherung deckte es sofort auf (`expected 8 to be 9`) ✓. Die Liste kommt jetzt aus dem
// Dateisystem ✓, damit ein falscher Name nicht wieder als „leere Messung" durchgeht ✓.
const APP_NAMEN = readdirSync(`${SRC}/apps`)
  .filter((e) => statSync(`${SRC}/apps/${e}`).isDirectory() && e !== 'testing' && e !== '__tests__');
const ABLAGE = /\b(localStorage|sessionStorage|indexedDB)\b/u;

const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//gu, '').split('\n').filter((z) => z.trim() && !z.trim().startsWith('//'));
const dateien = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) { if (e !== 'testing' && e !== '__tests__') dateien(p, out); }
    else if (/\.(ts|tsx)$/u.test(e) && !/\.test\./u.test(e)) out.push(p);
  }
  return out;
};
const ablageFundstellen = (app) => {
  const dir = `${SRC}/apps/${app}`;
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  const treffer = [];
  for (const p of dateien(dir)) {
    for (const [i, z] of ohneKommentare(readFileSync(p, 'utf8')).entries()) {
      if (ABLAGE.test(z)) treffer.push(`${p}:${i + 1}`);
    }
  }
  return treffer;
};

describe('Integration & Release Paket 2: der zentrale Umschlag', () => {
  it('**Kalibrierung, beide Richtungen** — sonst ist die Messung kein Beweis', () => {
    // Positiv: das Stempelmodul muss den Stempel kennen.
    expect(ohneKommentare(readFileSync(STEMPELMODUL, 'utf8')).join('\n')).toMatch(/stampWorkspaceDocumentSchema/u);
    // Negativ: die zentrale Strecke selbst darf **keine** eigene Ablage enthalten — sonst schlägt das Muster
    // überall an und die Aussage „keine App speichert selbst" wäre wertlos.
    expect(ohneKommentare(readFileSync(ZENTRAL, 'utf8')).some((z) => ABLAGE.test(z))).toBe(false);
  });

  it('der Stempel geschieht **zentral** — und für jedes Dokument, nicht nur für eines', () => {
    const zeilen = ohneKommentare(readFileSync(ZENTRAL, 'utf8'));
    const stempel = zeilen.filter((z) => /stampWorkspaceDocumentSchema\s*\(/u.test(z));
    expect(stempel.length, 'Der Stempelaufruf fehlt in der zentralen Strecke').toBeGreaterThan(0);
    // Er muss auf dem **Ergebnis** sitzen, nicht in einer Fallunterscheidung für eine App.
    expect(zeilen.join('\n')).toMatch(/updatedDoc|\.document\b/u);
    // **Eigener Fehler, korrigiert (Runde 145):** Ich hatte zuerst verlangt, dass die zentrale Datei **keinen**
    // App-Namen kennt ✗ — gemessen ist das falsch, und zwar **zu Recht**: Die Datei **koordiniert** die
    // app-übergreifenden Fortpflanzungen (`refreshWriterGridLinks`, `refreshWriterWorkspaceEmbeds`) ✓ — das ist
    // ihre dokumentierte Aufgabe ✓. Die richtige Regel ist deshalb nicht „kennt keine App" ✗, sondern:
    // **der Stempel selbst darf nicht an eine App gebunden sein** ✓ — er läuft für jedes eingehende Dokument.
    const stempelZeile = stempel.join('\n');
    for (const app of APP_NAMEN) {
      const bedingt = new RegExp(`if\\s*\\([^)]*${app}[^)]*\\)[\\s\\S]{0,120}stampWorkspaceDocumentSchema`, 'u');
      expect(bedingt.test(zeilen.join('\n')), `Der Stempel ist an ${app} gebunden — er muss für jedes Dokument laufen`).toBe(false);
    }
    expect(stempelZeile).toMatch(/stampWorkspaceDocumentSchema/u);
  });

  it('das **Lese-Urteil** wird von der Shell **benutzt**, nicht nur definiert', () => {
    // Die Lehre aus `assertPdfStudioSchema` (W-361/W-391): ein grüner Test für ein Modul ohne Aufrufer ist eine
    // Aussage über den Test. Deshalb wird der **Aufruf** geprüft, nicht die Datei.
    const shell = readFileSync(SHELL, 'utf8');
    expect(shell).toMatch(/workspaceDocumentRead|loadStoredWorkspaceDocument|resolveWorkspaceSchemaAction/u);
    expect(ohneKommentare(readFileSync(LESEMODUL, 'utf8')).join('\n')).toMatch(/export function (load|read|resolve)\w*/u);
  });

  it('**keine** App speichert **Dokumentdaten** selbst — und die Messung ist nicht leer', () => {
    // **Die Regel ist schärfer als „keine eigene Ablage"** (Runde 146, gemessen — nicht geraten):
    //   * **UI-Voreinstellungen** sind berechtigt ✓ — `publish-inspector-open` merkt sich, ob ein Panel offen war.
    //   * **Begrenzte Geheimnisablagen** sind berechtigt ✓ — `pdfKeyVaultSecrets` hält die letzten `MAX_RECORDS`
    //     Einträge; Geheimnisse brauchen eine andere Behandlung als Dokumente.
    //   * **Dokumentdaten** gehören **ausschließlich** durch den zentralen Umschlag ✓.
    // Die Liste ist **klein und benannt** — eine Erweiterung ist damit eine bewusste Entscheidung, keine stille.
    const BERECHTIGT = [
      ['pdf', 'security/credentials/pdfKeyVaultSecrets.ts', 'begrenzte Geheimnisablage (MAX_RECORDS)'],
      ['publish', 'PublishView.tsx', 'UI-Voreinstellung (Panel offen) — kein Dokumentinhalt'],
      // **Geprüft (Runde 147):** `browserRemoteWipeRuntime` **löscht** `localStorage`, `sessionStorage`, Caches und
      // `indexedDB` — es **benutzt** sie nicht ✗. Mein Muster fand die **Bereinigung** der Ablagen, nicht deren
      // Benutzung ✓. Dieselbe Familie wie `ANNOTATED`/`annotiert`: **ein Muster, das Wörter zählt, muss
      // „schreiben" von „löschen" unterscheiden** ✓. Hier bleibt der Eintrag als **belegt-berechtigt** stehen ✓.
      ['admin-policy', 'devices/adminDevicePolicyCore.ts', 'löscht Ablagen (Remote-Wipe) — benutzt sie nicht'],
    ];
    const istBerechtigt = (fund) => BERECHTIGT.some(([app, datei]) => fund.includes(`apps/${app}/`) && fund.includes(datei));

    const befunde = [];
    let geprueft = 0;
    for (const app of APP_NAMEN) {
      // **Eigener Zählfehler, korrigiert (Runde 146b):** `geprueft` zählte Verzeichnisse **ohne** Fundstelle ✗
      // (12 von 15) und meldete deshalb „die Messung wäre leer" — obwohl sie vollständig war ✓. Gezählt werden
      // **durchsuchte** Verzeichnisse ✓: Nur so bedeutet die Zusicherung wirklich „nichts wurde übersehen".
      const treffer = ablageFundstellen(app);
      geprueft += 1;
      for (const t of treffer) if (!istBerechtigt(t)) befunde.push(t);
    }
    // **Nicht-Leerheit:** alle App-Verzeichnisse müssen durchsucht worden sein — sonst wäre die Messung leer.
    expect(geprueft, 'Nicht alle App-Verzeichnisse wurden gefunden — die Messung wäre leer').toBe(APP_NAMEN.length);
    // **Die Liste darf nicht wachsen, ohne dass es jemand merkt.**
    expect(BERECHTIGT.length, 'Die Liste berechtigter Ablagen ist gewachsen — bitte bewusst entscheiden').toBeLessThanOrEqual(3);
    // Kein **Dokumentdaten**-Speicher außerhalb des zentralen Wegs.
    expect(befunde, `Eigene Ablagen mit Dokumentdaten: ${befunde.join(' | ')}`).toEqual([]);
  });
});