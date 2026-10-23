// STATUS: PLATIN — Present Round 42: per-object animation inspector.
//
// The animation engine and the full timeline pane already existed (`PresentAnimationPane`, presets
// fade-in/out, fly, zoom, pulse, spin, motion-path, duration/delay/trigger). Users could not find
// them, so this panel exposes the same model directly for the selected object:
//   - preset selection (incl. Fade in / Fade out),
//   - duration (ms), delay (ms), trigger,
//   - preview through the existing engine preview state,
//   - remove the object's animation.
// It writes into the existing `slide.animations` array — no new animation model.
import React from 'react';
import type { PresentAnimation, PresentSceneObject } from '../../../../shared/contracts/workspace';
import { Play, Trash2 } from 'lucide-react';
import {
  PRESENT_ANIMATION_PRESETS,
  createPresentAnimation,
  normalizePresentAnimation,
} from '../../animations/presentAnimationEngine';

interface Props {
  object: PresentSceneObject;
  animations: readonly PresentAnimation[];
  onUpdateAnimations: (animations: PresentAnimation[]) => void;
  onPreviewAnimation?: (animation: PresentAnimation | null) => void;
}

const inputClass = 'w-full rounded-md border border-white/10 bg-slate-950/80 px-1.5 py-1 text-[0.625rem] text-slate-100 outline-none focus:border-cyan-400/60';

export const PresentObjectAnimationPanel: React.FC<Props> = ({ object, animations, onUpdateAnimations, onPreviewAnimation }) => {
  const existing = animations.find((animation) => animation.targetId === object.id) ?? null;

  const upsert = (next: PresentAnimation) => {
    const normalized = normalizePresentAnimation(next);
    const index = animations.findIndex((animation) => animation.id === normalized.id);
    const nextList = index >= 0
      ? animations.map((animation) => (animation.id === normalized.id ? normalized : animation))
      : [...animations, normalized];
    onUpdateAnimations(nextList);
  };

  const addPreset = (presetId: string) => {
    const preset = PRESENT_ANIMATION_PRESETS.find((candidate) => candidate.id === presetId) ?? PRESENT_ANIMATION_PRESETS[0];
    const created = createPresentAnimation(object.id, preset.id, animations.length);
    upsert(existing
      ? { ...created, id: existing.id, trigger: existing.trigger, delayMs: existing.delayMs, repeatCount: existing.repeatCount }
      : created);
  };

  const patch = (patchValue: Partial<PresentAnimation>) => {
    if (!existing) return;
    upsert({ ...existing, ...patchValue });
  };

  const remove = () => {
    onPreviewAnimation?.(null);
    onUpdateAnimations(animations.filter((animation) => animation.id !== existing?.id));
  };

  const presetForEffect = PRESENT_ANIMATION_PRESETS.find((preset) => preset.effect === existing?.effect);

  return (
    <div className="space-y-2 border-t border-white/10 pt-3" data-present-animation-panel="true">
      <div className="flex items-center justify-between">
        <span className="text-[0.625rem] font-mono uppercase text-slate-400">Animation</span>
        {existing && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onPreviewAnimation?.(existing)} aria-label="Preview object animation" className="flex items-center gap-1 rounded-md border border-purple-500/30 px-1.5 py-0.5 text-[0.625rem] text-purple-200 hover:bg-purple-500/10">
              <Play className="h-3 w-3" /> Preview
            </button>
            <button type="button" onClick={remove} aria-label="Remove object animation" className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-red-300">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      <label className="block space-y-0.5 text-[0.625rem] text-slate-400">
        <span>Preset</span>
        <select
          aria-label="Animation preset"
          value={existing ? (presetForEffect?.id ?? '') : ''}
          onChange={(event) => { if (event.target.value) addPreset(event.target.value); }}
          className={inputClass}
        >
          <option value="">{existing ? 'Change preset…' : 'Add animation…'}</option>
          {PRESENT_ANIMATION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>
      {existing ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Duration (ms)</span>
              <input aria-label="Animation duration" type="number" min={100} max={20_000} step={50} value={existing.durationMs} onChange={(event) => patch({ durationMs: Math.max(100, Math.min(20_000, Number(event.target.value) || 450)) })} className={inputClass} />
            </label>
            <label className="space-y-0.5 text-[0.625rem] text-slate-400">
              <span>Delay (ms)</span>
              <input aria-label="Animation delay" type="number" min={0} max={20_000} step={50} value={existing.delayMs} onChange={(event) => patch({ delayMs: Math.max(0, Math.min(20_000, Number(event.target.value) || 0)) })} className={inputClass} />
            </label>
          </div>
          <label className="block space-y-0.5 text-[0.625rem] text-slate-400">
            <span>Trigger</span>
            <select aria-label="Animation trigger" value={existing.trigger} onChange={(event) => patch({ trigger: event.target.value as PresentAnimation['trigger'] })} className={inputClass}>
              <option value="on-click">On click</option>
              <option value="with-previous">With previous</option>
              <option value="after-previous">After previous</option>
            </select>
          </label>
          <p className="text-[0.5625rem] leading-4 text-slate-500">Plays in the slideshow (Presenter mode) with the existing animation engine.</p>
        </>
      ) : (
        <p className="text-[0.5625rem] leading-4 text-slate-500">No animation on this object yet — choose a preset (e.g. Fade in / Fade out).</p>
      )}
    </div>
  );
};
