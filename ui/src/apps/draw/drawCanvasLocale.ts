// STATUS: GOLD — complete seven-locale copy for the Draw canvas toolbar and summary.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const ENGLISH = {
  workspace: 'Astraea Draw workspace', tools: 'Draw tools', addRectangle: 'Add rectangle', rectangle: 'Rectangle',
  addPage: '+ Page', addLayer: '+ Layer', template: 'Diagram template', applyTemplate: 'Apply template',
  activePage: 'Active page', activeLayer: 'Active layer', locked: 'locked', undo: 'Undo', redo: 'Redo',
  zoomOut: 'Zoom out', zoomIn: 'Zoom in', importSvg: 'Import SVG', portablePassword: 'Portable vdraw password',
  passwordPlaceholder: '.vdraw password', encryptedVdraw: 'Encrypted .vdraw', openVdraw: 'Open .vdraw',
  drawingUnavailable: 'Drawing unavailable', pageCount: '{count} pages', objectCount: '{count} objects', layerCount: '{count} layers',
  a11ySummary: '{page}. {objects} objects on this page, {pages} pages total, {layers} layers, zoom {zoom} percent.',
  localFirst: 'Local-first', undoShortcut: 'undo', redoShortcut: 'redo',
} as const;
type DrawCanvasKey = keyof typeof ENGLISH;
type DrawCanvasCopy = Record<DrawCanvasKey, string>;
export const DRAW_CANVAS_COPY: Readonly<Record<WorkspaceLocale, DrawCanvasCopy>> = {
  'en-US': ENGLISH,
  'de-DE': { workspace: 'Astraea-Draw-Arbeitsbereich', tools: 'Draw-Werkzeuge', addRectangle: 'Rechteck hinzufügen', rectangle: 'Rechteck', addPage: '+ Seite', addLayer: '+ Ebene', template: 'Diagrammvorlage', applyTemplate: 'Vorlage anwenden', activePage: 'Aktive Seite', activeLayer: 'Aktive Ebene', locked: 'gesperrt', undo: 'Rückgängig', redo: 'Wiederholen', zoomOut: 'Verkleinern', zoomIn: 'Vergrößern', importSvg: 'SVG importieren', portablePassword: 'Passwort für portables vdraw', passwordPlaceholder: '.vdraw-Passwort', encryptedVdraw: 'Verschlüsseltes .vdraw', openVdraw: '.vdraw öffnen', drawingUnavailable: 'Zeichnung nicht verfügbar', pageCount: '{count} Seiten', objectCount: '{count} Objekte', layerCount: '{count} Ebenen', a11ySummary: '{page}. {objects} Objekte auf dieser Seite, insgesamt {pages} Seiten, {layers} Ebenen, Zoom {zoom} Prozent.', localFirst: 'Lokal zuerst', undoShortcut: 'rückgängig', redoShortcut: 'wiederholen' },
  'es-ES': { workspace: 'Espacio de trabajo de Astraea Draw', tools: 'Herramientas de dibujo', addRectangle: 'Añadir rectángulo', rectangle: 'Rectángulo', addPage: '+ Página', addLayer: '+ Capa', template: 'Plantilla de diagrama', applyTemplate: 'Aplicar plantilla', activePage: 'Página activa', activeLayer: 'Capa activa', locked: 'bloqueada', undo: 'Deshacer', redo: 'Rehacer', zoomOut: 'Alejar', zoomIn: 'Acercar', importSvg: 'Importar SVG', portablePassword: 'Contraseña de vdraw portátil', passwordPlaceholder: 'Contraseña de .vdraw', encryptedVdraw: '.vdraw cifrado', openVdraw: 'Abrir .vdraw', drawingUnavailable: 'Dibujo no disponible', pageCount: '{count} páginas', objectCount: '{count} objetos', layerCount: '{count} capas', a11ySummary: '{page}. {objects} objetos en esta página, {pages} páginas en total, {layers} capas, zoom del {zoom} por ciento.', localFirst: 'Prioridad local', undoShortcut: 'deshacer', redoShortcut: 'rehacer' },
  'it-IT': { workspace: 'Area di lavoro Astraea Draw', tools: 'Strumenti Draw', addRectangle: 'Aggiungi rettangolo', rectangle: 'Rettangolo', addPage: '+ Pagina', addLayer: '+ Livello', template: 'Modello diagramma', applyTemplate: 'Applica modello', activePage: 'Pagina attiva', activeLayer: 'Livello attivo', locked: 'bloccato', undo: 'Annulla', redo: 'Ripeti', zoomOut: 'Riduci zoom', zoomIn: 'Aumenta zoom', importSvg: 'Importa SVG', portablePassword: 'Password vdraw portatile', passwordPlaceholder: 'Password .vdraw', encryptedVdraw: '.vdraw cifrato', openVdraw: 'Apri .vdraw', drawingUnavailable: 'Disegno non disponibile', pageCount: '{count} pagine', objectCount: '{count} oggetti', layerCount: '{count} livelli', a11ySummary: '{page}. {objects} oggetti in questa pagina, {pages} pagine totali, {layers} livelli, zoom {zoom} percento.', localFirst: 'Prima locale', undoShortcut: 'annulla', redoShortcut: 'ripeti' },
  'ja-JP': { workspace: 'Astraea Draw ワークスペース', tools: 'Draw ツール', addRectangle: '長方形を追加', rectangle: '長方形', addPage: '+ ページ', addLayer: '+ レイヤー', template: '図のテンプレート', applyTemplate: 'テンプレートを適用', activePage: '選択中のページ', activeLayer: '選択中のレイヤー', locked: 'ロック中', undo: '元に戻す', redo: 'やり直す', zoomOut: '縮小', zoomIn: '拡大', importSvg: 'SVG を読み込む', portablePassword: 'ポータブル vdraw のパスワード', passwordPlaceholder: '.vdraw のパスワード', encryptedVdraw: '暗号化 .vdraw', openVdraw: '.vdraw を開く', drawingUnavailable: '図を表示できません', pageCount: '{count} ページ', objectCount: '{count} 個のオブジェクト', layerCount: '{count} レイヤー', a11ySummary: '{page}。このページに {objects} 個のオブジェクト、合計 {pages} ページ、{layers} レイヤー、ズーム {zoom} パーセント。', localFirst: 'ローカル優先', undoShortcut: '元に戻す', redoShortcut: 'やり直す' },
  'ru-RU': { workspace: 'Рабочая область Astraea Draw', tools: 'Инструменты Draw', addRectangle: 'Добавить прямоугольник', rectangle: 'Прямоугольник', addPage: '+ Страница', addLayer: '+ Слой', template: 'Шаблон диаграммы', applyTemplate: 'Применить шаблон', activePage: 'Текущая страница', activeLayer: 'Текущий слой', locked: 'заблокирован', undo: 'Отменить', redo: 'Повторить', zoomOut: 'Уменьшить', zoomIn: 'Увеличить', importSvg: 'Импортировать SVG', portablePassword: 'Пароль переносимого vdraw', passwordPlaceholder: 'Пароль .vdraw', encryptedVdraw: 'Зашифрованный .vdraw', openVdraw: 'Открыть .vdraw', drawingUnavailable: 'Рисунок недоступен', pageCount: '{count} страниц', objectCount: '{count} объектов', layerCount: '{count} слоёв', a11ySummary: '{page}. На странице {objects} объектов, всего {pages} страниц и {layers} слоёв, масштаб {zoom} процентов.', localFirst: 'Сначала локально', undoShortcut: 'отмена', redoShortcut: 'повтор' },
  'zh-CN': { workspace: 'Astraea Draw 工作区', tools: 'Draw 工具', addRectangle: '添加矩形', rectangle: '矩形', addPage: '+ 页面', addLayer: '+ 图层', template: '图表模板', applyTemplate: '应用模板', activePage: '当前页面', activeLayer: '当前图层', locked: '已锁定', undo: '撤销', redo: '重做', zoomOut: '缩小', zoomIn: '放大', importSvg: '导入 SVG', portablePassword: '便携式 vdraw 密码', passwordPlaceholder: '.vdraw 密码', encryptedVdraw: '加密 .vdraw', openVdraw: '打开 .vdraw', drawingUnavailable: '绘图不可用', pageCount: '共 {count} 页', objectCount: '{count} 个对象', layerCount: '{count} 个图层', a11ySummary: '{page}。此页有 {objects} 个对象，共 {pages} 页、{layers} 个图层，缩放 {zoom}%。', localFirst: '本地优先', undoShortcut: '撤销', redoShortcut: '重做' },
};

export function drawCanvasText(message: DrawCanvasKey, locale: WorkspaceLocale): string {
  return DRAW_CANVAS_COPY[locale][message];
}

export function drawCanvasCount(message: 'pageCount' | 'objectCount' | 'layerCount', count: number, locale: WorkspaceLocale): string {
  return drawCanvasText(message, locale).replace('{count}', String(count));
}

export const DRAW_CANVAS_ERROR_COPY = {
  'en-US': { operationFailed: 'Draw operation failed.', pageMissing: 'The requested page is unavailable.', exportPassword: 'Portable .vdraw export requires at least 12 password characters.', enterPassword: 'Enter the .vdraw password first.', svgTooLarge: 'SVG exceeds the 32 MiB limit.', vdrawTooLarge: '.vdraw exceeds the 128 MiB limit.', payloadMissing: 'Draw data is missing from this file.', svgImportFailed: 'The SVG could not be imported. Check that it is a supported Astraea Draw export.', nativeImportFailed: 'The .vdraw file could not be opened. Check the password and file integrity.', visioTooLarge: 'The Visio XML exceeds the 24 MiB limit.', templateFailed: 'The diagram template could not be applied to this page.', visioImportFailed: 'The Visio XML was rejected; the parts that could not be converted are listed after the import.', visioExportFailed: 'The diagram could not be written as Visio XML.', rasterUnavailable: 'PNG and PDF export need the browser rasterizer, which is not available here.', pdfExportFailed: 'The PDF export was rejected.', pdfPageLimit: 'The PDF export supports at most 128 pages.', exportEmptyPage: 'This page has no objects; the export will contain an empty page.', svgImportSucceeded: 'The Astraea SVG was imported with all its objects.', svgVectorImported: 'The SVG had no Astraea metadata and was read as a safe vector form: {count}.' },
  'de-DE': { operationFailed: 'Der Draw-Vorgang ist fehlgeschlagen.', pageMissing: 'Die angeforderte Seite ist nicht verfügbar.', exportPassword: 'Für den portablen .vdraw-Export sind mindestens 12 Passwortzeichen erforderlich.', enterPassword: 'Geben Sie zuerst das .vdraw-Passwort ein.', svgTooLarge: 'Die SVG-Datei überschreitet das Limit von 32 MiB.', vdrawTooLarge: 'Die .vdraw-Datei überschreitet das Limit von 128 MiB.', payloadMissing: 'In dieser Datei fehlen Draw-Daten.', svgImportFailed: 'Die SVG-Datei konnte nicht importiert werden. Prüfen Sie, ob es ein unterstützter Astraea-Draw-Export ist.', nativeImportFailed: 'Die .vdraw-Datei konnte nicht geöffnet werden. Prüfen Sie Passwort und Dateiintegrität.', visioTooLarge: 'Die Visio-XML-Datei überschreitet das Limit von 24 MiB.', templateFailed: 'Die Diagrammvorlage konnte auf dieser Seite nicht angewendet werden.', visioImportFailed: 'Die Visio-XML-Datei wurde abgelehnt; die nicht konvertierbaren Teile werden nach dem Import aufgelistet.', visioExportFailed: 'Das Diagramm konnte nicht als Visio-XML geschrieben werden.', rasterUnavailable: 'PNG- und PDF-Export benötigen den Browser-Rasterizer, der hier nicht verfügbar ist.', pdfExportFailed: 'Der PDF-Export wurde abgelehnt.', pdfPageLimit: 'Der PDF-Export unterstützt höchstens 128 Seiten.', exportEmptyPage: 'Diese Seite hat keine Objekte; der Export enthält eine leere Seite.', svgImportSucceeded: 'Das Astraea-SVG wurde mit allen Objekten importiert.', svgVectorImported: 'Das SVG hatte keine Astraea-Metadaten und wurde als sichere vektorielle Form gelesen: {count}.' },
  'es-ES': { operationFailed: 'La operación de Draw ha fallado.', pageMissing: 'La página solicitada no está disponible.', exportPassword: 'La exportación portátil .vdraw requiere al menos 12 caracteres en la contraseña.', enterPassword: 'Introduce primero la contraseña de .vdraw.', svgTooLarge: 'El SVG supera el límite de 32 MiB.', vdrawTooLarge: 'El archivo .vdraw supera el límite de 128 MiB.', payloadMissing: 'Faltan los datos de Draw en este archivo.', svgImportFailed: 'No se pudo importar el SVG. Comprueba que sea una exportación compatible de Astraea Draw.', nativeImportFailed: 'No se pudo abrir el archivo .vdraw. Comprueba la contraseña y la integridad del archivo.', visioTooLarge: 'El XML de Visio supera el límite de 24 MiB.', templateFailed: 'La plantilla de diagrama no se pudo aplicar a esta página.', visioImportFailed: 'Se rechazó el XML de Visio; las partes que no se pudieron convertir se listan tras la importación.', visioExportFailed: 'El diagrama no se pudo escribir como XML de Visio.', rasterUnavailable: 'La exportación a PNG y PDF necesita el rasterizador del navegador, que no está disponible aquí.', pdfExportFailed: 'Se rechazó la exportación a PDF.', pdfPageLimit: 'La exportación a PDF admite como máximo 128 páginas.', exportEmptyPage: 'Esta página no tiene objetos; la exportación contendrá una página vacía.', svgImportSucceeded: 'El SVG de Astraea se importó con todos sus objetos.', svgVectorImported: 'El SVG no tenía metadatos de Astraea y se leyó como forma vectorial segura: {count}.' },
  'it-IT': { operationFailed: 'Operazione Draw non riuscita.', pageMissing: 'La pagina richiesta non è disponibile.', exportPassword: 'Per esportare un .vdraw portatile servono almeno 12 caratteri nella password.', enterPassword: 'Inserisci prima la password .vdraw.', svgTooLarge: 'Il file SVG supera il limite di 32 MiB.', vdrawTooLarge: 'Il file .vdraw supera il limite di 128 MiB.', payloadMissing: 'I dati Draw mancano da questo file.', svgImportFailed: 'Impossibile importare SVG. Verifica che sia un’esportazione Astraea Draw supportata.', nativeImportFailed: 'Impossibile aprire il file .vdraw. Verifica la password e l’integrità del file.', visioTooLarge: 'Il file XML di Visio supera il limite di 24 MiB.', templateFailed: 'Non è stato possibile applicare il modello di diagramma a questa pagina.', visioImportFailed: 'Il file XML di Visio è stato rifiutato; le parti non convertibili vengono elencate dopo l’importazione.', visioExportFailed: 'Non è stato possibile scrivere il diagramma come XML Visio.', rasterUnavailable: 'L’esportazione PNG e PDF richiede il rasterizzatore del browser, non disponibile qui.', pdfExportFailed: 'L’esportazione PDF è stata rifiutata.', pdfPageLimit: 'L’esportazione PDF supporta al massimo 128 pagine.', exportEmptyPage: 'Questa pagina non ha oggetti; l’esportazione conterrà una pagina vuota.', svgImportSucceeded: 'L’SVG di Astraea è stato importato con tutti i suoi oggetti.', svgVectorImported: 'L’SVG non aveva metadati Astraea ed è stato letto come forma vettoriale sicura: {count}.' },
  'ja-JP': { operationFailed: 'Draw の操作に失敗しました。', pageMissing: '指定したページは利用できません。', exportPassword: 'ポータブル .vdraw の書き出しには 12 文字以上のパスワードが必要です。', enterPassword: '先に .vdraw のパスワードを入力してください。', svgTooLarge: 'SVG が 32 MiB の上限を超えています。', vdrawTooLarge: '.vdraw が 128 MiB の上限を超えています。', payloadMissing: 'このファイルに Draw データがありません。', svgImportFailed: 'SVG を読み込めませんでした。Astraea Draw 対応形式の書き出しか確認してください。', nativeImportFailed: '.vdraw ファイルを開けませんでした。パスワードとファイルの整合性を確認してください。', visioTooLarge: 'Visio XML が 24 MiB の上限を超えています。', templateFailed: '図のテンプレートをこのページに適用できませんでした。', visioImportFailed: 'Visio XML は拒否されました。変換できなかった部分は読み込み後に一覧表示されます。', visioExportFailed: '図を Visio XML として書き出せませんでした。', rasterUnavailable: 'PNG と PDF の書き出しにはブラウザのラスタライザーが必要ですが、ここでは利用できません。', pdfExportFailed: 'PDF の書き出しは拒否されました。', pdfPageLimit: 'PDF の書き出しは最大 128 ページです。', exportEmptyPage: 'このページにはオブジェクトがありません。書き出しには空のページが含まれます。', svgImportSucceeded: 'Astraea の SVG をすべてのオブジェクトとともに読み込みました。', svgVectorImported: 'Astraea のメタデータがないため、安全なベクター形式として読み込みました: {count}。' },
  'ru-RU': { operationFailed: 'Не удалось выполнить операцию Draw.', pageMissing: 'Запрошенная страница недоступна.', exportPassword: 'Для переносимого экспорта .vdraw нужен пароль длиной не менее 12 символов.', enterPassword: 'Сначала введите пароль .vdraw.', svgTooLarge: 'Размер SVG превышает ограничение 32 МиБ.', vdrawTooLarge: 'Размер .vdraw превышает ограничение 128 МиБ.', payloadMissing: 'В этом файле отсутствуют данные Draw.', svgImportFailed: 'Не удалось импортировать SVG. Убедитесь, что это поддерживаемый экспорт Astraea Draw.', nativeImportFailed: 'Не удалось открыть файл .vdraw. Проверьте пароль и целостность файла.', visioTooLarge: 'Размер XML Visio превышает ограничение 24 МиБ.', templateFailed: 'Не удалось применить шаблон диаграммы к этой странице.', visioImportFailed: 'XML Visio отклонён; непреобразованные части перечисляются после импорта.', visioExportFailed: 'Не удалось записать диаграмму как XML Visio.', rasterUnavailable: 'Для экспорта в PNG и PDF нужен браузерный растеризатор, здесь он недоступен.', pdfExportFailed: 'Экспорт в PDF отклонён.', pdfPageLimit: 'Экспорт в PDF поддерживает не более 128 страниц.', exportEmptyPage: 'На этой странице нет объектов; экспорт будет содержать пустую страницу.', svgImportSucceeded: 'SVG Astraea импортирован со всеми объектами.', svgVectorImported: 'В SVG не было метаданных Astraea; он прочитан как безопасная векторная форма: {count}.' },
  'zh-CN': { operationFailed: 'Draw 操作失败。', pageMissing: '请求的页面不可用。', exportPassword: '导出便携式 .vdraw 文件需要至少 12 个密码字符。', enterPassword: '请先输入 .vdraw 密码。', svgTooLarge: 'SVG 超出 32 MiB 限制。', vdrawTooLarge: '.vdraw 超出 128 MiB 限制。', payloadMissing: '此文件缺少 Draw 数据。', svgImportFailed: '无法导入 SVG。请确认它是受支持的 Astraea Draw 导出文件。', nativeImportFailed: '无法打开 .vdraw 文件。请检查密码和文件完整性。', visioTooLarge: 'Visio XML 超出 24 MiB 限制。', templateFailed: '无法将图表模板应用到此页面。', visioImportFailed: 'Visio XML 被拒绝；无法转换的部分将在导入后列出。', visioExportFailed: '无法将图表写为 Visio XML。', rasterUnavailable: 'PNG 和 PDF 导出需要浏览器光栅化器，此处不可用。', pdfExportFailed: 'PDF 导出被拒绝。', pdfPageLimit: 'PDF 导出最多支持 128 页。', exportEmptyPage: '此页面没有对象；导出将包含一个空白页。', svgImportSucceeded: '已导入 Astraea SVG 及其全部对象。', svgVectorImported: '该 SVG 没有 Astraea 元数据，已作为安全矢量形式读取：{count}。' },
} as const satisfies Readonly<Record<WorkspaceLocale, Record<string, string>>>;
type DrawErrorKey = keyof typeof DRAW_CANVAS_ERROR_COPY['en-US'];
export function drawCanvasErrorText(message: DrawErrorKey, locale: WorkspaceLocale): string {
  return DRAW_CANVAS_ERROR_COPY[locale][message];
}

/**
 * Die **geschlossene** Menge der Codes, die diese Fläche mit einem **eigenen** Satz beantwortet — exakt, weil
 * genau diese Codes eine Grenze bezeichnen **und** der Satz die Grenze nennt.
 *
 * Bewusst **nicht** hier: `svg-size-boundary` und `native-size-boundary`. Beide werden auch für *zu kleine*
 * Eingaben geworfen (`importDrawSvg` prüft `< 8` Bytes), ein Satz über „überschreitet 32 MiB" wäre für diese
 * Fälle eine Falschaussage. Sie bleiben deshalb bei ihrer Kategorie (`svg-`/`native-`), die der bestehende
 * Render-Test bereits festhält.
 */
export const DRAW_CANVAS_EXACT_ERROR_CODES: Readonly<Record<string, DrawErrorKey>> = Object.freeze({
  'visio-import-too-large': 'visioTooLarge',
  'visio-export-too-large': 'visioTooLarge',
  // **Export**, nicht Import (Befund dieser Runde): `buildDrawSvg` wirft `svg-export-too-large`; das Präfix
  // `svg-` hätte daraus „Die SVG-Datei konnte nicht importiert werden" gemacht — *ein Satz über den falschen
  // Vorgang.* Die Größengrenze ist hier die wahre Ursache, also nennt der Satz sie.
  'svg-export-too-large': 'svgTooLarge',
  'pdf-page-limit': 'pdfPageLimit',
});

/**
 * Präfix → Kategorie. **Reihenfolge ist Bedeutung:** der erste Treffer gewinnt, deshalb stehen die spezielleren
 * Präfixe vor den allgemeineren (`visio-export-` vor `visio-`, `svg-raster-` vor `svg-`).
 *
 * `visio-item-kind-unsupported` zum Beispiel ist ein **nicht unterstütztes Teil**, keine Größenüberschreitung —
 * *die frühere Fassung meldete für jeden `visio-`-Code „überschreitet 24 MiB" und behauptete damit etwas,
 * das nicht geschehen war* (Befund dieser Runde, siehe `drawCanvasEngineError`-Test).
 */
export const DRAW_CANVAS_ERROR_PREFIXES: readonly (readonly [string, DrawErrorKey])[] = Object.freeze([
  Object.freeze(['visio-export-', 'visioExportFailed'] as const),
  Object.freeze(['visio-', 'visioImportFailed'] as const),
  Object.freeze(['template-', 'templateFailed'] as const),
  Object.freeze(['pdf-', 'pdfExportFailed'] as const),
  Object.freeze(['svg-raster-', 'rasterUnavailable'] as const),
  Object.freeze(['raster-', 'rasterUnavailable'] as const),
  Object.freeze(['canvas-unavailable', 'rasterUnavailable'] as const),
  Object.freeze(['browser-rasterizer-unavailable', 'rasterUnavailable'] as const),
  Object.freeze(['webp-encoder-unavailable', 'rasterUnavailable'] as const),
  Object.freeze(['svg-', 'svgImportFailed'] as const),
  Object.freeze(['native-', 'nativeImportFailed'] as const),
  Object.freeze(['draw-workspace-', 'nativeImportFailed'] as const),
]);

/**
 * Übersetzt einen Fehler in den sichtbaren Satz. **Fail-closed und benannt:** ein Fehler mit Code verliert seinen
 * Namen nie — er wird der generischen Meldung angehängt (`… (code)`), damit kein ungültiger Pfad still bleibt.
 * Ein Fehler **ohne** Code gibt seinen Text nicht preis (interne Details bleiben intern), sondern nur die
 * generische Meldung.
 */
export function drawCanvasEngineError(error: unknown, locale: WorkspaceLocale): string {
  const localizedErrors: ReadonlySet<string> = new Set(Object.values(DRAW_CANVAS_ERROR_COPY[locale]));
  if (error instanceof Error && localizedErrors.has(error.message)) return error.message;
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (code.length > 0) {
    const exact = DRAW_CANVAS_EXACT_ERROR_CODES[code];
    if (exact) return drawCanvasErrorText(exact, locale);
    const prefix = DRAW_CANVAS_ERROR_PREFIXES.find(([candidate]) => code.startsWith(candidate));
    if (prefix) return drawCanvasErrorText(prefix[1], locale);
    return `${drawCanvasErrorText('operationFailed', locale)} (${code.slice(0, 120)})`;
  }
  return drawCanvasErrorText('operationFailed', locale);
}
