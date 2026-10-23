// STATUS: PLATIN — seven-locale copy for Grid's validation dialog.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { GridValidationKind } from '../../../shared/contracts/grid/workspaceGrid';

type GridDataValidationCopy = {
  title: string;
  closeDialog: string;
  tabs: Readonly<Record<'settings' | 'input-message' | 'error-alert', string>>;
  range: string;
  rangePlaceholder: string;
  allowKind: string;
  kinds: Readonly<Record<GridValidationKind, string>>;
  listOptions: string;
  listOptionsInitial: string;
  listOptionsPlaceholder: string;
  dynamicSource: string;
  dynamicSourcePlaceholder: string;
  dynamicSourceHelp: string;
  formula: string;
  formulaPlaceholder: string;
  formulaHelp: string;
  timeFormatHelp: string;
  minimum: string;
  maximum: string;
  allowBlank: string;
  inputMessageHelp: string;
  inputMessage: string;
  inputMessagePlaceholder: string;
  errorMessageHelp: string;
  errorMessage: string;
  errorMessagePlaceholder: string;
  activeRules: (count: number) => string;
  deleteRule: (range: string) => string;
  circleInvalid: string;
  hideInvalidCircles: string;
  clearAll: string;
  cancel: string;
  applyRule: string;
};

export const GRID_DATA_VALIDATION_COPY: Readonly<Record<WorkspaceLocale, GridDataValidationCopy>> = {
  'en-US': {
    title: 'Data validation', closeDialog: 'Close data validation dialog',
    tabs: { settings: 'Settings', 'input-message': 'Input message', 'error-alert': 'Error alert' },
    range: 'Cell range:', rangePlaceholder: 'e.g. A1:A10', allowKind: 'Allow:',
    kinds: { list: 'List', 'whole-number': 'Whole number', number: 'Number', decimal: 'Decimal', date: 'Date', time: 'Time', 'text-length': 'Text length', custom: 'Custom formula' },
    listOptions: 'Options (comma-separated):', listOptionsInitial: 'Open, In progress, Done', listOptionsPlaceholder: 'e.g. Open, In progress, Done',
    dynamicSource: 'Dynamic source (optional):', dynamicSourcePlaceholder: '=NamedRange, =A2:A20, or =Table1[Status]',
    dynamicSourceHelp: 'Named ranges and structured table columns resolve when the rule is opened or validated.',
    formula: 'Validation formula:', formulaPlaceholder: '=A1>0', formulaHelp: 'Relative cell references shift for each target cell.',
    timeFormatHelp: 'Enter HH:MM or HH:MM:SS in 24-hour format.', minimum: 'Minimum:', maximum: 'Maximum:', allowBlank: 'Allow blank cells',
    inputMessageHelp: 'This message appears when someone selects a cell in this range.', inputMessage: 'Input message:', inputMessagePlaceholder: 'e.g. Enter an amount from 1 to 100.',
    errorMessageHelp: 'This alert appears when someone enters invalid data in a cell.', errorMessage: 'Error message:', errorMessagePlaceholder: 'e.g. Invalid value. Check the entry requirements.',
    activeRules: (count) => `Active rules (${count}):`, deleteRule: (range) => `Delete data validation rule for ${range}`,
    circleInvalid: 'Circle invalid data', hideInvalidCircles: 'Hide invalid-data circles', clearAll: 'Clear all', cancel: 'Cancel', applyRule: 'Apply rule',
  },
  'de-DE': {
    title: 'Datenüberprüfung', closeDialog: 'Dialog zur Datenüberprüfung schließen',
    tabs: { settings: 'Einstellungen', 'input-message': 'Eingabemeldung', 'error-alert': 'Fehlermeldung' },
    range: 'Zellbereich:', rangePlaceholder: 'z. B. A1:A10', allowKind: 'Zulassen:',
    kinds: { list: 'Liste', 'whole-number': 'Ganze Zahl', number: 'Zahl', decimal: 'Dezimalzahl', date: 'Datum', time: 'Uhrzeit', 'text-length': 'Textlänge', custom: 'Benutzerdefinierte Formel' },
    listOptions: 'Optionen (durch Kommas getrennt):', listOptionsInitial: 'Offen, In Bearbeitung, Erledigt', listOptionsPlaceholder: 'z. B. Offen, In Bearbeitung, Erledigt',
    dynamicSource: 'Dynamische Quelle (optional):', dynamicSourcePlaceholder: '=NamedRange, =A2:A20 oder =Table1[Status]',
    dynamicSourceHelp: 'Benannte Bereiche und Tabellenspalten werden beim Öffnen oder Prüfen der Regel aufgelöst.',
    formula: 'Überprüfungsformel:', formulaPlaceholder: '=A1>0', formulaHelp: 'Relative Zellbezüge werden für jede Zielzelle verschoben.',
    timeFormatHelp: 'Gib HH:MM oder HH:MM:SS im 24-Stunden-Format ein.', minimum: 'Minimum:', maximum: 'Maximum:', allowBlank: 'Leere Zellen zulassen',
    inputMessageHelp: 'Diese Meldung erscheint, wenn jemand eine Zelle in diesem Bereich auswählt.', inputMessage: 'Hinweistext:', inputMessagePlaceholder: 'z. B. Gib einen Betrag zwischen 1 und 100 ein.',
    errorMessageHelp: 'Dieser Hinweis erscheint, wenn jemand ungültige Daten eingibt.', errorMessage: 'Fehlermeldung:', errorMessagePlaceholder: 'z. B. Ungültiger Wert. Prüfe die Eingabebedingungen.',
    activeRules: (count) => `Aktive Regeln (${count}):`, deleteRule: (range) => `Überprüfungsregel für ${range} löschen`,
    circleInvalid: 'Ungültige Daten markieren', hideInvalidCircles: 'Markierungen ungültiger Daten ausblenden', clearAll: 'Alle löschen', cancel: 'Abbrechen', applyRule: 'Regel anwenden',
  },
  'ru-RU': {
    title: 'Проверка данных', closeDialog: 'Закрыть окно проверки данных',
    tabs: { settings: 'Параметры', 'input-message': 'Подсказка ввода', 'error-alert': 'Сообщение об ошибке' },
    range: 'Диапазон ячеек:', rangePlaceholder: 'например, A1:A10', allowKind: 'Разрешить:',
    kinds: { list: 'Список', 'whole-number': 'Целое число', number: 'Число', decimal: 'Десятичное число', date: 'Дата', time: 'Время', 'text-length': 'Длина текста', custom: 'Пользовательская формула' },
    listOptions: 'Варианты (через запятую):', listOptionsInitial: 'Открыто, В работе, Готово', listOptionsPlaceholder: 'например, Открыто, В работе, Готово',
    dynamicSource: 'Динамический источник (необязательно):', dynamicSourcePlaceholder: '=NamedRange, =A2:A20 или =Table1[Status]',
    dynamicSourceHelp: 'Именованные диапазоны и столбцы таблиц разрешаются при открытии или проверке правила.',
    formula: 'Формула проверки:', formulaPlaceholder: '=A1>0', formulaHelp: 'Относительные ссылки смещаются для каждой целевой ячейки.',
    timeFormatHelp: 'Введите HH:MM или HH:MM:SS в 24-часовом формате.', minimum: 'Минимум:', maximum: 'Максимум:', allowBlank: 'Разрешить пустые ячейки',
    inputMessageHelp: 'Это сообщение появляется при выборе ячейки в данном диапазоне.', inputMessage: 'Подсказка:', inputMessagePlaceholder: 'например, Введите сумму от 1 до 100.',
    errorMessageHelp: 'Это предупреждение появляется при вводе недопустимых данных.', errorMessage: 'Сообщение об ошибке:', errorMessagePlaceholder: 'например, Недопустимое значение. Проверьте условия ввода.',
    activeRules: (count) => `Активные правила (${count}):`, deleteRule: (range) => `Удалить правило проверки данных для ${range}`,
    circleInvalid: 'Обвести неверные данные', hideInvalidCircles: 'Скрыть отметки неверных данных', clearAll: 'Удалить все', cancel: 'Отмена', applyRule: 'Применить правило',
  },
  'it-IT': {
    title: 'Convalida dati', closeDialog: 'Chiudi la finestra di convalida dati',
    tabs: { settings: 'Impostazioni', 'input-message': 'Messaggio di input', 'error-alert': 'Avviso di errore' },
    range: 'Intervallo celle:', rangePlaceholder: 'ad es. A1:A10', allowKind: 'Consenti:',
    kinds: { list: 'Elenco', 'whole-number': 'Numero intero', number: 'Numero', decimal: 'Decimale', date: 'Data', time: 'Ora', 'text-length': 'Lunghezza testo', custom: 'Formula personalizzata' },
    listOptions: 'Opzioni (separate da virgole):', listOptionsInitial: 'Aperto, In corso, Completato', listOptionsPlaceholder: 'ad es. Aperto, In corso, Completato',
    dynamicSource: 'Origine dinamica (facoltativa):', dynamicSourcePlaceholder: '=NamedRange, =A2:A20 oppure =Table1[Status]',
    dynamicSourceHelp: 'Gli intervalli denominati e le colonne delle tabelle vengono risolti quando la regola viene aperta o convalidata.',
    formula: 'Formula di convalida:', formulaPlaceholder: '=A1>0', formulaHelp: 'I riferimenti relativi si spostano per ogni cella di destinazione.',
    timeFormatHelp: 'Inserisci HH:MM o HH:MM:SS nel formato 24 ore.', minimum: 'Minimo:', maximum: 'Massimo:', allowBlank: 'Consenti celle vuote',
    inputMessageHelp: 'Il messaggio viene mostrato quando si seleziona una cella di questo intervallo.', inputMessage: 'Messaggio di input:', inputMessagePlaceholder: 'ad es. Inserisci un importo da 1 a 100.',
    errorMessageHelp: 'L’avviso viene mostrato quando si immettono dati non validi.', errorMessage: 'Messaggio di errore:', errorMessagePlaceholder: 'ad es. Valore non valido. Controlla i requisiti.',
    activeRules: (count) => `Regole attive (${count}):`, deleteRule: (range) => `Elimina la regola di convalida dati per ${range}`,
    circleInvalid: 'Cerchia i dati non validi', hideInvalidCircles: 'Nascondi i cerchi dei dati non validi', clearAll: 'Cancella tutto', cancel: 'Annulla', applyRule: 'Applica regola',
  },
  'es-ES': {
    title: 'Validación de datos', closeDialog: 'Cerrar el diálogo de validación de datos',
    tabs: { settings: 'Configuración', 'input-message': 'Mensaje de entrada', 'error-alert': 'Alerta de error' },
    range: 'Rango de celdas:', rangePlaceholder: 'p. ej., A1:A10', allowKind: 'Permitir:',
    kinds: { list: 'Lista', 'whole-number': 'Número entero', number: 'Número', decimal: 'Decimal', date: 'Fecha', time: 'Hora', 'text-length': 'Longitud del texto', custom: 'Fórmula personalizada' },
    listOptions: 'Opciones (separadas por comas):', listOptionsInitial: 'Abierto, En curso, Hecho', listOptionsPlaceholder: 'p. ej., Abierto, En curso, Hecho',
    dynamicSource: 'Origen dinámico (opcional):', dynamicSourcePlaceholder: '=NamedRange, =A2:A20 o =Table1[Status]',
    dynamicSourceHelp: 'Los rangos con nombre y las columnas de tabla se resuelven al abrir o validar la regla.',
    formula: 'Fórmula de validación:', formulaPlaceholder: '=A1>0', formulaHelp: 'Las referencias relativas cambian para cada celda de destino.',
    timeFormatHelp: 'Usa HH:MM o HH:MM:SS en formato de 24 horas.', minimum: 'Mínimo:', maximum: 'Máximo:', allowBlank: 'Permitir celdas vacías',
    inputMessageHelp: 'Este mensaje aparece al seleccionar una celda de este rango.', inputMessage: 'Mensaje de entrada:', inputMessagePlaceholder: 'p. ej., Introduce una cantidad entre 1 y 100.',
    errorMessageHelp: 'Esta alerta aparece al introducir datos no válidos.', errorMessage: 'Mensaje de error:', errorMessagePlaceholder: 'p. ej., Valor no válido. Comprueba las condiciones.',
    activeRules: (count) => `Reglas activas (${count}):`, deleteRule: (range) => `Eliminar la regla de validación de datos para ${range}`,
    circleInvalid: 'Marcar datos no válidos', hideInvalidCircles: 'Ocultar marcas de datos no válidos', clearAll: 'Borrar todo', cancel: 'Cancelar', applyRule: 'Aplicar regla',
  },
  'ja-JP': {
    title: 'データの入力規則', closeDialog: 'データの入力規則ダイアログを閉じる',
    tabs: { settings: '設定', 'input-message': '入力メッセージ', 'error-alert': 'エラー警告' },
    range: 'セル範囲:', rangePlaceholder: '例: A1:A10', allowKind: '入力値の種類:',
    kinds: { list: 'リスト', 'whole-number': '整数', number: '数値', decimal: '小数', date: '日付', time: '時刻', 'text-length': '文字数', custom: 'ユーザー設定の数式' },
    listOptions: '選択肢 (カンマ区切り):', listOptionsInitial: '未着手, 進行中, 完了', listOptionsPlaceholder: '例: 未着手, 進行中, 完了',
    dynamicSource: '動的な参照元 (省略可):', dynamicSourcePlaceholder: '=NamedRange、=A2:A20、または =Table1[Status]',
    dynamicSourceHelp: '名前付き範囲とテーブル列は、規則を開くときまたは検証するときに解決されます。',
    formula: '検証数式:', formulaPlaceholder: '=A1>0', formulaHelp: '相対セル参照は対象セルごとに移動します。',
    timeFormatHelp: '24 時間形式で HH:MM または HH:MM:SS を入力します。', minimum: '最小値:', maximum: '最大値:', allowBlank: '空白セルを許可',
    inputMessageHelp: 'この範囲のセルを選択すると、このメッセージが表示されます。', inputMessage: '入力メッセージ:', inputMessagePlaceholder: '例: 1 から 100 までの金額を入力してください。',
    errorMessageHelp: '無効なデータを入力すると、この警告が表示されます。', errorMessage: 'エラーメッセージ:', errorMessagePlaceholder: '例: 値が無効です。入力条件を確認してください。',
    activeRules: (count) => `有効な規則 (${count}):`, deleteRule: (range) => `${range} の入力規則を削除`,
    circleInvalid: '無効なデータに丸印を付ける', hideInvalidCircles: '無効データの丸印を非表示', clearAll: 'すべて削除', cancel: 'キャンセル', applyRule: '規則を適用',
  },
  'zh-CN': {
    title: '数据验证', closeDialog: '关闭数据验证对话框',
    tabs: { settings: '设置', 'input-message': '输入信息', 'error-alert': '错误警告' },
    range: '单元格范围：', rangePlaceholder: '例如 A1:A10', allowKind: '允许：',
    kinds: { list: '序列', 'whole-number': '整数', number: '数值', decimal: '小数', date: '日期', time: '时间', 'text-length': '文本长度', custom: '自定义公式' },
    listOptions: '选项（用逗号分隔）：', listOptionsInitial: '未开始，进行中，已完成', listOptionsPlaceholder: '例如：未开始，进行中，已完成',
    dynamicSource: '动态来源（可选）：', dynamicSourcePlaceholder: '=NamedRange、=A2:A20 或 =Table1[Status]',
    dynamicSourceHelp: '打开或验证规则时会解析命名区域和结构化表格列。',
    formula: '验证公式：', formulaPlaceholder: '=A1>0', formulaHelp: '相对单元格引用会随目标单元格调整。',
    timeFormatHelp: '请使用 24 小时制输入 HH:MM 或 HH:MM:SS。', minimum: '最小值：', maximum: '最大值：', allowBlank: '允许空白单元格',
    inputMessageHelp: '选择此范围内的单元格时会显示此信息。', inputMessage: '输入信息：', inputMessagePlaceholder: '例如：请输入 1 到 100 之间的金额。',
    errorMessageHelp: '输入无效数据时会显示此警告。', errorMessage: '错误信息：', errorMessagePlaceholder: '例如：值无效，请检查输入条件。',
    activeRules: (count) => `有效规则（${count}）：`, deleteRule: (range) => `删除 ${range} 的数据验证规则`,
    circleInvalid: '圈出无效数据', hideInvalidCircles: '隐藏无效数据标记', clearAll: '全部清除', cancel: '取消', applyRule: '应用规则',
  },
};

export function resolveGridDataValidationListOptions(localizedInitial: string, userOverride: string | null): string {
  return userOverride ?? localizedInitial;
}
