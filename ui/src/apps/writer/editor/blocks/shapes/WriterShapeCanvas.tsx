// STATUS: DIAMANT VGT SUPREME — Sovereign Vector Shape Canvas & Interactive Drawing Component
import React, { useEffect, useRef, useState } from 'react';
import {
  Trash2,
  ArrowUp,
  ArrowDown,
  Group,
  Ungroup,
  Edit2,
  Check,
} from 'lucide-react';
import type { WriterShapeBlockData } from '../../../../../shared/contracts/workspace';
import {
  generateShapeSvgPath,
  bringShapeToFront,
  sendShapeToBack,
  bringShapeForward,
  sendShapeBackward,
  groupWriterShapes,
  ungroupWriterShapes,
  clampWriterShapeGeometry,
} from '../../../media/objects/shapes/writerShapeOperations';

interface WriterShapeCanvasProps {
  shapes: readonly WriterShapeBlockData[];
  onUpdateShapes: (updated: WriterShapeBlockData[]) => void;
  onSelectShape?: (shapeId: string | null) => void;
  selectedShapeId?: string | null;
  readOnly?: boolean;
  /**
   * WR-034 — document zoom in percent.
   *
   * The page is rendered inside a `scale(zoom / 100)` container, so a pointer delta is
   * measured in **zoomed** pixels. Dividing the zoom out before converting to millimetres
   * is what keeps a drag identical at 50 % and at 200 %; without it a 200 % page moved the
   * shape twice as far as the pointer.
   */
  zoom?: number;
}

/** Millimetres as CSS pixels — one constant, so the canvas and the handles agree. */
const MM_TO_PX = 96 / 25.4;

/**
 * WR-034 — the drag only starts after this distance.
 *
 * A plain click to *select* a shape arrives as `pointerdown` + `pointerup` with a wobble of
 * one or two pixels. Reporting that wobble moved the shape by a fraction of a millimetre and
 * mutated `xMm`/`yMm`, which looked like the shape jumped when it was merely selected.
 */
const DRAG_THRESHOLD_PX = 3;

/**
 * WR-SHELL-03 (native M7 probe, round 3) — one gesture object, previewed locally.
 *
 * `pointerId` is part of the gesture because the canvas captures the pointer: a gesture that
 * travelled outside the SVG must still finish at the pointer that started it.
 */
type WriterShapeGesture =
  | { mode: 'move'; pointerId: number; pointerX: number; pointerY: number; origin: WriterShapeBlockData }
  | { mode: 'resize'; pointerId: number; corner: 'nw' | 'ne' | 'sw' | 'se'; pointerX: number; pointerY: number; origin: WriterShapeBlockData };

/**
 * Geometry of one gesture frame, in millimetres.
 *
 * Everything derives from `gesture.origin`, so a fast or a slow drag lands on the same result,
 * and the pointer delta is divided by the zoom before it becomes millimetres — a 200 % page
 * would otherwise move the shape twice as far as the pointer.
 */
function resolveGestureGeometry(
  gesture: WriterShapeGesture,
  clientX: number,
  clientY: number,
  zoomScale: number,
): WriterShapeBlockData {
  const deltaXMm = (clientX - gesture.pointerX) / zoomScale / MM_TO_PX;
  const deltaYMm = (clientY - gesture.pointerY) / zoomScale / MM_TO_PX;
  const origin = gesture.origin;
  if (gesture.mode === 'move') {
    return clampWriterShapeGeometry({
      ...origin,
      xMm: origin.xMm + deltaXMm,
      yMm: origin.yMm + deltaYMm,
    });
  }
  const minMm = 2;
  const growLeft = gesture.corner === 'nw' || gesture.corner === 'sw';
  const growUp = gesture.corner === 'nw' || gesture.corner === 'ne';
  const widthMm = Math.max(minMm, origin.widthMm + (growLeft ? -deltaXMm : deltaXMm));
  const heightMm = Math.max(minMm, origin.heightMm + (growUp ? -deltaYMm : deltaYMm));
  return clampWriterShapeGeometry({
    ...origin,
    xMm: growLeft ? origin.xMm + origin.widthMm - widthMm : origin.xMm,
    yMm: growUp ? origin.yMm + origin.heightMm - heightMm : origin.yMm,
    widthMm,
    heightMm,
  });
}

export const WriterShapeCanvas: React.FC<WriterShapeCanvasProps> = ({
  shapes,
  onUpdateShapes,
  onSelectShape,
  selectedShapeId: externalSelectedId,
  readOnly = false,
  zoom = 100,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  /**
   * WR-SHELL-03 (native M7 probe, round 3) — **the drag no longer writes the model 60×/s.**
   *
   * Before, every `pointermove` called `onUpdateShapes` → `persistWriterData` → a full editor
   * re-render. The shape lagged behind the pointer, jumped when the first frame arrived late,
   * and the document was written dozens of times for one gesture. Now the gesture keeps its
   * live geometry in local state (the SVG follows at frame rate) and the model is written
   * exactly once, on `pointerup`.
   */
  const [gesture, setGesture] = useState<WriterShapeGesture | null>(null);
  const [liveGeometry, setLiveGeometry] = useState<WriterShapeBlockData | null>(null);
  /** True once the pointer left the threshold; a click never sets it. */
  const dragStartedRef = useRef(false);
  /** The element that holds the pointer capture, so the release happens on the right node. */
  const captureRef = useRef<Element | null>(null);
  const zoomScale = Number.isFinite(zoom) && zoom > 0 ? zoom / 100 : 1;
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');

  const handleSelect = (id: string) => {
    setInternalSelectedId(id);
    onSelectShape?.(id);
  };

  /**
   * WR-034 — `Esc` leaves the shape mode immediately.
   *
   * A selected shape keeps a resize frame, a text editor and a delete affordance in the
   * document; the established way out of a mode is `Esc`. It clears the selection (so no
   * handle stays visible) and puts the caret back into the writing surface, which is
   * where the user was before the shape was clicked.
   */
  useEffect(() => {
    if (readOnly) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selectedId === null && editingTextId === null) return;
      event.preventDefault();
      event.stopPropagation();
      setEditingTextId(null);
      setInternalSelectedId(null);
      onSelectShape?.(null);
      const surface = globalThis.document?.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
      try {
        surface?.focus({ preventScroll: true });
      } catch {
        surface?.focus();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [editingTextId, onSelectShape, readOnly, selectedId]);

  const selectedShape = shapes.find((s) => s.id === selectedId);

  /**
   * Starts a gesture and captures the pointer.
   *
   * Without the capture the gesture ended as soon as the pointer left the SVG
   * (`onPointerLeave`), and the shape snapped back although the button was still down.
   */
  const beginGesture = (event: React.PointerEvent<Element>, next: WriterShapeGesture): void => {
    dragStartedRef.current = false;
    setLiveGeometry(null);
    setGesture(next);
    const element = event.currentTarget;
    captureRef.current = element;
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer id that is already gone must not break the gesture start.
    }
  };

  const releaseCapture = (): void => {
    const element = captureRef.current;
    captureRef.current = null;
    if (!element) return;
    try {
      element.releasePointerCapture?.(gesture?.pointerId ?? -1);
    } catch {
      // Releasing a capture that the engine already dropped is not an error.
    }
  };

  /**
   * One frame of the running gesture: only the **local preview** moves.
   *
   * `onUpdateShapes` is deliberately not called here (WR-SHELL-03). The committed geometry is
   * produced once in `finishGesture`.
   */
  const applyGesture = (clientX: number, clientY: number): void => {
    if (!gesture) return;
    const deltaXPx = clientX - gesture.pointerX;
    const deltaYPx = clientY - gesture.pointerY;
    if (!dragStartedRef.current) {
      if (Math.hypot(deltaXPx, deltaYPx) < DRAG_THRESHOLD_PX) return;
      dragStartedRef.current = true;
    }
    setLiveGeometry(resolveGestureGeometry(gesture, clientX, clientY, zoomScale));
  };

  /** Ends the gesture and writes the final geometry **once**. */
  const finishGesture = (clientX: number, clientY: number): void => {
    if (gesture && dragStartedRef.current) {
      const next = resolveGestureGeometry(gesture, clientX, clientY, zoomScale);
      onUpdateShapes(shapes.map((shape) => (shape.id === next.id ? next : shape)));
    }
    releaseCapture();
    dragStartedRef.current = false;
    setGesture(null);
    setLiveGeometry(null);
  };

  /** `pointercancel` (or a lost window) drops the preview without writing anything. */
  const cancelGesture = (): void => {
    releaseCapture();
    dragStartedRef.current = false;
    setGesture(null);
    setLiveGeometry(null);
  };

  /** `Delete`/`Backspace` removes the selected shape — unless its text field is open. */
  useEffect(() => {
    if (readOnly) return undefined;
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selectedId === null || editingTextId !== null) return;
      const target = event.target as HTMLElement | null;
      // Never steal the key from a real input (the shape's own text field, a dialog).
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      onUpdateShapes(shapes.filter((shape) => shape.id !== selectedId));
      setInternalSelectedId(null);
      onSelectShape?.(null);
      const surface = globalThis.document?.querySelector<HTMLElement>('[data-writer-rich-surface="true"]');
      try {
        surface?.focus({ preventScroll: true });
      } catch {
        surface?.focus();
      }
    };
    window.addEventListener('keydown', handleDelete, true);
    return () => window.removeEventListener('keydown', handleDelete, true);
  }, [editingTextId, onSelectShape, onUpdateShapes, readOnly, selectedId, shapes]);

  const handleStartEditText = (shape: WriterShapeBlockData) => {
    setEditingTextId(shape.id);
    setTextInput(shape.text ?? '');
  };

  const handleSaveText = (id: string) => {
    onUpdateShapes(
      shapes.map((s) => (s.id === id ? { ...s, text: textInput.trim() || undefined } : s)),
    );
    setEditingTextId(null);
  };

  const handleDelete = (id: string) => {
    onUpdateShapes(shapes.filter((s) => s.id !== id));
    if (selectedId === id) {
      setInternalSelectedId(null);
      onSelectShape?.(null);
    }
  };

  // Sort shapes by zIndex for rendering order
  const sortedShapes = [...shapes].sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));

  if (shapes.length === 0) return null;

  /**
   * WR-034 — the canvas is as tall as its content.
   *
   * A fixed 120 px box with a shape at y_mm: 30 (113 px) hung out of the SVG and
   * over the footer, while the shape's own toolbar floated far away. The height now
   * follows the lowest shape plus a small margin, so nothing can ever leave the box.
   */
  const contentBottomPx = shapes.reduce(
    (bottom, shape) => Math.max(bottom, (shape.yMm + shape.heightMm) * MM_TO_PX),
    0,
  );
  const canvasHeightPx = Math.max(80, Math.round(contentBottomPx + 24));

  return (
    <div className="relative w-full my-4 select-none pointer-events-auto" data-writer-shape-canvas="true">
      {/* SVG Canvas for all shapes */}
      <svg
        className="w-full overflow-visible"
        style={{ height: `${canvasHeightPx}px` }}
        onPointerMove={(event) => {
          // WR-034: one frame of the running drag/resize, measured in millimetres.
          if (gesture) applyGesture(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          // Fallback for engines without pointer capture; the `<g>` handler commits first.
          if (gesture) finishGesture(event.clientX, event.clientY);
        }}
        onPointerCancel={cancelGesture}
      >
        <defs>
          {/* Arrow markers */}
          <marker
            id="vgt-arrow-head"
            markerWidth="10"
            markerHeight="10"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
          </marker>
        </defs>

        {sortedShapes.map((shape) => {
          const isSelected = shape.id === selectedId;
          // The drag frame is local state: the shape follows the pointer without writing the
          // document. On release the committed geometry replaces it (WR-SHELL-03).
          const rendered = liveGeometry && liveGeometry.id === shape.id ? liveGeometry : shape;
          const xPx = rendered.xMm * 3.78;
          const yPx = rendered.yMm * 3.78;
          const widthPx = rendered.widthMm * 3.78;
          const heightPx = Math.max(12, rendered.heightMm * 3.78);
          const { path, extraElements, tailPath } = generateShapeSvgPath(rendered, widthPx, heightPx);

          const strokeDash =
            shape.strokeDashStyle === 'dashed' ? '6,4' :
            shape.strokeDashStyle === 'dotted' ? '2,2' : undefined;

          return (
            <g
              key={shape.id}
              transform={`translate(${xPx}, ${yPx}) rotate(${shape.rotationDeg ?? 0} ${widthPx / 2} ${heightPx / 2})`}
              // GAP-0051, Runde 280: eine Form war nur mit der Maus
              // auswaehlbar. Ein `<g>` hat keine Rolle und keine Tab-Position,
              // beide muessen ausdruecklich gesetzt werden — und im
              // Nur-Lese-Modus bleibt die Form bewusst aus der Tab-Reihenfolge
              // (`-1`), weil sie dort nichts ausloest.
              role="button"
              tabIndex={readOnly ? -1 : 0}
              // `WriterShapeBlockData` hat KEIN `name`-Feld (gemessen in
              // `workspaceWriterMedia.ts:58-81`). Der zugaengliche Name kommt
              // darum aus den Feldern, die es gibt: Beschriftung, dann Text,
              // dann die Formart — die Formart ist ein Pflichtfeld und damit
              // immer vorhanden.
              aria-label={shape.caption ?? shape.text ?? shape.shapeKind}
              aria-pressed={isSelected}
              onClick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                handleSelect(shape.id);
              }}
              onDoubleClick={(e) => {
                // WR-034: double click edits the text of **every** shape kind.
                if (readOnly) return;
                e.stopPropagation();
                handleSelect(shape.id);
                handleStartEditText(shape);
              }}
              onPointerDown={(e) => {
                // WR-034/WR-SHELL-03: the pointer is captured, so the drag survives leaving
                // the SVG; the model is written on release, not on every frame.
                if (readOnly) return;
                e.stopPropagation();
                handleSelect(shape.id);
                beginGesture(e, { mode: 'move', pointerId: e.pointerId, pointerX: e.clientX, pointerY: e.clientY, origin: shape });
              }}
              onPointerUp={(e) => {
                if (!gesture) return;
                e.stopPropagation();
                finishGesture(e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                if (readOnly) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(shape.id);
                }
              }}
              className={readOnly ? 'cursor-default' : 'cursor-move group'}
            >
              {/* Callout tail path if present */}
              {extraElements === 'callout-tail' && tailPath && (
                <path
                  d={tailPath}
                  fill={shape.fillColor ?? '#0f172a'}
                  fillOpacity={shape.fillOpacity ?? 0.9}
                  stroke={shape.strokeColor ?? '#3b82f6'}
                  strokeWidth={shape.strokeWidthPx ?? 1.5}
                  strokeDasharray={strokeDash}
                />
              )}

              {/* Main Shape Path */}
              <path
                d={path}
                fill={shape.fillColor ?? (shape.shapeKind === 'line' || shape.shapeKind === 'arrow' ? 'none' : '#0f172a')}
                fillOpacity={shape.fillOpacity ?? 0.9}
                stroke={shape.strokeColor ?? '#3b82f6'}
                strokeWidth={shape.strokeWidthPx ?? 1.5}
                strokeDasharray={strokeDash}
                markerEnd={shape.arrowEndHead ? 'url(#vgt-arrow-head)' : undefined}
                // WR-034: **no** `transition-all`. It animated every geometry-related property
                // on select/deselect, which read as the shape twitching or jumping while the
                // pointer was still down. The selected state is now a static style change.
                className={isSelected ? 'stroke-blue-400 filter drop-shadow(0 0 6px rgba(59,130,246,0.5))' : undefined}
                style={{ color: shape.strokeColor ?? '#3b82f6' }}
              />

              {/* Text content inside textbox / callout / shape */}
              {shape.text && (
                <foreignObject x={8} y={8} width={Math.max(10, widthPx - 16)} height={Math.max(10, heightPx - 16)}>
                  <div className="w-full h-full flex items-center justify-center text-center text-xs font-sans text-slate-100 overflow-hidden break-words px-1">
                    {shape.text}
                  </div>
                </foreignObject>
              )}

              {/* WR-034: visible resize handles at the four corners. */}
              {isSelected && !readOnly && ([
                { corner: 'nw' as const, cx: 0, cy: 0 },
                { corner: 'ne' as const, cx: widthPx, cy: 0 },
                { corner: 'sw' as const, cx: 0, cy: heightPx },
                { corner: 'se' as const, cx: widthPx, cy: heightPx },
              ].map((handle) => (
                <rect
                  key={handle.corner}
                  data-writer-shape-handle={handle.corner}
                  x={handle.cx - 4}
                  y={handle.cy - 4}
                  width={8}
                  height={8}
                  fill="#3b82f6"
                  stroke="#0f172a"
                  strokeWidth="1"
                  className="cursor-nwse-resize"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    beginGesture(event, { mode: 'resize', pointerId: event.pointerId, corner: handle.corner, pointerX: event.clientX, pointerY: event.clientY, origin: shape });
                  }}
                  onPointerUp={(event) => {
                    if (!gesture) return;
                    event.stopPropagation();
                    finishGesture(event.clientX, event.clientY);
                  }}
                />
              )))}

              {/* Selection bounding box */}
              {isSelected && !readOnly && (
                <rect
                  x={-4}
                  y={-4}
                  width={widthPx + 8}
                  height={heightPx + 8}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  className="pointer-events-none"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Toolbar when a shape is selected */}
      {selectedShape && !readOnly && (
        <div className="absolute top-0 right-0 z-50 flex items-center space-x-1 p-1.5 rounded-xl bg-slate-900/95 border border-slate-700 shadow-xl text-slate-300 text-xs">
          <span className="font-mono text-[0.625rem] text-blue-400 font-semibold px-1.5 uppercase">
            {selectedShape.shapeKind}
          </span>

          {/* Text Editing for textboxes / callouts */}
          {(selectedShape.shapeKind === 'textbox' || selectedShape.shapeKind === 'callout') && (
            <button
              type="button"
              onClick={() => handleStartEditText(selectedShape)}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              aria-label="Text bearbeiten" title="Text bearbeiten"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Layering buttons */}
          <button
            type="button"
            onClick={() => onUpdateShapes(bringShapeToFront(shapes, selectedShape.id))}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            aria-label="Ganz nach vorne" title="Ganz nach vorne"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdateShapes(bringShapeForward(shapes, selectedShape.id))}
            className="px-1 py-0.5 rounded hover:bg-slate-800 text-[0.625rem]"
            title="Ebene nach vorne"
          >
            +1
          </button>
          <button
            type="button"
            onClick={() => onUpdateShapes(sendShapeBackward(shapes, selectedShape.id))}
            className="px-1 py-0.5 rounded hover:bg-slate-800 text-[0.625rem]"
            title="Ebene nach hinten"
          >
            -1
          </button>
          <button
            type="button"
            onClick={() => onUpdateShapes(sendShapeToBack(shapes, selectedShape.id))}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            aria-label="Ganz nach hinten" title="Ganz nach hinten"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          {/* Grouping */}
          {selectedShape.groupId ? (
            <button
              type="button"
              onClick={() => onUpdateShapes(ungroupWriterShapes(shapes, selectedShape.groupId!))}
              className="p-1 rounded hover:bg-slate-800 text-amber-400 hover:text-amber-300"
              aria-label="Gruppierung aufheben" title="Gruppierung aufheben"
            >
              <Ungroup className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const other = shapes.find((s) => s.id !== selectedShape.id);
                if (other) {
                  onUpdateShapes(groupWriterShapes(shapes, [selectedShape.id, other.id]));
                }
              }}
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              aria-label="Mit anderem Objekt gruppieren" title="Mit anderem Objekt gruppieren"
            >
              <Group className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={() => handleDelete(selectedShape.id)}
            className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300"
            aria-label="Objekt löschen" title="Objekt löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline Text Edit Modal */}
      {editingTextId && !readOnly && (
        <div className="absolute inset-x-4 top-2 z-50 p-3 bg-slate-900 border border-blue-500/50 rounded-xl shadow-2xl flex items-center space-x-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveText(editingTextId)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
            placeholder="Text eingeben..."
            autoFocus
          />
          <button
            type="button"
            onClick={() => handleSaveText(editingTextId)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1"
          >
            <Check className="w-3 h-3" />
            <span>Fertig</span>
          </button>
        </div>
      )}
    </div>
  );
};
