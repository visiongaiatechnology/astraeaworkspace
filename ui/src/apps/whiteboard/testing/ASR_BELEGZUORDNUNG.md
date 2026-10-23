# Belegzuordnung whiteboard — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 55 Testdateien unter `ui/apps/whiteboard/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1573` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1574` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1575` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1576` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1577` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1578` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1579` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1580` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1581` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1582` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1583` | reale Zielstruktur aus `app/canvas/objects/connectors/live-objects/tools/minimap/toolbar/floating-controls/state/model/i | testing/contract/whiteboardReliabilityContracts.test.mjs, testing/theme/WhiteboardCanvas.theme.test.mjs, testing/startup/whiteboardCanvasRenderWitness.test.tsx |
| `ASR-1584` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1585` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/drop-zone/whiteboardDropZone.test.ts |
| `ASR-1586` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1587` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1588` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1589` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1590` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1591` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1592` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1593` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1594` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1595` | lokale Types lokal halten. | testing/drop-zone/whiteboardDropZone.test.ts |
| `ASR-1596` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1597` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/drop-zone/whiteboardDropZoneWiring.contract.test.mjs, testing/locale/whiteboardDeepLocale.render.test.tsx, testing/contract/whiteboardReliabilityContracts.test.mjs |
| `ASR-1598` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/rendering/whiteboardSpatialIndexEngine.test.ts |
| `ASR-1599` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1600` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/drop-zone/whiteboardDropZone.test.ts, testing/drop-zone/WhiteboardDropZoneOverlay.render.test.tsx |
| `ASR-1601` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1602` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1603` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/drop-zone/whiteboardDropZone.test.ts |
| `ASR-1604` | DocumentKind und native File Extension stabil halten. | testing/interactions/whiteboardDropPolicy.test.ts, testing/drop-zone/whiteboardDropZoneWiring.contract.test.mjs, testing/drop-zone/whiteboardDropZone.test.ts |
| `ASR-1605` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1606` | Guide Anchors und data-testid stabil halten. | testing/model/whiteboardSnapGuideEngine.test.ts, testing/persistence/whiteboardCanonicalPayload.test.ts |
| `ASR-1607` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1608` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1609` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1610` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/roundtrip/whiteboardRoundtripTestSuite.test.ts, testing/drop-zone/whiteboardDropZone.test.ts, testing/drop-zone/WhiteboardDropZoneOverlay.render.test.tsx |
| `ASR-1611` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/drop-zone/whiteboardDropZone.test.ts, testing/drop-zone/WhiteboardDropZoneOverlay.render.test.tsx, testing/drop-zone/whiteboardDropZoneWiring.contract.test.mjs |
| `ASR-1612` | Roundtrip `Create board → Add objects → Connect → Save → Reopen` unter `testing/roundtrip/` ablegen. | testing/interchange/whiteboardHandoffRoundtrip.test.ts, testing/roundtrip/whiteboardRoundtripTestSuite.test.ts, testing/persistence/whiteboardCanonicalPayload.test.ts |
| `ASR-1613` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1614` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1615` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/interchange/whiteboardExportImportEngine.test.ts, testing/rendering/whiteboardExportScene.test.ts, testing/integrations/canvasExport.test.ts |
| `ASR-1616` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1617` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/drop-zone/whiteboardDropZone.test.ts, testing/drop-zone/WhiteboardDropZoneOverlay.render.test.tsx, testing/persistence/whiteboardEmptyBoard.test.ts |
| `ASR-1618` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1619` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1620` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1621` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/drop-zone/whiteboardDropZone.test.ts |
| `ASR-1622` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1623` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1624` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1625` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1626` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1627` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1628` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1629` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/whiteboardToolbarLocale.render.test.tsx, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/locale/whiteboardDeepLocale.render.test.tsx |
| `ASR-1630` | Spezialpfad `Infinite Canvas` nach dem Move funktional testen. | testing/theme/WhiteboardCanvas.theme.test.mjs, testing/startup/whiteboardCanvasRenderWitness.test.tsx, testing/integrations/canvasExport.test.ts |
| `ASR-1631` | Spezialpfad `Connectors` nach dem Move funktional testen. | testing/persistence/whiteboardCanonicalPayload.test.ts, testing/model/whiteboardSnapGuideEngine.test.ts, testing/integrations/canvasExport.test.ts |
| `ASR-1632` | Spezialpfad `Live Objects` nach dem Move funktional testen. | testing/live-objects/whiteboardLiveObjectEngine.test.ts, testing/locale/whiteboardObjectsLocale.render.test.tsx, testing/theme/WhiteboardCanvas.theme.test.mjs |
| `ASR-1633` | Spezialpfad `Minimap` nach dem Move funktional testen. | testing/minimap/whiteboardMiniMapBookmarks.test.tsx, testing/minimap/whiteboardMiniMapKeyboard.test.ts, testing/contract/whiteboardReliabilityContracts.test.mjs |
| `ASR-1634` | Spezialpfad `Drag&Drop` nach dem Move funktional testen. | testing/drop-zone/whiteboardDropZoneWiring.contract.test.mjs, testing/drop-zone/whiteboardDropZone.test.ts, testing/interactions/whiteboardDropPolicy.test.ts |
| `ASR-1635` | Spezialpfad `Present Handoff` nach dem Move funktional testen. | testing/integrations/whiteboardPresentHandoff.test.ts, testing/interchange/whiteboardHandoffRoundtrip.test.ts, testing/persistence/whiteboardCanonicalPayload.test.ts |
| `ASR-1636` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/integration/whiteboardInteropDialogFocus.runtime.test.tsx (Verhaltensnachweis seit Runde 267: rendert die echte Komponente in happy-dom und liest `document.activeElement`) |
| `ASR-1637` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1638` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1639` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1640` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1641` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1642` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
