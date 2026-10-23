// STATUS: DIAMANT VGT SUPREME — Astraea Publish Canvas Renderer
import React, { useRef, useState } from 'react';
import type { PublishDocumentModel, PublishFrame } from '../contracts/types';
import { presentPublishImage, checkPublishImageDrop, type PublishImageDropCheck, type PublishImagePresentation } from '../assets/publishAssetOps';
import { isPublishShapeFrame, publishShapeLabel, shapeOutlinePoints } from '../model/publishShapeOps';
import { splitPageLayers } from '../model/publishMasterFrames';
import { publishColumnDistribution, publishWrapObstacles, textWrapFreePercent } from '../model/publishTextFlowOps';
import { setFrameRect } from '../model/publishDocumentEngine';
import { setPublishFrameContent } from '../model/publishFrameOps';

export interface PublishCanvasPlaceImage {
  name: string;
  bytes: Uint8Array;
  declaredMime?: string;
  embed: boolean;
  canonicalUri?: string;
}

interface PublishCanvasProps {
  model: PublishDocumentModel;
  onUpdateModel: (updater: (prev: PublishDocumentModel) => PublishDocumentModel) => void;
  scale?: number;
  /** Nimmt die Bytes eines abgelegten Bildes auf. Fehlt der Rückruf, bleibt das Ablegen wirkungslos. */
  onPlaceImage?: (frameId: string, file: PublishCanvasPlaceImage) => void | Promise<void>;
  /** Meldet eine Ablehnung mit Grund an die Ansicht, damit sie sichtbar wird. */
  onRejectImage?: (check: PublishImageDropCheck) => void;
}

/** Der sichtbare Text einer Fehlermeldung beim Ablegen. Eine reine Zuordnung, damit sie pruefbar ist. */
export const PUBLISH_IMAGE_DROP_MESSAGES: Readonly<Record<PublishImageDropCheck['reason'], string>> = {
  ok: '',
  'frame-not-image': 'Only image or graphic frames accept a dropped image.',
  'frame-locked': 'The frame is locked. Unlock it before placing an image.',
  'type-not-accepted': 'Unsupported image format. Accepted: PNG, JPEG, WebP, GIF, AVIF, SVG.',
  'file-empty': 'The dropped file is empty.',
  'file-too-large': 'The image is larger than the 32 MB embedding limit.',
};

export const PublishCanvas: React.FC<PublishCanvasProps> = ({
  model,
  onUpdateModel,
  scale = 1.0,
  onPlaceImage,
  onRejectImage,
}) => {
  const { activePageIndex, showGuides, showBleed } = model;
  const selectedFrameId = model.selectedFrameId;
  const activePage = model.pages[activePageIndex];
  const geometry = activePage?.geometry || model.geometry;

  /** Der aktuelle Ziehvorgang: Ausgangspunkt in mm und Rahmen. `null` heisst: es wird nicht gezogen. */
  const dragRef = useRef<{ frameId: string; startedAt: { xMm: number; yMm: number }; origin: { xMm: number; yMm: number }; moved: boolean } | null>(null);
  const [dragFrameId, setDragFrameId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Convert mm to screen px (1 mm ≈ 3.7795 px at 96 DPI)
  const MM_TO_PX = 3.78 * scale;
  const pageWidthPx = geometry.widthMm * MM_TO_PX;
  const pageHeightPx = geometry.heightMm * MM_TO_PX;
  const bleedPx = geometry.bleedMm * MM_TO_PX;

  const marginTopPx = geometry.marginsMm.top * MM_TO_PX;
  const marginRightPx = geometry.marginsMm.right * MM_TO_PX;
  const marginBottomPx = geometry.marginsMm.bottom * MM_TO_PX;
  const marginLeftPx = geometry.marginsMm.left * MM_TO_PX;

  const liveWidthPx = pageWidthPx - marginLeftPx - marginRightPx;
  const liveHeightPx = pageHeightPx - marginTopPx - marginBottomPx;

  // Calculate column widths in px
  const gutterPx = geometry.columnGutterMm * MM_TO_PX;
  const totalGutterPx = (geometry.columns - 1) * gutterPx;
  const colWidthPx = (geometry.columns - 1) > 0 ? (liveWidthPx - totalGutterPx) / geometry.columns : liveWidthPx;
  const baselinePx = Math.max(1, geometry.baselineGridMm * MM_TO_PX);

  /**
   * **Die eine Aufteilung** in Master- und Seitenebene (`model/publishMasterFrames.ts`).
   *
   * Gemessen vorher: `effectiveMasterFrameIds` existierte, aber **nichts** legte Master-Rahmen an und **nichts**
   * zeichnete sie. Jetzt kommen beide Ebenen aus `splitPageLayers` — *eine zweite Aufteilung hier würde einen
   * Master-Rahmen auf seiner Host-Seite doppelt zeichnen.*
   */
  const layers = activePage ? splitPageLayers(model, activePage.id) : { masterFrames: [], pageFrames: [] };
  const masterFrames = layers.masterFrames;
  const currentFrames = layers.pageFrames;
  const master = model.masterPages.find(candidate => candidate.id === activePage?.masterPageId);

  /**
   * **Der eine Rahmeninhalt** — von **beiden** Ebenen benutzt (`AST-1371`).
   *
   * Gemessen (eigener Fehler, Runde Publish-16): die erste Fassung dieser Master-Ebene rief einen eigenen,
   * kleineren Renderer auf. Damit hätte ein Master-Textrahmen anders ausgesehen als derselbe Textrahmen auf der
   * Seite — *zwei Renderer für dieselbe Sache sind zwei Wahrheiten, und der Nutzer sieht den Unterschied.*
   * Deshalb liegt der Inhalt **einmal** hier und wird von der Master- **und** der Seitenebene aufgerufen; nur
   * `isSelected` unterscheidet sie (ein Master-Rahmen ist nie ausgewählt: er gehört dem Master).
   */
  const renderFrameBody = (frame: PublishFrame, image: PublishImagePresentation, isSelected: boolean): React.ReactNode => {
    /**
     * **Der Umbruch und die Spalten des Rahmens** — einmal gerechnet, dann gezeichnet (`AST-1381/1382`).
     *
     * `publishWrapObstacles` und `publishColumnDistribution` sind die **einen** Auslegungen; Inspektor und
     * Ueberlaufmessung lesen dieselben Funktionen.
     */
    const obstacles = frame.type === 'text' ? publishWrapObstacles(model, frame) : [];
    const wrapObstacle = obstacles[0] ?? null;
    const wrapFreePercent = frame.type === 'text' && obstacles.length > 0 ? textWrapFreePercent(frame, obstacles) : null;
    let columnParts: string[] = [frame.content];
    if (frame.type === 'text') {
      try { columnParts = publishColumnDistribution(frame).parts; }
      catch { columnParts = [frame.content]; }
    }
    return (
    isSelected && frame.type === 'text' ? (
      /* Ein echtes Textfeld statt contentEditable: der Wert kommt aus dem Modell und geht unveraendert zurueck.
         `innerText` normalisierte Leerzeichen und Zeilenumbrueche. */
      <textarea
        value={frame.content}
        aria-label={`Text content of ${frame.name}`}
        data-publish-frame-textarea={frame.id}
        onChange={(event) => onUpdateModel(prev => setPublishFrameContent(prev, frame.id, event.target.value))}
        className="w-full h-full p-2 resize-none outline-none whitespace-pre-wrap bg-transparent"
        style={{
          fontFamily: frame.typography?.fontFamily || frame.fontFamily || 'sans-serif',
          fontSize: `${frame.typography?.fontSizePt ?? frame.fontSizePt ?? 10}pt`,
          lineHeight: frame.lineHeight || 1.4,
          columnCount: frame.text?.columns ?? frame.columns ?? 1,
          columnGap: `${frame.text?.columnGutterMm ?? geometry.columnGutterMm}mm`,
          letterSpacing: frame.typography?.tracking ? `${frame.typography.tracking / 1000}em` : undefined,
        }}
      />
    ) : frame.type === 'text' ? (
      /**
       * **Der Text laeuft um das Hindernis** (`AST-1381`).
       *
       * Gemessen vorher: `textWrap` wurde von **niemandem** gelesen — der Text lief unter dem Bild durch, und die
       * Ueberlaufschaetzung rechnete mit der **vollen** Rahmenflaeche. *Ein Feld ohne Leser ist keine
       * Faehigkeit; eine Schaetzung, die die freie Flaeche nicht kennt, ist zu optimistisch.*
       *
       * Die Geometrie kommt aus `publishWrapObstacles` — **eine** Auslegung des Umbruchs, und dieselbe, die
       * `detectOversetFramesWithWrap` misst. Der Ausweichraum wird als Innenabstand gesetzt; bei `contour` kommt
       * `shape-outside` mit der **echten** Punktfolge dazu, damit der Text der Kontur folgt und nicht dem Kasten.
       */
      <div
        className="w-full h-full p-2 whitespace-pre-wrap overflow-hidden"
        data-publish-text-wrap={frame.text?.textWrap?.mode ?? 'none'}
        data-publish-text-wrap-free={wrapFreePercent === null ? undefined : String(wrapFreePercent)}
        style={{
          fontFamily: frame.typography?.fontFamily || frame.fontFamily || 'sans-serif',
          fontSize: `${frame.typography?.fontSizePt ?? frame.fontSizePt ?? 10}pt`,
          lineHeight: frame.text?.alignToBaselineGrid ? `${geometry.baselineGridMm}mm` : (frame.lineHeight || 1.4),
          // **Die ausgeglichenen Spalten** (`AST-1382`) — dieselbe Verteilung, die der Inspektor anzeigt.
          columnCount: frame.text?.columns ?? frame.columns ?? 1,
          columnGap: `${frame.text?.columnGutterMm ?? geometry.columnGutterMm}mm`,
          letterSpacing: frame.typography?.tracking ? `${frame.typography.tracking / 1000}em` : undefined,
          // Die Zeilen bleiben zusammen, wenn der Nutzer es verlangt (`AST-1384`).
          breakInside: frame.typography?.keep?.keepLinesTogether ? 'avoid' : undefined,
          hyphens: frame.typography?.hyphenation ? 'auto' : undefined,
        }}
      >
        {wrapObstacle ? (
          <>
            <span
              aria-hidden="true"
              data-publish-wrap-spacer={wrapObstacle.frameId}
              style={{
                float: 'left',
                width: `${(wrapObstacle.box.width - frame.xMm) * MM_TO_PX}px`,
                height: `${(wrapObstacle.box.height - frame.yMm) * MM_TO_PX}px`,
                shapeOutside: wrapObstacle.outline.length >= 3
                  ? `polygon(${wrapObstacle.outline.map((point) => `${point.x - frame.xMm}mm ${point.y - frame.yMm}mm`).join(', ')})`
                  : undefined,
              }}
            />
            {columnParts.join('')}
          </>
        ) : columnParts.join('')}
      </div>
    ) : frame.type === 'table' && frame.tableId ? (
      <table data-publish-table={frame.tableId} className="w-full h-full border-collapse text-[0.5rem] text-slate-700">
        <tbody>
          {tableRows(model, frame).map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-300 p-0.5 align-top">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    ) : isPublishShapeFrame(frame) ? (
      /**
       * **Eine Form wird gezeichnet, nicht als Platzhalter angedeutet** (`AST-1406`).
       *
       * Gemessen vorher: ein Grafikrahmen bekam denselben gestrichelten „Image Frame"-Kasten wie ein fehlendes
       * Bild — *eine Form, die wie ein fehlendes Bild aussieht, sagt dem Nutzer das Falsche.* Die Punktfolge kommt
       * aus `shapeOutlinePoints` (normiert → mm), **dieselbe** Umrechnung, die der SVG-Export benutzt.
       */
      <svg data-publish-shape={publishShapeLabel(frame)} width="100%" height="100%"
        viewBox={`${frame.xMm} ${frame.yMm} ${Math.max(0.01, frame.widthMm)} ${Math.max(0.01, frame.heightMm)}`}
        preserveAspectRatio="none" aria-label={`${frame.name}: ${publishShapeLabel(frame)}`}>
        {shapeOutlinePoints(frame).length >= 3 ? (
          <polygon
            points={shapeOutlinePoints(frame).map(point => `${point.x},${point.y}`).join(' ')}
            fill={frame.fillColor && frame.fillColor !== 'transparent' ? frame.fillColor : 'none'}
            stroke={frame.strokeColor ?? '#334155'}
            strokeWidth={frame.strokeWidthPt ?? 0}
          />
        ) : (
          <rect
            x={frame.xMm} y={frame.yMm} width={frame.widthMm} height={frame.heightMm}
            fill={frame.fillColor && frame.fillColor !== 'transparent' ? frame.fillColor : 'none'}
            stroke={frame.strokeColor ?? '#334155'}
            strokeWidth={frame.strokeWidthPt ?? 0}
          />
        )}
      </svg>
    ) : image.state === 'embedded' || image.state === 'linked' ? (
      <img src={image.source} alt={image.altText} data-publish-image-state={image.state}
        className="w-full h-full" style={{ objectFit: frame.fitMode === 'fill' ? 'cover' : frame.fitMode === 'stretch' ? 'fill' : 'contain' }} />
    ) : (
      <div data-publish-image-state={image.state} className={`w-full h-full border-2 border-dashed flex flex-col items-center justify-center p-3 ${image.state === 'missing' ? 'border-rose-400 bg-rose-50 text-rose-500' : image.state === 'remote-blocked' ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-slate-300 bg-slate-50 text-slate-400'}`}>
        <span className="text-xs font-semibold uppercase tracking-wider">{image.state === 'placeholder' ? 'Drop image here' : image.state}</span>
        <span className="text-[0.625rem] mt-1">{image.label} · {frame.widthMm}mm × {frame.heightMm}mm</span>
        {image.altText === '' && <span className="text-[0.625rem] mt-1 uppercase">no alt text</span>}
      </div>
    )
    );
  };

  const handleFrameSelect = (id: string) => onUpdateModel(prev => ({ ...prev, selectedFrameId: id }));

  /**
   * Ziehen mit der Maus.
   *
   * Vorher war ein Rahmen nur klickbar: es gab keine Bewegung. Die Umrechnung Pixel → mm ist die einzige
   * Stelle, die den Zoom beruecksichtigt; sie liegt hier, weil nur der Canvas die Bildschirmmasse kennt.
   * Gerastert wird im Dokumentmodell (`setFrameRect`), nicht hier — es gibt nur einen Fang-Regelsatz.
   */
  const handlePointerDown = (frame: PublishFrame, event: React.PointerEvent<HTMLDivElement>) => {
    if (frame.locked) { handleFrameSelect(frame.id); return; }
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    dragRef.current = { frameId: frame.id, startedAt: { xMm: event.clientX / MM_TO_PX, yMm: event.clientY / MM_TO_PX }, origin: { xMm: frame.xMm, yMm: frame.yMm }, moved: false };
    setDragFrameId(frame.id);
    handleFrameSelect(frame.id);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nowX = event.clientX / MM_TO_PX;
    const nowY = event.clientY / MM_TO_PX;
    const dx = nowX - drag.startedAt.xMm;
    const dy = nowY - drag.startedAt.yMm;
    if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    drag.moved = true;
    const nextX = drag.origin.xMm + dx;
    const nextY = drag.origin.yMm + dy;
    const frame = model.frames.find(candidate => candidate.id === drag.frameId);
    if (!frame) return;
    onUpdateModel(prev => {
      // `setFrameRect` rastert und prueft; ein direktes Schreiben umginge beide Regeln.
      return setFrameRect(prev, drag.frameId, { x: nextX, y: nextY, width: frame.widthMm, height: frame.heightMm });
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragFrameId(null);
  };

  const handleDrop = async (frame: PublishFrame, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetId(null);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const check = checkPublishImageDrop(frame, { type: file.type, size: file.size });
    if (!check.accepted) { onRejectImage?.(check); return; }
    if (!onPlaceImage) { onRejectImage?.({ ...check, accepted: false, reason: 'frame-not-image' }); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await onPlaceImage(frame.id, { name: file.name || 'Image', bytes, declaredMime: file.type, embed: true });
  };

  return (
    <div
      className="flex-1 overflow-auto bg-[#05030a] p-12 flex justify-center items-start select-none relative"
      role="region"
      aria-label={`Publish page ${activePageIndex + 1} canvas`}
      tabIndex={0}
      data-publish-canvas-page={activePage?.id}
      onClick={() => onUpdateModel(prev => ({ ...prev, selectedFrameId: null }))}
    >
      {/* Outer Bleed Container */}
      <div
        className="relative bg-white shadow-2xl transition-all"
        style={{
          width: `${pageWidthPx + (showBleed ? bleedPx * 2 : 0)}px`,
          height: `${pageHeightPx + (showBleed ? bleedPx * 2 : 0)}px`,
          padding: showBleed ? `${bleedPx}px` : '0px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 20px rgba(147, 51, 234, 0.1)',
        }}
      >
        {/* Bleed Guide Line */}
        {showBleed && (
          <>
            <div className="absolute inset-0 border border-dashed border-red-400/50 pointer-events-none" title={`Prepress Bleed Line (+${geometry.bleedMm}mm)`} data-publish-bleed-mm={geometry.bleedMm} />
            <div aria-hidden="true" data-publish-crop-marks="true" className="pointer-events-none absolute inset-0">
              {[['left','top'],['right','top'],['left','bottom'],['right','bottom']].map(([x,y])=><React.Fragment key={`${x}-${y}`}><i className="absolute bg-slate-500" style={{width:bleedPx*.72,height:1,[x]:0,[y]:bleedPx}}/><i className="absolute bg-slate-500" style={{width:1,height:bleedPx*.72,[x]:bleedPx,[y]:0}}/></React.Fragment>)}
            </div>
          </>
        )}

        {/* Trim Page Surface */}
        <div
          className="relative w-full h-full bg-white text-slate-900 overflow-hidden"
          style={{ width: `${pageWidthPx}px`, height: `${pageHeightPx}px` }}
          data-publish-page-surface={activePage?.id}
        >
          {showGuides && <div aria-hidden="true" data-publish-baseline-grid="true" className="absolute inset-0 pointer-events-none opacity-25" style={{backgroundImage:'linear-gradient(to bottom, transparent calc(100% - 1px), rgba(99,102,241,.45) 1px)',backgroundSize:`100% ${baselinePx}px`}} />}
          {/* Master Page Header & Footer — nur, wenn der Master wirklich Text traegt. Ein leerer Master
              erzeugte vorher zwei leere Zeilen plus die erfundene Zeile „Astraea DTP Engine". */}
          {master && (master.headerText || master.footerText || master.showPageNumbers) && (
            <>
              {master.headerText && (
                <div className="absolute text-[0.625rem] font-sans tracking-wide text-slate-400 uppercase pointer-events-none"
                  style={{ top: `${marginTopPx / 2}px`, left: `${marginLeftPx}px`, right: `${marginRightPx}px` }}
                  data-publish-master-header={master.id}>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span>{master.headerText}</span>
                  </div>
                </div>
              )}

              <div className="absolute text-[0.625rem] font-sans tracking-wide text-slate-400 uppercase pointer-events-none"
                style={{ bottom: `${marginBottomPx / 2}px`, left: `${marginLeftPx}px`, right: `${marginRightPx}px` }}
                data-publish-master-footer={master.id}>
                <div className="flex justify-between border-t border-slate-200 pt-1">
                  <span>{master.footerText}</span>
                  {master.showPageNumbers && <span data-publish-master-page-number={activePageIndex + 1}>{activePageIndex + 1}</span>}
                </div>
              </div>
            </>
          )}

          {/* Margins & Columns Visual Guides */}
          {showGuides && (
            <div
              className="absolute pointer-events-none border border-purple-400/30"
              style={{
                top: `${marginTopPx}px`,
                left: `${marginLeftPx}px`,
                width: `${liveWidthPx}px`,
                height: `${liveHeightPx}px`,
              }}
            >
              {/* Columns */}
              {Array.from({ length: Math.max(0, geometry.columns - 1) }).map((_, idx) => {
                const leftPos = (idx + 1) * colWidthPx + idx * gutterPx;
                return (
                  <React.Fragment key={idx}>
                    <div
                      className="absolute top-0 bottom-0 border-r border-indigo-400/20"
                      style={{ left: `${leftPos}px` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 border-r border-indigo-400/20"
                      style={{ left: `${leftPos + gutterPx}px` }}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/*
            **Master-Ebene** (`AST-1371`) — wiederkehrende Rahmen erscheinen auf **jeder** Seite, die den Master
            nutzt. Sie liegen **hinter** der Seitenebene, sind nicht auswaehlbar und nicht ziehbar: *ein
            Master-Rahmen gehoert dem Master, nicht dieser Seite.* Genau **eine** Aufteilung (`splitPageLayers`),
            damit ein Master-Rahmen auf seiner Host-Seite nicht doppelt erscheint.
          */}
          {masterFrames.map((frame) => (
            <div
              key={`master-${frame.id}`}
              data-publish-master-frame={frame.id}
              data-publish-master-layer="true"
              aria-label={`Master ${frame.type} frame: ${frame.name || frame.id}`}
              className="absolute pointer-events-none"
              style={{
                top: `${frame.yMm * MM_TO_PX}px`, left: `${frame.xMm * MM_TO_PX}px`,
                width: `${frame.widthMm * MM_TO_PX}px`, height: `${frame.heightMm * MM_TO_PX}px`,
                transform: frame.rotationDeg ? `rotate(${frame.rotationDeg}deg)` : undefined,
                opacity: frame.opacity ?? 1,
              }}
            >
              {renderFrameBody(frame, presentPublishImage(model, frame), false)}
            </div>
          ))}

          {/* Render Active Frames */}
          {currentFrames.map((frame) => {
            const fx = frame.xMm * MM_TO_PX;
            const fy = frame.yMm * MM_TO_PX;
            const fw = frame.widthMm * MM_TO_PX;
            const fh = frame.heightMm * MM_TO_PX;
            const image = presentPublishImage(model, frame);
            const isDropTarget = dropTargetId === frame.id;
            const isDragging = dragFrameId === frame.id;
            const isSelected = selectedFrameId === frame.id;

            return (
              <div
                key={frame.id}
                role="group"
                tabIndex={0}
                data-publish-frame={frame.id}
                data-publish-frame-type={frame.type}
                data-publish-frame-overset={frame.text?.overset ? 'true' : undefined}
                aria-label={`${frame.type} frame: ${frame.name || frame.id}${frame.text?.overset ? ' (overflow)' : ''}${frame.locked ? ' (locked)' : ''}`}
                onFocus={() => handleFrameSelect(frame.id)}
                onClick={(event) => { event.stopPropagation(); handleFrameSelect(frame.id); }}
                onPointerDown={(event) => handlePointerDown(frame, event)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDragOver={(event) => { event.preventDefault(); setDropTargetId(frame.id); }}
                onDragLeave={() => setDropTargetId(current => current === frame.id ? null : current)}
                onDrop={(event) => { void handleDrop(frame, event); }}
                className={`absolute transition-shadow ${
                  frame.locked ? 'cursor-default' : 'cursor-move'
                } ${isSelected ? 'ring-2 ring-purple-500 shadow-md bg-purple-50/10' : 'hover:ring-1 hover:ring-purple-300'} ${
                  isDropTarget ? 'ring-2 ring-emerald-500' : ''
                } ${isDragging ? 'opacity-80' : ''}`}
                style={{
                  top: `${fy}px`,
                  left: `${fx}px`,
                  width: `${fw}px`,
                  height: `${fh}px`,
                  backgroundColor: frame.fillColor && !frame.fillColor.startsWith('cmyk(') && !frame.fillColor.startsWith('spot(') ? frame.fillColor : undefined,
                  transform: frame.rotationDeg ? `rotate(${frame.rotationDeg}deg)` : undefined,
                  opacity: frame.opacity ?? 1,
                }}
              >
                {renderFrameBody(frame, image, isSelected)}

                {/* Selection Handles */}
                {isSelected && (
                  <>
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-purple-600 border-2 border-white rounded-full" />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-purple-600 border-2 border-white rounded-full" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-purple-600 border-2 border-white rounded-full" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-purple-600 border-2 border-white rounded-full" />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Zeilen einer Tabelle als Text — lesend, nicht schreibend. Der Canvas zeigt nur an. */
function tableRows(model: PublishDocumentModel, frame: PublishFrame): string[][] {
  const table = model.tables.find(candidate => candidate.id === frame.tableId);
  if (!table) return [];
  const rows: string[][] = [];
  for (let row = 0; row < table.rows; row += 1) {
    const cells: string[] = [];
    for (let column = 0; column < table.columns; column += 1) {
      const cell = table.cells.find(candidate => candidate.row === row && candidate.column === column);
      cells.push(cell?.content ?? '');
    }
    rows.push(cells);
  }
  return rows;
}
