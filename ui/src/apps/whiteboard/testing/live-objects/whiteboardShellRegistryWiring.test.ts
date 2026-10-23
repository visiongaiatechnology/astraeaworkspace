/**
 * GAP-0042, Runde 317: TRAEGT DIE VERSIEGELTE MATRIX DER SHELL DIE WHITEBOARD-ROUTE?
 *
 * DIE FRAGE, UND WARUM SIE VOR DEM VERHALTENSNACHWEIS STEHT: der Hook
 * `useWhiteboardDropZone` baut seinen Kontext mit
 * `registry: FABRIC_WORKSPACE_DROP_REGISTRY` (`useWhiteboardDropZone.ts:40`,
 * `:136`) — der versiegelten Matrix der Shell, nicht einer eigenen. UND
 * `whiteboardDropZone.test.ts:156-157` sagt im Kommentar, der Test baue eine
 * EIGENE Matrix, „weil die Shell heute **keine** hat".
 *
 * Wenn die versiegelte Matrix keine Whiteboard-Route traegt, dann liefert
 * `confirm()` NIE `decision.kind === 'delivered'` — und die Verdrahtung dieser
 * und der letzten Runde waere WIRKUNGSLOS, obwohl alle Tests gruen sind. Das ist
 * genau die Klasse Fehler, die dieser Eintrag beschreibt: eine Meldung, die
 * etwas behauptet, das nicht stattfindet.
 *
 * DIESE SONDE AENDERT NICHTS. Sie liest.
 */
import { describe, expect, it } from 'vitest';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../../../shell/fabric/fabricGraphWorkspaceDrop';

describe('die versiegelte Matrix der Shell und die Whiteboard-Route', () => {
  it('kennt den Adapter fabric-grid-table-to-whiteboard', () => {
    // DER IMPORT OBEN IST DER PUNKT: `fabricGraphWorkspaceDrop.ts` fuehrt die
    // `registerAppManifest`- und `registerAdapter`-Aufrufe beim Laden aus und
    // versiegelt die Matrix in `:346`. Ohne den Import waere die Matrix leer.
    const adapter = FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Whiteboard', 'Table', 'COPY');
    expect(adapter).toBeDefined();
    expect(adapter?.id).toBe('fabric-grid-table-to-whiteboard');
  });

  it('nennt das Whiteboard als Ziel', () => {
    const adapter = FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Whiteboard', 'Table', 'COPY');
    expect(adapter?.targetApp).toBe('Whiteboard');
    expect(adapter?.objectKinds).toContain('Table');
    expect(adapter?.intents).toContain('COPY');
  });

  it('und die Whiteboard-Seite IMPORTIERT Table — sonst wuerfe die Registrierung', () => {
    // `registerAdapter` prueft in `workspaceInteractionRegistry.ts:117`
    // `hasCapability(targetManifest.imports, kind, intent)`. Dass der Adapter
    // ueberhaupt in der versiegelten Matrix steht, IST der Beweis, dass das
    // Manifest die Faehigkeit traegt.
    const manifest = FABRIC_WORKSPACE_DROP_REGISTRY.getManifest('Whiteboard');
    expect(manifest).toBeDefined();
    expect(
      manifest?.imports.some(
        (capability) => capability.objectKind === 'Table' && capability.intents.includes('COPY'),
      ),
    ).toBe(true);
  });
});
