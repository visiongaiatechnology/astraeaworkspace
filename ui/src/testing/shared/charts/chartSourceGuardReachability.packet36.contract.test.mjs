// STATUS: DIAMANT VGT SUPREME
// Paket 36 — Quellvertrag: **wer ruft den Diagramm-Quellwächter auf?**
//
// Akzeptanz von Paket 36 verlangt, dass ein Objekt nach entzogener Berechtigung fail-closed **verborgen**
// wird. Die Ableitung (`resolveChartSourceState`) und die benannte Prüfung (`validateLiveChartSource`) sind
// vorhanden und einzeln belegt — dieser Vertrag misst die **Erreichbarkeit**: eine Fähigkeit ohne Aufrufer
// ist nicht geliefert.
//
// **VORHER gemessen (Positivkontrolle im selben Instrument):** `validateLiveChartSource` und
// `resolveChartSourceState` hatten **0 Produktionsaufrufer** in ganz `open-core/ui/src`; die Positivkontrolle
// fand `normalizeCanonicalChart` im Renderer, die Nullmessung war also belastbar. Der Renderer kannte den
// Zustand `permission-lost` nicht einmal.
//
// **NACHHER (hier geprüft):** `validateLiveChartSource` wird im Render- und Ausfuhrpfad wirklich befragt —
// über zwei benannte Wächter im selben Modul (`chartSourceLock`, `assertChartSourceRenderable`), die
// ihrerseits aus `ChartRenderer.tsx`, `chooseChartExport` und `chartVectorPdf.ts` gerufen werden.
// `resolveChartSourceState` bleibt **ohne** Produktionsaufrufer: die Ableitung braucht den App-Aufrufer,
// der die Berechtigung entzieht — der gehört den App-Zonen und wird **gemeldet**, nicht hier erfunden.
//
// Absichtlich `.mjs`: TypeScript-Testdateien haben in diesem Projekt keine Node-Typdeklarationen.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';


// This file walks the source tree with readdirSync. Measured isolated: the three files together finish in
// 1.8 s. Under a full 832-file parallel run the same work exceeded the 5 s default and failed with
// "Test timed out in 5000ms" — the test was measuring machine load, not correctness. The scan is the
// assertion, so it gets a window that does not depend on contention.
vi.setConfig({ testTimeout: 60_000 });

const projectRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const read = (relative) => readFileSync(path.join(projectRoot, relative), 'utf8').replace(/\r\n/gu, '\n');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/[^\n]*/gu, '$1');

const SRC = path.join(projectRoot, 'src');
const toRelative = (file) => path.relative(projectRoot, file).replace(/\\/gu, '/');
const isTestFile = (file) => /\.(test|spec)\.(ts|tsx|mjs)$/u.test(file);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(ts|tsx|mjs)$/u.test(entry.name) ? [full] : [];
});

const ENGINE = 'src/shared/charts/chartEngine.ts';
const RENDERER = 'src/shared/charts/ChartRenderer.tsx';
const MODEL = 'src/shared/charts/chartModel.ts';
const PDF_ADAPTER = 'src/shared/charts/export/chartVectorPdf.ts';

/** Produktionsdateien, die den Namen als **Aufruf** (nicht als Definition) führen. */
const productionCallersOf = (name) => walk(SRC)
  .filter((file) => !isTestFile(toRelative(file)))
  .filter((file) => toRelative(file) !== ENGINE)
  .filter((file) => new RegExp(`(?:^|[^\\w.])${name}\\s*\\(`, 'mu').test(stripComments(readFileSync(file, 'utf8'))))
  .map(toRelative);

describe('Paket 36 — Quellvertrag: der Wächter ist vorhanden', () => {
  it('beide Funktionen stehen im gemeinsamen Diagrammmodul — eine Vokabel, keine zweite Liste', () => {
    const engine = stripComments(read(ENGINE));

    expect(engine).toMatch(/export function validateLiveChartSource\(chart:ChartObject\):void/u);
    expect(engine).toMatch(/export function resolveChartSourceState\(chart:ChartObject, resolution:ChartSourceResolution\):ChartObject/u);
    // Die Zustandsliste steht genau einmal und wird nicht hier nachgebaut.
    expect(engine).not.toMatch(/SOURCE_STATES/u);
    expect(stripComments(read(MODEL))).toMatch(/const SOURCE_STATES: ReadonlySet<ChartSourceState> = new Set\(\['current','stale','broken','permission-lost','frozen'\]\)/u);
  });

  it('der Wächter greift nur für lebendige Quellen — die Reichweite ist offengelegt, nicht angenommen', () => {
    const engine = stripComments(read(ENGINE));
    const body = engine.slice(engine.indexOf('export function validateLiveChartSource'));

    expect(body).toMatch(/if \(!normalized\.source \|\| !normalized\.source\.live\) return;/u);
  });

  it('die Auswahl, die zurückhält, ist eine **Teilmenge** der einen Vokabel — mit Schranke, nicht mit Zusage', () => {
    const model = stripComments(read(MODEL));

    expect(model).toMatch(/const WITHHOLDING_SOURCE_STATES: ReadonlySet<ChartSourceState> = new Set\(\['permission-lost','broken'\]\)/u);
    // Und die Schranke, die eine zweite Vokabel beim Laden unmöglich macht.
    expect(model).toMatch(/throw new ChartModelError\('chart_source_vocabulary_drift'\)/u);
    // Der Renderer baut die Liste nicht nach.
    expect(stripComments(read(RENDERER))).not.toMatch(/SOURCE_STATES/u);
  });
});

describe('Paket 36 — Quellvertrag: BEFUND (gemessen), wer den Wächter aufruft', () => {
  it('Gegenprobe am Instrument: die Suche findet einen bekannten Produktionsaufrufer', () => {
    // Ohne diesen Satz wäre „keine Aufrufer" auch dann grün, wenn der Durchlauf gar nichts liest — eine
    // Nullmessung. `normalizeCanonicalChart` wird nachweislich vom Renderer importiert und aufgerufen.
    const known = productionCallersOf('normalizeCanonicalChart');

    expect(known.length).toBeGreaterThan(0);
    expect(known).toContain('src/shared/charts/ChartRenderer.tsx');
  });

  it('AUSGELIEFERT: der Wächter wird im Modul von den zwei benannten Wächtern befragt', () => {
    const engine = stripComments(read(ENGINE));

    // Die beiden Namen, die den Wurf einfangen bzw. weiterreichen — und `chartSourceLock` **unbedingt** ruft.
    expect(engine).toMatch(/export function chartSourceLock\(chart:ChartObject\):ChartSourceLock/u);
    expect(engine).toMatch(/export function assertChartSourceRenderable\(chart:ChartObject\):void/u);
    expect(engine).toMatch(/validateLiveChartSource\(normalized\)/u);
  });

  it('AUSGELIEFERT: und diese Wächter haben Produktionsaufrufer außerhalb des Moduls', () => {
    // Der Pfad, der vorher fehlte: ein Diagramm wird **gezeichnet** oder **ausgeführt**.
    expect(productionCallersOf('chartSourceLock')).toContain(RENDERER);
    expect(productionCallersOf('assertChartSourceRenderable')).toEqual(
      expect.arrayContaining([PDF_ADAPTER]),
    );
  });

  it('OFFEN (gemeldet, nicht hier erfunden): kein Produktionsaufrufer für `resolveChartSourceState`', () => {
    // Die **Ableitung** (`permission: 'denied'` → `permission-lost`) braucht den App-Aufrufer, der die
    // Berechtigung wirklich entzieht (Grid/Insight/Present/Writer). Der gehört den App-Zonen. Wird er
    // verdrahtet, wird dieser Befund rot und erzwingt ein Nachlesen — genau die Aufgabe eines Befund-Gatters.
    expect(productionCallersOf('resolveChartSourceState')).toEqual([]);
  });

  it('AUSGELIEFERT: der Renderer kennt den Sperrzustand und verbirgt statt zu beschriften', () => {
    const renderer = stripComments(read(RENDERER));

    // Er holt das Urteil beim benannten Wächter …
    expect(renderer).toMatch(/const lock = useMemo\(\(\) => chartSourceLock\(normalized\), \[normalized\]\);/u);
    // … und hat für den Rückhalt eine eigene Verzweigung, die **vor** jedem Datenpfad greift.
    expect(renderer).toMatch(/if \(lock\.withheld\) \{/u);
    expect(renderer).toMatch(/lock\.withheld \? '' : gridChartSvgDataUrl\(normalized, 900, 520\)/u);
    expect(renderer).toMatch(/lock\.withheld \? \[\] : buildChartAccessibleTable\(normalized\)/u);
    expect(renderer).toMatch(/lock\.withheld \? '' : buildChartAccessibleSummary\(normalized\)/u);
    // Der Zustand ist am Markup erkennbar — nicht bloß ein Etikett über einem gezeichneten Diagramm.
    expect(renderer).toMatch(/data-chart-source-lock=\{lock\.state\}/u);
    // Und die Aussage nennt Grund und Handlung, nicht nur eine Farbe.
    expect(renderer).toMatch(/Handlung: \{notice\.action\}/u);
  });
});
