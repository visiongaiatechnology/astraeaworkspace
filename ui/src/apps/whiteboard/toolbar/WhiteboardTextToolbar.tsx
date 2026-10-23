// STATUS: PLATIN
// Typography toolbar for Whiteboard text labels (the "Schrifteditor" half of the text package).
//
// The allowed values are read from `model/whiteboardTextStyleEngine.ts` — this component renders the
// engine's lists, it does not keep a second one. Every control is a native, keyboard reachable element
// and every label comes from the shared seven-locale Whiteboard copy.

import React from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { whiteboardObjectsText, whiteboardObjectsTemplate } from '../whiteboardObjectsLocale';
import type { WhiteboardItem, WhiteboardTextStyle } from '../types';
import {
  WHITEBOARD_TEXT_ALIGNS,
  WHITEBOARD_TEXT_FAMILIES,
  WHITEBOARD_TEXT_SIZE_MAX,
  WHITEBOARD_TEXT_SIZE_MIN,
  WHITEBOARD_TEXT_SIZE_OPTIONS,
  WHITEBOARD_TEXT_WEIGHTS,
  whiteboardTextStyleForItem,
} from '../model/whiteboardTextStyleEngine';

interface WhiteboardTextToolbarProps {
  selection: readonly WhiteboardItem[];
  /** Applies the patch to the current selection through the canonical mutation boundary. */
  onSetTextStyle: (patch: Partial<WhiteboardTextStyle>) => void;
  disabled?: boolean;
}

const FAMILY_LABEL: Readonly<Record<WhiteboardTextStyle['fontFamily'], string>> = { sans: 'sans', serif: 'serif', mono: 'mono' };
const ALIGN_LABEL: Readonly<Record<WhiteboardTextStyle['align'], string>> = { left: 'left', center: 'center', right: 'right' };

const control = 'rounded-md border border-white/10 bg-white/[.03] px-2 py-1.5 text-[0.6875rem] text-slate-300 hover:bg-white/[.08] disabled:cursor-not-allowed disabled:opacity-40';
const field = `${control} bg-slate-950`;

export const WhiteboardTextToolbar: React.FC<WhiteboardTextToolbarProps> = ({ selection, onSetTextStyle, disabled = false }) => {
  const { locale } = useWorkspaceLocale();
  const primary = selection[0];
  if (!primary) return null;
  const style = whiteboardTextStyleForItem(primary);

  return (
    <div
      className="whiteboard-toolbar__context whiteboard-toolbar__context--text"
      data-vgt-whiteboard-context="text"
      role="toolbar"
      aria-label={whiteboardObjectsText('textStyle', locale)}
      data-vgt-whiteboard-text-toolbar="true"
    >
      <span className="px-1 text-[0.6875rem] font-semibold text-cyan-200">
        {whiteboardObjectsTemplate('textStyleScope', locale, { count: selection.length })}
      </span>

      <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400">
        {whiteboardObjectsText('fontSize', locale)}
        <input
          className={`${field} w-14`}
          type="number"
          min={WHITEBOARD_TEXT_SIZE_MIN}
          max={WHITEBOARD_TEXT_SIZE_MAX}
          step={1}
          value={style.fontSize}
          aria-label={whiteboardObjectsText('fontSize', locale)}
          disabled={disabled}
          onChange={(event) => onSetTextStyle({ fontSize: Number(event.target.value) })}
        />
      </label>

      <div className="flex items-center gap-1" role="group" aria-label={whiteboardObjectsText('fontSizePresets', locale)}>
        {WHITEBOARD_TEXT_SIZE_OPTIONS.map((size) => (
          <button
            key={size}
            type="button"
            className={control}
            aria-pressed={style.fontSize === size}
            disabled={disabled}
            title={whiteboardObjectsTemplate('fontSizePreset', locale, { size })}
            onClick={() => onSetTextStyle({ fontSize: size })}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1" role="group" aria-label={whiteboardObjectsText('fontWeight', locale)}>
        {WHITEBOARD_TEXT_WEIGHTS.map((weight) => (
          <button
            key={weight}
            type="button"
            className={control}
            aria-pressed={style.fontWeight === weight}
            disabled={disabled}
            onClick={() => onSetTextStyle({ fontWeight: weight })}
          >
            {whiteboardObjectsText(weight === 'bold' ? 'bold' : 'normal', locale)}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1 text-[0.6875rem] text-slate-400">
        {whiteboardObjectsText('fontFamily', locale)}
        <select
          className={field}
          value={style.fontFamily}
          aria-label={whiteboardObjectsText('fontFamily', locale)}
          disabled={disabled}
          onChange={(event) => onSetTextStyle({ fontFamily: event.target.value as WhiteboardTextStyle['fontFamily'] })}
        >
          {WHITEBOARD_TEXT_FAMILIES.map((family) => (
            <option key={family} value={family}>{FAMILY_LABEL[family]}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1" role="group" aria-label={whiteboardObjectsText('textAlign', locale)}>
        {WHITEBOARD_TEXT_ALIGNS.map((align) => (
          <button
            key={align}
            type="button"
            className={control}
            aria-pressed={style.align === align}
            aria-label={`${whiteboardObjectsText('textAlign', locale)}: ${ALIGN_LABEL[align]}`}
            disabled={disabled}
            onClick={() => onSetTextStyle({ align })}
          >
            {ALIGN_LABEL[align]}
          </button>
        ))}
      </div>

      <p className="px-1 text-[0.6875rem] text-slate-500">{whiteboardObjectsText('textStyleHint', locale)}</p>
    </div>
  );
};
