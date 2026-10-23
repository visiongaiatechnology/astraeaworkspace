// STATUS: PLATIN — Sovereign Workspace Actions & Interoperability Coordinator
import { useCallback } from 'react';
import type {
  ChartObject,
  WorkspaceDocument,
  DocumentKind,
  KeyVaultStatus,
  NetworkCapability,
  NetworkAuditEntry,
} from '../../shared/contracts/workspace';
import { createNewDocument } from '../../edition/contracts/documentFactory';
import { getBetaTemplateDefinition, type BetaTemplateId } from '../../platform/templates/templateCatalog';
import { instantiateNativeBetaTemplate } from '../../platform/templates/nativeThemeTemplate';
import { precheckPolicy } from '../../platform/native/nativePolicy';
import { detectOfficeFormat, downloadOfficeDocument, importOfficeDocument } from '../../platform/interop/index';
import { deleteRecoverySnapshot, restoreRecoverySnapshot, type RecoverySnapshotInfo } from '../../platform/recovery/recovery';
import { buildDiagnosticBundle, buildDiagnosticReport, collectRuntimeDiagnosticsInfo, downloadDiagnosticBundle, openDiagnosticBundleExactPreview, serializeDiagnosticBundleExact } from '../../platform/diagnostics/diagnostics';
import { executeOpenFile, evaluateNetGatePolicy } from '../../platform/operations/appContainerOps';
import {
  createPdfModelFromNormalizedJpegs,
  flattenForeignPdfBytes,
  inspectNativePdfBytes,
  PDF_WORKSPACE_IMPORT_LIMITS,
} from '../../platform/interop/pdfWorkspaceImport';
import { buildStructuredPdfBytes } from '../../platform/interop/pdfStructuredExport';
import { assertPdfActiveContentEliminated } from '../../platform/interop/pdfActiveContentPolicy';
import { migrateWorkspaceDocument } from '../../platform/workspace/model/workspaceObjectModel';
import { securityPolicyForDocument } from '../../platform/security/securityProfiles';
import { inspectForeignFile } from '../../platform/import-sandbox/importExportSandbox';
import { applyFabricExportPolicy, scanFabricLinks, type FabricExportPolicy } from '../../shared/workspace-interaction/fabric';
import { assertNonExecutableWorkspaceFile } from '../../platform/security/security';
import type { EditionRegistry } from '../../edition/contracts';
import { useWorkspaceLocale, workspaceText } from '../localization/workspaceLocale';
import {
  applyTextFormat,
  applyCellFormat,
  insertShapeToDoc,
  insertChartToDoc,
} from '../../shared/workspace/operations/documentActions';

interface UseWorkspaceActionsProps {
  editionRegistry: EditionRegistry;
  documents: Record<string, WorkspaceDocument>;
  setDocuments: React.Dispatch<React.SetStateAction<Record<string, WorkspaceDocument>>>;
  activeDocId: string;
  setActiveDocId: (id: string) => void;
  vaultStatus: KeyVaultStatus;
  networkCapability: NetworkCapability;
  setAuditLogs: React.Dispatch<React.SetStateAction<NetworkAuditEntry[]>>;
  setDocumentPins: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setDocumentPasswords: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setIsStartCenterOpen: (open: boolean) => void;
  setIsAppLauncherOpen: (open: boolean) => void;
  recoverySnapshots: RecoverySnapshotInfo[];
  refreshRecoverySnapshots: () => Promise<void>;
  showToast: (msg: string) => void;
  markDocumentDirty: (docId: string) => void;
  handleUpdateDocument: (doc: WorkspaceDocument) => void;
}

export function useWorkspaceActions({
  editionRegistry,
  documents,
  setDocuments,
  activeDocId,
  setActiveDocId,
  vaultStatus,
  networkCapability,
  setAuditLogs,
  setDocumentPins,
  setDocumentPasswords,
  setIsStartCenterOpen,
  setIsAppLauncherOpen,
  recoverySnapshots,
  refreshRecoverySnapshots,
  showToast,
  markDocumentDirty,
  handleUpdateDocument,
}: UseWorkspaceActionsProps) {
  const { locale } = useWorkspaceLocale();
  const requireImplementedKind = useCallback((kind: DocumentKind): boolean => {
    if (editionRegistry.isImplementedApp(kind)) return true;
    showToast(workspaceText('edition.appUnavailable', locale));
    return false;
  }, [editionRegistry, locale, showToast]);
  /**
   * Beta creation gate — the **single** chokepoint for every "new document" ingress (command palette,
   * launcher, start center, templates, derived documents). `isImplementedApp` only proves the edition
   * ships the app; `isCreationAvailable` proves the Beta allows creating it. Without this check the
   * admin-&-policy release gate could be bypassed through the command palette.
   */
  const requireCreatableKind = useCallback((kind: DocumentKind): boolean => {
    if (editionRegistry.isCreationAvailable(kind)) return true;
    showToast(workspaceText('edition.creationUnavailable', locale));
    return false;
  }, [editionRegistry, locale, showToast]);

  const handleOpenDocument = useCallback((documentId: string) => {
    const target = documents[documentId];
    if (!target) return;
    if (!requireImplementedKind(target.kind)) return;
    setActiveDocId(target.id);
  }, [documents, requireImplementedKind, setActiveDocId]);

  const handleRenameDoc = useCallback((newTitle: string) => {
    const doc = documents[activeDocId];
    if (!doc || !newTitle.trim()) return;
    handleUpdateDocument({ ...doc, title: newTitle.trim(), modified_at: Date.now() });
  }, [documents, activeDocId, handleUpdateDocument]);

  const handleCreateDocument = useCallback((kind: DocumentKind, customTitle?: string) => {
    if (!requireCreatableKind(kind)) return;
    const newDoc = createNewDocument(kind);
    if (customTitle) newDoc.title = customTitle;
    markDocumentDirty(newDoc.id);
    setDocuments((prev) => ({ ...prev, [newDoc.id]: newDoc }));
    setActiveDocId(newDoc.id);
    setIsStartCenterOpen(false);
    showToast(`Created new ${kind} document`);
  }, [markDocumentDirty, requireCreatableKind, setDocuments, setActiveDocId, setIsStartCenterOpen, showToast]);

  const handleCreateTemplate = useCallback(async (templateId: BetaTemplateId) => {
    const templateDefinition = getBetaTemplateDefinition(templateId);
    if (!templateDefinition || !requireCreatableKind(templateDefinition.kind)) return;
    try {
      const templateDoc = migrateWorkspaceDocument(await instantiateNativeBetaTemplate(templateId));
      if (!requireCreatableKind(templateDoc.kind)) return;
      markDocumentDirty(templateDoc.id);
      setDocuments((prev) => ({ ...prev, [templateDoc.id]: templateDoc }));
      setActiveDocId(templateDoc.id);
      setIsStartCenterOpen(false);
      showToast(`Created from template: ${templateDoc.title}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Template creation failed');
    }
  }, [markDocumentDirty, requireCreatableKind, setDocuments, setActiveDocId, setIsStartCenterOpen, showToast]);

  const handleCreateDerivedDocument = useCallback((doc: WorkspaceDocument) => {
    const canonical = migrateWorkspaceDocument(doc);
    if (!requireCreatableKind(canonical.kind)) return;
    markDocumentDirty(canonical.id);
    setDocuments((prev) => ({ ...prev, [canonical.id]: canonical }));
    setActiveDocId(canonical.id);
    showToast(`Imported ${canonical.title}`);
  }, [markDocumentDirty, requireCreatableKind, setDocuments, setActiveDocId, showToast]);

  const handleCloseDocument = useCallback((id: string) => {
    const docKeys = Object.keys(documents);
    if (docKeys.length <= 1) return;

    setDocuments((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setDocumentPins((prev) => {
      if (!(id in prev)) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setDocumentPasswords((prev) => {
      if (!(id in prev)) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    if (activeDocId === id) {
      const remaining = docKeys.filter((k) => k !== id);
      setActiveDocId(remaining[0]);
    }
  }, [documents, activeDocId, setDocuments, setDocumentPins, setDocumentPasswords, setActiveDocId]);

  const handleOpenFile = useCallback(async (file: File) => {
    try {
      assertNonExecutableWorkspaceFile(file.name);
      const recognizedExtension = editionRegistry.recognizeKnownExtension(file.name);
      if (recognizedExtension?.availability === 'premium-required') {
        showToast(workspaceText('edition.documentUnavailable', locale));
        return;
      }
      const officeFormat = detectOfficeFormat(file.name);
      if (officeFormat) {
        const imported = migrateWorkspaceDocument(await importOfficeDocument(file));
        markDocumentDirty(imported.id);
        setDocuments((prev) => ({ ...prev, [imported.id]: imported }));
        setActiveDocId(imported.id);
        setIsStartCenterOpen(false);
        showToast(`Imported ${officeFormat.toUpperCase()} locally: ${file.name}`);
        return;
      }
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        if (file.size <= 0 || file.size > PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes) {
          throw new Error(`PDF import rejected: file size must be 1..${PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes} bytes.`);
        }
        if (file.type && file.type !== 'application/pdf') {
          throw new Error(`PDF import rejected: declared MIME ${file.type} does not match application/pdf.`);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength !== file.size) throw new Error('PDF import rejected: measured byte length changed during read.');
        const sandbox = await inspectForeignFile(file, bytes);
        if (sandbox.report.format !== 'pdf') throw new Error(`PDF extension/MIME does not match sandbox-detected ${sandbox.report.format.toUpperCase()} content.`);
        const inspection = await inspectNativePdfBytes(bytes);
        if (inspection.encrypted) throw new Error('Encrypted foreign PDFs must be decrypted explicitly before destructive safe import.');

        // Foreign PDFs are never retained as their original object graph. Raster flattening
        // destroys JavaScript, Launch actions, EmbeddedFiles and incremental hidden payloads.
        const flattenedPages = await flattenForeignPdfBytes(bytes, file.name);
        const sanitizedPdfData = {
          ...createPdfModelFromNormalizedJpegs(flattenedPages),
          metadataSanitized: true,
        };
        const sanitizedProbe = buildStructuredPdfBytes(file.name, sanitizedPdfData);
        assertPdfActiveContentEliminated(sanitizedProbe);
        const now = Date.now();
        const pdfDoc: WorkspaceDocument = {
          id: `pdf-${now}`,
          title: file.name,
          kind: 'PdfStudio',
          created_at: now,
          modified_at: now,
          version: 1,
          theme_id: 'default',
          root_object_ids: [],
          objects: {},
          foreignInterop: { sourceFormat: 'pdf', inspection: sandbox.report, preservedParts: [] },
          pdfData: sanitizedPdfData,
        };
        handleCreateDerivedDocument(pdfDoc);
        showToast(`Opened hardened native PDF locally: ${file.name}`);
        return;
      }
      const opened = await executeOpenFile(
        file,
        () => window.prompt('Document is PIN protected. Enter its 4-8 digit PIN:'),
        () => window.prompt('Document uses a portable password. Enter password:'),
      );
      const doc = opened.document;
      if (!requireImplementedKind(doc.kind)) return;
      markDocumentDirty(doc.id);
      setDocuments((prev) => ({ ...prev, [doc.id]: doc }));
      if (opened.pinUsed) setDocumentPins((prev) => ({ ...prev, [doc.id]: opened.pinUsed! }));
      if (opened.passwordUsed) setDocumentPasswords((prev) => ({ ...prev, [doc.id]: opened.passwordUsed! }));
      setActiveDocId(doc.id);
      setIsStartCenterOpen(false);
      showToast(`Decrypted and loaded ${doc.title}`);
    } catch (err: any) {
      const message = typeof err === 'string' ? err : err?.message || 'Failed to open file';
      showToast(message);
    }
  }, [editionRegistry, locale, markDocumentDirty, setDocuments, setActiveDocId, setIsStartCenterOpen, showToast, setDocumentPins, setDocumentPasswords, handleCreateDerivedDocument, requireImplementedKind]);

  const handleSelectApp = useCallback((kind: DocumentKind) => {
    if (!requireImplementedKind(kind)) return;
    const existing = Object.values(documents).find((d) => d.kind === kind);
    if (existing) {
      setActiveDocId(existing.id);
    } else {
      handleCreateDocument(kind);
    }
    setIsAppLauncherOpen(false);
  }, [documents, setActiveDocId, handleCreateDocument, setIsAppLauncherOpen, requireImplementedKind]);

  const handleFormatText = useCallback((cmd: string, val?: any) => {
    const active = documents[activeDocId];
    if (!active) return;
    const { updatedDoc, message } = applyTextFormat(active, cmd, val);
    handleUpdateDocument(updatedDoc);
    showToast(message);
  }, [documents, activeDocId, handleUpdateDocument, showToast]);

  const handleFormatCell = useCallback((format: 'currency' | 'percent' | 'number') => {
    const active = documents[activeDocId];
    if (!active) return;
    const { updatedDoc, message } = applyCellFormat(active, format);
    handleUpdateDocument(updatedDoc);
    showToast(message);
  }, [documents, activeDocId, handleUpdateDocument, showToast]);

  const handleInsertShape = useCallback((shape: string) => {
    const active = documents[activeDocId];
    if (!active) return;
    const { updatedDoc, message } = insertShapeToDoc(active, shape);
    handleUpdateDocument(updatedDoc);
    showToast(message);
  }, [documents, activeDocId, handleUpdateDocument, showToast]);

  const handleInsertChart = useCallback((input?: string | ChartObject) => {
    const active = documents[activeDocId];
    if (!active) return;
    const { updatedDoc, message } = insertChartToDoc(active, input);
    handleUpdateDocument(updatedDoc);
    showToast(message);
  }, [documents, activeDocId, handleUpdateDocument, showToast]);

  const handleExportDiagnostics = useCallback(async () => {
    try {
      const runtimeInfo = await collectRuntimeDiagnosticsInfo();
      const report = buildDiagnosticReport(Object.values(documents), vaultStatus, recoverySnapshots, runtimeInfo);
      const active = documents[activeDocId] ?? null;
      const canIncludeDocument = active !== null && securityPolicyForDocument(active).profile !== 'VGT_TOP_SECRET';
      const includeSelectedDocument = canIncludeDocument
        ? window.confirm('Optional reproduction payload: include the currently selected document body in this local bundle?\n\nCancel keeps the diagnostic export metadata-only. Nothing is uploaded automatically.')
        : false;
      const bundle = await buildDiagnosticBundle({
        report,
        selectedDocument: active,
        includeSelectedDocument,
        explicitDocumentApproval: includeSelectedDocument,
      });
      const serialized = serializeDiagnosticBundleExact(bundle);
      const closePreview = openDiagnosticBundleExactPreview(serialized);
      const approved = window.confirm('The exact JSON bytes that will be exported were opened in a separate preview tab. Review that complete preview. Create this local diagnostic bundle from those exact bytes? Cancel exports nothing.');
      closePreview();
      if (!approved) return;
      const fileName = await downloadDiagnosticBundle(bundle, serialized);
      showToast(`Local diagnostic bundle exported: ${fileName}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Diagnostic export failed');
    }
  }, [documents, activeDocId, vaultStatus, recoverySnapshots, showToast]);

  const handleExportOffice = useCallback(async () => {
    const active = documents[activeDocId];
    if (!active) return;
    if (securityPolicyForDocument(active).profile !== 'STANDARD') {
      showToast('Protected documents must be explicitly downgraded/resealed before plaintext Office export.');
      return;
    }
    try {
      const policyDecision = await precheckPolicy('file.export', `document:${active.id}`, { kind: active.kind });
      if (policyDecision.effect !== 'Allow') { showToast('Export is blocked by workspace policy.'); return; }
      const activeLinks = scanFabricLinks(documents).filter((link) => link.targetDocId === activeDocId && link.mode === 'Live');
      let fabricExportPolicy: FabricExportPolicy = 'RefreshThenFreeze';
      if (activeLinks.length > 0) {
        fabricExportPolicy = window.confirm(`This document contains ${activeLinks.length} live Workspace link(s).

OK: refresh sources and freeze semantic snapshots into the export.
Cancel: freeze only the already-current source versions.`)
          ? 'RefreshThenFreeze'
          : 'FreezeCurrent';
      }
      const exportDocuments = applyFabricExportPolicy(documents, activeDocId, fabricExportPolicy, { destinationIsWorkspaceNative: false });
      const exportDocument = exportDocuments[activeDocId];
      const fileName = await downloadOfficeDocument(exportDocument);
      showToast(`Exported Office interoperability file: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Office export failed';
      if (message.startsWith('FOREIGN_FIDELITY_CONFIRMATION_REQUIRED:')) {
        const detail = message.slice('FOREIGN_FIDELITY_CONFIRMATION_REQUIRED:'.length) || 'Some unsupported foreign features may not survive this conversion.';
        if (!window.confirm(`This export can lose unsupported foreign features.\n\n${detail}\n\nContinue with the destructive roundtrip?`)) return;
        try {
          const exportDocuments = applyFabricExportPolicy(documents, activeDocId, 'RefreshThenFreeze', { destinationIsWorkspaceNative: false });
          const fileName = await downloadOfficeDocument(exportDocuments[activeDocId], { confirmForeignLoss: true });
          showToast(`Exported with confirmed fidelity loss: ${fileName}`);
        } catch (retryError) {
          showToast(retryError instanceof Error ? retryError.message : 'Office export failed');
        }
        return;
      }
      showToast(message);
    }
  }, [documents, activeDocId, showToast]);

  const handleRestoreRecovery = useCallback(async (snapshotId: string) => {
    try {
      const recovered = await restoreRecoverySnapshot(
        snapshotId,
        () => window.prompt('Recovery snapshot is PIN protected. Enter its 4-8 digit PIN:'),
        () => window.prompt('Recovery snapshot uses a portable password. Enter password:'),
      );
      if (!requireImplementedKind(recovered.kind)) return;
      markDocumentDirty(recovered.id);
      setDocuments((prev) => ({ ...prev, [recovered.id]: recovered }));
      setActiveDocId(recovered.id);
      setIsStartCenterOpen(false);
      showToast(`Recovered ${recovered.title}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Recovery failed');
    }
  }, [markDocumentDirty, setDocuments, setActiveDocId, setIsStartCenterOpen, showToast, requireImplementedKind]);

  const handleDeleteRecovery = useCallback(async (snapshotId: string) => {
    try {
      await deleteRecoverySnapshot(snapshotId);
      await refreshRecoverySnapshots();
    } catch {
      showToast('Recovery snapshot could not be dismissed');
    }
  }, [refreshRecoverySnapshots, showToast]);

  const handleTriggerTestConnection = useCallback(async (target: string, purpose: string) => {
    try {
      const activeDocument = documents[activeDocId];
      const profile = activeDocument ? securityPolicyForDocument(activeDocument).profile : 'STANDARD';
      const { entry, message } = await evaluateNetGatePolicy(target, networkCapability, profile, {
        componentId: activeDocument ? `app-${activeDocument.kind.toLowerCase()}` : 'workspace-shell',
        documentId: activeDocument?.id ?? null,
        purpose,
        method: 'GET',
        expectedResponseBytes: 64 * 1024,
        timeoutMs: 5_000,
      });
      setAuditLogs((prev) => [entry, ...prev].slice(0, 256));
      showToast(message);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'NetGate Core evaluation failed');
    }
  }, [documents, activeDocId, networkCapability, setAuditLogs, showToast]);

  return {
    handleRenameDoc,
    handleCreateDocument,
    handleCreateTemplate,
    handleCreateDerivedDocument,
    handleCloseDocument,
    handleOpenFile,
    handleOpenDocument,
    handleSelectApp,
    handleFormatText,
    handleFormatCell,
    handleInsertShape,
    handleInsertChart,
    handleExportDiagnostics,
    handleExportOffice,
    handleRestoreRecovery,
    handleDeleteRecovery,
    handleTriggerTestConnection,
  };
}
