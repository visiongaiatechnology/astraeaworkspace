# Belegzuordnung automate — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 7 Testdateien unter `ui/apps/automate/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1993` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1994` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1995` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1996` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1997` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1998` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1999` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-2000` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-2001` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-2002` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-2003` | reale Zielstruktur aus `app/canvas/nodes/triggers/actions/execution/providers/inspector/toolbar/state/model/integrations | testing/automateInteraction.test.tsx, testing/theme/AutomateTheme.test.mjs, testing/AutomateView.locale.test.tsx |
| `ASR-2004` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-2005` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/automateInteraction.test.tsx |
| `ASR-2006` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-2007` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-2008` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-2009` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-2010` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-2011` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-2012` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-2013` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-2014` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-2015` | lokale Types lokal halten. | **KEIN BELEG** |
| `ASR-2016` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-2017` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/contracts/automateImportDepth.contract.test.mjs, testing/automateTrialClaim.contract.test.mjs, testing/automateSourceContract.test.mjs |
| `ASR-2018` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/automateInteraction.test.tsx |
| `ASR-2019` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-2020` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | **KEIN BELEG** |
| `ASR-2021` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-2022` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-2023` | App-/Route-/Command-/Provider-IDs stabil halten. | **KEIN BELEG** |
| `ASR-2024` | DocumentKind und native File Extension stabil halten. | testing/contracts/automateImportDepth.contract.test.mjs |
| `ASR-2025` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-2026` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-2027` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-2028` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-2029` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-2030` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/contracts/automateImportDepth.contract.test.mjs, testing/automateSourceContract.test.mjs, testing/automateInteraction.test.tsx |
| `ASR-2031` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/integration/automateEncryptedStore.test.ts |
| `ASR-2032` | Roundtrip `Create workflow → Configure → Execute → Inspect → Save/Reopen` unter `testing/roundtrip/` ablegen. | testing/automateInteraction.test.tsx, testing/automateSourceContract.test.mjs, testing/automateTrialHonesty.test.tsx |
| `ASR-2033` | Error-/Edge-Path-Test ablegen. | testing/integration/automateEncryptedStore.test.ts |
| `ASR-2034` | Persistenztest ablegen, sofern die App persistiert. | testing/roundtrip/automateSaveReopenRoundtrip.test.tsx |
| `ASR-2035` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/integration/automateEncryptedStore.test.ts, testing/contracts/automateImportDepth.contract.test.mjs, testing/automateSourceContract.test.mjs |
| `ASR-2036` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-2037` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-2038` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-2039` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-2040` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-2041` | Crimson Command visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-2042` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-2043` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2044` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2045` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2046` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2047` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2048` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2049` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/AutomateView.locale.test.tsx, testing/automateInteraction.test.tsx |
| `ASR-2050` | Spezialpfad `Canvas` nach dem Move funktional testen. | testing/theme/AutomateTheme.test.mjs, testing/automateInteraction.test.tsx |
| `ASR-2051` | Spezialpfad `Nodes` nach dem Move funktional testen. | testing/theme/AutomateTheme.test.mjs, testing/automateInteraction.test.tsx |
| `ASR-2052` | Spezialpfad `Triggers` nach dem Move funktional testen. | testing/automateInteraction.test.tsx |
| `ASR-2053` | Spezialpfad `Actions` nach dem Move funktional testen. | testing/theme/AutomateTheme.test.mjs |
| `ASR-2054` | Spezialpfad `Execution` nach dem Move funktional testen. | testing/theme/AutomateTheme.test.mjs, testing/automateInteraction.test.tsx |
| `ASR-2055` | Spezialpfad `Premium provider boundary` nach dem Move funktional testen. | testing/automateInteraction.test.tsx |
| `ASR-2056` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/unit/accessibility/automateKeyboardFocusAccessibleNameRuntime.test.tsx |
| `ASR-2057` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-2058` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-2059` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-2060` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-2061` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-2062` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
