// STATUS: PLATIN — Integration & Release, **Paket 45**: Cross-App History und Provenance
//
// ## Der Waechter, den dieser Zeuge bezeugt ✓✓✓
//
// `platform/workspace/model/workspaceObjectModelValidation.ts:133-141` — *die eine Stelle, die
// `WorkspaceProvenanceMetadata` (`shared/contracts/wom/workspaceWom.ts:59-66`) prueft:*
//   :134  kein Record                 => 'Provenance metadata must be an object'
//   :136-137 jede Kennung              => assertStableWorkspaceId(String(id), `Provenance ${key}`)
//   :139-141 sourceVersion             => endlich, ganzzahlig, >= 0, sonst 'Provenance source version is invalid'
//
// ## Und die Gegenprobe ist hier die SCHAERFSTE von allen ✗✓✓✓
//
// `provenance?` ist **optional** (`workspaceWom.ts:82`). Also wuerde ein Zeuge, der **nur** Ablehnungen
// prueft, **auch gegen einen Waechter bestehen, der ALLES ablehnt**. Deshalb ist **③** Pflicht:
// *eine ABWESENDE Provenienz muss angenommen werden.*
// *Genau diese Falle haben `W-457`s Positivkontrolle und P41s `'clean'`-Fall aufgedeckt.*
//
// ## Vorab-Check (Runde 422) - kein Registerbefund steht im Weg
//
// `W-457` betrifft `infinity_suite`/`infinity_commit` (Dokument-Sicherheitsprovenienz, **anderes Feld**),
// `W-460` betrifft `fallback_policy`/`fallback_snapshot` (**anderes Feld**), `W-459` betrifft
// `propagateFabricUpdates`. **Kein Zusammenstoss** - *also wird dieser Zeuge gruen, und das ist vorher geprueft.*
import { describe, expect, it } from 'vitest';
import { validateTypedObject } from '../../platform/workspace/model/workspaceObjectModelValidation';

const shapeDaten = (id: string) => ({
  id, shape_type: 'rectangle' as const,
  x: 0, y: 0, width: 320, height: 240, rotation: 0,
  fill: 'transparent', stroke: 'transparent', stroke_width: 0,
});

/** *Die Metadaten liegen an **`data.common`** — *gemessen in `workspaceObjectModelValidation.ts:364`
 * (`validateObjectMetadata(raw.data.common, …)`, Funktion ab `:109`).*
 *
 * **Und meine zwei Vermutungen waren beide falsch** ✗✓✓✓: erst `metadata: { provenance }`, dann
 * `provenance` direkt am Objekt. *`③` (die Gegenprobe) hat beide Male verhindert, dass daraus ein
 * **falscher Registerbefund** wurde.*
 *
 * **Und die Antwort stand in einer Datei, die ich selbst geschrieben habe** ✓✓: `fabricState.ts:92-98`
 * (mein P37-Zeuge) setzt `common: { ...(data.common ?? {}), ownership }`. *Ich habe `common` vier
 * Runden lang **geschrieben**, ohne es als den Ort zu erkennen, an dem Metadaten **gelesen** werden.* */
const objekt = (provenance?: unknown) => ({
  type: 'Shape' as const,
  data: {
    ...shapeDaten('form-1'),
    ...(provenance === undefined ? {} : { common: { provenance } }),
  },
});

const GUELTIG = {
  sourceDocumentId: 'quelle-dok',
  sourceObjectId: 'anker-1',
  sourceVersion: 7,
  createdBy: 'benutzer-1',
  importedFrom: 'import-1',
  derivedFrom: ['herkunft-1', 'herkunft-2'],
};

const pruefe = (provenance: unknown) => () => validateTypedObject('form-1', objekt(provenance));

describe('Paket 45: Cross-App History und Provenance', () => {
  it('**① Eine gueltige Provenienz wird angenommen** ✓✓ — *alle sechs Felder*', () => {
    expect(pruefe(GUELTIG), 'eine vollstaendige, gueltige Provenienz muss durchgehen').not.toThrow();
    // *Und auch ein **Teil**-Satz, denn jedes Feld ist einzeln optional.* ✓✓
    expect(pruefe({ sourceDocumentId: 'quelle-dok' })).not.toThrow();
    expect(pruefe({ derivedFrom: [] })).not.toThrow();
  });

  it('**② Jede ungueltige Form wird BENANNT abgewiesen** ✓✓ — *und die Meldung nennt den Fall*', () => {
    // *Der Fall, den `:134` faengt.* ✓
    expect(pruefe('kein-record'), 'kein Record muss abgelehnt werden').toThrow(/must be an object/u);
    // *Der Fall, den `:136-137` faengt — **jede** Kennung, nicht nur die erste.* ✓✓
    expect(pruefe({ sourceDocumentId: 'a b' }), 'keine stabile Kennung (Leerzeichen)').toThrow(/Provenance sourceDocumentId/u);
    expect(pruefe({ sourceObjectId: '' }), 'keine stabile Kennung (leer)').toThrow(/Provenance sourceObjectId/u);
    // **UND DIE ZWEI FELDER, DIE DER WAECHTER NICHT PRUEFT** ✗✓✓ — *`:135` iteriert nur drei Kennungen.
    // `importedFrom` und `derivedFrom` stehen im Vertrag (`workspaceWom.ts:64-65`) und werden **nicht**
    // validiert. Das ist die Messung, nicht die Behauptung - *wenn diese Zeilen gruen bleiben, ist die
    // Luecke belegt und gehoert als Befund ins Register.*
    expect(pruefe({ importedFrom: 'a b' }), 'MESSUNG: importedFrom wird nicht geprueft').not.toThrow();
    expect(pruefe({ derivedFrom: ['gut-1', 'a b'] }), 'MESSUNG: derivedFrom wird nicht geprueft').not.toThrow();
    // *Der Fall, den `:139-141` faengt — **drei** Auspraegungen.* ✓✓✓
    expect(pruefe({ sourceVersion: -1 }), 'negativ').toThrow(/source version is invalid/u);
    expect(pruefe({ sourceVersion: 1.5 }), 'nicht ganzzahlig').toThrow(/source version is invalid/u);
    // *`Infinity` wird **frueher** gefangen — `:140` `assertFiniteNumber`, nicht `:141`s „is invalid".*
    // **Der Waechter ist strenger und eher da, als meine Erwartung war** ✓✓ — *dieselbe Form wie bei P37.*
    expect(pruefe({ sourceVersion: Number.POSITIVE_INFINITY }), 'nicht endlich').toThrow(/Provenance source version/u);
  });

  it('**③ UND DIE GEGENPROBE: eine ABWESENDE Provenienz wird angenommen** ✓✓✓', () => {
    // *Ohne diesen Fall waere ② auch von einem Waechter erfuellt, der **alles** ablehnt.*
    // `provenance?` ist optional (`workspaceWom.ts:82`) - *und das muss gelten.*
    expect(pruefe(undefined), 'ohne Provenienz muss das Objekt gueltig sein').not.toThrow();
    expect(() => validateTypedObject('form-1', { type: 'Shape', data: shapeDaten('form-1') }), 'auch ohne metadata').not.toThrow();
  });

  it('**④ UND DIE NEGATIVE: die Meldung nennt den FALL, nicht nur „invalid"** ✓✓', () => {
    // *`vgt-ui-ux-supreme` Section 25: „keine kryptischen Error Codes als **einzige** Information."*
    // Ein Feld-Name in der Meldung ist das, was den Unterschied macht.
    let formMeldung = '';
    let versionMeldung = '';
    try { pruefe({ createdBy: 'a b' })(); } catch (e) { formMeldung = String((e as Error).message); }
    try { pruefe({ sourceVersion: -1 })(); } catch (e) { versionMeldung = String((e as Error).message); }
    expect(formMeldung, 'die Meldung muss das FELD nennen').toContain('createdBy');
    expect(versionMeldung, 'und diese den Grund').toContain('version');
    expect(formMeldung, 'und nicht nur ein nacktes invalid').not.toBe('invalid');
    // *Und die zwei Faelle sind UNTERSCHEIDBAR - sonst waere die Auskunft wertlos.* ✓✓
    expect(formMeldung).not.toBe(versionMeldung);
  });
});
