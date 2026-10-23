// STATUS: PLATIN — complete seven-locale copy for shared workspace toolbar controls.
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export type AdaptiveToolbarSelection = 'text' | 'cell' | 'shape' | 'chart';

export interface AdaptiveToolbarCopy {
  readonly selectionTools: Readonly<Record<AdaptiveToolbarSelection, string>>;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly heading1: string;
  readonly heading2: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  readonly bulletedList: string;
  readonly currency: string;
  readonly currencyTitle: string;
  readonly percent: string;
  readonly percentTitle: string;
  readonly number: string;
  readonly numberTitle: string;
  readonly date: string;
  readonly dateTitle: string;
  readonly formatMenu: string;
  readonly formatMenuTitle: string;
  readonly formatPresets: string;
  readonly insertDynamicChart: string;
  readonly insertChart: string;
  readonly addRectangle: string;
  readonly addCircle: string;
  readonly moreActions: string;
  readonly moreActionsTitle: string;
  readonly switchRibbonTitle: string;
  readonly classicRibbon: string;
  readonly adaptiveToolbar: string;
}

export const ADAPTIVE_TOOLBAR_COPY: Readonly<Record<WorkspaceLocale, AdaptiveToolbarCopy>> = {
  'de-DE': {
    selectionTools: { text: 'Textwerkzeuge', cell: 'Zellenwerkzeuge', shape: 'Formwerkzeuge', chart: 'Diagrammwerkzeuge' },
    bold: 'Fett', italic: 'Kursiv', underline: 'Unterstreichen', heading1: 'Überschrift 1', heading2: 'Überschrift 2',
    alignLeft: 'Links ausrichten', alignCenter: 'Zentriert ausrichten', alignRight: 'Rechts ausrichten', bulletedList: 'Aufzählung',
    currency: 'Währung', currencyTitle: 'Währungsformat anwenden ($)', percent: 'Prozent', percentTitle: 'Prozentformat anwenden (%)',
    number: 'Zahl', numberTitle: 'Zahlenformat anwenden (123)', date: 'Datum', dateTitle: 'Datumsformat anwenden (TT.MM.JJJJ)',
    formatMenu: 'Format', formatMenuTitle: 'Weitere Zahlenformate', formatPresets: 'Zahlenformat-Presets',
    insertDynamicChart: 'Dynamisches Diagramm einfügen', insertChart: 'Diagramm einfügen', addRectangle: 'Rechteck hinzufügen', addCircle: 'Kreis hinzufügen',
    moreActions: 'Weitere Werkzeugleisten-Aktionen', moreActionsTitle: 'Weitere Aktionen',
    switchRibbonTitle: 'Zwischen adaptiver Werkzeugleiste und klassischem Menüband wechseln',
    classicRibbon: 'Klassisches Menüband', adaptiveToolbar: 'Adaptive Werkzeugleiste',
  },
  'en-US': {
    selectionTools: { text: 'Text tools', cell: 'Cell tools', shape: 'Shape tools', chart: 'Chart tools' },
    bold: 'Bold', italic: 'Italic', underline: 'Underline', heading1: 'Heading 1', heading2: 'Heading 2',
    alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right', bulletedList: 'Bulleted list',
    currency: 'Currency', currencyTitle: 'Apply currency format ($)', percent: 'Percent', percentTitle: 'Apply percentage format (%)',
    number: 'Number', numberTitle: 'Apply number format (123)', date: 'Date', dateTitle: 'Apply date format (YYYY-MM-DD)',
    formatMenu: 'Format', formatMenuTitle: 'More number formats', formatPresets: 'Number format presets',
    insertDynamicChart: 'Insert dynamic chart', insertChart: 'Insert chart', addRectangle: 'Add rectangle', addCircle: 'Add circle',
    moreActions: 'More toolbar actions', moreActionsTitle: 'More actions',
    switchRibbonTitle: 'Switch between the adaptive toolbar and classic ribbon',
    classicRibbon: 'Classic ribbon', adaptiveToolbar: 'Adaptive toolbar',
  },
  'es-ES': {
    selectionTools: { text: 'Herramientas de texto', cell: 'Herramientas de celda', shape: 'Herramientas de forma', chart: 'Herramientas de gráfico' },
    bold: 'Negrita', italic: 'Cursiva', underline: 'Subrayado', heading1: 'Encabezado 1', heading2: 'Encabezado 2',
    alignLeft: 'Alinear a la izquierda', alignCenter: 'Alinear al centro', alignRight: 'Alinear a la derecha', bulletedList: 'Lista con viñetas',
    currency: 'Moneda', currencyTitle: 'Aplicar formato de moneda ($)', percent: 'Porcentaje', percentTitle: 'Aplicar formato de porcentaje (%)',
    number: 'Número', numberTitle: 'Aplicar formato numérico (123)', date: 'Fecha', dateTitle: 'Aplicar formato de fecha (AAAA-MM-DD)',
    formatMenu: 'Formato', formatMenuTitle: 'Más formatos numéricos', formatPresets: 'Preajustes de formato numérico',
    insertDynamicChart: 'Insertar gráfico dinámico', insertChart: 'Insertar gráfico', addRectangle: 'Añadir rectángulo', addCircle: 'Añadir círculo',
    moreActions: 'Más acciones de la barra de herramientas', moreActionsTitle: 'Más acciones',
    switchRibbonTitle: 'Cambiar entre la barra adaptable y la cinta clásica',
    classicRibbon: 'Cinta clásica', adaptiveToolbar: 'Barra adaptable',
  },
  'it-IT': {
    selectionTools: { text: 'Strumenti testo', cell: 'Strumenti cella', shape: 'Strumenti forma', chart: 'Strumenti grafico' },
    bold: 'Grassetto', italic: 'Corsivo', underline: 'Sottolineato', heading1: 'Titolo 1', heading2: 'Titolo 2',
    alignLeft: 'Allinea a sinistra', alignCenter: 'Allinea al centro', alignRight: 'Allinea a destra', bulletedList: 'Elenco puntato',
    currency: 'Valuta', currencyTitle: 'Applica formato valuta ($)', percent: 'Percentuale', percentTitle: 'Applica formato percentuale (%)',
    number: 'Numero', numberTitle: 'Applica formato numerico (123)', date: 'Data', dateTitle: 'Applica formato data (AAAA-MM-GG)',
    formatMenu: 'Formato', formatMenuTitle: 'Altri formati numerici', formatPresets: 'Preset formato numerico',
    insertDynamicChart: 'Inserisci grafico dinamico', insertChart: 'Inserisci grafico', addRectangle: 'Aggiungi rettangolo', addCircle: 'Aggiungi cerchio',
    moreActions: 'Altre azioni della barra degli strumenti', moreActionsTitle: 'Altre azioni',
    switchRibbonTitle: 'Passa dalla barra adattiva alla barra multifunzione classica',
    classicRibbon: 'Barra multifunzione classica', adaptiveToolbar: 'Barra adattiva',
  },
  'ja-JP': {
    selectionTools: { text: 'テキストツール', cell: 'セルツール', shape: '図形ツール', chart: 'グラフツール' },
    bold: '太字', italic: '斜体', underline: '下線', heading1: '見出し 1', heading2: '見出し 2',
    alignLeft: '左揃え', alignCenter: '中央揃え', alignRight: '右揃え', bulletedList: '箇条書き',
    currency: '通貨', currencyTitle: '通貨形式を適用 ($)', percent: 'パーセント', percentTitle: 'パーセント形式を適用 (%)',
    number: '数値', numberTitle: '数値形式を適用 (123)', date: '日付', dateTitle: '日付形式を適用 (YYYY-MM-DD)',
    formatMenu: '書式', formatMenuTitle: 'その他の数値形式', formatPresets: '数値形式プリセット',
    insertDynamicChart: '動的グラフを挿入', insertChart: 'グラフを挿入', addRectangle: '長方形を追加', addCircle: '円を追加',
    moreActions: 'その他のツールバー操作', moreActionsTitle: 'その他の操作',
    switchRibbonTitle: 'アダプティブツールバーとクラシックリボンを切り替え',
    classicRibbon: 'クラシックリボン', adaptiveToolbar: 'アダプティブツールバー',
  },
  'ru-RU': {
    selectionTools: { text: 'Инструменты текста', cell: 'Инструменты ячеек', shape: 'Инструменты фигур', chart: 'Инструменты диаграмм' },
    bold: 'Полужирный', italic: 'Курсив', underline: 'Подчёркивание', heading1: 'Заголовок 1', heading2: 'Заголовок 2',
    alignLeft: 'По левому краю', alignCenter: 'По центру', alignRight: 'По правому краю', bulletedList: 'Маркированный список',
    currency: 'Валюта', currencyTitle: 'Применить денежный формат ($)', percent: 'Процент', percentTitle: 'Применить процентный формат (%)',
    number: 'Число', numberTitle: 'Применить числовой формат (123)', date: 'Дата', dateTitle: 'Применить формат даты (ГГГГ-ММ-ДД)',
    formatMenu: 'Формат', formatMenuTitle: 'Другие числовые форматы', formatPresets: 'Наборы числовых форматов',
    insertDynamicChart: 'Вставить динамическую диаграмму', insertChart: 'Вставить диаграмму', addRectangle: 'Добавить прямоугольник', addCircle: 'Добавить круг',
    moreActions: 'Другие действия панели инструментов', moreActionsTitle: 'Другие действия',
    switchRibbonTitle: 'Переключить адаптивную панель и классическую ленту',
    classicRibbon: 'Классическая лента', adaptiveToolbar: 'Адаптивная панель',
  },
  'zh-CN': {
    selectionTools: { text: '文本工具', cell: '单元格工具', shape: '形状工具', chart: '图表工具' },
    bold: '粗体', italic: '斜体', underline: '下划线', heading1: '标题 1', heading2: '标题 2',
    alignLeft: '左对齐', alignCenter: '居中对齐', alignRight: '右对齐', bulletedList: '项目符号列表',
    currency: '货币', currencyTitle: '应用货币格式 ($)', percent: '百分比', percentTitle: '应用百分比格式 (%)',
    number: '数字', numberTitle: '应用数字格式 (123)', date: '日期', dateTitle: '应用日期格式 (YYYY-MM-DD)',
    formatMenu: '格式', formatMenuTitle: '更多数字格式', formatPresets: '数字格式预设',
    insertDynamicChart: '插入动态图表', insertChart: '插入图表', addRectangle: '添加矩形', addCircle: '添加圆形',
    moreActions: '更多工具栏操作', moreActionsTitle: '更多操作',
    switchRibbonTitle: '切换自适应工具栏和经典功能区',
    classicRibbon: '经典功能区', adaptiveToolbar: '自适应工具栏',
  },
} satisfies Record<WorkspaceLocale, AdaptiveToolbarCopy>;
