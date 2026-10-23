import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Layers, ListTree } from 'lucide-react';
import { WhiteboardCanvasProps } from '../types';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardObjectsText } from '../whiteboardObjectsLocale';
import { exportWhiteboardToPNG } from '../integrations/canvasExport';
import { resolveWhiteboardKeyboardCommand, WHITEBOARD_KEYBOARD_HELP } from '../selection/whiteboardKeyboardEngine';
import { isWhiteboardFileDrag } from '../interactions/whiteboardDropPolicy';
import { WhiteboardDropZoneOverlay } from '../drop-zone/WhiteboardDropZoneOverlay';
import { isWhiteboardWorkspaceDrag } from '../drop-zone/whiteboardDropZone';
import { useWhiteboardDropZone } from '../drop-zone/useWhiteboardDropZone';
import type { WhiteboardDropResolution } from '../drop-zone/whiteboardDropZoneContract';
import {
  acceptWhiteboardTableDrop,
  whiteboardFreeDropPosition,
} from '../live-objects/whiteboardLiveAcceptance';
import { WhiteboardObjectList } from '../a11y/WhiteboardObjectList';
import { WhiteboardTextToolbar } from '../toolbar/WhiteboardTextToolbar';
import { whiteboardItemSupportsTextStyle } from '../model/whiteboardTextStyleEngine';
import { WhiteboardToolbar } from '../toolbar/WhiteboardToolbar';
import { SlideExportModal } from '../integrations/SlideExportModal';
import { WhiteboardInteropModal } from '../integrations/WhiteboardInteropModal';
import { DrawAdvancedModal } from '../tools/DrawAdvancedModal';
import { WhiteboardItemsRenderer } from '../objects/WhiteboardItemsRenderer';
import { useWhiteboardState } from '../state/useWhiteboardState';
import {
  closeWhiteboardDockPanel,
  openWhiteboardDockPanel,
  toggleWhiteboardDockPanel,
  whiteboardDisplacedPanels,
  whiteboardDockFlags,
  type WhiteboardDockPanelId,
} from '../state/whiteboardPanelDock';
import { GridLiveReferenceCard, tableFromWorkspaceReference } from '../../grid/integrations/GridLiveReferenceCard';
import { WhiteboardMiniMap } from '../minimap/WhiteboardMiniMap';
import { WhiteboardRulers } from '../canvas/WhiteboardRulers';
import { WhiteboardNavigatorPanel } from '../floating-controls/WhiteboardNavigatorPanel';
import { WhiteboardSpatialIndex } from '../rendering/whiteboardSpatialIndexEngine';
import { expandRenderSetForConnectors } from '../viewport/whiteboardViewportEngine';
import { WhiteboardInkDraftOverlay, WhiteboardInkRenderer } from '../canvas/WhiteboardInkRenderer';
import { WhiteboardInkToolbar } from '../toolbar/WhiteboardInkToolbar';
import { WhiteboardRichObjectsRenderer } from '../objects/WhiteboardRichObjectsRenderer';
import { WhiteboardObjectPalette } from '../tools/WhiteboardObjectPalette';
import { WhiteboardManipulationToolbar } from '../toolbar/WhiteboardManipulationToolbar';
import { WhiteboardDiagramObjectsRenderer } from '../objects/WhiteboardDiagramObjectsRenderer';
import { WhiteboardDiagramPanel } from '../tools/WhiteboardDiagramPanel';
import { WhiteboardTemplatePanel } from '../tools/WhiteboardTemplatePanel';
import { WhiteboardFacilitationPanel } from '../tools/WhiteboardFacilitationPanel';
import { WhiteboardParticipantCursors } from '../canvas/WhiteboardParticipantCursors';
import { WhiteboardCollaborationPanel } from '../integrations/WhiteboardCollaborationPanel';
import { WhiteboardLiveObjectsPanel } from '../live-objects/WhiteboardLiveObjectsPanel';
import { WhiteboardLiveObjectsRenderer } from '../live-objects/WhiteboardLiveObjectsRenderer';
import { WhiteboardOrganizationPanel } from '../tools/WhiteboardOrganizationPanel';
import { buildWhiteboardRenderProjection } from '../rendering/whiteboardRenderProjection';
import '../canvas/WhiteboardCanvas.css';
import '../state/whiteboardDock.css';

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  document,
  onUpdateDocument,
  onCreateDerivedDocument,
  workspaceDocuments = {},
  onOpenWorkspaceDocument,
}) => {
  const {
    pan,
    panBy,
    zoom,
    setZoom,
    isPanning,
    viewportWorldBounds,
    view,
    backgroundStyle,
    presentationIndex,
    fitAll,
    fitSelection,
    navigateToItem,
    centerOnWorldPoint,
    addBookmark,
    navigateBookmark,
    removeBookmark,
    addGuide,
    removeGuide,
    setBackgroundStyle,
    setGridSize,
    setShowRulers,
    setSnapToGrid,
    setSnapToGuides,
    useAllFramesAsPresentationPath,
    removeFrameFromPresentationPath,
    moveFrameInPresentationPath,
    presentStep,
    activeTool,
    setActiveTool,
    selectedStickyColor,
    setSelectedStickyColor,
    selectedItemId,
    setSelectedItemId,
    editingItemId,
    setEditingItemId,
    connectorStartId,
    setConnectorStartId,
    toastMessage,
    showToast,
    showSlideExportModal,
    setShowSlideExportModal,
    containerRef,
    imageInputRef,
    mediaInputRef,
    items,
    updateItems,
    customTemplates,
    updateCustomTemplates,
    facilitation,
    updateFacilitation,
    updateItemsAndFacilitation,
    collaboration,
    ink,
    manipulation,
    documentHistory,
    handleExportToPresent,
    importImageFile,
    importMediaFile,
    insertRichObject,
    handleCanvasDrop,
    handleCanvasClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemMouseDown,
    handleChangeStickyColor,
    handleDeleteSelected,
    marquee,
  } = useWhiteboardState(document, onUpdateDocument, onCreateDerivedDocument);
  const { locale } = useWorkspaceLocale();

  /**
   * GAP-0042, Runde 316: DIE ANNAHME EINER ZUGESTELLTEN TABELLE.
   *
   * JEDE ABLEHNUNG WIRD GEZEIGT UND NICHT VERSCHLUCKT. `acceptWhiteboardTableDrop`
   * gibt fuer jeden Fehlschlag einen benannten Grund zurueck, und der geht in
   * die Meldung — dieselbe Ansage, die schon `Dock slot taken` benutzt
   * (`:173`). Ein stiller Fehlschlag waere die Umkehrung des Fehlers, den dieser
   * Eintrag beschreibt: vorher eine Meldung ohne Handlung, jetzt eine Handlung
   * ohne Meldung. Beides ist falsch.
   *
   * UND DER MODUS STEHT IN DER ERFOLGSMELDUNG: `COPY` wird zu `Frozen`, und
   * wer eine Kopie ablegt, soll lesen koennen, dass es eine ist.
   */
  const handleWorkspaceDropDelivered = useCallback(
    (resolution: WhiteboardDropResolution) => {
      const step = acceptWhiteboardTableDrop(
        { delivered: true, resolution },
        document.id,
        workspaceDocuments,
        items,
        whiteboardFreeDropPosition(items),
      );
      if (!step.ok) {
        showToast(`${resolution.adapterId}: ${step.reason}`);
        return;
      }
      updateItems([...items, step.item]);
      showToast(`${resolution.adapterId}: ${step.mode} · ${step.item.liveObject?.sourceTitle ?? ''}`.trim());
    },
    [document.id, items, showToast, updateItems, workspaceDocuments],
  );
  // Paket 11: die Ablagezone. Sie führt **keine** zweite Zieh-Session und **keine** zweite Erlaubnisliste:
  // sie liest die vorhandene Zieh-Session (Paket 5), fragt die versiegelte Matrix (Paket 4) und stellt über den
  // vorhandenen Resolver zu. Die Zielkennung ist **diese** Fläche — sie wird nicht geraten.
  const workspaceDropZone = useWhiteboardDropZone({
    targetDocument: document,
    documents: workspaceDocuments,
    // GAP-0042, Runde 316: DER VERBRAUCHER, DER GEFEHLT HAT.
    //
    // GEMESSEN in den Runden 263/264: diese Flaeche hatte 23 Lesezugriffe auf
    // die Zustellung und 0 Schreibstellen — die Zone meldete eine Platzierung,
    // ohne zu platzieren. Hier ist die eine Schreibstelle.
    //
    // WARUM DER RUECKRUF HIER STEHT UND NICHT IM HOOK: der Hook kennt die
    // Aufloesung, aber weder `items` noch eine Position. Beides ist hier
    // bekannt, und `updateItems` ist der EINE Weg, auf dem diese Flaeche ihren
    // Bestand aendert.
    onDelivered: handleWorkspaceDropDelivered,
  });

  const [showInteropModal, setShowInteropModal] = useState(false);
  const [showDrawModal, setShowDrawModal] = useState(false);
  // Ergänzung 7 §4: die neun Panel-Booleans waren frei und unabhängig — mehrere Panels lagen auf
  // demselben Anker, und die Objektliste deckte die Sichtsteuerung samt deren Schaltern zu. Der Zustand
  // ist jetzt **ein** Set, und `toggleWhiteboardDockPanel` / `openWhiteboardDockPanel` schliessen je
  // Dock-Bereich aus (reine Funktion, erschöpfend geprüft in
  // `testing/dock/whiteboardPanelDock.test.ts`). Die neun Namen bleiben, weil die Panels und die
  // bestehenden Verträge sie nennen — sie sind jetzt aus dem Set **abgeleitet**, nicht mehr eigenständig.
  const [openDockPanels, setOpenDockPanels] = useState<ReadonlySet<WhiteboardDockPanelId>>(
    () => new Set<WhiteboardDockPanelId>(),
  );
  const dockFlags = useMemo(() => whiteboardDockFlags(openDockPanels), [openDockPanels]);
  const {
    'object-palette': showObjectPalette,
    templates: showTemplatePanel,
    organization: showOrganizationPanel,
    navigator: showNavigator,
    diagram: showDiagramPanel,
    facilitation: showFacilitationPanel,
    'live-objects': showLiveObjectsPanel,
    collaboration: showCollaborationPanel,
    'object-list': showObjectList,
  } = dockFlags;
  const closeDockPanel = useCallback(
    (id: WhiteboardDockPanelId) => { setOpenDockPanels((current) => closeWhiteboardDockPanel(current, id)); },
    [],
  );
  const toggleDockPanel = useCallback(
    (id: WhiteboardDockPanelId) => { setOpenDockPanels((current) => toggleWhiteboardDockPanel(current, id)); },
    [],
  );
  // Ein Panel, das einen Bereich belegt, verdrängt die anderen Panels **dieses** Bereichs. Das geschieht
  // angesagt, nicht still: der Nutzer sieht, welches Panel dafür geschlossen wurde.
  const openDockPanel = useCallback((id: WhiteboardDockPanelId) => {
    setOpenDockPanels((current) => {
      const displaced = whiteboardDisplacedPanels(current, id);
      const next = openWhiteboardDockPanel(current, id);
      if (next !== current && displaced.length > 0) showToast(`Dock slot taken — closed: ${displaced.join(', ')}.`);
      return next;
    });
  }, [showToast]);
  const [dropPreview, setDropPreview] = useState<{ x: number; y: number } | null>(null);
  const dropDepthRef = useRef(0);
  const [organizationFilterIds, setOrganizationFilterIds] = useState<Set<string> | null>(null);
  const visibleItems = useMemo(() => items.filter((item) => !item.hidden && (!organizationFilterIds || organizationFilterIds.has(item.id))), [items, organizationFilterIds]);
  const spatialIndex = useMemo(() => {
    const index = new WhiteboardSpatialIndex(512);
    index.rebuild(visibleItems);
    return index;
  }, [visibleItems]);
  const renderItems = useMemo(() => expandRenderSetForConnectors(spatialIndex.queryViewport(viewportWorldBounds), visibleItems), [spatialIndex, viewportWorldBounds, visibleItems]);
  const renderProjection = useMemo(() => buildWhiteboardRenderProjection(renderItems), [renderItems]);
  const frames = useMemo(() => items.filter((item) => item.type === 'frame'), [items]);
  const hiddenCount = useMemo(() => items.filter((item) => item.hidden).length, [items]);
  // The typography toolbar follows the current selection and only appears for objects that paint text.
  const textSelection = useMemo(() => {
    const selection = manipulation.selection.length > 0
      ? manipulation.selection
      : selectedItemId ? items.filter((item) => item.id === selectedItemId) : [];
    return selection.filter(whiteboardItemSupportsTextStyle);
  }, [items, manipulation.selection, selectedItemId]);
  const participantCursors = useMemo(() => {
    const byId = new Map(facilitation.participants.map((participant) => [participant.id, participant]));
    for (const participant of collaboration.participants) byId.set(participant.id, participant);
    return [...byId.values()].slice(0, 256);
  }, [collaboration.participants, facilitation.participants]);
  const liveGridReferences = document.root_object_ids
    .map((id) => document.objects[id])
    .filter((object) => Boolean(tableFromWorkspaceReference(object)))
    .slice(0, 6);

  useEffect(() => {
    const target = facilitation.presenterViewport;
    if (!target || (!facilitation.followPresenter && facilitation.bringEveryoneSequence === 0)) return;
    setZoom(target.zoom);
    centerOnWorldPoint(target.x, target.y);
  }, [centerOnWorldPoint, facilitation.bringEveryoneSequence, facilitation.followPresenter, facilitation.presenterViewport, setZoom]);

  // Keyboard is a first-class input path: every essential canvas function is reachable without a
  // pointer. Resolution lives in the pure `whiteboardKeyboardEngine`; this effect only wires the result.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const editingText = Boolean(target && (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]')));
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !editingText) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) documentHistory.redo(); else documentHistory.undo();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          documentHistory.redo();
          return;
        }
      }
      const command = resolveWhiteboardKeyboardCommand(
        { key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey },
        {
          step: view.snapToGrid ? view.gridSize : 1,
          editingText,
          hasSelection: manipulation.selectedItemIds.length > 0,
        },
      );
      if (!command) return;
      if (command.kind === 'delete') {
        const hasInkSelection = activeTool.startsWith('ink-') && ink.selectedInkIds.length > 0;
        if (!hasInkSelection && !selectedItemId && manipulation.selectedItemIds.length === 0) return;
        e.preventDefault();
        if (hasInkSelection) ink.deleteInkSelection();
        else handleDeleteSelected();
        return;
      }
      if (command.kind === 'cancel') {
        e.preventDefault();
        setEditingItemId(null);
        setConnectorStartId(null);
        manipulation.clearSnapGuides();
        manipulation.clearSelection();
        return;
      }
      if (command.kind === 'edit-text') {
        if (!selectedItemId) return;
        e.preventDefault();
        setEditingItemId(selectedItemId);
        return;
      }
      if (command.kind === 'select-next' || command.kind === 'select-previous') {
        e.preventDefault();
        manipulation.stepSelection(command.kind === 'select-next' ? 1 : -1);
        return;
      }
      if (command.kind === 'select-all') {
        e.preventDefault();
        manipulation.selectAll();
        return;
      }
      if (command.kind === 'move') {
        e.preventDefault();
        manipulation.moveSelectionBy(command.dx, command.dy);
        return;
      }
      if (command.kind === 'group' || command.kind === 'ungroup') {
        e.preventDefault();
        if (command.kind === 'group') manipulation.group(); else manipulation.ungroup();
        return;
      }
      if (command.kind === 'z-order') {
        e.preventDefault();
        manipulation.layer(command.direction);
        return;
      }
      if (command.kind === 'add-child-node') {
        e.preventDefault();
        const created = manipulation.addMindMapChild();
        if (created) setEditingItemId(created);
        return;
      }
      if (command.kind === 'pan') {
        e.preventDefault();
        panBy(command.dx, command.dy);
        return;
      }
      if (command.kind === 'zoom') {
        e.preventDefault();
        setZoom((previous) => previous * command.factor);
        return;
      }
      if (command.kind === 'fit-all') {
        e.preventDefault();
        fitAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, documentHistory, fitAll, handleDeleteSelected, ink, manipulation, panBy, selectedItemId, setConnectorStartId, setEditingItemId, setZoom, view.gridSize, view.snapToGrid]);

  // GAP-0054, Runde 290: die Zusammenfassung zaehlte
  // `selectedItemIds.length + (selectedItemId ? 1 : 0)`. Das ADDITION zweier
  // Quellen, die dasselbe Objekt meinen koennen — ein einzelner Konnektor
  // wurde damit als „2 objects are selected" angesagt. Die Vereinigung zaehlt
  // jedes Objekt genau einmal.
  const selectedObjectCount = new Set([
    ...manipulation.selectedItemIds,
    ...(selectedItemId ? [selectedItemId] : []),
  ]).size;

  return (
    <div data-vgt-whiteboard-root="true" role="region" aria-label="Astraea Whiteboard workspace" className="whiteboard-canvas-surface relative flex-1 flex flex-col h-full w-full bg-[#0a0d14] select-none overflow-hidden">
      <p id="whiteboard-canvas-help" className="sr-only">{WHITEBOARD_KEYBOARD_HELP}</p>
      <p id="whiteboard-canvas-summary" className="sr-only">Whiteboard contains {visibleItems.length} visible objects, {hiddenCount} hidden objects, {frames.length} frames and {participantCursors.length} participant cursors. Current zoom is {Math.round(zoom * 100)} percent. {selectedObjectCount} objects are selected.</p>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml,.svg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importImageFile(file);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={mediaInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importMediaFile(file);
          event.currentTarget.value = '';
        }}
      />
      <div className="whiteboard-toolbar-region" data-vgt-whiteboard-toolbar-region="true">
      <WhiteboardToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        selectedStickyColor={selectedStickyColor}
        setSelectedStickyColor={setSelectedStickyColor}
        selectedItemId={selectedItemId}
        onDeleteSelected={() => activeTool.startsWith('ink-') && ink.selectedInkIds.length > 0 ? ink.deleteInkSelection() : handleDeleteSelected()}
        onExportPNG={() => { void exportWhiteboardToPNG(document.title, items).catch((error: unknown) => showToast(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`)); }}
        onRequestImage={() => imageInputRef.current?.click()}
        onOpenObjectPalette={() => toggleDockPanel('object-palette')}
        onExportToSlide={() => setShowSlideExportModal(true)}
        onOpenInteropModal={() => setShowInteropModal(true)}
        onOpenDrawModal={() => setShowDrawModal(true)}
        canUndo={documentHistory.canUndo}
        canRedo={documentHistory.canRedo}
        onUndo={documentHistory.undo}
        onRedo={documentHistory.redo}
        setConnectorStartId={setConnectorStartId}
        showToast={showToast}
      />


      {activeTool === 'select' && <WhiteboardManipulationToolbar
        selection={manipulation.selection}
        frames={frames}
        styleClipboardReady={Boolean(manipulation.styleClipboard)}
        snapToGrid={view.snapToGrid}
        snapToGuides={view.snapToGuides}
        onSnapToGrid={setSnapToGrid}
        onSnapToGuides={setSnapToGuides}
        rotate={manipulation.rotate}
        resize={manipulation.resize}
        group={manipulation.group}
        ungroup={manipulation.ungroup}
        setLocked={manipulation.setLocked}
        hide={manipulation.hide}
        showAll={manipulation.showAll}
        align={manipulation.align}
        distribute={manipulation.distribute}
        layer={manipulation.layer}
        duplicate={manipulation.duplicate}
        copyStyle={manipulation.copyStyle}
        pasteStyle={manipulation.pasteStyle}
        setLink={manipulation.setLink}
        setConstraints={manipulation.setConstraints}
        setConnectorAnchors={manipulation.setConnectorAnchors}
        hiddenCount={hiddenCount}
      />}

      {activeTool.startsWith('ink-') && <WhiteboardInkToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        color={ink.color}
        setColor={ink.setColor}
        width={ink.width}
        setWidth={ink.setWidth}
        straightLineAssist={ink.straightLineAssist}
        setStraightLineAssist={ink.setStraightLineAssist}
        shapeRecognition={ink.shapeRecognition}
        setShapeRecognition={ink.setShapeRecognition}
        arrowStart={ink.arrowStart}
        setArrowStart={ink.setArrowStart}
        arrowEnd={ink.arrowEnd}
        setArrowEnd={ink.setArrowEnd}
        eraserMode={ink.eraserMode}
        setEraserMode={ink.setEraserMode}
        eraserRadius={ink.eraserRadius}
        setEraserRadius={ink.setEraserRadius}
        selectedInkCount={ink.selectedInkIds.length}
        canUndo={documentHistory.canUndo}
        canRedo={documentHistory.canRedo}
        undo={documentHistory.undo}
        redo={documentHistory.redo}
        deleteSelection={ink.deleteInkSelection}
        moveSelection={ink.moveInkSelection}
      />}

      {textSelection.length > 0 && <WhiteboardTextToolbar
        selection={textSelection}
        onSetTextStyle={manipulation.setTextStyle}
      />}
      </div>

      <div className="whiteboard-canvas-region relative min-h-0 flex-1" data-vgt-whiteboard-canvas-region="true">
      {/* Main Canvas Infinite Space */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onPointerDown={(event) => {
          // Die Eingabeart wird **nicht** neu erfunden: `normalizePointerType` ist die eine Übersetzung.
          workspaceDropZone.notePointerType(event.pointerType);
          ink.handlePointerDown(event);
        }}
        onPointerMove={ink.handlePointerMove}
        onPointerUp={ink.handlePointerEnd}
        onPointerCancel={ink.handlePointerCancel}
        onKeyDown={workspaceDropZone.onKeyDown}
        onDragEnter={(e) => {
          // Zwei Empfänger, zwei MIME-Arten, **keine** Überschneidung: der Workspace-Träger gehört Paket 11,
          // die Bilddatei der Seite. Beide prüfen ihre eigene Art und rühren die andere nicht an.
          workspaceDropZone.onDragEnter(e);
          if (!isWhiteboardFileDrag([...e.dataTransfer.types])) return;
          e.preventDefault();
          dropDepthRef.current += 1;
          const rect = e.currentTarget.getBoundingClientRect();
          setDropPreview({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onDragOver={(e) => {
          // `preventDefault` muss auch für den Workspace-Träger fallen, sonst gibt es **kein** `drop`.
          workspaceDropZone.onDragOver(e);
          if (!isWhiteboardFileDrag([...e.dataTransfer.types])) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          setDropPreview({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onDragLeave={(event) => {
          workspaceDropZone.onDragLeave(event);
          dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
          if (dropDepthRef.current === 0) setDropPreview(null);
        }}
        onDrop={(event) => {
          dropDepthRef.current = 0;
          setDropPreview(null);
          // Genau **ein** Empfänger pro Ablage: ein Workspace-Objekt geht durch die Matrix, eine Datei durch die
          // lokale Importprüfung. Eine Datei darf **nicht** zusätzlich als Workspace-Träger gedeutet werden.
          if (isWhiteboardWorkspaceDrag(event.dataTransfer)) {
            workspaceDropZone.onDrop(event);
            return;
          }
          handleCanvasDrop(event);
        }}
        role="application"
        aria-label="Infinite Whiteboard canvas"
        aria-describedby="whiteboard-canvas-help whiteboard-canvas-summary"
        tabIndex={0}
        className={`absolute inset-0 w-full h-full overflow-hidden touch-none ${
          isPanning || activeTool === 'pan'
            ? 'cursor-grab active:cursor-grabbing'
            : activeTool === 'select'
            ? 'cursor-default'
            : 'cursor-crosshair'
        }`}
        style={backgroundStyle as React.CSSProperties}
      >
        <div
          className="absolute origin-top-left transition-transform duration-100 ease-out pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: 1,
            height: 1,
          }}
        >
          <div className="pointer-events-auto relative w-full h-full">
            <WhiteboardInkRenderer items={renderProjection.items} selectedItemId={selectedItemId} selectedInkIds={[...new Set([...ink.selectedInkIds, ...manipulation.selectedItemIds])]} handleItemMouseDown={handleItemMouseDown} />
            <WhiteboardInkDraftOverlay draft={ink.draft} gesturePoints={ink.gesturePoints} activeTool={activeTool} eraserRadius={ink.eraserRadius} />
            <WhiteboardParticipantCursors participants={participantCursors} hideNames={facilitation.hideParticipantNames} />
            <WhiteboardDiagramObjectsRenderer items={renderProjection.items} selectedItemId={selectedItemId} selectedItemIds={manipulation.selectedItemIds} handleItemMouseDown={handleItemMouseDown} />
            <WhiteboardLiveObjectsRenderer items={renderProjection.items} documents={workspaceDocuments} selectedItemId={selectedItemId} selectedItemIds={manipulation.selectedItemIds} handleItemMouseDown={handleItemMouseDown} onOpenWorkspaceDocument={onOpenWorkspaceDocument} />
            <WhiteboardRichObjectsRenderer items={renderProjection.items} selectedItemId={selectedItemId} selectedItemIds={manipulation.selectedItemIds} handleItemMouseDown={handleItemMouseDown} updateItems={updateItems} />
            <WhiteboardItemsRenderer
              items={renderProjection.items}
              selectedItemId={selectedItemId}
              selectedItemIds={manipulation.selectedItemIds}
              setSelectedItemId={setSelectedItemId}
              editingItemId={editingItemId}
              setEditingItemId={setEditingItemId}
              connectorStartId={connectorStartId}
              handleItemMouseDown={handleItemMouseDown}
              updateItems={updateItems}
              handleChangeStickyColor={handleChangeStickyColor}
              zoom={zoom}
              onSelectConnector={manipulation.selectItem}
              connectorPaths={renderProjection.connectorPaths}
            />
          </div>
        </div>

        {view.showRulers && <WhiteboardRulers pan={pan} zoom={zoom} viewportBounds={viewportWorldBounds} guides={view.guides} onRemoveGuide={removeGuide} />}

        {/* Empty board: the surface is infinite and blank until the first object is drawn. */}
        {items.length === 0 && (
          <div
            aria-hidden="true"
            data-vgt-whiteboard-empty-state="true"
            className="whiteboard-empty-state pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 px-4 text-center"
          >
            <p className="whiteboard-empty-state__title text-sm font-semibold tracking-wide">{whiteboardObjectsText('emptyBoardTitle', locale)}</p>
            <p className="whiteboard-empty-state__hint mt-1 text-[0.6875rem] leading-relaxed">{whiteboardObjectsText('emptyBoardHint', locale)}</p>
          </div>
        )}
        <WhiteboardMiniMap
          items={visibleItems}
          viewportBounds={viewportWorldBounds}
          onNavigate={(x, y) => centerOnWorldPoint(x, y)}
          bookmarks={view.bookmarks}
          onSaveBookmark={() => { if (addBookmark()) openDockPanel('navigator'); }}
          onNavigateBookmark={navigateBookmark}
          onRemoveBookmark={removeBookmark}
        />

        {/* Marquee band: world coordinates projected into screen space. */}
        {marquee && (marquee.width > 0 || marquee.height > 0) && (
          <div
            aria-hidden="true"
            data-vgt-whiteboard-marquee="true"
            className="whiteboard-marquee pointer-events-none absolute z-20"
            style={{
              left: pan.x + marquee.x * zoom,
              top: pan.y + marquee.y * zoom,
              width: Math.max(1, marquee.width * zoom),
              height: Math.max(1, marquee.height * zoom),
            }}
          />
        )}

        {/* Smart alignment guides with the equal-spacing distance read-out. */}
        {manipulation.snapGuides.map((guide) => guide.axis === 'x' ? (
          <div
            key={guide.id}
            aria-hidden="true"
            data-vgt-whiteboard-guide={guide.kind}
            className="whiteboard-snap-guide pointer-events-none absolute z-20"
            style={{ left: pan.x + guide.position * zoom, top: pan.y + guide.from * zoom, width: 1, height: Math.max(1, (guide.to - guide.from) * zoom) }}
          />
        ) : (
          <div
            key={guide.id}
            aria-hidden="true"
            data-vgt-whiteboard-guide={guide.kind}
            className="whiteboard-snap-guide pointer-events-none absolute z-20"
            style={{ top: pan.y + guide.position * zoom, left: pan.x + guide.from * zoom, height: 1, width: Math.max(1, (guide.to - guide.from) * zoom) }}
          >
            {guide.gap !== undefined && (
              <span className="whiteboard-snap-guide__gap absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap px-1 text-[0.5625rem] font-mono">{Math.round(guide.gap)}</span>
            )}
          </div>
        ))}

        {/* Drop target preview: the drop point is shown before anything is inserted. */}
        {dropPreview && (
          <div
            aria-hidden="true"
            data-vgt-whiteboard-drop-target="true"
            className="whiteboard-drop-target pointer-events-none absolute z-30 flex items-center justify-center"
            style={{
              left: dropPreview.x - 120,
              top: dropPreview.y - 80,
              width: 240,
              height: 160,
            }}
          >
            <span className="whiteboard-drop-target__label px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider">
              {whiteboardObjectsText('dropTarget', locale)}
            </span>
          </div>
        )}

        {showObjectList && <WhiteboardObjectList
          items={visibleItems}
          selectedIds={manipulation.selectedItemIds}
          onSelect={(id) => { setSelectedItemId(id); manipulation.selectItem(id); }}
          onNavigate={navigateToItem}
          onClose={() => closeDockPanel('object-list')}
        />}

        {showNavigator && <WhiteboardNavigatorPanel
          frames={frames}
          bookmarks={view.bookmarks}
          presentationPath={view.presentationPath}
          presentationIndex={presentationIndex}
          onNavigateFrame={navigateToItem}
          onNavigateBookmark={navigateBookmark}
          onRemoveBookmark={removeBookmark}
          onUseAllFrames={useAllFramesAsPresentationPath}
          onMovePathFrame={moveFrameInPresentationPath}
          onRemovePathFrame={removeFrameFromPresentationPath}
          onPresentStep={presentStep}
          onClose={() => closeDockPanel('navigator')}
        />}

        {liveGridReferences.length > 0 && (
          <div className="absolute top-4 right-4 z-30 flex flex-col gap-2 max-w-[340px] pointer-events-auto">
            {liveGridReferences.map((object, index) => <GridLiveReferenceCard key={object.type === 'WorkspaceReference' ? object.data.id : index} object={object} compact />)}
          </div>
        )}

        {/* Viewport controls */}
        <div role="group" aria-label="Whiteboard viewport controls" className="whiteboard-viewport-controls absolute bottom-6 right-6 z-30 flex max-w-[min(70vw,760px)] flex-wrap items-center justify-end gap-1.5 rounded-xl p-1 text-xs">
          <button type="button" onClick={() => setZoom((prev) => prev / 1.15)} className="whiteboard-viewport-controls__button" title="Zoom out" aria-label="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button>
          <span className="whiteboard-viewport-controls__zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((prev) => prev * 1.15)} className="whiteboard-viewport-controls__button" title="Zoom in" aria-label="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button>
          <div aria-hidden="true" className="whiteboard-viewport-controls__divider" />
          <button type="button" onClick={fitAll} data-vgt-app-guide-anchor="Whiteboard:second" className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label" title="Fit all objects">Fit all</button>
          <button type="button" onClick={fitSelection} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label" title="Fit selected object">Fit selection</button>
          <button type="button" onClick={() => setZoom(1)} className="whiteboard-viewport-controls__button" title="Reset zoom to 100%" aria-label="Reset zoom to 100 percent"><Maximize2 className="w-3.5 h-3.5" /></button>
          <div aria-hidden="true" className="whiteboard-viewport-controls__divider" />
          <select aria-label="Canvas background" value={view.backgroundStyle} onChange={(event) => setBackgroundStyle(event.target.value as 'dots' | 'grid' | 'plain')} className="whiteboard-viewport-controls__field">
            <option value="dots">Dots</option><option value="grid">Grid</option><option value="plain">Plain</option>
          </select>
          <input aria-label="Grid spacing" type="number" min={8} max={256} value={view.gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="whiteboard-viewport-controls__field whiteboard-viewport-controls__field--number" title="Grid spacing" />
          <button type="button" aria-pressed={view.showRulers} onClick={() => setShowRulers(!view.showRulers)} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Rulers</button>
          <button type="button" onClick={() => addGuide('x')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label" title="Add vertical guide at viewport center">+ V guide</button>
          <button type="button" onClick={() => addGuide('y')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label" title="Add horizontal guide at viewport center">+ H guide</button>
          <div aria-hidden="true" className="whiteboard-viewport-controls__divider" />
          <button type="button" onClick={() => { if (addBookmark()) openDockPanel('navigator'); }} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Save location</button>
          <button type="button" aria-pressed={showNavigator} onClick={() => toggleDockPanel('navigator')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Navigate</button>
          <button type="button" aria-pressed={showDiagramPanel} onClick={() => toggleDockPanel('diagram')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Diagram</button>
          <button type="button" aria-pressed={showTemplatePanel} onClick={() => toggleDockPanel('templates')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Templates</button>
          <button type="button" aria-pressed={showFacilitationPanel} onClick={() => toggleDockPanel('facilitation')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Facilitate</button>
          <button type="button" aria-pressed={showOrganizationPanel} onClick={() => toggleDockPanel('organization')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Search</button>
          <button type="button" aria-pressed={showObjectList} onClick={() => toggleDockPanel('object-list')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label" title={whiteboardObjectsText('objectList', locale)}><ListTree className="w-3.5 h-3.5" aria-hidden="true" />{whiteboardObjectsText('toggleObjectList', locale)}</button>
          <button type="button" aria-pressed={showLiveObjectsPanel} onClick={() => toggleDockPanel('live-objects')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Live objects</button>
          <button type="button" aria-pressed={showCollaborationPanel} onClick={() => toggleDockPanel('collaboration')} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Collaborate{collaboration.participants.length ? ` · ${collaboration.participants.length}` : ''}</button>
          <button type="button" onClick={() => { if (view.presentationPath.length === 0) useAllFramesAsPresentationPath(); presentStep(1); openDockPanel('navigator'); }} className="whiteboard-viewport-controls__button whiteboard-viewport-controls__button--label">Present frames</button>
          <button type="button" onClick={() => { void exportWhiteboardToPNG(document.title, items).catch((error: unknown) => showToast(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`)); }} className="whiteboard-viewport-controls__button" title="Export canvas to high-res PNG" aria-label="Export canvas to high resolution PNG"><Layers className="w-3.5 h-3.5" /></button>
        </div>

        {/* Floating Notification Toast */}
        {toastMessage && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-blue-500/40 text-blue-200 px-4 py-2 rounded-xl shadow-2xl text-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-150 z-30">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        )}

        {showObjectPalette && <WhiteboardObjectPalette
        onClose={() => closeDockPanel('object-palette')}
        onInsert={(type) => { if (insertRichObject(type)) closeDockPanel('object-palette'); }}
        onRequestImage={() => { imageInputRef.current?.click(); closeDockPanel('object-palette'); }}
        onRequestMedia={() => { mediaInputRef.current?.click(); closeDockPanel('object-palette'); }}
      />}

      {showDiagramPanel && <WhiteboardDiagramPanel
        items={items}
        selectedIds={manipulation.selectedItemIds}
        origin={{ x: (viewportWorldBounds.minX + viewportWorldBounds.maxX) / 2 - 400, y: (viewportWorldBounds.minY + viewportWorldBounds.maxY) / 2 - 160 }}
        updateItems={updateItems}
        onAddChildNode={() => { const created = manipulation.addMindMapChild(); if (created) setEditingItemId(created); }}
        onClose={() => closeDockPanel('diagram')}
        showToast={showToast}
      />}

      {showTemplatePanel && <WhiteboardTemplatePanel
        items={items}
        selectedIds={manipulation.selectedItemIds}
        customTemplates={customTemplates}
        origin={{ x: (viewportWorldBounds.minX + viewportWorldBounds.maxX) / 2 - 420, y: (viewportWorldBounds.minY + viewportWorldBounds.maxY) / 2 - 180 }}
        updateItems={updateItems}
        updateCustomTemplates={updateCustomTemplates}
        showToast={showToast}
        onClose={() => closeDockPanel('templates')}
      />}

      {showCollaborationPanel && <WhiteboardCollaborationPanel controller={collaboration} selectedItemId={selectedItemId} onClose={() => closeDockPanel('collaboration')} />}
      {showOrganizationPanel && <WhiteboardOrganizationPanel items={items} authors={collaboration.state.objectAuthors} bookmarks={view.bookmarks} selectedItemId={selectedItemId} updateItems={updateItems} onNavigateItem={navigateToItem} onNavigateBookmark={navigateBookmark} onFilteredIdsChange={setOrganizationFilterIds} onClose={() => { closeDockPanel('organization'); setOrganizationFilterIds(null); }} />}
      {showLiveObjectsPanel && <WhiteboardLiveObjectsPanel currentDocumentId={document.id} documents={workspaceDocuments} items={items} selectedItemId={selectedItemId} origin={{ x:(viewportWorldBounds.minX+viewportWorldBounds.maxX)/2-180, y:(viewportWorldBounds.minY+viewportWorldBounds.maxY)/2-110 }} updateItems={updateItems} onOpenWorkspaceDocument={onOpenWorkspaceDocument} showToast={showToast} onClose={() => closeDockPanel('live-objects')} />}

      {showFacilitationPanel && <WhiteboardFacilitationPanel
        items={items}
        selectedIds={manipulation.selectedItemIds}
        state={facilitation}
        presenterViewport={{ x: (viewportWorldBounds.minX + viewportWorldBounds.maxX) / 2, y: (viewportWorldBounds.minY + viewportWorldBounds.maxY) / 2, zoom }}
        voterId={collaboration.sessionId}
        voterName={collaboration.state.localDisplayName}
        updateState={updateFacilitation}
        updateItemsAndState={updateItemsAndFacilitation}
        addReaction={() => {
          const target = manipulation.selection.find(item => item.type !== 'connector');
          const x = target ? target.x + target.width + 18 : (viewportWorldBounds.minX + viewportWorldBounds.maxX) / 2;
          const y = target ? target.y : (viewportWorldBounds.minY + viewportWorldBounds.maxY) / 2;
          updateItems(previous => [...previous, { id: `reaction-${Date.now()}`, type: 'reaction', x, y, width: 140, height: 88, text: 'Agree', reaction: { emoji: '👍', label: 'Agree', count: 1 }, zIndex: 100 }]);
        }}
        showToast={showToast}
        onClose={() => closeDockPanel('facilitation')}
      />}

      </div>

      </div>

      {/*
        Paket 11: Die Ablagezone liegt **außerhalb** der Leinwandfläche — als Geschwister, nicht als Kind.
        Der UI/UX-Standard verbietet wesentliche Funktion, die **nur** in einer Leinwand lebt (§8.6, §21.3, §32):
        eine Zone, die nur aus Pixeln besteht, ist für einen Screenreader nicht vorhanden. Hier ist sie echtes DOM
        mit einer **dauerhaft** vorhandenen Ansageregion, und ihre Knöpfe sind ohne Zeiger und ohne Canvas bedienbar.
      */}
      <WhiteboardDropZoneOverlay
        state={workspaceDropZone.state}
        inputKind={workspaceDropZone.inputKind}
        onConfirm={workspaceDropZone.confirm}
        onChooseIntent={workspaceDropZone.chooseIntent}
        onDismiss={workspaceDropZone.dismiss}
        onKeyDown={workspaceDropZone.onKeyDown}
      />

      <SlideExportModal
        isOpen={showSlideExportModal}
        items={items}
        documentTitle={document.title}
        onClose={() => setShowSlideExportModal(false)}
        onConfirm={handleExportToPresent}
      />

      <WhiteboardInteropModal
        isOpen={showInteropModal}
        onClose={() => setShowInteropModal(false)}
        workspaceDocument={document}
        documentTitle={document.title}
        items={items}
        onUpdateItems={updateItems}
        onImportDocument={onUpdateDocument}
        onExportToPresent={handleExportToPresent}
        showToast={showToast}
      />

      <DrawAdvancedModal
        isOpen={showDrawModal}
        onClose={() => setShowDrawModal(false)}
        documentTitle={document.title}
        items={items}
        onUpdateItems={updateItems}
        showToast={showToast}
      />
    </div>
  );
};
