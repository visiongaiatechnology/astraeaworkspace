// STATUS: DIAMANT VGT SUPREME — Sovereign Image Properties Modal Orchestrator
import React, { useEffect, useState } from 'react';
import { X, Sliders, Crop, Layers, Sparkles, Check } from 'lucide-react';
import type {
  WriterImageBlockData,
  WriterTextWrapMode,
  WriterAnchorTarget,
  WriterMediaCrop,
  WriterMediaAdjustments,
} from '../../../../shared/contracts/workspace';
import {
  ImageWrapTab,
  ImageTransformTab,
  ImageAdjustmentsTab,
  ImageCaptionTab,
} from './WriterImageModalTabs';
// W-065: the dialog is where the alt text is written, so the rule has to be visible here and not only
// on the import path. One rule, one message, shared with the insert path.
import {
  resolveWriterImageWrapMode,
  validateWriterImageAltText,
  validateWriterImageCaption,
} from './operations/writerImageBoundary';

interface WriterImagePropertiesModalProps {
  isOpen: boolean;
  image: WriterImageBlockData | null;
  onClose: () => void;
  onApply: (imageId: string, patch: Partial<WriterImageBlockData>) => void;
}

type TabType = 'wrap' | 'transform' | 'adjustments' | 'caption';

export const WriterImagePropertiesModal: React.FC<WriterImagePropertiesModalProps> = ({
  isOpen,
  image,
  onClose,
  onApply,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('wrap');

  const [wrapMode, setWrapMode] = useState<WriterTextWrapMode>('inline');
  const [anchorTarget, setAnchorTarget] = useState<WriterAnchorTarget>('paragraph');
  const [anchorColumnIndex, setAnchorColumnIndex] = useState(1);
  const [anchorCharacterOffset, setAnchorCharacterOffset] = useState(0);
  const [horizontalOffsetMm, setHorizontalOffsetMm] = useState(0);
  const [verticalOffsetMm, setVerticalOffsetMm] = useState(0);
  const [moveWithText, setMoveWithText] = useState(true);
  const [fixPositionOnPage, setFixPositionOnPage] = useState(false);
  const [wrapTopMm, setWrapTopMm] = useState(3);
  const [wrapBottomMm, setWrapBottomMm] = useState(3);
  const [wrapLeftMm, setWrapLeftMm] = useState(4);
  const [wrapRightMm, setWrapRightMm] = useState(4);
  const [crop, setCrop] = useState<WriterMediaCrop>({ topPercent: 0, rightPercent: 0, bottomPercent: 0, leftPercent: 0 });
  const [rotationDeg, setRotationDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [opacity, setOpacity] = useState(1.0);
  const [adjustments, setAdjustments] = useState<WriterMediaAdjustments>({
    brightness: 0, contrast: 0, saturation: 0, grayscale: false, sepia: false, invert: false,
  });
  const [caption, setCaption] = useState('');
  const [captionPosition, setCaptionPosition] = useState<'above' | 'below'>('below');
  const [altText, setAltText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !image) return;
    setActiveTab('wrap');
    setTextError(null);
    setWrapMode(resolveWriterImageWrapMode(image));
    setAnchorTarget(image.anchorTarget ?? 'paragraph');
    setAnchorColumnIndex(Math.max(1, Math.min(12, Math.trunc(image.anchorColumnIndex ?? 1))));
    setAnchorCharacterOffset(Math.max(0, Math.trunc(image.anchorCharacterOffset ?? 0)));
    setHorizontalOffsetMm(Math.max(-1000, Math.min(1000, image.horizontalOffsetMm ?? 0)));
    setVerticalOffsetMm(Math.max(-1000, Math.min(1000, image.verticalOffsetMm ?? 0)));
    setMoveWithText(image.moveWithText ?? true);
    setFixPositionOnPage(image.fixPositionOnPage ?? false);
    setWrapTopMm(image.wrapDistanceTopMm ?? 3);
    setWrapBottomMm(image.wrapDistanceBottomMm ?? 3);
    setWrapLeftMm(image.wrapDistanceLeftMm ?? 4);
    setWrapRightMm(image.wrapDistanceRightMm ?? 4);
    setCrop(image.crop ?? { topPercent: 0, rightPercent: 0, bottomPercent: 0, leftPercent: 0 });
    setRotationDeg(image.rotationDeg ?? 0);
    setFlipH(image.flipHorizontal ?? false);
    setFlipV(image.flipVertical ?? false);
    setOpacity(image.opacity ?? 1.0);
    setAdjustments(image.adjustments ?? {
      brightness: 0, contrast: 0, saturation: 0, grayscale: false, sepia: false, invert: false,
    });
    setCaption(image.caption ?? '');
    setCaptionPosition(image.captionPosition ?? 'below');
    setAltText(image.altText ?? '');
  }, [image, isOpen]);

  if (!isOpen || !image) return null;

  const handleResetAdjustments = () => {
    setAdjustments({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      grayscale: false,
      sepia: false,
      invert: false,
    });
  };

  const handleSave = () => {
    // W-065: both text fields are checked **before** the patch is applied. The dialog stays open and
    // names the rule, instead of storing a description nobody can read or silently cutting it off.
    const altVerdict = validateWriterImageAltText(altText);
    const captionVerdict = validateWriterImageCaption(caption);
    if (!altVerdict.ok) {
      setTextError(altVerdict.message);
      setActiveTab('caption');
      return;
    }
    if (!captionVerdict.ok) {
      setTextError(captionVerdict.message);
      setActiveTab('caption');
      return;
    }
    setTextError(null);
    onApply(image.id, {
      wrapMode,
      anchorTarget,
      anchorColumnIndex,
      anchorCharacterOffset,
      horizontalOffsetMm,
      verticalOffsetMm,
      moveWithText,
      fixPositionOnPage,
      wrapDistanceTopMm: wrapTopMm,
      wrapDistanceBottomMm: wrapBottomMm,
      wrapDistanceLeftMm: wrapLeftMm,
      wrapDistanceRightMm: wrapRightMm,
      crop,
      rotationDeg,
      flipHorizontal: flipH,
      flipVertical: flipV,
      opacity,
      adjustments,
      caption: captionVerdict.value,
      captionPosition,
      altText: altVerdict.value,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <Sliders className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Bildeigenschaften & Effekte</h2>
          </div>
          <button aria-label="Close Bildeigenschaften & Effekte dialog"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-6 pt-3 border-b border-slate-800 bg-slate-900/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('wrap')}
            className={`px-3 py-2 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === 'wrap' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Text Wrap & Position</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transform')}
            className={`px-3 py-2 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === 'transform' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Zuschneiden & Drehung</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('adjustments')}
            className={`px-3 py-2 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === 'adjustments' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bildkorrekturen</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('caption')}
            className={`px-3 py-2 border-b-2 font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === 'caption' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Beschriftung</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-5 text-xs">
          {activeTab === 'wrap' && (
            <ImageWrapTab
              wrapMode={wrapMode} setWrapMode={setWrapMode}
              anchorTarget={anchorTarget} setAnchorTarget={(target) => {
                setAnchorTarget(target);
                const fixedTarget = target === 'page' || target === 'margin' || target === 'column';
                setFixPositionOnPage(fixedTarget);
                setMoveWithText(!fixedTarget);
              }}
              anchorColumnIndex={anchorColumnIndex} setAnchorColumnIndex={setAnchorColumnIndex}
              anchorCharacterOffset={anchorCharacterOffset} setAnchorCharacterOffset={setAnchorCharacterOffset}
              horizontalOffsetMm={horizontalOffsetMm} setHorizontalOffsetMm={setHorizontalOffsetMm}
              verticalOffsetMm={verticalOffsetMm} setVerticalOffsetMm={setVerticalOffsetMm}
              moveWithText={moveWithText} setMoveWithText={(value) => {
                setMoveWithText(value);
                setFixPositionOnPage(!value);
                if (value && (anchorTarget === 'page' || anchorTarget === 'margin' || anchorTarget === 'column')) setAnchorTarget('paragraph');
                if (!value && (anchorTarget === 'paragraph' || anchorTarget === 'character')) setAnchorTarget('page');
              }}
              fixPositionOnPage={fixPositionOnPage} setFixPositionOnPage={(value) => { setFixPositionOnPage(value); if (value) { setMoveWithText(false); if (anchorTarget === 'paragraph' || anchorTarget === 'character') setAnchorTarget('page'); } }}
              wrapTopMm={wrapTopMm} setWrapTopMm={setWrapTopMm}
              wrapBottomMm={wrapBottomMm} setWrapBottomMm={setWrapBottomMm}
              wrapLeftMm={wrapLeftMm} setWrapLeftMm={setWrapLeftMm}
              wrapRightMm={wrapRightMm} setWrapRightMm={setWrapRightMm}
            />
          )}
          {activeTab === 'transform' && (
            <ImageTransformTab
              crop={crop} setCrop={setCrop}
              rotationDeg={rotationDeg} setRotationDeg={setRotationDeg}
              flipH={flipH} setFlipH={setFlipH}
              flipV={flipV} setFlipV={setFlipV}
              opacity={opacity} setOpacity={setOpacity}
            />
          )}
          {activeTab === 'adjustments' && (
            <ImageAdjustmentsTab
              adjustments={adjustments}
              setAdjustments={setAdjustments}
              onReset={handleResetAdjustments}
            />
          )}
          {activeTab === 'caption' && (
            <ImageCaptionTab
              caption={caption} setCaption={setCaption}
              captionPosition={captionPosition} setCaptionPosition={setCaptionPosition}
              altText={altText} setAltText={setAltText}
              error={textError}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          {textError === null ? null : (
            <p role="alert" className="mr-auto text-[0.6875rem] text-red-400">{textError}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-blue-500/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Übernehmen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
