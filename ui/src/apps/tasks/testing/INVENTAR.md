# Inventar tasks — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **45**
- Testdateien: **28**
- Zeilen Produktion: **7,930**
- Dateien >350 LOC: **7**
- Dateien >500 LOC: **1**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `interchange/taskIcalendarVtodo.ts` | 660 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `recurrence/taskRecurrence.ts` | 487 |
| `model/taskModel.ts` | 485 |
| `interchange/TaskRoundtripModal.tsx` | 414 |
| `collaboration/TaskCollaborationPanel.tsx` | 383 |
| `app/TasksOnlyManagement.tsx` | 364 |
| `interchange/taskInterchangeEngine.ts` | 357 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 18 |
| `lucide-react` | 15 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
