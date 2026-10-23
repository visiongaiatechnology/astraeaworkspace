// STATUS: PLATIN — Wächter: die Tabellenerstellung prüft vor, mit begrenztem, benanntem Grund (W-313)
//
// `data/gridStructuredTableModel.ts` war implementiert und getestet — und von keiner Produktionsdatei
// importiert. Der lebende Pfad prüfte die Zellgrenze **selbst** (zweite Definition derselben Zahl), nannte sie
// aber **nicht**, hatte **keine** Zeilengrenze und **keine** Kopfzeilen-Prüfung.
//
// Zwei Zusicherungen, die den Unterschied machen:
//   1. Vor der Erstellung wird geprüft, und der Grund wird **mit Zahl** gemeldet.
//   2. Die Kopfzeilen-Anforderung gilt **nur**, wenn der Aufrufer eine Kopfzeile verlangt — sonst würde eine
//      gültige einzeilige Tabelle ohne Kopfzeile abgelehnt. Diese Feinheit ist der Grund, warum hier ein
//      Wächter steht und nicht nur ein Test des Moduls.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const datei = 'src/apps/grid/workbook/actions/useGridSheetDataActions.ts';
const quelle = readFileSync(datei, 'utf8');
const rumpf = (() => {
  const start = quelle.indexOf('const handleTableCreate = useCallback(');
  if (start < 0) return '';
  const rest = quelle.slice(start);
  const ende = rest.indexOf('const handleTableRename');
  return ende < 0 ? rest : rest.slice(0, ende);
})();

describe('die Tabellenerstellung prüft mit dem begrenzten Modell vor', () => {
  it('findet die Erstellfunktion', () => {
    expect(rumpf.length).toBeGreaterThan(200);
  });

  it('nutzt die Vorprüfung und meldet den Grund mit Zahl', () => {
    expect(quelle).toMatch(/import \{ validateTableRange \} from '\.\.\/\.\.\/data\/gridStructuredTableModel'/u);
    expect(rumpf).toContain('validateTableRange(options.range)');
    // Der Befund trägt `detail` mit den konkreten Zahlen (z. B. `60000 > 50000`).
    expect(rumpf, 'Grund ohne Zahl gemeldet').toMatch(/issue\.detail/u);
  });

  it('stellt die Kopfzeilen-Anforderung nur, wenn eine Kopfzeile verlangt ist', () => {
    // Ohne diese Bedingung würde eine gültige einzeilige Tabelle ohne Kopfzeile abgelehnt.
    expect(rumpf).toMatch(/issue\.code !== 'table_has_no_header_row' \|\| options\.hasHeaders/u);
  });

  it('lehnt ab, statt still zu erstellen', () => {
    expect(rumpf).toMatch(/if \(vorab\.length > 0\) \{/u);
    expect(rumpf).toContain('args.setValidationError(');
    // Der Rückweg muss **vor** der Erstellung liegen.
    const vorpruefung = rumpf.indexOf('const vorab =');
    const erstellung = rumpf.indexOf('createStructuredTable(');
    expect(vorpruefung).toBeGreaterThan(-1);
    expect(erstellung).toBeGreaterThan(vorpruefung);
  });

  it('behält die Prüfungen der Erstellfunktion als zweite Linie', () => {
    // Die Verteidigung in der Tiefe darf nicht durch die Vorprüfung ersetzt worden sein.
    const tabelle = readFileSync('src/apps/grid/tables/gridStructuredTables.ts', 'utf8');
    expect(tabelle).toContain('MAX_TABLE_CELLS');
    expect(tabelle).toMatch(/cellCount > MAX_TABLE_CELLS/u);
  });
});
