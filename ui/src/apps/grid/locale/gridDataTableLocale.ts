// STATUS: PLATIN — localized Grid What-If Data Table copy and opaque failures.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type GridDataTableCopy = Readonly<{
  title: string;
  close: string;
  oneVariable: string;
  twoVariable: string;
  formulaCell: string;
  outputAnchor: string;
  columnInputCell: string;
  rowInputCell: string;
  columnValues: string;
  rowValues: string;
  calculate: string;
  calculatedMatrix: (evaluations: number) => string;
  applyTo: (cell: string) => string;
  applying: string;
  apply: string;
  notApplied: string;
  commitFailed: string;
  calculationFailed: string;
}>;

export const GRID_DATA_TABLE_COPY: Readonly<Record<WorkspaceLocale, GridDataTableCopy>> = {
  'en-US': { title: 'What-If Data Table Studio', close: 'Close Grid Data Table dialog', oneVariable: 'One-Variable Data Table', twoVariable: 'Two-Variable Sensitivity Matrix', formulaCell: 'Formula cell', outputAnchor: 'Output anchor', columnInputCell: 'Column input cell', rowInputCell: 'Row input cell', columnValues: 'Column input values', rowValues: 'Row input values', calculate: 'Calculate data table', calculatedMatrix: (count) => `Computed matrix · ${count} evaluations`, applyTo: (cell) => `Apply to ${cell}`, applying: 'Applying…', apply: 'Apply', notApplied: 'The data-table result was not applied. Check cell permissions and workbook protection.', commitFailed: 'The data-table result could not be committed safely.', calculationFailed: 'The data table could not be calculated. Check the inputs and try again.' },
  'de-DE': { title: 'Was-wäre-wenn-Datentabelle', close: 'Grid-Datentabellendialog schließen', oneVariable: 'Datentabelle mit einer Variablen', twoVariable: 'Sensitivitätsmatrix mit zwei Variablen', formulaCell: 'Formelzelle', outputAnchor: 'Ausgabe-Startzelle', columnInputCell: 'Eingabezelle der Spalte', rowInputCell: 'Eingabezelle der Zeile', columnValues: 'Eingabewerte der Spalte', rowValues: 'Eingabewerte der Zeile', calculate: 'Datentabelle berechnen', calculatedMatrix: (count) => `Berechnete Matrix · ${count} Auswertungen`, applyTo: (cell) => `In ${cell} übernehmen`, applying: 'Wird übernommen…', apply: 'Übernehmen', notApplied: 'Das Ergebnis der Datentabelle wurde nicht übernommen. Prüfe Zellberechtigungen und den Arbeitsblattschutz.', commitFailed: 'Das Ergebnis der Datentabelle konnte nicht sicher übernommen werden.', calculationFailed: 'Die Datentabelle konnte nicht berechnet werden. Prüfe die Eingaben und versuche es erneut.' },
  'ru-RU': { title: 'Таблица анализа «что если»', close: 'Закрыть диалог таблицы Grid', oneVariable: 'Таблица с одной переменной', twoVariable: 'Матрица чувствительности с двумя переменными', formulaCell: 'Ячейка с формулой', outputAnchor: 'Начальная ячейка результата', columnInputCell: 'Ячейка подстановки столбца', rowInputCell: 'Ячейка подстановки строки', columnValues: 'Значения для столбца', rowValues: 'Значения для строки', calculate: 'Рассчитать таблицу', calculatedMatrix: (count) => `Матрица рассчитана · вычислений: ${count}`, applyTo: (cell) => `Применить к ${cell}`, applying: 'Применение…', apply: 'Применить', notApplied: 'Результат таблицы не применён. Проверьте разрешения ячеек и защиту книги.', commitFailed: 'Не удалось безопасно применить результат таблицы.', calculationFailed: 'Не удалось рассчитать таблицу. Проверьте данные и повторите попытку.' },
  'it-IT': { title: 'Tabella analisi ipotetica', close: 'Chiudi la finestra della tabella Grid', oneVariable: 'Tabella a una variabile', twoVariable: 'Matrice di sensibilità a due variabili', formulaCell: 'Cella formula', outputAnchor: 'Cella iniziale dei risultati', columnInputCell: 'Cella di input colonna', rowInputCell: 'Cella di input riga', columnValues: 'Valori di input colonna', rowValues: 'Valori di input riga', calculate: 'Calcola tabella dati', calculatedMatrix: (count) => `Matrice calcolata · ${count} valutazioni`, applyTo: (cell) => `Applica a ${cell}`, applying: 'Applicazione…', apply: 'Applica', notApplied: 'Il risultato della tabella non è stato applicato. Controlla i permessi delle celle e la protezione della cartella.', commitFailed: 'Impossibile applicare il risultato della tabella in sicurezza.', calculationFailed: 'Impossibile calcolare la tabella. Controlla i dati e riprova.' },
  'es-ES': { title: 'Tabla de análisis hipotético', close: 'Cerrar el diálogo de tabla de Grid', oneVariable: 'Tabla de una variable', twoVariable: 'Matriz de sensibilidad de dos variables', formulaCell: 'Celda de fórmula', outputAnchor: 'Celda inicial de resultados', columnInputCell: 'Celda de entrada de columna', rowInputCell: 'Celda de entrada de fila', columnValues: 'Valores de entrada de columna', rowValues: 'Valores de entrada de fila', calculate: 'Calcular tabla de datos', calculatedMatrix: (count) => `Matriz calculada · ${count} evaluaciones`, applyTo: (cell) => `Aplicar a ${cell}`, applying: 'Aplicando…', apply: 'Aplicar', notApplied: 'No se aplicó el resultado de la tabla. Comprueba los permisos de las celdas y la protección del libro.', commitFailed: 'No se pudo aplicar el resultado de la tabla de forma segura.', calculationFailed: 'No se pudo calcular la tabla. Comprueba los datos e inténtalo de nuevo.' },
  'ja-JP': { title: 'What-If データ テーブル', close: 'Grid データ テーブルを閉じる', oneVariable: '1 変数データ テーブル', twoVariable: '2 変数感度マトリックス', formulaCell: '数式セル', outputAnchor: '出力先頭セル', columnInputCell: '列の入力セル', rowInputCell: '行の入力セル', columnValues: '列の入力値', rowValues: '行の入力値', calculate: 'データ テーブルを計算', calculatedMatrix: (count) => `計算済みマトリックス · ${count} 回評価`, applyTo: (cell) => `${cell} に適用`, applying: '適用中…', apply: '適用', notApplied: 'データ テーブルの結果を適用できませんでした。セルの権限とブックの保護を確認してください。', commitFailed: 'データ テーブルの結果を安全に確定できませんでした。', calculationFailed: 'データ テーブルを計算できませんでした。入力内容を確認して再試行してください。' },
  'zh-CN': { title: '假设分析数据表', close: '关闭 Grid 数据表对话框', oneVariable: '单变量数据表', twoVariable: '双变量敏感性矩阵', formulaCell: '公式单元格', outputAnchor: '输出起始单元格', columnInputCell: '列输入单元格', rowInputCell: '行输入单元格', columnValues: '列输入值', rowValues: '行输入值', calculate: '计算数据表', calculatedMatrix: (count) => `已计算矩阵 · ${count} 次计算`, applyTo: (cell) => `应用到 ${cell}`, applying: '正在应用…', apply: '应用', notApplied: '未应用数据表结果。请检查单元格权限和工作簿保护。', commitFailed: '无法安全提交数据表结果。', calculationFailed: '无法计算数据表。请检查输入并重试。' },
};

export function gridDataTableFailureCopy(locale: WorkspaceLocale, kind: 'calculate' | 'apply' | 'commit'): string {
  const copy = GRID_DATA_TABLE_COPY[locale];
  return kind === 'calculate' ? copy.calculationFailed : kind === 'apply' ? copy.notApplied : copy.commitFailed;
}
