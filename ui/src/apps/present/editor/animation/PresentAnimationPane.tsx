// STATUS: DIAMANT VGT SUPREME — Present animation timeline, presets, triggers and motion paths
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PresentAnimation,
  PresentAnimationCategory,
  PresentAnimationEffect,
  PresentAnimationScope,
  PresentSlide,
} from '../../../../shared/contracts/workspace';
import { ArrowDown, ArrowUp, Play, Plus, Trash2, X } from 'lucide-react';
import { cancelForegroundAnimationFrame, requestForegroundAnimationFrame } from '../../../../platform/performance/performancePlatform';
import {
  PRESENT_ANIMATION_PRESETS,
  createPresentAnimation,
  evaluatePreviewAnimationsAtTime,
  normalizePresentAnimation,
  previewAnimationDuration,
  reorderPresentAnimations,
  type PresentAnimationPreviewState,
} from '../../animations/presentAnimationEngine';

interface PresentAnimationPaneProps {
  slide: PresentSlide;
  onUpdateSlide: (updated: PresentSlide) => void;
  onClose: () => void;
  onPreviewState?: (state: PresentAnimationPreviewState | null) => void;
}

const effectsByCategory: Record<PresentAnimationCategory, PresentAnimationEffect[]> = {
  entrance: ['appear', 'fade-in', 'zoom-in', 'fly-in-left', 'fly-in-right'],
  emphasis: ['pulse', 'spin', 'grow-shrink'],
  exit: ['fade-out', 'fly-out'],
  motion: ['motion-path'],
};

const inputClass = 'bg-slate-950 border border-white/10 rounded px-1.5 py-0.5 text-slate-300 text-[0.625rem] outline-none';

export const PresentAnimationPane: React.FC<PresentAnimationPaneProps> = ({
  slide,
  onUpdateSlide,
  onClose,
  onPreviewState,
}) => {
  const animations = useMemo(() => (slide.animations || []).map(normalizePresentAnimation), [slide.animations]);
  const targets = useMemo(() => [
    { id: 'slide-title', label: 'Title' },
    { id: 'slide-subtitle', label: 'Subtitle' },
    ...(slide.cards || []).map((card) => ({ id: card.id, label: `Card · ${card.title}` })),
    ...(slide.images || []).map((image) => ({ id: image.id, label: `Image · ${image.name}` })),
    ...(slide.sceneObjects || []).map((object) => ({
      id: object.id,
      label: object.kind === 'text' ? `Text · ${object.text.slice(0, 18)}`
        : object.kind === 'shape' ? `Shape · ${object.shape}`
        : object.kind === 'widget' ? `Widget · ${object.label}`
        : object.kind === 'diagram' ? `Diagram · ${object.diagramType}`
        : object.kind === 'code' ? `Code · ${object.language}`
        : object.kind === 'chart' ? `Chart · ${object.chart.title}`
        : object.kind === 'table' ? 'Table'
        : 'Object',
    })),
  ], [slide.cards, slide.images, slide.sceneObjects]);

  const [targetId, setTargetId] = useState(targets[0]?.id || 'slide-title');
  const [presetId, setPresetId] = useState(PRESENT_ANIMATION_PRESETS[0].id);
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null);
  const [scrubMs, setScrubMs] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelForegroundAnimationFrame(rafRef.current);
    onPreviewState?.(null);
  }, [onPreviewState]);

  const commit = (next: PresentAnimation[]) => onUpdateSlide({ ...slide, animations: next.map(normalizePresentAnimation) });
  const updateAnimation = (id: string, patch: Partial<PresentAnimation>) => commit(animations.map((animation) => animation.id === id ? normalizePresentAnimation({ ...animation, ...patch }) : animation));
  const removeAnimation = (id: string) => {
    commit(animations.filter((animation) => animation.id !== id));
    if (selectedAnimationId === id) setSelectedAnimationId(null);
  };

  const addAnimation = () => {
    if (!targetId) return;
    const next = createPresentAnimation(targetId, presetId, animations.length);
    commit([...animations, next]);
    setSelectedAnimationId(next.id);
  };

  const runPreview = (selection: PresentAnimation[]) => {
    if (!selection.length || !onPreviewState) return;
    if (rafRef.current !== null) cancelForegroundAnimationFrame(rafRef.current);
    const total = Math.max(1, previewAnimationDuration(selection));
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(total, now - started);
      setScrubMs(elapsed);
      onPreviewState(evaluatePreviewAnimationsAtTime(selection, elapsed));
      if (elapsed < total) rafRef.current = requestForegroundAnimationFrame(tick);
      else rafRef.current = null;
    };
    rafRef.current = requestForegroundAnimationFrame(tick);
  };

  /**
   * Alpha 0.1 user finding: selecting an animation must show what it looks like before committing to
   * it. Preview the currently chosen target+preset immediately (and when the selection changes) using
   * the same engine the presentation uses. Existing Preview/Preview All buttons stay available.
   */
  const autoPreviewKeyRef = useRef('');
  useEffect(() => {
    if (!onPreviewState || !targetId || !presetId) return;
    const key = `${targetId}::${presetId}`;
    if (autoPreviewKeyRef.current === key) return;
    autoPreviewKeyRef.current = key;
    runPreview([createPresentAnimation(targetId, presetId, 0)]);
    // runPreview is intentionally not part of the dependency list: it is recreated per render and the
    // key guard above prevents an endless preview loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, targetId, onPreviewState]);

  useEffect(() => {
    if (!onPreviewState || !selectedAnimationId) return;
    const selected = animations.find((animation) => animation.id === selectedAnimationId);
    if (selected) runPreview([selected]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnimationId, onPreviewState]);

  const totalDuration = Math.max(1, previewAnimationDuration(animations));
  const selectedAnimation = animations.find((animation) => animation.id === selectedAnimationId) || null;

  return (
    <div className="h-80 bg-slate-950 border-t border-purple-500/20 p-3 overflow-y-auto shrink-0 select-none text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
        <div><div className="font-bold text-purple-300 uppercase tracking-wider">Animation Timeline · {animations.length}</div><div className="text-[0.5625rem] text-slate-500">Multiple animations, triggers, scopes, repeats and motion paths persist with the slide.</div></div>
        <div className="flex items-center gap-1.5"><button type="button" onClick={() => runPreview(animations)} className="px-2 py-1 rounded border border-purple-500/30 text-purple-200 flex items-center gap-1"><Play className="w-3 h-3"/>Preview All</button><button aria-label="Close Present Animation panel" type="button" onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5"/></button></div>
      </div>

      <div className="grid grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_auto] gap-2 mb-3">
        <select value={targetId} onChange={(e)=>setTargetId(e.target.value)} className={inputClass}>{targets.map((target)=><option key={target.id} value={target.id}>{target.label}</option>)}</select>
        <select value={presetId} onChange={(e)=>setPresetId(e.target.value)} className={inputClass}>{PRESENT_ANIMATION_PRESETS.map((preset)=><option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
        <button type="button" onClick={addAnimation} className="px-2 py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-200 flex items-center gap-1"><Plus className="w-3 h-3"/>Add</button>
      </div>

      <div className="mb-3 rounded-lg border border-white/10 bg-slate-900/60 p-2">
        <div className="flex items-center gap-2"><span className="text-[0.5625rem] text-slate-500 w-14">Scrub</span><input type="range" min="0" max={totalDuration} step="10" value={Math.min(scrubMs,totalDuration)} onChange={(e)=>{const ms=Number(e.target.value);setScrubMs(ms);onPreviewState?.(evaluatePreviewAnimationsAtTime(animations,ms));}} className="flex-1"/><span className="w-16 text-right font-mono text-[0.5625rem] text-slate-400">{Math.round(scrubMs)} ms</span><button type="button" onClick={()=>{setScrubMs(0);onPreviewState?.(null);}} className="text-[0.5625rem] text-slate-400 hover:text-white">Reset</button></div>
      </div>

      <div className="space-y-1.5">
        {animations.map((animation, index) => {
          const targetLabel = targets.find((target) => target.id === animation.targetId)?.label || animation.targetId;
          const expanded = selectedAnimationId === animation.id;
          return <div key={animation.id} className={`rounded-lg border ${expanded?'border-purple-500/40':'border-white/10'} bg-slate-900/80`}>
            <div className="grid grid-cols-[28px_minmax(120px,1fr)_92px_112px_100px_64px] gap-2 items-center px-2 py-1.5">
              <button type="button" onClick={()=>setSelectedAnimationId(expanded?null:animation.id)} className="font-mono text-purple-400 font-bold text-left">{index+1}</button>
              <button type="button" onClick={()=>setSelectedAnimationId(expanded?null:animation.id)} className="truncate text-slate-200 font-medium text-left">{targetLabel}</button>
              <select value={animation.category} onChange={(e)=>{const category=e.target.value as PresentAnimationCategory;updateAnimation(animation.id,{category,effect:effectsByCategory[category][0]});}} className={inputClass}>{(['entrance','emphasis','exit','motion'] as PresentAnimationCategory[]).map((category)=><option key={category} value={category}>{category}</option>)}</select>
              <select value={animation.effect} onChange={(e)=>updateAnimation(animation.id,{effect:e.target.value as PresentAnimationEffect})} className={inputClass}>{effectsByCategory[animation.category || 'entrance'].map((effect)=><option key={effect} value={effect}>{effect}</option>)}</select>
              <select value={animation.trigger} onChange={(e)=>updateAnimation(animation.id,{trigger:e.target.value as PresentAnimation['trigger']})} className={inputClass}><option value="on-click">On Click</option><option value="with-previous">With Previous</option><option value="after-previous">After Previous</option><option value="object-trigger">Object Trigger</option></select>
              <div className="flex justify-end gap-0.5"><button type="button" aria-label="Move animation up" disabled={index===0} onClick={()=>commit(reorderPresentAnimations(animations,animation.id,-1))} className="p-0.5 text-slate-400 disabled:opacity-30"><ArrowUp className="w-3 h-3"/></button><button type="button" aria-label="Move animation down" disabled={index===animations.length-1} onClick={()=>commit(reorderPresentAnimations(animations,animation.id,1))} className="p-0.5 text-slate-400 disabled:opacity-30"><ArrowDown className="w-3 h-3"/></button><button type="button" aria-label="Delete animation" onClick={()=>removeAnimation(animation.id)} className="p-0.5 text-red-400"><Trash2 className="w-3 h-3"/></button></div>
            </div>
            {expanded && <div className="border-t border-white/10 p-2 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-1.5">
              <label className="text-[0.5625rem] text-slate-500">Duration<input type="number" min="50" max="60000" step="50" value={animation.durationMs} onChange={(e)=>updateAnimation(animation.id,{durationMs:Number(e.target.value)})} className={`w-full mt-0.5 ${inputClass}`}/></label>
              <label className="text-[0.5625rem] text-slate-500">Delay<input type="number" min="0" max="60000" step="50" value={animation.delayMs} onChange={(e)=>updateAnimation(animation.id,{delayMs:Number(e.target.value)})} className={`w-full mt-0.5 ${inputClass}`}/></label>
              <label className="text-[0.5625rem] text-slate-500">Repeat<input type="number" min="1" max="20" value={animation.repeatCount||1} onChange={(e)=>updateAnimation(animation.id,{repeatCount:Number(e.target.value)})} className={`w-full mt-0.5 ${inputClass}`}/></label>
              <label className="text-[0.5625rem] text-slate-500">Scope<select value={animation.scope||'object'} onChange={(e)=>updateAnimation(animation.id,{scope:e.target.value as PresentAnimationScope})} className={`w-full mt-0.5 ${inputClass}`}><option value="object">Object</option><option value="paragraph">Paragraph</option><option value="series">Series</option><option value="category">Category</option></select></label>
              <label className="text-[0.5625rem] text-slate-500">Scope index<input type="number" min="0" max="999" value={animation.scopeIndex||0} onChange={(e)=>updateAnimation(animation.id,{scopeIndex:Number(e.target.value)})} className={`w-full mt-0.5 ${inputClass}`}/></label>
              <label className="text-[0.5625rem] text-slate-500 flex flex-col">Rewind<span className="mt-1 flex items-center gap-1 text-slate-300"><input type="checkbox" checked={animation.rewind||false} onChange={(e)=>updateAnimation(animation.id,{rewind:e.target.checked})}/>after play</span></label>
              {animation.trigger==='object-trigger' && <label className="text-[0.5625rem] text-slate-500 col-span-2">Trigger object<select value={animation.triggerObjectId||''} onChange={(e)=>updateAnimation(animation.id,{triggerObjectId:e.target.value})} className={`w-full mt-0.5 ${inputClass}`}><option value="">Select…</option>{targets.filter((target)=>target.id!==animation.targetId).map((target)=><option key={target.id} value={target.id}>{target.label}</option>)}</select></label>}
              <button type="button" onClick={()=>runPreview([animation])} className="px-2 py-1 self-end rounded border border-purple-500/30 text-purple-200 flex items-center justify-center gap-1"><Play className="w-3 h-3"/>Preview</button>
              {animation.category==='motion' && <div className="col-span-full rounded border border-white/10 p-1.5"><div className="flex items-center justify-between mb-1"><span className="text-[0.5625rem] uppercase text-slate-500">Motion path control points</span><button type="button" onClick={()=>updateAnimation(animation.id,{motionPath:[...(animation.motionPath||[]),{xPercent:0,yPercent:0}]})} className="text-[0.5625rem] text-cyan-300">+ Point</button></div><div className="flex flex-wrap gap-1">{(animation.motionPath||[]).map((point,pointIndex)=><div key={pointIndex} className="flex items-center gap-1 rounded bg-slate-950 border border-white/10 px-1 py-0.5"><span className="text-[0.5rem] text-slate-500">{pointIndex+1}</span><input aria-label={`Motion point ${pointIndex+1} X`} type="number" min="-200" max="200" value={point.xPercent} onChange={(e)=>updateAnimation(animation.id,{motionPath:(animation.motionPath||[]).map((candidate,i)=>i===pointIndex?{...candidate,xPercent:Number(e.target.value)}:candidate)})} className="w-12 bg-transparent text-[0.5625rem] text-slate-300 outline-none"/><input aria-label={`Motion point ${pointIndex+1} Y`} type="number" min="-200" max="200" value={point.yPercent} onChange={(e)=>updateAnimation(animation.id,{motionPath:(animation.motionPath||[]).map((candidate,i)=>i===pointIndex?{...candidate,yPercent:Number(e.target.value)}:candidate)})} className="w-12 bg-transparent text-[0.5625rem] text-slate-300 outline-none"/>{(animation.motionPath||[]).length>2 && <button type="button" onClick={()=>updateAnimation(animation.id,{motionPath:(animation.motionPath||[]).filter((_,i)=>i!==pointIndex)})} className="text-red-400">×</button>}</div>)}</div></div>}
            </div>}
          </div>;
        })}
        {!animations.length && <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-slate-500 text-[0.625rem]">No animations yet. Choose a target and reusable preset, then add it to the sequence.</div>}
      </div>
      {selectedAnimation && <div className="mt-2 text-[0.5625rem] text-slate-600">Selected: {selectedAnimation.id}</div>}
    </div>
  );
};
