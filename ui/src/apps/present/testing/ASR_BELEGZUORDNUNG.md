# Belegzuordnung present — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 52 Testdateien unter `ui/apps/present/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1293` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1294` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1295` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1296` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1297` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1298` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1299` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1300` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1301` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1302` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1303` | reale Zielstruktur aus `app/editor/stage/slides/objects/layers/transitions/presenter/toolbar/panels/dialogs/state/model/ | testing/persistence/presentDeckPersistence.test.ts, testing/editor/presentEditorWiring.contract.test.mjs, testing/canvas/PresentStageCanvas.render.test.mjs |
| `ASR-1304` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1305` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/interchange/presentOfficeRoundTrip.test.ts |
| `ASR-1306` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1307` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1308` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1309` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1310` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1311` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1312` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1313` | lokale Hooks lokal halten. | testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1314` | lokale Utilities lokal halten. | testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1315` | lokale Types lokal halten. | testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1316` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1317` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/integration/workspace/presentWorkspaceLiveModePath.contract.test.ts, testing/integration/workspace/presentWorkspaceDropZoneRegistryForm.contract.test.ts, testing/editor/presentEditorWiring.contract.test.mjs |
| `ASR-1318` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/interchange/presentOfficeRoundTrip.test.ts |
| `ASR-1319` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1320` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/media/presentMediaPreview.test.ts, locale/testing/PresentReview.locale.test.tsx, testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1321` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1322` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1323` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1324` | DocumentKind und native File Extension stabil halten. | testing/canvas/presentHyperlinksAccessibility.test.ts, testing/state/presentSequentialOperations.test.ts, testing/startup/presentCanvasStartupWitness.test.tsx |
| `ASR-1325` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1326` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-1327` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1328` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1329` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1330` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/integration/workspace/presentWorkspaceDropZone.test.ts, testing/integration/workspace/PresentWorkspaceDropZoneOverlay.render.test.mjs, testing/integration/workspace/presentWorkspaceLiveModePath.contract.test.ts |
| `ASR-1331` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/integration/workspace/presentWorkspaceIntegrationHostAdapter.test.ts, testing/integration/workspace/presentWorkspaceIntegration.test.ts, testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1332` | Roundtrip `Create deck → Edit slides → Save → Reopen → Present` unter `testing/roundtrip/` ablegen. | testing/persistence/presentDeckPersistence.test.ts, testing/acceptance/presentTwelveSlideDeck.test.ts, testing/editor/presentEditorWiring.contract.test.mjs |
| `ASR-1333` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1334` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1335` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/interchange/PresentExportSurfaces.contract.test.mjs, testing/interchange/presentExportBounds.test.ts, testing/widgets/presentWidgets.test.ts |
| `ASR-1336` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1337` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/integration/workspace/presentWorkspaceDropZone.test.ts, testing/integration/workspace/presentWorkspaceLiveModePath.contract.test.ts, testing/integration/workspace/presentWorkspaceDropZoneRegistryForm.contract.test.ts |
| `ASR-1338` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1339` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1340` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1341` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/editor/presentEditorCommands.test.ts, testing/editor/presentCanvasCommands.test.ts, testing/integration/workspace/presentWorkspaceDropZone.test.ts |
| `ASR-1342` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1343` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresentToolbar.locale.test.tsx, locale/testing/PresentStudio.locale.test.tsx, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1344` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresentToolbar.locale.test.tsx, locale/testing/PresentStudio.locale.test.tsx, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1345` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresentToolbar.locale.test.tsx, locale/testing/PresentStudio.locale.test.tsx, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1346` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresentToolbar.locale.test.tsx, locale/testing/PresentStudio.locale.test.tsx, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1347` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresentToolbar.locale.test.tsx, locale/testing/PresentStudio.locale.test.tsx, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1348` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresentToolbar.locale.test.tsx, locale/testing/PresentStudio.locale.test.tsx, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1349` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | locale/testing/PresenterExitConfirmation.locale.test.tsx, locale/testing/PresentWorkspaceSnapshot.locale.test.tsx, locale/testing/PresentToolbar.locale.test.tsx |
| `ASR-1350` | Spezialpfad `Stage` nach dem Move funktional testen. | testing/canvas/PresentStageCanvas.render.test.mjs, testing/editor/presentEditorWiring.contract.test.mjs, testing/editor/PresentDataSurfaces.render.test.mjs |
| `ASR-1351` | Spezialpfad `Slide Rail` nach dem Move funktional testen. | testing/contracts/presentSlideDuplication.test.ts, testing/acceptance/presentTwelveSlideDeck.test.ts, testing/state/presentSequentialOperations.test.ts |
| `ASR-1352` | Spezialpfad `Object Layers` nach dem Move funktional testen. | testing/editor/presentCanvasCommands.test.ts, testing/canvas/presentLayerOrderGrouping.test.ts, testing/state/presentSequentialOperations.test.ts |
| `ASR-1353` | Spezialpfad `Transitions` nach dem Move funktional testen. | testing/presenter/presentTransitionEngine.test.ts, testing/editor/PresentDataSurfaces.render.test.mjs, testing/acceptance/PresentBatch6Surfaces.contract.test.mjs |
| `ASR-1354` | Spezialpfad `Presenter` nach dem Move funktional testen. | testing/media/PresentPresenterMedia.contract.test.mjs, testing/presenter/presenterKeyboard.test.ts, locale/testing/PresenterExitConfirmation.locale.test.tsx |
| `ASR-1355` | Spezialpfad `Export` nach dem Move funktional testen. | testing/interchange/presentExportBounds.test.ts, testing/interchange/PresentExportSurfaces.contract.test.mjs, testing/integration/workspace/presentWorkspaceDropZoneRegistryForm.contract.test.ts |
| `ASR-1356` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | **KEIN BELEG** — der Skalierungsteil dieser Zeile ist seit dem 2026-09-28 belegt: `testing/accessibility/presentCanvasUiScale.runtime.test.tsx` (5 Tests, `@vitest-environment happy-dom`, rendert `PresentCanvas` und misst `getComputedStyle(...).fontSize` + `data-astraea-scale-percent` am Wurzelknoten); Keyboard und Accessible Name bleiben unbelegt. |
| `ASR-1357` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1358` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1359` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1360` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1361` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1362` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | testing/startup/presentCanvasStartupWitness.test.tsx |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
