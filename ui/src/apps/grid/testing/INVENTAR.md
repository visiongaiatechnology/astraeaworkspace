# Inventar grid — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **188**
- Testdateien: **96**
- Zeilen Produktion: **37,756**
- Dateien >350 LOC: **34**
- Dateien >500 LOC: **12**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `pivots/GridPivotPanel.tsx` | 736 |
| `formulas/gridFormulaCatalog.ts` | 695 |
| `formulas/gridFormulaEngine.ts` | 606 |
| `state/useGridState.ts` | 592 |
| `canvas/GridTableCanvas.tsx` | 561 |
| `queries/gridPowerQueryEngine.ts` | 557 |
| `interchange/gridXlsxOdsRoundtrip.ts` | 556 |
| `GridSheet.tsx` | 547 |
| `formulas/gridFormulaSerialDate.ts` | 532 |
| `formatting/gridNumberFormat.ts` | 523 |
| `formulas/gridFormulaDiagnostics.ts` | 519 |
| `formulas/gridFormulaMath.ts` | 505 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `data/gridDataProjection.ts` | 487 |
| `formulas/gridFormulaAdvanced.ts` | 482 |
| `toolbar/GridFormulaBar.tsx` | 475 |
| `formulas/GridFormulaAssistant.tsx` | 430 |
| `formulas/gridFormulaFunctionDispatcher.ts` | 429 |
| `interchange/gridDelimitedImport.ts` | 429 |
| `formulas/gridFormulaAssist.ts` | 426 |
| `pivots/gridPivotPreview.ts` | 423 |
| `canvas/gridVirtualCanvasRenderer.ts` | 416 |
| `integrations/gridWorkspacePublish.ts` | 413 |
| `interchange/GridRoundtripModal.tsx` | 402 |
| `formatting/gridFormatValidation.ts` | 395 |
| `pivots/gridPivotBuilder.ts` | 394 |
| `formatting/gridFormattingEngine.ts` | 388 |
| `formatting/GridFormattingPanel.tsx` | 385 |
| `toolbar/GridBottomBar.tsx` | 382 |
| `formulas/gridFormulaReferences.ts` | 381 |
| `formulas/gridFormulaInfoLookup.ts` | 379 |
| `what-if/GridWhatIfModal.tsx` | 371 |
| `formulas/legacy/gridStatisticsToolpak.ts` | 368 |
| `canvas/GridVirtualCanvas.tsx` | 365 |
| `overlays/GridModals.tsx` | 352 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

| Name | Dateien |
|---|---|
| `GRID_MAX_ROWS` | `editing/gridNameBox.ts`, `formulas/gridFormulaSpill.ts` |
| `formulaErrorTypeCode` | `formulas/gridFormulaDiagnostics.ts`, `formulas/gridFormulaTypes.ts` |
| `shiftFormulaReferences` | `editing/gridAutoFill.ts`, `editing/gridSelection.ts` |

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 47 |
| `lucide-react` | 23 |
| `react-dom` | 2 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
