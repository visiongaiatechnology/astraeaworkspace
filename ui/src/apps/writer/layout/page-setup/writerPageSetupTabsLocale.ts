// STATUS: PLATIN — seven-locale copy for the remaining Page Setup tabs and validation fallback.
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';

export type WriterPageSetupTabsCopy = Readonly<{
  columns: Readonly<{
    layout: string; count: Readonly<Record<'1' | '2' | '3' | '4', string>>; gap: string; widths: string; widthHelp: string;
    custom: string; columnWidth: (index: number) => string; remaining: (width: string) => string; distribute: string;
  }>;
  headers: Readonly<{
    header: string; footer: string; standardOdd: string; headerPlaceholder: string; footerPlaceholder: string;
    firstPageDifferent: string; firstHeader: string; firstFooter: string; firstHeaderPlaceholder: string; firstFooterPlaceholder: string;
    oddEvenDifferent: string; evenHeader: string; evenFooter: string; evenHeaderPlaceholder: string; evenFooterPlaceholder: string;
    linkHeader: string; linkFooter: string; showPageNumbers: string; numberFormat: string;
    numberFormats: Readonly<Record<'arabic' | 'roman-upper' | 'roman-lower' | 'alpha-upper' | 'alpha-lower', string>>;
    position: string; positions: Readonly<Record<'footer-right' | 'footer-center' | 'footer-left' | 'header-right' | 'header-center' | 'header-left', string>>;
    restartInSection: string; startInSection: string; startInDocument: string; chapterNumbering: string;
  }>;
  borders: Readonly<{
    enable: string; style: string; styles: Readonly<Record<'solid' | 'dashed' | 'dotted' | 'double', string>>;
    width: string; color: string; padding: string;
  }>;
  watermark: Readonly<{
    enabled: string; enabledHelp: string; text: string; textAccessibleName: string;
    presets: Readonly<Record<'CONFIDENTIAL' | 'DRAFT' | 'SOVEREIGN' | 'CLASSIFIED', string>>;
    opacity: string; rotation: string; color: string; colorAccessibleName: string;
  }>;
  validationError: string;
  validationReasons: Readonly<{
    pageNumbers: string;
    customDimensions: string;
    margins: string;
    columns: string;
    decorations: string;
    headerFooter: string;
  }>;
}>;

export const WRITER_PAGE_SETUP_TABS_COPY: Readonly<Record<WorkspaceLocale, WriterPageSetupTabsCopy>> = {
  'en-US': {
    columns: { layout: 'Column layout (1–4)', count: { '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four' }, gap: 'Column spacing (mm)', widths: 'Column widths', widthHelp: 'Equal widths or set each column precisely in millimeters.', custom: 'Custom', columnWidth: (index) => `Column ${index} (mm)`, remaining: (width) => `Remaining: ${width} mm`, distribute: 'Distribute evenly' },
    headers: { header: 'Header text', footer: 'Footer text', standardOdd: 'Standard / odd pages', headerPlaceholder: 'Example: Project report', footerPlaceholder: 'Example: VisionGaia Technology Workspace', firstPageDifferent: 'Different first page', firstHeader: 'First-page header', firstFooter: 'First-page footer', firstHeaderPlaceholder: 'Leave blank or enter a title-page header', firstFooterPlaceholder: 'Leave blank or enter a title-page footer', oddEvenDifferent: 'Different odd and even pages', evenHeader: 'Even-page header', evenFooter: 'Even-page footer', evenHeaderPlaceholder: 'Header for left / even pages', evenFooterPlaceholder: 'Footer for left / even pages', linkHeader: 'Link header to previous section', linkFooter: 'Link footer to previous section', showPageNumbers: 'Show page numbers', numberFormat: 'Number format', numberFormats: { arabic: 'Arabic (1, 2, 3)', 'roman-upper': 'Uppercase Roman (I, II, III)', 'roman-lower': 'Lowercase Roman (i, ii, iii)', 'alpha-upper': 'Uppercase letters (A, B, C)', 'alpha-lower': 'Lowercase letters (a, b, c)' }, position: 'Position', positions: { 'footer-right': 'Footer right', 'footer-center': 'Footer center', 'footer-left': 'Footer left', 'header-right': 'Header right', 'header-center': 'Header center', 'header-left': 'Header left' }, restartInSection: 'Restart numbering in this section', startInSection: 'Section page-number start', startInDocument: 'Document page-number start', chapterNumbering: 'Include chapter number (for example, Chapter 1-1)' },
    borders: { enable: 'Enable page borders', style: 'Line style', styles: { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', double: 'Double' }, width: 'Line width (pt)', color: 'Color', padding: 'Distance from page edge (mm)' },
    watermark: { enabled: 'Enable diagonal watermark', enabledHelp: 'Prints a watermark across each page.', text: 'Watermark text', textAccessibleName: 'Watermark text', presets: { CONFIDENTIAL: 'Confidential', DRAFT: 'Draft', SOVEREIGN: 'Sovereign', CLASSIFIED: 'Classified' }, opacity: 'Opacity', rotation: 'Rotation', color: 'Color', colorAccessibleName: 'Watermark color' },
    validationError: 'Page setup could not be applied. Check the values and try again.',
    validationReasons: { pageNumbers: 'Check the page-number start value, format, and position.', customDimensions: 'Custom page width and height must each be between 25 and 2,000 mm.', margins: 'Review the margins and gutter; keep at least 10 mm of usable page space.', columns: 'Check the column count, spacing, and widths.', decorations: 'Check the page background, border, and watermark values.', headerFooter: 'Header and footer text may contain at most 4,096 characters each.' },
  },
  'de-DE': {
    columns: { layout: 'Spaltenlayout (1–4)', count: { '1': 'Eine', '2': 'Zwei', '3': 'Drei', '4': 'Vier' }, gap: 'Spaltenabstand (mm)', widths: 'Spaltenbreiten', widthHelp: 'Gleich breite Spalten oder jede Spalte millimetergenau festlegen.', custom: 'Individuell', columnWidth: (index) => `Spalte ${index} (mm)`, remaining: (width) => `Verbleibend: ${width} mm`, distribute: 'Gleichmäßig verteilen' },
    headers: { header: 'Kopfzeilentext', footer: 'Fußzeilentext', standardOdd: 'Standard- / ungerade Seiten', headerPlaceholder: 'Beispiel: Projektbericht', footerPlaceholder: 'Beispiel: VisionGaia Technology Workspace', firstPageDifferent: 'Erste Seite anders', firstHeader: 'Kopfzeile der ersten Seite', firstFooter: 'Fußzeile der ersten Seite', firstHeaderPlaceholder: 'Leer lassen oder Kopfzeile für das Titelblatt eingeben', firstFooterPlaceholder: 'Leer lassen oder Fußzeile für das Titelblatt eingeben', oddEvenDifferent: 'Gerade und ungerade Seiten unterschiedlich', evenHeader: 'Kopfzeile gerader Seiten', evenFooter: 'Fußzeile gerader Seiten', evenHeaderPlaceholder: 'Kopfzeile für linke / gerade Seiten', evenFooterPlaceholder: 'Fußzeile für linke / gerade Seiten', linkHeader: 'Kopfzeile mit vorherigem Abschnitt verknüpfen', linkFooter: 'Fußzeile mit vorherigem Abschnitt verknüpfen', showPageNumbers: 'Seitennummerierung anzeigen', numberFormat: 'Zahlenformat', numberFormats: { arabic: 'Arabisch (1, 2, 3)', 'roman-upper': 'Römisch groß (I, II, III)', 'roman-lower': 'Römisch klein (i, ii, iii)', 'alpha-upper': 'Großbuchstaben (A, B, C)', 'alpha-lower': 'Kleinbuchstaben (a, b, c)' }, position: 'Position', positions: { 'footer-right': 'Fußzeile rechts', 'footer-center': 'Fußzeile mittig', 'footer-left': 'Fußzeile links', 'header-right': 'Kopfzeile rechts', 'header-center': 'Kopfzeile mittig', 'header-left': 'Kopfzeile links' }, restartInSection: 'Nummerierung in diesem Abschnitt neu beginnen', startInSection: 'Seitennummernstart des Abschnitts', startInDocument: 'Seitennummernstart des Dokuments', chapterNumbering: 'Kapitelnummer einbeziehen (z. B. Kapitel 1-1)' },
    borders: { enable: 'Seitenrahmen aktivieren', style: 'Linienstil', styles: { solid: 'Durchgezogen', dashed: 'Gestrichelt', dotted: 'Gepunktet', double: 'Doppellinie' }, width: 'Linienstärke (pt)', color: 'Farbe', padding: 'Abstand zum Seitenrand (mm)' },
    watermark: { enabled: 'Diagonales Wasserzeichen aktivieren', enabledHelp: 'Druckt ein Wasserzeichen über jede Seite.', text: 'Wasserzeichentext', textAccessibleName: 'Wasserzeichentext', presets: { CONFIDENTIAL: 'Vertraulich', DRAFT: 'Entwurf', SOVEREIGN: 'Souverän', CLASSIFIED: 'Geheim' }, opacity: 'Deckkraft', rotation: 'Drehung', color: 'Farbe', colorAccessibleName: 'Wasserzeichenfarbe' },
    validationError: 'Seiteneinrichtung konnte nicht angewendet werden. Prüfe die Werte und versuche es erneut.',
    validationReasons: { pageNumbers: 'Prüfe Startwert, Format und Position der Seitennummern.', customDimensions: 'Benutzerdefinierte Seitenbreite und -höhe müssen jeweils zwischen 25 und 2.000 mm liegen.', margins: 'Prüfe Ränder und Bundsteg; es müssen mindestens 10 mm nutzbare Seitenfläche bleiben.', columns: 'Prüfe Anzahl, Abstand und Breite der Spalten.', decorations: 'Prüfe Werte für Seitenhintergrund, Rahmen und Wasserzeichen.', headerFooter: 'Maximal 4.096 Zeichen je Kopf- oder Fußzeile.' },
  },
  'ru-RU': {
    columns: { layout: 'Разбиение на столбцы (1–4)', count: { '1': 'Один', '2': 'Два', '3': 'Три', '4': 'Четыре' }, gap: 'Интервал между столбцами (мм)', widths: 'Ширина столбцов', widthHelp: 'Одинаковая ширина или точная настройка каждого столбца в миллиметрах.', custom: 'Настроить', columnWidth: (index) => `Столбец ${index} (мм)`, remaining: (width) => `Осталось: ${width} мм`, distribute: 'Распределить равномерно' },
    headers: { header: 'Текст верхнего колонтитула', footer: 'Текст нижнего колонтитула', standardOdd: 'Стандартные / нечётные страницы', headerPlaceholder: 'Например: Отчёт проекта', footerPlaceholder: 'Например: VisionGaia Technology Workspace', firstPageDifferent: 'Первая страница отличается', firstHeader: 'Верхний колонтитул первой страницы', firstFooter: 'Нижний колонтитул первой страницы', firstHeaderPlaceholder: 'Оставьте пустым или введите текст титульной страницы', firstFooterPlaceholder: 'Оставьте пустым или введите нижний колонтитул титульной страницы', oddEvenDifferent: 'Чётные и нечётные страницы различаются', evenHeader: 'Верхний колонтитул чётных страниц', evenFooter: 'Нижний колонтитул чётных страниц', evenHeaderPlaceholder: 'Колонтитул для левых / чётных страниц', evenFooterPlaceholder: 'Нижний колонтитул для левых / чётных страниц', linkHeader: 'Связать верхний колонтитул с предыдущим разделом', linkFooter: 'Связать нижний колонтитул с предыдущим разделом', showPageNumbers: 'Показывать номера страниц', numberFormat: 'Формат номера', numberFormats: { arabic: 'Арабские (1, 2, 3)', 'roman-upper': 'Римские заглавные (I, II, III)', 'roman-lower': 'Римские строчные (i, ii, iii)', 'alpha-upper': 'Заглавные буквы (A, B, C)', 'alpha-lower': 'Строчные буквы (a, b, c)' }, position: 'Положение', positions: { 'footer-right': 'Внизу справа', 'footer-center': 'Внизу по центру', 'footer-left': 'Внизу слева', 'header-right': 'Вверху справа', 'header-center': 'Вверху по центру', 'header-left': 'Вверху слева' }, restartInSection: 'Начать нумерацию заново в этом разделе', startInSection: 'Начальный номер раздела', startInDocument: 'Начальный номер документа', chapterNumbering: 'Добавить номер главы (например, Глава 1-1)' },
    borders: { enable: 'Включить границы страницы', style: 'Стиль линии', styles: { solid: 'Сплошная', dashed: 'Штриховая', dotted: 'Точечная', double: 'Двойная' }, width: 'Толщина линии (пт)', color: 'Цвет', padding: 'Отступ от края страницы (мм)' },
    watermark: { enabled: 'Включить диагональный водяной знак', enabledHelp: 'Печатает водяной знак на каждой странице.', text: 'Текст водяного знака', textAccessibleName: 'Текст водяного знака', presets: { CONFIDENTIAL: 'Конфиденциально', DRAFT: 'Черновик', SOVEREIGN: 'Суверенный', CLASSIFIED: 'Секретно' }, opacity: 'Непрозрачность', rotation: 'Поворот', color: 'Цвет', colorAccessibleName: 'Цвет водяного знака' },
    validationError: 'Не удалось применить параметры страницы. Проверьте значения и попробуйте снова.',
    validationReasons: { pageNumbers: 'Проверьте начальное значение, формат и положение номеров страниц.', customDimensions: 'Ширина и высота страницы должны быть от 25 до 2 000 мм.', margins: 'Проверьте поля и корешковое поле; оставьте не менее 10 мм полезной области страницы.', columns: 'Проверьте число столбцов, интервал и ширину.', decorations: 'Проверьте фон страницы, границы и параметры водяного знака.', headerFooter: 'Текст верхнего и нижнего колонтитулов не должен превышать 4 096 символов каждый.' },
  },
  'it-IT': {
    columns: { layout: 'Layout colonne (1–4)', count: { '1': 'Una', '2': 'Due', '3': 'Tre', '4': 'Quattro' }, gap: 'Spaziatura colonne (mm)', widths: 'Larghezza colonne', widthHelp: 'Larghezze uguali oppure imposta ogni colonna con precisione in millimetri.', custom: 'Personalizzata', columnWidth: (index) => `Colonna ${index} (mm)`, remaining: (width) => `Rimanente: ${width} mm`, distribute: 'Distribuisci uniformemente' },
    headers: { header: 'Testo intestazione', footer: 'Testo piè di pagina', standardOdd: 'Pagine standard / dispari', headerPlaceholder: 'Esempio: Relazione di progetto', footerPlaceholder: 'Esempio: VisionGaia Technology Workspace', firstPageDifferent: 'Prima pagina diversa', firstHeader: 'Intestazione prima pagina', firstFooter: 'Piè di pagina prima pagina', firstHeaderPlaceholder: 'Lascia vuoto o inserisci l’intestazione del frontespizio', firstFooterPlaceholder: 'Lascia vuoto o inserisci il piè di pagina del frontespizio', oddEvenDifferent: 'Pagine pari e dispari diverse', evenHeader: 'Intestazione pagine pari', evenFooter: 'Piè di pagina pagine pari', evenHeaderPlaceholder: 'Intestazione per pagine sinistre / pari', evenFooterPlaceholder: 'Piè di pagina per pagine sinistre / pari', linkHeader: 'Collega intestazione alla sezione precedente', linkFooter: 'Collega piè di pagina alla sezione precedente', showPageNumbers: 'Mostra numeri di pagina', numberFormat: 'Formato numero', numberFormats: { arabic: 'Arabi (1, 2, 3)', 'roman-upper': 'Romani maiuscoli (I, II, III)', 'roman-lower': 'Romani minuscoli (i, ii, iii)', 'alpha-upper': 'Lettere maiuscole (A, B, C)', 'alpha-lower': 'Lettere minuscole (a, b, c)' }, position: 'Posizione', positions: { 'footer-right': 'Piè di pagina a destra', 'footer-center': 'Piè di pagina al centro', 'footer-left': 'Piè di pagina a sinistra', 'header-right': 'Intestazione a destra', 'header-center': 'Intestazione al centro', 'header-left': 'Intestazione a sinistra' }, restartInSection: 'Ricomincia numerazione in questa sezione', startInSection: 'Numero iniziale della sezione', startInDocument: 'Numero iniziale del documento', chapterNumbering: 'Includi numero capitolo (ad es. Capitolo 1-1)' },
    borders: { enable: 'Attiva bordi pagina', style: 'Stile linea', styles: { solid: 'Continua', dashed: 'Tratteggiata', dotted: 'Puntinata', double: 'Doppia' }, width: 'Spessore linea (pt)', color: 'Colore', padding: 'Distanza dal bordo pagina (mm)' },
    watermark: { enabled: 'Attiva filigrana diagonale', enabledHelp: 'Stampa una filigrana su ogni pagina.', text: 'Testo filigrana', textAccessibleName: 'Testo filigrana', presets: { CONFIDENTIAL: 'Riservato', DRAFT: 'Bozza', SOVEREIGN: 'Sovrano', CLASSIFIED: 'Classificato' }, opacity: 'Opacità', rotation: 'Rotazione', color: 'Colore', colorAccessibleName: 'Colore filigrana' },
    validationError: 'Impossibile applicare le impostazioni pagina. Controlla i valori e riprova.',
    validationReasons: { pageNumbers: 'Controlla il valore iniziale, il formato e la posizione dei numeri di pagina.', customDimensions: 'Larghezza e altezza personalizzate devono essere comprese tra 25 e 2.000 mm.', margins: 'Controlla margini e rilegatura; lascia almeno 10 mm di area pagina utilizzabile.', columns: 'Controlla numero, spaziatura e larghezza delle colonne.', decorations: 'Controlla sfondo, bordi e valori della filigrana.', headerFooter: 'Ogni intestazione e piè di pagina può contenere al massimo 4.096 caratteri.' },
  },
  'es-ES': {
    columns: { layout: 'Diseño de columnas (1–4)', count: { '1': 'Una', '2': 'Dos', '3': 'Tres', '4': 'Cuatro' }, gap: 'Espacio entre columnas (mm)', widths: 'Ancho de columnas', widthHelp: 'Anchos iguales o configura cada columna con precisión en milímetros.', custom: 'Personalizado', columnWidth: (index) => `Columna ${index} (mm)`, remaining: (width) => `Restante: ${width} mm`, distribute: 'Distribuir uniformemente' },
    headers: { header: 'Texto del encabezado', footer: 'Texto del pie de página', standardOdd: 'Páginas normales / impares', headerPlaceholder: 'Ejemplo: Informe del proyecto', footerPlaceholder: 'Ejemplo: VisionGaia Technology Workspace', firstPageDifferent: 'Primera página diferente', firstHeader: 'Encabezado de la primera página', firstFooter: 'Pie de página de la primera página', firstHeaderPlaceholder: 'Déjalo vacío o escribe el encabezado de portada', firstFooterPlaceholder: 'Déjalo vacío o escribe el pie de página de portada', oddEvenDifferent: 'Páginas pares e impares diferentes', evenHeader: 'Encabezado de páginas pares', evenFooter: 'Pie de página de páginas pares', evenHeaderPlaceholder: 'Encabezado para páginas izquierdas / pares', evenFooterPlaceholder: 'Pie para páginas izquierdas / pares', linkHeader: 'Vincular encabezado a la sección anterior', linkFooter: 'Vincular pie de página a la sección anterior', showPageNumbers: 'Mostrar números de página', numberFormat: 'Formato del número', numberFormats: { arabic: 'Arábigos (1, 2, 3)', 'roman-upper': 'Romanos en mayúscula (I, II, III)', 'roman-lower': 'Romanos en minúscula (i, ii, iii)', 'alpha-upper': 'Letras mayúsculas (A, B, C)', 'alpha-lower': 'Letras minúsculas (a, b, c)' }, position: 'Posición', positions: { 'footer-right': 'Pie a la derecha', 'footer-center': 'Pie centrado', 'footer-left': 'Pie a la izquierda', 'header-right': 'Encabezado a la derecha', 'header-center': 'Encabezado centrado', 'header-left': 'Encabezado a la izquierda' }, restartInSection: 'Reiniciar numeración en esta sección', startInSection: 'Número inicial de la sección', startInDocument: 'Número inicial del documento', chapterNumbering: 'Incluir número de capítulo (p. ej., Capítulo 1-1)' },
    borders: { enable: 'Activar bordes de página', style: 'Estilo de línea', styles: { solid: 'Continua', dashed: 'Discontinua', dotted: 'Punteada', double: 'Doble' }, width: 'Grosor de línea (pt)', color: 'Color', padding: 'Distancia al borde de la página (mm)' },
    watermark: { enabled: 'Activar marca de agua diagonal', enabledHelp: 'Imprime una marca de agua en todas las páginas.', text: 'Texto de marca de agua', textAccessibleName: 'Texto de marca de agua', presets: { CONFIDENTIAL: 'Confidencial', DRAFT: 'Borrador', SOVEREIGN: 'Soberano', CLASSIFIED: 'Clasificado' }, opacity: 'Opacidad', rotation: 'Rotación', color: 'Color', colorAccessibleName: 'Color de marca de agua' },
    validationError: 'No se pudo aplicar la configuración de página. Comprueba los valores e inténtalo de nuevo.',
    validationReasons: { pageNumbers: 'Comprueba el valor inicial, el formato y la posición de los números de página.', customDimensions: 'El ancho y el alto personalizados deben estar entre 25 y 2.000 mm.', margins: 'Revisa los márgenes y el medianil; deja al menos 10 mm de espacio útil en la página.', columns: 'Comprueba el número, el espacio y el ancho de las columnas.', decorations: 'Comprueba los valores del fondo, el borde y la marca de agua.', headerFooter: 'Cada encabezado y pie de página admite como máximo 4.096 caracteres.' },
  },
  'ja-JP': {
    columns: { layout: '段組み (1～4)', count: { '1': '1 段', '2': '2 段', '3': '3 段', '4': '4 段' }, gap: '段間隔 (mm)', widths: '段幅', widthHelp: '均等幅にするか、各段の幅をミリ単位で指定します。', custom: '個別に指定', columnWidth: (index) => `${index} 段目 (mm)`, remaining: (width) => `残り: ${width} mm`, distribute: '均等に配置' },
    headers: { header: 'ヘッダーのテキスト', footer: 'フッターのテキスト', standardOdd: '標準 / 奇数ページ', headerPlaceholder: '例: プロジェクトレポート', footerPlaceholder: '例: VisionGaia Technology Workspace', firstPageDifferent: '先頭ページのみ別指定', firstHeader: '先頭ページのヘッダー', firstFooter: '先頭ページのフッター', firstHeaderPlaceholder: '空欄にするか、表紙のヘッダーを入力', firstFooterPlaceholder: '空欄にするか、表紙のフッターを入力', oddEvenDifferent: '奇数ページと偶数ページで別指定', evenHeader: '偶数ページのヘッダー', evenFooter: '偶数ページのフッター', evenHeaderPlaceholder: '左側 / 偶数ページのヘッダー', evenFooterPlaceholder: '左側 / 偶数ページのフッター', linkHeader: '前のセクションとヘッダーを連動', linkFooter: '前のセクションとフッターを連動', showPageNumbers: 'ページ番号を表示', numberFormat: '番号の形式', numberFormats: { arabic: '算用数字 (1, 2, 3)', 'roman-upper': 'ローマ数字 (I, II, III)', 'roman-lower': '小文字ローマ数字 (i, ii, iii)', 'alpha-upper': '大文字アルファベット (A, B, C)', 'alpha-lower': '小文字アルファベット (a, b, c)' }, position: '位置', positions: { 'footer-right': 'フッター右', 'footer-center': 'フッター中央', 'footer-left': 'フッター左', 'header-right': 'ヘッダー右', 'header-center': 'ヘッダー中央', 'header-left': 'ヘッダー左' }, restartInSection: 'このセクションで番号を振り直す', startInSection: 'セクションの開始番号', startInDocument: '文書の開始番号', chapterNumbering: '章番号を含める (例: 第 1-1 章)' },
    borders: { enable: 'ページ罫線を有効にする', style: '線の種類', styles: { solid: '実線', dashed: '破線', dotted: '点線', double: '二重線' }, width: '線の太さ (pt)', color: '色', padding: 'ページ端からの距離 (mm)' },
    watermark: { enabled: '斜めの透かしを有効にする', enabledHelp: '各ページに透かしを印刷します。', text: '透かしのテキスト', textAccessibleName: '透かしのテキスト', presets: { CONFIDENTIAL: '機密', DRAFT: '下書き', SOVEREIGN: '主権', CLASSIFIED: '極秘' }, opacity: '不透明度', rotation: '回転', color: '色', colorAccessibleName: '透かしの色' },
    validationError: 'ページ設定を適用できませんでした。値を確認してもう一度お試しください。',
    validationReasons: { pageNumbers: 'ページ番号の開始値、形式、位置を確認してください。', customDimensions: 'カスタムページの幅と高さは、それぞれ 25～2,000 mm にしてください。', margins: '余白ととじしろを確認し、ページの有効領域を 10 mm 以上確保してください。', columns: '段数、段間隔、段幅を確認してください。', decorations: 'ページ背景、枠線、透かしの値を確認してください。', headerFooter: 'ヘッダーとフッターはそれぞれ 4,096 文字以内にしてください。' },
  },
  'zh-CN': {
    columns: { layout: '分栏布局 (1–4)', count: { '1': '一栏', '2': '两栏', '3': '三栏', '4': '四栏' }, gap: '栏间距 (mm)', widths: '栏宽', widthHelp: '可设为等宽，也可按毫米分别指定每栏宽度。', custom: '自定义', columnWidth: (index) => `第 ${index} 栏 (mm)`, remaining: (width) => `剩余：${width} mm`, distribute: '平均分布' },
    headers: { header: '页眉文本', footer: '页脚文本', standardOdd: '标准 / 奇数页', headerPlaceholder: '例如：项目报告', footerPlaceholder: '例如：VisionGaia Technology Workspace', firstPageDifferent: '首页不同', firstHeader: '首页页眉', firstFooter: '首页页脚', firstHeaderPlaceholder: '留空或输入封面页眉', firstFooterPlaceholder: '留空或输入封面页脚', oddEvenDifferent: '奇偶页不同', evenHeader: '偶数页页眉', evenFooter: '偶数页页脚', evenHeaderPlaceholder: '左侧 / 偶数页页眉', evenFooterPlaceholder: '左侧 / 偶数页页脚', linkHeader: '与上一节链接页眉', linkFooter: '与上一节链接页脚', showPageNumbers: '显示页码', numberFormat: '页码格式', numberFormats: { arabic: '阿拉伯数字 (1, 2, 3)', 'roman-upper': '大写罗马数字 (I, II, III)', 'roman-lower': '小写罗马数字 (i, ii, iii)', 'alpha-upper': '大写字母 (A, B, C)', 'alpha-lower': '小写字母 (a, b, c)' }, position: '位置', positions: { 'footer-right': '页脚右侧', 'footer-center': '页脚居中', 'footer-left': '页脚左侧', 'header-right': '页眉右侧', 'header-center': '页眉居中', 'header-left': '页眉左侧' }, restartInSection: '在此节重新开始编号', startInSection: '分节页码起始值', startInDocument: '文档页码起始值', chapterNumbering: '包含章节编号 (例如：第 1-1 章)' },
    borders: { enable: '启用页面边框', style: '线条样式', styles: { solid: '实线', dashed: '虚线', dotted: '点线', double: '双线' }, width: '线宽 (pt)', color: '颜色', padding: '距页面边缘 (mm)' },
    watermark: { enabled: '启用对角水印', enabledHelp: '在每页打印水印。', text: '水印文本', textAccessibleName: '水印文本', presets: { CONFIDENTIAL: '机密', DRAFT: '草稿', SOVEREIGN: '主权', CLASSIFIED: '绝密' }, opacity: '不透明度', rotation: '旋转', color: '颜色', colorAccessibleName: '水印颜色' },
    validationError: '无法应用页面设置。请检查各项值后重试。',
    validationReasons: { pageNumbers: '请检查页码起始值、格式和位置。', customDimensions: '自定义页面的宽度和高度必须分别在 25 至 2,000 毫米之间。', margins: '请检查页边距和装订线，确保页面可用区域至少为 10 毫米。', columns: '请检查分栏数量、间距和宽度。', decorations: '请检查页面背景、边框和水印设置。', headerFooter: '页眉和页脚文本各不得超过 4,096 个字符。' },
  },
};

const VALIDATION_REASON_PREFIXES: readonly (readonly [string, keyof WriterPageSetupTabsCopy['validationReasons']])[] = [
  ['Der Seitennummern-Startwert', 'pageNumbers'],
  ['Das Seitennummernformat', 'pageNumbers'],
  ['Die Seitennummernposition', 'pageNumbers'],
  ['Benutzerdefinierte Seitenmaße', 'customDimensions'],
  ['Seitenränder und Bundsteg', 'margins'],
  ['Innen-/Außenrand', 'margins'],
  ['Oberer und unterer Rand', 'margins'],
  ['Die Spaltenanzahl', 'columns'],
  ['Der Spaltenabstand', 'columns'],
  ['Spalten und Abstände', 'columns'],
  ['Individuelle Spaltenbreiten', 'columns'],
  ['Die Papieroberfläche', 'decorations'],
  ['Die benutzerdefinierte Hintergrundfarbe', 'decorations'],
  ['Der Seitenrahmenstil', 'decorations'],
  ['Die Seitenrahmenfarbe', 'decorations'],
  ['Seitenrahmen-Werte', 'decorations'],
  ['Der Wasserzeichenstatus', 'decorations'],
  ['Die Wasserzeichenfarbe', 'decorations'],
  ['Die Wasserzeichendeckkraft', 'decorations'],
  ['Die Wasserzeichendrehung', 'decorations'],
  ['Ein aktives Wasserzeichen', 'decorations'],
  ['Kopf- und Fußzeilentexte', 'headerFooter'],
];

/** Localize known validator messages while hiding unknown engine details. */
export function writerPageSetupValidationFallback(locale: WorkspaceLocale, cause: unknown): string {
  const copy = WRITER_PAGE_SETUP_TABS_COPY[locale];
  const message = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '';
  const reason = VALIDATION_REASON_PREFIXES.find(([prefix]) => message.startsWith(prefix))?.[1];
  return reason === undefined ? copy.validationError : copy.validationReasons[reason];
}
