# Belegzuordnung pdf studio — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 37 Testdateien unter `ui/apps/pdf/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1433` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1434` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1435` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1436` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1437` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1438` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1439` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1440` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1441` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1442` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1443` | reale Zielstruktur aus `app/viewer/pages/annotations/redaction/signatures/search/toolbar/panels/dialogs/state/model/inte | persistence/pdfStudioPersistence.test.ts, testing/visual/PdfPageStripKeyboard.contract.test.tsx, locale/testing/PdfWorkflowDialogs.locale.test.tsx |
| `ASR-1444` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1445` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/signatures/pdfSignatureMetadataBounds.test.ts, persistence/pdfStudioWomFeatures.test.ts |
| `ASR-1446` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1447` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1448` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1449` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1450` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1451` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1452` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1453` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1454` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1455` | lokale Types lokal halten. | **KEIN BELEG** |
| `ASR-1456` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1457` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/studio/PdfStudioReachability.contract.test.mjs, testing/visual/PdfPageStripKeyboard.contract.test.tsx, testing/interchange/pdfArchiveDialog.contract.test.mjs |
| `ASR-1458` | `index.ts` ausschließlich mit echter Public API bestücken. | **KEIN BELEG** |
| `ASR-1459` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1460` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | **KEIN BELEG** |
| `ASR-1461` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1462` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1463` | App-/Route-/Command-/Provider-IDs stabil halten. | studio/testing/PdfToolbar.locale.test.tsx |
| `ASR-1464` | DocumentKind und native File Extension stabil halten. | interchange/native/openNativePdfPayload.test.ts, interchange/native/PdfNativeOpen.wiring.contract.test.mjs, persistence/pdfStudioPersistence.test.ts |
| `ASR-1465` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1466` | Guide Anchors und data-testid stabil halten. | studio/testing/PdfToolbar.locale.test.tsx |
| `ASR-1467` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1468` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1469` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1470` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/startup/pdfStudioStartupWitness.test.tsx, interchange/native/openNativePdfPayload.test.ts |
| `ASR-1471` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | studio/state/testing/pdfStudioSchema.test.ts, persistence/pdfStudioPersistence.test.ts, locale/testing/PdfWorkflowDialogs.locale.test.tsx |
| `ASR-1472` | Roundtrip `Open PDF → Annotate → Save → Reopen` unter `testing/roundtrip/` ablegen. | interchange/native/PdfNativeOpen.wiring.contract.test.mjs, interchange/native/openNativePdfPayload.test.ts, persistence/pdfStudioWomFeatures.test.ts |
| `ASR-1473` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1474` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1475` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/integration/interchange/pdfStructuredExportHostAdapter.test.ts, testing/integration/workspace/pdfWorkspaceImportHostAdapter.test.ts, testing/visual/PdfToolbar.layout.test.tsx |
| `ASR-1476` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1477` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1478` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | testing/themes/pdfStudioTheme.test.mjs |
| `ASR-1479` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1480` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1481` | Crimson Command visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1482` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1483` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1484` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1485` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1486` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1487` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1488` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1489` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | viewer/testing/PdfViewerLocale.test.tsx, studio/testing/PdfToolbar.locale.test.tsx, ocr/testing/PdfOcrFeedback.locale.test.tsx |
| `ASR-1490` | Spezialpfad `Viewer` nach dem Move funktional testen. | viewer/testing/PdfViewerLocale.test.tsx, testing/visual/PdfPageStripKeyboard.contract.test.tsx, testing/studio/PdfStudioReachability.contract.test.mjs |
| `ASR-1491` | Spezialpfad `Search` nach dem Move funktional testen. | testing/viewer/pdfSearchNavigator.test.ts, testing/studio/PdfStudioReachability.contract.test.mjs, testing/startup/pdfStudioStartupWitness.test.tsx |
| `ASR-1492` | Spezialpfad `Annotations` nach dem Move funktional testen. | annotations/testing/PdfAnnotations.locale.test.tsx, testing/visual/PdfPageStripKeyboard.contract.test.tsx, testing/interaction/pdfStudioAnnotationIdentity.test.ts |
| `ASR-1493` | Spezialpfad `Redaction` nach dem Move funktional testen. | security/redaction/pdfTrueRedactionByteScan.test.ts, security/redaction/pdfTrueRedactionLifecycle.test.ts, testing/visual/PdfPageStripKeyboard.contract.test.tsx |
| `ASR-1494` | Spezialpfad `Signatures` nach dem Move funktional testen. | persistence/pdfStudioWomFeatures.test.ts, locale/testing/PdfWorkflowDialogs.locale.test.tsx |
| `ASR-1495` | Spezialpfad `Export` nach dem Move funktional testen. | testing/integration/interchange/pdfStructuredExportHostAdapter.test.ts, testing/studio/PdfStudioReachability.contract.test.mjs, security/redaction/pdfTrueRedactionByteScan.test.ts |
| `ASR-1496` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/interaction/pdfStudioKeyboard.test.ts |
| `ASR-1497` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** für Reduced-Motion und High-Contrast — der Skalierungsteil („skalierbare UI" aus M05-Z1113) ist seit dem 2026-09-28 belegt: `testing/accessibility/pdfStudioUiScale.runtime.test.tsx` (6 Tests, `@vitest-environment happy-dom`, rendert `PdfStudio` und misst `getComputedStyle(...).fontSize` + `data-astraea-scale-percent` am Wurzelknoten, strukturierter und nativer Pfad). |
| `ASR-1498` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1499` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1500` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1501` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1502` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | security/encryption/pdfStandardPasswordEncryption.test.ts, persistence/pdfStudioWomFeatures.test.ts |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
