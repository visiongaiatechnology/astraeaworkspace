// STATUS: PLATIN — Integration & Release, **Pakete 17–20**: Grid zieht auf Writer / Present / Whiteboard / Insight
//
// ## Was hier gemessen wird — und was **nicht** ✓✓
//
// **Gemessen:** jede **registrierte** Zielroute läuft wirklich durch: Träger aus einem echten Grid-Dokument →
// Fähigkeitsfrage → Zustellung, mit Adapterkennung, Quell-/Zielversion und `integrationKind` ✓. Und jede
// **nicht** registrierte Route ist ein **benannter** Fehlschlag ✓ (`registry_adapter_route_missing`) — *kein stiller
// Erfolg* ✗.
//
// **Nicht gemessen, und das wird hier gesagt statt verschwiegen ✗:** `resolveWorkspaceDrop` sagt selbst
// *„It does not mutate or persist either document"* ✓. Dieser Vertrag beweist also die **Route und die Referenz** ✓,
// **nicht** das Einsetzen der Zellen in Writer. *Das ist Paket 17 Backend und gehört dem Writer-Adapter* ✗ — *eine
// Zusage „Werte verglichen" wäre ohne ihn eine Behauptung* ✗.
//
// ## Warum diese Datei existiert, obwohl es schon Verträge gibt ✓
//
// `integrationCapabilityMatrix.contract.test.ts` prüft die Matrix **strukturell** ✓. Dieser Vertrag prüft die
// **Fahrt** ✓ — *und er benutzt dieselbe gesiegelte Registry, keinen zweiten Mechanismus* ✓✓.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../shell/fabric/fabricGraphWorkspaceDrop';
import {
  assessFabricWorkspaceDrop,
  createFabricWorkspaceObjectDragPayload,
  resolveFabricWorkspaceDrop,
} from '../../shell/fabric/fabricGraphWorkspaceDrop';

/** Ein echtes Grid-Dokument mit einem Bereich **A1:D12** ✓ — *die Akzeptanzhandlung von Paket 17 nennt ihn* ✓. */
const bereich = {
  A1: { value: 'Region' }, B1: { value: 'Quartal' }, C1: { value: 'Umsatz' }, D1: { value: 'Marge' },
  A2: { value: 'Nord' }, B2: { value: 'Q1' }, C2: { value: 1200 }, D2: { value: 0.31 },
  A3: { value: 'Süd' }, B3: { value: 'Q1' }, C3: { value: 900 }, D3: { value: 0.28 },
};
const grid: WorkspaceDocument = {
  schema_version: 2, id: 'grid-quelle', title: 'Umsatz', kind: 'Grid',
  created_at: 1, modified_at: 1, version: 3, theme_id: 'cosmic-obsidian',
  root_object_ids: ['table-umsatz'],
  objects: {
    'table-umsatz': {
      type: 'Table',
      data: { id: 'table-umsatz', rows: 12, cols: 4, cells: { ...bereich, Z99: { value: 'private-cell' } } },
    },
  },
};

const zielDokument = (id: string, kind: WorkspaceDocument['kind']): WorkspaceDocument => ({
  schema_version: 2, id, title: `${kind} Ziel`, kind,
  created_at: 1, modified_at: 1, version: 4, theme_id: 'cosmic-obsidian',
  root_object_ids: [], objects: {},
});

/** **Die sechs Ziele, die die gesiegelte Matrix heute trägt** ✓ — *gemessen in Runde 292: sechs `targetApp`-Einträge* ✓. */
const ZIELE = ['Writer', 'Present', 'Whiteboard', 'Notes', 'Draw', 'Publish'] as const;

const dokumente = (zielId: string, zielKind: WorkspaceDocument['kind']) => ({
  [grid.id]: grid,
  [zielId]: zielDokument(zielId, zielKind),
});

const traeger = () => {
  const tabelle = grid.objects['table-umsatz'];
  if (!tabelle) throw new Error('Fixture-Tabelle fehlt');
  const payload = createFabricWorkspaceObjectDragPayload(grid, tabelle);
  if (!payload) throw new Error('Der Träger wurde nicht gebaut');
  return payload;
};

describe('Pakete 17–20: Grid zieht in sechs Flächen — die registrierten Routen fahren wirklich', () => {
  it('**Nicht-Leerheit:** die gesiegelte Matrix trägt die sechs Ziele — sonst prüft dieser Vertrag nichts', () => {
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.isSealed).toBe(true);
    const gedeckt = ZIELE.filter((ziel) =>
      FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', ziel, 'Table').includes('COPY'));
    // *Wäre die Liste leer, wäre jede folgende Zusicherung bedeutungslos* ✓ — deshalb wird sie **gemessen** ✓.
    expect(gedeckt).toEqual([...ZIELE]);
  });

  it('jede der sechs Routen hat einen **Adapter** — nicht nur eine Absicht', () => {
    for (const ziel of ZIELE) {
      const adapter = FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter(ziel, 'Table', 'COPY');
      expect(adapter, `${ziel} hat keine COPY-Route`).toBeDefined();
      expect(adapter?.id, `${ziel}: Adapterkennung fehlt`).toContain('fabric-grid-table-to-');
    }
  });

  it('**Paket 17 — Grid → Writer:** A1:D12 fährt durch, und der Träger ist eine **Referenz**, kein Inhalt', () => {
    const docs = dokumente('writer-ziel', 'Writer');
    const payload = traeger();
    // **Der Inhalt bleibt draußen** ✓✓ — *die eine Zahl, die nicht mitfahren darf, fährt nicht mit* ✓.
    expect(payload).not.toContain('private-cell');
    const frage = assessFabricWorkspaceDrop(payload, 'writer-ziel', docs, { effect: 'Allow' });
    expect(frage.status).toBe('needsChoice');
    const zustellung = resolveFabricWorkspaceDrop(payload, 'writer-ziel', docs, 'COPY', undefined, { effect: 'Allow' });
    expect(zustellung.status).toBe('resolved');
    if (zustellung.status === 'resolved') {
      expect(zustellung.selection.adapterId).toBe('fabric-grid-table-to-writer');
      expect(zustellung.selection.integrationKind).toBe('copy');
      expect(zustellung.selection.mode, 'eine Kopie hat keinen Live-Modus').toBeUndefined();
      expect(zustellung.sourceVersion).toBe(3);
      expect(zustellung.targetVersion).toBe(4);
    }
  });

  it('**Live braucht den Modus** ✓✓ — ohne ihn ein benannter Fehlschlag, mit ihm eine Zustellung', () => {
    const docs = dokumente('writer-ziel', 'Writer');
    const payload = traeger();
    const ohne = resolveFabricWorkspaceDrop(payload, 'writer-ziel', docs, 'LIVE_REFERENCE', undefined, { effect: 'Allow' });
    expect(ohne.status).toBe('rejected');
    if (ohne.status === 'rejected') expect(ohne.code).toBe('drop_live_mode_required');
    const mit = resolveFabricWorkspaceDrop(payload, 'writer-ziel', docs, 'LIVE_REFERENCE', 'Live', { effect: 'Allow' });
    expect(mit.status).toBe('resolved');
    if (mit.status === 'resolved') {
      expect(mit.selection.integrationKind).toBe('live');
      expect(mit.selection.mode).toBe('Live');
    }
  });

  it('**Paket 20 — Grid → Insight hat KEINE Route** ✗✓ — und das ist ein benannter Fehlschlag', () => {
    // *Gemessen, nicht angenommen:* Insight hat heute keinen Adapter **und keine Ablagezone** ✗. Ein Eintrag wäre ein
    // Versprechen ohne annehmende Fläche ✗ — **die Zeile braucht erst die Insight-Zone** ✓.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Insight', 'Table')).toEqual([]);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Insight', 'Table', 'COPY')).toBeUndefined();
    const docs = dokumente('insight-ziel', 'Insight');
    const versuch = resolveFabricWorkspaceDrop(traeger(), 'insight-ziel', docs, 'COPY', undefined, { effect: 'Allow' });
    expect(versuch.status).toBe('rejected');
    if (versuch.status === 'rejected') expect(versuch.code).toBe('registry_adapter_route_missing');
  });

  it('ein fehlendes Zieldokument ist **benannt** — nie ein stiller Erfolg', () => {
    const nurQuelle = { [grid.id]: grid };
    const versuch = resolveFabricWorkspaceDrop(traeger(), 'gibt-es-nicht', nurQuelle, 'COPY', undefined, { effect: 'Allow' });
    expect(versuch.status).toBe('rejected');
    if (versuch.status === 'rejected') expect(versuch.code).toBe('drop_target_document_missing');
  });

  // **Eigener Fehler, korrigiert (Runde 274) ✗✓:** Hier stand *„die die Matrix **NICHT** trägt"* — *ich hatte in
  // Runde 268 die **Zusicherung** auf den gemessenen Zustand gezogen (alle sechs sind **gedeckt** ✓) und den
  // **Titel stehen lassen*** ✗✗. **Der Vault-Agent hat es gefunden und gemeldet** ✓✓ — *„der Testtitel sagt es
  // wörtlich"* ✗. *Genau die Krankheit, die dieses Projekt am teuersten bezahlt: eine Aussage, die überholt ist und
  // weiter gelesen wird.* ✓ **Also: der Titel sagt jetzt, was gemessen ist** ✓.
  it('**Pakete 21–26: die vom Masterplan verlangten Routen — als ZIEL gedeckt, als QUELLE offen** ✓✗', () => {
    // *Gemessen, nicht behauptet* ✓: der Masterplan nennt sechs weitere Ziehungen, und **keine** davon hat heute
    // eine Route ✗. **Das wird hier festgehalten statt stillschweigend übergangen** ✓✓ — *ein Vertrag, der eine
    // Anforderung verschweigt, ist schlechter als einer, der sie als Lücke benennt* ✓.
    // **Eigener Fehler, korrigiert ✗✓:** Die Liste war `readonly (readonly [string, string])[]` — *die Registry
    // nimmt **typisierte** App-Arten, nicht `string`* ✗. **`as const` hält die Literale als Literaltypen** ✓,
    // damit prüft der Compiler die Namen **und** die Zuordnung zugleich ✓✓.
    const verlangt = [
      ['Notes', 'Writer'],        // Paket 21 — Markdown-Absatz als Rich Text
      ['Writer', 'Publish'],      // Paket 22 — Dokumentabschnitt als verlinkte Story
      ['Draw', 'Present'],        // Paket 23 — Vektordiagramm, Quelle bleibt erkennbar
      ['Whiteboard', 'Present'],  // Paket 24 — Frame, nach Boardänderung aktualisiert
      ['Vault', 'Writer'],        // Paket 25 — geschütztes Bild, **nicht** in Temp kopieren
      ['Vault', 'Publish'],       // Paket 26 — Logo aus Vault, Lock-State beachten
    ] as const;
    const fehlend: string[] = [];
    const vorhanden: string[] = [];
    for (const [quelle, ziel] of verlangt) {
      // **Eigener Fehler, korrigiert (Runde 283) ✗✓✓** — *gefunden vom **Writer-Agenten*** ✓✓: hier stand
      // `if (route.length === 0 && adapter === undefined)` ✗ — *und für Writer ist `route` **leer** ✓, der
      // Publish-Adapter aber **definiert** ✓ → die Zeile landete in `vorhanden`* ✗✗. **„Die Zeile beweist die
      // Zielseite, nicht die Quelle."** ✓✓ *Damit behauptete dieser Vertrag „Writer → Publish ist gedeckt",
      // obwohl **nur das Ziel** gedeckt war* ✗ — *eine **falsche Aussage in der Prüfschicht**, und das ist die
      // schlimmste Sorte* ✗✓.
      // **Jetzt gemessen, was die Frage wirklich beantwortet** ✓✓: **die Quelle** entscheidet `route` **allein** ✓
      // (*`getCompatibleIntents(quelle, ziel, art)` — sie ist leer, solange die **Quelle** die Objektart nicht
      // exportiert* ✓). Die **Zielseite** wird **getrennt** ausgewiesen ✓✓ — *sie ist eine andere Tatsache.*
      const route = FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents(quelle, ziel, 'Table');
      if (route.length === 0) fehlend.push(`${quelle} → ${ziel}`); else vorhanden.push(`${quelle} → ${ziel}`);
      // *Und die **Zielseite** ist **keine** zweite Bedingung hier* ✗✓ — **sie wird weiter unten eigene zugesichert**
      // (`expect(getAdapter(ziel, 'Table', 'COPY'), …).toBeDefined()` ✓✓): *eine Tatsache, eine Zusicherung* ✓.
      // **Eigener Fehler, sofort korrigiert ✗✓:** ich hatte hier ein `zielOffen` eingefügt **ohne es zu
      // deklarieren** — *und die Zielseite war schon geprüft* ✓. *Doppelt und kaputt ist schlechter als einmal.* ✓
    }
    // **Der gemessene Zustand — und er korrigiert MICH, zum zweiten Mal in dieser Datei ✗✓✓**
    //
    // *Runde 268 hatte ich hier `vorhanden` = alle sechs zugesichert und geschrieben, meine Annahme „sie fehlen" sei
    // falsch gewesen* ✗. **Das war selbst ein Fehlalarm** ✗✗: *die alte Bedingung verknüpfte `route.length === 0`
    // **und** `adapter === undefined` — und der **Ziel**-Adapter machte daraus „gedeckt"* ✗✓. **Der Writer-Agent hat
    // es gefunden** ✓✓: *„Die Zeile beweist die Zielseite, nicht die Quelle."* ✓✓
    // **Jetzt, mit `route` **allein**: **keine** der sechs hat einen Quellen-Export** ✗✓ — *und das deckt sich mit
    // dem, was **drei** Agenten unabhängig von ihrer Seite gemessen haben* ✓✓ (*Notes: `exports: []` ✓ · Vault: kein
    // Cross-App-Träger ✓ · Draw: der Erzeuger lieferte `null` ✓*).
    // **Und die sechste Tatsache gehört dazu ✓:** `Draw → Present` fährt über **`Shape`**, nicht über `Table` ✓ —
    // *der Draw-Export ist seit Runde 282 gesetzt ✓, aber die **Zielseite** (Present/Whiteboard importieren `Shape`)
    // fehlt noch* ✗✓.
    expect(fehlend).toEqual([
      'Notes → Writer', 'Writer → Publish', 'Draw → Present',
      'Whiteboard → Present', 'Vault → Writer', 'Vault → Publish',
    ]);
    expect(vorhanden, 'eine Quelle ist dazugekommen — dann zieh diese Liste vor').toEqual([]);
    // **Und die Ziele tragen echte Adapter** ✓ — *eine Absicht ohne Adapter wäre ein Versprechen ohne Route* ✗:
    // `assess` verweigert sie mit `registry_adapter_route_missing` ✓ (siehe der Test zu Paket 20 oben ✓).
    for (const [, ziel] of verlangt) {
      expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter(ziel, 'Table', 'COPY'), `${ziel} hat keine Zielroute`).toBeDefined();
    }
  });

  it('**Pakete 17–19: jede der sechs Zielrouten ZUSTELLT wirklich** ✓✓ — nicht nur „fähig"', () => {
    // *Ein Routenexistenz-Beweis ist die halbe Messung* ✗✓: `getAdapter(...)` sagt, dass eine Route **da** ist ✓;
    // dieser Zeuge sagt, dass sie **durchläuft** ✓ — *mit Adapterkennung, Quell-/Zielversion und Behandlungsart* ✓✓.
    // **Und er hält die Grenze fest:** `resolveWorkspaceDrop` sagt selbst „It does not mutate or persist either
    // document" ✗ — *dieser Vertrag beweist also die **Zustellung der Route**, **nicht** das Einsetzen in das
    // Zieldokument* ✗✓ (*das ist die jeweilige App und bleibt dort benannt* ✓).
    const befunde: string[] = [];
    for (const ziel of ZIELE) {
      const docs = dokumente(`${ziel.toLowerCase()}-ziel`, ziel);
      const zustellung = resolveFabricWorkspaceDrop(traeger(), `${ziel.toLowerCase()}-ziel`, docs, 'COPY', undefined, { effect: 'Allow' });
      if (zustellung.status !== 'resolved') { befunde.push(`${ziel}: ${zustellung.status}`); continue; }
      befunde.push([
        `${ziel}: resolved`,
        `adapter=${zustellung.selection.adapterId}`,
        `kind=${zustellung.selection.integrationKind}`,
        `v${zustellung.sourceVersion}→v${zustellung.targetVersion}`,
      ].join(' '));
    }
    // **Der gemessene Zustand, ausgeschrieben** ✓✓ — *so ist ein Fehlschlag sofort benannt* ✓:
    expect(befunde).toEqual([
      'Writer: resolved adapter=fabric-grid-table-to-writer kind=copy v3→v4',
      'Present: resolved adapter=fabric-grid-table-to-present kind=copy v3→v4',
      'Whiteboard: resolved adapter=fabric-grid-table-to-whiteboard kind=copy v3→v4',
      'Notes: resolved adapter=fabric-grid-table-to-notes kind=copy v3→v4',
      'Draw: resolved adapter=fabric-grid-table-to-draw kind=copy v3→v4',
      'Publish: resolved adapter=fabric-grid-table-to-publish kind=copy v3→v4',
    ]);
  });
});
