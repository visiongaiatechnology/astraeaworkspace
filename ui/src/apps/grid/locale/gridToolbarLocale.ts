// STATUS: PLATIN — complete seven-locale copy for the Grid formula toolbar.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export interface GridToolbarCopy {
  readonly cellFormatting: string;
  readonly bold: string;
  readonly boldTitle: string;
  readonly italic: string;
  readonly italicTitle: string;
  readonly underline: string;
  readonly strikethrough: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  readonly wrapText: string;
  readonly currencyFormat: string;
  readonly currencyTitle: string;
  readonly percentageFormat: string;
  readonly percentageTitle: string;
  readonly numberFormat: string;
  readonly numberTitle: string;
  readonly dateFormat: string;
  readonly dateTitle: string;
  readonly frequentActions: string;
  readonly chart: string;
  readonly chartTitle: string;
  readonly find: string;
  readonly findReplace: string;
  readonly findReplaceTitle: string;
  readonly layout: string;
  readonly layoutTitle: string;
  readonly nameBoxAria: (range: string) => string;
  readonly nameBoxTitle: string;
  readonly namedRanges: string;
  readonly noNamedRanges: string;
  readonly formulaTitle: string;
  readonly formulaInput: string;
  readonly formulaPlaceholder: string;
  readonly apply: string;
  readonly moreActions: string;
  readonly gridTools: string;
  readonly gridToolsSummary: string;
  readonly analysisTools: string;
  readonly analysis: string;
  readonly whatIf: string;
  readonly whatIfTitle: string;
  readonly dataTable: string;
  readonly dataTableTitle: string;
  readonly slicer: string;
  readonly slicerTitle: string;
  readonly audit: string;
  readonly auditTitle: string;
  readonly powerQuery: string;
  readonly powerQueryTitle: string;
  readonly solver: string;
  readonly solverTitle: string;
  readonly monteCarlo: string;
  readonly monteCarloTitle: string;
  readonly roundtrip: string;
  readonly roundtripTitle: string;
  readonly workbookAndExport: string;
  readonly comments: string;
  readonly commentsTitle: string;
  readonly downloadCsv: string;
  readonly downloadXlsx: string;
  readonly downloadOds: string;
  readonly csv: string;
}

export const GRID_TOOLBAR_COPY: Readonly<Record<WorkspaceLocale, GridToolbarCopy>> = {
  'de-DE': {
    cellFormatting: 'Zellenformatierung', bold: 'Fett', boldTitle: 'Fett (Strg+B)', italic: 'Kursiv', italicTitle: 'Kursiv (Strg+I)',
    underline: 'Unterstreichen', strikethrough: 'Durchstreichen', alignLeft: 'Links ausrichten', alignCenter: 'Zentriert ausrichten',
    alignRight: 'Rechts ausrichten', wrapText: 'Text umbrechen', currencyFormat: 'Währungsformat', currencyTitle: 'Währung ($)',
    percentageFormat: 'Prozentformat', percentageTitle: 'Prozent (%)', numberFormat: 'Zahlenformat', numberTitle: 'Zahl (123)', dateFormat: 'Datumsformat', dateTitle: 'Datum (TT.MM.JJJJ)',
    frequentActions: 'Häufige Aktionen', chart: 'Diagramm', chartTitle: 'Diagramm aus dem markierten Bereich erstellen', find: 'Suchen',
    findReplace: 'Suchen und ersetzen', findReplaceTitle: 'Suchen und ersetzen (Strg+F / Strg+H)', layout: 'Layout',
    layoutTitle: 'Daten, Überprüfung, bedingte Formatierung, Pivot und Seitenlayout',
    nameBoxAria: (range) => `Namensfeld, markierter Bereich ${range}`, nameBoxTitle: 'Namensfeld · Bereich anzeigen oder benannten Bereich auswählen',
    namedRanges: 'Benannte Bereiche', noNamedRanges: 'Keine benannten Bereiche', formulaTitle: 'Formel', formulaInput: 'Formel oder Wert der markierten Zelle',
    formulaPlaceholder: 'Wert oder Formel eingeben, z. B. =SUM(B2:B5), =AVERAGE(A1:A10), =XLOOKUP(...)', apply: 'Anwenden',
    moreActions: 'Weitere Aktionen', gridTools: 'Grid-Werkzeuge', gridToolsSummary: 'Analyse, Kommentare und Export', analysisTools: 'Analysewerkzeuge',
    analysis: 'Analyse', whatIf: 'Was-wäre-wenn', whatIfTitle: 'Zielwertsuche und Szenarien', dataTable: 'Datentabelle',
    dataTableTitle: 'Was-wäre-wenn-Datentabellen mit einer oder zwei Variablen', slicer: 'Datenschnitt', slicerTitle: 'Interaktive Datenschnitte',
    audit: 'Formelprüfung', auditTitle: 'Formelbezüge prüfen (Vorgänger und Nachfolger)', powerQuery: 'Power Query',
    powerQueryTitle: 'Lokaler Power-Query-Editor für ETL und Abfragefaltung', solver: 'Solver', solverTitle: 'Optimierung mit linearen und ganzzahligen Modellen',
    monteCarlo: 'Monte-Carlo', monteCarloTitle: 'Stochastische Monte-Carlo-Risikoanalyse', roundtrip: 'Rundlaufprüfung',
    roundtripTitle: 'Interoperabilitätsprüfung und Universalimport', workbookAndExport: 'Arbeitsmappe und Export', comments: 'Kommentare',
    commentsTitle: 'Zellkommentare und Notizen', downloadCsv: 'Blatt als CSV-Datei herunterladen',
    downloadXlsx: 'Blatt als Excel-Arbeitsmappe (.xlsx) herunterladen',
    downloadOds: 'Blatt als OpenDocument-Tabelle (.ods) herunterladen', csv: 'CSV',
  },
  'en-US': {
    cellFormatting: 'Cell formatting', bold: 'Bold', boldTitle: 'Bold (Ctrl+B)', italic: 'Italic', italicTitle: 'Italic (Ctrl+I)',
    underline: 'Underline', strikethrough: 'Strikethrough', alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right',
    wrapText: 'Wrap text', currencyFormat: 'Currency format', currencyTitle: 'Currency ($)', percentageFormat: 'Percentage format',
    percentageTitle: 'Percentage (%)', numberFormat: 'Number format', numberTitle: 'Number (123)', dateFormat: 'Date format', dateTitle: 'Date (YYYY-MM-DD)', frequentActions: 'Frequent actions',
    chart: 'Chart', chartTitle: 'Create a chart from the selected range', find: 'Find', findReplace: 'Find and replace',
    findReplaceTitle: 'Find and replace (Ctrl+F / Ctrl+H)', layout: 'Layout', layoutTitle: 'Data, validation, conditional formatting, pivots, and page layout',
    nameBoxAria: (range) => `Name box, selected range ${range}`, nameBoxTitle: 'Name box · Current range / select named range',
    namedRanges: 'Named ranges', noNamedRanges: 'No named ranges', formulaTitle: 'Formula', formulaInput: 'Formula or selected cell value',
    formulaPlaceholder: 'Enter a value or formula, e.g. =SUM(B2:B5), =AVERAGE(A1:A10), =XLOOKUP(...)', apply: 'Apply',
    moreActions: 'More actions', gridTools: 'Grid tools', gridToolsSummary: 'Analysis, comments, and export', analysisTools: 'Analysis tools',
    analysis: 'Analysis', whatIf: 'What-if', whatIfTitle: 'Goal Seek and scenarios', dataTable: 'Data table',
    dataTableTitle: 'What-if data tables with one or two variables', slicer: 'Slicer', slicerTitle: 'Interactive slicers',
    audit: 'Formula audit', auditTitle: 'Audit formula references (precedents and dependents)', powerQuery: 'Power Query',
    powerQueryTitle: 'Local Power Query ETL editor and query folding', solver: 'Solver', solverTitle: 'Optimization solver for linear and integer models',
    monteCarlo: 'Monte Carlo', monteCarloTitle: 'Stochastic Monte Carlo risk analysis', roundtrip: 'Roundtrip',
    roundtripTitle: 'Interoperability benchmark and universal importer', workbookAndExport: 'Workbook and export', comments: 'Comments',
    commentsTitle: 'Cell comments and notes', downloadCsv: 'Download sheet as a CSV file',
    downloadXlsx: 'Download sheet as an Excel workbook (.xlsx)',
    downloadOds: 'Download sheet as an OpenDocument spreadsheet (.ods)', csv: 'CSV',
  },
  'es-ES': {
    cellFormatting: 'Formato de celda', bold: 'Negrita', boldTitle: 'Negrita (Ctrl+B)', italic: 'Cursiva', italicTitle: 'Cursiva (Ctrl+I)',
    underline: 'Subrayado', strikethrough: 'Tachado', alignLeft: 'Alinear a la izquierda', alignCenter: 'Alinear al centro',
    alignRight: 'Alinear a la derecha', wrapText: 'Ajustar texto', currencyFormat: 'Formato de moneda', currencyTitle: 'Moneda ($)',
    percentageFormat: 'Formato de porcentaje', percentageTitle: 'Porcentaje (%)', numberFormat: 'Formato numérico', numberTitle: 'Número (123)', dateFormat: 'Formato de fecha', dateTitle: 'Fecha (AAAA-MM-DD)',
    frequentActions: 'Acciones frecuentes', chart: 'Gráfico', chartTitle: 'Crear un gráfico a partir del rango seleccionado', find: 'Buscar',
    findReplace: 'Buscar y reemplazar', findReplaceTitle: 'Buscar y reemplazar (Ctrl+F / Ctrl+H)', layout: 'Diseño',
    layoutTitle: 'Datos, validación, formato condicional, tablas dinámicas y diseño de página',
    nameBoxAria: (range) => `Cuadro de nombres, rango seleccionado ${range}`, nameBoxTitle: 'Cuadro de nombres · Rango actual o seleccionar rango con nombre',
    namedRanges: 'Rangos con nombre', noNamedRanges: 'No hay rangos con nombre', formulaTitle: 'Fórmula', formulaInput: 'Fórmula o valor de la celda seleccionada',
    formulaPlaceholder: 'Introduce un valor o fórmula, p. ej. =SUM(B2:B5), =AVERAGE(A1:A10), =XLOOKUP(...)', apply: 'Aplicar',
    moreActions: 'Más acciones', gridTools: 'Herramientas de Grid', gridToolsSummary: 'Análisis, comentarios y exportación', analysisTools: 'Herramientas de análisis',
    analysis: 'Análisis', whatIf: 'Análisis de hipótesis', whatIfTitle: 'Buscar objetivo y escenarios', dataTable: 'Tabla de datos',
    dataTableTitle: 'Tablas de datos de hipótesis con una o dos variables', slicer: 'Segmentador', slicerTitle: 'Segmentadores interactivos',
    audit: 'Auditoría de fórmulas', auditTitle: 'Revisar referencias de fórmulas (precedentes y dependientes)', powerQuery: 'Power Query',
    powerQueryTitle: 'Editor ETL local de Power Query y plegado de consultas', solver: 'Solver', solverTitle: 'Optimizador para modelos lineales y enteros',
    monteCarlo: 'Monte Carlo', monteCarloTitle: 'Análisis estocástico de riesgo Monte Carlo', roundtrip: 'Interoperabilidad',
    roundtripTitle: 'Prueba de interoperabilidad e importador universal', workbookAndExport: 'Libro y exportación', comments: 'Comentarios',
    commentsTitle: 'Comentarios y notas de celda', downloadCsv: 'Descargar hoja como archivo CSV',
    downloadXlsx: 'Descargar la hoja como libro de Excel (.xlsx)',
    downloadOds: 'Descargar la hoja como hoja de OpenDocument (.ods)', csv: 'CSV',
  },
  'it-IT': {
    cellFormatting: 'Formato celle', bold: 'Grassetto', boldTitle: 'Grassetto (Ctrl+B)', italic: 'Corsivo', italicTitle: 'Corsivo (Ctrl+I)',
    underline: 'Sottolineato', strikethrough: 'Barrato', alignLeft: 'Allinea a sinistra', alignCenter: 'Allinea al centro',
    alignRight: 'Allinea a destra', wrapText: 'Testo a capo', currencyFormat: 'Formato valuta', currencyTitle: 'Valuta ($)',
    percentageFormat: 'Formato percentuale', percentageTitle: 'Percentuale (%)', numberFormat: 'Formato numerico', numberTitle: 'Numero (123)', dateFormat: 'Formato data', dateTitle: 'Data (AAAA-MM-GG)',
    frequentActions: 'Azioni frequenti', chart: 'Grafico', chartTitle: 'Crea un grafico dall’intervallo selezionato', find: 'Trova',
    findReplace: 'Trova e sostituisci', findReplaceTitle: 'Trova e sostituisci (Ctrl+F / Ctrl+H)', layout: 'Layout',
    layoutTitle: 'Dati, convalida, formattazione condizionale, pivot e layout di pagina',
    nameBoxAria: (range) => `Casella nome, intervallo selezionato ${range}`, nameBoxTitle: 'Casella nome · Intervallo corrente o seleziona intervallo denominato',
    namedRanges: 'Intervalli denominati', noNamedRanges: 'Nessun intervallo denominato', formulaTitle: 'Formula', formulaInput: 'Formula o valore della cella selezionata',
    formulaPlaceholder: 'Inserisci un valore o una formula, ad es. =SUM(B2:B5), =AVERAGE(A1:A10), =XLOOKUP(...)', apply: 'Applica',
    moreActions: 'Altre azioni', gridTools: 'Strumenti Grid', gridToolsSummary: 'Analisi, commenti ed esportazione', analysisTools: 'Strumenti di analisi',
    analysis: 'Analisi', whatIf: 'Analisi di scenario', whatIfTitle: 'Ricerca obiettivo e scenari', dataTable: 'Tabella dati',
    dataTableTitle: 'Tabelle dati di scenario con una o due variabili', slicer: 'Segmentazione dati', slicerTitle: 'Segmentazioni dati interattive',
    audit: 'Verifica formula', auditTitle: 'Verifica riferimenti formula (precedenti e dipendenti)', powerQuery: 'Power Query',
    powerQueryTitle: 'Editor ETL locale Power Query e query folding', solver: 'Solver', solverTitle: 'Ottimizzazione per modelli lineari e interi',
    monteCarlo: 'Monte Carlo', monteCarloTitle: 'Analisi stocastica del rischio Monte Carlo', roundtrip: 'Roundtrip',
    roundtripTitle: 'Verifica interoperabilità e importatore universale', workbookAndExport: 'Cartella di lavoro ed esportazione', comments: 'Commenti',
    commentsTitle: 'Commenti e note cella', downloadCsv: 'Scarica il foglio come file CSV',
    downloadXlsx: 'Scarica il foglio come cartella di lavoro Excel (.xlsx)',
    downloadOds: 'Scarica il foglio come foglio OpenDocument (.ods)', csv: 'CSV',
  },
  'ja-JP': {
    cellFormatting: 'セルの書式設定', bold: '太字', boldTitle: '太字 (Ctrl+B)', italic: '斜体', italicTitle: '斜体 (Ctrl+I)',
    underline: '下線', strikethrough: '取り消し線', alignLeft: '左揃え', alignCenter: '中央揃え', alignRight: '右揃え',
    wrapText: 'テキストを折り返す', currencyFormat: '通貨形式', currencyTitle: '通貨 ($)', percentageFormat: 'パーセント形式',
    percentageTitle: 'パーセント (%)', numberFormat: '数値形式', numberTitle: '数値 (123)', dateFormat: '日付形式', dateTitle: '日付 (YYYY-MM-DD)', frequentActions: 'よく使う操作',
    chart: 'グラフ', chartTitle: '選択範囲からグラフを作成', find: '検索', findReplace: '検索と置換',
    findReplaceTitle: '検索と置換 (Ctrl+F / Ctrl+H)', layout: 'レイアウト', layoutTitle: 'データ、入力規則、条件付き書式、ピボット、ページ設定',
    nameBoxAria: (range) => `名前ボックス、選択範囲 ${range}`, nameBoxTitle: '名前ボックス · 現在の範囲または名前付き範囲を選択',
    namedRanges: '名前付き範囲', noNamedRanges: '名前付き範囲はありません', formulaTitle: '数式', formulaInput: '数式または選択セルの値',
    formulaPlaceholder: '値または数式を入力 (例: =SUM(B2:B5)、=AVERAGE(A1:A10)、=XLOOKUP(...))', apply: '適用',
    moreActions: 'その他の操作', gridTools: 'Grid ツール', gridToolsSummary: '分析、コメント、エクスポート', analysisTools: '分析ツール',
    analysis: '分析', whatIf: 'What-If 分析', whatIfTitle: 'ゴールシークとシナリオ', dataTable: 'データテーブル',
    dataTableTitle: '1 変数または 2 変数の What-If データテーブル', slicer: 'スライサー', slicerTitle: '対話型スライサー',
    audit: '数式の監査', auditTitle: '数式の参照元と参照先を確認', powerQuery: 'Power Query',
    powerQueryTitle: 'ローカル Power Query ETL エディターとクエリ折りたたみ', solver: 'ソルバー', solverTitle: '線形・整数モデルの最適化ソルバー',
    monteCarlo: 'モンテカルロ', monteCarloTitle: '確率的なモンテカルロリスク分析', roundtrip: '往復変換',
    roundtripTitle: '相互運用性ベンチマークと汎用インポーター', workbookAndExport: 'ブックとエクスポート', comments: 'コメント',
    commentsTitle: 'セルのコメントとメモ', downloadCsv: 'シートを CSV ファイルとしてダウンロード',
    downloadXlsx: 'シートを Excel ブック (.xlsx) としてダウンロード',
    downloadOds: 'シートを OpenDocument 表計算 (.ods) としてダウンロード', csv: 'CSV',
  },
  'ru-RU': {
    cellFormatting: 'Формат ячеек', bold: 'Полужирный', boldTitle: 'Полужирный (Ctrl+B)', italic: 'Курсив', italicTitle: 'Курсив (Ctrl+I)',
    underline: 'Подчёркивание', strikethrough: 'Зачёркивание', alignLeft: 'По левому краю', alignCenter: 'По центру', alignRight: 'По правому краю',
    wrapText: 'Перенос текста', currencyFormat: 'Денежный формат', currencyTitle: 'Валюта ($)', percentageFormat: 'Процентный формат',
    percentageTitle: 'Проценты (%)', numberFormat: 'Числовой формат', numberTitle: 'Число (123)', dateFormat: 'Формат даты', dateTitle: 'Дата (ГГГГ-ММ-ДД)', frequentActions: 'Частые действия',
    chart: 'Диаграмма', chartTitle: 'Создать диаграмму по выделенному диапазону', find: 'Найти', findReplace: 'Найти и заменить',
    findReplaceTitle: 'Найти и заменить (Ctrl+F / Ctrl+H)', layout: 'Макет', layoutTitle: 'Данные, проверка, условное форматирование, сводные таблицы и разметка страницы',
    nameBoxAria: (range) => `Поле имени, выбран диапазон ${range}`, nameBoxTitle: 'Поле имени · Текущий диапазон или выбор именованного диапазона',
    namedRanges: 'Именованные диапазоны', noNamedRanges: 'Нет именованных диапазонов', formulaTitle: 'Формула', formulaInput: 'Формула или значение выбранной ячейки',
    formulaPlaceholder: 'Введите значение или формулу, например =SUM(B2:B5), =AVERAGE(A1:A10), =XLOOKUP(...)', apply: 'Применить',
    moreActions: 'Другие действия', gridTools: 'Инструменты Grid', gridToolsSummary: 'Анализ, комментарии и экспорт', analysisTools: 'Инструменты анализа',
    analysis: 'Анализ', whatIf: 'Анализ «что если»', whatIfTitle: 'Подбор параметра и сценарии', dataTable: 'Таблица данных',
    dataTableTitle: 'Таблицы данных «что если» с одной или двумя переменными', slicer: 'Срез', slicerTitle: 'Интерактивные срезы',
    audit: 'Проверка формул', auditTitle: 'Проверить ссылки формулы (предшествующие и зависимые)', powerQuery: 'Power Query',
    powerQueryTitle: 'Локальный редактор Power Query ETL и свёртывание запросов', solver: 'Поиск решения', solverTitle: 'Оптимизатор линейных и целочисленных моделей',
    monteCarlo: 'Монте-Карло', monteCarloTitle: 'Стохастический анализ рисков Монте-Карло', roundtrip: 'Проверка обмена',
    roundtripTitle: 'Тест совместимости и универсальный импортёр', workbookAndExport: 'Книга и экспорт', comments: 'Комментарии',
    commentsTitle: 'Комментарии и заметки к ячейкам', downloadCsv: 'Скачать лист в формате CSV',
    downloadXlsx: 'Скачать лист как книгу Excel (.xlsx)',
    downloadOds: 'Скачать лист как таблицу OpenDocument (.ods)', csv: 'CSV',
  },
  'zh-CN': {
    cellFormatting: '单元格格式', bold: '粗体', boldTitle: '粗体 (Ctrl+B)', italic: '斜体', italicTitle: '斜体 (Ctrl+I)',
    underline: '下划线', strikethrough: '删除线', alignLeft: '左对齐', alignCenter: '居中对齐', alignRight: '右对齐',
    wrapText: '自动换行', currencyFormat: '货币格式', currencyTitle: '货币 ($)', percentageFormat: '百分比格式',
    percentageTitle: '百分比 (%)', numberFormat: '数字格式', numberTitle: '数字 (123)', dateFormat: '日期格式', dateTitle: '日期 (YYYY-MM-DD)', frequentActions: '常用操作', chart: '图表',
    chartTitle: '根据所选区域创建图表', find: '查找', findReplace: '查找和替换', findReplaceTitle: '查找和替换 (Ctrl+F / Ctrl+H)',
    layout: '布局', layoutTitle: '数据、验证、条件格式、数据透视和页面布局', nameBoxAria: (range) => `名称框，所选区域 ${range}`,
    nameBoxTitle: '名称框 · 当前区域或选择命名区域', namedRanges: '命名区域', noNamedRanges: '没有命名区域', formulaTitle: '公式',
    formulaInput: '公式或所选单元格的值', formulaPlaceholder: '输入值或公式，例如 =SUM(B2:B5)、=AVERAGE(A1:A10)、=XLOOKUP(...)', apply: '应用',
    moreActions: '更多操作', gridTools: 'Grid 工具', gridToolsSummary: '分析、评论和导出', analysisTools: '分析工具', analysis: '分析',
    whatIf: '假设分析', whatIfTitle: '单变量求解和方案', dataTable: '数据表', dataTableTitle: '单变量或双变量假设数据表',
    slicer: '切片器', slicerTitle: '交互式切片器', audit: '公式审核', auditTitle: '检查公式引用关系 (引用单元格和从属单元格)',
    powerQuery: 'Power Query', powerQueryTitle: '本地 Power Query ETL 编辑器和查询折叠', solver: '规划求解', solverTitle: '线性和整数模型优化求解器',
    monteCarlo: '蒙特卡洛', monteCarloTitle: '随机蒙特卡洛风险分析', roundtrip: '往返测试', roundtripTitle: '互操作性基准和通用导入器',
    workbookAndExport: '工作簿和导出', comments: '评论', commentsTitle: '单元格评论和备注', downloadCsv: '将工作表下载为 CSV 文件',
    downloadXlsx: '将工作表下载为 Excel 工作簿 (.xlsx)',
    downloadOds: '将工作表下载为 OpenDocument 电子表格 (.ods)', csv: 'CSV',
  },
} satisfies Record<WorkspaceLocale, GridToolbarCopy>;
