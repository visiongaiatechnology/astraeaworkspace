# Belegzuordnung writer — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 233 Testdateien unter `ui/apps/writer/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1153` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1154` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1155` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1156` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1157` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1158` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1159` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1160` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1161` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1162` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1163` | reale Zielstruktur aus `app/editor/toolbar/components/embeds/tables/dialogs/panels/state/model/domain/integrations/persi | testing/unit/integrations/writerEmbedState.contract.test.mjs, testing/acceptance/writerAcceptancePersistence.test.ts, testing/acceptance/writerAcceptanceLetterPersistence.test.ts |
| `ASR-1164` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1165` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/unit/editing/caret/writerKeyboardEntry.test.ts, testing/unit/media/shapes/writerShapeOperations.test.ts, testing/unit/media/images/writerMediaOperationsNan.defect.test.ts |
| `ASR-1166` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1167` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1168` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1169` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1170` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1171` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1172` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1173` | lokale Hooks lokal halten. | testing/unit/media/dictation/writerDictation.test.ts, testing/unit/layout/typography/writerHyphenation.test.ts, testing/unit/interchange/export/pdf/writerPdfStructure.test.ts |
| `ASR-1174` | lokale Utilities lokal halten. | testing/unit/media/dictation/writerDictation.test.ts |
| `ASR-1175` | lokale Types lokal halten. | testing/unit/review/comments/writerCommentsEngine.test.ts, testing/unit/references/writerNoteOrderingAndJump.test.ts, testing/unit/media/dictation/writerDictation.test.ts |
| `ASR-1176` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1177` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/unit/editor/focus/testImportDepth.contract.test.mjs, testing/unit/integrations/writerWorkspaceDropZoneWiring.contract.test.mjs, testing/unit/productivity/writerLanguageSupport.contract.test.mjs |
| `ASR-1178` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/unit/security/writerCryptoInvariants.test.ts, testing/unit/review/revisions/writerTrackChangesDiff.test.ts, testing/unit/references/footnotes/writerNotesEngineFormat.test.ts |
| `ASR-1179` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1180` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/unit/review/compare/writerCombineReviewers.test.ts, testing/unit/review/writerReviewPacketF.test.ts, testing/roundtrip/interchange/writerPrintPreviewGeometry.test.ts |
| `ASR-1181` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1182` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1183` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/performance/layout/pagination/writerPaginationStability.test.ts, testing/unit/review/comments/writerCommentsEngine.test.ts |
| `ASR-1184` | DocumentKind und native File Extension stabil halten. | testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/performance/layout/pagination/writerPaginationStability.test.ts, testing/unit/export/docx/docxImageSubject.test.ts |
| `ASR-1185` | Storage-/Migration-Keys stabil halten. | testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/performance/layout/pagination/writerPaginationStability.test.ts, testing/unit/review/comments/writerCommentsEngine.test.ts |
| `ASR-1186` | Guide Anchors und data-testid stabil halten. | testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/performance/layout/pagination/writerPaginationStability.test.ts, testing/unit/review/comments/writerCommentsEngine.test.ts |
| `ASR-1187` | i18n-Keys stabil halten oder sauber migrieren. | testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/performance/layout/pagination/writerPaginationStability.test.ts, testing/unit/review/comments/writerCommentsEngine.test.ts |
| `ASR-1188` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | testing/unit/review/writerReviewPacketF.test.ts, testing/acceptance/writerAcceptanceEditing.test.tsx |
| `ASR-1189` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1190` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/unit/media/images/writerImageImportBoundary.test.ts, testing/unit/tables/operations/writerTableAdvanced.test.ts, testing/unit/productivity/search/writerSearchEngine.test.ts |
| `ASR-1191` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/integration/workspace/writerWorkspaceIntegrationHostAdapter.test.ts, testing/unit/integrations/writerWorkspaceDropZone.test.tsx, testing/unit/media/images/writerImageImportBoundary.test.ts |
| `ASR-1192` | Roundtrip `Create → Edit → Save → Close → Reopen` unter `testing/roundtrip/` ablegen. | testing/unit/interchange/roundtrip/writerRoundtripPreserver.test.ts, testing/unit/export/docx/docxImageRoundTrip.test.ts, testing/acceptance/writerAcceptanceEditing.test.tsx |
| `ASR-1193` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1194` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1195` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/unit/interchange/writerDocxImportOmissions.test.ts, testing/unit/export/pdf/writerPdfExport.test.ts, testing/unit/export/pdf/documentPdfExportHostAdapter.test.ts |
| `ASR-1196` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1197` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/unit/integrations/writerWorkspaceDropZone.test.tsx, testing/unit/integrations/writerWorkspaceCarrier.test.ts, testing/unit/integrations/WriterWorkspaceCarrierControl.render.test.tsx |
| `ASR-1198` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1199` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1200` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1201` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/unit/interchange/export/pdf/writerPdfBorderCommands.defect.test.ts, testing/unit/integrations/writerWorkspaceDropZone.test.tsx |
| `ASR-1202` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1203` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1204` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1205` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1206` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1207` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1208` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1209` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | layout/page-setup/testing/WriterPageSetup.locale.test.tsx, testing/unit/export/pdf/pdfTextStrings.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx |
| `ASR-1210` | Spezialpfad `Grid Embed Modal` nach dem Move funktional testen. | testing/unit/integrations/writerGridWorkspaceEmbed.test.ts, testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/unit/integrations/writerGridCellDefinition.contract.test.mjs |
| `ASR-1211` | Spezialpfad `Workspace Embed Block` nach dem Move funktional testen. | testing/unit/integrations/writerGridWorkspaceEmbed.test.ts, testing/unit/integrations/writerWorkspaceAnchor.contract.test.mjs, testing/unit/integrations/writerWorkspaceDropZone.test.tsx |
| `ASR-1212` | Spezialpfad `Live Grid Link` nach dem Move funktional testen. | testing/unit/integrations/writerGridLink.test.ts, testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/unit/integrations/writerGridCellFormat.test.ts |
| `ASR-1213` | Spezialpfad `Frozen Snapshot` nach dem Move funktional testen. | testing/unit/integrations/writerGridSnapshotStability.test.ts, testing/unit/boundaries/writerEmbedSnapshotBudget.test.ts, testing/integration/workspace/workspaceSnapshotHostAdapter.test.ts |
| `ASR-1214` | Spezialpfad `Copy as Writer Table` nach dem Move funktional testen. | testing/unit/tables/operations/writerTableOperations.test.ts, tables/properties/testing/WriterTablePropertiesModal.locale.test.tsx, testing/unit/tables/writerTablePacketC.test.ts |
| `ASR-1215` | Spezialpfad `DOCX/PDF/Markdown Interop` nach dem Move funktional testen. | testing/unit/interchange/writerDocxBlockScan.test.ts, testing/unit/export/docx/docxImageAnchoring.test.ts, testing/roundtrip/interchange/writerInteropPacketI.test.ts |
| `ASR-1216` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/unit/layout/page-setup/writerFocusVisibility.contract.test.mjs |
| `ASR-1217` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1218` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1219` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1220` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1221` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1222` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | testing/unit/productivity/writerProductivityPacketH.test.ts, testing/unit/productivity/search/writerSearchEngine.test.ts, testing/unit/media/images/writerMediaOperationsNan.defect.test.ts |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
