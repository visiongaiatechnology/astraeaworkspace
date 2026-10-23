# Inventar writer — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **238**
- Testdateien: **233**
- Zeilen Produktion: **48,114**
- Dateien >350 LOC: **37**
- Dateien >500 LOC: **11**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `editor/useWriterState.ts` | 933 |
| `editor/paragraphs/WriterParagraphItem.tsx` | 786 |
| `integrations/workspace-drop/writerWorkspaceDropZone.ts` | 779 |
| `layout/pages/WriterPagePaper.tsx` | 622 |
| `navigation/toc/WriterTocSidebar.tsx` | 619 |
| `formatting/useWriterFormattingState.ts` | 607 |
| `editor/WriterEditor.tsx` | 595 |
| `formatting/paragraphs/WriterParagraphFormatModal.tsx` | 514 |
| `interchange/export/pdf/writerPdfAssembly.ts` | 512 |
| `editor/modals/WriterEditorModals.tsx` | 504 |
| `tables/properties/WriterTableModalTabs.tsx` | 501 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `media/images/WriterImageModalTabs.tsx` | 492 |
| `interchange/portable/writerPortableInterop.ts` | 491 |
| `interchange/export/pdf/writerPdfExport.ts` | 488 |
| `formatting/styles/WriterStyleInspectorModal.tsx` | 463 |
| `layout/special-views/WriterSpecialViews.tsx` | 455 |
| `formatting/styles/writerStyles.ts` | 442 |
| `utils/writerUtils.ts` | 441 |
| `editor/blocks/tables/WriterTableBlock.tsx` | 438 |
| `layout/pagination/paragraphs/writerParagraphPagination.ts` | 428 |
| `layout/pages/WriterPageRenderer.tsx` | 423 |
| `formatting/toolbar/WriterFormattingToolbar.tsx` | 420 |
| `formatting/lists/WriterListFormatModal.tsx` | 417 |
| `editing/paragraphs/useWriterParagraphOperations.ts` | 410 |
| `formatting/lists/writerMultilevelList.ts` | 407 |
| `collaboration/useWriterCollaboration.ts` | 405 |
| `editor/context-menu/WriterContextMenu.tsx` | 398 |
| `tables/properties/writerTablePropertiesLocale.ts` | 394 |
| `interchange/import/writerImporter.ts` | 385 |
| `tables/operations/writerTableAdvanced.ts` | 380 |
| `layout/page-setup/WriterPageSetupModal.tsx` | 373 |
| `productivity/language/WriterLinguisticsModal.tsx` | 367 |
| `formatting/toolbar/writerToolbarLocale.ts` | 362 |
| `media/images/operations/writerMediaOperations.ts` | 361 |
| `interchange/import/odtContentReader.ts` | 360 |
| `layout/text-layout/writerTextLayout.ts` | 356 |
| `interchange/export/pdf/writerPdfLayoutPrimitives.ts` | 354 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

| Name | Dateien |
|---|---|
| `WriterTextRange` | `editing/text/writerFontRange.ts`, `editing/text/writerSpanFormatToggle.ts` |
| `formatBibliographyEntry` | `references/citations/writerCitationCsl.ts`, `utils/writerUtils.ts` |
| `toRomanNumeral` | `layout/pagination/geometry/writerPaginationGeometry.ts`, `references/notes/writerNotesEngine.ts` |

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 109 |
| `lucide-react` | 53 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
