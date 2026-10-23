# Inventar whiteboard — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **85**
- Testdateien: **55**
- Zeilen Produktion: **17,465**
- Dateien >350 LOC: **16**
- Dateien >500 LOC: **6**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `drop-zone/whiteboardDropZone.ts` | 773 |
| `app/WhiteboardCanvas.tsx` | 725 |
| `model/whiteboardManipulationEngine.ts` | 584 |
| `integrations/canvasExport.ts` | 578 |
| `model/whiteboardDiagramEngine.ts` | 518 |
| `tools/DrawAdvancedModal.tsx` | 513 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `live-objects/whiteboardLiveObjectEngine.ts` | 484 |
| `integrations/WhiteboardInteropModal.tsx` | 478 |
| `model/whiteboardCollaborationEngine.ts` | 440 |
| `model/whiteboardFacilitationEngine.ts` | 434 |
| `canvas/WhiteboardCanvas.css` | 415 |
| `viewport/whiteboardViewportEngine.ts` | 405 |
| `objects/WhiteboardItemsRenderer.tsx` | 395 |
| `rendering/whiteboardSpatialIndexEngine.ts` | 386 |
| `integrations/whiteboardRoundtripTestSuite.ts` | 381 |
| `state/useWhiteboardState.ts` | 365 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 44 |
| `lucide-react` | 18 |
| `react-dom` | 1 |
| `vitest` | 1 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
