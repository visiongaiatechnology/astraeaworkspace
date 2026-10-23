# Inventar draw — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **55**
- Testdateien: **45**
- Zeilen Produktion: **13,678**
- Dateien >350 LOC: **10**
- Dateien >500 LOC: **3**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `drop-zone/drawDropZone.ts` | 736 |
| `integrations/drawWorkspaceIntegration.ts` | 549 |
| `interactions/drawCanvasSession.ts` | 549 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `model/drawVectorEngine.ts` | 494 |
| `interactions/drawInteractionController.ts` | 477 |
| `canvas/DrawCanvas.tsx` | 451 |
| `canvas/DrawInteractiveSurface.tsx` | 446 |
| `model/drawDataEngine.ts` | 440 |
| `interactions/drawCommandEngine.ts` | 411 |
| `model/drawDocumentEngine.ts` | 356 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 12 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
