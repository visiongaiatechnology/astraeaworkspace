// STATUS: DIAMANT VGT SUPREME — interactive Draw canvas surface.
//
// This replaces the previous static `<img src="data:image/svg+xml,…">`. Every shape is a real node in a
// real SVG whose geometry comes from `describeDrawSceneNode` (the same description the exporter uses),
// and every pointer/keyboard event is translated into a pure session step and handed back to the
// caller. The component holds no edit state of its own: hit-testing, z-order, resize/rotate geometry
// and snapping all live in the existing pure engines.
import React, { useMemo, useRef } from 'react';
import type {
  DrawDocumentModel, DrawObject, DrawObjectId, DrawPage, DrawPoint,
} from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { drawInteractionText } from '../drawInteractionLocale';
import { projectDrawOverlay } from '../interactions/drawOverlayProjection';
import { projectDrawScene } from '../interactions/drawSceneProjection';
import {
  dashArrayAttribute, describeDrawConnectorNode, describeDrawSceneNode, isDrawObjectPainted,
  type DrawSceneNode,
} from '../interactions/drawSceneRenderModel';
import {
  drawStateAriaSuffix, drawStateBadge, drawStateDashArray, drawStateFlags, drawStateGripFill,
  drawStateOutlineWidth, drawStateToken, type DrawObjectStateFlags,
} from '../interactions/drawStateVisuals';
import { measureDrawText } from '../interactions/drawTextLayout';
import { DRAW_STENCIL_MIME, clientToPagePoint, readDrawStencilDragPayload } from '../interactions/drawPlacementEngine';
import type { DrawCanvasSessionState } from '../interactions/drawCanvasSession';
import type { DrawInteractionModifiers } from '../interactions/drawInteractionController';

export interface DrawSurfaceHandlers {
  readonly onPointerDown: (point: DrawPoint, modifiers: DrawInteractionModifiers, button: 'primary' | 'secondary') => void;
  readonly onPointerMove: (point: DrawPoint, modifiers: DrawInteractionModifiers) => void;
  readonly onPointerUp: (point: DrawPoint, modifiers: DrawInteractionModifiers) => void;
  readonly onPointerCancel: () => void;
  readonly onDoubleClick: (point: DrawPoint) => void;
  readonly onTextChange: (text: string) => void;
  readonly onTextCommit: () => void;
  readonly onDropStencil: (stencilId: string, point: DrawPoint) => void;
}

export interface DrawInteractiveSurfaceProps {
  readonly model: DrawDocumentModel;
  readonly page: DrawPage;
  readonly session: DrawCanvasSessionState;
  readonly locale: WorkspaceLocale;
  readonly handlers: DrawSurfaceHandlers;
  readonly canvasRef?: React.RefObject<HTMLDivElement | null>;
}

const GRIP_SIZE = 8;
const OUTLINE_OFFSET = 2;

function modifiersOf(event: React.PointerEvent | React.KeyboardEvent | React.MouseEvent): DrawInteractionModifiers {
  return { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey };
}

function shapeElement(node: DrawSceneNode, key: string): React.ReactNode {
  const { stroke } = node;
  const dash = dashArrayAttribute(stroke.dash);
  const common = {
    'data-vgt-shape': node.nodeType,
    fill: stroke.fill,
    stroke: stroke.stroke,
    strokeWidth: stroke.strokeWidth,
    ...(dash ? { strokeDasharray: dash } : {}),
    opacity: stroke.opacity,
  } as const;
  const shape = node.shape;
  if (!shape) return null;
  switch (shape.kind) {
    case 'rect':
      return <rect key={key} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.cornerRadius} {...common} />;
    case 'ellipse':
      return <ellipse key={key} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />;
    case 'polygon':
      return <polygon key={key} points={shape.points.map((entry) => `${entry.x},${entry.y}`).join(' ')} {...common} />;
    case 'line':
      return <line key={key} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />;
    case 'polyline':
      return <polyline key={key} points={shape.points.map((entry) => `${entry.x},${entry.y}`).join(' ')} fill="none" stroke={stroke.stroke} strokeWidth={stroke.strokeWidth} />;
    case 'path':
      return <path key={key} d={shape.d} fill="none" stroke={stroke.stroke} strokeWidth={stroke.strokeWidth} />;
    default:
      return null;
  }
}

function textElement(node: DrawSceneNode, key: string): React.ReactNode {
  if (!node.text) return null;
  return (
    <text
      key={key}
      x={node.text.x}
      y={node.text.y}
      textAnchor={node.text.anchor}
      dominantBaseline={node.text.baseline === 'middle' ? 'middle' : undefined}
      fill={node.text.fill}
      fontSize={node.text.fontSize}
      data-vgt-text="label"
      pointerEvents="none"
    >
      {node.text.text}
    </text>
  );
}

/** World-space bounds the selection adorner is drawn around, honouring rotation. */
function rotationTransform(object: DrawObject): string | undefined {
  if (object.rotation === 0) return undefined;
  const cx = object.x + object.width / 2;
  const cy = object.y + object.height / 2;
  return `rotate(${object.rotation} ${cx} ${cy})`;
}

function grips(
  object: DrawObject,
  flags: DrawObjectStateFlags,
  locale: WorkspaceLocale,
): React.ReactNode {
  const fill = drawStateGripFill(flags);
  if (fill === 'none' || object.type === 'connector' || object.type === 'group') return null;
  const anchors: readonly [string, number, number][] = [
    ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5],
    ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5],
  ];
  return (
    <g data-vgt-grips="true">
      {anchors.map(([handle, fx, fy]) => (
        <rect
          key={handle}
          data-vgt-handle={handle}
          x={object.x + object.width * fx - GRIP_SIZE / 2}
          y={object.y + object.height * fy - GRIP_SIZE / 2}
          width={GRIP_SIZE}
          height={GRIP_SIZE}
          fill={fill === 'solid' ? '#f8fafc' : 'none'}
          stroke="#0f172a"
          strokeWidth={1}
        >
          <title>{`${drawInteractionText('resizeHandle', locale)}: ${handle}`}</title>
        </rect>
      ))}
      <circle
        data-vgt-handle="rotate"
        cx={object.x + object.width / 2}
        cy={object.y - 24}
        r={GRIP_SIZE / 2}
        fill="#f8fafc"
        stroke="#0f172a"
        strokeWidth={1}
      >
        <title>{drawInteractionText('rotateHandle', locale)}</title>
      </circle>
    </g>
  );
}

export const DrawInteractiveSurface: React.FC<DrawInteractiveSurfaceProps> = ({
  model, page, session, locale, handlers, canvasRef,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const scene = useMemo(() => projectDrawScene(model, page.id), [model, page.id]);
  const overlay = useMemo(() => projectDrawOverlay(scene, session.selectedIds, {
    hoverId: session.hoverId,
    marquee: session.marqueeRect,
    marqueeCount: session.marqueeRect ? scene.entries.filter((entry) => entry.visible).length : 0,
    guides: session.guides,
  }), [scene, session.selectedIds, session.hoverId, session.marqueeRect, session.guides]);

  const toPagePoint = (event: { clientX: number; clientY: number }): DrawPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    return clientToPagePoint(event, {
      rect: {
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        width: rect?.width && rect.width > 0 ? rect.width : page.width,
        height: rect?.height && rect.height > 0 ? rect.height : page.height,
      },
      pageWidth: page.width,
      pageHeight: page.height,
    });
  };

  const activeDrag = session.interaction.kind === 'drag'
    || session.interaction.kind === 'resize'
    || session.interaction.kind === 'rotate'
    || session.interaction.kind === 'marquee';

  const textTarget = session.interaction.kind === 'text' ? model.objects[session.interaction.objectId] : undefined;
  const textMeasurement = textTarget
    ? measureDrawText(
      textTarget.richText?.runs.map((run) => run.text).join('') ?? textTarget.name,
      Math.max(1, textTarget.width - (textTarget.richText?.padding.left ?? 8) - (textTarget.richText?.padding.right ?? 8)),
      textTarget.richText?.runs[0]?.fontSize ?? 14,
    )
    : null;

  const stateOf = (objectId: DrawObjectId): DrawObjectStateFlags => {
    const entry = scene.byId.get(objectId);
    return drawStateFlags({
      selected: session.selectedIds.includes(objectId),
      hovered: session.hoverId === objectId,
      dragging: activeDrag && session.selectedIds.includes(objectId) && session.interaction.kind !== 'marquee',
      focused: session.interaction.kind === 'text' && textTarget?.id === objectId,
      locked: entry?.locked ?? false,
      visible: entry?.visible ?? false,
      editing: session.interaction.kind === 'text' && textTarget?.id === objectId,
    });
  };

  const gripFlags = session.selectedIds.length > 0
    ? stateOf(session.selectedIds[0]!)
    : drawStateFlags({ selected: false, hovered: false, dragging: false, focused: false, locked: false, visible: true, editing: false });

  return (
    <div
      ref={canvasRef}
      data-vgt-draw-surface="true"
      data-vgt-interaction={session.interaction.kind}
      className="relative origin-top-left bg-white shadow-2xl ring-1 ring-white/10"
      style={{ width: page.width, height: page.height, transform: `scale(${model.viewport.zoom})`, transformOrigin: 'top left' }}
      onDragOver={(event: React.DragEvent) => {
        if (event.dataTransfer.types.includes(DRAW_STENCIL_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event: React.DragEvent) => {
        const stencilId = readDrawStencilDragPayload(
          (mime) => event.dataTransfer.getData(mime),
          [...event.dataTransfer.types],
        );
        if (!stencilId) return;
        event.preventDefault();
        handlers.onDropStencil(stencilId, toPagePoint(event));
      }}
    >
      <svg
        ref={svgRef}
        data-vgt-interactive-canvas="true"
        className="h-full w-full touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        viewBox={`0 0 ${page.width} ${page.height}`}
        width={page.width}
        height={page.height}
        role="application"
        tabIndex={0}
        aria-label={`${page.name} — ${drawInteractionText('interactiveCanvas', locale)}`}
        aria-describedby="draw-surface-instructions"
        onPointerDown={(event: React.PointerEvent<SVGSVGElement>) => {
          if (event.button !== 0 && event.button !== 2) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.currentTarget.focus();
          handlers.onPointerDown(toPagePoint(event), modifiersOf(event), event.button === 2 ? 'secondary' : 'primary');
        }}
        onPointerMove={(event: React.PointerEvent<SVGSVGElement>) => handlers.onPointerMove(toPagePoint(event), modifiersOf(event))}
        onPointerUp={(event: React.PointerEvent<SVGSVGElement>) => {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          handlers.onPointerUp(toPagePoint(event), modifiersOf(event));
        }}
        onPointerCancel={() => handlers.onPointerCancel()}
        onDoubleClick={(event: React.MouseEvent<SVGSVGElement>) => handlers.onDoubleClick(toPagePoint(event))}
        onContextMenu={(event: React.MouseEvent<SVGSVGElement>) => event.preventDefault()}
      >
        <defs>
          <marker id="draw-arrow-end" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
            <path d="M0,0 L10,4 L0,8 z" fill="#64748b" />
          </marker>
        </defs>
        <rect data-vgt-page="true" x={0} y={0} width={page.width} height={page.height} fill="#ffffff" />
        <g data-vgt-paint-order="canonical">
          {scene.entries.filter((entry) => entry.visible).map((entry) => {
            const object = entry.object;
            const flags = stateOf(object.id);
            const token = drawStateToken(flags);
            const dash = drawStateDashArray(token);
            if (object.type === 'connector') {
              const connector = describeDrawConnectorNode(object, model.objects);
              return (
                <g key={object.id} data-vgt-id={object.id} data-vgt-type="connector" data-vgt-state={token} aria-hidden="true">
                  <path
                    data-vgt-connector="true"
                    d={connector.path}
                    fill="none"
                    stroke={token === 'selected' ? '#38bdf8' : '#64748b'}
                    strokeWidth={2}
                    markerEnd="url(#draw-arrow-end)"
                  />
                  {connector.label ? (
                    <text x={connector.labelX} y={connector.labelY} textAnchor="middle" fill="#0f172a" fontSize={12}>{connector.label}</text>
                  ) : null}
                </g>
              );
            }
            const node = describeDrawSceneNode(object);
            const outlineWidth = drawStateOutlineWidth(flags);
            return (
              <g
                key={object.id}
                data-vgt-id={object.id}
                data-vgt-type={node.nodeType}
                data-vgt-state={token}
                data-vgt-locked={entry.locked ? 'true' : 'false'}
                transform={rotationTransform(object)}
                aria-label={`${object.name}${drawStateAriaSuffix(flags) ? `, ${drawStateAriaSuffix(flags)}` : ''}`}
              >
                {isDrawObjectPainted(object) ? shapeElement(node, `${object.id}-shape`) : null}
                {textElement(node, `${object.id}-text`)}
                {outlineWidth > 0 ? (
                  <rect
                    data-vgt-outline={token}
                    className="transition-opacity duration-150 motion-reduce:transition-none"
                    x={object.x - OUTLINE_OFFSET}
                    y={object.y - OUTLINE_OFFSET}
                    width={object.width + OUTLINE_OFFSET * 2}
                    height={object.height + OUTLINE_OFFSET * 2}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth={outlineWidth}
                    strokeDasharray={dash ?? undefined}
                    pointerEvents="none"
                  />
                ) : null}
                {drawStateBadge(token) && flags.adorned ? (
                  <text
                    data-vgt-state-badge={token}
                    x={object.x}
                    y={object.y - 6}
                    fontSize={10}
                    fill="#0f172a"
                    pointerEvents="none"
                  >
                    {drawStateBadge(token)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        {session.selectedIds.length > 1 ? (
          <g data-vgt-adorners="multi">
            {overlay.selection.map((adorner) => (
              <rect
                key={adorner.objectId}
                data-vgt-adorner={adorner.objectId}
                x={adorner.worldBounds.x - OUTLINE_OFFSET}
                y={adorner.worldBounds.y - OUTLINE_OFFSET}
                width={adorner.worldBounds.width + OUTLINE_OFFSET * 2}
                height={adorner.worldBounds.height + OUTLINE_OFFSET * 2}
                fill="none"
                stroke="#0f172a"
                strokeWidth={1}
                strokeDasharray="6 3"
                pointerEvents="none"
              />
            ))}
          </g>
        ) : null}

        {session.selectedIds.length === 1 && gripFlags.selected
          ? grips(model.objects[session.selectedIds[0]!], gripFlags, locale)
          : null}

        {overlay.hoverOutline ? (
          <rect
            data-vgt-hover="true"
            x={overlay.hoverOutline.x - OUTLINE_OFFSET}
            y={overlay.hoverOutline.y - OUTLINE_OFFSET}
            width={overlay.hoverOutline.width + OUTLINE_OFFSET * 2}
            height={overlay.hoverOutline.height + OUTLINE_OFFSET * 2}
            fill="none"
            stroke="#0f172a"
            strokeWidth={1}
            strokeDasharray="2 4"
            pointerEvents="none"
          />
        ) : null}

        {overlay.marquee ? (
          <rect
            data-vgt-marquee="true"
            x={overlay.marquee.bounds.x}
            y={overlay.marquee.bounds.y}
            width={overlay.marquee.bounds.width}
            height={overlay.marquee.bounds.height}
            fill="#38bdf8"
            fillOpacity={0.12}
            stroke="#0f172a"
            strokeWidth={1}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        ) : null}

        {overlay.guides.map((guide) => (
          <line
            key={`${guide.axis}-${guide.position}`}
            data-vgt-guide={guide.axis}
            x1={guide.axis === 'x' ? guide.position : 0}
            y1={guide.axis === 'x' ? 0 : guide.position}
            x2={guide.axis === 'x' ? guide.position : page.width}
            y2={guide.axis === 'x' ? page.height : guide.position}
            stroke="#0f172a"
            strokeWidth={1}
            strokeDasharray="1 3"
            pointerEvents="none"
          />
        ))}

        {textTarget ? (
          <foreignObject
            data-vgt-text-editor="true"
            x={textTarget.x}
            y={textTarget.y}
            width={Math.max(24, textTarget.width)}
            height={Math.max(24, textTarget.height)}
          >
            <div className="flex h-full w-full flex-col bg-white/95">
              <textarea
                data-vgt-text-input="true"
                aria-label={drawInteractionText('editText', locale)}
                className="h-full w-full resize-none bg-transparent p-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                style={{ fontSize: textTarget.richText?.runs[0]?.fontSize ?? 14 }}
                defaultValue={textTarget.richText?.runs.map((run) => run.text).join('') ?? textTarget.name}
                onInput={(event: React.FormEvent<HTMLTextAreaElement>) => handlers.onTextChange(event.currentTarget.value)}
                onBlur={() => handlers.onTextCommit()}
                onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    handlers.onTextCommit();
                  }
                }}
                autoFocus
              />
              <span data-vgt-text-lines="true" className="px-2 pb-1 text-[0.625rem] text-slate-600">
                {drawInteractionText('lineCount', locale).replace('{count}', String(textMeasurement?.lines.length ?? 1))}
              </span>
            </div>
          </foreignObject>
        ) : null}
      </svg>
      <p id="draw-surface-instructions" className="sr-only">{drawInteractionText('surfaceInstructions', locale)}</p>
    </div>
  );
};

export default DrawInteractiveSurface;
