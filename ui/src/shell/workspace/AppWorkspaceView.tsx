// STATUS: PLATIN — Sovereign Active Document Viewport Coordinator
import React, { Suspense, lazy, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { WorkspaceDocument, KeyVaultStatus, ChartObject, NetworkCapability } from '../../shared/contracts/workspace';
import type { WriterPdfSigningRequest } from '../../edition/contracts/writerExportHost';
import { assessWorkspaceDocumentPerformance } from '../../platform/performance/performancePlatform';
import { useWorkspaceLocale } from '../localization/workspaceLocale';
import { shellChromeCopy } from '../i18n/shellChromeLocale';
import type { GridToolbarFormatActions } from '../../apps/grid/formatting/gridToolbarFormatContract';


const WriterEditor = lazy(() => import('../../apps/writer/editor/WriterEditor').then((module) => ({ default: module.WriterEditor })));
const GridSheet = lazy(() => import('../../apps/grid/GridSheet').then((module) => ({ default: module.GridSheet })));
const PresentCanvas = lazy(() => import('../../apps/present/PresentCanvas').then((module) => ({ default: module.PresentCanvas })));
const NotesEditor = lazy(() => import('../../apps/notes/editor/NotesEditor').then((module) => ({ default: module.NotesEditor })));
const PdfStudio = lazy(() => import('../../apps/pdf/studio/PdfStudio').then((module) => ({ default: module.PdfStudio })));
const WhiteboardCanvas = lazy(() => import('../../apps/whiteboard/app/WhiteboardCanvas').then((module) => ({ default: module.WhiteboardCanvas })));
const DrawCanvas = lazy(() => import('../../apps/draw/canvas/DrawCanvas').then((module) => ({ default: module.DrawCanvas }))); 
const EditionWriterSharingPanel = lazy(() => import('../../edition/open-core/runtime/WriterSharingPanel').then((module) => ({ default: module.EditionWriterSharingPanel })));
const PdfDigitalSignatureModal = lazy(() => import('../../apps/pdf/signatures/PdfDigitalSignatureModal').then((module) => ({ default: module.PdfDigitalSignatureModal })));
const EditionWorkManagement = lazy(() => import('../../edition/open-core/runtime/TasksRuntime').then((module) => ({ default: module.EditionWorkManagement })));
const EditionVaultRuntime = lazy(() => import('../../edition/open-core/runtime/VaultRuntime').then((module) => ({ default: module.EditionVaultRuntime })));
const PublishView = lazy(() => import('../../apps/publish/PublishView').then((module) => ({ default: module.PublishView })));
const InsightView = lazy(() => import('../../apps/insight/views/InsightView').then((module) => ({ default: module.InsightView })));
const ConnectView = lazy(() => import('../../apps/connect/components/ConnectView').then((module) => ({ default: module.ConnectView })));
const AutomateView = lazy(() => import('../../apps/automate/app/AutomateView').then((module) => ({ default: module.AutomateView })));
const AdminPolicyView = lazy(() => import('../../apps/admin-policy/panels/AdminPolicyView').then((module) => ({ default: module.AdminPolicyView })));

const WorkspaceModuleFallback: React.FC<{ kind?: WorkspaceDocument['kind'] }> = ({ kind }) => {
  const { locale } = useWorkspaceLocale();
  const copy = shellChromeCopy(locale).workspace;
  const listLike = kind === 'Connect' || kind === 'Tasks';
  if (!listLike) return (
    <div className="flex-1 grid place-items-center text-sm text-gray-400" role="status" aria-live="polite" data-uiux-loading-fallback="simple">{copy.loading}</div>
  );
  return (
    <div className="flex-1 overflow-hidden bg-[#07050d] p-4" role="status" aria-live="polite" aria-label={copy.loadingKind(kind ?? '')} data-uiux-skeleton="list">
      <span className="sr-only">{copy.loadingKind(kind ?? '')}. {copy.placeholders}</span>
      <div className="mb-4 h-8 w-56 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
      <div className="space-y-2">{Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="grid grid-cols-[44px_1fr_22%] items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.025] px-3 py-2" aria-hidden="true">
          <div className="h-8 w-8 rounded-md bg-white/[0.07] animate-pulse motion-reduce:animate-none" />
          <div className="space-y-2"><div className="h-3 w-2/3 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none"/><div className="h-2.5 w-5/6 rounded bg-white/[0.05] animate-pulse motion-reduce:animate-none"/></div>
          <div className="h-3 rounded bg-white/[0.05] animate-pulse motion-reduce:animate-none" />
        </div>
      ))}</div>
    </div>
  );
};

interface AppWorkspaceViewProps {
  /** **Warum** das letzte Speichern scheiterte (W-229) — die Shell ist die einzige Quelle. */
  saveStatus?: 'saved' | 'saved-with-warning' | 'saving' | 'unsaved' | 'error';
  saveFailure?: { readonly code: 'storage-full' | 'save-blocked' | 'native-unavailable' | 'unknown'; readonly at: number } | null;
  activeDoc: WorkspaceDocument | null;
  gridFormatActionRef: MutableRefObject<((format: 'currency' | 'percent' | 'number') => void) | null>;
  /** Optional versioned Grid-toolbar handle (quick formats incl. date + preset catalogue). */
  gridToolbarFormatActionsRef?: MutableRefObject<GridToolbarFormatActions | null>;
  documents: Record<string, WorkspaceDocument>;
  storedWorkspaceDocuments: readonly Pick<WorkspaceDocument, 'id' | 'kind' | 'title' | 'modified_at'>[];
  loadStoredWorkspaceDocument: (documentId: string) => Promise<WorkspaceDocument | null>;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onSelectSelectionType: (sel: 'text' | 'cell' | 'shape' | 'chart') => void;
  onCreateDerivedDocument: (doc: WorkspaceDocument) => void;
  onInsertChart: (input?: string | ChartObject) => void;
  onOpenDocument: (documentId: string) => void;
  onOpenExternalUrl: (url: string) => void | Promise<void>;
  allowBrowserManagedSpeech: boolean;
  vaultStatus: KeyVaultStatus;
  activeDocumentPin: string | null;
  activeDocumentPassword?: string | null;
  onSetActiveDocumentPin?: (pin: string | null) => void;
  onSetActiveDocumentPassword?: (password: string | null) => void;
  networkCapability: NetworkCapability;
}

export const AppWorkspaceView: React.FC<AppWorkspaceViewProps> = ({
  saveStatus,
  saveFailure,
  activeDoc,
  gridFormatActionRef,
  gridToolbarFormatActionsRef,
  documents,
  storedWorkspaceDocuments,
  loadStoredWorkspaceDocument,
  onUpdateDocument,
  onSelectSelectionType,
  onCreateDerivedDocument,
  onInsertChart,
  onOpenDocument,
  onOpenExternalUrl,
  allowBrowserManagedSpeech,
  vaultStatus,
  activeDocumentPin,
  activeDocumentPassword,
  onSetActiveDocumentPin,
  onSetActiveDocumentPassword,
  networkCapability,
}) => {
  const { locale } = useWorkspaceLocale();
  const chrome = shellChromeCopy(locale).workspace;
  const [writerPdfSigningRequest, setWriterPdfSigningRequest] = useState<{ documentId: string; request: WriterPdfSigningRequest } | null>(null);
  useEffect(() => {
    setWriterPdfSigningRequest(null);
  }, [activeDoc?.id]);

  const documentValues = useMemo(() => Object.values(documents) as WorkspaceDocument[], [documents]);
  const performanceAssessmentVersionBucket = activeDoc ? Math.floor(activeDoc.version / 64) : 0;
  const performanceAssessment = useMemo(
    () => activeDoc ? assessWorkspaceDocumentPerformance(activeDoc) : null,
    // Reassess on open and periodically while editing; avoid a full bounded scan on every keystroke.
    [activeDoc?.id, performanceAssessmentVersionBucket],
  );
  const activeWriterPdfSigningRequest = activeDoc?.kind === 'Writer' && writerPdfSigningRequest?.documentId === activeDoc.id
    ? writerPdfSigningRequest.request
    : null;

  if (activeDoc && performanceAssessment?.mode === 'degraded-readonly') {
    return (
      <div className="flex-1 w-full overflow-auto p-8" role="region" aria-label={chrome.readOnlyTitle}>
        <div className="mx-auto max-w-2xl rounded-xl border border-amber-500/40 bg-amber-950/20 p-6">
          <h2 className="text-lg font-semibold text-amber-100">{chrome.readOnlyTitle}</h2>
          <p className="mt-2 text-sm text-amber-50/80">
            {chrome.readOnlyDescription}
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-400">{chrome.document}</dt><dd>{activeDoc.title || activeDoc.id}</dd>
            <dt className="text-gray-400">{chrome.kind}</dt><dd>{activeDoc.kind}</dd>
            <dt className="text-gray-400">{chrome.reason}</dt><dd>{performanceAssessment.reason ? chrome.performanceReason[performanceAssessment.reason as keyof typeof chrome.performanceReason] ?? chrome.unknownReason : chrome.unknownReason}</dd>
          </dl>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      <Suspense fallback={<WorkspaceModuleFallback kind={activeDoc?.kind} />}>
      {activeDoc?.kind === 'Writer' && (
        <>
        <WriterEditor
          saveStatus={saveStatus}
          saveFailure={saveFailure}
          document={activeDoc}
          workspaceDocuments={documentValues}
          storedWorkspaceDocuments={storedWorkspaceDocuments}
          loadStoredWorkspaceDocument={loadStoredWorkspaceDocument}
          onUpdateDocument={onUpdateDocument}
          onSelectSelectionType={onSelectSelectionType}
          onOpenDocument={onOpenDocument}
          onOpenExternalUrl={onOpenExternalUrl}
          allowBrowserManagedSpeech={allowBrowserManagedSpeech}
          writerExportHost={{
            sharingPanel: <EditionWriterSharingPanel document={activeDoc} />,
            onRequestPdfSigning: (request) => setWriterPdfSigningRequest({ documentId: activeDoc.id, request }),
          }}
        />
        {activeWriterPdfSigningRequest && (
          <PdfDigitalSignatureModal
            isOpen
            onClose={() => setWriterPdfSigningRequest(null)}
            documentTitle={activeWriterPdfSigningRequest.documentTitle}
            currentPage={activeWriterPdfSigningRequest.currentPage}
            getPdfBytes={activeWriterPdfSigningRequest.getPdfBytes}
            onSignedSuccess={(result) => activeWriterPdfSigningRequest.onSignedSuccess(result.providerLabel)}
          />
        )}
        </>
      )}

      {activeDoc?.kind === 'Grid' && (
        <GridSheet
          document={activeDoc}
          gridFormatActionRef={gridFormatActionRef}
          gridToolbarFormatActionsRef={gridToolbarFormatActionsRef}
          onUpdateDocument={onUpdateDocument}
          onUpdateWorkspaceDocument={onUpdateDocument}
          onSelectSelectionType={onSelectSelectionType}
          onCreateChart={(chart) => onInsertChart(chart)}
          networkCapability={networkCapability}
          keyVaultUnlocked={!vaultStatus.isLocked}
        />
      )}

      {activeDoc?.kind === 'Present' && (
        <PresentCanvas
          document={activeDoc}
          // **W-444 behoben (Runde 241) ✗✓:** Present war der **einzige** verbliebene Fall dieser Klasse — Writer (:140),
          // Notes (:191), PdfStudio (:204), Draw (:225), Vault (:239) und Insight (:261) bekommen `documentValues`,
          // Present **nicht** ✗. Folge, gemessen vom Present-Agenten mit Zeile: `PresentCanvas.tsx:43` setzt still `{}`,
          // `:253` leitet daraus `sourceDocuments` = `[]` ab, `:264` `if (!source) return object;` →
          // **Live-Referenzen konnten in Produktion nie aktualisieren** ✗. *Ein optionaler Prop, der still leer wird,
          // ist die leiseste Form einer toten Fähigkeit.* ✓
          //
          // **Und diese Zeile allein ist bewusst nicht die ganze Behebung ✓:** Das Ablagezonen-Overlay wird auf
          // `PresentCanvas`-Ebene montiert (dort liegen `document` **und** jetzt die Liste) — *ohne die Montage zeigt
          // Present „bereit" und scheitert beim Loslassen* ✗. Beides gehört zusammen.
          // **ZURUECKGENOMMEN (Runde 241) ✗✓:** Hier stand `workspaceDocuments={documentValues}` — und der kalte
          // Typlauf meldete `TS2322: Type 'WorkspaceDocument[]' is not assignable to type 'Record<…>'` ✓.
          // **Mein Fehler:** `documentValues` ist ein **Array** (Z. 102) ✓ und die sechs anderen Ansichten nehmen
          // **W-444, Schritt 2 (Runde 253) ✓** — das **Literal** des Present-Agenten, nicht meine Annahme ✗:
          // `documents` (Z. 55) ist **bereits** `Record<string, WorkspaceDocument>` ✓ — genau die Form, die
          // `PresentCanvas.tsx:35` verlangt. **Nicht** `documentValues` (Z. 102 ✗): das ist das **Array**, und der
          // kalte Typlauf hat meinen ersten Versuch damit abgelehnt ✓
          // (`TS2322: Type 'WorkspaceDocument[]' is not assignable to type 'Record<…>'`).
          // *Die sechs anderen Ansichten nehmen ein Array — Present ist die Ausnahme, und ich hatte die Ausnahme
          // fuer die Regel gehalten.* ✓
          workspaceDocuments={documents}
          onUpdateDocument={onUpdateDocument}
          onSelectSelectionType={onSelectSelectionType}
          onOpenWorkspaceDocument={onOpenDocument}
        />
      )}

      {activeDoc?.kind === 'Notes' && (
        <NotesEditor
          document={activeDoc}
          workspaceDocuments={documentValues}
          onUpdateDocument={onUpdateDocument}
          onUpdateWorkspaceDocument={onUpdateDocument}
          onCreateDerivedDocument={onCreateDerivedDocument}
          onSelectSelectionType={onSelectSelectionType}
          onOpenWorkspaceDocument={onOpenDocument}
          onOpenExternalUrl={onOpenExternalUrl}
        />
      )}

      {activeDoc?.kind === 'PdfStudio' && (
        <PdfStudio
          document={activeDoc}
          workspaceDocuments={documentValues}
          onUpdateDocument={onUpdateDocument}
          onUpdateWorkspaceDocument={onUpdateDocument}
          onCreateDerivedDocument={onCreateDerivedDocument}
          onOpenWorkspaceDocument={onOpenDocument}
          networkCapability={networkCapability}
          onOpenExternalUrl={onOpenExternalUrl}
        />
      )}

      {activeDoc?.kind === 'Whiteboard' && (
        <WhiteboardCanvas
          key={activeDoc.id}
          document={activeDoc}
          onUpdateDocument={onUpdateDocument}
          onCreateDerivedDocument={onCreateDerivedDocument}
          onOpenWorkspaceDocument={onOpenDocument}
        />
      )}

      {activeDoc?.kind === 'Draw' && (
        <DrawCanvas document={activeDoc} onUpdateDocument={onUpdateDocument} workspaceDocuments={documentValues} />
      )}

      {activeDoc?.kind === 'Tasks' && (
        <EditionWorkManagement
          document={activeDoc}
          onUpdateDocument={onUpdateDocument}
          onCreateDerivedDocument={onCreateDerivedDocument}
          // **AST-1001: die App nennt den Vertrag, die Shell reicht ihn durch.** Tasks bekam bisher
          // **keine** Dokumentliste und **keinen** Navigator — jedes andere App-Zweig hat beides.
          // **Dieselbe Form wie der Vault-Zweig darunter** (`documents` = das Array `documentValues`,
          // Z. 102; `onOpenDocument` = der vorhandene Navigator, Z. 62). *Keine zweite Navigation.*
          documents={documentValues}
          onOpenDocument={onOpenDocument}
        />
      )}

      {activeDoc?.kind === 'Vault' && (
        <EditionVaultRuntime
          document={activeDoc}
          documents={documentValues}
          onUpdateDocument={onUpdateDocument}
          onCreateDerivedDocument={onCreateDerivedDocument}
          onOpenDocument={onOpenDocument}
          vaultStatus={{ ...vaultStatus, hasPin: Boolean(activeDocumentPin), hasPortablePassword: Boolean(activeDocumentPassword) }}
          activeDocumentPin={activeDocumentPin}
          activeDocumentPassword={activeDocumentPassword}
          onSetActiveDocumentPin={onSetActiveDocumentPin}
          onSetActiveDocumentPassword={onSetActiveDocumentPassword}
          networkCapability={networkCapability}
        />
      )}

      {activeDoc?.kind === 'Publish' && (
        <PublishView
          document={activeDoc}
          // **Publish bekommt die Dokumentliste (Runde 280) ✗✓** — gefunden vom Publish-Agenten (Paket 13), der
          // die Grenze **meldete** statt sie zu ueberschreiten. Dieselbe Gestalt wie `W-444` bei Present.
          // **Mit der richtigen Form:** `documents` (Z. 55) ist der **Record**, den `PublishView` verlangt —
          // **nicht** `documentValues` (Z. 102), das **Array**. *Der Nachbarzweig Insight bekommt das Array,
          // Present und Publish den Record: die Form ist keine Konvention, sie ist eine Eigenschaft.*
          workspaceDocuments={documents}
          onUpdateDocument={onUpdateDocument}
        />
      )}

      {activeDoc?.kind === 'Insight' && (
        <InsightView
          workspaceDocuments={documentValues}
          document={activeDoc}
          onUpdateDocument={onUpdateDocument}
          networkCapability={networkCapability}
        />
      )}

      {activeDoc?.kind === 'Connect' && (
        <ConnectView
          document={activeDoc}
          onUpdateDocument={onUpdateDocument}
        />
      )}

      {activeDoc?.kind === 'Automate' && (
        <AutomateView document={activeDoc} onUpdateDocument={onUpdateDocument} />
      )}

      {activeDoc?.kind === 'AdminPolicy' && (
        <AdminPolicyView document={activeDoc} onUpdateDocument={onUpdateDocument} />
      )}
      </Suspense>
    </div>
  );
};