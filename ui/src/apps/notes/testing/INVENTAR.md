# Inventar notes — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **96**
- Testdateien: **49**
- Zeilen Produktion: **16,296**
- Dateien >350 LOC: **10**
- Dateien >500 LOC: **3**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `drop-zone/notesDropZone.ts` | 832 |
| `notebooks/useNotesManager.ts` | 632 |
| `editor/NotesEditorBody.tsx` | 551 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `interchange/onenote/notesOneNoteRoundtrip.ts` | 452 |
| `interchange/notesImportExport.ts` | 449 |
| `knowledge-graph/notesKnowledgeGraph.ts` | 405 |
| `search/notesSearchEngine.ts` | 393 |
| `editor/toolbar/NotesEditorToolbar.tsx` | 382 |
| `canvas/ink/notesInkEngine.ts` | 362 |
| `model/notesHierarchy.ts` | 355 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 47 |
| `lucide-react` | 27 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
