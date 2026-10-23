# Inventar present — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **101**
- Testdateien: **52**
- Zeilen Produktion: **20,940**
- Dateien >350 LOC: **13**
- Dateien >500 LOC: **5**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `editor/inspector/PresentObjectInspector.tsx` | 935 |
| `canvas/PresentStageCanvas.tsx` | 870 |
| `integrations/workspace-drop/presentWorkspaceDropZone.ts` | 699 |
| `editor/SlideContentEditor.tsx` | 671 |
| `editor/toolbar/PresentTopToolbar.tsx` | 618 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `PresentCanvas.tsx` | 452 |
| `presenter/PresenterModeModal.tsx` | 420 |
| `design/presentDesign.ts` | 408 |
| `editor/navigation/PresentSidebar.tsx` | 407 |
| `interchange/render/presentExport.ts` | 402 |
| `canvas/model/presentScene.ts` | 387 |
| `interchange/video/presentVideoExport.ts` | 382 |
| `canvas/rendering/PresentSceneObjectView.tsx` | 365 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 44 |
| `lucide-react` | 33 |
| `react-dom` | 1 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
