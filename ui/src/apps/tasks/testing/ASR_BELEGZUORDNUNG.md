# Belegzuordnung tasks — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 28 Testdateien unter `ui/apps/tasks/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1503` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1504` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1505` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1506` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1507` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1508` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1509` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1510` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1511` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1512` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1513` | reale Zielstruktur aus `app/task-list/task-editor/recurrence/filters/toolbar/panels/state/model/integrations/persistence | testing/state/taskStateSequence.contract.test.ts, testing/persistence/tasksReopenPayload.contract.test.ts, testing/locale/taskRecurrenceLocale.render.test.tsx |
| `ASR-1514` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1515` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | **KEIN BELEG** |
| `ASR-1516` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1517` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1518` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1519` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1520` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1521` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1522` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1523` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1524` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1525` | lokale Types lokal halten. | **KEIN BELEG** |
| `ASR-1526` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1527` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/integration/taskTakeIntoNoteWiring.contract.test.mjs, testing/capture/taskQuickAddWiring.contract.test.mjs, testing/views/taskBoardRender.contract.test.tsx |
| `ASR-1528` | `index.ts` ausschließlich mit echter Public API bestücken. | **KEIN BELEG** |
| `ASR-1529` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1530` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | **KEIN BELEG** |
| `ASR-1531` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1532` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1533` | App-/Route-/Command-/Provider-IDs stabil halten. | **KEIN BELEG** |
| `ASR-1534` | DocumentKind und native File Extension stabil halten. | testing/attachments/taskAttachments.test.ts |
| `ASR-1535` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1536` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-1537` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1538` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1539` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1540` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | **KEIN BELEG** |
| `ASR-1541` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | **KEIN BELEG** |
| `ASR-1542` | Roundtrip `Create task → Edit → Complete/Recurrence → Save → Reopen` unter `testing/roundtrip/` ablegen. | testing/persistence/tasksReopenPayload.contract.test.ts, testing/locale/taskRecurrenceLocale.render.test.tsx, testing/state/taskStateSequence.contract.test.ts |
| `ASR-1543` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1544` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1545` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/interchange/taskImportPreservation.test.ts, testing/persistence/tasksReopenPayload.contract.test.ts, testing/interchange/taskIcalendarVtodoFidelity.test.ts |
| `ASR-1546` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1547` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/persistence/tasksReopenPayload.contract.test.ts, testing/persistence/tasksOnlyDocument.test.ts, testing/interchange/taskDerivedDocuments.test.ts |
| `ASR-1548` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1549` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1550` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1551` | Crimson Command visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1552` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1553` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1554` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1555` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1556` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1557` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1558` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1559` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/locale/taskExtendedLocale.render.test.tsx, testing/locale/taskCoreLocale.render.test.tsx |
| `ASR-1560` | Spezialpfad `Subtasks` nach dem Move funktional testen. | testing/views/taskBoardMove.test.ts |
| `ASR-1561` | Spezialpfad `Recurrence` nach dem Move funktional testen. | testing/locale/taskRecurrenceLocale.render.test.tsx, testing/views/taskBoardMove.test.ts, testing/state/taskStateSequence.contract.test.ts |
| `ASR-1562` | Spezialpfad `Priorities` nach dem Move funktional testen. | testing/views/taskBoardMove.test.ts |
| `ASR-1563` | Spezialpfad `Filters` nach dem Move funktional testen. | testing/views/taskBoardMove.test.ts |
| `ASR-1564` | Spezialpfad `Workspace Links` nach dem Move funktional testen. | testing/views/taskBoardMove.test.ts, testing/views/taskBoardRender.contract.test.tsx, testing/state/taskStateSequence.contract.test.ts |
| `ASR-1565` | Spezialpfad `Quiet Hours interaction` nach dem Move funktional testen. | testing/views/taskBoardMove.test.ts, testing/persistence/tasksReopenPayload.contract.test.ts, testing/locale/taskExtendedLocale.render.test.tsx |
| `ASR-1566` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/views/taskViewsAccessibilityRuntime.test.tsx, testing/accessibility/taskAccessibilityStylesheet.test.tsx (Verhaltensnachweis seit Runde 267: rendert die echte Komponente in happy-dom und liest `document.activeElement`) |
| `ASR-1567` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1568` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1569` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1570` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1571` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1572` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
