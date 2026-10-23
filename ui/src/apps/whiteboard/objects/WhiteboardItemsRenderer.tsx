import { WhiteboardConnectorsRenderer } from '../connectors/WhiteboardConnectorsRenderer';
import React from 'react';
import { Square, Circle } from 'lucide-react';
import { WhiteboardItem, StickyColor, STICKY_COLORS } from '../types';
import { enforceWhiteboardDiagramConstraints, resizeWhiteboardItem } from '../model/whiteboardManipulationEngine';
import { whiteboardTextRenderParams } from '../model/whiteboardTextStyleEngine';
import type { WhiteboardConnectorPath } from '../model/whiteboardDiagramEngine';

interface WhiteboardItemsRendererProps {
  items: WhiteboardItem[];
  selectedItemId: string | null;
  selectedItemIds?: readonly string[];
  setSelectedItemId: (id: string | null) => void;
  editingItemId: string | null;
  setEditingItemId: (id: string | null) => void;
  connectorStartId: string | null;
  handleItemMouseDown: (e: React.MouseEvent, item: WhiteboardItem) => void;
  updateItems: (fn: (prev: WhiteboardItem[]) => WhiteboardItem[]) => void;
  handleChangeStickyColor: (color: StickyColor) => void;
  zoom: number;
  onSelectConnector?: (id: string, additive: boolean) => void;
  connectorPaths?: ReadonlyMap<string, WhiteboardConnectorPath>;
}

export const WhiteboardItemsRenderer: React.FC<WhiteboardItemsRendererProps> = ({
  items,
  selectedItemId,
  selectedItemIds = [],
  setSelectedItemId,
  editingItemId,
  setEditingItemId,
  connectorStartId,
  handleItemMouseDown,
  updateItems,
  handleChangeStickyColor,
  zoom,
  onSelectConnector,
  connectorPaths,
}) => {
  const placementStyle = (item: WhiteboardItem): React.CSSProperties => ({ position: 'absolute', left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation ?? 0}deg)`, transformOrigin: 'center', zIndex: item.zIndex ?? 0 });

  /**
   * Typography of one label. An object without a stored `textStyle` keeps today's class-based look, so
   * the new control never silently restyles existing boards; once a style is set, the single formatter
   * from `whiteboardTextStyleEngine` wins.
   */
  const textStyle = (item: WhiteboardItem): React.CSSProperties | undefined => {
    if (!item.textStyle) return undefined;
    const params = whiteboardTextRenderParams(item.textStyle);
    return { fontSize: `${params.fontSize}px`, fontWeight: params.fontWeight, fontFamily: params.familyCss, textAlign: params.align };
  };

  const startResize = (event: React.PointerEvent, item: WhiteboardItem) => {
    if (item.locked) return;
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = item.width;
    const startHeight = item.height;
    const aspect = item.type === 'image' ? startWidth / Math.max(1, startHeight) : null;

    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / Math.max(0.25, zoom);
      const dy = (moveEvent.clientY - startY) / Math.max(0.25, zoom);
      let width = Math.max(60, Math.round(startWidth + dx));
      let height = Math.max(40, Math.round(startHeight + dy));
      if (aspect && moveEvent.shiftKey) height = Math.max(40, Math.round(width / aspect));
      updateItems((previous) => enforceWhiteboardDiagramConstraints(previous.map((candidate) => candidate.id === item.id ? resizeWhiteboardItem(candidate, width, height) : candidate), new Set([item.id])));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const resizeHandle = (item: WhiteboardItem, selected: boolean) => selected && !item.locked ? (
    <button aria-label="Resize (hold Shift on images to preserve aspect ratio)"
      type="button"
      onPointerDown={(event) => startResize(event, item)}
      className="absolute -right-2 -bottom-2 w-4 h-4 rounded-sm bg-blue-500 border-2 border-white shadow-lg cursor-se-resize z-30"
      title="Resize (hold Shift on images to preserve aspect ratio)"
    />
  ) : null;

  return (
    <>
      {/* SVG Overlay for Connector Lines */}
      <WhiteboardConnectorsRenderer
        items={items}
        selectedItemId={selectedItemId}
        setSelectedItemId={setSelectedItemId}
        selectedItemIds={selectedItemIds}
        onSelectConnector={onSelectConnector}
        connectorPaths={connectorPaths}
      />

      {/* Render Whiteboard Items */}
      {items.map((item) => {
        if (item.type === 'connector' || item.diagram) return null;

        const isSelected = selectedItemId === item.id || selectedItemIds.includes(item.id);
        const isEditing = editingItemId === item.id;
        const isConnectorSource = connectorStartId === item.id;

        if (item.type === 'frame') {
          return (
            <div
              key={item.id}
              onMouseDown={(event) => handleItemMouseDown(event, item)}
              onDoubleClick={(event) => { event.stopPropagation(); setEditingItemId(item.id); }}
              style={placementStyle(item)}
              className={`pointer-events-auto rounded-xl border-2 border-dashed bg-slate-900/[0.12] cursor-move ${isSelected ? 'border-blue-400 ring-2 ring-blue-500/30' : 'border-slate-600'}`}
            >
              <div className="absolute -top-7 left-0 flex items-center gap-2">
                {isEditing ? (
                  <input autoFocus value={item.text} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => updateItems((previous) => previous.map((candidate) => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate))} onBlur={() => setEditingItemId(null)} style={textStyle(item)} className="bg-slate-950 border border-blue-500/40 rounded px-2 py-1 text-[0.625rem] text-white outline-none" />
                ) : <span style={textStyle(item)} className="px-2 py-1 rounded bg-slate-950/90 border border-white/10 text-[0.625rem] font-bold text-slate-300">{item.text || 'Frame'}</span>}
                <span className="text-[0.5625rem] font-mono text-slate-600">{Math.round(item.width)}×{Math.round(item.height)}</span>
              </div>
              {resizeHandle(item, isSelected)}
            </div>
          );
        }

        if (item.type === 'image') {
          return (
            <div
              key={item.id}
              onMouseDown={(event) => handleItemMouseDown(event, item)}
              style={placementStyle(item)}
              className={`pointer-events-auto overflow-visible rounded-xl cursor-move ${isSelected ? 'ring-4 ring-fuchsia-500/50' : ''}`}
            >
              {item.dataUrl ? <img src={item.dataUrl} alt={item.name || 'Whiteboard image'} draggable={false} className="w-full h-full object-contain rounded-xl bg-slate-950/70 border border-white/10 shadow-xl pointer-events-none" /> : <div className="w-full h-full rounded-xl border border-rose-500/30 bg-rose-950/20 flex items-center justify-center text-xs text-rose-300">Missing image data</div>}
              <span className="absolute left-2 bottom-2 max-w-[80%] truncate px-2 py-1 rounded bg-black/70 text-[0.5625rem] text-white">{item.name || 'Image'}</span>
              {resizeHandle(item, isSelected)}
            </div>
          );
        }

        if (item.type === 'text') {
          return (
            <div
              key={item.id}
              onMouseDown={(event) => handleItemMouseDown(event, item)}
              onDoubleClick={(event) => { event.stopPropagation(); setEditingItemId(item.id); }}
              style={{ ...placementStyle(item), height: undefined, minHeight: item.height }}
              className={`pointer-events-auto cursor-move rounded-lg px-2 py-1 ${isSelected ? 'ring-2 ring-cyan-500/50 bg-cyan-500/[0.04]' : ''}`}
            >
              {isEditing ? <textarea autoFocus value={item.text} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => updateItems((previous) => previous.map((candidate) => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate))} onBlur={() => setEditingItemId(null)} style={textStyle(item)} className="w-full min-h-14 bg-slate-950/80 border border-cyan-500/40 rounded-lg p-2 text-sm text-white outline-none resize-none" /> : <div style={textStyle(item)} className="whitespace-pre-wrap text-base font-semibold text-slate-100">{item.text || 'Double-click to edit text'}</div>}
              {resizeHandle(item, isSelected)}
            </div>
          );
        }

        if (item.type === 'sticky') {
          const colorInfo = STICKY_COLORS[item.color || 'yellow'];
          return (
            <div
              key={item.id}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingItemId(item.id);
              }}
              style={{ ...placementStyle(item), height: undefined, minHeight: item.height, backgroundColor: colorInfo.bg, borderColor: colorInfo.border, color: colorInfo.text }}
              className={`pointer-events-auto rounded-xl p-3 shadow-xl border-2 transition-shadow cursor-move flex flex-col justify-between group ${
                isSelected ? 'ring-4 ring-blue-500/60 shadow-2xl' : 'hover:shadow-2xl'
              } ${isConnectorSource ? 'ring-4 ring-indigo-500 animate-pulse' : ''}`}
            >
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-black/10">
                <div className="flex items-center space-x-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-black/20" />
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider opacity-60">
                    Sticky Note
                  </span>
                </div>

                <div className="flex items-center space-x-1 opacity-80 hover:opacity-100">
                  <button aria-label="Set sticky note color to yellow"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChangeStickyColor('yellow');
                    }}
                    className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-black/20"
                    title="Yellow"
                  />
                  <button aria-label="Set sticky note color to cyan"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChangeStickyColor('cyan');
                    }}
                    className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-black/20"
                    title="Cyan"
                  />
                  <button aria-label="Set sticky note color to purple"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChangeStickyColor('purple');
                    }}
                    className="w-2.5 h-2.5 rounded-full bg-purple-400 border border-black/20"
                    title="Purple"
                  />
                </div>
              </div>

              {isEditing ? (
                <textarea
                  autoFocus
                  value={item.text}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateItems((prev) =>
                      prev.map((i) => (i.id === item.id ? { ...i, text: val } : i))
                    );
                  }}
                  onBlur={() => setEditingItemId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingItemId(null);
                  }}
                  className="w-full flex-1 bg-transparent border-none outline-none text-xs font-medium resize-none leading-relaxed p-0 select-text"
                  style={{ color: colorInfo.text, ...textStyle(item) }}
                  rows={5}
                />
              ) : (
                <div style={textStyle(item)} className="text-xs font-medium whitespace-pre-wrap leading-relaxed flex-1 py-1 select-text">
                  {item.text || 'Double click to edit note...'}
                </div>
              )}

              <div className="flex items-center justify-between pt-1 mt-1 text-[0.5625rem] opacity-40 font-mono">
                <span>ASTRAEA NOTE</span>
                <span>AES-256</span>
              </div>
            </div>
          );
        }

        if (item.type === 'process') {
          return (
            <div
              key={item.id}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingItemId(item.id);
              }}
              style={placementStyle(item)}
              className={`pointer-events-auto rounded-xl bg-slate-900/90 backdrop-blur-md border-2 border-blue-500 shadow-xl p-3 flex flex-col justify-center items-center text-center cursor-move transition-all ${
                isSelected ? 'ring-4 ring-blue-500/60 shadow-blue-500/20' : 'hover:border-blue-400'
              } ${isConnectorSource ? 'ring-4 ring-indigo-500 animate-pulse' : ''}`}
            >
              <div className="text-[0.625rem] font-mono text-blue-400 uppercase tracking-widest mb-1 flex items-center space-x-1">
                <Square className="w-2.5 h-2.5" />
                <span>PROCESS</span>
              </div>
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={item.text}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateItems((prev) =>
                      prev.map((i) => (i.id === item.id ? { ...i, text: val } : i))
                    );
                  }}
                  onBlur={() => setEditingItemId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingItemId(null);
                  }}
                  style={textStyle(item)}
                  className="w-full bg-slate-950 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-white text-center outline-none select-text"
                />
              ) : (
                <span style={textStyle(item)} className="text-xs font-semibold text-slate-100 leading-snug select-text">
                  {item.text || 'Process Step'}
                </span>
              )}
            </div>
          );
        }

        if (item.type === 'decision') {
          return (
            <div
              key={item.id}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingItemId(item.id);
              }}
              style={placementStyle(item)}
              className={`pointer-events-auto cursor-move flex items-center justify-center relative ${
                isConnectorSource ? 'animate-pulse' : ''
              }`}
            >
              <svg className="w-full h-full absolute inset-0 overflow-visible">
                <polygon
                  points={`${item.width / 2},2 ${item.width - 2},${item.height / 2} ${item.width / 2},${item.height - 2} 2,${item.height / 2}`}
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth={isSelected ? 3 : 2}
                  className={isSelected ? 'filter drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}
                />
              </svg>

              <div className="relative z-10 p-2 text-center max-w-[80%] flex flex-col items-center justify-center">
                <div className="text-[0.5625rem] font-mono text-amber-400 uppercase tracking-wider mb-0.5">
                  DECISION
                </div>
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={item.text}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateItems((prev) =>
                        prev.map((i) => (i.id === item.id ? { ...i, text: val } : i))
                      );
                    }}
                    onBlur={() => setEditingItemId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') setEditingItemId(null);
                    }}
                    style={textStyle(item)}
                    className="w-full bg-slate-950 border border-amber-400 rounded px-1 text-[0.6875rem] text-white text-center outline-none select-text"
                  />
                ) : (
                  <span style={textStyle(item)} className="text-[0.6875rem] font-bold text-amber-200 leading-tight select-text">
                    {item.text || 'Condition?'}
                  </span>
                )}
              </div>
            </div>
          );
        }

        if (item.type === 'terminal') {
          return (
            <div
              key={item.id}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingItemId(item.id);
              }}
              style={placementStyle(item)}
              className={`pointer-events-auto rounded-full bg-slate-900/90 backdrop-blur-md border-2 border-emerald-500 shadow-xl px-4 flex flex-col justify-center items-center text-center cursor-move transition-all ${
                isSelected ? 'ring-4 ring-emerald-500/60 shadow-emerald-500/20' : 'hover:border-emerald-400'
              } ${isConnectorSource ? 'ring-4 ring-indigo-500 animate-pulse' : ''}`}
            >
              <div className="text-[0.5625rem] font-mono text-emerald-400 uppercase tracking-widest flex items-center space-x-1">
                <Circle className="w-2 h-2 fill-emerald-500" />
                <span>TERMINAL</span>
              </div>
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={item.text}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateItems((prev) =>
                      prev.map((i) => (i.id === item.id ? { ...i, text: val } : i))
                    );
                  }}
                  onBlur={() => setEditingItemId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingItemId(null);
                  }}
                  style={textStyle(item)}
                  className="w-full bg-slate-950 border border-emerald-400 rounded px-1.5 py-0.5 text-xs text-white text-center outline-none select-text"
                />
              ) : (
                <span style={textStyle(item)} className="text-xs font-semibold text-emerald-100 select-text">
                  {item.text || 'Start / End'}
                </span>
              )}
            </div>
          );
        }

        return null;
      })}
    </>
  );
};
