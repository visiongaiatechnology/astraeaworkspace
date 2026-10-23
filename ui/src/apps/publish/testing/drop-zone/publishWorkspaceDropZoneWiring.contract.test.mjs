// STATUS: PLATIN — Integration & Release, **Paket 13**: Quellvertrag der Publish-Ablagezone
//
// Warum eine `.mjs`: eine `.ts`-Prüfdatei hat in diesem Projekt **keine** Node-Typen — `node:fs` ergäbe `TS2307`
// (gemessen, dreimal in diesem Projekt). Also liegt der Vertrag hier. Paket 11 hat dieselbe Form benutzt.
//
// Was dieser Vertrag **nicht** kann: das **Binden** der Zeiger-, Ablage- und Tastenereignisse auslösen — dafür
// fehlt der Browser. Er prüft, **dass** die Fläche gebunden ist, **dass** der Anspruch an `types` hängt (der
// P1-Defekt `W-443`), **dass** die Zone **außerhalb** der Leinwand steht und **dass** die Zustellung nur über die
// vorhandene Matrix läuft; er behauptet **nicht**, dass eine Geste ankommt.
//
// **Kommentare werden vor jeder „darf nicht vorkommen"-Prüfung entfernt**: der Kopf der Module *nennt* die
// vorhandenen Namen — *ein Satz über eine verbotene Sache ist nicht die Sache.* (Genau diese Verwechslung hat in
// Paket 9 den ersten Vertrag dreimal rot gemacht; der Vertrag war falsch, nicht der Code.)
//
// **Beide Übergangsmarker sind eingelöst** — und beide wurden **vorgezogen**, nicht gelöscht und nicht aufgeweicht:
//   * die versiegelte Matrix der Shell trägt die Publish-Route (`fabricGraphWorkspaceDrop.ts`, **Form A**, **für
//     Publish gemessen**) — der Marker steht jetzt als „Marker eingelöst"-Vertrag weiter unten,
//   * die Shell montiert `PublishView` mit `workspaceDocuments={documents}` (`AppWorkspaceView.tsx`) — und zwar in
//     der **Record**-Form (Present und Publish bekommen den Record, Insight das Array: *die Form ist keine
//     Konvention, sie ist eine Eigenschaft*).
// *Ein Marker, der einen bekannten Zustand festhält, wird gezogen — nie gestrichen.*
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const publish = path.resolve(here, '../..');
const ui = path.resolve(publish, '../..');
const read = (relative) => readFileSync(path.resolve(publish, relative), 'utf8');
/** Entfernt Kommentare — dieselbe Form wie in `whiteboardDropZoneWiring.contract.test.mjs` (Paket 11). */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const view = read('PublishView.tsx');
/** Die beiden annehmenden Hälften — und der **eine** Leser der Objektart. */
const story = read('integrations/publishStoryAcceptance.ts');
const table = read('integrations/publishTableAcceptance.ts');
/**
 * **Die eine Autorität**, geladen — damit die Matrixzusage als **Fähigkeit** geprüft wird und nicht als Text.
 * *Ein Textpin bricht bei jeder Umformatierung; die Fähigkeit bricht nur, wenn sich die Zusage ändert.*
 */
import { FABRIC_WORKSPACE_DROP_REGISTRY as REGISTRY } from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
const canvas = read('canvas/PublishCanvas.tsx');
const DROP_DIR = path.resolve(publish, 'drop-zone');
const dropFiles = readdirSync(DROP_DIR, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
const allDropCode = code(dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n'));
const allDropRaw = dropFiles.map((name) => read(`drop-zone/${name}`)).join('\n');

const zone = read('drop-zone/publishWorkspaceDropZone.ts');
const contract = read('drop-zone/publishWorkspaceDropZoneContract.ts');
const touch = read('drop-zone/publishWorkspaceDropZoneTouch.ts');
const overlay = read('drop-zone/PublishWorkspaceDropZoneOverlay.tsx');
const hook = read('drop-zone/usePublishWorkspaceDropZone.ts');

// Die Shell-Dateien werden **nur gelesen** (nicht mein Eigentum) — für die zwei Übergangsmarker unten.
const shellDrop = readFileSync(path.resolve(ui, 'shell/fabric/fabricGraphWorkspaceDrop.ts'), 'utf8');
const shellView = readFileSync(path.resolve(ui, 'shell/workspace/AppWorkspaceView.tsx'), 'utf8');

describe('Paket 13 — die Fläche ist wirklich gebunden', () => {
  it('hängt die Ablagezone an die Publish-Fläche', () => {
    expect(view).toContain('usePublishWorkspaceDropZone({');
    expect(view).toContain('targetDocument: document');
    expect(view).toContain('documents: workspaceDocuments');
    expect(view).toContain('<PublishWorkspaceDropZoneOverlay');
    expect(view).toContain('state={workspaceDropZone.state}');
    expect(view).toContain('inputKind={workspaceDropZone.inputKind}');
    expect(view).toContain('onConfirm={workspaceDropZone.confirm}');
    expect(view).toContain('onChooseIntent={workspaceDropZone.chooseIntent}');
    expect(view).toContain('onDismiss={workspaceDropZone.dismiss}');
    expect(view).toContain('onKeyDown={workspaceDropZone.onKeyDown}');
  });

  it('reicht den Live-Modus als **gesagte** Wahl durch — ohne heimlichen Default', () => {
    // Paket 15: der Modus ist eine eigene, sichtbare Wahl. `undefined` heißt „noch nicht gewählt" und wird
    // **bedingt gespreizt** — ein ausdrückliches `undefined` wäre genau der verbotene Default.
    expect(view).toContain('...(dropMode === undefined ? {} : { requestedMode: dropMode })');
    expect(view).toContain('onChooseMode={setDropMode}');
    expect(view).toContain('const [dropMode, setDropMode] = useState<WorkspaceLiveMode | undefined>(undefined)');
  });

  /**
   * **Die annehmende Hälfte hat einen Aufrufer** ✓✓ *(AST-1983, „Dokumentabschnitt als verlinkte Story in Rahmen
   * setzen")*.
   *
   * Gemessen vor dieser Verdrahtung: `PublishWorkspaceDropResolution` stand in genau **zwei** Dateien, und
   * **beide erzeugen sie** — die Zone stellte zu, und niemand nahm an. Und die vorhandenen Annahmefunktionen
   * (`linkWriterStory`, `attachPublishReference`) hatten **null** Aufrufer. *Eine Fähigkeit ohne Aufrufer ist
   * nicht geliefert.*
   */
  it('nimmt eine zugestellte Resolution wirklich an — mit sichtbarem Ergebnis oder benanntem Grund', () => {
    expect(view).toContain("import { acceptPublishStoryDrop, publishCarrierObjectType, publishStoryAcceptanceText, publishStoryRefusalMessage } from './integrations/publishStoryAcceptance'");
    expect(view).toContain("workspaceDropZone.state.decision.kind === 'delivered'");
    // Die Dokumentliste wird **einmal** gelesen und an die Weiche **und** den Annehmer gereicht.
    expect(view).toContain('const documents = workspaceDocuments ?? {};');
    expect(view).toContain('acceptPublishStoryDrop(model, { delivered: true, resolution: decision.resolution }, documents)');
    expect(view).toContain('handleUpdateModel(() => step.model)');
    // Jede Ablehnung ist **sichtbar**, nicht still.
    expect(view).toContain('setNotice({ kind: \'error\', text: publishStoryRefusalMessage(step.reason) })');
    expect(view).toContain('setNotice({ kind: \'info\', text: publishStoryAcceptanceText(step.reference) })');
    // Und die Annahme läuft **einmal** je Zustellung, nicht bei jedem Rendern.
    expect(view).toContain('acceptedDelivery.current = deliveredKey');
  });

  it('weicht nach der **Objektart** aus, nicht nach der Absicht (AST-1411/1412)', () => {
    // Die Matrix trägt für Publish zwei Routen (`Table`/`COPY` und — sobald gesetzt — `TextBlock`/`LIVE_REFERENCE`).
    // `COPY` und `LIVE_REFERENCE` allein unterscheiden sie **nicht**: eine Tabelle kann ebenso live sein. Deshalb
    // entscheidet die **Objektart**, und sie wird **einmal** gelesen — nicht in jedem Annehmer noch einmal.
    expect(view).toContain('publishCarrierObjectType(documents, decision.resolution.sourceDocumentId, decision.resolution.sourceObjectId)');
    expect(view).toContain('if (carrierType === PUBLISH_TABLE_CARRIER_OBJECT_KIND) {');
    expect(view).toContain('acceptPublishTableDrop(model, { delivered: true, resolution: decision.resolution }, documents)');
    expect(view).toContain('setNotice({ kind: \'error\', text: publishTableRefusalText(table.reason) })');
    // Der Leser steht **einmal** und wird von beiden Seiten benutzt.
    expect(story).toContain('export function publishCarrierObjectType(');
    expect(table).toContain('publishStoryLinkMode(liveMode)');
  });

  it('bindet alle vier Zeigerereignisse und die Eingabeart an die Fläche', () => {
    for (const handler of ['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop']) {
      expect(view, handler).toContain(`workspaceDropZone.${handler}`);
    }
    expect(view).toContain('onPointerDownCapture={(event) => workspaceDropZone.noteInputKind(event.pointerType)}');
    // Die Eingabeart wird **nicht** erfunden: sie kommt aus der **einen** Übersetzung in Paket 6 (`W-446`).
    expect(hook).toContain('dragInputKindFromPointerType(pointerType)');
    // Und die **lokale Kopie ist weg** — *fünf Apps hatten je eine eigene; eine zweite wäre eine zweite Wahrheit.*
    expect(code(hook)).not.toContain('publishWorkspaceDropInputKind');
    expect(allDropCode).not.toContain('publishWorkspaceDropInputKind');
    expect(allDropCode).toContain('dragInputKindFromPointerType');
  });

  it('bindet in der **Capture**-Phase — sonst verschluckt der Rahmen-Drop der Leinwand einen Arbeitsflächen-Zug', () => {
    // Der Bild-Drop der Leinwand ruft `stopPropagation()`; ein Blasen-Handler bekäme einen Zug, der auf einem
    // **Rahmen** abgelegt wird, deshalb nie zu sehen. *Die Entscheidung „wem gehört der Zug" fällt an der MIME-Art,
    // und sie fällt vor dem Rahmen.*
    for (const handler of ['onDragEnterCapture', 'onDragOverCapture', 'onDragLeaveCapture', 'onDropCapture']) {
      expect(view, handler).toContain(handler);
    }
    expect(hook).toContain('event.stopPropagation?.()');
    // Der fremde Bildpfad bleibt unangetastet.
    expect(canvas).toContain('checkPublishImageDrop(frame, { type: file.type, size: file.size })');
  });

  it('nimmt genau diese Fläche als Ziel — App und Kennung werden nicht geraten', () => {
    expect(hook).toContain('targetDocument.id');
    expect(hook).toContain('targetDocument.kind');
    expect(hook).toContain('record[targetDocument.id] = targetDocument;');
  });

  it('steht **außerhalb** der Leinwandfläche — das ist die Bedingung für die Tastatur-Alternative', () => {
    // Struktureller Nachweis am Quelltext: die Zone ist ein **Geschwister** der Leinwand, kein Kind. *Ein
    // DOM-Nachweis wäre stärker — dafür fehlt der Browser; das ist hier ausdrücklich ein Proxy und wird so
    // berichtet.*
    const wrapperAt = view.indexOf('onDropCapture={workspaceDropZone.onDrop}');
    const canvasAt = view.indexOf('<PublishCanvas');
    const overlayAt = view.indexOf('<PublishWorkspaceDropZoneOverlay');
    expect(wrapperAt).toBeGreaterThan(0);
    expect(canvasAt).toBeGreaterThan(wrapperAt);
    expect(overlayAt).toBeGreaterThan(canvasAt);
  });

  it('reicht die Dokumentliste **optional** durch — eine Fähigkeit ohne Aufrufer wäre keine', () => {
    expect(view).toContain('workspaceDocuments?: Record<string, WorkspaceDocument>;');
    expect(view).toContain('workspaceDocuments,');
    expect(view).toContain('documents: workspaceDocuments');
    // **Marker eingelöst (vorgezogen, nicht gelockert):** die Shell montiert `PublishView` jetzt **mit** der
    // Dokumentliste — in der **Record**-Form, wie Present sie bekommt (Insight bekommt das Array). *Die Form ist
    // keine Konvention, sie ist eine Eigenschaft.*
    const call = shellView.slice(shellView.indexOf('<PublishView'), shellView.indexOf('/>', shellView.indexOf('<PublishView')));
    expect(call).toContain('document={activeDoc}');
    expect(call).toContain('workspaceDocuments={documents}');
  });
});

describe('Paket 13 — das Urteil kommt aus Paket 6, kein zweites', () => {
  it('liest die vorhandene Zieh-Session und das vorhandene Ablageurteil', () => {
    expect(zone).toContain("from '../../../shell/workspace/drag/dragSession'");
    expect(zone).toContain('isDragActive(');
    expect(zone).toContain("from '../../../shell/workspace/drag/dragDropVerdict'");
    expect(zone).toContain('hoverDropTarget(');
    expect(zone).toContain('commitDropTarget(');
    expect(zone).toContain('createDropTarget(');
    expect(zone).toContain('leaveDropTarget(');
    expect(touch).toContain("from '../../../shell/workspace/drag/dragDropVerdict'");
    expect(touch).toContain('dragThresholdForInput(');
    expect(touch).toContain('requiresLongPress(');
    expect(touch).toContain('isPointerFree(');
  });

  it('erfindet kein zweites Urteil und keine zweite Zustellung', () => {
    // Das Urteil wird **gelesen**; die Zustellung entscheidet der Resolver. Kein eigener Zweig über „erlaubt".
    expect(zone).toContain('evaluateWorkspaceDrop(');
    expect(zone).toContain('resolveWorkspaceDrop(');
    expect(zone).not.toMatch(/verdict\s*[:=]\s*['"](?:accept|reject)['"]/);
    expect(zone).not.toMatch(/return\s+['"](?:accept|reject)['"]/);
  });
});

describe('Paket 13 — nur die vorhandene Route, kein privater Pfad', () => {
  it('liest die eine MIME-Konstante und reicht die versiegelte Matrix hinein', () => {
    expect(zone).toContain('FABRIC_WORKSPACE_OBJECT_DRAG_MIME');
    expect(zone).toContain("from '../../../shell/fabric/fabricGraphWorkspaceDrop'");
    expect(hook).toContain('FABRIC_WORKSPACE_DROP_REGISTRY');
    expect(hook).toContain("from '../../../shell/fabric/fabricGraphWorkspaceDrop'");
    expect(hook).toContain('registry: FABRIC_WORKSPACE_DROP_REGISTRY');
    expect(zone).toContain("from '../../../shared/workspace-interaction'");
  });

  it('baut keine zweite Matrix und trägt keine zweite Route ein', () => {
    expect(allDropCode).not.toContain('new WorkspaceInteractionRegistry');
    expect(allDropCode).not.toContain('registerAdapter');
    expect(allDropCode).not.toContain('registerAppManifest');
  });

  it('baut keinen zweiten Parser und keinen zweiten Träger', () => {
    expect(allDropCode).not.toContain('JSON.parse');
    expect(allDropCode).not.toContain('astraea.workspace.drag');
    expect(allDropCode).not.toContain('createWorkspaceDragPayload');
    expect(allDropCode).not.toContain('serializeWorkspaceDragPayload');
    expect(allDropCode).not.toContain('setData(');
    expect(allDropCode).not.toContain('application/x-astraea');
    // Der **eine** Parser (Paket 7) wird **benutzt**, nicht nachgebaut.
    expect(zone).toContain('parseWorkspaceDragPayload(');
  });

  it('führt keinen zweiten Zieh-Mechanismus und keine zweite Schwelle', () => {
    expect(allDropCode).not.toContain('setPointerCapture');
    expect(allDropCode).not.toContain('pointermove');
    expect(allDropCode).not.toContain('createDragSession(');
    expect(allDropCode).not.toContain('DRAG_THRESHOLD_PX =');
    expect(allDropCode).not.toContain('DRAG_TOUCH_LONGPRESS_MS =');
    // Keine eigene Langdruck-Zahl und keine eigene Toleranz: die Entscheidung wird aus Paket 6 **gelesen**.
    expect(code(touch)).not.toMatch(/const [A-Z_]*LONG_PRESS[A-Z_]* = \d/);
    expect(code(touch)).not.toMatch(/const [A-Z_]*THRESHOLD[A-Z_]* = \d/);
  });

  it('**Marker eingelöst:** die versiegelte Matrix trägt die Publish-Route — Form A, gemessen', () => {
    // **Vorgezogen (Paket 13), nicht gelöscht und nicht gelockert:** dieser Marker hielt den gemessenen Zustand
    // fest, dass die Matrix **keine** Publish-Route trägt. Der Eintrag ist jetzt gesetzt — in der Form, die **für
    // Publish gemessen** ist (Form A `['COPY']` → vollendeter Drop; Form B ergäbe `accept` + Phase `choice` =
    // Paket 15). *Ein Test, der einen bekannten Falschzustand festhält, ist ein Übergangsmarker.*
    const source = code(shellDrop);
    const publishEntry = source.slice(
      source.indexOf("app: 'Publish'"),
      source.indexOf('export const FABRIC_WORKSPACE_DROP_REGISTRY'),
    );
    expect(source.indexOf("app: 'Publish'")).toBeGreaterThan(0);
    expect(publishEntry.length).toBeGreaterThan(0);
    /**
     * **Gezogen auf die Fähigkeit, nicht auf den Text** ✓✓ — die Lehre aus dieser Woche.
     *
     * Gemessen (zweimal getroffen): eine Zusicherung, die **Textanwesenheit** prüft, bricht bei **jeder**
     * Umformatierung — *eine Umformatierung der Matrix hat zwei Tests mitten in einem Lauf rot gemacht.* Die
     * **Fähigkeit** ist die belastbare Zusage: was die **versiegelte** Registry wirklich anbietet (sie wird aus
     * genau dieser Datei gebaut). Die Struktur (Adapter-ID, Ziel, Objektart) bleibt als Text geprüft, weil sie
     * keine Vokabel ist, die sich ändern darf, ohne dass jemand es merkt.
     */
    expect(publishEntry).toContain("app: 'Publish'");
    expect(publishEntry).toContain('exports: []');
    expect(publishEntry).toContain("id: 'fabric-grid-table-to-publish'");
    expect(publishEntry).toContain("targetApp: 'Publish'");
    expect(publishEntry).toContain("objectKinds: ['Table']");
    // **Die Fähigkeit**, gemessen an der einen Autorität — sie trägt seit `AST-1411/1412` beide Absichten.
    expect(REGISTRY.getCompatibleIntents('Grid', 'Publish', 'Table')).toEqual(['COPY', 'LIVE_REFERENCE']);
    expect(REGISTRY.getManifest('Publish')?.imports).toEqual([{ objectKind: 'Table', intents: ['COPY', 'LIVE_REFERENCE'] }]);
    // Die **nicht** gedeckten Absichten stehen nicht drin — jede mit **Publish-gemessenem** Grund.
    //
    // `LIVE_REFERENCE` stand hier bis `AST-1411/1412` ebenfalls — *der Eintrag war damals nicht gedeckt, weil
    // Publish die Absicht nicht annahm.* Seit `integrations/publishTableAcceptance.ts` sie annimmt
    // (`LIVE_REFERENCE` → `live`) **und** Paket 15 „Grid-Datalinks" heisst, ist sie gedeckt. Gezogen, nicht
    // gelockert: die zwei, die **wirklich** nicht gedeckt sind, bleiben `not`.
    expect(publishEntry).not.toContain('MOVE');
    expect(publishEntry).not.toContain('FROZEN_SNAPSHOT');
    // **Nicht pauschal umgedreht (die Lehre aus Paket 12):** die Fläche baut sich weiterhin **keine** eigene Route.
    // Diese Zeilen müssen `not` bleiben — sie sind das Gegenteil der Zeilen oben, nicht ihre Fortsetzung.
    expect(allDropCode).not.toContain("'Publish'");
    expect(allDropCode).not.toContain('registerAdapter');
    expect(allDropCode).not.toContain('registerAppManifest');
  });
});

describe('Paket 13 — der Anspruch liest `types`, der Inhalt kommt bei der Ablage', () => {
  it('beansprucht vor `preventDefault` und liest den Inhalt **erst** dort', () => {
    // Ohne diese Reihenfolge gäbe es nie ein `drop` — der P1-Defekt `W-443` aus Paket 9.
    expect(zone).toContain('export function isPublishWorkspaceDrag(');
    expect(zone).toContain('export function claimPublishWorkspaceDropZone(');
    expect(hook).toContain('claimPublishWorkspaceDropZone(current.current, context, dataTransfer)');
    const claimAt = hook.indexOf('const claim = claimPublishWorkspaceDropZone(current.current, context, dataTransfer);');
    const preventAt = hook.indexOf('event.preventDefault?.()');
    expect(claimAt).toBeGreaterThan(0);
    expect(preventAt).toBeGreaterThan(claimAt);
    // **Kein** direkter Zugriff auf den Inhalt in der Bindeschicht: es gibt genau **einen** Übersetzer.
    // (Kommentare werden entfernt — der Kopf der Datei **nennt** `getData()`; *ein Satz über eine verbotene
    // Sache ist nicht die Sache*, die Lehre aus Paket 9.)
    expect(code(hook)).not.toContain('getData');
    expect(zone).toContain('getData');
    expect(zone).toContain('readPublishWorkspaceTransfer(');
  });

  it('hält „geschützt" und „fehlt" auseinander — zwei Ereignisse, zwei Namen', () => {
    expect(contract).toContain("'publish-drop-transfer-protected'");
    expect(contract).toContain("'publish-drop-transfer-missing'");
    expect(zone).toContain('CONTENT_PROTECTED');
    expect(zone).toContain('NOT_HANDED_OVER');
    // Beim Überfahren gilt „geschützt", bei der Ablage „fehlt".
    expect(zone).toContain('return state.transfer.ok ? state.transfer : NOT_HANDED_OVER;');
  });

  it('nimmt einen entschiedenen Fall beim **neuen** Zug zurück und beim wiederholten `dragover` nicht', () => {
    expect(zone).toContain('enterPublishWorkspaceDropZone(state, { ...context, payload: read.ok ? read.payload : undefined }).state');
    expect(zone).toContain('hoverPublishWorkspaceDropZone(state, { ...context, payload: read.ok ? read.payload : undefined }).state');
    expect(hook).toContain('holdPublishWorkspaceDropZone(current.current, context, dataTransfer)');
  });
});

describe('Paket 13 — Zustände ohne Farbe', () => {
  it('gibt jedem Zustand ein Zeichen, eine Form und Worte', () => {
    for (const state of ['closed', 'open', 'ready', 'choice', 'refused', 'resolved']) {
      expect(contract, state).toContain(`${state}: { glyph:`);
    }
    expect(contract).toContain('PUBLISH_WORKSPACE_DROP_ZONE_PRESENTATION');
    expect(overlay).toContain('{presentation.glyph}');
    expect(overlay).toContain('{presentation.headline}');
    expect(overlay).toContain('data-vgt-publish-drop-zone-glyph={presentation.glyph}');
    expect(overlay).toContain('data-vgt-publish-drop-zone-pattern={presentation.pattern}');
    // Die Rahmenform ist eine **Strichart**, kein Farbton.
    expect(overlay).toContain("dashed: 'border-dashed'");
    expect(overlay).toContain("solid: 'border-solid'");
    expect(overlay).toContain("double: 'border-double border-4'");
    // Vier Eckwinkel — die Zone bleibt auch ohne jeden Farbton erkennbar.
    expect(overlay).toContain('ECKEN.map((ecke)');
  });

  it('liest Erlaubnis und Grund aus dem Urteil statt aus einer Anzeigefarbe', () => {
    expect(overlay).toContain('data-vgt-publish-drop-zone-verdict={state.target.verdict}');
    expect(overlay).toContain('data-vgt-publish-drop-zone-reason={refusalCode ?? ');
    expect(overlay).toContain('publishWorkspaceDropZoneRefusalCode(state)');
    expect(overlay).not.toContain('className={state.phase');
  });

  it('versteckt keinen Zustand hinter Hover oder `aria-hidden`', () => {
    expect(overlay).not.toContain('opacity-0');
    expect(allDropCode).not.toContain('opacity-0');
    expect(overlay).toContain('role="status"');
    expect(overlay).toContain('aria-live="assertive"');
  });

  it('lässt die Ansageregion auch im leeren Zustand im DOM — sonst bliebe die Ansage stumm', () => {
    expect(overlay).toContain('PUBLISH_WORKSPACE_DROP_ZONE_IDLE_ANNOUNCEMENT');
    expect(overlay).toContain('data-vgt-publish-drop-zone-announcer={view}');
    // Die Ansageregion steht **vor** der bedingten Zone: sie wird nicht mit ihr geboren.
    expect(overlay.indexOf('data-vgt-publish-drop-zone-announcer')).toBeLessThan(overlay.indexOf('{visible && ('));
  });
});

describe('Paket 13 — die Tastatur ist modelliert, nicht nachgerüstet', () => {
  it('bindet die Taste an einen Befehl und führt denselben Weg aus', () => {
    expect(hook).toContain('resolvePublishWorkspaceDropCommand(current.current, event.key)');
    expect(hook).toContain('applyPublishWorkspaceDropCommand(previous, resolved.command, context)');
    expect(zone).toContain('export function confirmPublishWorkspaceDropZone(');
    expect(zone).toContain('export function choosePublishWorkspaceDropIntent(');
    // Derselbe Weg: „bestätigen" im Zustand `choice` ist wörtlich die Ablage.
    expect(zone).toContain("if (state.decision.kind === 'choice') return dropPublishWorkspaceDropZone(state, context);");
    // Und die Tastatur braucht **kein** Überfahren: der gemeinsame Abschluss fragt den Zustand nicht danach.
    expect(zone).toContain('function commitTransfer(');
    expect(zone).toContain('return commitTransfer(state, context);');
  });

  it('gibt jedem Knopf ein Tastenkürzel und lässt die Tastatur nicht ins Eingabefeld greifen', () => {
    expect(overlay).toContain('aria-keyshortcuts="Enter"');
    expect(overlay).toContain('aria-keyshortcuts="Escape"');
    expect(overlay).toContain('aria-keyshortcuts={choice.shortcutLabel}');
    expect(hook).toContain('isTypingTarget(event.target)');
    expect(hook).toContain('event.altKey || event.ctrlKey || event.metaKey');
    // Ein **abgeschalteter** Knopf wäre unerreichbar und könnte seinen Grund nicht ansagen.
    expect(overlay).toContain('aria-disabled={!canConfirm}');
    // `aria-disabled` ist **kein** `disabled`: nach dem Entfernen der einen Form bleibt keine andere übrig.
    expect(code(overlay).replace(/aria-disabled=/g, '')).not.toContain('disabled=');
  });

  it('bietet keine zeigergebundene Alternative als einzigen Weg', () => {
    expect(code(overlay)).not.toContain('onPointerDown');
    expect(code(overlay)).not.toContain('onMouseDown');
    expect(code(overlay)).not.toContain('onTouchStart');
    expect(code(overlay)).not.toMatch(/<div role="button"/);
  });
});

describe('Paket 13 — Touch ist entschieden und begründet', () => {
  it('legt `touch-action` benannt fest: `manipulation`, nie `none`', () => {
    expect(touch).toContain("PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_ACTION = 'manipulation'");
    expect(allDropCode).not.toContain('touch-action: none');
    expect(allDropCode).not.toMatch(/touchAction:\s*['"]none['"]/);
    expect(overlay).toContain('touchAction: strategy.touchAction');
    expect(overlay).toContain('data-vgt-publish-drop-zone-touch-action={strategy.touchAction}');
  });

  it('nennt den Systemabbruch mit dem Abbruchgrund der Zieh-Session und den Langdruck aus Paket 6', () => {
    expect(touch).toContain("PUBLISH_WORKSPACE_DROP_ZONE_TOUCH_CANCEL_REASON: PublishWorkspaceDropZoneCloseReason = 'pointer-lost'");
    expect(contract).toContain("Extract<DragEndReason, 'pointer-lost' | 'window-blur'>");
    expect(touch).toContain('DRAG_TOUCH_LONGPRESS_MS');
    expect(touch).toContain('publishWorkspaceDropZoneTouchDragBegins(');
    // Die Strategie ist **ein** benanntes Bündel — nicht drei Aufrufe, von denen man einen vergessen kann.
    expect(touch).toContain('export function publishWorkspaceDropTouchStrategy(');
    expect(overlay).toContain('publishWorkspaceDropTouchStrategy(inputKind)');
  });

  it('erkennt den Zug an `types`, weil `getData` während `dragover` geschützt ist', () => {
    // Ohne diese Unterscheidung gäbe es nie ein `preventDefault` und damit nie ein `drop`.
    expect(zone).toContain('export function isPublishWorkspaceDrag(');
    expect(hook).toContain('isPublishWorkspaceDrag(dataTransfer)');
    expect(hook).toContain('event.preventDefault?.()');
    expect(allDropRaw).toContain('NOT_TESTED');
  });
});

describe('Paket 13 — Selbstprüfung der eigenen relativen Importe', () => {
  // Die neunte Wiederholung dieser Falle im Projekt: ein relativer Import, der auf nichts zeigt, fällt erst beim
  // **Laden** auf — und dann als fremder roter Punkt. Deshalb wird hier **jeder** relative Import der Zone
  // aufgelöst, auch der **nur typisierte** (`import type`) und der in den Prüfdateien.
  const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '/index.ts', '/index.tsx'];
  /**
   * **Nur echte Import-Anweisungen.** Ein Muster, das jedes `from '…'` fängt, misst auch die **zitierten**
   * Pfade in den Zusicherungen dieses Vertrags — *eine Messung, die ihren eigenen Text mitzählt, meldet das
   * Messgerät als Defekt.* Deshalb: Zeilenanfang `import` und Kommentare entfernt.
   */
  const SPEC = /(?:^|\n)\s*import[\s\S]{0,600}?from\s+'(\.[^']+)'/g;

  const targets = [
    ...dropFiles.map((name) => `drop-zone/${name}`),
    ...readdirSync(here, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .map((name) => `testing/drop-zone/${name}`),
    'PublishView.tsx',
  ];

  it('löst jeden relativen Import auf eine vorhandene Datei auf', () => {
    let geprueft = 0;
    for (const target of targets) {
      const source = code(read(target));
      const base = path.dirname(path.resolve(publish, target));
      SPEC.lastIndex = 0;
      let match;
      while ((match = SPEC.exec(source)) !== null) {
        const resolved = path.resolve(base, match[1]);
        const found = EXTENSIONS.some((extension) => existsSync(`${resolved}${extension}`));
        expect(found, `${target} → ${match[1]}`).toBe(true);
        geprueft += 1;
      }
    }
    // **Nicht-Leerheit**: eine Messung, die nichts gemessen hat, ist keine Zusicherung.
    expect(geprueft).toBeGreaterThan(20);
  });
});

describe('Paket 15 — der Modus wird gesagt, nicht angenommen (`AST-1948`)', () => {
  it('reicht den Modus **bedingt gespreizt** in **beide** Resolver-Aufrufe', () => {
    // **Je ein** Vorkommen in der Fähigkeitsfrage **und** in der Zustellung. *Ein ausdrückliches `undefined`
    // wäre der heimliche Default, den Paket 15 verbietet — deshalb wird gespreizt, nicht gesetzt.*
    const spread = '(context.requestedMode === undefined ? {} : { requestedMode: context.requestedMode })';
    expect(zone.split(spread).length - 1).toBe(2);
    // Die **Absicht** wird in der Fähigkeitsfrage weiterhin **einzeln** gefragt (der Falz bleibt ein Falz).
    expect(zone).toContain('requestedIntent: intent,');
    // Der Kontext trägt das Feld — *die Zone selbst erfindet keinen Modus.*
    expect(zone).toContain('readonly requestedMode?: unknown;');
    expect(zone).not.toMatch(/requestedMode:\s*undefined/);
  });

  it('trennt **Angebot** (`evaluateWorkspaceDrop`) und **Bestellung** (`resolveWorkspaceDrop`)', () => {
    // Ohne diese Trennung käme ein Live-Träger ohne Modus als `resolved` zurück — *eine Zustellung **ohne**
    // Modus, also genau der heimliche Default, den Paket 15 verbietet.*
    expect(zone).toContain('assessment = intent === undefined');
    expect(zone).toContain('? evaluateWorkspaceDrop(request, registry)');
    expect(zone).toContain(': resolveWorkspaceDrop(request, registry);');
    // Und die Fähigkeitsfrage **toleriert** den fehlenden Modus — *sie ist keine Frage der Route.*
    expect(zone).toContain("return assessment.code === 'drop_live_mode_required';");
  });

  it('trägt Integrationsart und Modus bis in die sichtbare Auflösung', () => {
    expect(contract).toContain('readonly integrationKind: WorkspaceIntegrationKind;');
    expect(contract).toContain('readonly mode?: WorkspaceLiveMode;');
    expect(zone).toContain('...(selection.mode === undefined ? {} : { mode: selection.mode }),');
    expect(overlay).toContain('data-vgt-publish-drop-zone-resolution-kind={delivered.integrationKind}');
    expect(overlay).toContain('data-vgt-publish-drop-zone-resolution-mode={delivered.mode ?? ');
    // **Kein heimlicher Default in Worten:** ohne gewählten Modus steht „mode not chosen" — nicht „Live".
    expect(overlay).toContain("'mode not chosen'");
  });

  it('bindet die Eingabeart an die **eine** Übersetzung aus Paket 6 (`W-446`)', () => {
    // Als eigener Marker, damit die Dedup nicht still zurückfällt: die lokale Kopie ist **weg**.
    expect(allDropCode).toContain('dragInputKindFromPointerType');
    expect(allDropCode).not.toContain('publishWorkspaceDropInputKind');
    expect(hook).toContain('dragInputKindFromPointerType(pointerType)');
  });
});
