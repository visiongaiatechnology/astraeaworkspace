# Inventar automate — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **31**
- Testdateien: **7**
- Zeilen Produktion: **3,907**
- Dateien >350 LOC: **2**
- Dateien >500 LOC: **1**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `canvas/AutomateCanvasTheme.css` | 508 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `model/automateConfigSchema.ts` | 410 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

Keine mehrfachen Exportnamen gefunden.

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 8 |
| `lucide-react` | 8 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
