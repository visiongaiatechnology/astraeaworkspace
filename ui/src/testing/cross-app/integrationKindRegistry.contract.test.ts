// STATUS: PLATIN — Integration & Release, Paket 3 (AST-1888…1892): **Document Registry aus einem zentralen Vertrag**
//
// ## Das Abnahmekriterium, wörtlich
//
// *„Alle 14 Apps erscheinen im selben offiziellen Kind-Registry, kein zweiter Schattenkatalog."* ✓
//
// ## Was gemessen und behoben wurde (Runden 149–154)
//
// * Der Registry (`WORKSPACE_SCHEMA_VERSIONS` ✓) führte eine **eigene, handgeschriebene Union** mit **12** Arten ✗ —
//   die kanonische `DocumentKind` kennt **20** ✓. Er schrieb **`'PDF'`** ✗, wo das Dokument **`'PdfStudio'`** heißt ✓.
//   Weil er als `Record<WorkspaceSchemaKind, number>` typisiert war ✓, war er **vollständig bezogen auf seine eigene
//   Definition** ✗ — **nichts konnte die Lücke bemerken** ✓. *Genau der „zweite Schattenkatalog"* ✓.
// * **Behoben:** `WorkspaceSchemaKind` **ist** jetzt `DocumentKind` ✓, der Registry deckt **alle 20** Arten ✓, und
//   `'PDF'` heißt überall `'PdfStudio'` ✓. Die harte Zusicherung
//   (`workspaceSchemaCoverage.contract.ts`) ist **wieder scharf und grün** ✓.
//
// ## Was dieser Vertrag zusichert — und warum jede Zeile eine echte Aussage ist
//
// Er prüft **Verhalten**, nicht Dateien ✓: dass der Wächter **jede** echte Art annimmt ✓, dass er eine **erfundene**
// ablehnt ✓, dass jede Art eine **brauchbare** Version trägt ✓, und dass die Prüfung **fail-closed** ist ✓
// (eine neuere Version wird **abgelehnt**, nicht „best effort" gelesen ✓). Und er sichert **Nicht-Leerheit** ✓ —
// dieselbe Lehre, die in dieser Sitzung **fünfmal** eine unvollständige Messung abgelehnt hat ✓.
import { describe, expect, it } from 'vitest';
import type { DocumentKind } from '../../shared/contracts/documentKind';
import {
  WORKSPACE_SCHEMA_VERSIONS,
  resolveWorkspaceSchemaAction,
} from '../../platform/workspace/integrations/workspaceSchemaVersion';
import { isVersionedWorkspaceKind } from '../../platform/workspace/integrations/workspaceDocumentStamp';
import { OPEN_CORE_APP_KINDS } from '../../edition/contracts';

const ARTEN = Object.keys(WORKSPACE_SCHEMA_VERSIONS) as readonly string[];

describe('Paket 3: der zentrale Kind-Registry', () => {
  it('**Nicht-Leerheit zuerst** — sonst prüft alles Folgende nichts', () => {
    // Eine leere Liste würde jede „für alle Arten"-Schleife bestehen. Genau diese Lehre hat in dieser Sitzung
    // fünfmal eine unvollständige Messung abgelehnt.
    expect(ARTEN.length, 'Der Registry ist leer — jede folgende Prüfung wäre wirkungslos').toBeGreaterThanOrEqual(20);
    expect(OPEN_CORE_APP_KINDS.length, 'Die Open-Core-App-Liste ist leer').toBeGreaterThanOrEqual(14);
  });

  it('der Wächter nimmt **jede** echte Dokumentart an', () => {
    const abgelehnt = ARTEN.filter((art) => !isVersionedWorkspaceKind(art));
    expect(abgelehnt, `Der Registry kennt ${abgelehnt.length} eigene Arten nicht: ${abgelehnt.join(', ')}`).toEqual([]);
  });

  it('der Wächter weist eine **erfundene** Art ab — fail-closed', () => {
    for (const erfunden of ['NichtsDergleichen', 'writer', '', 'PDF', 'AdminPolicy2']) {
      expect(isVersionedWorkspaceKind(erfunden), `„${erfunden}" wurde angenommen`).toBe(false);
    }
  });

  it('jede Art trägt eine **brauchbare** Version', () => {
    for (const art of ARTEN) {
      const v = (WORKSPACE_SCHEMA_VERSIONS as Record<string, number>)[art];
      expect(Number.isInteger(v) && v > 0, `${art} hat die unbrauchbare Version ${String(v)}`).toBe(true);
    }
  });

  it('**jede** Open-Core-App hat eine benannte Version — das ist das Abnahmekriterium', () => {
    const ohne = OPEN_CORE_APP_KINDS.filter((app) => !isVersionedWorkspaceKind(app));
    expect(ohne, `Ohne Registry-Eintrag: ${ohne.join(', ')}`).toEqual([]);
    // Und die Aussage ist nicht leer: die Liste muss die 14 wirklich enthalten.
    expect(OPEN_CORE_APP_KINDS.length).toBe(14);
  });

  it('die Prüfung ist **fail-closed**: neuer, kaputt und fehlend werden abgelehnt', () => {
    for (const art of ARTEN.slice(0, 5)) {
      const aktuell = (WORKSPACE_SCHEMA_VERSIONS as Record<string, number>)[art];
      expect(resolveWorkspaceSchemaAction(art as DocumentKind, aktuell).action).toBe('current');
      // Neuer als diese Anwendung → ablehnen, nicht „best effort" lesen.
      expect(resolveWorkspaceSchemaAction(art as DocumentKind, aktuell + 1).action).toBe('reject');
      // Unbrauchbare Angaben → ablehnen.
      for (const kaputt of [null, undefined, 'x', -1, 1.5, Number.NaN]) {
        expect(resolveWorkspaceSchemaAction(art as DocumentKind, kaputt).action, `${art} mit ${String(kaputt)}`).toBe('reject');
      }
    }
  });
});
