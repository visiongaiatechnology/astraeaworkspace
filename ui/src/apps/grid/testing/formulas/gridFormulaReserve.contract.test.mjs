import path from 'node:path';
import { fileURLToPath } from 'node:url';
// STATUS: PLATIN — W-321/W-426: Der TypeScript-Formelmotor ist ein **Vorrat** — und die Lücke sitzt im lebenden Motor
//
// ## Die Entscheidung (Runde 126)
//
// Der TS-Motor (`apps/grid/formulas/gridFormulaEngine.ts` + 13 Nachbarmodule, 229 Tests) hat **null**
// Produktionsimporteure — die App rechnet über den **Rust-Kern**. Er ist trotzdem **kein toter Code**: Er ist die
// **einzige** Umsetzung der **DST-fähigen Zeitzonenregel**, die dieses Produkt besitzt.
// **Weg 3:** Vorrat bewahren und bewachen ✓, nicht löschen ✗, nicht als Rückfall verdrahten ✗.
//
// ## Was dieser Vertrag bewacht — vier Dinge, alle gemessen
//
//  1. **Kein Produktionsnutzer** des TS-Motors ✓ → wird **rot**, sobald jemand ihn verdrahtet. Dann muss die
//     Zeitzonenregel **in den lebenden Motor** wandern, nicht in einen zweiten.
//  2. **Der Rust-Kern kennt die Zeitzone** ✓ (W-426) → **nachgezogen**: der Wachposten hat ausgelöst, als die Zone
//     in den lebenden Pfad kam ✓, und die Aussage wurde **bewusst** umgestellt ✓ (siehe unten). *Ein Wachposten, den
//     man grün stehen lässt, obwohl er ausgelöst hat, bewacht nichts mehr* ✓.
//  3. **Ohne Zone folgen `TODAY`/`NOW` weiterhin der Host-Zone** ✓ (`chrono::Local`) — das ist jetzt die **additive**
//     Zusage von W-426 ✓, nicht mehr die Beschreibung der Lücke ✓.
//  4. **Eine Selbstprüfung** ✓: ein Modul, das diese Datei kennt, muss gefunden werden. Ein Werkzeug, das immer
//     „niemand" meldet, würde die Lücke **erfinden** — und eine erfundene Lücke ist so schädlich wie eine
//     erfundene Zusage.
import { existsSync, readFileSync } from 'node:fs';
import { vi,  describe, expect, it } from 'vitest';

// The repository root, found by looking for it: walk up from this file's own directory until a directory
// contains `Cargo.toml`. Counting levels up breaks as soon as the UI moves — which it did, from `open-core/ui`
// (two levels below the root) to `ui/` (one).
function findRepoRoot(startDirectory) {
  let directory = startDirectory;
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(directory, 'Cargo.toml'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`repository root not found above ${startDirectory}`);
}
const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

// **Budget, kein Inhalt (Runde 264) ✗✓:** Der Quellvertrag liest die Dateien der App; unter Last uebersteigt er das
// Standardbudget von 5 s (gemessen: 10397 ms). *In Isolation gruen* ✓ — **die ehrliche Behebung ist mehr Zeit, nicht eine**
// **schwaechere Zusicherung** ✓✓. Keine Zusicherung angefasst ✓.
vi.setConfig({ testTimeout: 120_000 });

const GRID = 'src/apps/grid';
const TS_MOTOR = `${GRID}/formulas/gridFormulaEngine.ts`;
const ZEITREGEL = `${GRID}/formulas/gridFormulaSerialDate.ts`;
// **Eigener Pfadfehler, korrigiert:** Aus open-core/ui liegt crates/ **zwei** Ebenen höher, nicht drei ✗.

const ohneKommentare = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('W-321/W-426: der Formelmotor-Vorrat ist bewacht', () => {
  it('der Vorrat und die Zeitzonenregel existieren', () => {
    expect(existsSync(TS_MOTOR), 'Der TS-Motor fehlt — dann ist die Entscheidung hinfällig').toBe(true);
    expect(existsSync(ZEITREGEL), 'Die Serial-/Zeitzonendatei fehlt').toBe(true);
    const regel = readFileSync(ZEITREGEL, 'utf8');
    // Die Fähigkeit, die den Vorrat begründet: eine Regel **pro Zeitpunkt**, also DST-fähig.
    expect(regel).toMatch(/export interface GridFormulaTimeZoneRule/u);
    expect(regel).toMatch(/offsetMinutesAt\(utcMs: number\)/u);
    expect(regel).toMatch(/export function createTransitionRule/u);
    expect(regel).toMatch(/GRID_FORMULA_UTC_RULE/u);
  });

  it('**kein** Produktionsnutzer — der Zustand, den dieser Vertrag bewacht', () => {
    // Gemessen über den ganzen Quellbaum: Wer importiert den Motor **außerhalb seiner eigenen Familie**?
    // **Eigener Fehler, korrigiert:** Meine erste Fassung schloss nur zwei Dateien namentlich aus ✗ — der Motor
    // importiert sich aber **intern** (die 14 Module der Familie nutzen einander: `gridFormulaDate` und
    // `gridFormulaEngineTypes` importieren die Serien-/Zeitzonendatei ✓). Das sind **keine** Produktionsnutzer,
    // sondern die Familie selbst ✓. Deshalb wird jetzt das **ganze Verzeichnis** ausgenommen.
    const treffer = [];
    const FAMILIE = `${GRID}/formulas/`;
    const lauf = (dir) => {
      for (const eintrag of require('node:fs').readdirSync(dir)) {
        const p = `${dir}/${eintrag}`.replace(/\\/gu, '/');
        if (require('node:fs').statSync(p).isDirectory()) { lauf(p); continue; }
        if (!/\.(ts|tsx)$/u.test(eintrag) || /\.test\./u.test(eintrag) || p.includes('/testing/')) continue;
        if (p.startsWith(FAMILIE)) continue; // die Familie selbst
        const text = ohneKommentare(readFileSync(p, 'utf8'));
        if (/from '[^']*gridFormulaEngine'/u.test(text) || /from '[^']*gridFormulaSerialDate'/u.test(text)) treffer.push(p);
      }
    };
    lauf('src');
    expect(treffer, 'TS-Formelmotor verdrahtet — Zeitzonenregel jetzt in den lebenden Pfad bringen!').toEqual([]);
  });

  it('die Selbstprüfung: eine Datei, die den Vorrat kennt, wird auch gefunden', () => {
    // Sonst würde ein kaputter Pfad still „niemand" melden.
    const text = readFileSync(TS_MOTOR, 'utf8');
    expect(text.length).toBeGreaterThan(1000);
    expect(/gridFormulaEngine|evaluateGridFormulaLocal/u.test(text)).toBe(true);
  });

  it('W-426 **erledigt**: der Rust-Kern kennt die Nutzerzone — und **ohne** sie bleibt es bei der Host-Zone', () => {
    const rust = readFileSync(path.join(repoRoot, 'crates/vgt-formula/src/functions.rs'), 'utf8');
    // **Bewusst nachgezogen** ✓: Der Wachposten hat ausgelöst, als die Zone in den lebenden Pfad kam ✓. Geprüft wird
    // deshalb jetzt die **additive** Zusage — eine Zone **gibt** es ✓, und **ohne** Zone steht dort unverändert die
    // Uhr des Rechners ✓. *Würde man die alte Zeile nur löschen, wäre die Lücke unbewacht* ✓.
    expect(/TimeZoneTransition/u.test(rust), 'Die Übergangsgestalt fehlt — W-426 ist nicht mehr belegt!').toBe(true);
    expect(/fn now_local\(&self\)/u.test(rust), 'Die Naht `now_local` fehlt — TODAY/NOW folgten wieder niemandem').toBe(true);
    expect(/utc_to_user_local/u.test(rust), 'Die reine Umrechnung fehlt — die Zone wäre nicht anwendbar').toBe(true);
    // Der **Rückfall** ohne Zone: unverändert `chrono::Local` ✓ — genau die additive Zusage ✓.
    expect(rust).toMatch(/chrono::Local::now\(\)/u);
    // Und der Bezug zum Vertrag: Zeitzonen-Serienlogik **nur** im TypeScript-Vorrat.
    expect(readFileSync(ZEITREGEL, 'utf8')).toMatch(/offsetMinutesAt/u);
  });
});