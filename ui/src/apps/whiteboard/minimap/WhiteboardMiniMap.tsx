// STATUS: DIAMANT VGT SUPREME
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardMiniMapCount, whiteboardObjectsTemplate, whiteboardObjectsText } from '../whiteboardObjectsLocale';
import type { BoundingBox } from '../rendering/whiteboardSpatialIndexEngine';
import { calculateCanvasBounds } from '../rendering/whiteboardSpatialIndexEngine';
import type { WhiteboardBookmark } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import {
  createMiniMapTransform,
  miniMapToWorld,
  stepWorldCenterByKey,
  worldToMiniMap,
} from '../viewport/whiteboardViewportEngine';

interface WhiteboardMiniMapProps {
  items: WhiteboardItem[];
  viewportBounds: BoundingBox;
  onNavigate: (x: number, y: number) => void;
  /** Canonical, persisted board locations (the view config's bookmarks) — the mini-map's durable state. */
  bookmarks?: readonly WhiteboardBookmark[];
  onSaveBookmark?: () => void;
  onNavigateBookmark?: (bookmarkId: string) => void;
  onRemoveBookmark?: (bookmarkId: string) => void;
}

const WIDTH = 196;
const HEIGHT = 124;
/** One keyboard step moves the view by this fraction of the visible world extent. */
const KEY_STEP_FRACTION = 0.25;

const mergeBounds = (a: BoundingBox, b: BoundingBox): BoundingBox => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

export const WhiteboardMiniMap: React.FC<WhiteboardMiniMapProps> = ({
  items,
  viewportBounds,
  onNavigate,
  bookmarks = [],
  onSaveBookmark,
  onNavigateBookmark,
  onRemoveBookmark,
}) => {
  const { locale } = useWorkspaceLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const worldBounds = useMemo(() => mergeBounds(calculateCanvasBounds(items), viewportBounds), [items, viewportBounds]);
  const transform = useMemo(() => createMiniMapTransform(worldBounds, WIDTH, HEIGHT, 8), [worldBounds]);
  const viewportCenter = useMemo(() => ({
    x: (viewportBounds.minX + viewportBounds.maxX) / 2,
    y: (viewportBounds.minY + viewportBounds.maxY) / 2,
  }), [viewportBounds.maxX, viewportBounds.maxY, viewportBounds.minX, viewportBounds.minY]);
  const keyStep = useMemo(() => Math.max(
    1,
    (viewportBounds.maxX - viewportBounds.minX) * KEY_STEP_FRACTION,
    (viewportBounds.maxY - viewportBounds.minY) * KEY_STEP_FRACTION,
  ), [viewportBounds.maxX, viewportBounds.maxY, viewportBounds.minX, viewportBounds.minY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(WIDTH * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(2,6,23,.88)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const drawLimit = Math.min(items.length, 100_000);
    for (let index = 0; index < drawLimit; index += 1) {
      const item = items[index];
      if (item.type === 'connector') continue;
      const topLeft = worldToMiniMap({ x: item.x, y: item.y }, transform);
      const width = Math.max(1, item.width * transform.scale);
      const height = Math.max(1, item.height * transform.scale);
      ctx.fillStyle = item.type === 'frame' ? 'rgba(148,163,184,.24)' : 'rgba(56,189,248,.58)';
      ctx.fillRect(topLeft.x, topLeft.y, width, height);
    }

    const viewportTopLeft = worldToMiniMap({ x: viewportBounds.minX, y: viewportBounds.minY }, transform);
    const viewportBottomRight = worldToMiniMap({ x: viewportBounds.maxX, y: viewportBounds.maxY }, transform);
    ctx.strokeStyle = 'rgba(250,204,21,.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      viewportTopLeft.x,
      viewportTopLeft.y,
      Math.max(2, viewportBottomRight.x - viewportTopLeft.x),
      Math.max(2, viewportBottomRight.y - viewportTopLeft.y)
    );
  }, [items, transform, viewportBounds]);

  const navigateToMiniMapPoint = (clientX: number, clientY: number, rect: DOMRect) => {
    const point = miniMapToWorld({
      x: (clientX - rect.left) * (WIDTH / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (HEIGHT / Math.max(1, rect.height)),
    }, transform);
    onNavigate(point.x, point.y);
    setAnnouncement(`${Math.round(point.x)}, ${Math.round(point.y)}`);
  };

  return (
    <div className="absolute bottom-6 left-6 z-30 rounded-xl border border-white/10 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-md" aria-label={whiteboardObjectsText('miniMap', locale)}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        tabIndex={0}
        role="application"
        aria-label={whiteboardObjectsText('miniMap', locale)}
        aria-describedby="whiteboard-minimap-help"
        data-vgt-whiteboard-minimap="true"
        className="block rounded-lg cursor-crosshair"
        style={{ width: WIDTH, height: HEIGHT }}
        onPointerDown={(event) => {
          navigateToMiniMapPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onNavigate(worldBounds.minX + (worldBounds.maxX - worldBounds.minX) / 2, worldBounds.minY + (worldBounds.maxY - worldBounds.minY) / 2);
            setAnnouncement(whiteboardObjectsText('miniMap', locale));
            return;
          }
          const step = event.shiftKey ? keyStep * 4 : keyStep;
          const next = stepWorldCenterByKey(viewportCenter, event.key, step);
          if (!next) return;
          event.preventDefault();
          onNavigate(next.x, next.y);
          setAnnouncement(`${Math.round(next.x)}, ${Math.round(next.y)}`);
        }}
      />
      <p id="whiteboard-minimap-help" className="sr-only">{whiteboardObjectsText('miniMapKeyboardHint', locale)}</p>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className="px-1 pt-1 text-[0.5625rem] font-mono uppercase tracking-wider text-slate-500">{whiteboardMiniMapCount(items.length, locale)}</div>

      {/* The mini-map's durable state: the canonical, persisted board locations of the view config. */}
      {(onSaveBookmark || onNavigateBookmark) && (
        <div className="mt-1 border-t border-white/10 px-1 pt-1" data-vgt-whiteboard-minimap-bookmarks="true">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[0.5625rem] font-semibold uppercase tracking-wider text-slate-400">{whiteboardObjectsText('mapBookmarks', locale)}</span>
            {onSaveBookmark && (
              <button
                type="button"
                className="whiteboard-minimap__bookmark-button rounded px-1.5 py-0.5 text-[0.5625rem]"
                onClick={onSaveBookmark}
              >
                {whiteboardObjectsText('saveBookmark', locale)}
              </button>
            )}
          </div>
          {bookmarks.length === 0 && <p className="pt-1 text-[0.5625rem] text-slate-500">{whiteboardObjectsText('noBookmarks', locale)}</p>}
          <ul className="flex max-h-24 flex-col gap-0.5 overflow-y-auto pt-1">
            {bookmarks.slice(0, 12).map((bookmark) => (
              <li key={bookmark.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="whiteboard-minimap__bookmark-button min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-[0.5625rem]"
                  aria-label={whiteboardObjectsTemplate('gotoBookmark', locale, { name: bookmark.name || bookmark.id })}
                  onClick={() => onNavigateBookmark?.(bookmark.id)}
                >
                  {bookmark.name || bookmark.id}
                </button>
                {onRemoveBookmark && (
                  <button
                    type="button"
                    className="whiteboard-minimap__bookmark-button rounded px-1 py-0.5 text-[0.5625rem]"
                    aria-label={whiteboardObjectsTemplate('removeBookmark', locale, { name: bookmark.name || bookmark.id })}
                    onClick={() => onRemoveBookmark(bookmark.id)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
