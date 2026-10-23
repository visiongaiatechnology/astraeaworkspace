// STATUS: PLATIN — pure read model for the Draw Shape Style Inspector (no mutation, no React).
//
// The inspector needs to show "what is selected right now". That answer is derived here from the
// canonical scene projection; every mutation stays in `drawCommandEngine`, so the inspector never
// writes a style fact of its own.
import type { DrawArrowhead, DrawVectorStyle } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError } from '../model/drawDocumentValidation';
import { DEFAULT_DRAW_STYLE } from '../model/drawVectorEngine';
import { describeDrawObjectTypography, type DrawTypographySnapshot } from './drawTextLayout';
import type { DrawScene } from './drawSceneProjection';

export interface DrawShadowPreset {
  readonly id: string;
  readonly label: string;
  readonly shadow: DrawVectorStyle['shadow'] | null;
}

/** Bounded, labelled presets — the inspector never accepts a free-form shadow. */
export const DRAW_SHADOW_PRESETS: readonly DrawShadowPreset[] = Object.freeze([
  { id: 'none', label: 'No shadow', shadow: null },
  { id: 'soft', label: 'Soft', shadow: { x: 0, y: 2, blur: 6, color: '#0f172a', opacity: 0.45 } },
  { id: 'raised', label: 'Raised', shadow: { x: 2, y: 4, blur: 10, color: '#0f172a', opacity: 0.65 } },
  { id: 'hard', label: 'Hard', shadow: { x: 6, y: 6, blur: 0, color: '#020617', opacity: 0.8 } },
]);

export const DRAW_DASH_PRESETS: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([]),
  Object.freeze([8, 4]),
  Object.freeze([2, 3]),
  Object.freeze([12, 4, 2, 4]),
]);

export const DRAW_FILL_PRESETS: readonly string[] = Object.freeze([
  '#1e293b', '#0f172a', '#334155', '#475569', '#0b3b2e', '#3b1d0b', 'none',
]);

export const DRAW_STROKE_PRESETS: readonly string[] = Object.freeze([
  '#60a5fa', '#f8fafc', '#94a3b8', '#f59e0b', '#ef4444', '#22c55e', 'none',
]);

export const DRAW_FONT_SIZE_STEPS: readonly number[] = Object.freeze([10, 12, 14, 18, 24, 32, 48]);
export const DRAW_STROKE_WIDTH_STEPS: readonly number[] = Object.freeze([0, 1, 2, 4, 8]);

export interface DrawStyleSnapshot {
  readonly count: number;
  readonly empty: boolean;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dash: readonly number[];
  readonly cornerRadius: number;
  readonly opacity: number;
  readonly shadow: DrawVectorStyle['shadow'] | null;
  readonly arrowStart: DrawArrowhead;
  readonly arrowEnd: DrawArrowhead;
  readonly typography: DrawTypographySnapshot;
  /** Keys whose value differs across the selection; the inspector renders these as "mixed". */
  readonly mixed: readonly string[];
  /** True when at least one selected object cannot carry vector style (connector/group/frame). */
  readonly hasStylelessObjects: boolean;
  /** True when every selected object is locked (all inspector writes would fail closed). */
  readonly readOnly: boolean;
}

const ARROWHEADS: ReadonlySet<string> = new Set(['none', 'triangle', 'open', 'diamond', 'circle']);

function arrowhead(value: unknown): DrawArrowhead {
  return typeof value === 'string' && ARROWHEADS.has(value) ? (value as DrawArrowhead) : 'none';
}

/**
 * Derives the inspector state. Unknown/dead ids are ignored; an empty live selection yields
 * `empty: true` so the panel can render an explicit empty state instead of a disabled form.
 */
export function describeDrawSelectionStyle(scene: DrawScene, ids: readonly string[]): DrawStyleSnapshot {
  if (!Array.isArray(ids)) throw new DrawModelError('selection-id-invalid');
  const entries = ids.map((id) => scene.byId.get(id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const styleless = entries.filter((entry) => entry.object.type !== 'shape' || !entry.object.vector);
  const shapes = entries.filter((entry) => entry.object.type === 'shape' && entry.object.vector);

  if (entries.length === 0) {
    return {
      count: 0,
      empty: true,
      fill: DEFAULT_DRAW_STYLE.fill,
      stroke: DEFAULT_DRAW_STYLE.stroke,
      strokeWidth: DEFAULT_DRAW_STYLE.strokeWidth,
      dash: [],
      cornerRadius: DEFAULT_DRAW_STYLE.cornerRadius,
      opacity: DEFAULT_DRAW_STYLE.opacity,
      shadow: null,
      arrowStart: 'none',
      arrowEnd: 'none',
      typography: {
        fontSize: 14, bold: false, italic: false, underline: false,
        color: null, fontFamily: null, verticalAlign: 'middle', autoFit: 'shrink',
      },
      mixed: [],
      hasStylelessObjects: false,
      readOnly: false,
    };
  }

  const first = shapes[0] ?? entries[0]!;
  const firstStyle: DrawVectorStyle = first.object.vector?.style ?? DEFAULT_DRAW_STYLE;
  const mixed = new Set<string>();
  const same = (key: string, read: (value: (typeof entries)[number]) => unknown): void => {
    const reference = JSON.stringify(read(first));
    for (const entry of entries) if (JSON.stringify(read(entry)) !== reference) mixed.add(key);
  };

  same('fill', (entry) => entry.object.vector?.style.fill);
  same('stroke', (entry) => entry.object.vector?.style.stroke);
  same('strokeWidth', (entry) => entry.object.vector?.style.strokeWidth);
  same('dash', (entry) => entry.object.vector?.style.dash);
  same('cornerRadius', (entry) => entry.object.vector?.style.cornerRadius);
  same('opacity', (entry) => entry.object.opacity);
  same('shadow', (entry) => entry.object.vector?.style.shadow ?? null);
  same('arrowStart', (entry) => entry.object.vector?.style.arrowStart ?? 'none');
  same('arrowEnd', (entry) => entry.object.vector?.style.arrowEnd ?? 'none');
  same('fontSize', (entry) => describeDrawObjectTypography(entry.object).fontSize);
  same('bold', (entry) => describeDrawObjectTypography(entry.object).bold);
  same('italic', (entry) => describeDrawObjectTypography(entry.object).italic);
  same('underline', (entry) => describeDrawObjectTypography(entry.object).underline);
  same('verticalAlign', (entry) => describeDrawObjectTypography(entry.object).verticalAlign);

  return {
    count: entries.length,
    empty: false,
    fill: firstStyle.fill,
    stroke: firstStyle.stroke,
    strokeWidth: firstStyle.strokeWidth,
    dash: firstStyle.dash,
    cornerRadius: firstStyle.cornerRadius,
    opacity: first.object.opacity,
    shadow: firstStyle.shadow ?? null,
    arrowStart: arrowhead(firstStyle.arrowStart),
    arrowEnd: arrowhead(firstStyle.arrowEnd),
    typography: describeDrawObjectTypography(first.object),
    mixed: [...mixed].sort(),
    hasStylelessObjects: styleless.length > 0,
    readOnly: entries.every((entry) => entry.locked),
  };
}

/** Matches the stored dash against the presets so the inspector can mark the active one. */
export function activeDashPresetIndex(dash: readonly number[]): number {
  const key = dash.join(',');
  const index = DRAW_DASH_PRESETS.findIndex((preset) => preset.join(',') === key);
  return index >= 0 ? index : -1;
}

export function activeShadowPresetId(shadow: DrawVectorStyle['shadow'] | null): string {
  if (!shadow) return 'none';
  const key = `${shadow.x},${shadow.y},${shadow.blur},${shadow.color},${shadow.opacity}`;
  const found = DRAW_SHADOW_PRESETS.find((preset) => preset.shadow
    && `${preset.shadow.x},${preset.shadow.y},${preset.shadow.blur},${preset.shadow.color},${preset.shadow.opacity}` === key);
  return found ? found.id : 'custom';
}
