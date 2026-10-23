# Belegzuordnung grid — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 96 Testdateien unter `ui/apps/grid/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1223` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1224` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1225` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1226` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1227` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1228` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1229` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1230` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1231` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1232` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1233` | reale Zielstruktur aus `app/editor/workbook/sheets/cells/formulas/charts/pivot/toolbar/panels/dialogs/state/model/domain | testing/interchange/gridWorkbookExport.test.ts, testing/search/gridWorkbookFindReplaceAccess.security.test.ts, testing/workbook/gridWorkbookStructure.security.test.ts |
| `ASR-1234` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1235` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | **KEIN BELEG** |
| `ASR-1236` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1237` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1238` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1239` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1240` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1241` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1242` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1243` | lokale Hooks lokal halten. | testing/contracts/gridImportDepth.contract.test.mjs |
| `ASR-1244` | lokale Utilities lokal halten. | testing/contracts/gridImportDepth.contract.test.mjs |
| `ASR-1245` | lokale Types lokal halten. | testing/editing/gridCellTypes.security.test.ts, testing/interchange/gridDelimitedImport.test.ts, testing/formulas/gridFormulaZoneOffsetLookup.test.ts |
| `ASR-1246` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1247` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/contracts/gridImportDepth.contract.test.mjs, testing/formulas/gridFormulaReserve.contract.test.mjs, testing/filters/gridSlicerAutoFilterWiring.contract.test.mjs |
| `ASR-1248` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/canvas/gridSelectionIndexWiring.contract.test.mjs, testing/canvas/gridSelectionIndex.test.ts, testing/integrations/gridWorkspacePublish.test.ts |
| `ASR-1249` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1250` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/integrations/gridWorkbookExportReachable.contract.test.mjs, testing/data/gridSortDialog.test.ts |
| `ASR-1251` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1252` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1253` | App-/Route-/Command-/Provider-IDs stabil halten. | **KEIN BELEG** |
| `ASR-1254` | DocumentKind und native File Extension stabil halten. | testing/interchange/gridWorkbookExport.test.ts, testing/interchange/gridDelimitedImport.test.ts |
| `ASR-1255` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1256` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-1257` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1258` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1259` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1260` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/contracts/gridImportDepth.contract.test.mjs, testing/formulas/gridFormulaReserve.contract.test.mjs, testing/contracts/gridFormulaAndSortWiring.test.mjs |
| `ASR-1261` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/integrations/gridWorkspacePublish.test.ts, testing/formulas/gridFormulaReserve.contract.test.mjs, testing/contracts/gridImportDepth.contract.test.mjs |
| `ASR-1262` | Roundtrip `Workbook → Sheet edit → Formula/Chart → Save → Reopen` unter `testing/roundtrip/` ablegen. | locale/testing/GridSheetEditPanel.locale.test.tsx, testing/interchange/gridWorkbookExport.test.ts, testing/formulas/gridCrossSheetFormula.test.ts |
| `ASR-1263` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1264` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1265` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/interchange/gridWorkbookExport.test.ts, testing/integrations/gridWorkbookExportReachable.contract.test.mjs, testing/contracts/gridImportDepth.contract.test.mjs |
| `ASR-1266` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1267` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1268` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1269` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1270` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1271` | Crimson Command visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1272` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1273` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx, locale/testing/gridToolbarLocale.test.ts |
| `ASR-1274` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx, locale/testing/gridToolbarLocale.test.ts |
| `ASR-1275` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx, locale/testing/gridToolbarLocale.test.ts |
| `ASR-1276` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx, locale/testing/gridToolbarLocale.test.ts |
| `ASR-1277` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx, locale/testing/gridToolbarLocale.test.ts |
| `ASR-1278` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx, locale/testing/gridToolbarLocale.test.ts |
| `ASR-1279` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/gridDataValidationLocale.test.tsx, locale/testing/gridDataTableLocale.test.tsx, locale/testing/GridSheetEditPanel.locale.test.tsx |
| `ASR-1280` | Spezialpfad `Formula UI` nach dem Move funktional testen. | testing/visual/GridFormulaBar.responsive.test.mjs, testing/formulas/gridFormulaReserve.contract.test.mjs, testing/contracts/gridFormulaAndSortWiring.test.mjs |
| `ASR-1281` | Spezialpfad `Chart UI` nach dem Move funktional testen. | testing/integrations/gridChartPublish.security.test.ts, testing/charts/gridChartLayout.test.ts, testing/formatting/gridFormattingSurfaces.test.tsx |
| `ASR-1282` | Spezialpfad `Pivot UI` nach dem Move funktional testen. | testing/pivots/gridPivotBuilder.test.ts, testing/pivots/GridPivotPanel.test.tsx, testing/pivots/GridPivotPanel.contract.test.mjs |
| `ASR-1283` | Spezialpfad `XLSX Import/Export` nach dem Move funktional testen. | testing/interchange/gridXlsxOdsRoundtrip.test.ts, testing/interchange/gridWorkbookExport.test.ts, testing/integrations/gridWorkbookExportReachable.contract.test.mjs |
| `ASR-1284` | Spezialpfad `CSV Import/Export` nach dem Move funktional testen. | testing/interchange/gridWorkbookExport.test.ts, testing/integrations/gridWorkbookExportReachable.contract.test.mjs, testing/contracts/gridImportDepth.contract.test.mjs |
| `ASR-1285` | Spezialpfad `Writer Integration` nach dem Move funktional testen. | testing/integrations/gridWorkspacePublish.test.ts, testing/integrations/gridChartPublish.security.test.ts |
| `ASR-1286` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/startup/gridSheetKeyboardFocusRuntime.test.tsx (Verhaltensnachweis seit Runde 267: rendert die echte Komponente in happy-dom und liest `document.activeElement`) |
| `ASR-1287` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1288` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1289` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1290` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1291` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1292` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
