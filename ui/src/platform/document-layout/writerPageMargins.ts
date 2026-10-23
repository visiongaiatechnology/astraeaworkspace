// STATUS: PLATIN — Canonical Writer margin, binding-gutter and facing-page geometry
import type { WriterMarginPreset, WriterPageSetupConfig } from '../../shared/contracts/workspace';

export interface WriterMarginDefinitionMm {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
  gutter: number;
  mirrored: boolean;
}

export interface WriterPhysicalPageMarginsMm extends WriterMarginDefinitionMm {
  left: number;
  right: number;
  pageSide: 'left' | 'right';
}

type PresetGeometry = Omit<WriterMarginDefinitionMm, 'gutter' | 'mirrored'>;

export const WRITER_MARGIN_PRESETS_MM: Readonly<Record<Exclude<WriterMarginPreset, 'custom'>, PresetGeometry>> = {
  normal: { top: 25.4, bottom: 25.4, inside: 25.4, outside: 25.4 },
  narrow: { top: 12.7, bottom: 12.7, inside: 12.7, outside: 12.7 },
  wide: { top: 25.4, bottom: 25.4, inside: 50.8, outside: 50.8 },
  mirrored: { top: 25.4, bottom: 25.4, inside: 31.75, outside: 25.4 },
};

export function resolveWriterMarginDefinitionMm(
  pageSetup: WriterPageSetupConfig,
): WriterMarginDefinitionMm {
  const mirrored = pageSetup.margins === 'mirrored' || pageSetup.mirroredMargins === true;
  const custom = pageSetup.customMargins;
  const customIsActive = custom !== undefined && (
      pageSetup.margins === 'custom' ||
      pageSetup.margins === 'mirrored' ||
      pageSetup.mirroredMargins === true
    );

  if (customIsActive && custom) {
    return {
      top: custom.top,
      bottom: custom.bottom,
      inside: custom.left,
      outside: custom.right,
      gutter: custom.gutter ?? 0,
      mirrored,
    };
  }

  const preset = WRITER_MARGIN_PRESETS_MM[
    pageSetup.margins === 'custom' ? 'normal' : pageSetup.margins
  ];
  return { ...preset, gutter: 0, mirrored };
}

export function resolveWriterPhysicalPageMarginsMm(
  pageSetup: WriterPageSetupConfig,
  pageIndex = 1,
): WriterPhysicalPageMarginsMm {
  const definition = resolveWriterMarginDefinitionMm(pageSetup);
  const normalizedPageIndex = Math.max(1, Math.floor(pageIndex));
  const isEven = normalizedPageIndex % 2 === 0;
  const pageSide = isEven ? 'left' : 'right';

  if (!definition.mirrored) {
    return {
      ...definition,
      left: definition.inside + definition.gutter,
      right: definition.outside,
      pageSide,
    };
  }

  return {
    ...definition,
    left: isEven ? definition.outside : definition.inside + definition.gutter,
    right: isEven ? definition.inside + definition.gutter : definition.outside,
    pageSide,
  };
}
