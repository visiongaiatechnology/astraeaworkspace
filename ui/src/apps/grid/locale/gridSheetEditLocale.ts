// STATUS: PLATIN — seven-locale copy for Grid sheet structure and advanced editing controls.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { FlashFillTransform, GridGoToSpecialKind, GridTransferMode } from '../editing/gridAdvancedEditing';

type CalculationMode = 'automatic' | 'manual' | 'automatic-except-data-tables';

export interface GridSheetEditCopy {
  sections: Readonly<{ viewPanes: string; rowsColumns: string; advanced: string; workbook: string }>;
  viewModes: Readonly<Record<'normal' | 'page-layout' | 'page-break', string>>;
  fields: Readonly<{ zoom: string; splitRow: string; splitColumn: string; freezeRows: string; freezeColumns: string; moveTarget: string }>;
  selectionSummary: (range: string, firstRow: number, lastRow: number, firstColumn: number, lastColumn: number) => string;
  actions: Readonly<{
    clearSplit: string; insertRows: string; deleteRows: string; insertColumns: string; deleteColumns: string;
    hideRows: string; unhideRows: string; hideColumns: string; unhideColumns: string;
    groupRows: string; groupCollapseRows: string; groupColumns: string; groupCollapseColumns: string;
    moveRows: string; moveColumns: string; goTo: string; goToSpecial: string; addSelectionRange: string; clearMultiRange: string;
  }>;
  goToPlaceholder: string;
  specialKindLabel: string;
  specialKinds: Readonly<Record<GridGoToSpecialKind, string>>;
  activeRanges: (count: number) => string;
  transfer: Readonly<{ targetPlaceholder: string; modeLabel: string; modes: Readonly<Record<GridTransferMode, string>>; apply: string }>;
  flashFill: Readonly<{ targetPlaceholder: string; transformLabel: string; transforms: Readonly<Record<FlashFillTransform, string>>; apply: string }>;
  richText: Readonly<{ inCell: (cell: string) => string; placeholder: string; bold: string; italic: string; underline: string; color: string; apply: string }>;
  workbook: Readonly<{
    locale: string; calculation: string; calculationModes: Readonly<Record<CalculationMode, string>>;
    propertyPlaceholder: string; valuePlaceholder: string; setProperty: string;
  }>;
}

export const GRID_SHEET_EDIT_COPY: Readonly<Record<WorkspaceLocale, GridSheetEditCopy>> = {
  'en-US': {
    sections: { viewPanes: 'View & panes', rowsColumns: 'Rows & columns', advanced: 'Advanced selection & editing', workbook: 'Workbook properties' },
    viewModes: { normal: 'Normal', 'page-layout': 'Page layout', 'page-break': 'Page break' },
    fields: { zoom: 'Zoom', splitRow: 'Split row', splitColumn: 'Split column', freezeRows: 'Freeze rows', freezeColumns: 'Freeze columns', moveTarget: 'Move to index' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `Selection ${range} · rows ${firstRow}–${lastRow} · columns ${firstColumn}–${lastColumn}`,
    actions: {
      clearSplit: 'Clear split', insertRows: 'Insert row(s)', deleteRows: 'Delete row(s)', insertColumns: 'Insert column(s)', deleteColumns: 'Delete column(s)',
      hideRows: 'Hide rows', unhideRows: 'Unhide rows', hideColumns: 'Hide columns', unhideColumns: 'Unhide columns',
      groupRows: 'Group rows', groupCollapseRows: 'Group+collapse rows', groupColumns: 'Group columns', groupCollapseColumns: 'Group+collapse columns',
      moveRows: 'Move rows', moveColumns: 'Move columns', goTo: 'Go To', goToSpecial: 'Go To Special', addSelectionRange: 'Add selection range', clearMultiRange: 'Clear multi-range',
    },
    goToPlaceholder: 'A1:B20 or Name',
    specialKindLabel: 'Special cell type',
    specialKinds: { blanks: 'Blanks', constants: 'Constants', formulas: 'Formulas', errors: 'Errors', comments: 'Comments', validation: 'Validation', visible: 'Visible cells' },
    activeRanges: (count) => `${count} active range${count === 1 ? '' : 's'}`,
    transfer: { targetPlaceholder: 'Target A1', modeLabel: 'Transfer mode', modes: { move: 'Move', copy: 'Copy', 'insert-down': 'Insert copied cells down', 'insert-right': 'Insert copied cells right' }, apply: 'Apply' },
    flashFill: { targetPlaceholder: 'Flash target A1', transformLabel: 'Flash Fill transform', transforms: { trim: 'Trim spaces', upper: 'UPPER', lower: 'lower', 'first-word': 'First word', 'last-word': 'Last word', initials: 'Initials', 'before-at': 'Before @', 'after-at': 'After @' }, apply: 'Flash Fill' },
    richText: { inCell: (cell) => `Rich text in ${cell}`, placeholder: 'Rich text run', bold: 'Bold', italic: 'Italic', underline: 'Underline', color: 'Rich text color', apply: 'Set rich text' },
    workbook: { locale: 'Locale', calculation: 'Calculation', calculationModes: { automatic: 'Automatic', 'automatic-except-data-tables': 'Auto except data tables', manual: 'Manual' }, propertyPlaceholder: 'Property', valuePlaceholder: 'Value', setProperty: 'Set' },
  },
  'de-DE': {
    sections: { viewPanes: 'Ansicht und Bereiche', rowsColumns: 'Zeilen und Spalten', advanced: 'Erweiterte Auswahl und Bearbeitung', workbook: 'Arbeitsmappeneigenschaften' },
    viewModes: { normal: 'Normal', 'page-layout': 'Seitenlayout', 'page-break': 'Seitenumbruch' },
    fields: { zoom: 'Zoom', splitRow: 'Geteilte Zeile', splitColumn: 'Geteilte Spalte', freezeRows: 'Zeilen fixieren', freezeColumns: 'Spalten fixieren', moveTarget: 'Zielindex' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `Auswahl ${range} · Zeilen ${firstRow}–${lastRow} · Spalten ${firstColumn}–${lastColumn}`,
    actions: {
      clearSplit: 'Teilung aufheben', insertRows: 'Zeile(n) einfügen', deleteRows: 'Zeile(n) löschen', insertColumns: 'Spalte(n) einfügen', deleteColumns: 'Spalte(n) löschen',
      hideRows: 'Zeilen ausblenden', unhideRows: 'Zeilen einblenden', hideColumns: 'Spalten ausblenden', unhideColumns: 'Spalten einblenden',
      groupRows: 'Zeilen gruppieren', groupCollapseRows: 'Zeilen gruppieren und einklappen', groupColumns: 'Spalten gruppieren', groupCollapseColumns: 'Spalten gruppieren und einklappen',
      moveRows: 'Zeilen verschieben', moveColumns: 'Spalten verschieben', goTo: 'Gehe zu', goToSpecial: 'Gehe zu: Spezial', addSelectionRange: 'Auswahlbereich hinzufügen', clearMultiRange: 'Mehrfachauswahl löschen',
    },
    goToPlaceholder: 'A1:B20 oder Name',
    specialKindLabel: 'Besonderer Zelltyp',
    specialKinds: { blanks: 'Leere Zellen', constants: 'Konstanten', formulas: 'Formeln', errors: 'Fehler', comments: 'Kommentare', validation: 'Datenüberprüfung', visible: 'Sichtbare Zellen' },
    activeRanges: (count) => `${count} aktive${count === 1 ? 'r Bereich' : ' Bereiche'}`,
    transfer: { targetPlaceholder: 'Ziel A1', modeLabel: 'Übertragungsmodus', modes: { move: 'Verschieben', copy: 'Kopieren', 'insert-down': 'Kopierte Zellen nach unten einfügen', 'insert-right': 'Kopierte Zellen nach rechts einfügen' }, apply: 'Anwenden' },
    flashFill: { targetPlaceholder: 'Blitzfüllungsziel A1', transformLabel: 'Blitzfüllungstransformation', transforms: { trim: 'Leerzeichen entfernen', upper: 'GROSSBUCHSTABEN', lower: 'Kleinbuchstaben', 'first-word': 'Erstes Wort', 'last-word': 'Letztes Wort', initials: 'Initialen', 'before-at': 'Vor @', 'after-at': 'Nach @' }, apply: 'Blitzfüllung' },
    richText: { inCell: (cell) => `Rich-Text in ${cell}`, placeholder: 'Rich-Text-Zeile', bold: 'Fett', italic: 'Kursiv', underline: 'Unterstrichen', color: 'Rich-Text-Farbe', apply: 'Rich-Text setzen' },
    workbook: { locale: 'Gebietsschema', calculation: 'Berechnung', calculationModes: { automatic: 'Automatisch', 'automatic-except-data-tables': 'Automatisch außer Datentabellen', manual: 'Manuell' }, propertyPlaceholder: 'Eigenschaft', valuePlaceholder: 'Wert', setProperty: 'Festlegen' },
  },
  'ru-RU': {
    sections: { viewPanes: 'Вид и области', rowsColumns: 'Строки и столбцы', advanced: 'Расширенное выделение и редактирование', workbook: 'Свойства книги' },
    viewModes: { normal: 'Обычный', 'page-layout': 'Разметка страницы', 'page-break': 'Разрыв страницы' },
    fields: { zoom: 'Масштаб', splitRow: 'Разделить по строке', splitColumn: 'Разделить по столбцу', freezeRows: 'Закрепить строки', freezeColumns: 'Закрепить столбцы', moveTarget: 'Индекс назначения' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `Выделение ${range} · строки ${firstRow}–${lastRow} · столбцы ${firstColumn}–${lastColumn}`,
    actions: {
      clearSplit: 'Снять разделение', insertRows: 'Вставить строку(и)', deleteRows: 'Удалить строку(и)', insertColumns: 'Вставить столбец(цы)', deleteColumns: 'Удалить столбец(цы)',
      hideRows: 'Скрыть строки', unhideRows: 'Показать строки', hideColumns: 'Скрыть столбцы', unhideColumns: 'Показать столбцы',
      groupRows: 'Группировать строки', groupCollapseRows: 'Сгруппировать и свернуть строки', groupColumns: 'Группировать столбцы', groupCollapseColumns: 'Сгруппировать и свернуть столбцы',
      moveRows: 'Переместить строки', moveColumns: 'Переместить столбцы', goTo: 'Перейти', goToSpecial: 'Перейти к специальным', addSelectionRange: 'Добавить диапазон выделения', clearMultiRange: 'Очистить несколько диапазонов',
    },
    goToPlaceholder: 'A1:B20 или имя',
    specialKindLabel: 'Тип специальных ячеек',
    specialKinds: { blanks: 'Пустые ячейки', constants: 'Константы', formulas: 'Формулы', errors: 'Ошибки', comments: 'Комментарии', validation: 'Проверка данных', visible: 'Видимые ячейки' },
    activeRanges: (count) => `Активных диапазонов: ${count}`,
    transfer: { targetPlaceholder: 'Цель A1', modeLabel: 'Режим переноса', modes: { move: 'Переместить', copy: 'Копировать', 'insert-down': 'Вставить скопированные ячейки вниз', 'insert-right': 'Вставить скопированные ячейки вправо' }, apply: 'Применить' },
    flashFill: { targetPlaceholder: 'Цель автозаполнения A1', transformLabel: 'Преобразование автозаполнения', transforms: { trim: 'Удалить пробелы', upper: 'ВЕРХНИЙ РЕГИСТР', lower: 'нижний регистр', 'first-word': 'Первое слово', 'last-word': 'Последнее слово', initials: 'Инициалы', 'before-at': 'До @', 'after-at': 'После @' }, apply: 'Автозаполнение' },
    richText: { inCell: (cell) => `Форматированный текст в ${cell}`, placeholder: 'Фрагмент форматированного текста', bold: 'Полужирный', italic: 'Курсив', underline: 'Подчёркнутый', color: 'Цвет текста', apply: 'Задать форматированный текст' },
    workbook: { locale: 'Локаль', calculation: 'Вычисление', calculationModes: { automatic: 'Автоматически', 'automatic-except-data-tables': 'Автоматически, кроме таблиц данных', manual: 'Вручную' }, propertyPlaceholder: 'Свойство', valuePlaceholder: 'Значение', setProperty: 'Задать' },
  },
  'it-IT': {
    sections: { viewPanes: 'Visualizzazione e riquadri', rowsColumns: 'Righe e colonne', advanced: 'Selezione e modifica avanzate', workbook: 'Proprietà della cartella di lavoro' },
    viewModes: { normal: 'Normale', 'page-layout': 'Layout di pagina', 'page-break': 'Interruzione di pagina' },
    fields: { zoom: 'Zoom', splitRow: 'Riga di divisione', splitColumn: 'Colonna di divisione', freezeRows: 'Blocca righe', freezeColumns: 'Blocca colonne', moveTarget: 'Indice di destinazione' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `Selezione ${range} · righe ${firstRow}–${lastRow} · colonne ${firstColumn}–${lastColumn}`,
    actions: {
      clearSplit: 'Rimuovi divisione', insertRows: 'Inserisci riga/e', deleteRows: 'Elimina riga/e', insertColumns: 'Inserisci colonna/e', deleteColumns: 'Elimina colonna/e',
      hideRows: 'Nascondi righe', unhideRows: 'Mostra righe', hideColumns: 'Nascondi colonne', unhideColumns: 'Mostra colonne',
      groupRows: 'Raggruppa righe', groupCollapseRows: 'Raggruppa e comprimi righe', groupColumns: 'Raggruppa colonne', groupCollapseColumns: 'Raggruppa e comprimi colonne',
      moveRows: 'Sposta righe', moveColumns: 'Sposta colonne', goTo: 'Vai a', goToSpecial: 'Vai a speciale', addSelectionRange: 'Aggiungi intervallo di selezione', clearMultiRange: 'Cancella intervalli multipli',
    },
    goToPlaceholder: 'A1:B20 o nome',
    specialKindLabel: 'Tipo di cella speciale',
    specialKinds: { blanks: 'Celle vuote', constants: 'Costanti', formulas: 'Formule', errors: 'Errori', comments: 'Commenti', validation: 'Convalida', visible: 'Celle visibili' },
    activeRanges: (count) => `Intervalli attivi: ${count}`,
    transfer: { targetPlaceholder: 'Destinazione A1', modeLabel: 'Modalità di trasferimento', modes: { move: 'Sposta', copy: 'Copia', 'insert-down': 'Inserisci celle copiate sotto', 'insert-right': 'Inserisci celle copiate a destra' }, apply: 'Applica' },
    flashFill: { targetPlaceholder: 'Destinazione riempimento rapido A1', transformLabel: 'Trasformazione riempimento rapido', transforms: { trim: 'Rimuovi spazi', upper: 'MAIUSCOLO', lower: 'minuscolo', 'first-word': 'Prima parola', 'last-word': 'Ultima parola', initials: 'Iniziali', 'before-at': 'Prima di @', 'after-at': 'Dopo @' }, apply: 'Riempimento rapido' },
    richText: { inCell: (cell) => `Testo formattato in ${cell}`, placeholder: 'Frammento di testo formattato', bold: 'Grassetto', italic: 'Corsivo', underline: 'Sottolineato', color: 'Colore del testo', apply: 'Imposta testo formattato' },
    workbook: { locale: 'Impostazioni locali', calculation: 'Calcolo', calculationModes: { automatic: 'Automatico', 'automatic-except-data-tables': 'Automatico tranne tabelle dati', manual: 'Manuale' }, propertyPlaceholder: 'Proprietà', valuePlaceholder: 'Valore', setProperty: 'Imposta' },
  },
  'es-ES': {
    sections: { viewPanes: 'Vista y paneles', rowsColumns: 'Filas y columnas', advanced: 'Selección y edición avanzadas', workbook: 'Propiedades del libro' },
    viewModes: { normal: 'Normal', 'page-layout': 'Diseño de página', 'page-break': 'Salto de página' },
    fields: { zoom: 'Zoom', splitRow: 'Dividir por fila', splitColumn: 'Dividir por columna', freezeRows: 'Inmovilizar filas', freezeColumns: 'Inmovilizar columnas', moveTarget: 'Índice de destino' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `Selección ${range} · filas ${firstRow}–${lastRow} · columnas ${firstColumn}–${lastColumn}`,
    actions: {
      clearSplit: 'Quitar división', insertRows: 'Insertar fila(s)', deleteRows: 'Eliminar fila(s)', insertColumns: 'Insertar columna(s)', deleteColumns: 'Eliminar columna(s)',
      hideRows: 'Ocultar filas', unhideRows: 'Mostrar filas', hideColumns: 'Ocultar columnas', unhideColumns: 'Mostrar columnas',
      groupRows: 'Agrupar filas', groupCollapseRows: 'Agrupar y contraer filas', groupColumns: 'Agrupar columnas', groupCollapseColumns: 'Agrupar y contraer columnas',
      moveRows: 'Mover filas', moveColumns: 'Mover columnas', goTo: 'Ir a', goToSpecial: 'Ir a especial', addSelectionRange: 'Añadir rango de selección', clearMultiRange: 'Borrar varios rangos',
    },
    goToPlaceholder: 'A1:B20 o nombre',
    specialKindLabel: 'Tipo de celda especial',
    specialKinds: { blanks: 'Celdas en blanco', constants: 'Constantes', formulas: 'Fórmulas', errors: 'Errores', comments: 'Comentarios', validation: 'Validación', visible: 'Celdas visibles' },
    activeRanges: (count) => `Rangos activos: ${count}`,
    transfer: { targetPlaceholder: 'Destino A1', modeLabel: 'Modo de transferencia', modes: { move: 'Mover', copy: 'Copiar', 'insert-down': 'Insertar celdas copiadas abajo', 'insert-right': 'Insertar celdas copiadas a la derecha' }, apply: 'Aplicar' },
    flashFill: { targetPlaceholder: 'Destino de relleno rápido A1', transformLabel: 'Transformación de relleno rápido', transforms: { trim: 'Quitar espacios', upper: 'MAYÚSCULAS', lower: 'minúsculas', 'first-word': 'Primera palabra', 'last-word': 'Última palabra', initials: 'Iniciales', 'before-at': 'Antes de @', 'after-at': 'Después de @' }, apply: 'Relleno rápido' },
    richText: { inCell: (cell) => `Texto enriquecido en ${cell}`, placeholder: 'Fragmento de texto enriquecido', bold: 'Negrita', italic: 'Cursiva', underline: 'Subrayado', color: 'Color del texto', apply: 'Establecer texto enriquecido' },
    workbook: { locale: 'Configuración regional', calculation: 'Cálculo', calculationModes: { automatic: 'Automático', 'automatic-except-data-tables': 'Automático excepto tablas de datos', manual: 'Manual' }, propertyPlaceholder: 'Propiedad', valuePlaceholder: 'Valor', setProperty: 'Establecer' },
  },
  'ja-JP': {
    sections: { viewPanes: '表示とウィンドウ', rowsColumns: '行と列', advanced: '詳細な選択と編集', workbook: 'ブックのプロパティ' },
    viewModes: { normal: '標準', 'page-layout': 'ページ レイアウト', 'page-break': '改ページ' },
    fields: { zoom: 'ズーム', splitRow: '分割する行', splitColumn: '分割する列', freezeRows: '行を固定', freezeColumns: '列を固定', moveTarget: '移動先のインデックス' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `選択範囲 ${range} · 行 ${firstRow}～${lastRow} · 列 ${firstColumn}～${lastColumn}`,
    actions: {
      clearSplit: '分割を解除', insertRows: '行を挿入', deleteRows: '行を削除', insertColumns: '列を挿入', deleteColumns: '列を削除',
      hideRows: '行を非表示', unhideRows: '行を再表示', hideColumns: '列を非表示', unhideColumns: '列を再表示',
      groupRows: '行をグループ化', groupCollapseRows: '行をグループ化して折りたたむ', groupColumns: '列をグループ化', groupCollapseColumns: '列をグループ化して折りたたむ',
      moveRows: '行を移動', moveColumns: '列を移動', goTo: 'ジャンプ', goToSpecial: '条件を選択してジャンプ', addSelectionRange: '選択範囲を追加', clearMultiRange: '複数範囲をクリア',
    },
    goToPlaceholder: 'A1:B20 または名前',
    specialKindLabel: '特殊なセルの種類',
    specialKinds: { blanks: '空白セル', constants: '定数', formulas: '数式', errors: 'エラー', comments: 'コメント', validation: 'データの入力規則', visible: '可視セル' },
    activeRanges: (count) => `選択中の範囲: ${count}`,
    transfer: { targetPlaceholder: '移動先 A1', modeLabel: '転送モード', modes: { move: '移動', copy: 'コピー', 'insert-down': 'コピーしたセルを下に挿入', 'insert-right': 'コピーしたセルを右に挿入' }, apply: '適用' },
    flashFill: { targetPlaceholder: 'フラッシュ フィルの対象 A1', transformLabel: 'フラッシュ フィルの変換', transforms: { trim: '空白を削除', upper: '大文字', lower: '小文字', 'first-word': '最初の単語', 'last-word': '最後の単語', initials: 'イニシャル', 'before-at': '@ より前', 'after-at': '@ より後' }, apply: 'フラッシュ フィル' },
    richText: { inCell: (cell) => `${cell} のリッチ テキスト`, placeholder: 'リッチ テキストの実行', bold: '太字', italic: '斜体', underline: '下線', color: '文字色', apply: 'リッチ テキストを設定' },
    workbook: { locale: 'ロケール', calculation: '計算方法', calculationModes: { automatic: '自動', 'automatic-except-data-tables': 'データ テーブル以外は自動', manual: '手動' }, propertyPlaceholder: 'プロパティ', valuePlaceholder: '値', setProperty: '設定' },
  },
  'zh-CN': {
    sections: { viewPanes: '视图与窗格', rowsColumns: '行与列', advanced: '高级选择与编辑', workbook: '工作簿属性' },
    viewModes: { normal: '普通', 'page-layout': '页面布局', 'page-break': '分页符' },
    fields: { zoom: '缩放', splitRow: '拆分行', splitColumn: '拆分列', freezeRows: '冻结行', freezeColumns: '冻结列', moveTarget: '目标索引' },
    selectionSummary: (range, firstRow, lastRow, firstColumn, lastColumn) => `所选范围 ${range} · 行 ${firstRow}–${lastRow} · 列 ${firstColumn}–${lastColumn}`,
    actions: {
      clearSplit: '取消拆分', insertRows: '插入行', deleteRows: '删除行', insertColumns: '插入列', deleteColumns: '删除列',
      hideRows: '隐藏行', unhideRows: '取消隐藏行', hideColumns: '隐藏列', unhideColumns: '取消隐藏列',
      groupRows: '组合行', groupCollapseRows: '组合并折叠行', groupColumns: '组合列', groupCollapseColumns: '组合并折叠列',
      moveRows: '移动行', moveColumns: '移动列', goTo: '转到', goToSpecial: '定位条件单元格', addSelectionRange: '添加所选范围', clearMultiRange: '清除多重范围',
    },
    goToPlaceholder: 'A1:B20 或名称',
    specialKindLabel: '特殊单元格类型',
    specialKinds: { blanks: '空白单元格', constants: '常量', formulas: '公式', errors: '错误', comments: '批注', validation: '数据验证', visible: '可见单元格' },
    activeRanges: (count) => `活动范围：${count}`,
    transfer: { targetPlaceholder: '目标 A1', modeLabel: '传输模式', modes: { move: '移动', copy: '复制', 'insert-down': '向下插入复制的单元格', 'insert-right': '向右插入复制的单元格' }, apply: '应用' },
    flashFill: { targetPlaceholder: '快速填充目标 A1', transformLabel: '快速填充转换', transforms: { trim: '删除空格', upper: '大写', lower: '小写', 'first-word': '第一个词', 'last-word': '最后一个词', initials: '首字母', 'before-at': '@ 之前', 'after-at': '@ 之后' }, apply: '快速填充' },
    richText: { inCell: (cell) => `${cell}中的富文本`, placeholder: '富文本片段', bold: '粗体', italic: '斜体', underline: '下划线', color: '文本颜色', apply: '设置富文本' },
    workbook: { locale: '区域设置', calculation: '计算方式', calculationModes: { automatic: '自动', 'automatic-except-data-tables': '数据表以外自动', manual: '手动' }, propertyPlaceholder: '属性', valuePlaceholder: '值', setProperty: '设置' },
  },
};
