// STATUS: PLATIN — First explicit Grid-table → Writer route through the shared drop resolver.
import type { WorkspaceDocument, WorkspaceObject } from '../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  evaluateWorkspaceDrop,
  resolveWorkspaceDrop,
  serializeWorkspaceDragPayload,
  WorkspaceInteractionRegistry,
  type WorkspaceDropAssessment,
} from '../../shared/workspace-interaction';

export const FABRIC_WORKSPACE_OBJECT_DRAG_MIME = 'application/x-astraea-workspace-object-v1';

const fabricWorkspaceDropRegistry = new WorkspaceInteractionRegistry();
fabricWorkspaceDropRegistry.registerAppManifest({
  app: 'Grid',
  exports: [{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }],
  imports: [],
});
fabricWorkspaceDropRegistry.registerAppManifest({
  app: 'Writer',
  // **Paket 22 (Writer) — der Quellen-Export (Runde 284) ✓✓** *und er **erweitert den vorhandenen Block*** ✓✓:
  // *ein **zweiter** `registerAppManifest` für Writer wuerde werfen* ✗ (`registry_manifest_duplicate` ✓) — *genau
  // darum steht er hier und nicht als neuer Eintrag.* ✓
  //
  // **Gemessen und gebaut vom Writer-Agenten** ✓✓: die Abschnittsart ist **`'TextBlock'`** ✓ — *im **vorhandenen**
  // Modell gelesen* ✓ (`useWriterState` / `writerTextBlockWrite` / `writerWorkspaceIntegration` lesen genau so ✓),
  // *kein erfundenes `tb-<id>`* ✗. **Und die Absichten kommen aus der Behandlungsart** ✓✓
  // (`writerWorkspaceCarrierSupportedIntents` ✓: `copy` → `['COPY']` ✓, `live` → `['LIVE_REFERENCE']` ✓ — **eine**
  // Ableitung, **keine** zweite Liste ✓).
  //
  // **Und die Zielseite fehlt noch** ✗✓: *Publish importiert heute **nur** `Table`* ✓ — *so lange ist
  // `getCompatibleIntents('Writer','Publish','TextBlock')` leer und **keine** Route entsteht* ✓✓. **Der Erzeuger
  // liefert aber schon einen Traeger** ✓ — *und der Writer-Agent hat ihn mit **Aufrufer** gebaut* ✓✓
  // (`WriterEditor.tsx:57/579` ✓).
  exports: [{ objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] }],
  // **AST-0737 (2) — die erste Zielseite fuer einen gelieferten `TextBlock` ✓✓** — *und sie **erweitert den
  // vorhandenen Block*** ✓✓: *ein **zweiter** `registerAppManifest` fuer Writer wuerde werfen*
  // (`registry_manifest_duplicate` ✓) — *genau darum steht der Eintrag hier und nicht als neuer Block.* ✓
  //
  // **Warum `['COPY']` und nicht `['COPY','LIVE_REFERENCE']` — gemessen, nicht gewaehlt** ✓✓:
  //   * **`COPY` traegt** ✓✓: die vorhandene Zustellung (`fabricTransferOperations.ts:39-77`, Zweig
  //     `PasteCopy`) legt eine **Kopie** des Quellobjekts in `target.objects` **und** `target.root_object_ids`
  //     ✓ — und **Writers eigene Leseregel** (`apps/writer/editor/useWriterState.ts:181-186`:
  //     `root_object_ids.find((id) => objects[id]?.type === 'TextBlock')` → `objects[id].data.paragraphs`)
  //     findet sie ✓. *Gemessen: der Absatztext der Notes-Seite steht danach **wortwoertlich** in dem, was
  //     Writer liest* ✓✓ (`notesWriterDragDropRouteGap.ast0737.test.ts`, Fall 5).
  //   * **`LIVE_REFERENCE` traegt hier NICHT** ✗✗: die Zustellung (`insertFromWorkspace`,
  //     `fabricReferenceOperations.ts:132-196`) legt fuer den Live-Zweig ein Objekt der Art
  //     **`WorkspaceReference`** an ✓ — und `ui/src/apps/writer/**` hat **null Produktionstreffer** fuer diese
  //     Art ✗✓ (gemessen: **zwei** Treffer in `ui/src`, **beide** in einer Test-Attrappe
  //     `writerCollaborationPacketG.test.ts:82/87`; die Reader der anderen Apps — `grid`, `draw`, `present`,
  //     `whiteboard`, `pdf` — haben welche ✓). *Writers Leseregel sucht `TextBlock`; sie findet den Verweis
  //     nicht, und `data.paragraphs` gibt es dort nicht.* ✓✓
  //     *Gemessen: nach einem LiveLink bleibt `writerReads(...).texts === []`* ✗✓ — **ein Angebot, das nichts
  //     bedeutet** ✗. *Ein Eintrag, der eine Absicht verspricht, die die Zielseite nicht lesen kann, ist genau
  //     der Defekt, den dieses Projekt am teuersten bezahlt* ✓✓.
  //   ==> *Wenn Writer einen Empfangspunkt fuer einen **Live-Verweis auf einen `TextBlock`** bekommt, wird
  //   **diese eine Zeile** um `'LIVE_REFERENCE'` erweitert — **kein** zweiter Adapter, **keine** zweite Liste.* ✓
  //
  // **Und `MOVE`/`FROZEN_SNAPSHOT` fehlen aus demselben Grund wie ueberall:** die **Quelle**
  // (`notesParagraphCarrier.ts:76`) fuehrt genau `['COPY','LIVE_REFERENCE']` ✓ — *die Vokabel wird nicht
  // erfunden* ✓.
  imports: [
    { objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] },
    // **AST-0737 FOLGE (12:5x) — das erste der ZWEI WOERTER ✓✓.** *Der Vorgaenger hat hier bewusst nur
    // `['COPY']` eingetragen, weil Writer einen `WorkspaceReference` **nicht lesen konnte** (seine
    // Messung, Zeilen 48-59 — sie bleibt als Beleg stehen).* **Diese Voraussetzung ist jetzt erfuellt:**
    // die Leseregel liegt als Erweiterung der vorhandenen Projektion
    // (`apps/writer/editor/writerPrimaryTextProjection.ts`, gerufen aus `useWriterState.ts`) und
    // **faehrt** — gemessen im Zeugen `apps/writer/testing/integration/workspace/writerLiveReferenceProjection.ast0737folge.test.ts`
    // (Faelle 1-4/7 fahren den **echten** Hook per `renderToStaticMarkup` und vergleichen den Absatz
    // **woertlich**). *Und der Grund fuer die Vorsicht ist mitbehoben:* der Live-Verweis traegt
    // **keinen** Inhalt (`fabricReferenceOperations.ts:158-159`: `cached_snapshot` nur bei `Frozen`),
    // deshalb liest die Regel ueber die **eine** vorhandene Aufloesung
    // (`resolveFabricReference`) — die Zielseite kann also wirklich lesen, was hier angeboten wird. ✓
    { objectKind: 'TextBlock', intents: ['COPY', 'LIVE_REFERENCE'] },
  ],
});
fabricWorkspaceDropRegistry.registerAdapter({
  id: 'fabric-grid-table-to-writer',
  targetApp: 'Writer',
  objectKinds: ['Table'],
  intents: ['COPY', 'LIVE_REFERENCE'],
});
// **AST-0737 (3) — der Adapter der Fahrt Notes → Writer ✓✓**, und die **erste** Route in dieser Matrix, deren
// **Quelle** keine Tabelle ist ✓✓ (*Grid war bis hierher die einzige Quelle* ✗).
//
// **Wie die Route zustande kommt, gemessen** ✓✓: Notes **exportiert** `'TextBlock'` mit `['COPY']` ✓ (unten ✓),
// Writer **importiert** `'TextBlock'` mit `['COPY']` ✓ (oben ✓) — der **Schnitt** der drei Seiten
// (Quelle ∩ Ziel ∩ Adapter, `workspaceInteractionRegistry.ts:152-164`) ist damit **genau eine** Absicht ✓ →
// `accepted`/`resolved` **ohne Auswahlphase** ✓✓ (*`needsChoice` braucht **zwei*** ✗). *Waere hier
// `['COPY','LIVE_REFERENCE']` eingetragen, endete die **Zeiger-Ablage** benannt in
// `drop_intent_choice_required`* ✗✓ — **Form B, nicht Form A** (`fabricGraphWorkspaceDrop.ts` oben:
// „Form A = accept UND ein vollendeter Drop").
//
// **Und der Adapter allein wuerde werfen** ✗✓: `workspaceInteractionRegistry.ts:117` verlangt, dass der
// **Ziel-Import** die Absicht fuehrt (`registry_adapter_invalid` ✓) — *deshalb steht (2) **vor** (3), und die
// Reihenfolge ist keine Kosmetik* ✓✓.
//
// **Die Gegenprobe steht im Zeugen, nicht hier** ✓✓: `notesWriterDragDropRouteGap.ast0737.test.ts` faellt ohne
// diesen Block auf `registry_adapter_route_missing` zurueck ✓ — *und ein Rueckbau des `intents` macht ihn rot*
// (§ Mutationsbeweis im Bericht) ✓✓.
// **AST-0737 FOLGE (12:5x) — das ZWEITE der ZWEI WOERTER ✓✓:** der Adapter fuehrt die Live-Absicht
// jetzt mit. *Der Grund, warum das ohne (2) geworfen haette, bleibt gemessen:* `workspaceInteractionRegistry.ts:117`
// verlangt, dass der **Ziel-Import** die Absicht fuehrt (`registry_adapter_invalid` ✓) — *deshalb steht
// (2) vor (3), und die Reihenfolge ist keine Kosmetik.* ✓
//
// **Und die Grenze, die dabei BLEIBT — gemessen, nicht verschwiegen** ✗✓: eine Route braucht **drei**
// Seiten (`workspaceInteractionRegistry.ts:160-163`: Quelle ∩ Ziel ∩ Adapter). **Notes exportiert
// `'TextBlock'` weiter nur mit `['COPY']`** (unten ✓) — also entsteht fuer `LIVE_REFERENCE` **noch
// keine** Route, und `getCompatibleIntents('Notes','Writer','TextBlock')` ist **unveraendert**
// `['COPY']` ✓ (die Zeiger-Ablage bleibt Form A, wie der Vorgaenger sie begruendet hat). *Das dritte
// Wort (Notes-Export) ist eine Entscheidung des Eigentuemers, **nicht** meine:* mit ihm wird die Route
// **zwei** Absichten breit und die Zeiger-Ablage landet in der Auswahlphase
// (`drop_intent_choice_required`, Paket 15) — das waere eine Aenderung an einem **angenommenen** Weg.
// Der Zeuge haelt beide Tatsachen fest (Fall 9).
fabricWorkspaceDropRegistry.registerAdapter({
  id: 'fabric-notes-textblock-to-writer',
  targetApp: 'Writer',
  objectKinds: ['TextBlock'],
  intents: ['COPY', 'LIVE_REFERENCE'],
});
// ## Die eine Begruendung der gespeicherten Matrix — sie gilt fuer ALLE Eintraege
//
// **Warum eine Matrix und keine zweite Liste:** Jede App, die eine eigene "was ist erlaubt"-Regel baut, hat eine
// zweite Wahrheit. Diese Datei ist die EINE Autoritaet (Paket 4); hoverDropTarget (Paket 6) fragt sie.
//
// **Form A oder Form B — gemessen, nicht gewaehlt:**
//   A  = intents [COPY] in beiden Bloecken        -> accept UND ein vollendeter Drop
//   B  = intents [COPY, LIVE_REFERENCE]           -> accept, aber Phase choice -> der Resolver antwortet benannt
//        drop_intent_choice_required. Das ist PAKET 15 (Live Link vs Kopie); dort steht B dann richtig.
//
// **Der Ausschlussgrund, der am meisten wert ist:** MOVE gehoert NICHT hinein — *aber der Grund unterscheidet sich
// je Flaeche, und beides ist gemessen:*
//   * **Present:** die Route waere da und accept wuerde erreicht — der Resolver VERWEIGERT beim Ablegen mit
//     drop_move_transaction_unavailable. *Die Matrix wuerde etwas versprechen, das der Resolver nicht haelt.*
//   * **Whiteboard:** die Faehigkeitsfrage fragt den RESOLVER, nicht die Route — eine registrierte MOVE-Route erreicht
//     dort nicht einmal accept (Frage = false, Hover = reject). *MOVE ist doppelt falsch: die Matrix veroeffentlicht
//     eine Route, die kein Verbraucher zustellen kann UND die die Flaeche ablehnt.*
// **Gemeinsam ist der Test, nicht der Grund:** Wird accept erreicht UND der Drop auch vollendet? *Eintraege duerfen
// keine Begruendung erben, die nur fuer eine Flaeche gemessen ist.*
//
// **Die Vokabeln kommen aus einer Messung, nie aus einer Erfindung:** objectKinds und intents werden je App
// gemessen (Present: Form A, Form B als gemessene Alternative; FROZEN_SNAPSHOT ausgeschlossen, weil Grid es nicht
// exportiert — eine erfundene Vokabel).
//
// **Und die Zwei-Welten-Regel:** Ein Eintrag darf nur gesetzt werden, wenn die Tests der App im echten Baum gruen
// sind UND mit dem Produktionsfall versuchsweise auf die neue Form gestellt ebenfalls — Revert vor dem Zaehlen
// verifiziert. Grund, gemessen: Bei Present hat ein typgerechter Eintrag ALLEIN vier ehrliche Tests rot gemacht,
// weil sie den Zustand VOR ihm festhielten. Ein Test, der einen bekannten Falschzustand festhaelt, ist ein
// UEBERGANGSMARKER — er wird auf den neuen Zustand gezogen, nie geloescht und nie gelockert.
//
// Diese Begruendung stand vorher 36 Zeilen lang vor EINEM Eintrag (Present) und vor den anderen vier gar nicht.
// Sie gilt fuer alle. (W-445)

// Present: Form A — gemessen (Runde 240/255). Begruendung siehe oben (W-445).
fabricWorkspaceDropRegistry.registerAppManifest({
  app: 'Present',
  exports: [],
  imports: [
    { objectKind: 'Table', intents: ['COPY'] },
    // **Paket 23 (Draw → Present): die erste Nicht-Grid-Zielseite (Runde 285) ✓✓**
    // *Gemessen und begruendet vom Draw-Agenten* ✓✓: Draw exportiert **`'Shape'`** ✓ (der kanonische WOM-Anker,
    // `drawWorkspaceIntegration.ts:96-111` ✓) mit **`['LIVE_REFERENCE']`** ✓ — *und **ohne** `COPY`, weil „eine Kopie
    // des Ankers ein **unsichtbares Rechteck** waere — **ein Angebot, das nichts bedeutet**"* ✓✓.
    // **Also nimmt Present genau diese eine Absicht an** ✓ — *der Schnitt ist damit `['LIVE_REFERENCE']`, **genau
    // eine** Absicht → `accepted`* ✓✓, *und weil sie **live** ist, ist der **Modus** Pflicht* ✓ (`drop_live_mode_required`
    // ohne ihn ✓) — *die Form, die Present schon hat* ✓✓.
    { objectKind: 'Shape', intents: ['LIVE_REFERENCE'] },
  ],
});
fabricWorkspaceDropRegistry.registerAdapter({
  id: 'fabric-grid-table-to-present',
  targetApp: 'Present',
  objectKinds: ['Table'],
  intents: ['COPY'],
});
// **Die ERSTE Nicht-Grid-Route der Sitzung (Runde 285) ✓✓** — *`Draw → Present` ueber `Shape`* ✓✓.
// **Wie sie zustande kommt, gemessen ✓✓:** Draw **exportiert** `'Shape'` mit `['LIVE_REFERENCE']` ✓ (Runde 282 ✓),
// Present **importiert** `'Shape'` mit `['LIVE_REFERENCE']` ✓ (oben ✓) — der **Schnitt** ist damit
// `['LIVE_REFERENCE']`, also **genau eine** Absicht ✓ → `accepted` ✓ (`needsChoice` braucht **zwei** ✗). *Und weil
// die Absicht **live** ist, ist der **Modus** Pflicht* ✓✓: *ohne ihn `drop_live_mode_required`* ✓ — **benannt, kein
// heimlicher Default** ✓, *und Present hat die Form schon* ✓✓ (`requestedMode` ✓, der sichtbare Waehler fehlt dort
// noch ✗ — *das ist AST-1948 fuer Present* ✓).
// **Und `COPY` steht bewusst nicht drin** ✗✓: *Draw bietet es **nicht** an* ✓ — *ein Adapter, der eine Absicht
// anbietet, die die Quelle nicht hat, waere ein Versprechen ohne Faehigkeit* ✗✓. *Der Schnitt der drei Seiten
// (Quelle ∩ Ziel ∩ Adapter) bleibt damit ehrlich.* ✓
fabricWorkspaceDropRegistry.registerAdapter({
  id: 'fabric-draw-shape-to-present',
  targetApp: 'Present',
  objectKinds: ['Shape'],
  intents: ['LIVE_REFERENCE'],
});
  // Whiteboard: Form A — gemessen vom Whiteboard-Agenten (Runde 231/271), **beide Welten gruen**.
  // Er hat die **Sonde** gestellt, dass der neue Zweig wirklich lief (…('Whiteboard','Table','COPY') === true
  // → 1 passed | 51 skipped) und den Revert per **SHA-256** verifiziert. *Ein gruener Lauf beweist weniger als
  // eine Sonde, die zeigt, dass der neue Pfad ausgefuehrt wurde.*
  fabricWorkspaceDropRegistry.registerAppManifest({
    app: 'Whiteboard',
    // **ZURÜCKGENOMMEN (Runde 292) ✗✓✓** — *mein Eintrag `exports: [{ objectKind: 'Shape', … }]` ließ die
    // gesiegelte Registry **werfen*** ✗✗: `WorkspaceInteractionError: The workspace drop adapter is invalid.`
    // (*sechs Vertragsdateien ließen sich nicht mehr **laden*** ✗). **Der Grund ist noch nicht gemessen** ✗✓ —
    // *und **ich rate ihn nicht**.* **Und der eigene Wächterfehler gehört dazu ✗✓:** mein Rücknahme-Skript zählte
    // `×`-Marker, *aber eine Datei, die **nicht lädt**, hat keine* ✗✓ → **es meldete „GRÜN" und löschte die
    // Sicherung** ✗✗. *Ab jetzt: bei einem Masseneingriff zählt der Wächter **beide** Signale — `×` **und**
    // „Failed Suites"/`FAIL` ✓✓.*
    // **Was bleibt ✓✓:** die **erste** Nicht-Grid-Route (`Draw → Present`, Present-`imports` + Adapter ✓✓) ist
    // **unberührt** und **bezeugt** ✓✓ — *zurückgenommen ist **nur** die zweite Zielseite.*
    exports: [],
    imports: [{ objectKind: 'Table', intents: ['COPY'] }],
  });
  fabricWorkspaceDropRegistry.registerAdapter({
    id: 'fabric-grid-table-to-whiteboard',
    targetApp: 'Whiteboard',
    objectKinds: ['Table'],
    intents: ['COPY'],
  });
// **ZURÜCKGENOMMEN (Runde 292) ✗✓✓** — hier stand mein Adapter
// `{ id: 'fabric-draw-shape-to-whiteboard', targetApp: 'Whiteboard', objectKinds: ['Shape'], intents: ['LIVE_REFERENCE'] }`
// *und er ließ die **gesiegelte Registry werfen*** ✗✗: `WorkspaceInteractionError: The workspace drop adapter is
// invalid.` (*sechs Vertragsdateien ließen sich nicht mehr **laden*** ✗ — *und der Rückzug des `exports` allein
// **reichte nicht*** ✗✓, *also war **er** der Auslöser* ✓).
// **Der Grund ist damit noch nicht gemessen** ✗✓ — *und **ich rate ihn nicht**.* **Nächste Messung:** *die
// Adapterprüfung in `workspaceInteractionRegistry.ts` lesen* ✓ (*Kandidaten: eine **doppelte Route** mit dem
// Present-Adapter? ✗ · eine `objectKinds`-Prüfung gegen `WORKSPACE_OBJECT_KINDS`? ✗ · oder eine
// Eindeutigkeitsregel je `(targetApp, objectKind)` je **Ziel**, die zwei `Shape`-Adapter für **zwei** Ziele
// erlaubt, aber etwas anderes verlangt* ✗*)*.
// **Und der eigene Wächterfehler bleibt verzeichnet ✗✓:** *mein Rücknahme-Skript zählte nur `×`-Marker — eine
// Datei, die **nicht lädt**, hat keine* ✗✓ → *es meldete „GRÜN" und löschte die Sicherung* ✗✗. **Ab jetzt zählt der
// Wächter beide Signale: `×` **und** `Failed Suites`/`FAIL`** ✓✓.
// **Was unberührt bleibt ✓✓:** die **erste** Nicht-Grid-Route (`Draw → Present` ✓✓, Present-`imports` + Adapter ✓,
// **bezeugt** durch `integrationDrawShapeRoute.contract.test.ts` ✓✓).
  // Notes: Form A — gemessen von Paket 12, **beide Welten gruen** (Sonde: `getCompatibleIntents('Grid','Notes',
  // 'Table') === ['COPY']` **und** `resolution.adapterId === 'fabric-grid-table-to-notes'`; in der Welt **ohne**
  // Eintrag gibt es beides nicht). **Nur der Unterschied zu Present:** die Faehigkeitsfrage der Notes-Zone fragt
  // den **Resolver** (`evaluateWorkspaceDrop`), also erreicht `MOVE` **nicht einmal `accept`** (Whiteboard-Form,
  // **nicht** die Present-Form) ✓; `FROZEN_SNAPSHOT` scheitert an der **Quelle** — Grid exportiert es nicht ✓.
  // **AST-0737 (1) — die Quelle Notes fuehrt ihre Absaetze aus ✓✓** — *und **nur** den Export erweitert, der
  // `imports`-Block bleibt der gemessene Notes-Eingang* ✓ (`Grid`-Tabelle, Paket 12).
  //
  // **Die Objektart ist gemessen, nicht erfunden** ✓✓: seit Runde 93 fuehrt das Notes-Dokument seine **Seiten als
  // Objekte** ✓ — `model/notesPageObjects.ts` (`withNotesPageObjects`: `objects[pageId] = { type: 'TextBlock', … }`
  // ✓, `root_object_ids` ✓), **und sie ueberleben den `.vnote`-Rundlauf** ✓ (`notesVnoteContainer.ts` pack/unpack ✓,
  // Zeugen `notesPageObjectPersistence|LiveDocument|CommitChokepoint.ast0737dep.*` ✓). *Ohne diese Abhaengigkeit
  // waere der Eintrag ein Scheintraeger gewesen* ✗✓ — **genau deshalb ist (1) erst jetzt setzbar.** ✓
  //
  // **Warum `['COPY']`** ✓✓: `notesParagraphCarrier.ts:76` fuehrt als Quelle genau `['COPY','LIVE_REFERENCE']` ✓ —
  // die **Ziel**seite nimmt aber nur `COPY` an (Begruendung oben bei (2)), **und** die Schnittmenge darf die
  // **Route** nicht in die Auswahlphase zwingen. *Der Export fuehrt damit genau das, was die Route haelt.* ✓✓
  //
  // **Und der Erzeuger der Shell profitiert davon mit** ✓✓: `createFabricWorkspaceObjectDragPayload` liest
  // **diese** Liste (siehe unten, Runde 277 ✓: `getManifest(sourceDocument.kind)?.exports.find(...)`) und
  // lieferte fuer Notes bis hierher **`null`** ✗ — *gemessen; jetzt liefert er einen Traeger* ✓.
  fabricWorkspaceDropRegistry.registerAppManifest({
    app: 'Notes',
    exports: [{ objectKind: 'TextBlock', intents: ['COPY'] }],
    imports: [{ objectKind: 'Table', intents: ['COPY'] }],
  });
  fabricWorkspaceDropRegistry.registerAdapter({
    id: 'fabric-grid-table-to-notes',
    targetApp: 'Notes',
    objectKinds: ['Table'],
    intents: ['COPY'],
  });
  // Draw: Form A — **von Paket 14 selbst gemessen** (Runde 273), mit dem **eigenen** Grund fuer Draw. *Der
  // gemeinsame Test ist gemeinsam; die Begruendung wird nicht geerbt (W-445).*
  //   * **Form A** (`['COPY']` in beiden Bloecken): der von Grid **produzierte** Traeger bietet `COPY` **und**
  //     `LIVE_REFERENCE`; gemessen gegen eine echte `WorkspaceInteractionRegistry` ergibt das
  //     `getCompatibleIntents('Grid','Draw','Table') === ['COPY']`, `resolveWorkspaceDrop` → `resolved`
  //     (`drop_resolved`) und in der Draw-Zone einen **vollendeten** Drop (`decision: 'routed'`,
  //     `adapterId: 'fabric-grid-table-to-draw'`). **Form B** (`['COPY','LIVE_REFERENCE']`) ergaebe `accept`,
  //     aber die Ablage endet benannt in `drop_intent_choice_required` (Phase `choice`) — *das ist Paket 15*.
  //   * **`MOVE` erreicht fuer Draw nicht einmal `accept`** — die **Whiteboard/Notes-Form, nicht die Present-Form**:
  //     die Faehigkeitsfrage der Draw-Zone fragt den **Resolver** (`evaluateWorkspaceDrop` **mit**
  //     `requestedIntent`), und der antwortet gemessen `drop_move_transaction_unavailable` — sowohl mit einem
  //     `MOVE`-Traeger als auch mit dem Grid-Traeger. Die Flaeche zeigt dann Paket 6's gefalteten Grund
  //     `route-not-capable`: *kein stilles „accept", das erst beim Ablegen scheitert.*
  //   * **`FROZEN_SNAPSHOT` scheitert an der QUELLE** — gemessen: mit einem `FROZEN_SNAPSHOT`-Traeger
  //     `registry_adapter_route_missing` (Grid exportiert die Absicht nicht), mit dem Grid-Traeger
  //     `drop_intent_not_supported`. *Ein eigener Grund, der nur fuer Draw gemessen ist — deshalb steht er hier.*
  //   * **Gegenprobe zum Vorzustand, gemessen:** **ohne** diesen Block liefert `getAdapter('Draw','Table','COPY')`
  //     `null` und `getCompatibleIntents('Grid','Draw','Table')` `[]` — der Marker der Draw-Zone war also echt
  //     und ist mit diesem Eintrag **vorgezogen** worden (nicht geloescht, nicht gelockert).
  fabricWorkspaceDropRegistry.registerAppManifest({
    app: 'Draw',
    // **Der erste Nicht-Grid-Export der Sitzung (Runde 282) ✓✓** — *gemessen und begruendet vom **Draw-Agenten**
    // selbst* ✓✓: die Objektart ist **`'Shape'`** ✓ — *der **kanonische WOM-Anker**, den
    // `apps/draw/integrations/drawWorkspaceIntegration.ts:96-111` schreibt* ✓ (`{ type: 'Shape', data: { id } }` in
    // `source.objects`) → **der Traeger nennt `documentId` UND `objectId = <Anker>`** ✓✓, *das ist die
    // „Quelle bleibt identifizierbar" der Akzeptanz* ✓.
    // **Und `COPY` steht hier bewusst NICHT** ✗✓: *„eine Kopie des Ankers waere ein **unsichtbares Rechteck**
    // (transparent, `stroke_width: 0`) — **das waere ein Angebot, das nichts bedeutet**"* ✓✓ — *ein Angebot ohne
    // Bedeutung ist schlimmer als eine Luecke.* ✓ **Frozen ist ein *Modus*, keine zweite Absicht** ✓ (siehe
    // `WorkspaceLiveMode` / `drawDropZoneContract.ts:120-127`: `mode` nur bei `integrationKind: 'live'` und nur,
    // wenn **gesagt** — *sonst `drop_live_mode_required`* ✓).
    // **Und die Zielseite fehlt noch** ✗✓: *Present/Whiteboard muessen `Shape` **annehmen*** — *so lange ist
    // `getCompatibleIntents('Draw', <Ziel>, 'Shape')` leer und **keine** Route entsteht* ✓; **der Erzeuger liefert
    // aber schon einen Traeger** ✓✓ — *genau das, worauf der Draw-Agent wartet* ✓.
    exports: [{ objectKind: 'Shape', intents: ['LIVE_REFERENCE'] }],
    imports: [{ objectKind: 'Table', intents: ['COPY'] }],
  });
  fabricWorkspaceDropRegistry.registerAdapter({
    id: 'fabric-grid-table-to-draw',
    targetApp: 'Draw',
    objectKinds: ['Table'],
    intents: ['COPY'],
  });
// Publish: Form A — **von Paket 13 selbst gemessen**, mit dem **eigenen** Grund fuer Publish. *Der gemeinsame Test
// ist gemeinsam; die Begruendung wird nicht geerbt (W-445).*
//   * **Form A** (`['COPY']` in beiden Bloecken): der von Grid **produzierte** Traeger bietet `COPY` **und**
//     `LIVE_REFERENCE`; gemessen gegen eine echte `WorkspaceInteractionRegistry` ergibt das
//     `resolveWorkspaceDrop` → `resolved` (`drop_resolved`, `adapterId: 'replica-publish-table'`,
//     `sourceVersion` 3 → `targetVersion` 4) und in der Publish-Zone einen **vollendeten** Drop
//     (`decision.kind: 'delivered'`, Phase `resolved`). **Form B** (`['COPY','LIVE_REFERENCE']`) ergaebe `accept`,
//     aber die Ablage endet benannt in `drop_intent_choice_required` (Phase `choice`) — *das ist Paket 15*.
//   * **`MOVE` erreicht fuer Publish nicht einmal `accept`** — die **Whiteboard/Notes/Draw-Form, nicht die
//     Present-Form**: die Faehigkeitsfrage der Publish-Zone fragt den **Resolver** (`evaluateWorkspaceDrop` **mit**
//     `requestedIntent`), und der antwortet gemessen `drop_move_transaction_unavailable`. Gemessen **mit**
//     registrierter MOVE-Route (`getCompatibleIntents('Grid','Publish','Table') === ['MOVE','COPY']`) ist der Hover
//     `reject` / `route-not-capable`, waehrend dieselbe Matrix fuer `COPY` `accept` erreicht. *Die Matrix wuerde
//     eine Route veroeffentlichen, die die Flaeche ablehnt.*
//   * **`FROZEN_SNAPSHOT` scheitert an der QUELLE** — gemessen: Grid exportiert
//     `[{ objectKind: 'Table', intents: ['COPY','LIVE_REFERENCE'] }]`; mit einem `FROZEN_SNAPSHOT`-Traeger antwortet
//     der Resolver `registry_adapter_route_missing`, mit dem Grid-Traeger `drop_intent_not_supported`. *Die Vokabel
//     wird nicht erfunden, weil die Quelle sie nicht fuehrt.*
//   * **Gegenprobe zum Vorzustand, gemessen:** **ohne** diesen Block liefert `getManifest('Publish')` `undefined`
//     und `getCompatibleIntents('Grid','Publish','Table')` `[]` — der Uebergangsmarker der Publish-Zone war also
//     echt und ist mit diesem Eintrag **vorgezogen** worden (nicht geloescht, nicht gelockert).
fabricWorkspaceDropRegistry.registerAppManifest({
  app: 'Publish',
  exports: [],
  imports: [
    { objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] },
    // **Paket 15 („Tabellen und Grid-Datalinks")** ✓✓ — *ein **Datalink** verlangt eine Verknuepfung, also
    // `LIVE_REFERENCE`* ✓✓. **Und `COPY` bleibt** ✓: *ein eingefrorener Tabellenstand ist ein **Stand** —
    // anders als beim Draw-Anker, wo `COPY` bewusst **fehlt*** ✓✓.
  ],
});
fabricWorkspaceDropRegistry.registerAdapter({
  id: 'fabric-grid-table-to-publish',
  targetApp: 'Publish',
  objectKinds: ['Table'],
  intents: ['COPY', 'LIVE_REFERENCE'],   // beide — *die Absichten folgen dem Ziel-Manifest* ✓
});
export const FABRIC_WORKSPACE_DROP_REGISTRY = fabricWorkspaceDropRegistry.seal();

export function createFabricWorkspaceObjectDragPayload(
  sourceDocument: WorkspaceDocument,
  object: WorkspaceObject,
): string | null {
  // **EINE Autorität statt einer zweiten Liste (Runde 277) ✗✓✓**
  //
  // Hier stand `if (sourceDocument.kind !== 'Grid' || object.type !== 'Table') return null;` ✗ — *eine **zweite
  // Liste** neben der gesiegelten Matrix* ✗✓. **Der Draw-Agent hat sie zeilengenau nachgewiesen** ✓✓: *für **jede**
  // Draw-Quelle liefert der Erzeuger `null`* → **kein Träger aus Draw, Notes, Writer, Whiteboard oder Vault** ✗✓
  // — *damit war die Quellenseite der Pakete 21–26 **strukturell** versperrt, nicht nur ungebaut* ✓✓.
  //
  // **Jetzt fragt der Erzeuger die Registry** ✓✓: *„exportiert **diese App** **diese Objektart**?"* ✓ — *und nimmt
  // die **angebotenen** Absichten von dort* ✓ (*statt `['COPY','LIVE_REFERENCE']` fest zu verdrahten* ✗✓).
  // *Für Grid ändert sich nichts* ✓ (*die Matrix trägt genau diese zwei Absichten* ✓); **für jede andere App
  // entsteht ein Träger genau dann, wenn die Matrix sie deckt** ✓✓. **`null` bleibt der benannte Fall**
  // („diese App exportiert das nicht" ✓) — *kein stiller Ersatz, kein zweiter Pfad* ✗.
  const angebot = FABRIC_WORKSPACE_DROP_REGISTRY
    .getManifest(sourceDocument.kind)
    ?.exports.find((eintrag) => eintrag.objectKind === object.type);
  if (!angebot || angebot.intents.length === 0) return null;
  return serializeWorkspaceDragPayload(createWorkspaceDragPayload({
    documentId: sourceDocument.id,
    objectId: object.data.id,
    objectKind: object.type,
    sourceApp: sourceDocument.kind,
    supportedIntents: [...angebot.intents],
  }));
}

export function assessFabricWorkspaceDrop(
  payload: string,
  targetDocumentId: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  // UEBERGANGSMARKER (W-455): die **Frage** („ist diese Ablage moeglich?") traegt **dieselbe** Regel wie die
  // Zustellung ✓✓ — *denn eine Frage, die „moeglich" sagt, waehrend der Commit verweigert, waere eine **falsche
  // Auskunft** an der Oberflaeche* ✗✗✓. *Die Entscheidung steht hier **noch nicht** bereit (die Shell holt sie
  // asynchron: `precheckPolicy`, `platform/native/nativePolicy.ts:5`) und wird voruebergehend als `Allow`
  // weitergereicht* ✗✓ — *laut markiert und im Bericht gefuehrt* ✓. *Faellt der Marker weg, ohne dass die
  // Entscheidung wirklich ankommt, faellt die Frage **benannt** aus* ✓ (`drop_policy_decision_required`).
  // **Zeugen in dieser Schicht:** `shell/fabric/testing/fabricGraphWorkspaceDrop.test.ts`,
  // `src/testing/cross-app/integrationDragRoutes.contract.test.ts`, `integrationDrawShapeRoute.contract.test.ts`.
  policyDecision?: unknown,
): WorkspaceDropAssessment {
  return evaluateWorkspaceDrop({
    payload,
    targetDocumentId,
    documents,
    ...(policyDecision === undefined ? {} : { requestedPolicyDecision: policyDecision }),
  }, FABRIC_WORKSPACE_DROP_REGISTRY);
}

export function resolveFabricWorkspaceDrop(
  payload: string,
  targetDocumentId: string,
  documents: Readonly<Record<string, WorkspaceDocument>>,
  intent: 'COPY' | 'LIVE_REFERENCE',
  // **Paket 15** ✓: Der Modus wird **durchgereicht**, nicht erfunden ✗✓. *Ein Live-Verweis ohne Modus ist ab jetzt
  // der benannte Fehlschlag `drop_live_mode_required`* ✓ — *die Signatur lässt ihn deshalb **optional** und
  // **sichtbar**: wer Live will, sieht im Aufruf, dass er Live **oder** Frozen sagen muss* ✓.
  mode?: 'Live' | 'Frozen',
  // **W-455** ✓✓: die Entscheidung der Administratorrichtlinie wird — wie der Modus — **durchgereicht**, nicht
  // erfunden ✗✓. *Bedingt gespreizt wie `requestedMode`: **abwesend** bleibt abwesend* ✓ — und **abwesend ist
  // kein `Allow`** ✓✓: der Resolver weist die Ablage dann **benannt** ab (`drop_policy_decision_required`).
  policyDecision?: unknown,
): WorkspaceDropAssessment {
  return resolveWorkspaceDrop({
    payload,
    targetDocumentId,
    requestedIntent: intent,
    requestedMode: mode,
    documents,
    ...(policyDecision === undefined ? {} : { requestedPolicyDecision: policyDecision }),
  }, FABRIC_WORKSPACE_DROP_REGISTRY);
}