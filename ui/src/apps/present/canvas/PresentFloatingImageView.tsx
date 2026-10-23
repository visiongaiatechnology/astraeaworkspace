// STATUS: DIAMANT VGT SUPREME — freeform Present image interaction surface
import React from 'react';
import { Trash2, Crop } from 'lucide-react';
import type { PresentImageObject } from '../../../shared/contracts/workspace';
import { presentImageCropClipPath, readPresentImageCrop } from './model/presentObjectExtensions';

interface PresentFloatingImageViewProps {
  image: PresentImageObject;
  selected: boolean;
  moving: boolean;
  /**
   * Round 40 (performance): while a move gesture is active the drag is previewed with a local CSS
   * translate — the document is written once on pointer-up, so there is no per-frame history churn.
   */
  dragPreview?: { dxPx: number; dyPx: number };
  animationStyle?: React.CSSProperties;
  onSelect: (imageId: string | null) => void;
  onPresenceObjectChange?: (objectId: string | null) => void;
  onStartGesture: (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>, image: PresentImageObject, mode: 'move' | 'resize') => void;
  onPatch: (imageId: string, patch: Partial<PresentImageObject>) => void;
  onRemove: (imageId: string) => void;
}

const PresentFloatingImageViewInner: React.FC<PresentFloatingImageViewProps> = ({
  image,
  selected,
  moving,
  dragPreview,
  animationStyle,
  onSelect,
  onPresenceObjectChange,
  onStartGesture,
  onPatch,
  onRemove,
}) => {
  const heightPercent = image.heightPercent || Math.max(8, image.widthPercent * 0.5625);
  const crop = readPresentImageCrop(image);
  const cropClipPath = presentImageCropClipPath(image);
  const cropped = Boolean(crop.top || crop.right || crop.bottom || crop.left);

  const select = () => {
    onSelect(image.id);
    onPresenceObjectChange?.(image.id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(image.id);
      onSelect(null);
      onPresenceObjectChange?.(null);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 2 : 0.25;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (event.altKey) {
      onPatch(image.id, {
        widthPercent: Math.max(2, Math.min(100 - image.xPercent, image.widthPercent + dx)),
        heightPercent: Math.max(2, Math.min(100 - image.yPercent, heightPercent + dy)),
      });
      return;
    }
    onPatch(image.id, {
      xPercent: Math.max(0, Math.min(100 - image.widthPercent, image.xPercent + dx)),
      yPercent: Math.max(0, Math.min(100 - heightPercent, image.yPercent + dy)),
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-present-object="true"
      data-vgt-theme-selection={selected ? 'true' : undefined}
      aria-label={`Image object: ${image.altText || image.name || 'image'}`}
      className={`absolute z-20 group/image rounded-lg border shadow-xl touch-none ${selected ? 'border-cyan-400 ring-2 ring-cyan-400/30' : 'border-white/20'}`}
      style={{
        left: `${image.xPercent}%`,
        top: `${image.yPercent}%`,
        width: `${image.widthPercent}%`,
        height: `${heightPercent}%`,
        opacity: image.opacity ?? 1,
        zIndex: image.zIndex ?? 25,
        cursor: moving ? 'grabbing' : 'grab',
        // Round 40: local preview transform only; committed geometry arrives on pointer-up.
        transform: dragPreview ? `translate3d(${dragPreview.dxPx}px, ${dragPreview.dyPx}px, 0)` : undefined,
        willChange: dragPreview ? 'transform' : undefined,
        ...animationStyle,
      }}
      onPointerDown={(event) => onStartGesture(event, image, 'move')}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        event.stopPropagation();
        select();
      }}
    >
      <img
        src={image.dataUrl}
        alt={image.altText || image.name}
        className="block w-full h-full object-contain rounded-lg pointer-events-none"
        style={cropClipPath ? { clipPath: cropClipPath } : undefined}
        draggable={false}
      />
      {/* Crop state is a visible text badge, not only a clipped edge. */}
      {cropped && (
        <span
          data-present-image-cropped="true"
          className="pointer-events-none absolute bottom-1 left-1 z-10 flex items-center gap-1 rounded bg-black/70 px-1 text-[0.5rem] font-mono text-cyan-200"
        >
          <Crop className="h-2.5 w-2.5" />
          cropped T{crop.top} R{crop.right} B{crop.bottom} L{crop.left}
        </span>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(image.id);
          onSelect(null);
          onPresenceObjectChange?.(null);
        }}
        className="absolute top-1 right-1 opacity-0 group-hover/image:opacity-100 focus:opacity-100 rounded bg-black/70 p-1 text-white hover:text-red-300"
        aria-label={`Remove ${image.name || 'image'}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <button
        type="button"
        aria-label={`Resize ${image.name || 'image'}`}
        title="Drag to resize"
        data-vgt-theme-selection-handle="true"
        onPointerDown={(event) => onStartGesture(event, image, 'resize')}
        className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-full border-2 border-slate-950 bg-cyan-400 shadow-lg cursor-se-resize ${selected ? 'opacity-100' : 'opacity-0 group-hover/image:opacity-100 focus:opacity-100'}`}
      />
    </div>
  );
};

/**
 * Round 40 (performance/memoization): during an image drag only the dragged image's data props
 * change (the preview transform); every other image keeps its element. Handler identities are
 * intentionally not part of the comparison — they are recreated by the stage on every render and
 * reading them would defeat the memo; they are consumed on user events that re-read the latest
 * document/props when they run.
 */
export const PresentFloatingImageView = React.memo(
  PresentFloatingImageViewInner,
  (previous, next) =>
    previous.image === next.image
    && previous.selected === next.selected
    && previous.moving === next.moving
    && previous.dragPreview === next.dragPreview
    && previous.animationStyle === next.animationStyle,
);
