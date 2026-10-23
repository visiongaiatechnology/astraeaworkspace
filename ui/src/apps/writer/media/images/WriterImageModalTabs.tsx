// STATUS: DIAMANT VGT SUPREME — Modular Image Properties Tabs (Wrap, Transform, Adjustments, Caption)
import React from 'react';
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical } from 'lucide-react';
import type {
  WriterTextWrapMode,
  WriterAnchorTarget,
  WriterMediaCrop,
  WriterMediaAdjustments,
} from '../../../../shared/contracts/workspace';
import { resolveImageFilters } from './operations/writerMediaOperations';
import {
  WRITER_IMAGE_MAX_ALT_TEXT_LENGTH,
  WRITER_IMAGE_MAX_CAPTION_LENGTH,
} from './operations/writerImageBoundary';

export interface WrapTabProps {
  wrapMode: WriterTextWrapMode;
  setWrapMode: (mode: WriterTextWrapMode) => void;
  anchorTarget: WriterAnchorTarget;
  setAnchorTarget: (target: WriterAnchorTarget) => void;
  anchorColumnIndex: number;
  setAnchorColumnIndex: (value: number) => void;
  anchorCharacterOffset: number;
  setAnchorCharacterOffset: (value: number) => void;
  horizontalOffsetMm: number;
  setHorizontalOffsetMm: (value: number) => void;
  verticalOffsetMm: number;
  setVerticalOffsetMm: (value: number) => void;
  moveWithText: boolean;
  setMoveWithText: (val: boolean) => void;
  fixPositionOnPage: boolean;
  setFixPositionOnPage: (val: boolean) => void;
  wrapTopMm: number;
  setWrapTopMm: (val: number) => void;
  wrapBottomMm: number;
  setWrapBottomMm: (val: number) => void;
  wrapLeftMm: number;
  setWrapLeftMm: (val: number) => void;
  wrapRightMm: number;
  setWrapRightMm: (val: number) => void;
}

export const ImageWrapTab: React.FC<WrapTabProps> = ({
  wrapMode, setWrapMode,
  anchorTarget, setAnchorTarget,
  anchorColumnIndex, setAnchorColumnIndex,
  anchorCharacterOffset, setAnchorCharacterOffset,
  horizontalOffsetMm, setHorizontalOffsetMm,
  verticalOffsetMm, setVerticalOffsetMm,
  moveWithText, setMoveWithText,
  fixPositionOnPage, setFixPositionOnPage,
  wrapTopMm, setWrapTopMm,
  wrapBottomMm, setWrapBottomMm,
  wrapLeftMm, setWrapLeftMm,
  wrapRightMm, setWrapRightMm,
}) => (
  <div className="space-y-4">
    <div>
      <label className="font-semibold text-slate-300 block mb-2">Textumbruch (Wrap Mode)</label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { id: 'inline', label: 'In Zeile mit Text', desc: 'Fließt mit Text' },
          { id: 'square', label: 'Rechteck (Square)', desc: 'Umfließt Kanten' },
          { id: 'tight', label: 'Eng (Tight)', desc: 'Folgt Kontur' },
          { id: 'through', label: 'Transparent', desc: 'Durchlaufend' },
          { id: 'top-bottom', label: 'Oben und Unten', desc: 'Kein seitlicher Text' },
          { id: 'behind-text', label: 'Hinter den Text', desc: 'Wasserzeichen-Layer' },
          { id: 'in-front-of-text', label: 'Vor den Text', desc: 'Vordergrund-Layer' },
        ].map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setWrapMode(mode.id as WriterTextWrapMode)}
            className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
              wrapMode === mode.id
                ? 'border-blue-500 bg-blue-500/10 text-white shadow-sm'
                : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="font-semibold text-xs text-slate-200">{mode.label}</span>
            <span className="text-[0.625rem] text-slate-500 mt-1">{mode.desc}</span>
          </button>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
      <div>
        <label className="font-semibold text-slate-300 block mb-1.5">Verankerung (Anchor)</label>
        <select
          value={anchorTarget}
          onChange={(e) => setAnchorTarget(e.target.value as WriterAnchorTarget)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
        >
          <option value="paragraph">Am Absatz verankern</option>
          <option value="page">An der Seite verankern</option>
          <option value="margin">Am Seitenrand verankern</option>
          <option value="column">An einer Spalte verankern</option>
          <option value="character">Am Zeichen verankern</option>
        </select>
      </div>

      <div className="space-y-2 pt-1">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={moveWithText}
            onChange={(e) => setMoveWithText(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
          />
          <span>Mit Text verschieben</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={fixPositionOnPage}
            onChange={(e) => setFixPositionOnPage(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
          />
          <span>Position auf Seite fixieren</span>
        </label>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
      <label className="text-[0.625rem] text-slate-400">X-Offset (mm)
        <input type="number" min={-1000} max={1000} step={0.5} value={horizontalOffsetMm}
          onChange={(e) => setHorizontalOffsetMm(Math.max(-1000, Math.min(1000, Number(e.target.value))))}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono" />
      </label>
      <label className="text-[0.625rem] text-slate-400">Y-Offset (mm)
        <input type="number" min={-1000} max={1000} step={0.5} value={verticalOffsetMm}
          onChange={(e) => setVerticalOffsetMm(Math.max(-1000, Math.min(1000, Number(e.target.value))))}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono" />
      </label>
      {anchorTarget === 'column' && <label className="text-[0.625rem] text-slate-400">Spalte
        <input type="number" min={1} max={12} value={anchorColumnIndex}
          onChange={(e) => setAnchorColumnIndex(Math.max(1, Math.min(12, Math.trunc(Number(e.target.value)) || 1)))}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono" />
      </label>}
      {anchorTarget === 'character' && <label className="text-[0.625rem] text-slate-400">Zeichenoffset
        <input type="number" min={0} max={1000000} value={anchorCharacterOffset}
          onChange={(e) => setAnchorCharacterOffset(Math.max(0, Math.min(1000000, Math.trunc(Number(e.target.value)) || 0)))}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono" />
      </label>}
    </div>

    <div className="pt-2 border-t border-slate-800">
      <label className="font-semibold text-slate-300 block mb-2">Abstand zum Text (mm)</label>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <span className="text-[0.625rem] text-slate-400">Oben</span>
          <input
            type="number"
            min={0}
            max={50}
            value={wrapTopMm}
            onChange={(e) => setWrapTopMm(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono"
          />
        </div>
        <div>
          <span className="text-[0.625rem] text-slate-400">Unten</span>
          <input
            type="number"
            min={0}
            max={50}
            value={wrapBottomMm}
            onChange={(e) => setWrapBottomMm(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono"
          />
        </div>
        <div>
          <span className="text-[0.625rem] text-slate-400">Links</span>
          <input
            type="number"
            min={0}
            max={50}
            value={wrapLeftMm}
            onChange={(e) => setWrapLeftMm(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono"
          />
        </div>
        <div>
          <span className="text-[0.625rem] text-slate-400">Rechts</span>
          <input
            type="number"
            min={0}
            max={50}
            value={wrapRightMm}
            onChange={(e) => setWrapRightMm(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono"
          />
        </div>
      </div>
    </div>
  </div>
);

export interface TransformTabProps {
  crop: WriterMediaCrop;
  setCrop: (crop: WriterMediaCrop) => void;
  rotationDeg: number;
  setRotationDeg: (deg: number) => void;
  flipH: boolean;
  setFlipH: (val: boolean) => void;
  flipV: boolean;
  setFlipV: (val: boolean) => void;
  opacity: number;
  setOpacity: (val: number) => void;
}

export const ImageTransformTab: React.FC<TransformTabProps> = ({
  crop, setCrop,
  rotationDeg, setRotationDeg,
  flipH, setFlipH,
  flipV, setFlipV,
  opacity, setOpacity,
}) => (
  <div className="space-y-4">
    <div>
      <label className="font-semibold text-slate-300 block mb-2">Zuschneiden (Crop %)</label>
      <div className="grid grid-cols-4 gap-2">
        {(['topPercent', 'bottomPercent', 'leftPercent', 'rightPercent'] as const).map((side) => (
          <div key={side}>
            <span className="text-[0.625rem] text-slate-400 capitalize">{side.replace('Percent', '')}</span>
            <input
              type="number"
              min={0}
              max={80}
              value={crop[side]}
              onChange={(e) => setCrop({ ...crop, [side]: Math.max(0, Math.min(80, Number(e.target.value))) })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono"
            />
          </div>
        ))}
      </div>
    </div>

    <div className="pt-2 border-t border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <label className="font-semibold text-slate-300">Rotation: {rotationDeg}°</label>
        <button
          type="button"
          onClick={() => setRotationDeg((rotationDeg + 90) % 360)}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1"
        >
          <RotateCw className="w-3 h-3" />
          <span>+90°</span>
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={rotationDeg}
        onChange={(e) => setRotationDeg(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>

    <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-4">
      <div>
        <label className="font-semibold text-slate-300 block mb-2">Spiegelung</label>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setFlipH(!flipH)}
            className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 transition-colors ${
              flipH ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span>Horizontal</span>
          </button>
          <button
            type="button"
            onClick={() => setFlipV(!flipV)}
            className={`px-3 py-1.5 rounded-lg border flex items-center space-x-1.5 transition-colors ${
              flipV ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            <FlipVertical className="w-3.5 h-3.5" />
            <span>Vertikal</span>
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="font-semibold text-slate-300">Deckkraft (Opacity)</label>
          <span className="font-mono text-slate-400">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={1.0}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>
    </div>
  </div>
);

export interface AdjustmentsTabProps {
  adjustments: WriterMediaAdjustments;
  setAdjustments: (adj: WriterMediaAdjustments) => void;
  onReset: () => void;
}

export const ImageAdjustmentsTab: React.FC<AdjustmentsTabProps> = ({
  adjustments,
  setAdjustments,
  onReset,
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <span className="text-slate-400">Nicht-destruktive Bildfilter im DOM/WOM</span>
      <button
        type="button"
        onClick={onReset}
        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1 text-xs"
      >
        <RotateCcw className="w-3 h-3" />
        <span>Zurücksetzen</span>
      </button>
    </div>

    <div className="space-y-3">
      <div>
        <div className="flex justify-between mb-1">
          <span>Helligkeit (Brightness)</span>
          <span className="font-mono text-slate-400">{adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={adjustments.brightness}
          onChange={(e) => setAdjustments({ ...adjustments, brightness: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <span>Kontrast (Contrast)</span>
          <span className="font-mono text-slate-400">{adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={adjustments.contrast}
          onChange={(e) => setAdjustments({ ...adjustments, contrast: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <span>Sättigung (Saturation)</span>
          <span className="font-mono text-slate-400">{adjustments.saturation > 0 ? `+${adjustments.saturation}` : adjustments.saturation}</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={adjustments.saturation}
          onChange={(e) => setAdjustments({ ...adjustments, saturation: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </div>
    </div>

    <div className="pt-2 border-t border-slate-800 flex items-center space-x-4">
      <label className="flex items-center space-x-2 cursor-pointer">
        <input
          type="checkbox"
          checked={adjustments.grayscale}
          onChange={(e) => setAdjustments({ ...adjustments, grayscale: e.target.checked })}
          className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
        />
        <span>Graustufen</span>
      </label>
      <label className="flex items-center space-x-2 cursor-pointer">
        <input
          type="checkbox"
          checked={adjustments.sepia}
          onChange={(e) => setAdjustments({ ...adjustments, sepia: e.target.checked })}
          className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
        />
        <span>Sepia</span>
      </label>
      <label className="flex items-center space-x-2 cursor-pointer">
        <input
          type="checkbox"
          checked={adjustments.invert}
          onChange={(e) => setAdjustments({ ...adjustments, invert: e.target.checked })}
          className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0"
        />
        <span>Invertieren</span>
      </label>
    </div>

    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[0.6875rem] text-slate-400">
      Filter-CSS: <code className="text-blue-400 font-mono">{resolveImageFilters(adjustments)}</code>
    </div>
  </div>
);

export interface CaptionTabProps {
  caption: string;
  setCaption: (val: string) => void;
  captionPosition: 'above' | 'below';
  setCaptionPosition: (val: 'above' | 'below') => void;
  altText: string;
  setAltText: (val: string) => void;
  /** W-065: the rule the two text fields are held to, shown where the text is typed. */
  error?: string | null;
}

export const ImageCaptionTab: React.FC<CaptionTabProps> = ({
  caption, setCaption,
  captionPosition, setCaptionPosition,
  altText, setAltText,
  error = null,
}) => (
  <div className="space-y-4">
    <div>
      <label className="font-semibold text-slate-300 block mb-1">Bildbeschriftung (Caption)</label>
      <input
        type="text"
        value={caption}
        maxLength={WRITER_IMAGE_MAX_CAPTION_LENGTH}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="z.B. Architekturübersicht des Systems"
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
      />
    </div>

    <div>
      <label className="font-semibold text-slate-300 block mb-1.5">Position der Beschriftung</label>
      <div className="flex items-center space-x-3">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            name="captionPos"
            checked={captionPosition === 'below'}
            onChange={() => setCaptionPosition('below')}
            className="text-blue-500 bg-slate-950 border-slate-700"
          />
          <span>Unterhalb der Abbildung (Standard)</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            name="captionPos"
            checked={captionPosition === 'above'}
            onChange={() => setCaptionPosition('above')}
            className="text-blue-500 bg-slate-950 border-slate-700"
          />
          <span>Oberhalb der Abbildung</span>
        </label>
      </div>
    </div>

    <div className="pt-2 border-t border-slate-800">
      <label className="font-semibold text-slate-300 block mb-1">Barrierefreiheit: Alt-Text</label>
      <input
        type="text"
        value={altText}
        maxLength={WRITER_IMAGE_MAX_ALT_TEXT_LENGTH}
        aria-describedby="writer-image-alt-text-hint"
        onChange={(e) => setAltText(e.target.value)}
        placeholder="Beschreibender Alternativtext für Screenreader"
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
      />
      <p id="writer-image-alt-text-hint" className="mt-1 text-[0.6875rem] text-slate-500">
        Höchstens {WRITER_IMAGE_MAX_ALT_TEXT_LENGTH} Zeichen. Leer lassen ist erlaubt; der Dateiname des
        Imports wird sonst als Beschreibung verwendet.
      </p>
      {error === null ? null : (
        <p role="alert" className="mt-1 text-[0.6875rem] text-red-400">{error}</p>
      )}
    </div>
  </div>
);
