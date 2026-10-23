// STATUS: DIAMANT VGT SUPREME — complete seven-locale copy for the Grid formula assistant.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

/**
 * Copy for the visible formula assistant surface (completion, function wizard, live diagnosis).
 * One block for all seven workspace locales, exactly like `gridToolbarLocale.ts`; there is no second
 * translation mechanism.
 */
export interface GridFormulaAssistantCopy {
  readonly open: string;
  readonly openTitle: string;
  readonly title: string;
  readonly close: string;
  readonly completionsTab: string;
  readonly wizardTab: string;
  readonly diagnosisTab: string;
  readonly suggestionList: string;
  readonly suggestionsEmpty: string;
  readonly suggestionHint: string;
  readonly category: string;
  readonly syntax: string;
  readonly parameters: string;
  readonly parameterRequired: string;
  readonly parameterOptional: string;
  readonly argumentPlaceholder: (parameter: string) => string;
  readonly apply: string;
  readonly insert: string;
  readonly clear: string;
  readonly diagnosisEmpty: string;
  readonly diagnosisCount: (count: number) => string;
  readonly spillTitle: string;
  readonly spillBlocked: (cells: string) => string;
  readonly spillOutOfBounds: string;
  readonly spillTooLarge: string;
  readonly spillOk: (cells: number) => string;
  readonly cycleTitle: string;
  readonly cycleFound: (path: string) => string;
  readonly cycleNone: string;
  readonly referenceMode: string;
  readonly referenceRelative: string;
  readonly referenceAbsolute: string;
  readonly referenceMixed: string;
  readonly dateContext: string;
  readonly dateContextLabel: (zone: string, locale: string) => string;
  readonly scopeTitle: string;
  readonly scopeBindings: (names: string) => string;
  readonly scopeNone: string;
  readonly arityCode: string;
  readonly notApplicable: string;
}

export const GRID_FORMULA_ASSISTANT_COPY: Readonly<Record<WorkspaceLocale, GridFormulaAssistantCopy>> = {
  'de-DE': {
    open: 'Formel-Assistent', openTitle: 'Funktionsbibliothek, Vervollständigung und Formeldiagnose',
    title: 'Formel-Assistent', close: 'Formel-Assistent schließen',
    completionsTab: 'Vervollständigung', wizardTab: 'Funktions-Assistent', diagnosisTab: 'Diagnose',
    suggestionList: 'Funktionsvorschläge', suggestionsEmpty: 'Keine Funktion passt zum bisherigen Text.',
    suggestionHint: 'Mit Pfeil hoch/runter wählen, Enter übernimmt, Escape schließt.',
    category: 'Kategorie', syntax: 'Syntax', parameters: 'Parameter',
    parameterRequired: 'erforderlich', parameterOptional: 'optional',
    argumentPlaceholder: (parameter) => `Wert für ${parameter}`,
    apply: 'Übernehmen', insert: 'In Zelle einfügen', clear: 'Leeren',
    diagnosisEmpty: 'Keine Beanstandung: die Formel ist syntaktisch und in der Funktion bekannten Form gültig.',
    diagnosisCount: (count) => `${count} Hinweis(e)`,
    spillTitle: 'Dynamisches Array',
    spillBlocked: (cells) => `Die Ausgabe ist durch belegte Zellen blockiert: ${cells}. Diese Zellen zuerst leeren.`,
    spillOutOfBounds: 'Die Ausgabe ragt über den Rand des Rasters hinaus.',
    spillTooLarge: 'Die Ausgabe überschreitet das Zellbudget für dynamische Arrays.',
    spillOk: (cells) => `Die Ausgabe belegt ${cells} Zelle(n) und ist frei.`,
    cycleTitle: 'Zirkuläre Abhängigkeit',
    cycleFound: (path) => `Kreis erkannt: ${path}. Ergebnis ist #CIRCULAR!.`,
    cycleNone: 'Kein Zyklus im Formelgraphen dieser Arbeitsmappe gefunden.',
    referenceMode: 'Bezugsart', referenceRelative: 'relativ', referenceAbsolute: 'absolut', referenceMixed: 'gemischt',
    dateContext: 'Datums-/Zeitkontext',
    dateContextLabel: (zone, locale) => `Zeitzone ${zone}, Gebietsschema ${locale}`,
    scopeTitle: 'Namensbindungen (LET/LAMBDA)',
    scopeBindings: (names) => `Gebundene Namen: ${names}`,
    scopeNone: 'Keine Namensbindungen in dieser Formel.',
    arityCode: 'Erwartete Argumente', notApplicable: 'nicht anwendbar',
  },
  'en-US': {
    open: 'Formula assistant', openTitle: 'Function library, completion and formula diagnosis',
    title: 'Formula assistant', close: 'Close formula assistant',
    completionsTab: 'Completion', wizardTab: 'Function wizard', diagnosisTab: 'Diagnosis',
    suggestionList: 'Function suggestions', suggestionsEmpty: 'No function matches the text so far.',
    suggestionHint: 'Choose with Arrow up/down, accept with Enter, close with Escape.',
    category: 'Category', syntax: 'Syntax', parameters: 'Parameters',
    parameterRequired: 'required', parameterOptional: 'optional',
    argumentPlaceholder: (parameter) => `Value for ${parameter}`,
    apply: 'Apply', insert: 'Insert into cell', clear: 'Clear',
    diagnosisEmpty: 'Nothing to report: the formula is valid and every function is known.',
    diagnosisCount: (count) => `${count} finding(s)`,
    spillTitle: 'Dynamic array',
    spillBlocked: (cells) => `The output is blocked by occupied cells: ${cells}. Clear them first.`,
    spillOutOfBounds: 'The output extends past the edge of the raster.',
    spillTooLarge: 'The output exceeds the dynamic-array cell budget.',
    spillOk: (cells) => `The output occupies ${cells} cell(s) and is unobstructed.`,
    cycleTitle: 'Circular reference',
    cycleFound: (path) => `Cycle detected: ${path}. The result is #CIRCULAR!.`,
    cycleNone: 'No cycle was found in this workbook\u2019s formula graph.',
    referenceMode: 'Reference mode', referenceRelative: 'relative', referenceAbsolute: 'absolute', referenceMixed: 'mixed',
    dateContext: 'Date/time context',
    dateContextLabel: (zone, locale) => `Time zone ${zone}, locale ${locale}`,
    scopeTitle: 'Name bindings (LET/LAMBDA)',
    scopeBindings: (names) => `Bound names: ${names}`,
    scopeNone: 'No name bindings in this formula.',
    arityCode: 'Expected arguments', notApplicable: 'not applicable',
  },
  'ru-RU': {
    open: 'Помощник формул', openTitle: 'Библиотека функций, автодополнение и диагностика формул',
    title: 'Помощник формул', close: 'Закрыть помощник формул',
    completionsTab: 'Дополнение', wizardTab: 'Мастер функций', diagnosisTab: 'Диагностика',
    suggestionList: 'Предложения функций', suggestionsEmpty: 'Ни одна функция не соответствует введённому тексту.',
    suggestionHint: 'Выбор — стрелки вверх/вниз, Enter — принять, Escape — закрыть.',
    category: 'Категория', syntax: 'Синтаксис', parameters: 'Параметры',
    parameterRequired: 'обязательный', parameterOptional: 'необязательный',
    argumentPlaceholder: (parameter) => `Значение для ${parameter}`,
    apply: 'Применить', insert: 'Вставить в ячейку', clear: 'Очистить',
    diagnosisEmpty: 'Замечаний нет: формула корректна, все функции известны.',
    diagnosisCount: (count) => `${count} замечание(й)`,
    spillTitle: 'Динамический массив',
    spillBlocked: (cells) => `Вывод заблокирован занятыми ячейками: ${cells}. Сначала очистите их.`,
    spillOutOfBounds: 'Вывод выходит за границы сетки.',
    spillTooLarge: 'Вывод превышает бюджет ячеек динамического массива.',
    spillOk: (cells) => `Вывод занимает ${cells} ячейку(и) и свободен.`,
    cycleTitle: 'Циклическая ссылка',
    cycleFound: (path) => `Обнаружен цикл: ${path}. Результат — #CIRCULAR!.`,
    cycleNone: 'Цикл в графе формул этой книги не найден.',
    referenceMode: 'Тип ссылки', referenceRelative: 'относительная', referenceAbsolute: 'абсолютная', referenceMixed: 'смешанная',
    dateContext: 'Контекст даты и времени',
    dateContextLabel: (zone, locale) => `Часовой пояс ${zone}, локаль ${locale}`,
    scopeTitle: 'Привязки имён (LET/LAMBDA)',
    scopeBindings: (names) => `Связанные имена: ${names}`,
    scopeNone: 'В этой формуле нет привязок имён.',
    arityCode: 'Ожидаемые аргументы', notApplicable: 'не применимо',
  },
  'it-IT': {
    open: 'Assistente formule', openTitle: 'Libreria funzioni, completamento e diagnosi delle formule',
    title: 'Assistente formule', close: 'Chiudi assistente formule',
    completionsTab: 'Completamento', wizardTab: 'Assistente funzioni', diagnosisTab: 'Diagnosi',
    suggestionList: 'Suggerimenti di funzione', suggestionsEmpty: 'Nessuna funzione corrisponde al testo finora.',
    suggestionHint: 'Scegli con freccia su/giù, conferma con Invio, chiudi con Esc.',
    category: 'Categoria', syntax: 'Sintassi', parameters: 'Parametri',
    parameterRequired: 'obbligatorio', parameterOptional: 'facoltativo',
    argumentPlaceholder: (parameter) => `Valore per ${parameter}`,
    apply: 'Applica', insert: 'Inserisci nella cella', clear: 'Svuota',
    diagnosisEmpty: 'Nessuna osservazione: la formula è valida e le funzioni sono note.',
    diagnosisCount: (count) => `${count} osservazione(i)`,
    spillTitle: 'Matrice dinamica',
    spillBlocked: (cells) => `L\u2019output è bloccato da celle occupate: ${cells}. Svuotale prima.`,
    spillOutOfBounds: 'L\u2019output supera il bordo della griglia.',
    spillTooLarge: 'L\u2019output supera il budget di celle della matrice dinamica.',
    spillOk: (cells) => `L\u2019output occupa ${cells} cella/e ed è libero.`,
    cycleTitle: 'Riferimento circolare',
    cycleFound: (path) => `Ciclo rilevato: ${path}. Il risultato è #CIRCULAR!.`,
    cycleNone: 'Nessun ciclo trovato nel grafo delle formule di questa cartella.',
    referenceMode: 'Tipo di riferimento', referenceRelative: 'relativo', referenceAbsolute: 'assoluto', referenceMixed: 'misto',
    dateContext: 'Contesto data/ora',
    dateContextLabel: (zone, locale) => `Fuso ${zone}, impostazioni locali ${locale}`,
    scopeTitle: 'Associazioni di nome (LET/LAMBDA)',
    scopeBindings: (names) => `Nomi associati: ${names}`,
    scopeNone: 'Nessuna associazione di nome in questa formula.',
    arityCode: 'Argomenti previsti', notApplicable: 'non applicabile',
  },
  'es-ES': {
    open: 'Asistente de fórmulas', openTitle: 'Biblioteca de funciones, autocompletado y diagnóstico de fórmulas',
    title: 'Asistente de fórmulas', close: 'Cerrar asistente de fórmulas',
    completionsTab: 'Autocompletado', wizardTab: 'Asistente de funciones', diagnosisTab: 'Diagnóstico',
    suggestionList: 'Sugerencias de función', suggestionsEmpty: 'Ninguna función coincide con el texto actual.',
    suggestionHint: 'Elige con flecha arriba/abajo, acepta con Intro, cierra con Escape.',
    category: 'Categoría', syntax: 'Sintaxis', parameters: 'Parámetros',
    parameterRequired: 'obligatorio', parameterOptional: 'opcional',
    argumentPlaceholder: (parameter) => `Valor para ${parameter}`,
    apply: 'Aplicar', insert: 'Insertar en la celda', clear: 'Vaciar',
    diagnosisEmpty: 'Sin observaciones: la fórmula es válida y las funciones son conocidas.',
    diagnosisCount: (count) => `${count} observación(es)`,
    spillTitle: 'Matriz dinámica',
    spillBlocked: (cells) => `La salida está bloqueada por celdas ocupadas: ${cells}. Vacíalas primero.`,
    spillOutOfBounds: 'La salida sobresale del borde de la cuadrícula.',
    spillTooLarge: 'La salida supera el presupuesto de celdas de la matriz dinámica.',
    spillOk: (cells) => `La salida ocupa ${cells} celda(s) y está libre.`,
    cycleTitle: 'Referencia circular',
    cycleFound: (path) => `Ciclo detectado: ${path}. El resultado es #CIRCULAR!.`,
    cycleNone: 'No se encontró ningún ciclo en el grafo de fórmulas de este libro.',
    referenceMode: 'Tipo de referencia', referenceRelative: 'relativa', referenceAbsolute: 'absoluta', referenceMixed: 'mixta',
    dateContext: 'Contexto de fecha y hora',
    dateContextLabel: (zone, locale) => `Zona ${zone}, configuración regional ${locale}`,
    scopeTitle: 'Enlaces de nombres (LET/LAMBDA)',
    scopeBindings: (names) => `Nombres enlazados: ${names}`,
    scopeNone: 'Sin enlaces de nombres en esta fórmula.',
    arityCode: 'Argumentos esperados', notApplicable: 'no aplicable',
  },
  'ja-JP': {
    open: '数式アシスタント', openTitle: '関数ライブラリ、入力補完、数式診断',
    title: '数式アシスタント', close: '数式アシスタントを閉じる',
    completionsTab: '入力補完', wizardTab: '関数ウィザード', diagnosisTab: '診断',
    suggestionList: '関数の候補', suggestionsEmpty: '入力中の文字列に一致する関数はありません。',
    suggestionHint: '上下キーで選択、Enter で確定、Escape で閉じます。',
    category: '分類', syntax: '構文', parameters: '引数',
    parameterRequired: '必須', parameterOptional: '省略可',
    argumentPlaceholder: (parameter) => `${parameter} の値`,
    apply: '適用', insert: 'セルに挿入', clear: '消去',
    diagnosisEmpty: '問題ありません。数式は有効で、関数はすべて既知です。',
    diagnosisCount: (count) => `${count} 件の指摘`,
    spillTitle: '動的配列',
    spillBlocked: (cells) => `出力は使用中のセルに遮られています: ${cells}。先に空にしてください。`,
    spillOutOfBounds: '出力がシートの範囲を超えています。',
    spillTooLarge: '出力が動的配列のセル上限を超えています。',
    spillOk: (cells) => `出力は ${cells} セルを使用し、空いています。`,
    cycleTitle: '循環参照',
    cycleFound: (path) => `循環を検出しました: ${path}。結果は #CIRCULAR! です。`,
    cycleNone: 'このブックの数式グラフに循環は見つかりませんでした。',
    referenceMode: '参照の種類', referenceRelative: '相対', referenceAbsolute: '絶対', referenceMixed: '複合',
    dateContext: '日付と時刻のコンテキスト',
    dateContextLabel: (zone, locale) => `タイムゾーン ${zone}、ロケール ${locale}`,
    scopeTitle: '名前の束縛 (LET/LAMBDA)',
    scopeBindings: (names) => `束縛された名前: ${names}`,
    scopeNone: 'この数式に名前の束縛はありません。',
    arityCode: '必要な引数', notApplicable: '該当なし',
  },
  'zh-CN': {
    open: '公式助手', openTitle: '函数库、自动补全与公式诊断',
    title: '公式助手', close: '关闭公式助手',
    completionsTab: '自动补全', wizardTab: '函数向导', diagnosisTab: '诊断',
    suggestionList: '函数建议', suggestionsEmpty: '没有函数与当前输入匹配。',
    suggestionHint: '用上下方向键选择，Enter 确认，Escape 关闭。',
    category: '类别', syntax: '语法', parameters: '参数',
    parameterRequired: '必填', parameterOptional: '可选',
    argumentPlaceholder: (parameter) => `${parameter} 的值`,
    apply: '应用', insert: '插入单元格', clear: '清空',
    diagnosisEmpty: '没有问题：公式有效，且所有函数均已知。',
    diagnosisCount: (count) => `${count} 条提示`,
    spillTitle: '动态数组',
    spillBlocked: (cells) => `输出被已占用的单元格阻挡：${cells}。请先清空这些单元格。`,
    spillOutOfBounds: '输出超出了工作表边界。',
    spillTooLarge: '输出超过了动态数组的单元格上限。',
    spillOk: (cells) => `输出占用 ${cells} 个单元格，且未被阻挡。`,
    cycleTitle: '循环引用',
    cycleFound: (path) => `检测到循环：${path}。结果为 #CIRCULAR!。`,
    cycleNone: '在此工作簿的公式图中未发现循环。',
    referenceMode: '引用类型', referenceRelative: '相对', referenceAbsolute: '绝对', referenceMixed: '混合',
    dateContext: '日期与时间上下文',
    dateContextLabel: (zone, locale) => `时区 ${zone}，区域设置 ${locale}`,
    scopeTitle: '名称绑定 (LET/LAMBDA)',
    scopeBindings: (names) => `已绑定名称：${names}`,
    scopeNone: '此公式中没有名称绑定。',
    arityCode: '所需参数', notApplicable: '不适用',
  },
};
