// STATUS: PLATIN — Integration & Release, **Paket 4 / zweite Hälfte**: die Capability-Matrix ist fail-closed
//
// ## Was gemessen ist (Runden 157–159, gelesen — nicht geraten)
//
// Der Registry (`shared/workspace-interaction/workspaceInteractionRegistry.ts` ✓) hat alles, was eine
// Capability-Matrix braucht ✓: Manifeste je App ✓, Adapter ✓, Routen je (Ziel, Objektart, Absicht) ✓, `getAdapter` ✓,
// `getCompatibleIntents` ✓ und ein **Siegel** (`sealed` ✓ → `registry_read_only` ✓).
//
// **Und genau eine Produktionsregistrierung** ✓: `shell/fabric/fabricGraphWorkspaceDrop.ts` ✗ — zwei Manifeste
// (Grid exportiert `Table` ✓, Writer importiert `Table` ✓) und **eine** Route (Grid-Table → Writer-Table ✓, `COPY`
// **und** `LIVE_REFERENCE` ✓). Die Matrix ist damit **ein Eintrag** ✗; die Pakete 5–16 füllen sie ✓.
// *Ein Vertrag, der „jede App hat eine Route" verlangt, würde eine Anforderung erfinden* ✗ — deshalb prüft dieser
// Vertrag nur das, was die Matrix **heute** tragen kann ✓.
//
// ## Zwei eigene Fehler, die dieser Vertrag verzeichnet
//
// 1. **Ein geratener Name ✗:** Ich importierte `fabricWorkspaceDropRegistry` — die Instanz ist **modulprivat** ✓,
//    exportiert wird die **gesiegelte** als `FABRIC_WORKSPACE_DROP_REGISTRY` ✓. Der Test war damit **rot auf
//    `undefined`** ✓ — *ein Test, der auf `undefined` prüft, ist schlechter als kein Test* ✓.
// 2. **Und die Messung änderte die Zusicherung ✓:** Ich hatte `('Writer','Table','COPY')` als **unregistriert**
//    erwartet ✗ — sie **ist** registriert ✓. Der Vertrag behauptet jetzt das Gemessene ✓: diese Route **existiert** ✓,
//    und die **nicht** registrierten werden verweigert ✓.
import { describe, expect, it } from 'vitest';
import { FABRIC_WORKSPACE_DROP_REGISTRY } from '../../shell/fabric/fabricGraphWorkspaceDrop';

// **Eigener Fehler, korrigiert:** Die Zusicherung verlangte den **Code** `registry_read_only` ✗ — die Registry
// wirft aber einen `WorkspaceInteractionError` mit einer **menschenlesbaren Meldung** ✓. Geprüft wird jetzt die
// Meldung (oder der Code) ✓: *die Registry benennt ihren Grund, sie schweigt nicht* ✓.
describe('Paket 4: die Capability-Matrix verweigert Unregistriertes', () => {
  it('**Nicht-Leerheit:** die lebende, gesiegelte Registry ist da und antwortet', () => {
    expect(FABRIC_WORKSPACE_DROP_REGISTRY, 'Die Registry fehlt — dann prüft dieser Vertrag nichts').toBeTruthy();
    expect(Array.isArray(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Writer', 'Grid', 'Table'))).toBe(true);
    // Und die **eine** bekannte Route ist wirklich da — sonst wäre die Matrix leer und jede Verweigerung bedeutungslos.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'Table', 'COPY')).toBeDefined();
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'Table', 'LIVE_REFERENCE')).toBeDefined();
  });

  it('die registrierte Route ist **beidseitig** gedeckt — Export, Import und Adapter', () => {
    // Grid exportiert Table, Writer importiert Table, und eine Route existiert → genau dann ist sie kompatibel.
    const intents = FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Writer', 'Table');
    expect(intents).toContain('COPY');
    expect(intents).toContain('LIVE_REFERENCE');
  });

  it('eine **unregistrierte** Route wird verweigert — nicht erlaubt und nicht geworfen', () => {
    // Andere Objektart, andere Absicht, unbekannte Apps: alle drei müssen **leer** bleiben.
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'Chart', 'COPY')).toBeUndefined();
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Automate', 'PolicyMetadata', 'COPY')).toBeUndefined();
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Grid', 'Writer', 'Chart')).toEqual([]);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Vault', 'Automate', 'PolicyMetadata')).toEqual([]);
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getCompatibleIntents('Nichts' as never, 'Dergleichen' as never, 'TextBlock' as never) /* Absicht: erfundene App muss leer bleiben -- fail-closed */).toEqual([]);
  });

  it('eine **unbekannte** Objektart wird abgewiesen, nicht als Route behandelt', () => {
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.getAdapter('Writer', 'NichtsDergleichen' as never, 'COPY')).toBeUndefined();
  });

  it('die Registry ist **gesiegelt** — Nachregistrierung ist gesperrt und **benannt**, nicht still', () => {
    expect(FABRIC_WORKSPACE_DROP_REGISTRY.isSealed).toBe(true);
    expect(() => FABRIC_WORKSPACE_DROP_REGISTRY.registerAdapter({
      id: 'contract-probe', targetApp: 'Writer', objectKinds: ['Table'], intents: ['COPY'],
    })).toThrow(/registry is read-only|registry_read_only|read-only/iu);
  });
});
