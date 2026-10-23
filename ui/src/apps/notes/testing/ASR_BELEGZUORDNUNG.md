# Belegzuordnung notes — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 50 Testdateien unter `ui/apps/notes/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1363` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1364` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1365` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1366` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1367` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1368` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1369` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1370` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1371` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1372` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1373` | reale Zielstruktur aus `app/editor/backlinks/graph/navigation/toolbar/panels/state/model/integrations/persistence/import | testing/themes/NotesEditorToolbar.theme.test.tsx, editor/toolbar/testing/NotesEditorToolbar.locale.test.tsx, testing/integrations/notesParagraphCarrier.test.ts |
| `ASR-1374` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1375` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/editor/notesDirectEntry.test.ts, testing/editor/NotesEditor.entry.contract.test.mjs, testing/interchange/notesVnoteWiring.contract.test.mjs.tm-bak |
| `ASR-1376` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1377` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1378` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1379` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1380` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1381` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1382` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1383` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1384` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1385` | lokale Types lokal halten. | testing/interchange/notesVnoteWiring.contract.test.mjs.tm-bak, testing/interchange/notesVnoteWiring.contract.test.mjs, testing/editor/notesDialogContract.contract.test.mjs |
| `ASR-1386` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1387` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/drop-zone/notesDropZoneWiring.contract.test.mjs, testing/editor/NotesEditor.batchD.contract.test.mjs, testing/interchange/notesVnoteWiring.contract.test.mjs.tm-bak |
| `ASR-1388` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/integrations/notesParagraphCarrier.test.ts, testing/integration/workspace/notesParagraphToWriterJourney.test.ts |
| `ASR-1389` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1390` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/themes/NotesMarkdownPreview.theme.test.mjs, testing/drop-zone/notesDropZoneMatrixReadiness.test.ts, testing/drop-zone/notesDropZone.test.ts |
| `ASR-1391` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1392` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1393` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/drop-zone/notesDropZone.test.ts |
| `ASR-1394` | DocumentKind und native File Extension stabil halten. | testing/interchange/notesVnoteWiring.contract.test.mjs.tm-bak, testing/interchange/notesVnoteWiring.contract.test.mjs, testing/editor/notesDialogContract.contract.test.mjs |
| `ASR-1395` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1396` | Guide Anchors und data-testid stabil halten. | **KEIN BELEG** |
| `ASR-1397` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1398` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1399` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1400` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/interchange/notesVnoteWiring.contract.test.mjs.tm-bak, testing/interchange/notesVnoteWiring.contract.test.mjs, testing/drop-zone/NotesWorkspaceDropZoneOverlay.render.test.tsx |
| `ASR-1401` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/drop-zone/NotesWorkspaceDropZoneOverlay.render.test.tsx, testing/integrations/notesParagraphCarrier.test.ts, testing/drop-zone/notesDropZoneModeConnection.test.ts |
| `ASR-1402` | Roundtrip `Create note → Link → Save → Reopen → Backlinks` unter `testing/roundtrip/` ablegen. | testing/integrations/notesParagraphCarrier.test.ts, testing/integration/workspace/notesParagraphToWriterJourney.test.ts, testing/integration/notebook/notesNotebookFullAcceptance.test.tsx |
| `ASR-1403` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1404` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1405` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/interchange/notesVnoteImport.test.ts, testing/interchange/notesHtmlFolderImport.test.ts, testing/contracts/notesImportDepth.contract.test.mjs |
| `ASR-1406` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1407` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/integrations/notesParagraphCarrier.test.ts, testing/integration/workspace/notesParagraphToWriterJourney.test.ts, testing/drop-zone/notesDropZoneMatrixReadiness.test.ts |
| `ASR-1408` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1409` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1410` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1411` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/integrations/notesParagraphCarrierWiring.contract.test.mjs, testing/integrations/notesParagraphCarrier.test.ts, testing/drop-zone/notesDropZone.test.ts |
| `ASR-1412` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1413` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1414` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1415` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1416` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1417` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1418` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1419` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/notesSearchLocale.render.test.tsx, testing/locale/notesExtendedLocale.render.test.tsx, testing/locale/notesAuxLocale.render.test.tsx |
| `ASR-1420` | Spezialpfad `Backlinks` nach dem Move funktional testen. | testing/navigation/notesPageTree.test.ts, testing/navigation/NotesPagesList.render.test.tsx, testing/knowledge-graph/notesGraphFilter.test.ts |
| `ASR-1421` | Spezialpfad `Knowledge Graph` nach dem Move funktional testen. | testing/knowledge-graph/notesGraphFilter.test.ts, testing/integrations/notesParagraphCarrierWiring.contract.test.mjs, testing/integrations/notesParagraphCarrier.test.ts |
| `ASR-1422` | Spezialpfad `Wiki Links` nach dem Move funktional testen. | testing/interchange/notesHtmlFolderImport.test.ts, testing/integration/roundtrip/notesBatchD.test.ts, testing/editor/NotesEditor.batchD.contract.test.mjs |
| `ASR-1423` | Spezialpfad `Markdown` nach dem Move funktional testen. | testing/themes/NotesMarkdownPreview.theme.test.mjs, testing/editor/markdownRenderer.table.test.tsx, testing/themes/NotesEditorToolbar.theme.test.tsx |
| `ASR-1424` | Spezialpfad `Search` nach dem Move funktional testen. | testing/search/notesSearchScanBudget.test.ts, testing/search/notesSearchDeterminism.test.ts, testing/locale/notesSearchLocale.render.test.tsx |
| `ASR-1425` | Spezialpfad `Navigation` nach dem Move funktional testen. | testing/navigation/notesPageTree.test.ts, testing/navigation/NotesPagesList.render.test.tsx, testing/integration/notebook/notesNotebookFullAcceptance.test.tsx |
| `ASR-1426` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/navigation/NotesPagesList.keyboardRuntime.test.tsx (Verhaltensnachweis seit Runde 267: rendert die echte Komponente in happy-dom und liest `document.activeElement`) |
| `ASR-1427` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1428` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1429` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1430` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1431` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1432` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | testing/integration/workspace/notesParagraphToWriterJourney.test.ts, testing/drop-zone/notesDropZone.test.ts |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
