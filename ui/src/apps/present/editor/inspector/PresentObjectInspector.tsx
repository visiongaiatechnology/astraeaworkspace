import React, { useState } from 'react';
import { PresentSceneObject, PresentImageObject } from '../../../../shared/contracts/workspace';
import {
  alignPresentObjectToSlide,
  distributePresentObjects,
} from '../../canvas/model/presentScene';
import { PresentWidgetInspector } from './PresentWidgetInspector';
import { PresentObjectStylePanel } from './PresentObjectStylePanel';
import { PresentObjectAnimationPanel } from './PresentObjectAnimationPanel';
import type { PresentEditorCommand } from '../presentEditorCommands';
import { presentLinkSummary, presentObjectLink, validatePresentLinkTarget, type PresentLinkTarget, type PresentLinkValidation } from '../../canvas/model/presentHyperlinks';
import { auditPresentContrast } from '../../canvas/model/presentAccessibility';
import type { PresentTextFormatPatch } from '../../canvas/model/presentTextFormat';
import {
  PRESENT_FONT_SIZE_MAX_PT,
  PRESENT_FONT_SIZE_MIN_PT,
  PRESENT_LINE_HEIGHT_MAX,
  PRESENT_LINE_HEIGHT_MIN,
} from '../../canvas/model/presentTextFormat';
import {
  PRESENT_MAX_ALT_TEXT_LENGTH,
  PRESENT_MAX_CROP_INSET_PERCENT,
  PRESENT_MAX_LINK_URL_LENGTH,
  readPresentAltText,
  readPresentImageCrop,
  readPresentTextStyle,
  withPresentAltText,
  withPresentImageCrop,
} from '../../canvas/model/presentObjectExtensions';
import {
  PRESENT_TABLE_MAX_CELL_LENGTH,
  PRESENT_TABLE_MAX_COLUMNS,
  PRESENT_TABLE_MAX_ROWS,
  PRESENT_TABLE_MIN_COLUMNS,
  PRESENT_TABLE_MIN_ROWS,
  appendPresentTableColumn,
  appendPresentTableRow,
  removePresentTableColumn,
  removePresentTableRow,
  stretchPresentObjectToSlide,
} from '../../canvas/model/presentTable';
import {
  PRESENT_CHART_LEGEND_POSITIONS,
  PRESENT_CHART_MAX_CATEGORIES,
  PRESENT_CHART_MAX_SERIES,
  PRESENT_CHART_TYPES,
  appendPresentChartCategory,
  appendPresentChartSeries,
  applyPresentChartOptions,
  removePresentChartCategory,
  removePresentChartSeries,
  setPresentChartCategory,
  setPresentChartSeriesName,
  setPresentChartValue,
} from '../../canvas/model/presentChartData';
import type { ChartLegendPosition, ChartType } from '../../../../shared/contracts/workspace';
import {
  X,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  RotateCw,
  Group,
  Ungroup,
  FlipHorizontal2,
  FlipVertical2,
} from 'lucide-react';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PRESENT_OFFICE_COPY } from '../../locale/presentOfficeLocale';
import { PRESENT_WORKFLOW_COPY } from '../../locale/presentWorkflowLocale';

interface PresentObjectInspectorProps {
  selectedObject: PresentSceneObject | null;
  selectedImage: PresentImageObject | null;
  allObjects: PresentSceneObject[];
  /** The whole selection: align/distribute act on these, not on "all objects on the slide". */
  selectedObjectIds?: readonly string[];
  selectionSize?: number;
  onPatchObject: (id: string, patch: Partial<PresentSceneObject>) => void;
  /**
   * Round 42 (style freeze): immediate document-free preview of a draft style. The panel debounces
   * the real commit; the canvas applies this lightweight override while the user drags.
   */
  onPreviewObjectStyle?: (id: string, style: import('../../contracts/presentStyle').PresentObjectStyle | null) => void;
  /** Round 42 (animations discoverability): the selected object's animations + existing engine. */
  animations?: import('../../../../shared/contracts/workspace').PresentAnimation[];
  onUpdateAnimations?: (animations: import('../../../../shared/contracts/workspace').PresentAnimation[]) => void;
  onPreviewAnimation?: (animation: import('../../../../shared/contracts/workspace').PresentAnimation | null) => void;
  onPatchImage: (id: string, patch: Partial<PresentImageObject>) => void;
  onUpdateAllObjects: (objects: PresentSceneObject[]) => void;
  onCommand?: (command: PresentEditorCommand) => void;
  /** Applies a text format to the whole visible selection through the pure formatting rule. */
  onApplyTextFormat?: (patch: PresentTextFormatPatch) => void;
  /**
   * Applies a pure table result. The inspector never writes a table directly: the pure rule decides
   * what is legal and its message is shown to the user.
   */
  onPatchTableResult?: (mutate: () => import('../../canvas/model/presentTable').PresentTableResult) => void;
  /** Applies a pure chart result (same contract as the table result). */
  onPatchChartResult?: (mutate: () => import('../../canvas/model/presentChartData').PresentChartResult) => void;
  /** Reports the outcome of a hyperlink edit (Paket 28); the caller commits or shows the refusal. */
  onLinkResult?: (validation: PresentLinkValidation, objectId: string) => void;
  /** Deck slides for the internal-navigation picker, in deck order. */
  linkSlides?: ReadonlyArray<{ id: string; title: string }>;
  /** Slide index by id, for the human-readable link summary. */
  slideIndexById?: ReadonlyMap<string, number>;
  /** Background the contrast check compares text against (Paket 29). */
  slideBackground?: string;
  onClose: () => void;
}

export const PresentObjectInspector: React.FC<PresentObjectInspectorProps> = ({
  selectedObject,
  selectedImage,
  allObjects,
  selectedObjectIds = [],
  selectionSize = selectedObject ? 1 : 0,
  onPatchObject,
  onPatchImage,
  onUpdateAllObjects,
  onCommand,
  onApplyTextFormat,
  onPatchTableResult,
  onPatchChartResult,
  onLinkResult,
  linkSlides,
  slideIndexById,
  slideBackground = '#0c1222',
  animations = [],
  onUpdateAnimations,
  onPreviewAnimation,
  onPreviewObjectStyle,
  onClose,
}) => {
  const [linkDraft, setLinkDraft] = useState<{ kind: 'slide' | 'url' | 'document'; value: string }>({ kind: 'slide', value: '' });
  const { locale } = useWorkspaceLocale();
  const workspaceIntegrationCopy = PRESENT_OFFICE_COPY[locale].workspaceIntegration;
  const workspaceWorkflowCopy = PRESENT_WORKFLOW_COPY[locale].workspace;
  if (!selectedObject && !selectedImage) {
    return (
      <div className="w-64 bg-slate-950/95 border-l border-white/[0.08] p-4 flex flex-col justify-between shrink-0 select-none text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <span className="font-bold text-slate-400 uppercase tracking-wider text-[0.625rem]">Inspector</span>
          <button aria-label="Close presentation object inspector panel" type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-center text-slate-500 my-auto text-[0.6875rem]">
          Select any object or image on the slide canvas to inspect and edit its properties.
        </div>
      </div>
    );
  }

  const isImage = Boolean(selectedImage);
  const target = selectedObject || selectedImage!;

  /** Contrast finding for the selected text object against the slide background (Paket 29). */
  const contrastFinding = selectedObject?.kind === 'text'
    ? auditPresentContrast([selectedObject as unknown as Parameters<typeof auditPresentContrast>[0][number]], slideBackground)[0] ?? null
    : null;

  const handleAlign = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const ids = selectedObjectIds.length ? [...selectedObjectIds] : selectedObject ? [selectedObject.id] : [];
    if (!ids.length) return;
    const wanted = new Set(ids);
    onUpdateAllObjects(
      allObjects.map((object) =>
        wanted.has(object.id) && !object.locked ? alignPresentObjectToSlide(object, alignment) : object,
      ),
    );
  };

  const handleDistribute = (dir: 'horizontal' | 'vertical') => {
    const ids = selectedObjectIds.length ? [...selectedObjectIds] : allObjects.map((o) => o.id);
    onUpdateAllObjects(distributePresentObjects(allObjects, ids, dir));
  };

  return (
    <div className="w-64 bg-slate-950 border-l border-white/[0.08] flex flex-col shrink-0 select-none text-xs overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <span className="font-bold text-cyan-400 uppercase tracking-wider text-[0.625rem]">
          {isImage
            ? 'Image Inspector'
            : selectedObject?.kind === 'workspace'
              ? workspaceIntegrationCopy.inspector.workspaceProperties
              : `${selectedObject?.kind ? selectedObject.kind.toUpperCase() : 'Object'} Properties`}
        </span>
        <span className="flex items-center gap-2">
          {selectionSize > 1 && (
            <span data-present-inspector-selection="true" className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-cyan-200">
              {selectionSize} selected
            </span>
          )}
          <button aria-label="Close presentation object inspector panel" type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>

      <div className="p-3 space-y-4">
        {selectedImage && (
          <div className="space-y-1.5">
            <label className="block text-[0.625rem] font-mono text-slate-400 uppercase">Alternative text
              <textarea
                value={selectedImage.altText ?? ''}
                maxLength={2000}
                onChange={(event) => onPatchImage(selectedImage.id, { altText: event.target.value.slice(0, 2000) })}
                placeholder="Describe the meaningful visual content"
                className="mt-1 min-h-16 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.6875rem] font-sans normal-case text-slate-200"
              />
            </label>
          </div>
        )}
        {/* 1. Transform / Geometry */}
        <div className="space-y-2">
          <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Position & Size (%)</span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-400">
              <span>X:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round(target.xPercent)}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  if (isImage) onPatchImage(target.id, { xPercent: val });
                  else onPatchObject(target.id, { xPercent: val });
                }}
                className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
              />
            </label>
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-400">
              <span>Y:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round(target.yPercent)}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  if (isImage) onPatchImage(target.id, { yPercent: val });
                  else onPatchObject(target.id, { yPercent: val });
                }}
                className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
              />
            </label>
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-400">
              <span>W:</span>
              <input
                type="number"
                min="3"
                max="100"
                value={Math.round(target.widthPercent)}
                onChange={(e) => {
                  const val = Number(e.target.value) || 10;
                  if (isImage) onPatchImage(target.id, { widthPercent: val });
                  else onPatchObject(target.id, { widthPercent: val });
                }}
                className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
              />
            </label>
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-400">
              <span>H:</span>
              <input
                type="number"
                min="2"
                max="100"
                value={Math.round(target.heightPercent || 10)}
                onChange={(e) => {
                  const val = Number(e.target.value) || 10;
                  if (isImage) onPatchImage(target.id, { heightPercent: val });
                  else onPatchObject(target.id, { heightPercent: val });
                }}
                className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
              />
            </label>
          </div>
        </div>

        {/* 2. Rotation & Opacity */}
        <div className="space-y-2">
          <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Rotation & Opacity</span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-400">
              <RotateCw className="w-3 h-3" />
              <input
                type="number"
                min="-180"
                max="180"
                value={Math.round(target.rotation ?? 0)}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  if (isImage) onPatchImage(target.id, { rotation: val });
                  else onPatchObject(target.id, { rotation: val });
                }}
                className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
              />
              <span>°</span>
            </label>
            <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[0.6875rem] text-slate-400">
              <span>α:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round((target.opacity ?? 1) * 100)}
                onChange={(e) => {
                  const val = (Number(e.target.value) || 100) / 100;
                  if (isImage) onPatchImage(target.id, { opacity: val });
                  else onPatchObject(target.id, { opacity: val });
                }}
                className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
              />
              <span>%</span>
            </label>
          </div>
        </div>

        {/* 3. Alignment Controls */}
        {selectedObject && (
          <div className="space-y-1.5">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Align to Slide</span>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => handleAlign('left')}
                className="py-1 rounded bg-slate-900 border border-white/10 hover:bg-white/10 text-slate-300"
              >
                Left
              </button>
              <button
                type="button"
                onClick={() => handleAlign('center')}
                className="py-1 rounded bg-slate-900 border border-white/10 hover:bg-white/10 text-slate-300"
              >
                Center
              </button>
              <button
                type="button"
                onClick={() => handleAlign('right')}
                className="py-1 rounded bg-slate-900 border border-white/10 hover:bg-white/10 text-slate-300"
              >
                Right
              </button>
              <button
                type="button"
                onClick={() => handleAlign('top')}
                className="py-1 rounded bg-slate-900 border border-white/10 hover:bg-white/10 text-slate-300"
              >
                Top
              </button>
              <button
                type="button"
                onClick={() => handleAlign('middle')}
                className="py-1 rounded bg-slate-900 border border-white/10 hover:bg-white/10 text-slate-300"
              >
                Middle
              </button>
              <button
                type="button"
                onClick={() => handleAlign('bottom')}
                className="py-1 rounded bg-slate-900 border border-white/10 hover:bg-white/10 text-slate-300"
              >
                Bottom
              </button>
            </div>
            {selectionSize >= 3 && (
              <div className="grid grid-cols-2 gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => handleDistribute('horizontal')}
                  className="py-1 rounded bg-slate-900 border border-white/10 text-[0.625rem] text-slate-400 hover:text-white"
                >
                  Distribute H
                </button>
                <button
                  type="button"
                  onClick={() => handleDistribute('vertical')}
                  className="py-1 rounded bg-slate-900 border border-white/10 text-[0.625rem] text-slate-400 hover:text-white"
                >
                  Distribute V
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3b. Arrange: group / mirror / layer order. Same commands as the keyboard bindings. */}
        {selectedObject && (
          <div className="space-y-1.5 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Arrange</span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                disabled={selectionSize < 2}
                onClick={() => onCommand?.({ type: 'group' })}
                className="flex items-center justify-center gap-1 rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30"
              >
                <Group className="w-3 h-3" /> Group
              </button>
              <button
                type="button"
                onClick={() => onCommand?.({ type: 'ungroup' })}
                className="flex items-center justify-center gap-1 rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                <Ungroup className="w-3 h-3" /> Ungroup
              </button>
              <button
                type="button"
                onClick={() => onCommand?.({ type: 'flip', axis: 'x' })}
                className="flex items-center justify-center gap-1 rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                <FlipHorizontal2 className="w-3 h-3" /> Flip H
              </button>
              <button
                type="button"
                onClick={() => onCommand?.({ type: 'flip', axis: 'y' })}
                className="flex items-center justify-center gap-1 rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                <FlipVertical2 className="w-3 h-3" /> Flip V
              </button>
              <button
                type="button"
                onClick={() => onCommand?.({ type: 'layer', action: 'forward' })}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                Forward
              </button>
              <button
                type="button"
                onClick={() => onCommand?.({ type: 'layer', action: 'backward' })}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                Backward
              </button>
            </div>
          </div>
        )}

        {/* 3b. Round 41 (style system): additive Style/Background tabs for every scene object. */}
        {selectedObject && (
          <PresentObjectStylePanel object={selectedObject} onPatch={onPatchObject} onPreview={(style) => onPreviewObjectStyle?.(selectedObject.id, style)} />
        )}

        {/* 3c. Round 42: object animation (existing engine/presets, now findable per object). */}
        {selectedObject && onUpdateAnimations && (
          <PresentObjectAnimationPanel
            object={selectedObject}
            animations={animations ?? []}
            onUpdateAnimations={onUpdateAnimations}
            onPreviewAnimation={onPreviewAnimation}
          />
        )}

        {/* 4. Type Specific Controls */}
        {selectedObject?.kind === 'text' && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">
              Typography &amp; Color{selectionSize > 1 ? ` · applies to ${selectionSize} text objects` : ''}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center gap-1 rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem]">
                <span>Pt:</span>
                <input
                  type="number"
                  min={PRESENT_FONT_SIZE_MIN_PT}
                  max={PRESENT_FONT_SIZE_MAX_PT}
                  value={selectedObject.fontSizePt}
                  onChange={(e) => onApplyTextFormat?.({ fontSizePt: Number(e.target.value) })}
                  className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
                />
              </label>
              <select
                value={selectedObject.fontWeight || 'normal'}
                onChange={(e) => onApplyTextFormat?.({ fontWeight: e.target.value as 'normal' | 'semibold' | 'bold' })}
                className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-300 text-[0.6875rem]"
                aria-label="Font weight"
              >
                <option value="normal">Regular</option>
                <option value="semibold">Semibold</option>
                <option value="bold">Bold</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1 rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
                <span>Line:</span>
                <input
                  type="number"
                  step={0.05}
                  min={PRESENT_LINE_HEIGHT_MIN}
                  max={PRESENT_LINE_HEIGHT_MAX}
                  aria-label="Line spacing"
                  value={readPresentTextStyle(selectedObject).lineHeight ?? 1.2}
                  onChange={(e) => onApplyTextFormat?.({ lineHeight: Number(e.target.value) })}
                  className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
                />
              </label>
              <select
                value={selectedObject.textAlign || 'left'}
                onChange={(e) => onApplyTextFormat?.({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
                className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-300 text-[0.6875rem]"
                aria-label="Text alignment"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <label className="block space-y-1">
              <span className="text-[0.5625rem] text-slate-500">Font family (applies to the selection)</span>
              <input
                value={readPresentTextStyle(selectedObject).fontFamily ?? ''}
                placeholder="Theme default"
                maxLength={128}
                aria-label="Font family"
                onChange={(e) => onApplyTextFormat?.({ fontFamily: e.target.value })}
                className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none"
              />
            </label>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-between rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
                <span>Text Color</span>
                <input
                  type="color"
                  value={selectedObject.color}
                  onChange={(e) => onApplyTextFormat?.({ color: e.target.value })}
                  className="w-4 h-4 bg-transparent border-0 cursor-pointer"
                  aria-label="Text colour"
                />
              </label>
            </div>
          </div>
        )}

        {selectedImage && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Crop (mask, % of image)</span>
            <div className="grid grid-cols-2 gap-2">
              {([['Top', 'cropTop'], ['Right', 'cropRight'], ['Bottom', 'cropBottom'], ['Left', 'cropLeft']] as const).map(
                ([label, field]) => (
                  <label key={field} className="flex items-center gap-1 rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
                    <span>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={PRESENT_MAX_CROP_INSET_PERCENT}
                      step={1}
                      aria-label={`Crop ${label}`}
                      value={readPresentImageCrop(selectedImage)[field === 'cropTop' ? 'top' : field === 'cropRight' ? 'right' : field === 'cropBottom' ? 'bottom' : 'left']}
                      onChange={(e) => onPatchImage(selectedImage.id, withPresentImageCrop(selectedImage, { [field]: Number(e.target.value) }) as Partial<PresentImageObject>)}
                      className="w-full bg-transparent text-slate-200 outline-none text-right font-mono"
                    />
                  </label>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => onPatchImage(selectedImage.id, withPresentImageCrop(selectedImage, { cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 }) as Partial<PresentImageObject>)}
              className="w-full rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
            >
              Reset crop
            </button>
            <p className="text-[0.5625rem] leading-4 text-slate-500">
              Each inset is capped at {PRESENT_MAX_CROP_INSET_PERCENT} % and the two opposite insets can never
              hide the whole image; the crop is stored in the document and survives reopening.
            </p>
          </div>
        )}

        {selectedObject?.kind === 'shape' && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Shape Styling</span>
            <label className="flex items-center justify-between rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
              <span>Fill Color</span>
              <input
                type="color"
                aria-label="Shape fill colour"
                value={selectedObject.fillColor}
                onChange={(e) => onPatchObject(selectedObject.id, { fillColor: e.target.value })}
                className="w-4 h-4 bg-transparent border-0 cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
              <span>Stroke Color</span>
              <input
                type="color"
                aria-label="Shape stroke colour"
                value={selectedObject.strokeColor}
                onChange={(e) => onPatchObject(selectedObject.id, { strokeColor: e.target.value })}
                className="w-4 h-4 bg-transparent border-0 cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
              <span>Stroke (px)</span>
              <input
                type="number"
                aria-label="Shape stroke width in pixels"
                min="0"
                max="20"
                value={selectedObject.strokeWidth}
                onChange={(e) => onPatchObject(selectedObject.id, { strokeWidth: Number(e.target.value) || 0 })}
                className="w-12 bg-transparent text-right outline-none font-mono"
              />
            </label>
          </div>
        )}

        {selectedObject?.kind === 'table' && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">
              Table · {selectedObject.rows.length} × {selectedObject.columns.length}
            </span>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" disabled={selectedObject.rows.length >= PRESENT_TABLE_MAX_ROWS}
                onClick={() => onPatchTableResult?.(() => appendPresentTableRow(selectedObject))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30">
                + Row
              </button>
              <button type="button" disabled={selectedObject.rows.length <= PRESENT_TABLE_MIN_ROWS}
                onClick={() => onPatchTableResult?.(() => removePresentTableRow(selectedObject, selectedObject.rows.length - 1))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30">
                − Row
              </button>
              <button type="button" disabled={selectedObject.columns.length >= PRESENT_TABLE_MAX_COLUMNS}
                onClick={() => onPatchTableResult?.(() => appendPresentTableColumn(selectedObject))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30">
                + Column
              </button>
              <button type="button" disabled={selectedObject.columns.length <= PRESENT_TABLE_MIN_COLUMNS}
                onClick={() => onPatchTableResult?.(() => removePresentTableColumn(selectedObject, selectedObject.columns.length - 1))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30">
                − Column
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => onUpdateAllObjects?.(allObjects.map((object) => object.id === selectedObject.id ? stretchPresentObjectToSlide(object, 'width') as PresentSceneObject : object))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10" data-present-table-fit="width">
                Fit slide width
              </button>
              <button type="button" onClick={() => onUpdateAllObjects?.(allObjects.map((object) => object.id === selectedObject.id ? stretchPresentObjectToSlide(object, 'height') as PresentSceneObject : object))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10" data-present-table-fit="height">
                Fit slide height
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {([['Header', 'headerColor'], ['Body', 'bodyColor'], ['Text', 'textColor']] as const).map(([label, field]) => (
                <label key={field} className="flex items-center gap-1 rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.625rem] text-slate-300">
                  <span>{label}</span>
                  <input
                    type="color"
                    aria-label={`Table ${label} colour`}
                    value={(selectedObject as unknown as Record<string, string>)[field]}
                    onChange={(e) => onPatchObject(selectedObject.id, { [field]: e.target.value } as Partial<PresentSceneObject>)}
                    className="h-4 w-4 cursor-pointer border-0 bg-transparent"
                  />
                </label>
              ))}
            </div>
            <p className="text-[0.5625rem] leading-4 text-slate-500">
              Bounds: at most {PRESENT_TABLE_MAX_ROWS} rows and {PRESENT_TABLE_MAX_COLUMNS} columns,
              cells up to {PRESENT_TABLE_MAX_CELL_LENGTH} characters. A refused change is reported, never truncated silently.
            </p>
          </div>
        )}

        {selectedObject?.kind === 'chart' && (
          <div className="space-y-2 border-t border-white/10 pt-3" data-present-chart-inspector="true">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">
              Chart data · {selectedObject.chart.categories.length} × {selectedObject.chart.series.length}
            </span>
            <label className="block space-y-1">
              <span className="text-[0.5625rem] text-slate-500">Chart title</span>
              <input value={selectedObject.chart.title} maxLength={512} aria-label="Chart title"
                onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { title: e.target.value }))}
                className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[0.5625rem] text-slate-500">Type</span>
                <select aria-label="Chart type" value={selectedObject.chart.chart_type}
                  onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { chartType: e.target.value as ChartType }))}
                  className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200">
                  {PRESENT_CHART_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[0.5625rem] text-slate-500">Legend</span>
                <select aria-label="Chart legend position" value={selectedObject.chart.legend_position ?? 'bottom'}
                  onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { legendPosition: e.target.value as ChartLegendPosition }))}
                  className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200">
                  {PRESENT_CHART_LEGEND_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[0.5625rem] text-slate-500">X axis title</span>
                <input value={selectedObject.chart.x_axis_title ?? ''} maxLength={128} aria-label="Chart x axis title"
                  onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { xAxisTitle: e.target.value }))}
                  className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none" />
              </label>
              <label className="block space-y-1">
                <span className="text-[0.5625rem] text-slate-500">Y axis title</span>
                <input value={selectedObject.chart.y_axis_title ?? ''} maxLength={128} aria-label="Chart y axis title"
                  onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { yAxisTitle: e.target.value }))}
                  className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none" />
              </label>
            </div>
            <div className="flex items-center gap-3 text-[0.625rem] text-slate-300">
              <label className="flex items-center gap-1">
                <input type="checkbox" aria-label="Show data labels" checked={selectedObject.chart.show_data_labels === true}
                  onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { showDataLabels: e.target.checked }))} />
                Data labels
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" aria-label="Show gridlines" checked={selectedObject.chart.show_gridlines !== false}
                  onChange={(e) => onPatchChartResult?.(() => applyPresentChartOptions(selectedObject.chart, { showGridlines: e.target.checked }))} />
                Gridlines
              </label>
            </div>
            {/* Editable data model: categories as rows, one column per series. */}
            <div className="max-h-56 overflow-auto rounded border border-white/10" data-present-chart-data-table="true">
              <table className="w-full border-collapse text-[0.625rem]">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-slate-900 px-1 py-1 text-left text-slate-400">Category</th>
                    {selectedObject.chart.series.map((series, seriesIndex) => (
                      <th key={`${series.name}-${seriesIndex}`} className="px-1 py-1 text-slate-400">
                        <input value={series.name} aria-label={`Series ${seriesIndex + 1} name`} maxLength={128}
                          onChange={(e) => onPatchChartResult?.(() => setPresentChartSeriesName(selectedObject.chart, seriesIndex, e.target.value))}
                          className="w-20 rounded bg-slate-950 px-1 py-0.5 text-[0.625rem] text-slate-200 outline-none" />
                        <button type="button" aria-label={`Remove series ${seriesIndex + 1}`}
                          disabled={selectedObject.chart.series.length <= 1}
                          onClick={() => onPatchChartResult?.(() => removePresentChartSeries(selectedObject.chart, seriesIndex))}
                          className="ml-1 text-red-300 disabled:opacity-30">×</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedObject.chart.categories.map((category, categoryIndex) => (
                    <tr key={`${category}-${categoryIndex}`} className="border-t border-white/5">
                      <th className="sticky left-0 bg-slate-950 px-1 py-0.5 text-left">
                        <input value={category} aria-label={`Category ${categoryIndex + 1}`} maxLength={256}
                          onChange={(e) => onPatchChartResult?.(() => setPresentChartCategory(selectedObject.chart, categoryIndex, e.target.value))}
                          className="w-24 rounded bg-slate-900 px-1 py-0.5 text-[0.625rem] text-slate-200 outline-none" />
                        <button type="button" aria-label={`Remove category ${categoryIndex + 1}`}
                          disabled={selectedObject.chart.categories.length <= 1}
                          onClick={() => onPatchChartResult?.(() => removePresentChartCategory(selectedObject.chart, categoryIndex))}
                          className="ml-1 text-red-300 disabled:opacity-30">×</button>
                      </th>
                      {selectedObject.chart.series.map((series, seriesIndex) => (
                        <td key={`${series.name}-${categoryIndex}-${seriesIndex}`} className="px-1 py-0.5">
                          <input
                            type="number"
                            aria-label={`Series ${seriesIndex + 1} value for ${category}`}
                            value={series.values[categoryIndex] ?? 0}
                            onChange={(e) => onPatchChartResult?.(() => setPresentChartValue(selectedObject.chart, seriesIndex, categoryIndex, e.target.value))}
                            className="w-16 rounded bg-slate-900 px-1 py-0.5 text-right font-mono text-[0.625rem] text-slate-200 outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" disabled={selectedObject.chart.categories.length >= PRESENT_CHART_MAX_CATEGORIES}
                onClick={() => onPatchChartResult?.(() => appendPresentChartCategory(selectedObject.chart))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30">
                + Category
              </button>
              <button type="button" disabled={selectedObject.chart.series.length >= PRESENT_CHART_MAX_SERIES}
                onClick={() => onPatchChartResult?.(() => appendPresentChartSeries(selectedObject.chart))}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10 disabled:opacity-30">
                + Series
              </button>
            </div>
            <p className="text-[0.5625rem] leading-4 text-slate-500">
              Bounds: at most {PRESENT_CHART_MAX_CATEGORIES} categories and {PRESENT_CHART_MAX_SERIES} series,
              values within ±1e12. An unusable number is refused with a message instead of becoming NaN.
            </p>
          </div>
        )}

        {selectedObject?.kind === 'widget' && (
          <PresentWidgetInspector widget={selectedObject} onPatch={onPatchObject} />
        )}

        {selectedObject?.kind === 'code' && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Code Block</span>
            <label className="block space-y-1">
              <span className="text-[0.5625rem] text-slate-500">Language</span>
              <input
                value={selectedObject.language}
                maxLength={32}
                onChange={(e) => onPatchObject(selectedObject.id, { language: e.target.value.replace(/[^A-Za-z0-9_+.#-]/g, '').slice(0, 32) })}
                className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-300">
              <input
                type="checkbox"
                checked={selectedObject.lineNumbers ?? true}
                onChange={(e) => onPatchObject(selectedObject.id, { lineNumbers: e.target.checked })}
              />
              Show line numbers
            </label>
          </div>
        )}

        {selectedObject?.kind === 'workspace' && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">{workspaceIntegrationCopy.inspector.workspaceReference}</span>
            <input
              value={selectedObject.title}
              maxLength={512}
              onChange={(e) => onPatchObject(selectedObject.id, { title: e.target.value.slice(0, 512) })}
              className="w-full rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none"
              aria-label={workspaceIntegrationCopy.inspector.objectTitle}
            />
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => onPatchObject(selectedObject.id, { mode: 'Live' })} className={`rounded border px-2 py-1 text-[0.625rem] ${selectedObject.mode === 'Live' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-slate-500'}`}>{workspaceWorkflowCopy.live}</button>
              <button type="button" onClick={() => onPatchObject(selectedObject.id, { mode: 'Frozen' })} className={`rounded border px-2 py-1 text-[0.625rem] ${selectedObject.mode === 'Frozen' ? 'border-slate-500/50 bg-slate-700/30 text-slate-200' : 'border-white/10 text-slate-500'}`}>{workspaceWorkflowCopy.frozen}</button>
            </div>
            <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-[0.5625rem]">
              <dt className="text-slate-600">{workspaceWorkflowCopy.kind}</dt><dd className="truncate font-mono text-cyan-300">{workspaceIntegrationCopy.targetKinds[selectedObject.integrationKind]}</dd>
              <dt className="text-slate-600">{workspaceIntegrationCopy.inspector.source}</dt><dd className="truncate font-mono text-slate-400">{selectedObject.sourceDocumentId}</dd>
              <dt className="text-slate-600">{workspaceWorkflowCopy.version}</dt><dd className="font-mono text-slate-400">{selectedObject.sourceVersion}</dd>
              <dt className="text-slate-600">{workspaceIntegrationCopy.inspector.uri}</dt><dd className="truncate font-mono text-slate-500" title={selectedObject.uri}>{selectedObject.uri}</dd>
            </dl>
          </div>
        )}

        {/* 6. Accessibility: alternative text for every object kind (Paket 29) */}
        {selectedObject && (
          <div className="space-y-2 border-t border-white/10 pt-3" data-present-a11y-section="true">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Accessibility</span>
            <label className="block space-y-1">
              <span className="text-[0.5625rem] text-slate-500">Alternative text (screen reader description)</span>
              <textarea
                value={readPresentAltText(selectedObject)}
                maxLength={PRESENT_MAX_ALT_TEXT_LENGTH}
                aria-label="Object alternative text"
                onChange={(event) => onPatchObject(selectedObject.id, withPresentAltText(selectedObject, event.target.value) as Partial<PresentSceneObject>)}
                placeholder="Describe what this object conveys"
                className="min-h-14 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[0.6875rem] text-slate-200"
              />
            </label>
            {contrastFinding && (
              <div
                role="status"
                data-present-contrast-finding={contrastFinding.passes ? 'pass' : 'fail'}
                className={`rounded border px-2 py-1 text-[0.625rem] ${contrastFinding.passes ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}
              >
                {contrastFinding.message}
              </div>
            )}
          </div>
        )}

        {/* 7. Hyperlink (Paket 28): slide, document or a validated HTTP(S) URL */}
        {selectedObject && (
          <div className="space-y-2 border-t border-white/10 pt-3" data-present-link-section="true">
            <span className="text-[0.625rem] font-mono text-slate-400 uppercase">Link</span>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Link kind"
                value={linkDraft.kind}
                onChange={(event) => setLinkDraft({ kind: event.target.value as 'slide' | 'url' | 'document', value: '' })}
                className="rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200"
              >
                <option value="slide">Slide</option>
                <option value="url">URL</option>
                <option value="document">Document</option>
              </select>
              {linkDraft.kind === 'slide' ? (
                <select
                  aria-label="Link target slide"
                  value={linkDraft.value}
                  onChange={(event) => setLinkDraft({ kind: 'slide', value: event.target.value })}
                  className="rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200"
                >
                  <option value="">Choose a slide…</option>
                  {(linkSlides ?? []).map((slide, index) => (
                    <option key={slide.id} value={slide.id}>{index + 1}. {slide.title || 'Untitled'}</option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={linkDraft.kind === 'url' ? 'Link URL' : 'Link document id'}
                  value={linkDraft.value}
                  maxLength={PRESENT_MAX_LINK_URL_LENGTH}
                  placeholder={linkDraft.kind === 'url' ? 'https://example.com' : 'document id'}
                  onChange={(event) => setLinkDraft({ kind: linkDraft.kind, value: event.target.value })}
                  className="rounded bg-slate-900 border border-white/10 px-2 py-1 text-[0.6875rem] text-slate-200 outline-none"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                data-present-link-apply="true"
                onClick={() => {
                  const target: PresentLinkTarget | null =
                    linkDraft.kind === 'slide'
                      ? (linkDraft.value ? { kind: 'slide', slideId: linkDraft.value } : null)
                      : linkDraft.kind === 'url'
                        ? (linkDraft.value.trim() ? { kind: 'url', url: linkDraft.value.trim() } : null)
                        : (linkDraft.value.trim() ? { kind: 'document', documentId: linkDraft.value.trim() } : null);
                  const validation = validatePresentLinkTarget(target, { slideIds: (linkSlides ?? []).map((slide) => slide.id) });
                  onLinkResult?.(validation, selectedObject.id);
                }}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                Apply link
              </button>
              <button
                type="button"
                data-present-link-remove="true"
                onClick={() => onLinkResult?.({ ok: true, target: null, message: 'Link removed.' }, selectedObject.id)}
                className="rounded border border-white/10 bg-slate-900 py-1 text-[0.625rem] text-slate-300 hover:bg-white/10"
              >
                Remove link
              </button>
            </div>
            <div role="status" aria-live="polite" className="break-words text-[0.625rem] text-slate-400">
              Current: {presentLinkSummary(presentObjectLink(selectedObject), slideIndexById)}
            </div>
          </div>
        )}

        {/* 5. Lock & Hide Toggles */}
        <div className="flex items-center gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => {
              if (isImage) onPatchImage(target.id, { locked: !target.locked });
              else onPatchObject(target.id, { locked: !target.locked });
            }}
            className={`flex-1 py-1.5 rounded-lg border flex items-center justify-center gap-1.5 ${
              target.locked ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'border-white/10 text-slate-400 hover:bg-white/5'
            }`}
          >
            {target.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{target.locked ? 'Locked' : 'Unlocked'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (isImage) onPatchImage(target.id, { hidden: !target.hidden });
              else onPatchObject(target.id, { hidden: !target.hidden });
            }}
            className={`flex-1 py-1.5 rounded-lg border flex items-center justify-center gap-1.5 ${
              target.hidden ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-white/10 text-slate-400 hover:bg-white/5'
            }`}
          >
            {target.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{target.hidden ? 'Hidden' : 'Visible'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
