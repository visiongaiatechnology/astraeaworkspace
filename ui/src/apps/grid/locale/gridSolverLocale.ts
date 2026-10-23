// STATUS: PLATIN — seven-locale solver controls, accessibility names, and opaque failures.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export type GridSolverMode = 'linear' | 'integer' | 'nonlinear';
export type GridSolverStatus = 'optimal' | 'infeasible' | 'unbounded' | 'max_iterations';

type SolverCopy = Readonly<{
  title: (cell: string) => string; close: string;
  modes: Readonly<Record<GridSolverMode, string>>;
  decisionCells: string; objectiveExpression: string; goal: string; maximize: string; minimize: string;
  bounds: string; minimum: (cell: string) => string; maximum: (cell: string) => string;
  constraints: (count: number) => string; addConstraint: string; constraintExpression: (index: number) => string;
  constraintOperator: (index: number) => string; constraintValue: (index: number) => string;
  deleteConstraint: (index: number) => string; statuses: Readonly<Record<GridSolverStatus, string>>;
  objectiveValue: string; iterations: (count: number) => string; run: string; applying: string; apply: string;
  errors: Readonly<{ variableCells: string; expression: string; unknownVariable: string; coefficient: string; bounds: string; generic: string; notApplied: string; commitFailed: string }>;
}>;

export const GRID_SOLVER_COPY: Readonly<Record<WorkspaceLocale, SolverCopy>> = {
  'en-US': {
    title: (cell) => `Local optimization solver · ${cell}`, close: 'Close local optimization solver',
    modes: { linear: 'Linear (Simplex)', integer: 'Integer (bounded)', nonlinear: 'Nonlinear (local)' },
    decisionCells: 'Decision cells', objectiveExpression: 'Objective expression', goal: 'Goal', maximize: 'Maximize', minimize: 'Minimize', bounds: 'Variable bounds', minimum: (cell) => `Minimum for ${cell}`, maximum: (cell) => `Maximum for ${cell}`,
    constraints: (count) => `Constraints (${count})`, addConstraint: 'Add constraint', constraintExpression: (index) => `Constraint ${index} expression`, constraintOperator: (index) => `Constraint ${index} operator`, constraintValue: (index) => `Constraint ${index} value`, deleteConstraint: (index) => `Delete constraint ${index}`,
    statuses: { optimal: 'Optimal solution', infeasible: 'No feasible solution', unbounded: 'Unbounded solution', max_iterations: 'Iteration limit reached' }, objectiveValue: 'Objective value', iterations: (count) => `${count} iterations`, run: 'Run solver', applying: 'Applying…', apply: 'Apply solution',
    errors: { variableCells: 'Enter one to 32 unique cell references, such as A1 or BC250.', expression: 'The expression is invalid. Use supported cell variables, numbers, and arithmetic operators.', unknownVariable: 'The expression refers to a cell that is not listed as a decision cell.', coefficient: 'A coefficient in the expression is invalid.', bounds: 'Each minimum and maximum must be a finite number, and the minimum cannot exceed the maximum.', generic: 'The solver could not complete this calculation. Check the inputs and try again.', notApplied: 'The solver result was not applied. Check cell permissions and workbook protection.', commitFailed: 'The solver result could not be committed safely.' },
  },
  'de-DE': {
    title: (cell) => `Lokaler Optimierer · ${cell}`, close: 'Lokalen Optimierer schließen',
    modes: { linear: 'Linear (Simplex)', integer: 'Ganzzahlig (begrenzt)', nonlinear: 'Nichtlinear (lokal)' },
    decisionCells: 'Entscheidungszellen', objectiveExpression: 'Zielfunktion', goal: 'Ziel', maximize: 'Maximieren', minimize: 'Minimieren', bounds: 'Variablengrenzen', minimum: (cell) => `Untergrenze für ${cell}`, maximum: (cell) => `Obergrenze für ${cell}`,
    constraints: (count) => `Nebenbedingungen (${count})`, addConstraint: 'Nebenbedingung hinzufügen', constraintExpression: (index) => `Ausdruck der Nebenbedingung ${index}`, constraintOperator: (index) => `Operator der Nebenbedingung ${index}`, constraintValue: (index) => `Wert der Nebenbedingung ${index}`, deleteConstraint: (index) => `Nebenbedingung ${index} löschen`,
    statuses: { optimal: 'Optimale Lösung', infeasible: 'Keine zulässige Lösung', unbounded: 'Zielfunktion unbeschränkt', max_iterations: 'Iterationsgrenze erreicht' }, objectiveValue: 'Zielfunktionswert', iterations: (count) => `${count} Iterationen`, run: 'Optimierung starten', applying: 'Wird übernommen…', apply: 'Lösung übernehmen',
    errors: { variableCells: 'Gib ein bis 32 eindeutige Zellbezüge ein, zum Beispiel A1 oder BC250.', expression: 'Der Ausdruck ist ungültig. Verwende unterstützte Zellvariablen, Zahlen und Rechenoperatoren.', unknownVariable: 'Der Ausdruck verweist auf eine Zelle, die nicht als Entscheidungszelle aufgeführt ist.', coefficient: 'Ein Koeffizient im Ausdruck ist ungültig.', bounds: 'Unter- und Obergrenze müssen endliche Zahlen sein; die Untergrenze darf nicht größer als die Obergrenze sein.', generic: 'Die Berechnung konnte nicht abgeschlossen werden. Prüfe die Eingaben und versuche es erneut.', notApplied: 'Die Lösung wurde nicht übernommen. Prüfe Zellberechtigungen und den Arbeitsblattschutz.', commitFailed: 'Die Lösung konnte nicht sicher übernommen werden.' },
  },
  'ru-RU': {
    title: (cell) => `Локальный оптимизатор · ${cell}`, close: 'Закрыть локальный оптимизатор',
    modes: { linear: 'Линейная (симплекс)', integer: 'Целочисленная (ограниченная)', nonlinear: 'Нелинейная (локальная)' },
    decisionCells: 'Изменяемые ячейки', objectiveExpression: 'Целевая функция', goal: 'Цель', maximize: 'Максимум', minimize: 'Минимум', bounds: 'Границы переменных', minimum: (cell) => `Минимум для ${cell}`, maximum: (cell) => `Максимум для ${cell}`,
    constraints: (count) => `Ограничения (${count})`, addConstraint: 'Добавить ограничение', constraintExpression: (index) => `Выражение ограничения ${index}`, constraintOperator: (index) => `Оператор ограничения ${index}`, constraintValue: (index) => `Значение ограничения ${index}`, deleteConstraint: (index) => `Удалить ограничение ${index}`,
    statuses: { optimal: 'Оптимальное решение', infeasible: 'Допустимого решения нет', unbounded: 'Решение не ограничено', max_iterations: 'Достигнут предел итераций' }, objectiveValue: 'Значение целевой функции', iterations: (count) => `Итераций: ${count}`, run: 'Запустить оптимизатор', applying: 'Применение…', apply: 'Применить решение',
    errors: { variableCells: 'Укажите от 1 до 32 уникальных адресов ячеек, например A1 или BC250.', expression: 'Выражение недопустимо. Используйте поддерживаемые переменные-ячеек, числа и арифметические операторы.', unknownVariable: 'В выражении указана ячейка, которой нет в списке изменяемых ячеек.', coefficient: 'Коэффициент в выражении недопустим.', bounds: 'Минимум и максимум должны быть конечными числами; минимум не может превышать максимум.', generic: 'Не удалось выполнить расчёт. Проверьте данные и повторите попытку.', notApplied: 'Решение не применено. Проверьте разрешения ячеек и защиту книги.', commitFailed: 'Не удалось безопасно зафиксировать решение.' },
  },
  'it-IT': {
    title: (cell) => `Ottimizzatore locale · ${cell}`, close: 'Chiudi l’ottimizzatore locale',
    modes: { linear: 'Lineare (Simplesso)', integer: 'Intera (limitata)', nonlinear: 'Non lineare (locale)' },
    decisionCells: 'Celle decisionali', objectiveExpression: 'Espressione obiettivo', goal: 'Obiettivo', maximize: 'Massimizza', minimize: 'Minimizza', bounds: 'Limiti delle variabili', minimum: (cell) => `Minimo per ${cell}`, maximum: (cell) => `Massimo per ${cell}`,
    constraints: (count) => `Vincoli (${count})`, addConstraint: 'Aggiungi vincolo', constraintExpression: (index) => `Espressione del vincolo ${index}`, constraintOperator: (index) => `Operatore del vincolo ${index}`, constraintValue: (index) => `Valore del vincolo ${index}`, deleteConstraint: (index) => `Elimina vincolo ${index}`,
    statuses: { optimal: 'Soluzione ottimale', infeasible: 'Nessuna soluzione ammissibile', unbounded: 'Soluzione illimitata', max_iterations: 'Limite di iterazioni raggiunto' }, objectiveValue: 'Valore obiettivo', iterations: (count) => `${count} iterazioni`, run: 'Avvia ottimizzatore', applying: 'Applicazione…', apply: 'Applica soluzione',
    errors: { variableCells: 'Inserisci da una a 32 celle univoche, ad esempio A1 o BC250.', expression: 'L’espressione non è valida. Usa variabili cella supportate, numeri e operatori aritmetici.', unknownVariable: 'L’espressione usa una cella non inclusa nell’elenco delle celle decisionali.', coefficient: 'Un coefficiente dell’espressione non è valido.', bounds: 'Minimo e massimo devono essere numeri finiti; il minimo non può superare il massimo.', generic: 'Impossibile completare il calcolo. Controlla i dati e riprova.', notApplied: 'La soluzione non è stata applicata. Controlla i permessi delle celle e la protezione della cartella.', commitFailed: 'Impossibile applicare la soluzione in sicurezza.' },
  },
  'es-ES': {
    title: (cell) => `Optimizador local · ${cell}`, close: 'Cerrar el optimizador local',
    modes: { linear: 'Lineal (símplex)', integer: 'Entera (acotada)', nonlinear: 'No lineal (local)' },
    decisionCells: 'Celdas de decisión', objectiveExpression: 'Expresión objetivo', goal: 'Objetivo', maximize: 'Maximizar', minimize: 'Minimizar', bounds: 'Límites de variables', minimum: (cell) => `Mínimo para ${cell}`, maximum: (cell) => `Máximo para ${cell}`,
    constraints: (count) => `Restricciones (${count})`, addConstraint: 'Añadir restricción', constraintExpression: (index) => `Expresión de la restricción ${index}`, constraintOperator: (index) => `Operador de la restricción ${index}`, constraintValue: (index) => `Valor de la restricción ${index}`, deleteConstraint: (index) => `Eliminar restricción ${index}`,
    statuses: { optimal: 'Solución óptima', infeasible: 'No hay una solución viable', unbounded: 'Solución no acotada', max_iterations: 'Se alcanzó el límite de iteraciones' }, objectiveValue: 'Valor objetivo', iterations: (count) => `${count} iteraciones`, run: 'Ejecutar optimizador', applying: 'Aplicando…', apply: 'Aplicar solución',
    errors: { variableCells: 'Introduce entre 1 y 32 referencias de celda únicas, como A1 o BC250.', expression: 'La expresión no es válida. Usa variables de celda admitidas, números y operadores aritméticos.', unknownVariable: 'La expresión usa una celda que no aparece en la lista de celdas de decisión.', coefficient: 'Un coeficiente de la expresión no es válido.', bounds: 'El mínimo y el máximo deben ser números finitos; el mínimo no puede superar el máximo.', generic: 'No se pudo completar el cálculo. Comprueba los datos e inténtalo de nuevo.', notApplied: 'No se aplicó la solución. Comprueba los permisos de las celdas y la protección del libro.', commitFailed: 'No se pudo aplicar la solución de forma segura.' },
  },
  'ja-JP': {
    title: (cell) => `ローカル最適化ソルバー · ${cell}`, close: 'ローカル最適化ソルバーを閉じる',
    modes: { linear: '線形 (シンプレックス)', integer: '整数 (有界)', nonlinear: '非線形 (ローカル)' },
    decisionCells: '変更するセル', objectiveExpression: '目的式', goal: '目標', maximize: '最大化', minimize: '最小化', bounds: '変数の境界', minimum: (cell) => `${cell} の最小値`, maximum: (cell) => `${cell} の最大値`,
    constraints: (count) => `制約 (${count})`, addConstraint: '制約を追加', constraintExpression: (index) => `制約 ${index} の式`, constraintOperator: (index) => `制約 ${index} の演算子`, constraintValue: (index) => `制約 ${index} の値`, deleteConstraint: (index) => `制約 ${index} を削除`,
    statuses: { optimal: '最適解', infeasible: '実行可能解なし', unbounded: '解が有界ではありません', max_iterations: '反復回数の上限に到達' }, objectiveValue: '目的関数の値', iterations: (count) => `${count} 回反復`, run: 'ソルバーを実行', applying: '適用中…', apply: '解を適用',
    errors: { variableCells: 'A1 や BC250 のような重複しないセル参照を 1～32 個入力してください。', expression: '式が無効です。対応するセル変数、数値、算術演算子を使用してください。', unknownVariable: '式に、変更するセルの一覧にないセルが含まれています。', coefficient: '式の係数が無効です。', bounds: '最小値と最大値には有限数を指定し、最小値を最大値以下にしてください。', generic: '計算を完了できませんでした。入力内容を確認して再試行してください。', notApplied: '解を適用できませんでした。セルの権限とブックの保護を確認してください。', commitFailed: '解を安全に確定できませんでした。' },
  },
  'zh-CN': {
    title: (cell) => `本地优化求解器 · ${cell}`, close: '关闭本地优化求解器',
    modes: { linear: '线性（单纯形）', integer: '整数（有界）', nonlinear: '非线性（局部）' },
    decisionCells: '决策单元格', objectiveExpression: '目标表达式', goal: '目标', maximize: '最大化', minimize: '最小化', bounds: '变量边界', minimum: (cell) => `${cell} 的最小值`, maximum: (cell) => `${cell} 的最大值`,
    constraints: (count) => `约束（${count}）`, addConstraint: '添加约束', constraintExpression: (index) => `约束 ${index} 表达式`, constraintOperator: (index) => `约束 ${index} 运算符`, constraintValue: (index) => `约束 ${index} 数值`, deleteConstraint: (index) => `删除约束 ${index}`,
    statuses: { optimal: '最优解', infeasible: '没有可行解', unbounded: '解无界', max_iterations: '已达到迭代上限' }, objectiveValue: '目标值', iterations: (count) => `迭代次数：${count}`, run: '运行求解器', applying: '正在应用…', apply: '应用解',
    errors: { variableCells: '请输入 1 到 32 个不重复的单元格引用，例如 A1 或 BC250。', expression: '表达式无效。请使用受支持的单元格变量、数字和算术运算符。', unknownVariable: '表达式引用了未列入决策单元格的单元格。', coefficient: '表达式中的系数无效。', bounds: '最小值和最大值必须是有限数字，且最小值不能大于最大值。', generic: '无法完成计算。请检查输入并重试。', notApplied: '未应用求解结果。请检查单元格权限和工作簿保护。', commitFailed: '无法安全提交求解结果。' },
  },
};

export function gridSolverFailureCopy(locale: WorkspaceLocale, cause: unknown, kind: 'run' | 'apply' | 'commit' = 'run'): string {
  const copy = GRID_SOLVER_COPY[locale];
  if (kind === 'apply') return copy.errors.notApplied;
  if (kind === 'commit') return copy.errors.commitFailed;
  const message = cause instanceof Error ? cause.message : '';
  if (message === 'solver_variable_cells_invalid') return copy.errors.variableCells;
  if (message === 'solver_unknown_variable') return copy.errors.unknownVariable;
  if (message === 'solver_coefficient_invalid') return copy.errors.coefficient;
  if (message === 'solver_bounds_invalid') return copy.errors.bounds;
  if (message.startsWith('solver_linear_expression_')) return copy.errors.expression;
  return copy.errors.generic;
}
