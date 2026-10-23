// STATUS: DIAMANT VGT SUPREME — Astraea Publish Main Workspace View
import { isImeCompositionEvent } from '../../shared/accessibility/accessibilityPlatform';
import React, { useEffect, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { PublishToolbar } from './editor/PublishToolbar';
import { PublishCanvas } from './canvas/PublishCanvas';
import { PublishInspector } from './editor/PublishInspector';
import { PublishAdvancedModal } from './prepress/PublishAdvancedModal';
import { PublishNewDocumentDialog } from './editor/PublishNewDocumentDialog';
import { PublishPagesPanel } from './editor/PublishPagesPanel';
import { DEFAULT_PUBLISH_MODEL, PublishDocumentModel } from './contracts/types';
import {
  addFrameToPublish, addPublishPage, normalizePublishModel, setFrameRect, setPublishPageMaster,
  setPublishPageRotation, syncPublishCompatibility, updateActivePageGeometry, updatePublishMasterPage,
} from './model/publishDocumentEngine';
import { describePublishCreation, createPublishProject, type PublishCreationSpec } from './model/publishDocumentFactory';
import { nudgePublishFrame, removePublishFrame, resolvePublishKeyIntent, selectPublishFrame, setPublishFrameContent, updatePublishFrame } from './model/publishFrameOps';
import { appendThreadFrame, linkPublishFrames, resolvePublishThreadOverflow, unlinkPublishFrameAfter } from './model/publishThreadOps';
import { placePublishImage } from './assets/publishAssetOps';
import { VaultPickerModal } from '../../shared/vault/picker/VaultPickerModal';
import { placeWorkspaceAsset } from './integrations/publishWorkspaceIntegration';
import {
  PUBLISH_VAULT_PICKER_ACTION,
  PUBLISH_VAULT_PICKER_APP,
  resolvePublishVaultPickerEntry,
  resolvePublishVaultPickerOutcome,
} from './integrations/publishVaultPicker';
import { assignPublishStyle, createPublishStyle, createPublishSwatch, insertPublishTable, setPublishBaselineGridAlignment, setPublishTracking, assignPublishSwatch } from './model/publishStyleOps';
import { writePublishPayload, readPublishPayload } from './model/publishPersistence';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { createPublishHistory, pushPublishHistory, redoPublishHistory, undoPublishHistory, type PublishHistoryState } from './history/publishHistoryEngine';
import { buildPublishExport, deliverPublishExport, describePublishExport, type PublishExportArtifact, type PublishExportTarget } from './interchange/publishExportDelivery';
import { publishWorkspaceFormat } from './publishWorkspaceLocale';
import { useWorkspaceLocale } from '../../shell/localization/workspaceLocale';
// **Paket 13** — die Ablagezone: die Substanz liegt rein in `drop-zone/**` (kopflos prüfbar), hier steht nur die
// Anbindung. *Die Ansicht entscheidet nichts; sie hängt die Zone an die Fläche und rendert ihren Zustand.*
import { usePublishWorkspaceDropZone } from './drop-zone/usePublishWorkspaceDropZone';
import { PublishWorkspaceDropZoneOverlay } from './drop-zone/PublishWorkspaceDropZoneOverlay';
import type { WorkspaceLiveMode } from '../../shared/workspace-interaction';
import { acceptPublishStoryDrop, publishCarrierObjectType, publishStoryAcceptanceText, publishStoryRefusalMessage } from './integrations/publishStoryAcceptance';
import {
  PUBLISH_TABLE_CARRIER_OBJECT_KIND, acceptPublishTableDrop, describePublishTable, publishTableRefusalText,
} from './integrations/publishTableAcceptance';
import { buildPublishPreflightReport, setPublishPreflightProfile } from './model/publishPresetOps';
import { buildPublishExportPreview, publishPreviewBlockingReasons } from './model/publishExportPreview';
import { setPublishFrameColumns, setPublishParagraphBreak, setPublishTextWrap } from './model/publishTextFlowOps';
import type { IccProfileId } from './prepress/publishPrepressEngine';
import { embedPublishSvg, insertPublishShape, type PublishShapeKind } from './model/publishShapeOps';

/**
 * Zustand des Exports: es gab vorher keinen — der Knopf rief `window.print()` auf.
 *
 * `target` ist Teil des Zustands, weil „PDF/X-4" und „EPUB" verschiedene Ergebnisse sind und eine Meldung
 * ohne Ziel nicht sagt, was geschrieben wurde.
 */
type PublishExportState =
  | { kind: 'idle' }
  | { kind: 'busy'; target: PublishExportTarget }
  | { kind: 'done'; artifact: PublishExportArtifact; delivered: boolean }
  | { kind: 'error'; message: string };

interface PublishViewProps {
  document: WorkspaceDocument;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  /**
   * Die im Workspace **bekannten** Dokumente — **additiv und optional**, damit kein Aufrufer bricht.
   *
   * Ohne diese Liste kennt die Fläche die **Quelle** eines Zuges nicht; der Resolver nennt das dann **benannt**
   * (`drop_source_document_missing`) statt still zuzustellen. *Eine Fähigkeit ohne Aufrufer ist keine Fähigkeit —
   * deshalb wird sie hier angenommen, sobald die Shell sie reicht.*
   */
  workspaceDocuments?: Record<string, WorkspaceDocument>;
}

export const PublishView: React.FC<PublishViewProps> = ({
  document,
  onUpdateDocument,
  workspaceDocuments,
}) => {
  const { locale } = useWorkspaceLocale();

  /**
   * **Paket 15 — der Live-Modus wird gesagt, nicht angenommen.**
   *
   * `undefined` heißt „noch nicht gewählt" und wird **nicht** als Wert an die Zone gereicht (bedingtes Spreizen
   * im Hook). *Ein vorbelegtes „Live" wäre genau der heimliche Default, den die Zone an ihrer Stelle verbietet.*
   */
  const [dropMode, setDropMode] = useState<WorkspaceLiveMode | undefined>(undefined);

  /**
   * **Paket 13**: die eine Autorität (Paket 4), der eine Parser (Paket 7) und das eine Ablageurteil (Paket 6)
   * werden hier **benutzt**, nicht nachgebaut. Diese eine Zeile ist die gesamte Fachlichkeit der Ansicht —
   * *eine Regel in der Ansicht wäre eine zweite Wahrheit.*
   */
  const workspaceDropZone = usePublishWorkspaceDropZone({
    targetDocument: document,
    documents: workspaceDocuments,
    ...(dropMode === undefined ? {} : { requestedMode: dropMode }),
  });

  // WOM persistence under document.publishData or default, with bounded canonical history.
  const [history, setHistory] = useState<PublishHistoryState>(() => createPublishHistory(
    normalizePublishModel(document.publishData || DEFAULT_PUBLISH_MODEL),
  ));
  const model = history.present;

  const [showPreflight, setShowPreflight] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [showNewDocument, setShowNewDocument] = useState(false);
  const [pagesPanelOpen, setPagesPanelOpen] = useState(true);
  /** Der Grund der letzten abgelehnten Aktion — sichtbar, nicht nur in der Konsole. */
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(() => { try { return window.localStorage.getItem('astraea.uiux.publish-inspector.v1') !== 'closed'; } catch { return true; } });
  useEffect(() => { try { window.localStorage.setItem('astraea.uiux.publish-inspector.v1', inspectorOpen ? 'open' : 'closed'); } catch { /* optional local UI preference */ } }, [inspectorOpen]);

  useEffect(() => {
    setHistory(createPublishHistory(normalizePublishModel(document.publishData || DEFAULT_PUBLISH_MODEL)));
  }, [document.id]);

  const persistHistory = (next: PublishHistoryState) => {
    onUpdateDocument({
      ...document,
      modified_at: Date.now(),
      publishData: next.present,
    });
    return next;
  };

  /**
   * Jede Dokumentaenderung laeuft hier durch.
   *
   * `syncPublishCompatibility` ist Pflicht (Eigentum `page.frameIds`, Spiegelfeld `pagesCount`), und ein Fehler
   * aus der kanonischen Invariante wird **angezeigt** statt die Oberflaeche stumm zu lassen. Vorher warf ein
   * fehlerhafter Aufruf in den Ereignishandler und der Klick tat sichtbar nichts.
   */
  const handleUpdateModel = (updater: (prev: PublishDocumentModel) => PublishDocumentModel) => {
    setHistory((prev) => {
      try {
        return persistHistory(pushPublishHistory(prev, syncPublishCompatibility(updater(prev.present))));
      } catch (cause) {
        setNotice({ kind: 'error', text: `${cause instanceof Error ? cause.message : String(cause)}` });
        return prev;
      }
    });
  };
  const handleUndo = () => setHistory((prev) => persistHistory(undoPublishHistory(prev)));
  const handleRedo = () => setHistory((prev) => persistHistory(redoPublishHistory(prev)));

  const handleCreateDocument = (spec: PublishCreationSpec) => {
    const next = createPublishProject(spec);
    const report = describePublishCreation(next, spec.title ?? document.title ?? '');
    onUpdateDocument({
      ...document,
      // Eine neue Dokumentidentitaet ist der **Anlass**, die Historie zurueckzusetzen: sonst waere „Rueckgaengig"
      // nach dem Anlegen ein Sprung in das vorherige Dokument.
      id: `${document.id}#new-${Date.now()}`,
      title: spec.title?.trim() ? spec.title.trim() : document.title,
      modified_at: Date.now(),
      publishData: next,
    });
    setHistory(createPublishHistory(next));
    setShowNewDocument(false);
    setNotice({ kind: 'info', text: publishWorkspaceFormat('created', locale, { summary: report.summary }) });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isImeCompositionEvent(event)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo(); else handleUndo();
        return;
      }
      // Pfeiltasten, Entf und Escape: die Absicht kommt aus der reinen Funktion, nicht aus einem zweiten
      // Tastensatz hier. Ein Eingabefeld behaelt seine Tasten.
      const target = event.target as HTMLElement | null;
      const editingText = Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)));
      const intent = resolvePublishKeyIntent({ key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, editingText });
      if (!intent) return;
      const selected = model.selectedFrameId;
      if (intent.kind === 'nudge' && selected && intent.direction) {
        event.preventDefault();
        handleUpdateModel(prev => nudgePublishFrame(prev, selected, intent.direction!, intent.coarse === true));
        return;
      }
      if (intent.kind === 'delete-frame' && selected) {
        event.preventDefault();
        handleUpdateModel(prev => removePublishFrame(prev, selected));
        return;
      }
      if (intent.kind === 'deselect') {
        handleUpdateModel(prev => selectPublishFrame(prev, null));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [document, onUpdateDocument, model.selectedFrameId]);

  const handleAddFrame = (type: 'text' | 'image', rect?: { x: number; y: number; width: number; height: number }) => {
    handleUpdateModel((prev) => {
      const created = addFrameToPublish(prev, type, {
        name: type === 'text' ? 'Editorial text frame' : 'Placed image frame',
        content: type === 'text' ? '' : '',
        ...(rect ?? {}),
      });
      // Ein neuer Rahmen ist sofort bereit zum Tippen: leer, ausgewaehlt, ohne Verkettung. Vorher enthielt er
      // Beispieltext, sodass „sofort tippen" bedeutete, zuerst fremden Text zu loeschen.
      return created;
    });
  };

  /**
   * Der Export ist ein **Vorgang mit Zustaenden**, nicht ein Druckaufruf.
   *
   * Gemessen in Runde 59: hier stand `window.print()`. Es entstand keine Datei, es gab keinen Fortschritt,
   * keinen Fehlerzustand und keine Vorpruefung. Der echte Bauer existierte daneben und wurde nur vom
   * Prepress-Dialog benutzt. Gemessen in Runde Publish-5: die Beschriftung sagte PDF/X, der Aufruf uebergab
   * `target: 'PDF'`.
   */
  const [exportState, setExportState] = useState<PublishExportState>({ kind: 'idle' });

  const handleExport = async (target: PublishExportTarget) => {
    // Doppelklick-Schutz: ein zweiter Lauf waehrend des Exports wuerde zwei Dateien erzeugen.
    if (exportState.kind === 'busy') return;
    /**
     * **Der Export liest die Vorschau wirklich** (`AST-1441/1442`) ✓✓.
     *
     * Gemessen vorher: die Vorpruefung, der Anschnitt und die Farbkonvertierung lagen an drei Stellen, und der
     * Exportweg las **keine** davon — er konnte etwas ausgeben, das die Vorschau nie gezeigt hatte. *Eine
     * Vorschau, die etwas anderes zeigt als der Export tut, ist der Punkt **nicht** erfuellt.*
     *
     * Deshalb steht die Entscheidung **hier**, vor dem Bauer: **dieselbe** Funktion, die die Oberflaeche anzeigt
     * (`buildPublishExportPreview`), entscheidet auch hier — und die Sperre nennt ihre Gruende.
     */
    const preview = buildPublishExportPreview(model, { target });
    if (preview.blocking) {
      const reasons = publishPreviewBlockingReasons(preview);
      setNotice({ kind: 'error', text: `${reasons.length} blocking finding(s): ${reasons.slice(0, 3).join(' ')}` });
      setExportState({ kind: 'error', message: reasons[0] ?? 'Export blocked by the export preview.' });
      return;
    }
    setExportState({ kind: 'busy', target });
    try {
      const artifact = await buildPublishExport(model, { target, title: document.title || 'Astraea Publication', profileId: preview.profileId });
      const delivery = await deliverPublishExport(artifact);
      setExportState({ kind: 'done', artifact, delivered: delivery.mode === 'file' });
      if (delivery.mode !== 'file') setNotice({ kind: 'info', text: `Download started: ${delivery.fileName} (browser mode – no write confirmation).` });
    } catch (cause) {
      // Konkrete Meldung statt eines stummen Nicht-Exports.
      setExportState({ kind: 'error', message: `${cause instanceof Error ? cause.message : 'Unbekannter Fehler'}` });
    }
  };

  const handlePlaceImage = async (frameId: string, file: { name: string; bytes: Uint8Array; declaredMime?: string; embed: boolean; canonicalUri?: string }) => {
    try {
      const next = await placePublishImage(model, frameId, { name: file.name, bytes: file.bytes, declaredMime: file.declaredMime, embed: file.embed, canonicalUri: file.canonicalUri });
      handleUpdateModel(() => next);
    } catch (cause) {
      setNotice({ kind: 'error', text: `${cause instanceof Error ? cause.message : String(cause)}` });
    }
  };

  /**
   * **AST-1226 — der Cross-App-Vault-Picker in Publish.**
   *
   * Gemessen vorher: `VaultPicker` hatte in `apps/publish` **0 Treffer**, und `placeWorkspaceAsset`
   * (`integrations/publishWorkspaceIntegration.ts:20`) — die vorhandene Fähigkeit, eine
   * `vault-asset`-Referenz an einen Rahmen zu hängen — hatte **keinen** Aufrufer. Hier steht deshalb nur
   * die **Verdrahtung**: Einstieg → geteilter Dialog → vorhandene Ablage. Kein zweiter Picker, keine
   * zweite Referenz, keine zweite Autoritätsregel.
   */
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const vaultPickerEntry = resolvePublishVaultPickerEntry(Object.values(workspaceDocuments ?? {}));
  const vaultAssetBlockedReason = vaultPickerEntry.state === 'locked'
    ? 'The Vault session is locked. Unlock it in the Vault first.'
    : vaultPickerEntry.state === 'absent'
      ? 'There is no Vault document in this workspace.'
      : model.selectedFrameId
        ? null
        : 'Select a frame before placing a Vault asset.';

  /**
   * **Vektoren und Formen** (`AST-1406/1407`) — der sichtbare Einstieg und die eine Wirkung.
   *
   * Eine Form ist ein Rahmen der Art `'graphic'`, ihre Kontur steht in `clippingPath` (normiert) und ihre
   * Strich-/Deckungswerte in `strokeColor`/`strokeWidthPt`/`opacity`. *Keine erfundene Vokabel: dieselben Felder,
   * die der SVG-Export und der Canvas lesen.*
   */
  const handleAddShape = (kind: PublishShapeKind) => {
    handleUpdateModel(prev => insertPublishShape(prev, { kind, widthMm: kind === 'line' ? 60 : 50, heightMm: kind === 'line' ? 40 : 50 }));
    setNotice({ kind: 'info', text: `Shape · ${kind}` });
  };

  /**
   * **Ein SVG einbetten** — die Bytes gehen durch den **vorhandenen** Aufnehmer (`embedPublishSvg` →
   * `ingestPublishAsset`), der Format, Groesse und **aktive Inhalte** prueft. *Kein zweiter Aufnahmeweg, und
   * Kontur wie Deckung des Rahmens bleiben erhalten.*
   */
  const handleEmbedSvg = async (file: { name: string; bytes: Uint8Array }) => {
    const frameId = model.selectedFrameId;
    if (!frameId) {
      setNotice({ kind: 'error', text: 'Select a graphic frame before embedding an SVG.' });
      return;
    }
    try {
      const result = await embedPublishSvg(model, frameId, { name: file.name, bytes: file.bytes });
      handleUpdateModel(() => result.model);
      setNotice({ kind: 'info', text: `Embedded SVG: ${file.name}` });
    } catch (cause) {
      setNotice({ kind: 'error', text: `${cause instanceof Error ? cause.message : String(cause)}` });
    }
  };

  /**
   * **Die annehmende Hälfte für Tabellen** (`AST-1411/1412`) — die Matrix trägt die Route
   * (`imports: [{ objectKind: 'Table', intents: ['COPY'] }]`), und bis hierher nahm Publish sie **nicht** an.
   *
   * Die Annahme steht rein in `integrations/publishTableAcceptance.ts`; die Verdrahtung ist die **Weiche** unten
   * im Zustellungs-Effekt — *eine zweite Aufrufstelle hier wäre ein zweiter Weg in dieselbe Annahme.*
   */

  /**
   * **Die annehmende Hälfte** ✓✓ — aus einer **zugestellten** Resolution wird ein verlinkter Story-Rahmen.
   *
   * Gemessen vor dieser Verdrahtung: `PublishWorkspaceDropResolution` wurde in genau **zwei** Dateien erwähnt,
   * und **beide erzeugen sie**. Die Zone stellte also zu, und niemand nahm an — *eine Fähigkeit ohne Aufrufer ist
   * nicht geliefert* ✗✓. Die Annahme selbst steht rein in `integrations/publishStoryAcceptance.ts`; hier steht
   * **nur** die Verdrahtung: ein `delivered` → ein Aufruf → ein sichtbares Ergebnis oder ein benannter Grund.
   *
   * Der Schlüssel verhindert den zweiten Lauf für **dieselbe** Zustellung: *der Zustand bleibt nach der Ablage
   * stehen (er ist eine Tatsache, die der Nutzer sehen soll) — ohne den Riegel liefe die Annahme bei jedem
   * Rendern erneut und meldete beim zweiten Mal „der Rahmen trägt schon eine Story".*
   *
   * Der Effekt hängt **nur** am Schlüssel: er läuft genau dann, wenn eine **neue** Zustellung vorliegt — und
   * `model` ist dann der Stand genau dieses Renderns, also nicht veraltet.
   */
  const deliveredKey = workspaceDropZone.state.decision.kind === 'delivered'
    ? `${workspaceDropZone.state.decision.resolution.adapterId}:${workspaceDropZone.state.decision.resolution.sourceDocumentId}:${workspaceDropZone.state.decision.resolution.sourceObjectId}:${workspaceDropZone.state.decision.resolution.targetVersion}`
    : null;
  const acceptedDelivery = useRef<string | null>(null);
  useEffect(() => {
    if (deliveredKey === null || acceptedDelivery.current === deliveredKey) return;
    const decision = workspaceDropZone.state.decision;
    if (decision.kind !== 'delivered') return;
    // Zuerst merken: die Annahme darf sich nicht selbst erneut auslösen.
    acceptedDelivery.current = deliveredKey;
    /**
     * **Die Weiche** — welcher Annehmer zuständig ist, entscheidet die **Objektart**, und sie wird **einmal**
     * gelesen (`publishCarrierObjectType`). *Zwei Annehmer und eine Weiche, die selbst noch einmal liest, wären
     * drei Leser derselben Frage.*
     */
    const documents = workspaceDocuments ?? {};
    const carrierType = publishCarrierObjectType(documents, decision.resolution.sourceDocumentId, decision.resolution.sourceObjectId);
    if (carrierType === PUBLISH_TABLE_CARRIER_OBJECT_KIND) {
      const table = acceptPublishTableDrop(model, { delivered: true, resolution: decision.resolution }, documents);
      if (!table.ok) {
        setNotice({ kind: 'error', text: publishTableRefusalText(table.reason) });
        return;
      }
      handleUpdateModel(() => table.model);
      setNotice({ kind: 'info', text: `${describePublishTable(table.table)} · ${table.mode}` });
      return;
    }
    const step = acceptPublishStoryDrop(model, { delivered: true, resolution: decision.resolution }, documents);
    if (!step.ok) {
      setNotice({ kind: 'error', text: publishStoryRefusalMessage(step.reason) });
      return;
    }
    handleUpdateModel(() => step.model);
    setNotice({ kind: 'info', text: publishStoryAcceptanceText(step.reference) });
    // Bewusst nur am Zustellungsschlüssel: eine neue Ablage ist das einzige auslösende Ereignis.
  }, [deliveredKey]);

  const localeFormat = (message: Parameters<typeof publishWorkspaceFormat>[0], values: Record<string, string | number>) => publishWorkspaceFormat(message, locale, values);

  return (
    <div data-vgt-publish-root="true" className="flex-1 flex flex-col h-full bg-[#07050d] text-slate-100 overflow-hidden select-none">
      {/* 1. DTP Toolbar */}
      <PublishToolbar
        model={model}
        documentTitle={document.title || 'Astraea Publication'}
        onUpdateModel={handleUpdateModel}
        onAddFrame={handleAddFrame}
        onAddShape={handleAddShape}
        onEmbedSvg={handleEmbedSvg}
        onPickVaultAsset={() => setVaultPickerOpen(true)}
        vaultAssetBlockedReason={vaultAssetBlockedReason}
        onNewDocument={() => setShowNewDocument(true)}
        onExport={handleExport}
        exporting={exportState.kind === 'busy' ? exportState.target : null}
        showPreflight={showPreflight}
        onTogglePreflight={() => setShowPreflight(!showPreflight)}
        onOpenStudioModal={() => setShowStudioModal(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        zoomPercent={Math.round(canvasScale * 100)}
        onZoomOut={() => setCanvasScale((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}
        onZoomIn={() => setCanvasScale((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
        pagesPanelOpen={pagesPanelOpen}
        onTogglePagesPanel={() => setPagesPanelOpen(open => !open)}
        /**
         * **Die Zahl am Preflight-Knopf kommt aus dem Bericht** (`AST-1403`) — mit dem **gespeicherten** Profil.
         *
         * Gemessen vorher zaehlte die Ansicht nur ueberlaufende Rahmen. Der Akzeptanzsatz verlangt aber
         * fehlenden Font, fehlende Bildaufloesung und Anschnitt **als navigierbare Fehler** — und die haengen am
         * Profil. *Eine Zahl, die ein anderes Profil benutzt als die Liste darunter, waere eine zweite Wahrheit.*
         */
        preflightErrorCount={buildPublishPreflightReport(model, undefined).errorCount}
      />

      {/* Der Export- und Hinweiszustand ist sichtbar — Erfolg, Fortschritt und Fehler als Text, nicht nur als Farbe. */}
      {exportState.kind !== 'idle' && (
        <div
          role={exportState.kind === 'error' ? 'alert' : 'status'}
          data-publish-export-state={exportState.kind}
          data-publish-export-target={exportState.kind === 'busy' ? exportState.target : exportState.kind === 'done' ? exportState.artifact.target : undefined}
          className={`px-4 py-1.5 text-[0.6875rem] border-b ${
            exportState.kind === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              : exportState.kind === 'busy'
                ? 'bg-white/[0.03] border-white/10 text-slate-300'
                : exportState.delivered && exportState.artifact.warnings.length === 0
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          {exportState.kind === 'busy' && localeFormat('exportRunning', { target: exportState.target })}
          {exportState.kind === 'done' && localeFormat('exportDone', { summary: describePublishExport(exportState.artifact) })}
          {exportState.kind === 'done' && !exportState.delivered && ' · Download started in the browser (no write confirmation).'}
          {exportState.kind === 'error' && localeFormat('exportFailed', { reason: exportState.message })}
        </div>
      )}
      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} data-publish-notice={notice.kind}
          className={`px-4 py-1 text-[0.6875rem] border-b ${notice.kind === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 'bg-purple-500/10 border-purple-500/25 text-purple-200'}`}>
          {notice.text}
          <button type="button" onClick={() => setNotice(null)} className="ml-3 underline decoration-dotted">{'dismiss'}</button>
        </div>
      )}

      {/*
        **Der geteilte Dialog, nicht ein zweiter.** `VaultPickerModal` filtert mit der Autorität; Publish
        entscheidet nur, *welcher* Tresor und *welche* Anwendung. Die Wahl wird **erneut** geurteilt, und
        die Ablage geht durch die **vorhandene** `placeWorkspaceAsset` — kein zweiter Weg an denselben
        Rahmen.
      */}
      {vaultPickerOpen && (
        <VaultPickerModal
          isOpen
          requestingApp={PUBLISH_VAULT_PICKER_APP}
          action={PUBLISH_VAULT_PICKER_ACTION}
          title="Place a protected Vault asset"
          files={vaultPickerEntry.state === 'ready' ? vaultPickerEntry.files : []}
          grants={vaultPickerEntry.state === 'ready' ? vaultPickerEntry.request.grants : []}
          onSelect={(candidate) => {
            if (vaultPickerEntry.state !== 'ready') { setVaultPickerOpen(false); return; }
            const entry = vaultPickerEntry;
            const frameId = model.selectedFrameId;
            setVaultPickerOpen(false);
            if (!frameId) {
              setNotice({ kind: 'error', text: 'Select a frame before placing a Vault asset.' });
              return;
            }
            const outcome = resolvePublishVaultPickerOutcome(entry, candidate.fileId);
            if (!outcome.ok) {
              setNotice({ kind: 'error', text: `The Vault access authority refused this selection (${outcome.reason}).` });
              return;
            }
            try {
              handleUpdateModel((prev) => placeWorkspaceAsset(prev, frameId, entry.vaultDocument, outcome.fileId, 'live'));
              setNotice({ kind: 'info', text: `Vault asset placed: ${outcome.name}` });
            } catch (cause) {
              setNotice({ kind: 'error', text: `${cause instanceof Error ? cause.message : String(cause)}` });
            }
          }}
          onCancel={() => setVaultPickerOpen(false)}
        />
      )}

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">        {pagesPanelOpen && (
          <PublishPagesPanel model={model} onUpdateModel={handleUpdateModel} />
        )}
        {/*
          Canvas Center — **Paket 13**: die Ablagezone wird hier gebunden.

          **Capture-Phase, nicht Blase.** Der Rahmen-Drop der Leinwand ruft `stopPropagation()`; ein Blasen-Handler
          bekäme einen Arbeitsflächen-Zug, der auf einem **Rahmen** abgelegt wird, deshalb **nie** zu sehen — und
          er verschwände still, ohne benannten Grund. Die Entscheidung „wem gehört dieser Zug" fällt an der
          MIME-Art (`isPublishWorkspaceDrag`): ist der Zug **nicht** unserer, wird nichts abgefangen und der
          Bildpfad der Leinwand bleibt unangetastet. *Genau ein Empfänger pro Zug.*

          Die Zone steht **außerhalb** der Leinwandfläche (Geschwister, nicht Kind) — deshalb ist sie ohne die
          Leinwand erreichbar, und die Tastatur braucht keinen Zeiger. Die Eingabeart wird **nicht** erfunden:
          `publishWorkspaceDropInputKind` ist die eine Übersetzung (`PointerEvent.pointerType`).
        */}
        <div
          className="relative flex flex-1 min-w-0"
          onDragEnterCapture={workspaceDropZone.onDragEnter}
          onDragOverCapture={workspaceDropZone.onDragOver}
          onDragLeaveCapture={workspaceDropZone.onDragLeave}
          onDropCapture={workspaceDropZone.onDrop}
          onPointerDownCapture={(event) => workspaceDropZone.noteInputKind(event.pointerType)}
        >
          <PublishCanvas
            model={model}
            onUpdateModel={handleUpdateModel}
            scale={canvasScale}
            onPlaceImage={handlePlaceImage}
          />
          <PublishWorkspaceDropZoneOverlay
            state={workspaceDropZone.state}
            inputKind={workspaceDropZone.inputKind}
            onConfirm={workspaceDropZone.confirm}
            onChooseIntent={workspaceDropZone.chooseIntent}
            onDismiss={workspaceDropZone.dismiss}
            onKeyDown={workspaceDropZone.onKeyDown}
            // Paket 15: der Modus ist eine **eigene** sichtbare Wahl — ohne sie bleibt ein Live-Verweis benannt.
            {...(dropMode === undefined ? {} : { requestedMode: dropMode })}
            onChooseMode={setDropMode}
          />
        </div>

        {/* Docked, persistent sidecar inspector. */}
        <div className="relative flex shrink-0">
          <button type="button" onClick={() => setInspectorOpen((open) => !open)} aria-label={inspectorOpen ? 'Publish inspector einklappen' : 'Publish inspector öffnen'} title={inspectorOpen ? 'Inspector einklappen' : 'Inspector öffnen'} className="absolute -left-8 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-purple-500/20 bg-[#0c0817] text-purple-300 hover:bg-purple-900/30">{inspectorOpen ? <PanelRightClose className="h-3.5 w-3.5"/> : <PanelRightOpen className="h-3.5 w-3.5"/>}</button>
          {inspectorOpen && <PublishInspector
            model={model}
            onUpdateModel={handleUpdateModel}
            showPreflight={showPreflight}
            commands={{
              nudgeFrame: (frameId, direction, coarse) => handleUpdateModel(prev => nudgePublishFrame(prev, frameId, direction, coarse)),
              setFrameRect: (frameId, rect) => handleUpdateModel(prev => setFrameRect(prev, frameId, rect)),
              setFrameContent: (frameId, content) => handleUpdateModel(prev => setPublishFrameContent(prev, frameId, content)),
              updateFrame: (frameId, patch) => handleUpdateModel(prev => updatePublishFrame(prev, frameId, patch)),
              removeFrame: (frameId) => handleUpdateModel(prev => removePublishFrame(prev, frameId)),
              setMaster: (pageId, masterId) => handleUpdateModel(prev => setPublishPageMaster(prev, pageId, masterId)),
              setRotation: (pageId, rotation) => handleUpdateModel(prev => setPublishPageRotation(prev, pageId, rotation)),
              updateMaster: (masterId, patch) => handleUpdateModel(prev => updatePublishMasterPage(prev, masterId, patch)),
              linkThread: (fromId, toId) => handleUpdateModel(prev => linkPublishFrames(prev, fromId, toId)),
              unlinkThread: (frameId) => handleUpdateModel(prev => unlinkPublishFrameAfter(prev, frameId)),
              appendThreadFrame: (frameId) => handleUpdateModel(prev => appendThreadFrame(prev, frameId)),
              resolveOverflow: (frameId, fromFrameId) => handleUpdateModel(prev => resolvePublishThreadOverflow(prev, fromFrameId ?? frameId)),
              assignStyle: (frameId, styleId) => handleUpdateModel(prev => assignPublishStyle(prev, frameId, styleId)),
              createStyle: (name, kind, fontSizePt) => handleUpdateModel(prev => createPublishStyle(prev, name, kind, fontSizePt === undefined ? {} : { fontSizePt }).model),
              createSwatch: (spec) => handleUpdateModel(prev => createPublishSwatch(prev, spec).model),
              addShape: (request) => handleUpdateModel(prev => insertPublishShape(prev, { kind: request.kind, widthMm: 50, heightMm: 50, ...(request.strokeColor === undefined ? {} : { strokeColor: request.strokeColor }), ...(request.strokeWidthPt === undefined ? {} : { strokeWidthPt: request.strokeWidthPt }), ...(request.opacity === undefined ? {} : { opacity: request.opacity }) })),
              setBaselineGrid: (frameId, align) => handleUpdateModel(prev => setPublishBaselineGridAlignment(prev, frameId, align)),
              setTracking: (frameId, tracking) => handleUpdateModel(prev => setPublishTracking(prev, frameId, tracking)),
              assignSwatch: (frameId, swatchId, role) => handleUpdateModel(prev => assignPublishSwatch(prev, frameId, swatchId, role)),
              setPreflightProfile: (profileId) => handleUpdateModel(prev => setPublishPreflightProfile(prev, profileId as IccProfileId)),
              setTextWrap: (frameId, mode, offsetMm) => handleUpdateModel(prev => setPublishTextWrap(prev, frameId, { mode, offsetMm, contourThreshold: 0.5 })),
              setColumns: (frameId, columns) => handleUpdateModel(prev => setPublishFrameColumns(prev, frameId, columns)),
              setParagraphBreak: (frameId, value) => handleUpdateModel(prev => setPublishParagraphBreak(prev, frameId, value)),
              insertTable: (frameId, name, rows, columns) => handleUpdateModel(prev => insertPublishTable(prev, frameId, name, rows, columns).model),
              updateGeometry: (patch) => handleUpdateModel(prev => updateActivePageGeometry(prev, patch)),
              addPage: () => handleUpdateModel(prev => addPublishPage(prev)),
            }}
          />}
        </div>
      </div>

      {/* 3. Advanced Prepress & PDF/X Studio Modal */}
      <PublishAdvancedModal
        isOpen={showStudioModal}
        onClose={() => setShowStudioModal(false)}
        documentTitle={document.title || 'Astraea Publication'}
        model={model}
        onUpdateModel={handleUpdateModel}
      />

      {/* 4. Sichtbarer Einstieg „Neues Layoutdokument" */}
      <PublishNewDocumentDialog
        isOpen={showNewDocument}
        onCancel={() => setShowNewDocument(false)}
        onCreate={handleCreateDocument}
      />
    </div>
  );
};

/**
 * Die Nutzlast fuer einen Speichervorgang — exportiert, damit die Verdrahtung pruefbar ist, ohne zu rendern.
 */
export function currentPublishPayload(document: WorkspaceDocument): string | null {
  if (document.kind !== 'Publish' || !document.publishData) return null;
  return writePublishPayload(document, readPublishPayload(document), Date.now()).payloadText;
}
