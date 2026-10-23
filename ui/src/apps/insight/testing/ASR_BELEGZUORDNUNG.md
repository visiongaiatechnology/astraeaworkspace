# Belegzuordnung insight — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 21 Testdateien unter `ui/apps/insight/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1853` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1854` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1855` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1856` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1857` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1858` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1859` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1860` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1861` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1862` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1863` | reale Zielstruktur aus `app/dashboards/widgets/metrics/sources/filters/toolbar/panels/state/model/integrations/testing`  | testing/insightInteractiveFilters.test.ts, testing/insightRefreshHonesty.test.tsx, testing/insightNativeInterchange.test.ts |
| `ASR-1864` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1865` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | **KEIN BELEG** |
| `ASR-1866` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1867` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1868` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1869` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1870` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1871` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1872` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1873` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1874` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1875` | lokale Types lokal halten. | **KEIN BELEG** |
| `ASR-1876` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1877` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/insightSingleDefinition.contract.test.mjs, testing/insightRefreshClaim.contract.test.mjs, testing/insightReachability.test.tsx |
| `ASR-1878` | `index.ts` ausschließlich mit echter Public API bestücken. | **KEIN BELEG** |
| `ASR-1879` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1880` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | **KEIN BELEG** |
| `ASR-1881` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1882` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1883` | App-/Route-/Command-/Provider-IDs stabil halten. | **KEIN BELEG** |
| `ASR-1884` | DocumentKind und native File Extension stabil halten. | testing/insightNativeInterchange.test.ts, testing/insightReachability.test.tsx, testing/insightImportCore.test.ts |
| `ASR-1885` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1886` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-1887` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1888` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1889` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1890` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/insightPivotCore.test.ts |
| `ASR-1891` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | **KEIN BELEG** |
| `ASR-1892` | Roundtrip `Create dashboard → Add source/widget → Save → Reopen` unter `testing/roundtrip/` ablegen. | testing/insightWorkspaceSource.test.ts, testing/insightNativeInterchange.test.ts, testing/insightOfflineCache.test.ts |
| `ASR-1893` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1894` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1895` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/insightImportCore.test.ts, testing/insightExportBounds.test.ts, testing/insightReachability.test.tsx |
| `ASR-1896` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1897` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1898` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1899` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1900` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1901` | Crimson Command visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1902` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1903` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1904` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1905` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1906` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1907` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1908` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1909` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/InsightView.locale.test.tsx |
| `ASR-1910` | Spezialpfad `Dashboards` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1911` | Spezialpfad `Widgets` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1912` | Spezialpfad `Metrics` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1913` | Spezialpfad `Filters` nach dem Move funktional testen. | testing/insightInteractiveFilters.test.ts, testing/InsightView.locale.test.tsx |
| `ASR-1914` | Spezialpfad `Source adapters` nach dem Move funktional testen. | testing/insightWorkspaceSource.test.ts, testing/insightSurfaceHonesty.test.tsx, testing/insightSingleDefinition.contract.test.mjs |
| `ASR-1915` | Spezialpfad `Database source boundary` nach dem Move funktional testen. | testing/insightWorkspaceSource.test.ts, testing/insightDatasetAuthoring.test.ts, testing/insightSurfaceHonesty.test.tsx |
| `ASR-1916` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/accessibility/insightKeyboardFocusNameRuntime.test.tsx |
| `ASR-1917` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1918` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1919` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1920` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1921` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1922` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
