# Inventar pdf — 2026-10-16

Erzeugt von `tools/build_app_inventory.py`. **Dieses Dokument ist eine MESSUNG, kein Urteil.**
Es belegt die Inventarschritte des App-Blocks aus `docs/plans/2700PLAN.md`.

## Umfang

- Produktionsdateien: **129**
- Testdateien: **37**
- Zeilen Produktion: **23,086**
- Dateien >350 LOC: **15**
- Dateien >500 LOC: **1**

## Dateien >500 LOC

| Datei | Zeilen |
|---|---|
| `locale/pdfWorkflowDialogsLocale.ts` | 701 |

## Dateien 351–500 LOC

| Datei | Zeilen |
|---|---|
| `viewer/PdfNativeViewer.tsx` | 492 |
| `interchange/structuredPdfExport.ts` | 485 |
| `persistence/pdfStudioPersistence.ts` | 484 |
| `studio/PdfStudio.tsx` | 481 |
| `pages/pdfPageOps.ts` | 449 |
| `security/encryption/pdfStandardPasswordEncryption.ts` | 448 |
| `compare/pdfCompareEngine.ts` | 433 |
| `security/redaction/pdfTrueRedaction.ts` | 406 |
| `studio/state/usePdfStudioState.ts` | 397 |
| `testing/roundtrip/PdfRoundtripModal.tsx` | 389 |
| `annotations/pdfReviewAnnotations.ts` | 384 |
| `editing/pdfDirectContentEditing.ts` | 379 |
| `viewer/display/PdfJsDisplayViewer.tsx` | 377 |
| `studio/PdfToolbar.tsx` | 371 |

## Exportierte Namen, die mehrfach vorkommen (Duplicate-Kandidaten)

| Name | Dateien |
|---|---|
| `convertPdfAnnotationsToTasks` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceConversions.ts` |
| `createPdfStudioFromWorkspaceSource` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceConversions.ts` |
| `createWorkspaceDocumentFromPdfPages` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceConversions.ts` |
| `pdfAnnotationUri` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceAdapterSupport.ts` |
| `pdfDocumentUri` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceAdapterSupport.ts` |
| `pdfPageUri` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceAdapterSupport.ts` |
| `storePdfDocumentInVault` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceActionService.ts` |
| `workspaceSourceToPdfPages` | `integrations/pdfWorkspaceActions.ts`, `integrations/pdfWorkspaceConversions.ts` |

## Externe Abhängigkeiten

| Paket | Importe |
|---|---|
| `react` | 39 |
| `lucide-react` | 28 |

## Was dieses Inventar NICHT belegt

- Es sagt nicht, welche Datei bewegt werden SOLL — das ist `ASR-xxxx` „Move-Plan dokumentieren".
- Es behauptet nicht, dass ein mehrfach exportierter Name toter Code ist — er ist ein KANDIDAT.
- Es prueft keine Funktion und keine Sicherheitsinvariante.

**Der Move-Plan und die Dead-Code-Bewertung bleiben offen und sind eigene Punkte.**
