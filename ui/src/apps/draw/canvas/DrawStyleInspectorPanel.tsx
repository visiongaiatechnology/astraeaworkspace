// STATUS: DIAMANT VGT SUPREME — Draw Shape Style Inspector (fill, border, shadow, typography, align).
//
// The panel reads through `describeDrawSelectionStyle` (the single read model) and writes only through
// the canvas session, so a style fact has exactly one writer. Mixed values are marked rather than
// silently shown as the first object's value, and an empty/locked selection renders an explicit state.
import React from 'react';
import type { DrawDocumentModel } from '../../../shared/contracts/draw/workspaceDraw';
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { drawInteractionText } from '../drawInteractionLocale';
import { projectDrawScene } from '../interactions/drawSceneProjection';
import {
  DRAW_DASH_PRESETS, DRAW_FILL_PRESETS, DRAW_FONT_SIZE_STEPS, DRAW_SHADOW_PRESETS, DRAW_STROKE_PRESETS,
  DRAW_STROKE_WIDTH_STEPS, activeDashPresetIndex, activeShadowPresetId, describeDrawSelectionStyle,
} from '../interactions/drawStyleEngine';
import type { DrawSessionCommand } from '../interactions/drawCanvasSession';

export interface DrawStyleInspectorPanelProps {
  readonly model: DrawDocumentModel;
  readonly locale: WorkspaceLocale;
  readonly selectedIds: readonly string[];
  readonly onCommand: (command: DrawSessionCommand) => void;
}

const FIELD = 'rounded border border-white/15 bg-slate-950 px-1.5 py-0.5 text-[0.6875rem] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300';
const TOGGLE = 'rounded border border-white/15 px-1.5 py-0.5 text-[0.625rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 aria-pressed:bg-sky-500/30';

export const DrawStyleInspectorPanel: React.FC<DrawStyleInspectorPanelProps> = ({ model, locale, selectedIds, onCommand }) => {
  const t = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);
  const scene = projectDrawScene(model, model.activePageId);
  const snapshot = describeDrawSelectionStyle(scene, selectedIds);
  const mixed = (key: string): string => (snapshot.mixed.includes(key) ? ` (${t('styleMixed')})` : '');
  const disabled = snapshot.empty || snapshot.readOnly;

  return (
    <section
      data-vgt-panel="style-inspector"
      data-vgt-style-empty={snapshot.empty ? 'true' : 'false'}
      data-vgt-style-readonly={snapshot.readOnly ? 'true' : 'false'}
      data-vgt-style-mixed={snapshot.mixed.join(',')}
      className="flex w-72 flex-col gap-2 overflow-auto border-l border-white/10 bg-slate-900/60 p-3"
      aria-label={t('styleInspector')}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{t('styleInspector')}</h2>
      {snapshot.empty ? <p className="text-[0.6875rem] text-slate-400">{t('styleEmpty')}</p> : null}
      {snapshot.readOnly ? <p data-vgt-style-locked="true" role="status" className="text-[0.6875rem] text-amber-200">{t('styleReadOnly')}</p> : null}

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('fill')}{mixed('fill')}
        <span className="flex items-center gap-1">
          <input
            data-vgt-style="fill" type="color" className="h-6 w-10 rounded border border-white/15 bg-slate-950"
            value={/^#[0-9a-f]{6}$/iu.test(snapshot.fill) ? snapshot.fill : '#1e293b'} disabled={disabled}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onCommand({ kind: 'style', patch: { fill: event.target.value } })}
            aria-label={t('fill')}
          />
          <span className="flex flex-wrap gap-1">
            {DRAW_FILL_PRESETS.map((color) => (
              <button
                key={color} type="button" data-vgt-style-preset={`fill:${color}`} className={TOGGLE}
                disabled={disabled} aria-pressed={snapshot.fill === color}
                onClick={() => onCommand({ kind: 'style', patch: { fill: color } })}
                aria-label={`${t('fill')}: ${color}`}
              >{color}</button>
            ))}
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('stroke')}{mixed('stroke')}
        <span className="flex flex-wrap gap-1">
          {DRAW_STROKE_PRESETS.map((color) => (
            <button
              key={color} type="button" data-vgt-style-preset={`stroke:${color}`} className={TOGGLE}
              disabled={disabled} aria-pressed={snapshot.stroke === color}
              onClick={() => onCommand({ kind: 'style', patch: { stroke: color } })}
              aria-label={`${t('stroke')}: ${color}`}
            >{color}</button>
          ))}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('strokeWidth')}{mixed('strokeWidth')}
        <select
          data-vgt-style="strokeWidth" className={FIELD} disabled={disabled} value={String(snapshot.strokeWidth)}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onCommand({ kind: 'style', patch: { strokeWidth: Number(event.target.value) } })}
        >
          {DRAW_STROKE_WIDTH_STEPS.map((width) => <option key={width} value={width}>{width}</option>)}
          {DRAW_STROKE_WIDTH_STEPS.includes(snapshot.strokeWidth) ? null : <option value={snapshot.strokeWidth}>{snapshot.strokeWidth}</option>}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1 text-[0.625rem] text-slate-300" disabled={disabled}>
        <legend>{t('dashStyle')}{mixed('dash')}</legend>
        <span className="flex flex-wrap gap-1">
          {DRAW_DASH_PRESETS.map((dash, index) => (
            <button
              key={dash.join(',') || 'solid'} type="button" data-vgt-style-preset={`dash:${index}`} className={TOGGLE}
              aria-pressed={activeDashPresetIndex(snapshot.dash) === index}
              onClick={() => onCommand({ kind: 'style', patch: { dash: [...dash] } })}
              aria-label={`${t('dashStyle')}: ${dash.join(' ') || 'solid'}`}
            >{dash.length === 0 ? '—' : dash.join(' ')}</button>
          ))}
        </span>
      </fieldset>

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('cornerRadius')}{mixed('cornerRadius')}
        <input
          data-vgt-style="cornerRadius" type="range" min={0} max={64} step={1} disabled={disabled} value={snapshot.cornerRadius}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onCommand({ kind: 'style', patch: { cornerRadius: Number(event.target.value) } })}
          aria-label={t('cornerRadius')}
        />
        <output className="text-[0.625rem] text-slate-400">{snapshot.cornerRadius}</output>
      </label>

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('opacity')}{mixed('opacity')}
        <input
          data-vgt-style="opacity" type="range" min={0} max={1} step={0.05} disabled={disabled} value={snapshot.opacity}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onCommand({ kind: 'style', patch: { opacity: Number(event.target.value) } })}
          aria-label={t('opacity')}
        />
        <output className="text-[0.625rem] text-slate-400">{Math.round(snapshot.opacity * 100)}%</output>
      </label>

      <fieldset className="flex flex-col gap-1 text-[0.625rem] text-slate-300" disabled={disabled}>
        <legend>{t('shadow')}{mixed('shadow')}</legend>
        <span className="flex flex-wrap gap-1">
          {DRAW_SHADOW_PRESETS.map((preset) => (
            <button
              key={preset.id} type="button" data-vgt-style-preset={`shadow:${preset.id}`} className={TOGGLE}
              aria-pressed={activeShadowPresetId(snapshot.shadow) === preset.id}
              onClick={() => onCommand({ kind: 'shadow', shadow: preset.shadow ?? undefined })}
              aria-label={`${t('shadow')}: ${preset.label}`}
            >{preset.label}</button>
          ))}
        </span>
      </fieldset>

      <fieldset className="flex flex-col gap-1 text-[0.625rem] text-slate-300" disabled={disabled}>
        <legend>{t('fontSize')}{mixed('fontSize')}</legend>
        <span className="flex flex-wrap gap-1">
          {DRAW_FONT_SIZE_STEPS.map((size) => (
            <button
              key={size} type="button" data-vgt-style-preset={`fontSize:${size}`} className={TOGGLE}
              aria-pressed={snapshot.typography.fontSize === size}
              onClick={() => onCommand({ kind: 'typography', patch: { fontSize: size } })}
              aria-label={`${t('fontSize')}: ${size}`}
            >{size}</button>
          ))}
          <button type="button" data-vgt-style-preset="bold" className={TOGGLE} aria-pressed={snapshot.typography.bold}
            onClick={() => onCommand({ kind: 'typography', patch: { bold: !snapshot.typography.bold } })} aria-label={t('bold')}><strong>B</strong></button>
          <button type="button" data-vgt-style-preset="italic" className={TOGGLE} aria-pressed={snapshot.typography.italic}
            onClick={() => onCommand({ kind: 'typography', patch: { italic: !snapshot.typography.italic } })} aria-label={t('italic')}><em>I</em></button>
          <button type="button" data-vgt-style-preset="underline" className={TOGGLE} aria-pressed={snapshot.typography.underline}
            onClick={() => onCommand({ kind: 'typography', patch: { underline: !snapshot.typography.underline } })} aria-label={t('underline')}><u>U</u></button>
        </span>
      </fieldset>

      <label className="flex flex-col gap-1 text-[0.625rem] text-slate-300">
        {t('verticalAlign')}{mixed('verticalAlign')}
        <select
          data-vgt-style="verticalAlign" className={FIELD} disabled={disabled} value={snapshot.typography.verticalAlign}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onCommand({ kind: 'typography', patch: { verticalAlign: event.target.value as 'top' | 'middle' | 'bottom' } })}
        >
          <option value="top">{t('alignTop')}</option>
          <option value="middle">{t('alignMiddle')}</option>
          <option value="bottom">{t('alignBottom')}</option>
        </select>
      </label>

      <fieldset className="flex flex-col gap-1 text-[0.625rem] text-slate-300" disabled={disabled}>
        <legend>{`${t('alignLeft')} / ${t('alignTop')}`}</legend>
        <span className="flex flex-wrap gap-1">
          {([['align-left', 'alignLeft'], ['align-center', 'alignCenter'], ['align-right', 'alignRight'],
            ['align-top', 'alignTop'], ['align-middle', 'alignMiddle'], ['align-bottom', 'alignBottom']] as const).map(([operation, label]) => (
            <button
              key={operation} type="button" data-vgt-style-preset={`align:${operation}`} className={TOGGLE}
              onClick={() => onCommand({ kind: 'align', operation })}
              aria-label={t(label)}
            >{t(label)}</button>
          ))}
        </span>
      </fieldset>
    </section>
  );
};

export default DrawStyleInspectorPanel;
