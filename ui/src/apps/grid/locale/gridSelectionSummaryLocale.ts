// STATUS: PLATIN — complete seven-locale copy for the visible Grid selection summary.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export interface GridSelectionSummaryCopy {
  readonly label: string;
  readonly rows: (count: number) => string;
  readonly columns: (count: number) => string;
  readonly sum: (value: string) => string;
  readonly average: (value: string) => string;
  readonly format: (label: string) => string;
  readonly empty: string;
}

export const GRID_SELECTION_SUMMARY_COPY: Readonly<Record<WorkspaceLocale, GridSelectionSummaryCopy>> = {
  'de-DE': {
    label: 'Auswahl',
    rows: (count) => `${count} ${count === 1 ? 'Zeile' : 'Zeilen'}`,
    columns: (count) => `${count} ${count === 1 ? 'Spalte' : 'Spalten'}`,
    sum: (value) => `Summe ${value}`,
    average: (value) => `Mittelwert ${value}`,
    format: (label) => `Format ${label}`,
    empty: 'leer',
  },
  'en-US': {
    label: 'Selection',
    rows: (count) => `${count} ${count === 1 ? 'row' : 'rows'}`,
    columns: (count) => `${count} ${count === 1 ? 'column' : 'columns'}`,
    sum: (value) => `Sum ${value}`,
    average: (value) => `Average ${value}`,
    format: (label) => `Format ${label}`,
    empty: 'empty',
  },
  'es-ES': {
    label: 'Selección',
    rows: (count) => `${count} ${count === 1 ? 'fila' : 'filas'}`,
    columns: (count) => `${count} ${count === 1 ? 'columna' : 'columnas'}`,
    sum: (value) => `Suma ${value}`,
    average: (value) => `Promedio ${value}`,
    format: (label) => `Formato ${label}`,
    empty: 'vacío',
  },
  'it-IT': {
    label: 'Selezione',
    rows: (count) => `${count} ${count === 1 ? 'riga' : 'righe'}`,
    columns: (count) => `${count} ${count === 1 ? 'colonna' : 'colonne'}`,
    sum: (value) => `Somma ${value}`,
    average: (value) => `Media ${value}`,
    format: (label) => `Formato ${label}`,
    empty: 'vuoto',
  },
  'ja-JP': {
    label: '選択',
    rows: (count) => `${count} 行`,
    columns: (count) => `${count} 列`,
    sum: (value) => `合計 ${value}`,
    average: (value) => `平均 ${value}`,
    format: (label) => `表示形式 ${label}`,
    empty: '空',
  },
  'ru-RU': {
    label: 'Выделение',
    rows: (count) => `${count} ${count === 1 ? 'строка' : 'строк'}`,
    columns: (count) => `${count} ${count === 1 ? 'столбец' : 'столбцов'}`,
    sum: (value) => `Сумма ${value}`,
    average: (value) => `Среднее ${value}`,
    format: (label) => `Формат ${label}`,
    empty: 'пусто',
  },
  'zh-CN': {
    label: '选区',
    rows: (count) => `${count} 行`,
    columns: (count) => `${count} 列`,
    sum: (value) => `求和 ${value}`,
    average: (value) => `平均值 ${value}`,
    format: (label) => `格式 ${label}`,
    empty: '空',
  },
} satisfies Record<WorkspaceLocale, GridSelectionSummaryCopy>;
