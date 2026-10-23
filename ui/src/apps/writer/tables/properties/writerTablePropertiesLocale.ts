// STATUS: PLATIN — complete seven-locale copy for Writer table properties.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

export type WriterTablePresetCopy = { label: string; description: string };

export type WriterTablePropertiesCopy = {
  title: string;
  closeDialog: string;
  close: string;
  tableDimensions: (rows: number, columns: number, id: string) => string;
  tabs: { table: string; styles: string; row: string; cell: string; tools: string };
  general: {
    autoFitLabel: string;
    autoFit: {
      window: { label: string; description: string };
      contents: { label: string; description: string };
      fixed: { label: string; description: string };
    };
    columnWidths: string;
    caption: string;
    captionPlaceholder: string;
    captionPosition: { above: string; below: string };
    repeatHeader: string;
  };
  row: {
    activeRow: string;
    rowOption: (rowNumber: number, resultRow: boolean) => string;
    keepTogether: string;
    keepTogetherHelp: string;
  };
  styles: {
    presets: string;
    designOptions: string;
    unknownPreset: string;
    unknownPresetDescription: string;
    highlightHeader: string;
    highlightTotal: string;
    alternatingRows: string;
    highlightFirstColumn: string;
    highlightLastColumn: string;
  };
  cell: {
    row: string;
    rowOption: (rowNumber: number) => string;
    column: string;
    verticalAlignment: string;
    alignment: { top: string; middle: string; bottom: string };
    textRotation: string;
    rotation: { normal: string; vertical: string; rotated: string };
    mergeSplit: string;
    fromRow: string;
    fromColumn: string;
    toRow: string;
    toColumn: string;
    mergeRange: string;
    splitActiveCell: string;
  };
  tools: {
    formulaInCell: (rowNumber: number, columnNumber: number) => string;
    sortTableByColumn: string;
    column: string;
    direction: string;
    ascending: string;
    descending: string;
    dataType: string;
    text: string;
    numeric: string;
    sortNow: string;
    splitTable: string;
    splitBeforeRow: string;
    split: string;
  };
  presets: Record<string, WriterTablePresetCopy>;
};

export const WRITER_TABLE_PROPERTIES_COPY = {
  'en-US': {
    title: 'Table properties',
    closeDialog: 'Close table properties dialog',
    close: 'Close',
    tableDimensions: (rows, columns, id) => `${rows} rows × ${columns} columns · ID: ${id}`,
    tabs: { table: 'Table & AutoFit', styles: 'Design & templates', row: 'Row & wrapping', cell: 'Cell & alignment', tools: 'Formulas & sorting' },
    general: {
      autoFitLabel: 'AutoFit behavior',
      autoFit: {
        window: { label: 'Fit to window', description: '100% of available width' },
        contents: { label: 'Fit to contents', description: 'Adjust to text length' },
        fixed: { label: 'Fixed column widths', description: 'Explicit millimeter values' },
      },
      columnWidths: 'Column widths (mm)', caption: 'Table caption', captionPlaceholder: 'For example, quarterly results 2026…',
      captionPosition: { above: 'Above', below: 'Below' }, repeatHeader: 'Repeat header row on every following page',
    },
    row: {
      activeRow: 'Active row', rowOption: (rowNumber, resultRow) => `Row ${rowNumber}${resultRow ? ' (total row)' : ''}`,
      keepTogether: 'Keep row together', keepTogetherHelp: 'Prevent this row from breaking across page boundaries.',
    },
    styles: {
      presets: 'Preset styles', designOptions: 'Table design options', unknownPreset: 'Table style', unknownPresetDescription: 'Built-in table style.', highlightHeader: 'Highlight header row',
      highlightTotal: 'Highlight total row', alternatingRows: 'Alternating row shading', highlightFirstColumn: 'Highlight first column',
      highlightLastColumn: 'Highlight last column',
    },
    cell: {
      row: 'Row', rowOption: (rowNumber) => `Row ${rowNumber}`, column: 'Column', verticalAlignment: 'Vertical alignment',
      alignment: { top: 'Top', middle: 'Middle', bottom: 'Bottom' }, textRotation: 'Text rotation',
      rotation: { normal: '0° (normal)', vertical: '90° (vertical)', rotated: '270° (rotated)' },
      mergeSplit: 'Merge and split cells', fromRow: 'From row', fromColumn: 'From column', toRow: 'To row', toColumn: 'To column',
      mergeRange: 'Merge selected range', splitActiveCell: 'Split active cell',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `Formula in cell (R${rowNumber}:C${columnNumber})`,
      sortTableByColumn: 'Sort table by column', column: 'Column', direction: 'Direction', ascending: 'Ascending (A–Z, 0–9)',
      descending: 'Descending (Z–A, 9–0)', dataType: 'Data type', text: 'Text (alphabetical)', numeric: 'Numbers (numeric)',
      sortNow: 'Sort now', splitTable: 'Split table', splitBeforeRow: 'Split before row', split: 'Split table',
    },
    presets: {
      'grid-neutral': { label: 'Neutral grid', description: 'Balanced slate styling with clear contrast.' },
      'grid-accent': { label: 'Indigo accent', description: 'Emphasized indigo header for formal reports.' },
      'clean-minimal': { label: 'Clean minimal', description: 'Subtle zinc borders for easy reading.' },
      'corporate-dark': { label: 'Corporate slate and cyan', description: 'Professional business styling with cyan accents.' },
      'emerald-finance': { label: 'Emerald finance', description: 'Saturated emerald for balance sheets, budgets, and financial metrics.' },
      'warm-executive': { label: 'Executive amber', description: 'Warm amber and terracotta tones for polished documents.' },
    },
  },
  'de-DE': {
    title: 'Tabelleneigenschaften', closeDialog: 'Dialog „Tabelleneigenschaften“ schließen', close: 'Schließen',
    tableDimensions: (rows, columns, id) => `${rows} Zeilen × ${columns} Spalten · ID: ${id}`,
    tabs: { table: 'Tabelle & AutoFit', styles: 'Design & Vorlagen', row: 'Zeile & Umbruch', cell: 'Zelle & Ausrichtung', tools: 'Formeln & Sortierung' },
    general: {
      autoFitLabel: 'AutoFit-Verhalten',
      autoFit: {
        window: { label: 'An Fenster anpassen', description: '100 % nutzbare Breite' },
        contents: { label: 'An Inhalt anpassen', description: 'Dynamisch nach Textlänge' },
        fixed: { label: 'Feste Spaltenbreiten', description: 'Explizite Millimeterwerte' },
      },
      columnWidths: 'Spaltenbreiten (mm)', caption: 'Tabellenbeschriftung', captionPlaceholder: 'z. B. Quartalszahlen 2026…',
      captionPosition: { above: 'Oberhalb', below: 'Unterhalb' }, repeatHeader: 'Kopfzeile auf jeder Folgeseite wiederholen',
    },
    row: {
      activeRow: 'Aktive Zeile', rowOption: (rowNumber, resultRow) => `Zeile ${rowNumber}${resultRow ? ' (Ergebniszeile)' : ''}`,
      keepTogether: 'Zeile zusammenhalten', keepTogetherHelp: 'Verhindert den Zeilenumbruch über Seitengrenzen hinweg.',
    },
    styles: {
      presets: 'Vordefinierte Vorlagen', designOptions: 'Tabellen-Designoptionen', unknownPreset: 'Tabellenstil', unknownPresetDescription: 'Integrierter Tabellenstil.', highlightHeader: 'Kopfzeile hervorheben',
      highlightTotal: 'Ergebnis-/Summenzeile hervorheben', alternatingRows: 'Gestreifte Zeilen (Zebramuster)', highlightFirstColumn: 'Erste Spalte hervorheben',
      highlightLastColumn: 'Letzte Spalte hervorheben',
    },
    cell: {
      row: 'Zeile', rowOption: (rowNumber) => `Zeile ${rowNumber}`, column: 'Spalte', verticalAlignment: 'Vertikale Ausrichtung',
      alignment: { top: 'Oben', middle: 'Mitte', bottom: 'Unten' }, textRotation: 'Textdrehung',
      rotation: { normal: '0° (normal)', vertical: '90° (vertikal)', rotated: '270° (gedreht)' },
      mergeSplit: 'Zellen verbinden und teilen', fromRow: 'Von Zeile', fromColumn: 'Von Spalte', toRow: 'Bis Zeile', toColumn: 'Bis Spalte',
      mergeRange: 'Bereich verbinden', splitActiveCell: 'Aktive Zelle teilen',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `Formel in Zelle (Z${rowNumber}:S${columnNumber})`,
      sortTableByColumn: 'Tabelle nach Spalte sortieren', column: 'Spalte', direction: 'Richtung', ascending: 'Aufsteigend (A–Z, 0–9)',
      descending: 'Absteigend (Z–A, 9–0)', dataType: 'Datentyp', text: 'Text (alphabetisch)', numeric: 'Zahlen (numerisch)',
      sortNow: 'Jetzt sortieren', splitTable: 'Tabelle teilen', splitBeforeRow: 'Vor Zeile teilen', split: 'Tabelle trennen',
    },
    presets: {
      'grid-neutral': { label: 'Neutrales Raster', description: 'Ausgewogenes Slate-Design mit klaren Kontrasten.' },
      'grid-accent': { label: 'Indigo-Akzent', description: 'Betonte Indigokopfzeile für formelle Berichte.' },
      'clean-minimal': { label: 'Klar und minimal', description: 'Dezente Zinkkonturen für gute Lesbarkeit.' },
      'corporate-dark': { label: 'Corporate in Slate und Cyan', description: 'Professionelles Business-Design mit Cyan-Akzenten.' },
      'emerald-finance': { label: 'Finanzberichte in Smaragdgrün', description: 'Sattes Smaragdgrün für Bilanzen, Budgets und Finanzkennzahlen.' },
      'warm-executive': { label: 'Executive in Bernstein', description: 'Warme Bernstein- und Terrakottatöne für hochwertige Dokumente.' },
    },
  },
  'ru-RU': {
    title: 'Свойства таблицы', closeDialog: 'Закрыть диалог свойств таблицы', close: 'Закрыть',
    tableDimensions: (rows, columns, id) => `${rows} строк × ${columns} столбцов · ID: ${id}`,
    tabs: { table: 'Таблица и автоподбор', styles: 'Дизайн и шаблоны', row: 'Строка и переносы', cell: 'Ячейка и выравнивание', tools: 'Формулы и сортировка' },
    general: {
      autoFitLabel: 'Режим автоподбора',
      autoFit: {
        window: { label: 'По ширине окна', description: '100% доступной ширины' },
        contents: { label: 'По содержимому', description: 'По длине текста' },
        fixed: { label: 'Фиксированная ширина столбцов', description: 'Заданные значения в миллиметрах' },
      },
      columnWidths: 'Ширина столбцов (мм)', caption: 'Подпись таблицы', captionPlaceholder: 'Например, результаты за 2026 год…',
      captionPosition: { above: 'Сверху', below: 'Снизу' }, repeatHeader: 'Повторять заголовок на каждой следующей странице',
    },
    row: {
      activeRow: 'Активная строка', rowOption: (rowNumber, resultRow) => `Строка ${rowNumber}${resultRow ? ' (итоговая строка)' : ''}`,
      keepTogether: 'Не разделять строку', keepTogetherHelp: 'Не переносить эту строку через границу страницы.',
    },
    styles: {
      presets: 'Готовые стили', designOptions: 'Параметры оформления таблицы', unknownPreset: 'Стиль таблицы', unknownPresetDescription: 'Встроенный стиль таблицы.', highlightHeader: 'Выделить строку заголовка',
      highlightTotal: 'Выделить итоговую строку', alternatingRows: 'Чередовать цвета строк', highlightFirstColumn: 'Выделить первый столбец',
      highlightLastColumn: 'Выделить последний столбец',
    },
    cell: {
      row: 'Строка', rowOption: (rowNumber) => `Строка ${rowNumber}`, column: 'Столбец', verticalAlignment: 'Вертикальное выравнивание',
      alignment: { top: 'По верхнему краю', middle: 'По центру', bottom: 'По нижнему краю' }, textRotation: 'Поворот текста',
      rotation: { normal: '0° (обычно)', vertical: '90° (вертикально)', rotated: '270° (повёрнуто)' },
      mergeSplit: 'Объединение и разделение ячеек', fromRow: 'С строки', fromColumn: 'С столбца', toRow: 'По строку', toColumn: 'По столбец',
      mergeRange: 'Объединить диапазон', splitActiveCell: 'Разделить активную ячейку',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `Формула в ячейке (R${rowNumber}:C${columnNumber})`,
      sortTableByColumn: 'Сортировка таблицы по столбцу', column: 'Столбец', direction: 'Направление', ascending: 'По возрастанию (А–Я, 0–9)',
      descending: 'По убыванию (Я–А, 9–0)', dataType: 'Тип данных', text: 'Текст (по алфавиту)', numeric: 'Числа (числовой порядок)',
      sortNow: 'Сортировать', splitTable: 'Разделить таблицу', splitBeforeRow: 'Разделить перед строкой', split: 'Разделить таблицу',
    },
    presets: {
      'grid-neutral': { label: 'Нейтральная сетка', description: 'Сдержанная палитра slate и чёткий контраст.' },
      'grid-accent': { label: 'Акцент индиго', description: 'Выделенная шапка цвета индиго для деловых отчётов.' },
      'clean-minimal': { label: 'Чистый минимализм', description: 'Тонкие цинковые границы для удобного чтения.' },
      'corporate-dark': { label: 'Корпоративный slate и cyan', description: 'Деловое оформление с акцентами cyan.' },
      'emerald-finance': { label: 'Финансы в изумрудном цвете', description: 'Насыщенный изумрудный для балансов, бюджетов и показателей.' },
      'warm-executive': { label: 'Тёплый янтарный стиль', description: 'Тёплые янтарные и терракотовые оттенки для строгих документов.' },
    },
  },
  'it-IT': {
    title: 'Proprietà tabella', closeDialog: 'Chiudi la finestra delle proprietà della tabella', close: 'Chiudi',
    tableDimensions: (rows, columns, id) => `${rows} righe × ${columns} colonne · ID: ${id}`,
    tabs: { table: 'Tabella e adattamento', styles: 'Stile e modelli', row: 'Riga e interruzione', cell: 'Cella e allineamento', tools: 'Formule e ordinamento' },
    general: {
      autoFitLabel: 'Adattamento automatico',
      autoFit: {
        window: { label: 'Adatta alla finestra', description: '100% della larghezza disponibile' },
        contents: { label: 'Adatta al contenuto', description: 'In base alla lunghezza del testo' },
        fixed: { label: 'Larghezza colonne fissa', description: 'Valori in millimetri definiti' },
      },
      columnWidths: 'Larghezza colonne (mm)', caption: 'Didascalia tabella', captionPlaceholder: 'Ad esempio, risultati del trimestre 2026…',
      captionPosition: { above: 'Sopra', below: 'Sotto' }, repeatHeader: 'Ripeti la riga di intestazione in ogni pagina successiva',
    },
    row: {
      activeRow: 'Riga attiva', rowOption: (rowNumber, resultRow) => `Riga ${rowNumber}${resultRow ? ' (riga totale)' : ''}`,
      keepTogether: 'Mantieni unite le righe', keepTogetherHelp: 'Impedisce che la riga venga divisa tra due pagine.',
    },
    styles: {
      presets: 'Stili predefiniti', designOptions: 'Opzioni di design tabella', unknownPreset: 'Stile tabella', unknownPresetDescription: 'Stile tabella integrato.', highlightHeader: 'Evidenzia la riga di intestazione',
      highlightTotal: 'Evidenzia la riga totale', alternatingRows: 'Alterna lo sfondo delle righe', highlightFirstColumn: 'Evidenzia la prima colonna',
      highlightLastColumn: 'Evidenzia l’ultima colonna',
    },
    cell: {
      row: 'Riga', rowOption: (rowNumber) => `Riga ${rowNumber}`, column: 'Colonna', verticalAlignment: 'Allineamento verticale',
      alignment: { top: 'In alto', middle: 'Al centro', bottom: 'In basso' }, textRotation: 'Rotazione testo',
      rotation: { normal: '0° (normale)', vertical: '90° (verticale)', rotated: '270° (ruotato)' },
      mergeSplit: 'Unisci e dividi celle', fromRow: 'Dalla riga', fromColumn: 'Dalla colonna', toRow: 'Alla riga', toColumn: 'Alla colonna',
      mergeRange: 'Unisci intervallo', splitActiveCell: 'Dividi cella attiva',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `Formula nella cella (R${rowNumber}:C${columnNumber})`,
      sortTableByColumn: 'Ordina tabella per colonna', column: 'Colonna', direction: 'Direzione', ascending: 'Crescente (A–Z, 0–9)',
      descending: 'Decrescente (Z–A, 9–0)', dataType: 'Tipo di dati', text: 'Testo (alfabetico)', numeric: 'Numeri (numerico)',
      sortNow: 'Ordina ora', splitTable: 'Dividi tabella', splitBeforeRow: 'Dividi prima della riga', split: 'Dividi tabella',
    },
    presets: {
      'grid-neutral': { label: 'Griglia neutra', description: 'Stile slate equilibrato con contrasti nitidi.' },
      'grid-accent': { label: 'Accento indaco', description: 'Intestazione indaco in evidenza per report formali.' },
      'clean-minimal': { label: 'Pulito e minimale', description: 'Contorni zinco discreti per una lettura chiara.' },
      'corporate-dark': { label: 'Corporate slate e ciano', description: 'Stile professionale con accenti ciano.' },
      'emerald-finance': { label: 'Finanza smeraldo', description: 'Verde smeraldo intenso per bilanci, budget e indicatori finanziari.' },
      'warm-executive': { label: 'Ambra executive', description: 'Toni caldi ambra e terracotta per documenti raffinati.' },
    },
  },
  'es-ES': {
    title: 'Propiedades de tabla', closeDialog: 'Cerrar el diálogo de propiedades de tabla', close: 'Cerrar',
    tableDimensions: (rows, columns, id) => `${rows} filas × ${columns} columnas · ID: ${id}`,
    tabs: { table: 'Tabla y ajuste automático', styles: 'Diseño y plantillas', row: 'Fila y ajuste de texto', cell: 'Celda y alineación', tools: 'Fórmulas y ordenación' },
    general: {
      autoFitLabel: 'Comportamiento de ajuste automático',
      autoFit: {
        window: { label: 'Ajustar a la ventana', description: '100% del ancho disponible' },
        contents: { label: 'Ajustar al contenido', description: 'Según la longitud del texto' },
        fixed: { label: 'Ancho fijo de columnas', description: 'Valores definidos en milímetros' },
      },
      columnWidths: 'Ancho de columnas (mm)', caption: 'Título de la tabla', captionPlaceholder: 'Por ejemplo, resultados del trimestre de 2026…',
      captionPosition: { above: 'Encima', below: 'Debajo' }, repeatHeader: 'Repetir el encabezado en cada página siguiente',
    },
    row: {
      activeRow: 'Fila activa', rowOption: (rowNumber, resultRow) => `Fila ${rowNumber}${resultRow ? ' (fila de resultados)' : ''}`,
      keepTogether: 'Mantener la fila unida', keepTogetherHelp: 'Evita que esta fila se divida entre páginas.',
    },
    styles: {
      presets: 'Estilos predefinidos', designOptions: 'Opciones de diseño de tabla', unknownPreset: 'Estilo de tabla', unknownPresetDescription: 'Estilo de tabla integrado.', highlightHeader: 'Resaltar la fila de encabezado',
      highlightTotal: 'Resaltar la fila de resultados', alternatingRows: 'Alternar el sombreado de filas', highlightFirstColumn: 'Resaltar la primera columna',
      highlightLastColumn: 'Resaltar la última columna',
    },
    cell: {
      row: 'Fila', rowOption: (rowNumber) => `Fila ${rowNumber}`, column: 'Columna', verticalAlignment: 'Alineación vertical',
      alignment: { top: 'Arriba', middle: 'Centro', bottom: 'Abajo' }, textRotation: 'Rotación del texto',
      rotation: { normal: '0° (normal)', vertical: '90° (vertical)', rotated: '270° (girado)' },
      mergeSplit: 'Combinar y dividir celdas', fromRow: 'Desde la fila', fromColumn: 'Desde la columna', toRow: 'Hasta la fila', toColumn: 'Hasta la columna',
      mergeRange: 'Combinar el rango', splitActiveCell: 'Dividir la celda activa',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `Fórmula en celda (F${rowNumber}:C${columnNumber})`,
      sortTableByColumn: 'Ordenar tabla por columna', column: 'Columna', direction: 'Dirección', ascending: 'Ascendente (A–Z, 0–9)',
      descending: 'Descendente (Z–A, 9–0)', dataType: 'Tipo de datos', text: 'Texto (alfabético)', numeric: 'Números (numérico)',
      sortNow: 'Ordenar ahora', splitTable: 'Dividir tabla', splitBeforeRow: 'Dividir antes de la fila', split: 'Dividir tabla',
    },
    presets: {
      'grid-neutral': { label: 'Cuadrícula neutra', description: 'Estilo slate equilibrado con contrastes claros.' },
      'grid-accent': { label: 'Acento índigo', description: 'Encabezado índigo destacado para informes formales.' },
      'clean-minimal': { label: 'Limpio y minimalista', description: 'Bordes zinc sutiles para facilitar la lectura.' },
      'corporate-dark': { label: 'Corporativo slate y cian', description: 'Diseño profesional con acentos cian.' },
      'emerald-finance': { label: 'Finanzas esmeralda', description: 'Verde esmeralda intenso para balances, presupuestos e indicadores.' },
      'warm-executive': { label: 'Ámbar ejecutivo', description: 'Tonos cálidos ámbar y terracota para documentos refinados.' },
    },
  },
  'ja-JP': {
    title: 'テーブルのプロパティ', closeDialog: 'テーブルのプロパティ ダイアログを閉じる', close: '閉じる',
    tableDimensions: (rows, columns, id) => `${rows} 行 × ${columns} 列 · ID: ${id}`,
    tabs: { table: 'テーブルと自動調整', styles: 'デザインとテンプレート', row: '行と折り返し', cell: 'セルと配置', tools: '数式と並べ替え' },
    general: {
      autoFitLabel: '自動調整の動作',
      autoFit: {
        window: { label: 'ウィンドウに合わせる', description: '利用可能な幅の 100%' },
        contents: { label: '内容に合わせる', description: 'テキストの長さに合わせる' },
        fixed: { label: '列幅を固定', description: 'ミリメートル単位で指定' },
      },
      columnWidths: '列幅 (mm)', caption: 'テーブルのキャプション', captionPlaceholder: '例: 2026 年度の四半期実績…',
      captionPosition: { above: '上', below: '下' }, repeatHeader: '以降の各ページでヘッダー行を繰り返す',
    },
    row: {
      activeRow: '選択中の行', rowOption: (rowNumber, resultRow) => `行 ${rowNumber}${resultRow ? ' (合計行)' : ''}`,
      keepTogether: '行を分割しない', keepTogetherHelp: 'ページ境界をまたいでこの行が分割されないようにします。',
    },
    styles: {
      presets: 'プリセットスタイル', designOptions: 'テーブルのデザイン設定', unknownPreset: 'テーブルスタイル', unknownPresetDescription: '組み込みのテーブルスタイル。', highlightHeader: 'ヘッダー行を強調',
      highlightTotal: '合計行を強調', alternatingRows: '行の背景色を交互にする', highlightFirstColumn: '最初の列を強調',
      highlightLastColumn: '最後の列を強調',
    },
    cell: {
      row: '行', rowOption: (rowNumber) => `行 ${rowNumber}`, column: '列', verticalAlignment: '垂直方向の配置',
      alignment: { top: '上', middle: '中央', bottom: '下' }, textRotation: 'テキストの回転',
      rotation: { normal: '0° (標準)', vertical: '90° (垂直)', rotated: '270° (回転)' },
      mergeSplit: 'セルの結合と分割', fromRow: '開始行', fromColumn: '開始列', toRow: '終了行', toColumn: '終了列',
      mergeRange: '選択範囲を結合', splitActiveCell: '選択中のセルを分割',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `セルの数式 (R${rowNumber}:C${columnNumber})`,
      sortTableByColumn: '列でテーブルを並べ替え', column: '列', direction: '順序', ascending: '昇順 (A–Z、0–9)',
      descending: '降順 (Z–A、9–0)', dataType: 'データ型', text: 'テキスト (アルファベット順)', numeric: '数値 (数値順)',
      sortNow: '並べ替える', splitTable: 'テーブルを分割', splitBeforeRow: '分割する行', split: 'テーブルを分割',
    },
    presets: {
      'grid-neutral': { label: 'ニュートラルグリッド', description: '明瞭なコントラストの落ち着いたスレート配色。' },
      'grid-accent': { label: 'インディゴアクセント', description: '正式なレポート向けのインディゴのヘッダー。' },
      'clean-minimal': { label: 'クリーンミニマル', description: '読みやすさを高める控えめな亜鉛色の境界線。' },
      'corporate-dark': { label: 'コーポレート スレートとシアン', description: 'シアンのアクセントを使ったビジネス向けデザイン。' },
      'emerald-finance': { label: 'エメラルドファイナンス', description: '貸借対照表、予算、財務指標向けの鮮やかな緑。' },
      'warm-executive': { label: 'エグゼクティブアンバー', description: '上質な文書に合う温かみのある琥珀色とテラコッタ。' },
    },
  },
  'zh-CN': {
    title: '表格属性', closeDialog: '关闭表格属性对话框', close: '关闭',
    tableDimensions: (rows, columns, id) => `${rows} 行 × ${columns} 列 · ID: ${id}`,
    tabs: { table: '表格与自动调整', styles: '设计与模板', row: '行与换行', cell: '单元格与对齐', tools: '公式与排序' },
    general: {
      autoFitLabel: '自动调整方式',
      autoFit: {
        window: { label: '适应窗口', description: '使用 100% 可用宽度' },
        contents: { label: '适应内容', description: '根据文本长度动态调整' },
        fixed: { label: '固定列宽', description: '指定毫米数值' },
      },
      columnWidths: '列宽 (mm)', caption: '表格标题', captionPlaceholder: '例如：2026 年季度业绩…',
      captionPosition: { above: '上方', below: '下方' }, repeatHeader: '在之后的每一页重复标题行',
    },
    row: {
      activeRow: '当前行', rowOption: (rowNumber, resultRow) => `第 ${rowNumber} 行${resultRow ? ' (汇总行)' : ''}`,
      keepTogether: '保持整行', keepTogetherHelp: '防止此行在分页处拆开。',
    },
    styles: {
      presets: '预设样式', designOptions: '表格设计选项', unknownPreset: '表格样式', unknownPresetDescription: '内置表格样式。', highlightHeader: '突出显示标题行',
      highlightTotal: '突出显示汇总行', alternatingRows: '交替显示行底色', highlightFirstColumn: '突出显示第一列',
      highlightLastColumn: '突出显示最后一列',
    },
    cell: {
      row: '行', rowOption: (rowNumber) => `第 ${rowNumber} 行`, column: '列', verticalAlignment: '垂直对齐',
      alignment: { top: '顶部', middle: '居中', bottom: '底部' }, textRotation: '文字旋转',
      rotation: { normal: '0° (正常)', vertical: '90° (垂直)', rotated: '270° (旋转)' },
      mergeSplit: '合并和拆分单元格', fromRow: '起始行', fromColumn: '起始列', toRow: '结束行', toColumn: '结束列',
      mergeRange: '合并选定区域', splitActiveCell: '拆分当前单元格',
    },
    tools: {
      formulaInCell: (rowNumber, columnNumber) => `单元格公式 (R${rowNumber}:C${columnNumber})`,
      sortTableByColumn: '按列排序表格', column: '列', direction: '方向', ascending: '升序 (A–Z，0–9)',
      descending: '降序 (Z–A，9–0)', dataType: '数据类型', text: '文本 (按字母顺序)', numeric: '数字 (按数值排序)',
      sortNow: '立即排序', splitTable: '拆分表格', splitBeforeRow: '在此行之前拆分', split: '拆分表格',
    },
    presets: {
      'grid-neutral': { label: '中性网格', description: '均衡的石板灰样式，具有清晰对比。' },
      'grid-accent': { label: '靛蓝强调', description: '适用于正式报告的靛蓝标题行。' },
      'clean-minimal': { label: '简洁极简', description: '细微的锌灰边框，让阅读更清晰。' },
      'corporate-dark': { label: '企业石板灰与青色', description: '带有青色点缀的专业商务样式。' },
      'emerald-finance': { label: '翡翠财务', description: '适用于资产负债表、预算和财务指标的浓郁翡翠绿。' },
      'warm-executive': { label: '高管琥珀色', description: '适合精致文档的暖琥珀色与陶土色调。' },
    },
  },
} satisfies Record<WorkspaceLocale, WriterTablePropertiesCopy>;
