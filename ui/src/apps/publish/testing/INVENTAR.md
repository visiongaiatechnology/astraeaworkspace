# Inventar publish — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **51**
- Testdateien: **26**
- Zeilen Produktion: **10,583**
- Dateien >350 LOC: **7**
- Dateien >500 LOC: **3**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `drop-zone/publishWorkspaceDropZone.ts` | 852 |
| `editor/PublishInspector.tsx` | 737 |
| `PublishView.tsx` | 525 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `prepress/PublishAdvancedModal.tsx` | 481 |
| `canvas/PublishCanvas.tsx` | 474 |
| `model/publishDocumentEngine.ts` | 462 |
| `model/publishTextFlowOps.ts` | 411 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 10 |
| `lucide-react` | 6 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
