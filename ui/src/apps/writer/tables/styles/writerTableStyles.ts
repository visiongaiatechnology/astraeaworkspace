// STATUS: PLATIN — Sovereign Table Design Templates & Dynamic Style Resolvers
import type { WriterTableBlockData, WriterTableStyleDefinition } from '../../../../shared/contracts/workspace';

export interface WriterTableDesignPreset extends WriterTableStyleDefinition {
  description: string;
  totalRowBackground?: string;
  accentBorderColor?: string;
}

export const WRITER_TABLE_DESIGN_PRESETS: WriterTableDesignPreset[] = [
  {
    id: 'grid-neutral',
    label: 'Raster Neutral',
    description: 'Ausgewogenes technisches Slate-Design mit klaren Kontrasten',
    headerBackground: '#1e293b',
    rowBackground: '#0f172a',
    alternateRowBackground: '#172033',
    borderColor: '#334155',
    textColor: '#e2e8f0',
    totalRowBackground: '#1e293b',
    accentBorderColor: '#64748b',
  },
  {
    id: 'grid-accent',
    label: 'Raster Indigo Akzent',
    description: 'Hervorgehobene Kopfzeile in leuchtendem Indigo für formelle Reports',
    headerBackground: '#4338ca',
    rowBackground: '#0f172a',
    alternateRowBackground: '#1e1b4b',
    borderColor: '#6366f1',
    textColor: '#f8fafc',
    totalRowBackground: '#312e81',
    accentBorderColor: '#818cf8',
  },
  {
    id: 'clean-minimal',
    label: 'Clean Minimal',
    description: 'Subtile Zink-Konturen für maximale Lese-Klarheit',
    headerBackground: '#27272a',
    rowBackground: '#09090b',
    alternateRowBackground: '#18181b',
    borderColor: '#3f3f46',
    textColor: '#f4f4f5',
    totalRowBackground: '#27272a',
    accentBorderColor: '#71717a',
  },
  {
    id: 'corporate-dark',
    label: 'Corporate Slate & Cyan',
    description: 'Professionelles Business-Design mit Cyan-Akzenten',
    headerBackground: '#0e7490',
    rowBackground: '#030712',
    alternateRowBackground: '#082f49',
    borderColor: '#0891b2',
    textColor: '#ecfeff',
    totalRowBackground: '#155e75',
    accentBorderColor: '#22d3ee',
  },
  {
    id: 'emerald-finance',
    label: 'Finanzberichte Smaragd',
    description: 'Souveränes Smaragdgrün für Bilanzen, Budgets und Finanzkennzahlen',
    headerBackground: '#047857',
    rowBackground: '#022c22',
    alternateRowBackground: '#064e3b',
    borderColor: '#059669',
    textColor: '#ecfdf5',
    totalRowBackground: '#065f46',
    accentBorderColor: '#34d399',
  },
  {
    id: 'warm-executive',
    label: 'Executive Bernstein',
    description: 'Warme Bernstein- & Terrakotta-Nuancen für hochwertige Dokumente',
    headerBackground: '#7c2d12',
    rowBackground: '#1c1917',
    alternateRowBackground: '#292524',
    borderColor: '#b45309',
    textColor: '#fef3c7',
    totalRowBackground: '#451a03',
    accentBorderColor: '#f59e0b',
  },
];

export interface ResolvedCellStyle {
  background: string;
  color: string;
  borderColor: string;
  fontWeight: 'normal' | 'bold' | 'semibold';
  borderBottomStyle?: string;
  borderBottomWidth?: string;
}

/**
 * Resolves the visual appearance for a specific table cell.
 */
export function resolveTableCellAppearance(
  table: WriterTableBlockData,
  rowIndex: number,
  colIndex: number,
  totalRows: number,
  totalCols: number
): ResolvedCellStyle {
  const styleId = table.styleId ?? 'grid-neutral';
  const preset = WRITER_TABLE_DESIGN_PRESETS.find((p) => p.id === styleId) ?? WRITER_TABLE_DESIGN_PRESETS[0];

  const isTotalRow = table.totalRowHighlight && rowIndex === totalRows - 1 && totalRows > 1;
  const isFirstCol = table.firstColumnHighlight && colIndex === 0;
  const isLastCol = table.lastColumnHighlight && colIndex === totalCols - 1;
  const useAlternating = table.alternatingRows !== false;

  let background = preset.rowBackground;
  if (isTotalRow && preset.totalRowBackground) {
    background = preset.totalRowBackground;
  } else if (useAlternating && rowIndex % 2 === 1) {
    background = preset.alternateRowBackground;
  }

  // Column highlights can add slight tinting
  if (!isTotalRow) {
    if (isFirstCol) {
      background = adjustColorOpacity(preset.headerBackground, 0.25) || background;
    } else if (isLastCol) {
      background = adjustColorOpacity(preset.headerBackground, 0.18) || background;
    }
  }

  let fontWeight: 'normal' | 'bold' | 'semibold' = 'normal';
  if (isTotalRow || isFirstCol) {
    fontWeight = 'bold';
  } else if (isLastCol) {
    fontWeight = 'semibold';
  }

  let borderBottomStyle = undefined;
  let borderBottomWidth = undefined;
  if (isTotalRow) {
    borderBottomStyle = 'double';
    borderBottomWidth = '3px';
  }

  return {
    background,
    color: preset.textColor,
    borderColor: preset.borderColor,
    fontWeight,
    borderBottomStyle,
    borderBottomWidth,
  };
}

/**
 * Resolves header cell appearance.
 */
export function resolveTableHeaderAppearance(
  table: WriterTableBlockData,
  _colIndex: number,
  _totalCols: number
): ResolvedCellStyle {
  const styleId = table.styleId ?? 'grid-neutral';
  const preset = WRITER_TABLE_DESIGN_PRESETS.find((p) => p.id === styleId) ?? WRITER_TABLE_DESIGN_PRESETS[0];

  const useHeaderHighlight = table.headerRowHighlight !== false;
  const background = useHeaderHighlight ? preset.headerBackground : preset.rowBackground;

  return {
    background,
    color: preset.textColor,
    borderColor: preset.borderColor,
    fontWeight: 'bold',
  };
}

function adjustColorOpacity(hex: string, opacity: number): string | null {
  if (!hex || !hex.startsWith('#')) return null;
  const clean = hex.slice(1);
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return null;
}
