import React from 'react';
import {
  PresentAnimation,
  PresentSceneObject,
  PresentShapeSceneObject,
} from '../../../../shared/contracts/workspace';
import { ChartRenderer } from '../../../../shared/charts/ChartRenderer';
import {
  PresentDiagramRenderer,
  PresentCodeRenderer,
} from './PresentSmartRenderer';
import { PresentWidgetRenderer } from './PresentWidgetRenderer';
import { projectAnimatedChart, scopedPresentAnimationStyle } from '../../animations/presentAnimationRender';
import { PresentWorkspaceSnapshotView } from './PresentWorkspaceSnapshotView';
import { presentObjectTransform, readPresentGroupId, readPresentTextStyle } from '../model/presentObjectExtensions';
import { presentLinkSummary, presentObjectLink } from '../model/presentHyperlinks';
import type { PresentResizeCorner } from '../model/presentTransform';
import type { PresentLinkStatus } from '../../integrations/presentLinkStatus';
import { Link2 } from 'lucide-react';
import { presentObjectStyleCss, resolvePresentObjectStyle } from '../../contracts/presentStyle';

export type PresentObjectGestureMode = 'move' | 'resize' | 'rotate';

/**
 * Round 13 (malformed document): `ChartRenderer` normalises its model and throws `ChartModelError`
 * on a chart that is absent or not array-shaped. The view only hands it a renderable chart; a
 * damaged chart becomes an explicit placeholder instead of a module-losing throw.
 */
function isRenderablePresentChart(chart: unknown): boolean {
  if (!chart || typeof chart !== 'object') return false;
  const candidate = chart as { series?: unknown; categories?: unknown };
  if (!Array.isArray(candidate.series) || !Array.isArray(candidate.categories)) return false;
  return candidate.series.every(
    (entry) => Boolean(entry) && typeof entry === 'object' && Array.isArray((entry as { values?: unknown }).values),
  );
}

/**
 * PR-006 (M1) — which corner/edge of the object started the gesture.
 *
 * The union is the model's single definition (`PresentResizeCorner` in `presentTransform.ts`);
 * `undefined` on a resize gesture means the historical bottom-right handle, which keeps every
 * pre-PR-006 caller (and the keyboard resize command) on its old behaviour.
 */
export type PresentObjectGestureCorner = PresentResizeCorner;

interface PresentResizeHandleDefinition {
  corner: PresentObjectGestureCorner;
  /** Accessible name suffix and tooltip — the handle must be reachable without colour/shape. */
  label: string;
  /** Static Tailwind classes: centring the 24 px hitbox on the matching edge of the object box. */
  positionClassName: string;
  cursorClassName: string;
}

/**
 * All eight resize affordances, in reading order (top row, right, bottom row, left).
 *
 * The hitbox is 24 px (the documented minimum) rather than the previous 20 px, so the handles stay
 * reachable at 80–125 % zoom and on touch. The visible dot is the same element; there is no second,
 * untested overlay that could disagree with the gesture surface.
 */
const PRESENT_RESIZE_HANDLES: readonly PresentResizeHandleDefinition[] = [
  { corner: 'nw', label: 'top left corner', positionClassName: '-top-3 -left-3', cursorClassName: 'cursor-nwse-resize' },
  { corner: 'n', label: 'top edge', positionClassName: '-top-3 left-1/2 -translate-x-1/2', cursorClassName: 'cursor-ns-resize' },
  { corner: 'ne', label: 'top right corner', positionClassName: '-top-3 -right-3', cursorClassName: 'cursor-nesw-resize' },
  { corner: 'e', label: 'right edge', positionClassName: 'top-1/2 -right-3 -translate-y-1/2', cursorClassName: 'cursor-ew-resize' },
  { corner: 'se', label: 'bottom right corner', positionClassName: '-bottom-3 -right-3', cursorClassName: 'cursor-nwse-resize' },
  { corner: 's', label: 'bottom edge', positionClassName: '-bottom-3 left-1/2 -translate-x-1/2', cursorClassName: 'cursor-ns-resize' },
  { corner: 'sw', label: 'bottom left corner', positionClassName: '-bottom-3 -left-3', cursorClassName: 'cursor-nesw-resize' },
  { corner: 'w', label: 'left edge', positionClassName: 'top-1/2 -left-3 -translate-y-1/2', cursorClassName: 'cursor-ew-resize' },
];

interface PresentSceneObjectViewProps {
  object: PresentSceneObject;
  isSelected: boolean;
  /** The object the inspector binds to: the last one added to the selection. */
  isPrimary?: boolean;
  /** Number of selected objects; >1 renders the shared-selection affordance. */
  selectionSize?: number;
  /** True for the object that was just created and must receive the caret (Paket 4). */
  autoFocusText?: boolean;
  onAutoFocusHandled?: () => void;
  /**
   * PR-005 (M1) — the single text-edit mode of the slide.
   *
   * Exactly one text object may own the caret at a time. While it does, the object renders the
   * editable `<textarea>`; otherwise it renders a **preview** whose pointer events reach the
   * object container, which is what makes dragging a text box possible at all.
   */
  textEditing?: boolean;
  /** Double click (or Enter on a selected text object) asks the editor to start editing this object. */
  onRequestTextEdit?: (id: string) => void;
  /** Escape/blur ends the mode; the editor owns the state, so it decides what happens next. */
  onEndTextEdit?: () => void;
  /** Live-link state of a cross-workspace reference (Paket 15); `null` for every other object. */
  linkStatus?: PresentLinkStatus | null;
  onSelect: (id: string, additive: boolean) => void;
  onPatch: (id: string, patch: Partial<PresentSceneObject>) => void;
  /**
   * Starts exactly one gesture. `corner` is only meaningful for `mode === 'resize'`; omitting it
   * keeps the historical bottom-right (`'se'`) resize, so existing callers stay source compatible.
   */
  onStartGesture: (
    event: React.PointerEvent,
    object: PresentSceneObject,
    mode: PresentObjectGestureMode,
    corner?: PresentObjectGestureCorner,
  ) => void;
  canvasHeight?: number;
  animationPreviewStyle?: React.CSSProperties;
  animationPreviewAnimations?: PresentAnimation[];
  animationPreviewProgress?: Record<string, number>;
  /** Round 42: document-free draft style from the inspector's colour/font pickers. */
  stylePreview?: import('../../contracts/presentStyle').PresentObjectStyle;
}

const PresentSceneObjectViewInner: React.FC<PresentSceneObjectViewProps> = ({
  object,
  isSelected,
  isPrimary = isSelected,
  selectionSize = isSelected ? 1 : 0,
  autoFocusText = false,
  onAutoFocusHandled,
  textEditing = false,
  onRequestTextEdit,
  onEndTextEdit,
  linkStatus = null,
  onSelect,
  onPatch,
  onStartGesture,
  canvasHeight = 500,
  animationPreviewStyle,
  animationPreviewAnimations = [],
  animationPreviewProgress = {},
  stylePreview,
}) => {
  if (object.hidden) return null;

  const previewOpacity = typeof animationPreviewStyle?.opacity === 'number' ? animationPreviewStyle.opacity : 1;
  const previewTransform = typeof animationPreviewStyle?.transform === 'string' ? animationPreviewStyle.transform : '';
  const baseObjectStyle = resolvePresentObjectStyle(object as unknown as Record<string, unknown>);
  // Round 42: the inspector draft preview overlays the document style without committing anything.
  const objectStyle = stylePreview
    ? {
      ...baseObjectStyle,
      textColor: stylePreview.textColor ?? baseObjectStyle.textColor,
      backgroundColor: stylePreview.backgroundColor ?? baseObjectStyle.backgroundColor,
      backgroundGradient: stylePreview.backgroundGradient ?? baseObjectStyle.backgroundGradient,
      border: stylePreview.border ?? baseObjectStyle.border,
      shadow: stylePreview.shadow ?? baseObjectStyle.shadow,
      fontSizePt: stylePreview.fontSizePt ?? baseObjectStyle.fontSizePt,
      fontWeight: stylePreview.fontWeight ?? baseObjectStyle.fontWeight,
      textAlign: stylePreview.textAlign ?? baseObjectStyle.textAlign,
      opacity: stylePreview.opacity ?? baseObjectStyle.opacity,
    }
    : baseObjectStyle;
  const style: React.CSSProperties = {
    left: `${object.xPercent}%`,
    top: `${object.yPercent}%`,
    width: `${object.widthPercent}%`,
    height: `${object.heightPercent}%`,
    opacity: (objectStyle.opacity ?? object.opacity ?? 1) * previewOpacity,
    zIndex: object.zIndex ?? 20,
    // One transform definition for the whole app: rotation *and* mirroring. The previous inline
    // template dropped `flipX`/`flipY`, so a mirrored object looked unmirrored on the canvas.
    transform: presentObjectTransform(object, previewTransform),
    // Round 41 (style system): optional authored chrome from the additive `presentStyle` extension.
    ...presentObjectStyleCss(objectStyle),
  };

  const groupId = readPresentGroupId(object);
  const link = presentObjectLink(object);
  /**
   * Round 13 (malformed document): `text` is required by the contract but a damaged document can
   * omit it. The view treats it as empty instead of reading through `undefined` (which used to throw
   * in `accessibleLabel` and take the whole Present module tree down).
   */
  const objectText = object.kind === 'text' ? (object.text ?? '') : '';
  /**
   * Round 14 (malformed document rest): the diagram/code/table renderers dereference their payload
   * (items.map, code.split, rows.map). A damaged document only gets the explicit placeholder.
   */
  const renderableDiagramItems = object.kind === 'diagram' && Array.isArray(object.items)
    ? object.items.filter((item) => Boolean(item) && typeof item === 'object')
    : [];
  const hasRenderableCode = object.kind === 'code' && typeof object.code === 'string';
  const hasRenderableTable = object.kind === 'table'
    && Array.isArray(object.columns)
    && Array.isArray(object.rows);
  // Round 24 (malformed entries): an entry can miss its kind string entirely; the view states a
  // neutral "Object" instead of dereferencing it (the stage filters such entries already).
  const objectKind = typeof object.kind === 'string' && object.kind ? object.kind : 'object';
  const accessibleLabel = objectKind === 'text'
    ? `Text object: ${objectText.slice(0, 80) || 'empty'}`
    : `${objectKind.charAt(0).toUpperCase()}${objectKind.slice(1)} object`;

  const handleObjectKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    // Enter/Space only *selects*. Arrow keys, Delete and the transform shortcuts are owned by the
    // single window-level resolver in `SlideContentEditor`; keeping a second copy here is what made
    // pointer and keyboard semantics drift apart before.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // PR-005: Enter on an already selected text box starts typing instead of re-selecting.
      if (event.key === 'Enter' && object.kind === 'text' && isSelected) {
        onRequestTextEdit?.(object.id);
        return;
      }
      onSelect(object.id, event.shiftKey || event.ctrlKey || event.metaKey);
    }
  };

  const scopedStyle = (scope: PresentAnimation['scope'], scopeIndex: number): React.CSSProperties =>
    scopedPresentAnimationStyle(
      animationPreviewAnimations,
      object.id,
      scope,
      scopeIndex,
      animationPreviewProgress
    ) as React.CSSProperties;
  const hasParagraphPreview = animationPreviewAnimations.some(
    (animation) => animation.targetId === object.id && animation.scope === 'paragraph'
  );

  const renderShapeSvg = (shapeObj: PresentShapeSceneObject) => {
    const { shape, fillColor, strokeColor, strokeWidth } = shapeObj;
    switch (shape) {
      case 'ellipse':
        return <div className="w-full h-full rounded-full" style={{ backgroundColor: fillColor, border: `${strokeWidth}px solid ${strokeColor}` }} />;
      case 'triangle':
        return (
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="50,5 95,95 5,95" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        );
      case 'diamond':
        return (
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="50,5 95,50 50,95 5,50" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        );
      case 'arrow-right':
        return (
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="10,35 60,35 60,15 95,50 60,85 60,65 10,65" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        );
      case 'arrow-left':
        return (
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="90,35 40,35 40,15 5,50 40,85 40,65 90,65" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        );
      case 'star':
        return (
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="50,5 64,35 98,38 72,61 79,95 50,77 21,95 28,61 2,38 36,35" fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
          </svg>
        );
      case 'line':
        return <div className="w-full h-full" style={{ backgroundColor: strokeColor }} />;
      case 'rounded-rectangle':
        return <div className="w-full h-full rounded-2xl" style={{ backgroundColor: fillColor, border: `${strokeWidth}px solid ${strokeColor}` }} />;
      case 'rectangle':
      default:
        return <div className="w-full h-full" style={{ backgroundColor: fillColor, border: `${strokeWidth}px solid ${strokeColor}` }} />;
    }
  };

  return (
    <div
      data-present-object="true"
      data-present-object-id={object.id}
      data-present-object-selected={isSelected ? 'true' : undefined}
      data-present-object-group={groupId ?? undefined}
      data-vgt-theme-selection={isSelected ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-label={accessibleLabel}
      /**
       * Round 17 (A11y contract): `role="button"` cannot carry `aria-selected`; the valid AT state
       * pair is `aria-pressed`. Without it the only selection marker was a `data-*` attribute, which
       * screen readers never expose — a selected and an unselected object sounded identical.
       */
      aria-pressed={isSelected}
      aria-disabled={object.locked || undefined}
      className={`absolute touch-none select-none ${
        isSelected
          ? isPrimary
            ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-950'
            : 'ring-2 ring-dashed ring-cyan-500/70'
          : ''
      } ${object.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
      style={style}
      onPointerDown={(e) => onStartGesture(e, object, 'move')}
      onKeyDown={handleObjectKeyDown}
      /**
       * PR-004/PR-005 — a double click on a text box enters its edit mode.
       *
       * Before, the box always rendered a caret and the only way in was a second click into the
       * textarea; now the gesture is explicit and the same for mouse and keyboard (Enter).
       */
      onDoubleClick={(e) => {
        if (object.kind !== 'text') return;
        e.preventDefault();
        e.stopPropagation();
        onRequestTextEdit?.(object.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(object.id, e.shiftKey || e.ctrlKey || e.metaKey);
      }}
    >
      {link && (
        <span
          data-present-link-badge="true"
          title={presentLinkSummary(link)}
          className="absolute -bottom-4 left-0 z-30 flex items-center gap-1 rounded bg-blue-500/85 px-1 text-[0.5rem] font-semibold text-white"
        >
          <Link2 className="h-2.5 w-2.5" />
          {presentLinkSummary(link)}
        </span>
      )}
      {groupId && (
        <span
          data-present-group-badge="true"
          className="absolute -top-4 left-0 z-30 rounded bg-indigo-500/80 px-1 text-[0.5rem] font-semibold uppercase tracking-wide text-white"
        >
          Group · {groupId.replace('present-group-', '#')}
        </span>
      )}
      {isSelected && selectionSize > 1 && isPrimary && (
        <span
          data-present-selection-badge="true"
          className="absolute -top-4 right-0 z-30 rounded bg-cyan-500/90 px-1 text-[0.5rem] font-semibold text-slate-950"
        >
          {selectionSize} selected
        </span>
      )}
      {/* 1. Text Object */}
      {object.kind === 'text' && (
        hasParagraphPreview ? (
          <div
            className="w-full h-full whitespace-pre-wrap overflow-hidden border border-white/10 rounded-lg p-2 leading-snug"
            style={{
              color: objectStyle.textColor,
              fontSize: `${Math.max(8, objectStyle.fontSizePt ?? object.fontSizePt)}pt`,
              fontWeight: objectStyle.fontWeight === 'bold' ? 700 : objectStyle.fontWeight === 'semibold' ? 600 : 400,
              textAlign: objectStyle.textAlign || 'left',
              backgroundColor: object.backgroundColor || 'transparent',
            }}
          >
            {objectText.split('\n').map((paragraph, paragraphIndex) => (
              <React.Fragment key={`${object.id}-paragraph-${paragraphIndex}`}>
                <span style={scopedStyle('paragraph', paragraphIndex)}>{paragraph || '\u00a0'}</span>
                {paragraphIndex < objectText.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        ) : textEditing ? (
          <textarea
            value={objectText}
            // The caret lands in the box as soon as the edit mode exists; the request is cleared
            // after mount so a later re-render (slide switch) cannot steal focus again.
            autoFocus
            onFocus={() => { if (autoFocusText) onAutoFocusHandled?.(); }}
            /**
             * Round 17 (A11y contract): a textarea's default value text is NOT an accessible name.
             * The editor states the same kind-aware name as the object (and its multiline role), so
             * a screen reader announces "Text object: …" plus the fact that it is a multi-line edit.
             */
            aria-label={accessibleLabel}
            aria-multiline="true"
            placeholder="Type your text…"
            // Only the *editing* textarea owns the pointer. In preview mode this handler used to
            // stop every pointerdown, so a text object could never be dragged (PR-005).
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onPatch(object.id, { text: e.target.value })}
            onBlur={() => onEndTextEdit?.()}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              onEndTextEdit?.();
            }}
            className="w-full h-full resize-none border border-white/10 rounded-lg bg-transparent p-2 outline-none select-text leading-snug"
            style={{
              color: objectStyle.textColor,
              fontSize: `${Math.max(8, objectStyle.fontSizePt ?? object.fontSizePt)}pt`,
              fontWeight: objectStyle.fontWeight === 'bold' ? 700 : objectStyle.fontWeight === 'semibold' ? 600 : 400,
              textAlign: objectStyle.textAlign || 'left',
              lineHeight: readPresentTextStyle(object).lineHeight,
              fontFamily: readPresentTextStyle(object).fontFamily,
              backgroundColor: object.backgroundColor || 'transparent',
            }}
          />
        ) : (
          <div
            data-present-text-preview="true"
            className="w-full h-full whitespace-pre-wrap overflow-hidden border border-white/10 rounded-lg p-2 leading-snug pointer-events-none"
            style={{
              color: objectStyle.textColor,
              fontSize: `${Math.max(8, objectStyle.fontSizePt ?? object.fontSizePt)}pt`,
              fontWeight: objectStyle.fontWeight === 'bold' ? 700 : objectStyle.fontWeight === 'semibold' ? 600 : 400,
              textAlign: objectStyle.textAlign || 'left',
              lineHeight: readPresentTextStyle(object).lineHeight,
              fontFamily: readPresentTextStyle(object).fontFamily,
              backgroundColor: object.backgroundColor || 'transparent',
            }}
          >
            {objectText || '\u00a0'}
          </div>
        )
      )}

      {/* 2. Shape Object */}
      {object.kind === 'shape' && renderShapeSvg(objectStyle.backgroundGradient || objectStyle.backgroundColor !== 'transparent'
        ? { ...object, fillColor: objectStyle.backgroundColor, strokeColor: objectStyle.border?.color ?? object.strokeColor, strokeWidth: objectStyle.border?.width ?? object.strokeWidth }
        : object)}

      {/* 3. Widget Object */}
      {object.kind === 'widget' && <PresentWidgetRenderer widget={object} chromeStyle={{ ...presentObjectStyleCss(objectStyle), color: objectStyle.textColor }} />}

      {/* 4. Chart Object — a damaged document may omit the chart model or its series/categories.
          The renderer normalises the model and throws on invalid input, so only a renderable chart
          is passed through; otherwise an explicit placeholder is shown. */}
      {object.kind === 'chart' && (
        isRenderablePresentChart(object.chart) ? (
          <div className="w-full h-full rounded-xl border border-white/10 bg-slate-950/85 p-2 overflow-hidden pointer-events-none">
            <ChartRenderer
              chart={projectAnimatedChart(object.chart, animationPreviewAnimations, object.id, animationPreviewProgress)}
              height={Math.max(100, Math.round((canvasHeight * object.heightPercent) / 100 - 20))}
            />
          </div>
        ) : (
          <div
            data-present-chart-invalid="true"
            className="w-full h-full rounded-xl border border-dashed border-white/15 bg-slate-950/85 p-2 flex items-center justify-center overflow-hidden pointer-events-none text-center text-[0.625rem] text-slate-500"
          >
            Chart data unavailable
          </div>
        )
      )}

      {/* 5. Table Object */}
      {object.kind === 'table' && (
        hasRenderableTable ? (
          <div
          className="w-full h-full rounded-xl border border-white/15 overflow-auto bg-slate-950/95 shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <table className="w-full text-[0.625rem] border-collapse" style={{ color: object.textColor }}>
            <thead>
              <tr>
                {object.columns.map((column, colIdx) => (
                  <th
                    key={colIdx}
                    className="border border-white/10 p-1.5 font-bold"
                    style={{ backgroundColor: object.headerColor }}
                  >
                    <input
                      value={column}
                      onChange={(e) => {
                        const cols = [...object.columns];
                        cols[colIdx] = e.target.value;
                        onPatch(object.id, { columns: cols });
                      }}
                      className="w-full bg-transparent outline-none text-center font-bold"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {object.rows.map((row, rowIdx) => (
                <tr key={rowIdx} style={scopedStyle('series', rowIdx)}>
                  {object.columns.map((_, colIdx) => (
                    <td
                      key={colIdx}
                      className="border border-white/10 p-1"
                      style={{ backgroundColor: object.bodyColor, ...scopedStyle('category', colIdx) }}
                    >
                      <input
                        value={row[colIdx] || ''}
                        onChange={(e) => {
                          const rows = object.rows.map((r) => [...r]);
                          while (rows[rowIdx].length < object.columns.length) rows[rowIdx].push('');
                          rows[rowIdx][colIdx] = e.target.value;
                          onPatch(object.id, { rows });
                        }}
                        className="w-full bg-transparent outline-none text-center"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
          <div
            data-present-table-invalid="true"
            className="w-full h-full rounded-xl border border-dashed border-white/15 bg-slate-950/85 p-2 flex items-center justify-center overflow-hidden pointer-events-none text-center text-[0.625rem] text-slate-500"
          >
            Table data unavailable
          </div>
        )
      )}

      {/* 6. Smart Diagram */}
      {object.kind === 'diagram' && (
        renderableDiagramItems.length ? (
          <PresentDiagramRenderer
            diagram={{ ...object, items: renderableDiagramItems }}
            onUpdateItem={(idx, title, subtitle) => {
              const items = renderableDiagramItems.map((it, i) =>
                i === idx ? { ...it, title, subtitle } : it
              );
              onPatch(object.id, { items });
            }}
          />
        ) : (
          <div
            data-present-diagram-invalid="true"
            className="w-full h-full rounded-xl border border-dashed border-white/15 bg-slate-950/85 p-2 flex items-center justify-center overflow-hidden pointer-events-none text-center text-[0.625rem] text-slate-500"
          >
            Diagram data unavailable
          </div>
        )
      )}

      {/* 7. Code Block */}
      {object.kind === 'code' && (
        hasRenderableCode ? (
          <PresentCodeRenderer
            codeObject={object}
            onUpdateCode={(code) => onPatch(object.id, { code })}
          />
        ) : (
          <div
            data-present-code-invalid="true"
            className="w-full h-full rounded-xl border border-dashed border-white/15 bg-slate-950/85 p-2 flex items-center justify-center overflow-hidden pointer-events-none text-center text-[0.625rem] text-slate-500"
          >
            Code data unavailable
          </div>
        )
      )}

      {/* 8. Cross-workspace live/frozen reference */}
      {object.kind === 'workspace' && <PresentWorkspaceSnapshotView object={object} linkStatus={linkStatus} />}

      {/* Selection handles: eight resize affordances (4 corners + 4 edges) and rotation.
          Every one is a pointer path for a function that also has a keyboard binding
          (Alt+Arrow / [ ]), so no essential action is pointer-only. The 24 px hitbox is a hard
          minimum; `data-present-handle` names the exact handle, which is what the interaction
          tests and the zoom/DPI check drive. */}
      {isSelected && !object.locked && (
        <>
          {PRESENT_RESIZE_HANDLES.map((handle) => (
            <button
              key={handle.corner}
              type="button"
              aria-label={`Resize object from the ${handle.label}`}
              title={
                handle.corner.length === 2
                  ? 'Drag to resize — hold Shift to keep the aspect ratio'
                  : 'Drag to resize this edge'
              }
              data-present-handle={`resize-${handle.corner}`}
              data-present-handle-hitbox="24"
              style={{ width: '24px', height: '24px' }}
              onPointerDown={(e) => onStartGesture(e, object, 'resize', handle.corner)}
              className={`absolute z-30 touch-none rounded-full border-2 border-slate-950 bg-cyan-400 shadow-xl ${handle.positionClassName} ${handle.cursorClassName}`}
            />
          ))}
          <button
            type="button"
            aria-label="Rotate object"
            title="Drag to rotate"
            data-present-handle="rotate"
            data-present-handle-hitbox="24"
            style={{ width: '24px', height: '24px' }}
            onPointerDown={(e) => onStartGesture(e, object, 'rotate')}
            className="absolute -top-9 left-1/2 z-30 -translate-x-1/2 touch-none cursor-grab rounded-full border-2 border-slate-950 bg-amber-400 shadow-xl"
          />
        </>
      )}
    </div>
  );
};

/**
 * Round 40 (performance): memoized object renderer. Scene-object props (geometry, selection,
 * animation style) are compared shallowly; a stage re-render caused by unrelated state (e.g. the
 * image-drag preview) no longer re-renders every object tree.
 */
export const PresentSceneObjectView = React.memo(PresentSceneObjectViewInner);
