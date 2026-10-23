// @vitest-environment happy-dom
/**
 * GAP-0042, Runde 318: DER VERHALTENSNACHWEIS — `confirm()` RUFT DEN VERBRAUCHER.
 *
 * WAS BISHER FEHLTE, UND WARUM ES DER KERN DIESES EINTRAGS IST: die Runden 315
 * und 316 haben den Verbraucher GEBAUT (`whiteboardLiveAcceptance.ts`) und ihn
 * VERDRAHTET (`onDelivered` im Hook, Schreibstelle im Canvas), und Runde 317 hat
 * die Sorge AUSGERAEUMT, dass die versiegelte Matrix die Route nicht traegt.
 * ABER KEIN Test hat je gemessen, dass ein `confirm()` durch den Hook wirklich
 * bei `onDelivered` ankommt. Ohne diesen Nachweis ist die Verdrahtung eine
 * Zusage ueber eine Wirkung, die niemand geprueft hat.
 *
 * WAS DIESER TEST MISST, UND WAS ER NICHT MISST:
 *   Er misst den GANZEN Weg durch den Hook: ein echtes `drop`-Ereignis mit einem
 *   echten Traeger -> der Zustand ist `delivered` -> ein echtes `click` auf den
 *   Knopf -> `onDelivered` wird MIT der Aufloesung gerufen.
 *   Er misst NICHT, dass der Canvas das Item in `updateItems` schreibt — das ist
 *   der Aufrufer, und sein Nachweis steht noch aus.
 *
 * UND WARUM `react-dom/client` UND NICHT `@testing-library/react`: das Paket ist
 * in diesem Projekt NICHT installiert (gemessen in Runde 318:
 * `node_modules/@testing-library/react` fehlt, `package.json` nennt es nicht).
 * Alle 26 happy-dom-Dateien dieses Projekts rendern mit `createRoot` aus
 * `react-dom/client` und `act` aus `react` — dieselbe Form wie hier.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_OBJECT_DRAG_MIME } from '../../../../shell/fabric/fabricGraphWorkspaceDrop';
import { useWhiteboardDropZone } from '../../drop-zone/useWhiteboardDropZone';
import type { WhiteboardDropResolution } from '../../drop-zone/whiteboardDropZoneContract';

/**
 * Die Fixtures sind VOLLSTAENDIG typisiert — kein Cast. Das ist die Form des
 * bestehenden `whiteboardDropZone.test.ts:80-119`, und sie ist besser als ein
 * `as WorkspaceDocument`: ein Cast haette verdeckt, wenn ein Pflichtfeld fehlt.
 */
const source: WorkspaceDocument = {
  schema_version: 2,
  id: 'grid-source',
  title: 'Forecast',
  kind: 'Grid',
  created_at: 1,
  modified_at: 1,
  version: 3,
  theme_id: 'cosmic-obsidian',
  root_object_ids: ['table-forecast'],
  objects: {
    'table-forecast': {
      type: 'Table',
      data: { id: 'table-forecast', rows: 1, cols: 1, cells: { A1: { value: 'private-cell' } } },
    },
  },
};

const target: WorkspaceDocument = {
  schema_version: 2,
  id: 'board-target',
  title: 'Workshop board',
  kind: 'Whiteboard',
  created_at: 1,
  modified_at: 1,
  version: 4,
  theme_id: 'cosmic-obsidian',
  root_object_ids: [],
  objects: {},
};

const documents: Readonly<Record<string, WorkspaceDocument>> = {
  [source.id]: source,
  [target.id]: target,
};

/** Ein Traeger mit GENAU EINER Absicht — dann ist die Route eindeutig und der Zustand `delivered`. */
const oneIntentPayload = serializeWorkspaceDragPayload(
  createWorkspaceDragPayload({
    documentId: source.id,
    objectId: 'table-forecast',
    objectKind: 'Table',
    sourceApp: 'Grid',
    supportedIntents: ['COPY'],
  }),
);

/**
 * Ein `dataTransfer`, das die zwei Fragen des Hooks beantwortet:
 * `isWhiteboardWorkspaceDrag` liest `types` (`whiteboardDropZone.ts:260-270`),
 * `readWhiteboardWorkspaceTransfer` ruft `getData` mit der MIME (`:234-250`).
 */
function dataTransferMit(payload: string) {
  return {
    types: [FABRIC_WORKSPACE_OBJECT_DRAG_MIME],
    getData: (mime: string) => (mime === FABRIC_WORKSPACE_OBJECT_DRAG_MIME ? payload : ''),
    setData: () => undefined,
    dropEffect: 'copy',
    effectAllowed: 'copy',
  };
}

/**
 * Ein `drop`-Ereignis mit angehaengtem `dataTransfer`.
 *
 * WARUM `Object.defineProperty`: `dataTransfer` ist an einem echten `DragEvent`
 * nur lesbar, und `happy-dom` stellt nicht jede DragEvent-Variante bereit. Ein
 * schlichtes `Event` mit einem definierten `dataTransfer` ist genau das, was der
 * Hook liest — er ruft `event.dataTransfer` und `event.preventDefault()`.
 */
function dropEvent(payload: string): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransferMit(payload), configurable: true });
  return event;
}

function Harness({ onDelivered }: { onDelivered: (resolution: WhiteboardDropResolution) => void }) {
  const zone = useWhiteboardDropZone({ targetDocument: target, documents, onDelivered });
  return (
    <div data-vgt-test="zone" onDrop={zone.onDrop} onDragOver={zone.onDragOver}>
      <button type="button" data-vgt-test="confirm" onClick={zone.confirm}>
        bestaetigen
      </button>
      <span data-vgt-test="kind">{zone.state.decision.kind}</span>
    </div>
  );
}

function renderHarness(onDelivered: (resolution: WhiteboardDropResolution) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness onDelivered={onDelivered} />);
  });
  const zone = container.querySelector('[data-vgt-test="zone"]');
  const confirm = container.querySelector('[data-vgt-test="confirm"]');
  const kind = container.querySelector('[data-vgt-test="kind"]');
  if (!zone || !confirm || !kind) throw new Error('die Testflaeche wurde nicht gerendert');
  return { container, root, zone, confirm, kind };
}

describe('GAP-0042 — der Verbraucher wird durch den Hook erreicht', () => {
  it('meldet NICHTS, solange nicht bestaetigt wurde', () => {
    const onDelivered = vi.fn();
    const { zone, kind } = renderHarness(onDelivered);
    act(() => {
      zone.dispatchEvent(dropEvent(oneIntentPayload));
    });
    expect(kind.textContent).toBe('delivered');
    // Der Zustand ist zugestellt — aber gemeldet wird erst beim Bestaetigen.
    expect(onDelivered).not.toHaveBeenCalled();
  });

  it('ruft onDelivered mit der Aufloesung, wenn bestaetigt wird', () => {
    const onDelivered = vi.fn();
    const { zone, confirm } = renderHarness(onDelivered);
    act(() => {
      zone.dispatchEvent(dropEvent(oneIntentPayload));
    });
    act(() => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDelivered).toHaveBeenCalledTimes(1);
    const resolution = onDelivered.mock.calls[0][0] as WhiteboardDropResolution;
    expect(resolution.adapterId).toBe('fabric-grid-table-to-whiteboard');
    expect(resolution.intent).toBe('COPY');
    expect(resolution.sourceDocumentId).toBe('grid-source');
    expect(resolution.sourceObjectId).toBe('table-forecast');
    expect(resolution.targetDocumentId).toBe('board-target');
  });

  it('laesst den Verbraucher WEG, wenn keine Zustellung vorliegt', () => {
    const onDelivered = vi.fn();
    const { confirm, kind } = renderHarness(onDelivered);
    // Ohne Drop ist der Zustand `none` — ein `confirm` darf nichts melden.
    expect(kind.textContent).toBe('none');
    act(() => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDelivered).not.toHaveBeenCalled();
  });

  it('ruft den Verbraucher GENAU EINMAL je Bestaetigung', () => {
    const onDelivered = vi.fn();
    const { zone, confirm } = renderHarness(onDelivered);
    act(() => {
      zone.dispatchEvent(dropEvent(oneIntentPayload));
    });
    act(() => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Zwei Bestaetigungen sind zwei Meldungen — ueber das Duplikat entscheidet
    // der AUFRUFER (`acceptWhiteboardTableDrop`, `-already-placed`), nicht der
    // Hook. Das ist die Trennung aus Runde 316.
    expect(onDelivered).toHaveBeenCalledTimes(2);
  });
});
