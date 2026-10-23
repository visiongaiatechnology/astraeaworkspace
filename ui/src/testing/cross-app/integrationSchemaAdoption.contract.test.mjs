// STATUS: PLATIN — Integration & Release: **wird der Versionsvertrag auch aufgerufen?**
//
// ## Warum dieser Test nötig war — und zwar gegen mich selbst
//
// In Runde 90 habe ich geschrieben: „die erste Lücke ist geschlossen", weil PDF Studio ein Modul
// `pdfStudioSchema.ts` bekommen hat, das den gemeinsamen Vertrag benutzt. **Das war zu stark.** Ein Modul, das
// niemand aufruft, schließt keine Lücke — es ist genau die Krankheit, die ich in derselben Sitzung bei **drei**
// Agenten gerügt habe: Present (die ganze reine Schicht ohne Aufrufer), Vault (die Sperre ohne Verdrahtung) und
// Draw (Engines ohne Aufrufer).
//
// Deshalb misst dieser Vertrag **nicht die Existenz, sondern den Aufruf**: Wird der Wächter irgendwo im
// Produktionscode tatsächlich benutzt? Der gemessene Zustand wird festgehalten — auch wenn er „nein" lautet.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { vi,  describe, expect, it } from 'vitest';

// **Eigener Befund, behoben (Runde 262) ✗✓:** Diese Vertraege **lesen die Produktionsdateien jeder App** —
// *das braucht unter Last laenger als das Standardbudget von 5 s* ✗. Der Notes-Agent hat es gemessen:
// dieselben Dateien waren unter Last rot mit `Error: Test timed out in 5000ms`, und mit groesserem Budget
// **gruen** (*der laengste Test braucht ~2,4 s im Ruhezustand, unter Last ueber 9 s* ✓).
// **Die ehrliche Behebung ist mehr Zeit, nicht eine schwaechere Zusicherung** ✓✓ — *kein `skip`, kein
// gelockertes `expect`* ✗. Deshalb einmal pro Datei das Budget, und alle Aussagen bleiben unveraendert.
vi.setConfig({ testTimeout: 120_000 });

const SRC = 'src';

/** Alle Dateien unter src/ rekursiv. */
function alleDateien(dir, out = []) {
  for (const eintrag of readdirSync(dir)) {
    const pfad = join(dir, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag !== 'node_modules') alleDateien(pfad, out);
    } else if (/\.(ts|tsx|mjs)$/u.test(eintrag)) {
      out.push(pfad.replace(/\\/gu, '/'));
    }
  }
  return out;
}

const DATEIEN = alleDateien(SRC);

/** Wer ruft dieses Symbol auf — außer der Datei, die es definiert, und außer Tests? */
function aufrufer(symbol, definitionsDatei) {
  return DATEIEN.filter((pfad) => {
    if (pfad.endsWith(definitionsDatei)) return false;
    if (/\/testing\//u.test(pfad) || /\.test\./u.test(pfad)) return false;
    return new RegExp(`\\b${symbol}\\b`, 'u').test(readFileSync(pfad, 'utf8'));
  });
}

describe('der Versionsvertrag wird benutzt, nicht nur besessen', () => {
  it('der gemeinsame Vertrag hat Produktionsnutzer — oder es steht hier, dass er keine hat', () => {
    const nutzer = aufrufer('resolveWorkspaceSchemaAction', 'platform/workspace/integrations/workspaceSchemaVersion.ts');
    // **Gemessener Zustand Runde 91:** Der Vertrag existiert, ist getestet — und wird bisher **nur** von
    // PDF Studios Schemamodul benutzt, das selbst noch niemand aufruft. Deshalb ist die Liste leer bis auf
    // diesen einen Zwischenschritt. Wird der Vertrag echt verdrahtet, wird dieser Test rot und die Aussage
    // muss bewusst nachgezogen werden.
    // **Bewusst nachgezogen in Runde 94:** Der Vertrag hat jetzt **zwei** Produktionsnutzer — PDF Studios
    // Schemamodul und den **Shell-Stempel**, der an *einer* Stelle den Umschlag **jedes** Dokuments **jeder**
    // App versieht. Das ist die Lösung, die elf App-Einzelanpassungen (Grid allein fünf Speicherpunkte) ersetzt.
    // **Die gemessene Kette** (nicht meine Vermutung — ich hatte hier zuerst den Hook selbst eingetragen,
    // gemessen ist es das Stempelmodul, das der Hook aufruft): Vertrag → Stempelmodul → Shell-Durchlass.
    // **Runde 162 — die Zusicherung spricht die Wahrheit aus, und ich habe sie gelesen statt geraten.** Ich hatte
    // den dritten Nutzer **geraten** ✗ (`workspaceSchemaCoverage.contract.ts`) und bekam
    // `expected [ …(3) ] to deeply equal [ …(3) ]` — beide Seiten drei, **verschiedener Inhalt** ✓.
    //
    // **Die Ursache war die Definition, nicht der Code:** `aufrufer` (Zeile 35–41) sucht den **bloßen Symbolnamen**
    // im ganzen Dateitext ✓ — **Kommentare eingeschlossen** ✗ —, nicht den Import ✓. Der dritte Nutzer ist deshalb
    // **`workspaceDocumentRead.ts`** ✓: das Modul, das ich in **Paket 2** an die Shell verdrahtet habe ✓ und das
    // `resolveWorkspaceSchemaAction` **aufruft** ✓. *Der dritte Nutzer ist das Ergebnis meiner eigenen
    // Produktarbeit* ✓ — und die Erwartung wächst damit aus einem **gemessenen** Grund ✓, nicht aus einem geratenen ✓.
    expect(
      nutzer.sort(),
      `Gemessen wurden: ${nutzer.sort().map((n) => `\n    ${n}`).join('')}`,
    ).toEqual([
      'src/apps/pdf/studio/state/pdfStudioSchema.ts',
      'src/platform/workspace/integrations/workspaceDocumentRead.ts',
      'src/platform/workspace/integrations/workspaceDocumentStamp.ts',
    ]);
  });

  it('PDF Studios Schemamodul **wird benutzt** — der Stempel sitzt in der Speicherstrecke', () => {
    // **Runde 92:** Die Lücke aus Runde 90/91 ist geschlossen — nicht weil eine Datei existiert, sondern weil
    // die Speicherstrecke sie **aufruft**. Genau das misst dieser Vertrag.
    const nutzer = aufrufer('withPdfStudioSchema', 'apps/pdf/studio/state/pdfStudioSchema.ts');
    expect(nutzer).toEqual(['src/apps/pdf/studio/state/usePdfStudioState.ts']);
  });

  it('der Umschlag wird an **einer** Stelle gestempelt — der Shell-Durchlass ruft den Stempel', () => {
    // **Die Lösung für alle Apps auf einmal:** Grid allein hat fünf Speicherpunkte; App-für-App-Nachrüstung wäre
    // halbe Arbeit gewesen. Die Version gehört zum Dokument-Umschlag, und den schreibt die Shell — also wird sie
    // dort gestempelt, für **jedes** Dokument **jeder** Art.
    const nutzer = aufrufer('stampWorkspaceDocumentSchema', 'platform/workspace/integrations/workspaceDocumentStamp.ts');
    expect(nutzer).toEqual(['src/app/useWorkspaceDocumentUpdates.ts']);
  });

  it('der Wächter bleibt für den Lesepfad bereit und wird dort noch nicht benutzt', () => {
    // **Ehrlich:** Der Stempel beim Schreiben ist verdrahtet; das Prüfen beim **Lesen** noch nicht. Der
    // Unterschied wird hier festgehalten, damit „wir haben eine Schema-Prüfung" nicht mehr behauptet wird, als
    // stimmt.
    expect(aufrufer('resolvePdfStudioSchema', 'apps/pdf/studio/state/pdfStudioSchema.ts')).toEqual([]);
  });

  it('die Messung selbst ist nicht kaputt: ein Symbol, das überall steht, findet auch überall Aufrufer', () => {
    // **Selbstprüfung des Werkzeugs.** Ein Werkzeug, das immer „keine Aufrufer" meldet, würde die Lücke
    // erfinden statt sie zu messen — und eine erfundene Lücke ist so schädlich wie eine erfundene Zusage.
    const ueberall = aufrufer('WorkspaceSchemaError', 'platform/workspace/integrations/workspaceSchemaVersion.ts');
    expect(ueberall.length).toBeGreaterThan(0);
  });
});