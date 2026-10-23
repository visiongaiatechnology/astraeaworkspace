// STATUS: DIAMANT VGT SUPREME — Draw layer stack + object navigator (the keyboard path to every object).
//
// Two facts, two owners: the layer list reads `page.layerIds` through `resolvePageLayers` and writes
// through `drawLayerEngine`; the object list reads the canonical scene paint order from
// `projectDrawScene` and writes through the canvas session. The navigator is also the documented
// keyboard route to locked objects, which the canvas deliberately skips while cycling.
import React from 'react';
import type { DrawDocumentModel, DrawObject, DrawPage } from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { drawInteractionText } from '../drawInteractionLocale';
import { drawCanvasCount } from '../drawCanvasLocale';
import { countDrawLayerObjects, isDrawLayerOrderMutable, resolvePageLayers } from '../interactions/drawLayerEngine';
import { projectDrawScene } from '../interactions/drawSceneProjection';

export interface DrawLayerPanelProps {
  readonly model: DrawDocumentModel;
  readonly page: DrawPage;
  readonly locale: WorkspaceLocale;
  readonly activeLayerId: string;
  readonly selectedIds: readonly string[];
  readonly onSetActiveLayer: (layerId: string) => void;
  readonly onToggleLayerVisibility: (layerId: string, value: boolean) => void;
  readonly onToggleLayerLock: (layerId: string, value: boolean) => void;
  readonly onToggleLayerPrintable: (layerId: string, value: boolean) => void;
  readonly onStepLayer: (layerId: string, direction: 1 | -1) => void;
  readonly onRenameLayer: (layerId: string, name: string) => void;
  readonly onAddLayer: () => void;
  readonly onSelectObject: (objectId: string) => void;
  readonly onToggleObjectLock: (locked: boolean) => void;
  readonly onZOrder: (action: 'front' | 'back' | 'forward' | 'backward') => void;
  readonly onGroup: () => void;
  readonly onUngroup: () => void;
  readonly onAddToGroup: (groupId: string) => void;
  readonly onMoveToLayer: (layerId: string) => void;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onToggleViewport: (patch: { readonly showGrid?: boolean; readonly snapToGrid?: boolean; readonly snapToShapes?: boolean; readonly snapToGuides?: boolean }) => void;
  readonly onAddGuide: (axis: 'x' | 'y') => void;
  readonly onRemoveGuide: (guideId: string) => void;
}

const LAYER_BUTTON = 'rounded border border-white/15 px-1.5 py-0.5 text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40';

/**
 * Grenze der Objektliste. **Paket 20, Schicht A11y:** die Navigationsliste ist die Tastatur-Zuflucht zu
 * **jedem** Objekt — bei 1300 Objekten wäre sie aber selbst ein unbounded Render (1300 DOM-Knoten).
 * Deshalb: gedeckelt, und die Zahl der **nicht** gezeigten Objekte wird **benannt** statt verschwiegen.
 */
export const DRAW_OBJECT_NAVIGATOR_LIMIT = 200;

export const DrawLayerPanel: React.FC<DrawLayerPanelProps> = ({
  model, page, locale, activeLayerId, selectedIds, onSetActiveLayer, onToggleLayerVisibility,
  onToggleLayerLock, onToggleLayerPrintable, onStepLayer, onRenameLayer, onAddLayer, onSelectObject,
  onToggleObjectLock, onZOrder, onGroup, onUngroup, onAddToGroup, onMoveToLayer, onConnect, onDisconnect,
  onToggleViewport, onAddGuide, onRemoveGuide,
}) => {
  const t = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);
  const layers = resolvePageLayers(model, page.id);
  const scene = projectDrawScene(model, page.id);
  const allObjects: DrawObject[] = [...scene.entries].reverse().map((entry) => entry.object);
  // **Gedeckelt, aber die Auswahl bleibt sichtbar:** ein ausgewähltes Objekt darf nie aus der Liste fallen.
  const selectedObjects = allObjects.filter((object) => selectedIds.includes(object.id));
  const shown = allObjects.slice(0, DRAW_OBJECT_NAVIGATOR_LIMIT);
  const objects = selectedObjects.every((object) => shown.some((candidate) => candidate.id === object.id))
    ? shown
    : [...shown.slice(0, Math.max(0, DRAW_OBJECT_NAVIGATOR_LIMIT - selectedObjects.length)), ...selectedObjects];
  const hiddenObjectCount = Math.max(0, allObjects.length - objects.length);
  const lockedSelection = selectedIds.some((id) => scene.byId.get(id)?.locked);
  const connectorSelected = selectedIds.some((id) => model.objects[id]?.type === 'connector');
  const canGroup = selectedIds.length > 1;
  const canUngroup = selectedIds.some((id) => model.objects[id]?.type === 'group');
  const containers = allObjects.filter((object) => object.type === 'group' && !selectedIds.includes(object.id));
  const viewport = model.viewport;

  return (
    <aside data-vgt-panel="layers" className="flex w-64 flex-col gap-3 overflow-auto border-l border-white/10 bg-slate-900/60 p-3" aria-label={t('layers')}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t('layers')}</h2>
        <button type="button" data-vgt-layer-add="true" className={LAYER_BUTTON} onClick={onAddLayer}>{t('layerAdd')}</button>
      </div>
      <ul data-vgt-layer-list={layers.length} className="flex flex-col gap-1">
        {[...layers].reverse().map((layer) => (
          <li
            key={layer.id}
            data-vgt-layer={layer.id}
            data-vgt-layer-active={layer.id === activeLayerId ? 'true' : 'false'}
            className="rounded border border-white/10 px-2 py-1.5 text-[0.6875rem]"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                onClick={() => onSetActiveLayer(layer.id)}
                aria-pressed={layer.id === activeLayerId}
                aria-label={`${t('layers')}: ${layer.name}`}
              >
                {layer.name}
              </button>
              <span className="text-[0.625rem] text-slate-400">{countDrawLayerObjects(model, page.id, layer.id)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-vgt-layer-visible={layer.id}
                  checked={layer.visible}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleLayerVisibility(layer.id, event.target.checked)}
                  aria-label={`${t('layerVisible')}: ${layer.name}`}
                />
                {t('layerVisible')}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-vgt-layer-locked={layer.id}
                  checked={layer.locked}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleLayerLock(layer.id, event.target.checked)}
                  aria-label={`${t('layerLocked')}: ${layer.name}`}
                />
                {t('layerLocked')}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-vgt-layer-printable={layer.id}
                  checked={layer.printable}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleLayerPrintable(layer.id, event.target.checked)}
                  aria-label={`${t('layerPrintable')}: ${layer.name}`}
                />
                {t('layerPrintable')}
              </label>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                className={LAYER_BUTTON}
                disabled={!isDrawLayerOrderMutable(model, page.id, layer.id, 1)}
                onClick={() => onStepLayer(layer.id, 1)}
                aria-label={`${t('layerUp')}: ${layer.name}`}
              >↑</button>
              <button
                type="button"
                className={LAYER_BUTTON}
                disabled={!isDrawLayerOrderMutable(model, page.id, layer.id, -1)}
                onClick={() => onStepLayer(layer.id, -1)}
                aria-label={`${t('layerDown')}: ${layer.name}`}
              >↓</button>
              <input
                data-vgt-layer-name={layer.id}
                className="min-w-0 flex-1 rounded border border-white/15 bg-slate-950 px-1 py-0.5 text-[0.625rem]"
                defaultValue={layer.name}
                aria-label={`${t('layerRename')}: ${layer.name}`}
                onBlur={(event: React.FocusEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value.trim();
                  if (value.length > 0 && value !== layer.name) onRenameLayer(layer.id, value);
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t('objects')}</h2>
        <p data-vgt-selection-count={selectedIds.length} className="text-[0.625rem] text-slate-400">
          {selectedIds.length === 0 ? t('selectionNone') : t('selectionCount').replace('{count}', String(selectedIds.length))}
        </p>
        <div className="flex flex-wrap gap-1">
          <button type="button" data-vgt-command="z-front" className={LAYER_BUTTON} disabled={selectedIds.length === 0} onClick={() => onZOrder('front')}>{t('bringFront')}</button>
          <button type="button" data-vgt-command="z-back" className={LAYER_BUTTON} disabled={selectedIds.length === 0} onClick={() => onZOrder('back')}>{t('sendBack')}</button>
          <button type="button" data-vgt-command="z-forward" className={LAYER_BUTTON} disabled={selectedIds.length === 0} onClick={() => onZOrder('forward')}>{t('bringForward')}</button>
          <button type="button" data-vgt-command="z-backward" className={LAYER_BUTTON} disabled={selectedIds.length === 0} onClick={() => onZOrder('backward')}>{t('sendBackward')}</button>
          <button type="button" data-vgt-command="group" className={LAYER_BUTTON} disabled={!canGroup} onClick={onGroup}>{t('groupSelection')}</button>
          <button type="button" data-vgt-command="ungroup" className={LAYER_BUTTON} disabled={!canUngroup} onClick={onUngroup}>{t('ungroupSelection')}</button>
          <label className="flex items-center gap-1 text-[0.625rem] text-slate-300">
            {t('addToContainer')}
            <select
              data-vgt-add-to-group="true"
              className="rounded border border-white/15 bg-slate-950 px-1 py-0.5 text-[0.625rem]"
              value=""
              disabled={containers.length === 0 || selectedIds.length === 0}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                if (event.target.value.length > 0) onAddToGroup(event.target.value);
              }}
              aria-label={t('addToContainer')}
            >
              <option value="">—</option>
              {containers.map((container) => <option key={container.id} value={container.id}>{container.name}</option>)}
            </select>
          </label>
          <button type="button" data-vgt-command="lock" className={LAYER_BUTTON} disabled={selectedIds.length === 0} onClick={() => onToggleObjectLock(!lockedSelection)}>
            {lockedSelection ? t('unlockSelection') : t('lockSelection')}
          </button>
          <button type="button" data-vgt-command="connect" className={LAYER_BUTTON} disabled={selectedIds.length !== 2} onClick={onConnect}>{t('connectSelection')}</button>
          <button type="button" data-vgt-command="disconnect" className={LAYER_BUTTON} disabled={!connectorSelected} onClick={onDisconnect}>{t('disconnectSelection')}</button>
          <label className="flex items-center gap-1 text-[0.625rem] text-slate-300">
            {t('layerTarget')}
            <select
              data-vgt-move-to-layer="true"
              className="rounded border border-white/15 bg-slate-950 px-1 py-0.5 text-[0.625rem]"
              value={activeLayerId}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onMoveToLayer(event.target.value)}
              aria-label={t('moveToLayer')}
            >
              {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t('viewOptions')}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[0.625rem] text-slate-300">
          <label className="flex items-center gap-1">
            <input
              type="checkbox" data-vgt-viewport="showGrid" checked={viewport.showGrid}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleViewport({ showGrid: event.target.checked })}
              aria-label={t('showGrid')}
            />{t('showGrid')}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox" data-vgt-viewport="snapToGrid" checked={viewport.snapToGrid}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleViewport({ snapToGrid: event.target.checked })}
              aria-label={t('snapToGridOption')}
            />{t('snapToGridOption')}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox" data-vgt-viewport="snapToShapes" checked={viewport.snapToShapes}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleViewport({ snapToShapes: event.target.checked })}
              aria-label={t('snapToShapesOption')}
            />{t('snapToShapesOption')}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox" data-vgt-viewport="snapToGuides" checked={viewport.snapToGuides}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleViewport({ snapToGuides: event.target.checked })}
              aria-label={t('snapToGuidesOption')}
            />{t('snapToGuidesOption')}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" data-vgt-command="guide-add-x" className={LAYER_BUTTON} onClick={() => onAddGuide('x')}>{t('addVerticalGuide')}</button>
          <button type="button" data-vgt-command="guide-add-y" className={LAYER_BUTTON} onClick={() => onAddGuide('y')}>{t('addHorizontalGuide')}</button>
          <span data-vgt-guide-count={viewport.guides.length} className="text-[0.625rem] text-slate-400">
            {t('guideCount').replace('{count}', String(viewport.guides.length))}
          </span>
        </div>
        <ul data-vgt-guide-list="true" className="flex flex-col gap-0.5">
          {viewport.guides.map((guide) => (
            <li key={guide.id} data-vgt-guide-id={guide.id} className="flex items-center gap-1 text-[0.625rem] text-slate-300">
              <span className="min-w-0 flex-1 truncate">{`${guide.axis === 'x' ? '↕' : '↔'} ${guide.id} @ ${Math.round(guide.position)}`}</span>
              <button
                type="button" data-vgt-guide-remove={guide.id} className={LAYER_BUTTON}
                onClick={() => onRemoveGuide(guide.id)}
                aria-label={`${t('removeGuide')}: ${guide.id}`}
              >×</button>
            </li>
          ))}
        </ul>
      </div>

      <p
        data-vgt-object-list-total={allObjects.length}
        data-vgt-object-list-truncated={hiddenObjectCount}
        className="text-[0.625rem] text-slate-400"
      >
        {hiddenObjectCount > 0
          ? t('objectListTruncated').replace('{count}', String(hiddenObjectCount))
          : drawCanvasCount('objectCount', allObjects.length, locale)}
      </p>
      <ul data-vgt-object-list={objects.length} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto" role="listbox" aria-label={t('objects')} aria-multiselectable>
        {objects.length === 0 ? <li className="text-[0.6875rem] text-slate-400">{t('objectEmpty')}</li> : null}
        {objects.map((object) => {
          const entry = scene.byId.get(object.id);
          const selected = selectedIds.includes(object.id);
          const token = selected ? 'selected' : entry?.locked ? 'disabled' : entry?.visible ? 'idle' : 'hidden';
          return (
            <li key={object.id} className="flex items-center gap-1">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                data-vgt-object={object.id}
                data-vgt-object-state={token}
                className={`min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left text-[0.6875rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${selected ? 'bg-sky-500/25 text-slate-50' : 'text-slate-200 hover:bg-white/5'}`}
                onClick={() => onSelectObject(object.id)}
                aria-label={`${t('selectObject')}: ${object.name}`}
              >
                <span aria-hidden="true">{entry?.locked ? '⛔ ' : entry?.visible === false ? '◌ ' : '▦ '}</span>
                {object.name}
                {selected ? <span className="sr-only"> ({t('objectYouAreHere')})</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export default DrawLayerPanel;
