import React from 'react';
import {
  PresentSlide,
  PresentImageObject,
  PresentSceneObject,
} from '../../../../shared/contracts/workspace';
import {
  movePresentLayer,
  sortPresentLayers,
  duplicatePresentSceneObject,
} from '../../canvas/model/presentScene';
import {
  X,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowUpToLine,
  ArrowDownToLine,
  Copy,
  Trash2,
} from 'lucide-react';

interface PresentLayersPaneProps {
  slide: PresentSlide;
  onUpdateSlide: (updated: PresentSlide) => void;
  selectedObjectId: string | null;
  selectedImageId: string | null;
  onSelectObject: (id: string | null) => void;
  onSelectImage: (id: string | null) => void;
  onClose: () => void;
}

export const PresentLayersPane: React.FC<PresentLayersPaneProps> = ({
  slide,
  onUpdateSlide,
  selectedObjectId,
  selectedImageId,
  onSelectObject,
  onSelectImage,
  onClose,
}) => {
  const images = slide.images || [];
  const scenes = slide.sceneObjects || [];
  const allLayers = sortPresentLayers([...images, ...scenes]).reverse();

  const handleLayerAction = (id: string, action: 'front' | 'back') => {
    const all = movePresentLayer([...images, ...scenes], id, action);
    const nextImages = all.filter((c): c is PresentImageObject => 'dataUrl' in c);
    const nextScenes = all.filter((c): c is PresentSceneObject => !('dataUrl' in c));
    onUpdateSlide({ ...slide, images: nextImages, sceneObjects: nextScenes });
  };

  const handleDuplicate = (obj: PresentSceneObject) => {
    const copy = duplicatePresentSceneObject(obj, `${obj.id}-copy-${Date.now()}`);
    onUpdateSlide({ ...slide, sceneObjects: [...scenes, copy] });
    onSelectObject(copy.id);
  };

  const handleDelete = (id: string, isImg: boolean) => {
    if (isImg) {
      onUpdateSlide({ ...slide, images: images.filter((i) => i.id !== id) });
      if (selectedImageId === id) onSelectImage(null);
    } else {
      onUpdateSlide({ ...slide, sceneObjects: scenes.filter((s) => s.id !== id) });
      if (selectedObjectId === id) onSelectObject(null);
    }
  };

  return (
    <div className="absolute right-4 top-14 z-50 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border border-cyan-500/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md select-none text-xs">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-cyan-400 text-xs uppercase tracking-wider">Layers</span>
          <span className="text-[0.5625rem] text-slate-500">top → bottom</span>
        </div>
        <button aria-label="Close Present Layers panel" type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {allLayers.map((layer) => {
          const isImg = 'dataUrl' in layer;
          const isSelected = isImg ? selectedImageId === layer.id : selectedObjectId === layer.id;

          const label = isImg
            ? `Image · ${layer.name}`
            : layer.kind === 'text'
            ? `Text · ${layer.text.slice(0, 18)}`
            : layer.kind === 'shape'
            ? `Shape · ${layer.shape}`
            : layer.kind === 'widget'
            ? `Widget · ${layer.label}`
            : layer.kind === 'diagram'
            ? `Diagram · ${layer.diagramType}`
            : layer.kind === 'code'
            ? `Code · ${layer.language}`
            : layer.kind === 'chart'
            ? `Chart · ${layer.chart.title}`
            : layer.kind === 'table'
            ? `Table · ${layer.columns.join(', ')}`
            : `Workspace · ${layer.title}`;

          const patch = (p: Record<string, unknown>) => {
            if (isImg) {
              onUpdateSlide({
                ...slide,
                images: images.map((i) => (i.id === layer.id ? { ...i, ...p } : i)),
              });
            } else {
              onUpdateSlide({
                ...slide,
                sceneObjects: scenes.map((s) => (s.id === layer.id ? { ...s, ...p } as PresentSceneObject : s)),
              });
            }
          };

          return (
            <div
              key={layer.id}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition-colors ${
                isSelected
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isImg) {
                    onSelectImage(layer.id);
                    onSelectObject(null);
                  } else {
                    onSelectObject(layer.id);
                    onSelectImage(null);
                  }
                }}
                className="flex-1 truncate text-left text-[0.6875rem] font-medium"
                title={label}
              >
                {label}
              </button>

              <button aria-label={layer.hidden ? 'Show layer' : 'Hide layer'}
                type="button"
                onClick={() => patch({ hidden: !layer.hidden })}
                className="p-1 text-slate-400 hover:text-white"
                title={layer.hidden ? 'Unhide' : 'Hide'}
              >
                {layer.hidden ? <EyeOff className="w-3 h-3 text-purple-400" /> : <Eye className="w-3 h-3" />}
              </button>

              <button aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                type="button"
                onClick={() => patch({ locked: !layer.locked })}
                className="p-1 text-slate-400 hover:text-white"
                title={layer.locked ? 'Unlock' : 'Lock'}
              >
                {layer.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
              </button>

              <button
                type="button"
                onClick={() => handleLayerAction(layer.id, 'front')}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Bring to Front" title="Bring to Front"
              >
                <ArrowUpToLine className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => handleLayerAction(layer.id, 'back')}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Send to Back" title="Send to Back"
              >
                <ArrowDownToLine className="w-3 h-3" />
              </button>

              {!isImg && (
                <button
                  type="button"
                  onClick={() => handleDuplicate(layer as PresentSceneObject)}
                  className="p-1 text-slate-400 hover:text-white"
                  aria-label="Duplicate" title="Duplicate"
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDelete(layer.id, isImg)}
                className="p-1 text-red-400 hover:text-red-300"
                aria-label="Delete Layer" title="Delete Layer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {allLayers.length === 0 && (
          <div className="p-4 text-center text-slate-500 text-[0.625rem]">
            No objects on this slide. Insert shapes, widgets, or text above.
          </div>
        )}
      </div>
    </div>
  );
};
