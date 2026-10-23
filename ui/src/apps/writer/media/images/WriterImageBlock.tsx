// STATUS: DIAMANT VGT SUPREME — Sovereign Enhanced Image Block with Wrap, Non-Destructive Filters & Captions
import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Trash2, Sliders } from 'lucide-react';
import type { WriterImageBlockData } from '../../../../shared/contracts/workspace';
import type { WriterPageGeometry } from '../../layout/pagination/writerPagination';
import type { WriterFlowAnchorPosition } from '../../layout/pagination/media/writerMediaAnchorGeometry';
import {
  resolveMediaWrapStyles,
  resolveFigureCaption,
} from './operations/writerMediaOperations';
import { isWriterImageTextWrapMode, resolveWriterImageFlowSelection } from '../../layout/pagination/media/writerMediaFlowLayout';

interface WriterImageBlockProps {
  image: WriterImageBlockData;
  imageIndex?: number;
  onUpdate: (patch: Partial<WriterImageBlockData>) => void;
  onDelete: () => void;
  onOpenProperties?: (image: WriterImageBlockData) => void;
  readOnly?: boolean;
  pageGeometry?: WriterPageGeometry;
  flowAnchorPosition?: WriterFlowAnchorPosition;
}

export const WriterImageBlock: React.FC<WriterImageBlockProps> = ({
  image,
  imageIndex = 1,
  onUpdate,
  onDelete,
  onOpenProperties,
  readOnly = false,
  pageGeometry,
  flowAnchorPosition,
}) => {
  const resolved = resolveMediaWrapStyles(image, pageGeometry);
  const containerStyle = { ...resolved.containerStyle };
  const imageStyle = resolved.imageStyle;
  const wrapperClassName = resolved.wrapperClassName;
  const wrapSelection = resolveWriterImageFlowSelection(image);
  const wrapMode = wrapSelection.mode;
  if (flowAnchorPosition && isWriterImageTextWrapMode(image)) {
    const baseTop = containerStyle.marginTop ?? '0px';
    containerStyle.marginTop = `calc(${String(baseTop)} + ${flowAnchorPosition.topPx}px)`;
    if (image.alignment === 'right' || image.placement === 'float-right') {
      containerStyle.marginRight = `${flowAnchorPosition.marginFromSidePx}px`;
    } else {
      containerStyle.marginLeft = `${flowAnchorPosition.marginFromSidePx}px`;
    }
  } else if (flowAnchorPosition && (wrapMode === 'behind-text' || wrapMode === 'in-front-of-text')) {
    containerStyle.position = 'absolute';
    containerStyle.left = `${flowAnchorPosition.leftPx}px`;
    containerStyle.top = `${flowAnchorPosition.topPx}px`;
    containerStyle.margin = 0;
    containerStyle.float = 'none';
    containerStyle.zIndex = wrapMode === 'behind-text' ? 0 : 20;
  }
  const captionText = resolveFigureCaption(image, imageIndex);
  const isCaptionAbove = image.captionPosition === 'above';

  return (
    <figure
      data-writer-image-id={image.id}
      className={`${wrapperClassName} rounded-xl border border-transparent hover:border-blue-500/30 p-2 transition-all`}
      style={containerStyle}
    >
      {/* Caption Above */}
      {image.caption && isCaptionAbove && (
        <figcaption className="mb-1 text-center text-xs font-medium text-slate-400 italic">
          {captionText}
        </figcaption>
      )}

      {/* Image Container with Transforms & Filters */}
      <div className="overflow-hidden rounded-lg shadow-sm relative group/img">
        <img
          src={image.dataUrl}
          alt={image.altText || image.name}
          className="w-full h-auto object-contain block select-none pointer-events-none"
          style={imageStyle}
          draggable={false}
        />

        {/* Hover Quick Overlay */}
        {onOpenProperties && !readOnly && (
          <button
            type="button"
            onClick={() => onOpenProperties(image)}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-blue-600 text-white opacity-40 group-hover/img:opacity-100 focus-visible:opacity-100 transition-opacity shadow-md"
            aria-label="Bildeigenschaften & Effekte öffnen" title="Bildeigenschaften & Effekte öffnen"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Caption Below */}
      {image.caption && !isCaptionAbove && (
        <figcaption className="mt-1 text-center text-xs font-medium text-slate-400 italic">
          {captionText}
        </figcaption>
      )}

      {/* Quick Toolbar */}
      {!readOnly && <div className="mt-2 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-wrap items-center gap-2 text-[0.625rem] text-slate-400 bg-slate-900/90 dark:bg-slate-950/90 border border-slate-800 rounded-lg p-1.5 shadow-md">
        <span className="font-mono truncate max-w-28 text-slate-300">{image.name}</span>
        <input
          aria-label={`Image width ${image.name}`}
          type="range"
          min={15}
          max={100}
          step={5}
          value={image.widthPercent}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onUpdate({ widthPercent: Number(event.target.value) })}
          className="w-20 accent-blue-500"
        />
        <span className="font-mono">{image.widthPercent}%</span>

        <button
          type="button"
          onClick={() => onUpdate({ placement: 'block', alignment: 'left', wrapMode: 'inline' })}
          className={`p-1 rounded ${image.alignment === 'left' && wrapSelection.inlineBlock ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-800'}`}
          aria-label="Block · Links" title="Block · Links"
          aria-pressed={image.alignment === 'left' && wrapSelection.inlineBlock}
        >
          <AlignLeft className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ placement: 'block', alignment: 'center', wrapMode: 'inline' })}
          className={`p-1 rounded ${image.alignment === 'center' && wrapSelection.inlineBlock ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-800'}`}
          aria-label="Block · Zentriert" title="Block · Zentriert"
          aria-pressed={image.alignment === 'center' && wrapSelection.inlineBlock}
        >
          <AlignCenter className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ placement: 'block', alignment: 'right', wrapMode: 'inline' })}
          className={`p-1 rounded ${image.alignment === 'right' && wrapSelection.inlineBlock ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-800'}`}
          aria-label="Block · Rechts" title="Block · Rechts"
          aria-pressed={image.alignment === 'right' && wrapSelection.inlineBlock}
        >
          <AlignRight className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ placement: 'float-left', alignment: 'left', wrapMode: 'square' })}
          className={`px-1.5 py-0.5 rounded text-[0.625rem] ${wrapSelection.wrapped && !wrapSelection.wrappedRight ? 'bg-violet-500/20 text-violet-400 font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          aria-pressed={wrapSelection.wrapped && !wrapSelection.wrappedRight}
        >
          Wrap L
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ placement: 'float-right', alignment: 'right', wrapMode: 'square' })}
          className={`px-1.5 py-0.5 rounded text-[0.625rem] ${wrapSelection.wrappedRight ? 'bg-violet-500/20 text-violet-400 font-semibold' : 'hover:bg-slate-800 text-slate-400'}`}
          aria-pressed={wrapSelection.wrappedRight}
        >
          Wrap R
        </button>

        {onOpenProperties && (
          <button
            type="button"
            onClick={() => onOpenProperties(image)}
            className="p-1 rounded text-slate-300 hover:text-blue-400 hover:bg-slate-800"
            aria-label="Bildeigenschaften öffnen" title="Bildeigenschaften öffnen"
          >
            <Sliders className="w-3 h-3" />
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-red-400 hover:bg-red-500/10 rounded ml-auto"
          aria-label="Bild entfernen" title="Bild entfernen"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>}
    </figure>
  );
};
