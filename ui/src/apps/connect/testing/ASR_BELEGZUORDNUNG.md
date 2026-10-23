# Belegzuordnung connect — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 14 Testdateien unter `ui/apps/connect/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1923` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1924` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1925` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1926` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1927` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1928` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1929` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1930` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1931` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1932` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1933` | reale Zielstruktur aus `app/connections/providers/permissions/endpoints/logs/toolbar/panels/state/model/integrations/tes | testing/connectUiWiring.test.tsx, testing/connectPersistenceRoundTrip.test.ts, testing/connectDeliveryHonesty.test.tsx |
| `ASR-1934` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1935` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | **KEIN BELEG** |
| `ASR-1936` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1937` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1938` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1939` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1940` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1941` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1942` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1943` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1944` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1945` | lokale Types lokal halten. | **KEIN BELEG** |
| `ASR-1946` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1947` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/contract/connectHtmlReserve.contract.test.mjs, testing/connectUiContract.test.mjs, testing/connectComposeClaim.contract.test.mjs |
| `ASR-1948` | `index.ts` ausschließlich mit echter Public API bestücken. | **KEIN BELEG** |
| `ASR-1949` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1950` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | **KEIN BELEG** |
| `ASR-1951` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1952` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1953` | App-/Route-/Command-/Provider-IDs stabil halten. | **KEIN BELEG** |
| `ASR-1954` | DocumentKind und native File Extension stabil halten. | testing/contract/connectHtmlReserve.contract.test.mjs |
| `ASR-1955` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1956` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-1957` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1958` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1959` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1960` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/connectAccountSync.test.ts, testing/contract/connectHtmlReserve.contract.test.mjs, testing/connectUiWiring.test.tsx |
| `ASR-1961` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | **KEIN BELEG** |
| `ASR-1962` | Roundtrip `Configure connection → Validate → Use → Reopen` unter `testing/roundtrip/` ablegen. | testing/connectPersistenceRoundTrip.test.ts, testing/connectAccountSync.test.ts, testing/connectUiWiring.test.tsx |
| `ASR-1963` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1964` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1965` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/connectPersistenceRoundTrip.test.ts, testing/connectInterop.test.ts, testing/contract/connectHtmlReserve.contract.test.mjs |
| `ASR-1966` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1967` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1968` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1969` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1970` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1971` | Crimson Command visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1972` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1973` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1974` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1975` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1976` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1977` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1978` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1979` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/ConnectView.locale.test.tsx |
| `ASR-1980` | Spezialpfad `Providers` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1981` | Spezialpfad `Permissions` nach dem Move funktional testen. | testing/connectPersistenceRoundTrip.test.ts |
| `ASR-1982` | Spezialpfad `Endpoints` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1983` | Spezialpfad `Logs` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1984` | Spezialpfad `NetGate boundary` nach dem Move funktional testen. | testing/connectPersistenceRoundTrip.test.ts, testing/connectAccountSync.test.ts |
| `ASR-1985` | Spezialpfad `GaiaCom independence` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1986` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/connectKeyboardFocusA11yRuntime.test.tsx |
| `ASR-1987` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1988` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1989` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1990` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1991` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1992` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
