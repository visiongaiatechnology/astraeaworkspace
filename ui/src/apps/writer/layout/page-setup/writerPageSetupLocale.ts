// STATUS: PLATIN — seven-locale copy for Writer page setup chrome and geometry controls.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

type WriterPageSetupCopy = {
  title: string;
  closeDialog: string;
  tabs: Readonly<Record<'geometry' | 'columns' | 'headers' | 'borders' | 'watermark', string>>;
  activeSection: string;
  standardDocument: string;
  sectionScope: string;
  documentScope: string;
  createSection: string;
  sectionStart: string;
  sectionBreaks: Readonly<Record<'next-page' | 'continuous' | 'even-page' | 'odd-page', string>>;
  removeSection: string;
  apply: string;
  sectionRestartError: string;
  geometry: Readonly<{
    paperSize: string;
    paperNames: Readonly<Record<'Letter' | 'Legal' | 'Executive' | 'Custom', string>>;
    width: string;
    height: string;
    orientation: string;
    portrait: string;
    landscape: string;
    marginsAndGutter: string;
    presets: Readonly<Record<'normal' | 'narrow' | 'wide' | 'mirrored' | 'custom', string>>;
    top: string;
    bottom: string;
    inside: string;
    left: string;
    outside: string;
    right: string;
    gutter: string;
    pageBackground: string;
    paperColors: Readonly<Record<'white' | 'cream' | 'dark', string>>;
    customBackground: string;
    sectionBackgroundHelp: string;
  }>;
};

export const WRITER_PAGE_SETUP_COPY: Readonly<Record<WorkspaceLocale, WriterPageSetupCopy>> = {
  'en-US': {
    title: 'Page setup and document geometry', closeDialog: 'Close page setup dialog',
    tabs: { geometry: 'Geometry and paper', columns: 'Columns', headers: 'Headers and footers', borders: 'Page borders', watermark: 'Watermark' },
    activeSection: 'Active section', standardDocument: 'Standard document', sectionScope: 'Changes apply from this section break to the next one.', documentScope: 'Changes apply to all paragraphs without their own section settings.',
    createSection: 'Create section here', sectionStart: 'Start', sectionBreaks: { 'next-page': 'Next page', continuous: 'Continuous', 'even-page': 'Even page', 'odd-page': 'Odd page' }, removeSection: 'Remove section', apply: 'Apply page setup', sectionRestartError: 'The section start must be a whole number from 1 to 9,999.',
    geometry: {
      paperSize: 'Paper size', paperNames: { Letter: 'Letter (8.5×11)', Legal: 'Legal (8.5×14)', Executive: 'Executive', Custom: 'Custom size (mm)' }, width: 'Width (mm)', height: 'Height (mm)', orientation: 'Orientation', portrait: 'Portrait', landscape: 'Landscape',
      marginsAndGutter: 'Margins and gutter', presets: { normal: 'Normal (25.4)', narrow: 'Narrow (12.7)', wide: 'Wide (25.4 / 50.8)', mirrored: 'Mirrored (book)', custom: 'Custom' },
      top: 'Top (mm)', bottom: 'Bottom (mm)', inside: 'Inside (mm)', left: 'Left (mm)', outside: 'Outside (mm)', right: 'Right (mm)', gutter: 'Gutter (mm)',
      pageBackground: 'Page and section background', paperColors: { white: 'Pure white', cream: 'Warm cream', dark: 'Obsidian dark' }, customBackground: 'Custom background', sectionBackgroundHelp: 'Applies to the currently selected section.',
    },
  },
  'de-DE': {
    title: 'Seiteneinrichtung und Dokumentgeometrie', closeDialog: 'Dialog „Seiteneinrichtung“ schließen',
    tabs: { geometry: 'Geometrie und Papier', columns: 'Spalten', headers: 'Kopf- und Fußzeilen', borders: 'Seitenrahmen', watermark: 'Wasserzeichen' },
    activeSection: 'Aktiver Abschnitt', standardDocument: 'Standarddokument', sectionScope: 'Änderungen gelten ab diesem Abschnittswechsel bis zum nächsten.', documentScope: 'Änderungen gelten für alle Absätze ohne eigene Abschnittseinstellungen.',
    createSection: 'Abschnitt hier erstellen', sectionStart: 'Beginn', sectionBreaks: { 'next-page': 'Nächste Seite', continuous: 'Fortlaufend', 'even-page': 'Gerade Seite', 'odd-page': 'Ungerade Seite' }, removeSection: 'Abschnitt entfernen', apply: 'Seiteneinrichtung anwenden', sectionRestartError: 'Der Abschnittsstart muss eine ganze Zahl zwischen 1 und 9.999 sein.',
    geometry: {
      paperSize: 'Papierformat', paperNames: { Letter: 'Letter (8,5×11)', Legal: 'Legal (8,5×14)', Executive: 'Executive', Custom: 'Benutzerdefiniert (mm)' }, width: 'Breite (mm)', height: 'Höhe (mm)', orientation: 'Ausrichtung', portrait: 'Hochformat', landscape: 'Querformat',
      marginsAndGutter: 'Seitenränder und Bundsteg', presets: { normal: 'Normal (25,4)', narrow: 'Schmal (12,7)', wide: 'Breit (25,4 / 50,8)', mirrored: 'Gespiegelt (Buch)', custom: 'Benutzerdefiniert' },
      top: 'Oben (mm)', bottom: 'Unten (mm)', inside: 'Innen (mm)', left: 'Links (mm)', outside: 'Außen (mm)', right: 'Rechts (mm)', gutter: 'Bundsteg (mm)',
      pageBackground: 'Seiten- und Abschnittshintergrund', paperColors: { white: 'Reinweiß', cream: 'Warmes Creme', dark: 'Obsidian dunkel' }, customBackground: 'Benutzerdefiniert', sectionBackgroundHelp: 'Gilt für den aktuell ausgewählten Abschnitt.',
    },
  },
  'ru-RU': {
    title: 'Параметры страницы и геометрия документа', closeDialog: 'Закрыть окно параметров страницы',
    tabs: { geometry: 'Геометрия и бумага', columns: 'Столбцы', headers: 'Колонтитулы', borders: 'Границы страницы', watermark: 'Водяной знак' },
    activeSection: 'Текущий раздел', standardDocument: 'Стандартный документ', sectionScope: 'Изменения применяются от этого разрыва раздела до следующего.', documentScope: 'Изменения применяются ко всем абзацам без собственных параметров раздела.',
    createSection: 'Создать раздел здесь', sectionStart: 'Начало', sectionBreaks: { 'next-page': 'Следующая страница', continuous: 'Непрерывно', 'even-page': 'Чётная страница', 'odd-page': 'Нечётная страница' }, removeSection: 'Удалить раздел', apply: 'Применить параметры страницы', sectionRestartError: 'Начало раздела должно быть целым числом от 1 до 9 999.',
    geometry: {
      paperSize: 'Размер бумаги', paperNames: { Letter: 'Letter (8,5×11)', Legal: 'Legal (8,5×14)', Executive: 'Executive', Custom: 'Настраиваемый (мм)' }, width: 'Ширина (мм)', height: 'Высота (мм)', orientation: 'Ориентация', portrait: 'Книжная', landscape: 'Альбомная',
      marginsAndGutter: 'Поля и корешок', presets: { normal: 'Обычные (25,4)', narrow: 'Узкие (12,7)', wide: 'Широкие (25,4 / 50,8)', mirrored: 'Зеркальные (книга)', custom: 'Настраиваемые' },
      top: 'Сверху (мм)', bottom: 'Снизу (мм)', inside: 'Внутри (мм)', left: 'Слева (мм)', outside: 'Снаружи (мм)', right: 'Справа (мм)', gutter: 'Корешок (мм)',
      pageBackground: 'Фон страницы и раздела', paperColors: { white: 'Чисто-белый', cream: 'Тёплый кремовый', dark: 'Тёмный обсидиан' }, customBackground: 'Настраиваемый фон', sectionBackgroundHelp: 'Применяется к выбранному разделу.',
    },
  },
  'it-IT': {
    title: 'Impostazione pagina e geometria documento', closeDialog: 'Chiudi la finestra di impostazione pagina',
    tabs: { geometry: 'Geometria e carta', columns: 'Colonne', headers: 'Intestazioni e piè di pagina', borders: 'Bordi pagina', watermark: 'Filigrana' },
    activeSection: 'Sezione attiva', standardDocument: 'Documento standard', sectionScope: 'Le modifiche si applicano da questa interruzione di sezione alla successiva.', documentScope: 'Le modifiche si applicano ai paragrafi senza impostazioni di sezione proprie.',
    createSection: 'Crea sezione qui', sectionStart: 'Inizio', sectionBreaks: { 'next-page': 'Pagina successiva', continuous: 'Continua', 'even-page': 'Pagina pari', 'odd-page': 'Pagina dispari' }, removeSection: 'Rimuovi sezione', apply: 'Applica impostazione pagina', sectionRestartError: 'L’inizio della sezione deve essere un numero intero compreso tra 1 e 9.999.',
    geometry: {
      paperSize: 'Formato carta', paperNames: { Letter: 'Letter (8,5×11)', Legal: 'Legal (8,5×14)', Executive: 'Executive', Custom: 'Personalizzato (mm)' }, width: 'Larghezza (mm)', height: 'Altezza (mm)', orientation: 'Orientamento', portrait: 'Verticale', landscape: 'Orizzontale',
      marginsAndGutter: 'Margini e rilegatura', presets: { normal: 'Normale (25,4)', narrow: 'Stretto (12,7)', wide: 'Largo (25,4 / 50,8)', mirrored: 'Speculare (libro)', custom: 'Personalizzato' },
      top: 'Superiore (mm)', bottom: 'Inferiore (mm)', inside: 'Interno (mm)', left: 'Sinistro (mm)', outside: 'Esterno (mm)', right: 'Destro (mm)', gutter: 'Rilegatura (mm)',
      pageBackground: 'Sfondo pagina e sezione', paperColors: { white: 'Bianco puro', cream: 'Crema calda', dark: 'Ossidiana scura' }, customBackground: 'Sfondo personalizzato', sectionBackgroundHelp: 'Si applica alla sezione selezionata.',
    },
  },
  'es-ES': {
    title: 'Configuración de página y geometría del documento', closeDialog: 'Cerrar el diálogo de configuración de página',
    tabs: { geometry: 'Geometría y papel', columns: 'Columnas', headers: 'Encabezados y pies', borders: 'Bordes de página', watermark: 'Marca de agua' },
    activeSection: 'Sección activa', standardDocument: 'Documento estándar', sectionScope: 'Los cambios se aplican desde este salto de sección hasta el siguiente.', documentScope: 'Los cambios se aplican a los párrafos sin configuración de sección propia.',
    createSection: 'Crear sección aquí', sectionStart: 'Inicio', sectionBreaks: { 'next-page': 'Página siguiente', continuous: 'Continuo', 'even-page': 'Página par', 'odd-page': 'Página impar' }, removeSection: 'Quitar sección', apply: 'Aplicar configuración de página', sectionRestartError: 'El inicio de la sección debe ser un número entero entre 1 y 9.999.',
    geometry: {
      paperSize: 'Tamaño del papel', paperNames: { Letter: 'Letter (8,5×11)', Legal: 'Legal (8,5×14)', Executive: 'Executive', Custom: 'Personalizado (mm)' }, width: 'Ancho (mm)', height: 'Alto (mm)', orientation: 'Orientación', portrait: 'Vertical', landscape: 'Horizontal',
      marginsAndGutter: 'Márgenes y encuadernación', presets: { normal: 'Normal (25,4)', narrow: 'Estrecho (12,7)', wide: 'Ancho (25,4 / 50,8)', mirrored: 'Simétrico (libro)', custom: 'Personalizado' },
      top: 'Superior (mm)', bottom: 'Inferior (mm)', inside: 'Interior (mm)', left: 'Izquierdo (mm)', outside: 'Exterior (mm)', right: 'Derecho (mm)', gutter: 'Encuadernación (mm)',
      pageBackground: 'Fondo de página y sección', paperColors: { white: 'Blanco puro', cream: 'Crema cálido', dark: 'Obsidiana oscuro' }, customBackground: 'Fondo personalizado', sectionBackgroundHelp: 'Se aplica a la sección seleccionada.',
    },
  },
  'ja-JP': {
    title: 'ページ設定と文書レイアウト', closeDialog: 'ページ設定ダイアログを閉じる',
    tabs: { geometry: 'ページと用紙', columns: '段組み', headers: 'ヘッダーとフッター', borders: 'ページ罫線', watermark: '透かし' },
    activeSection: '現在のセクション', standardDocument: '標準文書', sectionScope: '変更はこのセクション区切りから次の区切りまで適用されます。', documentScope: '独自のセクション設定がないすべての段落に適用されます。',
    createSection: 'ここにセクションを作成', sectionStart: '開始位置', sectionBreaks: { 'next-page': '次のページ', continuous: '連続', 'even-page': '偶数ページ', 'odd-page': '奇数ページ' }, removeSection: 'セクションを削除', apply: 'ページ設定を適用', sectionRestartError: 'セクションの開始番号は 1～9,999 の整数で指定してください。',
    geometry: {
      paperSize: '用紙サイズ', paperNames: { Letter: 'レター (8.5×11)', Legal: 'リーガル (8.5×14)', Executive: 'エグゼクティブ', Custom: 'ユーザー設定 (mm)' }, width: '幅 (mm)', height: '高さ (mm)', orientation: '印刷の向き', portrait: '縦', landscape: '横',
      marginsAndGutter: '余白ととじしろ', presets: { normal: '標準 (25.4)', narrow: '狭い (12.7)', wide: '広い (25.4 / 50.8)', mirrored: '見開き (本)', custom: 'ユーザー設定' },
      top: '上 (mm)', bottom: '下 (mm)', inside: '内側 (mm)', left: '左 (mm)', outside: '外側 (mm)', right: '右 (mm)', gutter: 'とじしろ (mm)',
      pageBackground: 'ページとセクションの背景', paperColors: { white: '純白', cream: 'ウォームクリーム', dark: 'オブシディアン ダーク' }, customBackground: '背景を指定', sectionBackgroundHelp: '現在選択されているセクションに適用されます。',
    },
  },
  'zh-CN': {
    title: '页面设置与文档版式', closeDialog: '关闭页面设置对话框',
    tabs: { geometry: '页面与纸张', columns: '分栏', headers: '页眉和页脚', borders: '页面边框', watermark: '水印' },
    activeSection: '当前节', standardDocument: '标准文档', sectionScope: '更改从此分节符起应用到下一个分节符。', documentScope: '更改应用于没有专属分节设置的所有段落。',
    createSection: '在此创建分节', sectionStart: '起始位置', sectionBreaks: { 'next-page': '下一页', continuous: '连续', 'even-page': '偶数页', 'odd-page': '奇数页' }, removeSection: '删除分节', apply: '应用页面设置', sectionRestartError: '分节起始编号必须是 1 到 9,999 之间的整数。',
    geometry: {
      paperSize: '纸张大小', paperNames: { Letter: 'Letter (8.5×11)', Legal: 'Legal (8.5×14)', Executive: 'Executive', Custom: '自定义 (mm)' }, width: '宽度 (mm)', height: '高度 (mm)', orientation: '方向', portrait: '纵向', landscape: '横向',
      marginsAndGutter: '页边距和装订线', presets: { normal: '普通 (25.4)', narrow: '窄 (12.7)', wide: '宽 (25.4 / 50.8)', mirrored: '镜像 (书籍)', custom: '自定义' },
      top: '上 (mm)', bottom: '下 (mm)', inside: '内侧 (mm)', left: '左 (mm)', outside: '外侧 (mm)', right: '右 (mm)', gutter: '装订线 (mm)',
      pageBackground: '页面和分节背景', paperColors: { white: '纯白', cream: '暖奶油色', dark: '黑曜石深色' }, customBackground: '自定义背景', sectionBackgroundHelp: '应用于当前选中的分节。',
    },
  },
};
