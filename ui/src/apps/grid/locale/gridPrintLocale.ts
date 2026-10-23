// STATUS: PLATIN — seven-locale copy for Grid print layout and export controls.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type MarginSide = 'top' | 'right' | 'bottom' | 'left';

export interface GridPrintCopy {
  readonly title: string;
  readonly printAreaLabel: string;
  readonly printAreaPlaceholder: (range: string) => string;
  readonly useSelection: string;
  readonly repeatRowsLabel: string;
  readonly repeatRowsPlaceholder: string;
  readonly repeatColumnsLabel: string;
  readonly repeatColumnsPlaceholder: string;
  readonly paperSizeLabel: string;
  readonly letterPaperSize: string;
  readonly legalPaperSize: string;
  readonly orientationLabel: string;
  readonly portrait: string;
  readonly landscape: string;
  readonly marginsLabel: string;
  readonly normalMargins: string;
  readonly narrowMargins: string;
  readonly wideMargins: string;
  readonly customMargins: string;
  readonly fitPagesWideLabel: string;
  readonly pagesWidePlaceholder: string;
  readonly fitPagesTallLabel: string;
  readonly pagesTallPlaceholder: string;
  readonly firstPageNumberLabel: string;
  readonly marginSideLabels: Readonly<Record<MarginSide, string>>;
  readonly fitToWidth: string;
  readonly showGridlines: string;
  readonly showHeadings: string;
  readonly repeatHeaderRow: string;
  readonly headerLabel: string;
  readonly headerPlaceholder: string;
  readonly footerLabel: string;
  readonly footerPlaceholder: string;
  readonly printPreview: string;
  readonly pdfSelection: string;
  readonly pdfAllVisibleSheets: string;
}

export const GRID_PRINT_COPY: Readonly<Record<WorkspaceLocale, GridPrintCopy>> = {
  'en-US': {
    title: 'Page Layout & Export', printAreaLabel: 'Print area', printAreaPlaceholder: (range) => `Print area, e.g. ${range}`, useSelection: 'Use selection as print area',
    repeatRowsLabel: 'Rows to repeat', repeatRowsPlaceholder: '$1:$2 repeat rows', repeatColumnsLabel: 'Columns to repeat', repeatColumnsPlaceholder: '$A:$B repeat columns',
    paperSizeLabel: 'Paper size', letterPaperSize: 'Letter (8.5×11)', legalPaperSize: 'Legal (8.5×14)', orientationLabel: 'Orientation', portrait: 'Portrait', landscape: 'Landscape', marginsLabel: 'Margins', normalMargins: 'Normal margins', narrowMargins: 'Narrow margins', wideMargins: 'Wide margins', customMargins: 'Custom margins',
    fitPagesWideLabel: 'Fit pages wide', pagesWidePlaceholder: 'Pages wide', fitPagesTallLabel: 'Fit pages tall', pagesTallPlaceholder: 'Pages tall', firstPageNumberLabel: 'First page number',
    marginSideLabels: { top: 'Top margin (mm)', right: 'Right margin (mm)', bottom: 'Bottom margin (mm)', left: 'Left margin (mm)' },
    fitToWidth: 'Fit to width', showGridlines: 'Print gridlines', showHeadings: 'Row/column headings', repeatHeaderRow: 'Repeat first row',
    headerLabel: 'Header content', headerPlaceholder: 'Header: &F file · &A sheet · &D date', footerLabel: 'Footer content', footerPlaceholder: 'Footer: Page &P / &N',
    printPreview: 'Print / Preview', pdfSelection: 'PDF selection', pdfAllVisibleSheets: 'PDF all visible sheets',
  },
  'de-DE': {
    title: 'Seitenlayout & Export', printAreaLabel: 'Druckbereich', printAreaPlaceholder: (range) => `Druckbereich, z. B. ${range}`, useSelection: 'Auswahl als Druckbereich verwenden',
    repeatRowsLabel: 'Zu wiederholende Zeilen', repeatRowsPlaceholder: 'Zeilen wiederholen, z. B. $1:$2', repeatColumnsLabel: 'Zu wiederholende Spalten', repeatColumnsPlaceholder: 'Spalten wiederholen, z. B. $A:$B',
    paperSizeLabel: 'Papierformat', letterPaperSize: 'Letter (8,5×11)', legalPaperSize: 'Legal (8,5×14)', orientationLabel: 'Ausrichtung', portrait: 'Hochformat', landscape: 'Querformat', marginsLabel: 'Seitenränder', normalMargins: 'Normale Ränder', narrowMargins: 'Schmale Ränder', wideMargins: 'Breite Ränder', customMargins: 'Benutzerdefinierte Ränder',
    fitPagesWideLabel: 'Seitenbreite anpassen', pagesWidePlaceholder: 'Seiten breit', fitPagesTallLabel: 'Seitenhöhe anpassen', pagesTallPlaceholder: 'Seiten hoch', firstPageNumberLabel: 'Erste Seitennummer',
    marginSideLabels: { top: 'Oberer Rand (mm)', right: 'Rechter Rand (mm)', bottom: 'Unterer Rand (mm)', left: 'Linker Rand (mm)' },
    fitToWidth: 'An Seitenbreite anpassen', showGridlines: 'Gitternetzlinien drucken', showHeadings: 'Zeilen- und Spaltenüberschriften', repeatHeaderRow: 'Erste Zeile wiederholen',
    headerLabel: 'Kopfzeileninhalt', headerPlaceholder: 'Kopfzeile: &F Datei · &A Blatt · &D Datum', footerLabel: 'Fußzeileninhalt', footerPlaceholder: 'Fußzeile: Seite &P / &N',
    printPreview: 'Drucken / Vorschau', pdfSelection: 'Auswahl als PDF', pdfAllVisibleSheets: 'Alle sichtbaren Blätter als PDF',
  },
  'ru-RU': {
    title: 'Разметка страницы и экспорт', printAreaLabel: 'Область печати', printAreaPlaceholder: (range) => `Область печати, например ${range}`, useSelection: 'Использовать выделение как область печати',
    repeatRowsLabel: 'Повторять строки', repeatRowsPlaceholder: 'Повторять строки, например $1:$2', repeatColumnsLabel: 'Повторять столбцы', repeatColumnsPlaceholder: 'Повторять столбцы, например $A:$B',
    paperSizeLabel: 'Размер бумаги', letterPaperSize: 'Letter (8,5×11)', legalPaperSize: 'Legal (8,5×14)', orientationLabel: 'Ориентация', portrait: 'Книжная', landscape: 'Альбомная', marginsLabel: 'Поля', normalMargins: 'Обычные поля', narrowMargins: 'Узкие поля', wideMargins: 'Широкие поля', customMargins: 'Настраиваемые поля',
    fitPagesWideLabel: 'Вписать по ширине', pagesWidePlaceholder: 'Страниц по ширине', fitPagesTallLabel: 'Вписать по высоте', pagesTallPlaceholder: 'Страниц по высоте', firstPageNumberLabel: 'Номер первой страницы',
    marginSideLabels: { top: 'Верхнее поле (мм)', right: 'Правое поле (мм)', bottom: 'Нижнее поле (мм)', left: 'Левое поле (мм)' },
    fitToWidth: 'Уместить по ширине', showGridlines: 'Печатать линии сетки', showHeadings: 'Заголовки строк и столбцов', repeatHeaderRow: 'Повторять первую строку',
    headerLabel: 'Содержимое верхнего колонтитула', headerPlaceholder: 'Верхний колонтитул: &F файл · &A лист · &D дата', footerLabel: 'Содержимое нижнего колонтитула', footerPlaceholder: 'Нижний колонтитул: страница &P / &N',
    printPreview: 'Печать / предпросмотр', pdfSelection: 'Выделение в PDF', pdfAllVisibleSheets: 'Все видимые листы в PDF',
  },
  'it-IT': {
    title: 'Layout di pagina ed esportazione', printAreaLabel: 'Area di stampa', printAreaPlaceholder: (range) => `Area di stampa, ad es. ${range}`, useSelection: 'Usa la selezione come area di stampa',
    repeatRowsLabel: 'Righe da ripetere', repeatRowsPlaceholder: 'Ripeti righe, ad es. $1:$2', repeatColumnsLabel: 'Colonne da ripetere', repeatColumnsPlaceholder: 'Ripeti colonne, ad es. $A:$B',
    paperSizeLabel: 'Formato carta', letterPaperSize: 'Letter (8,5×11)', legalPaperSize: 'Legal (8,5×14)', orientationLabel: 'Orientamento', portrait: 'Verticale', landscape: 'Orizzontale', marginsLabel: 'Margini', normalMargins: 'Margini normali', narrowMargins: 'Margini stretti', wideMargins: 'Margini ampi', customMargins: 'Margini personalizzati',
    fitPagesWideLabel: 'Adatta in larghezza', pagesWidePlaceholder: 'Pagine in larghezza', fitPagesTallLabel: 'Adatta in altezza', pagesTallPlaceholder: 'Pagine in altezza', firstPageNumberLabel: 'Numero della prima pagina',
    marginSideLabels: { top: 'Margine superiore (mm)', right: 'Margine destro (mm)', bottom: 'Margine inferiore (mm)', left: 'Margine sinistro (mm)' },
    fitToWidth: 'Adatta alla larghezza', showGridlines: 'Stampa linee della griglia', showHeadings: 'Intestazioni di righe e colonne', repeatHeaderRow: 'Ripeti la prima riga',
    headerLabel: 'Contenuto intestazione', headerPlaceholder: 'Intestazione: &F file · &A foglio · &D data', footerLabel: 'Contenuto piè di pagina', footerPlaceholder: 'Piè di pagina: pagina &P / &N',
    printPreview: 'Stampa / Anteprima', pdfSelection: 'Selezione PDF', pdfAllVisibleSheets: 'Tutti i fogli visibili in PDF',
  },
  'es-ES': {
    title: 'Diseño de página y exportación', printAreaLabel: 'Área de impresión', printAreaPlaceholder: (range) => `Área de impresión, p. ej. ${range}`, useSelection: 'Usar la selección como área de impresión',
    repeatRowsLabel: 'Filas que se repetirán', repeatRowsPlaceholder: 'Repetir filas, p. ej. $1:$2', repeatColumnsLabel: 'Columnas que se repetirán', repeatColumnsPlaceholder: 'Repetir columnas, p. ej. $A:$B',
    paperSizeLabel: 'Tamaño del papel', letterPaperSize: 'Letter (8,5×11)', legalPaperSize: 'Legal (8,5×14)', orientationLabel: 'Orientación', portrait: 'Vertical', landscape: 'Horizontal', marginsLabel: 'Márgenes', normalMargins: 'Márgenes normales', narrowMargins: 'Márgenes estrechos', wideMargins: 'Márgenes anchos', customMargins: 'Márgenes personalizados',
    fitPagesWideLabel: 'Ajustar al ancho', pagesWidePlaceholder: 'Páginas de ancho', fitPagesTallLabel: 'Ajustar al alto', pagesTallPlaceholder: 'Páginas de alto', firstPageNumberLabel: 'Número de la primera página',
    marginSideLabels: { top: 'Margen superior (mm)', right: 'Margen derecho (mm)', bottom: 'Margen inferior (mm)', left: 'Margen izquierdo (mm)' },
    fitToWidth: 'Ajustar al ancho', showGridlines: 'Imprimir líneas de cuadrícula', showHeadings: 'Encabezados de filas y columnas', repeatHeaderRow: 'Repetir la primera fila',
    headerLabel: 'Contenido del encabezado', headerPlaceholder: 'Encabezado: &F archivo · &A hoja · &D fecha', footerLabel: 'Contenido del pie de página', footerPlaceholder: 'Pie de página: página &P / &N',
    printPreview: 'Imprimir / Vista previa', pdfSelection: 'Selección en PDF', pdfAllVisibleSheets: 'Todas las hojas visibles en PDF',
  },
  'ja-JP': {
    title: 'ページ レイアウトとエクスポート', printAreaLabel: '印刷範囲', printAreaPlaceholder: (range) => `印刷範囲（例: ${range}）`, useSelection: '選択範囲を印刷範囲に設定',
    repeatRowsLabel: '繰り返す行', repeatRowsPlaceholder: '行の繰り返し（例: $1:$2）', repeatColumnsLabel: '繰り返す列', repeatColumnsPlaceholder: '列の繰り返し（例: $A:$B）',
    paperSizeLabel: '用紙サイズ', letterPaperSize: 'レター (8.5×11)', legalPaperSize: 'リーガル (8.5×14)', orientationLabel: '向き', portrait: '縦', landscape: '横', marginsLabel: '余白', normalMargins: '標準', narrowMargins: '狭い', wideMargins: '広い', customMargins: 'カスタム',
    fitPagesWideLabel: '横方向に合わせる', pagesWidePlaceholder: '横のページ数', fitPagesTallLabel: '縦方向に合わせる', pagesTallPlaceholder: '縦のページ数', firstPageNumberLabel: '最初のページ番号',
    marginSideLabels: { top: '上余白 (mm)', right: '右余白 (mm)', bottom: '下余白 (mm)', left: '左余白 (mm)' },
    fitToWidth: '幅に合わせる', showGridlines: '目盛線を印刷', showHeadings: '行と列の見出し', repeatHeaderRow: '先頭行を繰り返す',
    headerLabel: 'ヘッダー内容', headerPlaceholder: 'ヘッダー: &F ファイル · &A シート · &D 日付', footerLabel: 'フッター内容', footerPlaceholder: 'フッター: ページ &P / &N',
    printPreview: '印刷 / プレビュー', pdfSelection: '選択範囲を PDF 化', pdfAllVisibleSheets: '表示中のすべてのシートを PDF 化',
  },
  'zh-CN': {
    title: '页面布局与导出', printAreaLabel: '打印区域', printAreaPlaceholder: (range) => `打印区域，例如 ${range}`, useSelection: '将所选区域设为打印区域',
    repeatRowsLabel: '重复的行', repeatRowsPlaceholder: '重复行，例如 $1:$2', repeatColumnsLabel: '重复的列', repeatColumnsPlaceholder: '重复列，例如 $A:$B',
    paperSizeLabel: '纸张大小', letterPaperSize: 'Letter (8.5×11)', legalPaperSize: 'Legal (8.5×14)', orientationLabel: '方向', portrait: '纵向', landscape: '横向', marginsLabel: '页边距', normalMargins: '普通', narrowMargins: '窄', wideMargins: '宽', customMargins: '自定义',
    fitPagesWideLabel: '按宽度缩放', pagesWidePlaceholder: '宽度页数', fitPagesTallLabel: '按高度缩放', pagesTallPlaceholder: '高度页数', firstPageNumberLabel: '首页页码',
    marginSideLabels: { top: '上边距 (mm)', right: '右边距 (mm)', bottom: '下边距 (mm)', left: '左边距 (mm)' },
    fitToWidth: '适合页面宽度', showGridlines: '打印网格线', showHeadings: '行列标题', repeatHeaderRow: '重复首行',
    headerLabel: '页眉内容', headerPlaceholder: '页眉：&F 文件 · &A 工作表 · &D 日期', footerLabel: '页脚内容', footerPlaceholder: '页脚：第 &P 页 / 共 &N 页',
    printPreview: '打印 / 预览', pdfSelection: '将所选区域导出为 PDF', pdfAllVisibleSheets: '将所有可见工作表导出为 PDF',
  },
};
