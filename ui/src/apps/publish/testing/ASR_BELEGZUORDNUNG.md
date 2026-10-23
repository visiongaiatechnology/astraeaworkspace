# Belegzuordnung publish — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 26 Testdateien unter `ui/apps/publish/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1783` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1784` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1785` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1786` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1787` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1788` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1789` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1790` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1791` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1792` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1793` | reale Zielstruktur aus `app/document/pages/layout/typography/assets/print/toolbar/panels/state/model/integrations/import | testing/unit/model/publishDocumentFactory.test.ts, testing/locale/publishWorkspacePanels.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx |
| `ASR-1794` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | testing/unit/model/publishStyleOps.test.ts, testing/unit/model/publishPageOps.test.ts |
| `ASR-1795` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/unit/model/publishTextFlowOps.test.ts, testing/unit/model/publishStyleOps.test.ts, testing/unit/model/publishShapeOps.test.ts |
| `ASR-1796` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1797` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1798` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1799` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1800` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1801` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1802` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1803` | lokale Hooks lokal halten. | testing/unit/model/publishStyleOps.test.ts, testing/unit/interchange/publishExportDelivery.test.ts, testing/unit/interop/publishExportWiring.contract.test.mjs |
| `ASR-1804` | lokale Utilities lokal halten. | testing/unit/model/publishStyleOps.test.ts, testing/unit/interchange/publishExportDelivery.test.ts, testing/unit/interop/publishExportWiring.contract.test.mjs |
| `ASR-1805` | lokale Types lokal halten. | testing/unit/model/publishStyleOps.test.ts, testing/unit/interchange/publishExportDelivery.test.ts, testing/unit/assets/publishAssetOps.test.ts |
| `ASR-1806` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1807` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/drop-zone/publishWorkspaceDropZoneWiring.contract.test.mjs, testing/unit/interop/publishExportWiring.contract.test.mjs, testing/drop-zone/publishWorkspaceDropZone.test.ts |
| `ASR-1808` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/unit/interop/publishPdfDelivery.test.ts, testing/unit/interop/publishExportWiring.contract.test.mjs |
| `ASR-1809` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1810` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/unit/model/publishExportPreview.test.ts, testing/drop-zone/publishWorkspaceDropZone.test.ts, testing/drop-zone/PublishWorkspaceDropZoneOverlay.render.test.tsx |
| `ASR-1811` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1812` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1813` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/unit/model/publishSequentialCalls.test.ts, testing/drop-zone/publishWorkspaceDropZone.test.ts, testing/unit/model/publishStyleOps.test.ts |
| `ASR-1814` | DocumentKind und native File Extension stabil halten. | testing/unit/interchange/publishExportDelivery.test.ts, testing/unit/model/publishStyleOps.test.ts, testing/unit/model/publishSequentialCalls.test.ts |
| `ASR-1815` | Storage-/Migration-Keys stabil halten. | testing/unit/model/publishStyleOps.test.ts, testing/unit/model/publishSequentialCalls.test.ts |
| `ASR-1816` | Guide Anchors und data-testid stabil halten. | testing/unit/model/publishStyleOps.test.ts, testing/unit/model/publishSequentialCalls.test.ts |
| `ASR-1817` | i18n-Keys stabil halten oder sauber migrieren. | testing/unit/model/publishStyleOps.test.ts, testing/unit/model/publishSequentialCalls.test.ts |
| `ASR-1818` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1819` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1820` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/unit/diagnostics/publishRoundtripTestSuite.test.ts, testing/unit/editor/publishViewWiring.contract.test.mjs, testing/drop-zone/publishWorkspaceDropZoneWiring.contract.test.mjs |
| `ASR-1821` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/drop-zone/publishWorkspaceDropZone.test.ts, testing/drop-zone/PublishWorkspaceDropZoneOverlay.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1822` | Roundtrip `Create publication → Layout → Save → Reopen → Print/Export` unter `testing/roundtrip/` ablegen. | testing/unit/interop/publishExportWiring.contract.test.mjs, testing/unit/diagnostics/publishRoundtripTestSuite.test.ts, testing/unit/model/publishExportPreview.test.ts |
| `ASR-1823` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1824` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1825` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/unit/model/publishExportPreview.test.ts, testing/unit/interop/publishExportWiring.contract.test.mjs, testing/unit/interchange/publishExportDelivery.test.ts |
| `ASR-1826` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1827` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/drop-zone/publishWorkspaceDropZone.test.ts, testing/drop-zone/PublishWorkspaceDropZoneOverlay.render.test.tsx |
| `ASR-1828` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | testing/unit/model/publishExportPreview.test.ts |
| `ASR-1829` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1830` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1831` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/drop-zone/publishWorkspaceDropZoneWiring.contract.test.mjs, testing/drop-zone/publishWorkspaceDropZone.test.ts |
| `ASR-1832` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1833` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1834` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1835` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1836` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1837` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1838` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1839` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/publishInspectorLocale.render.test.tsx, testing/locale/publishToolbarLocale.render.test.tsx, testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1840` | Spezialpfad `Pages` nach dem Move funktional testen. | testing/unit/model/publishSequentialCalls.test.ts, testing/unit/model/publishPageOps.test.ts, testing/unit/model/publishMasterFrames.test.ts |
| `ASR-1841` | Spezialpfad `Layout` nach dem Move funktional testen. | testing/locale/publishWorkspacePanels.render.test.tsx |
| `ASR-1842` | Spezialpfad `Typography` nach dem Move funktional testen. | testing/unit/editor/publishViewWiring.contract.test.mjs |
| `ASR-1843` | Spezialpfad `Assets` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1844` | Spezialpfad `Print` nach dem Move funktional testen. | testing/locale/publishInspectorLocale.render.test.tsx |
| `ASR-1845` | Spezialpfad `Database adapter boundary` nach dem Move funktional testen. | testing/unit/model/publishPageOps.test.ts, testing/unit/model/publishFrameOps.test.ts, testing/drop-zone/publishWorkspaceDropZoneWiring.contract.test.mjs |
| `ASR-1846` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/accessibility/publishKeyboardFocusNameRuntime.test.tsx |
| `ASR-1847` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1848` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1849` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1850` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1851` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1852` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | testing/unit/model/publishThreadOps.test.ts, testing/unit/interop/publishPdfDelivery.test.ts, testing/unit/editor/publishViewWiring.contract.test.mjs |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
