// STATUS: GOLD — seven-locale copy for the Publish workspace panels (new document, pages, export, status).
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';
import type { PublishExportTarget } from './interchange/publishExportDelivery';
import type { PublishPaperStandard } from './model/publishDocumentFactory';

const ENGLISH = {
  workspace: 'Astraea Publish workspace panels',
  newDocument: 'New layout document', newDocumentTitle: 'New layout document',
  newDocumentDescription: 'Creates a genuinely empty document: no sample text, no sample frames, one blank master.',
  paper: 'Paper size', orientation: 'Orientation', portrait: 'Portrait', landscape: 'Landscape',
  pageCount: 'Pages', margin: 'Margin (mm)', bleed: 'Bleed (mm)', documentTitle: 'Document title',
  create: 'Create document', cancel: 'Cancel',
  created: 'New document created: {summary}', creationFailed: 'The document could not be created: {reason}',
  pagesPanel: 'Pages', showPages: 'Show page panel', hidePages: 'Hide page panel',
  addPage: 'Add page after current page', duplicatePage: 'Duplicate page', removePage: 'Delete page',
  movePageUp: 'Move page up', movePageDown: 'Move page down', currentPage: 'Current page',
  pageThumbnail: 'Page {number} thumbnail', emptyPage: 'empty', frameCount: '{count} object(s)',
  exportMenu: 'Export publication', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
  exportHtml: 'HTML (reflow)', exportHtmlFixed: 'HTML (fixed layout)', exportEpub: 'EPUB 3 (reflow)',
  exportEpubFixed: 'EPUB 3 (fixed layout)', exportPackage: 'Publication package (.zip)',
  exportRunning: 'Export running: {target}…', exportDone: 'Export written: {summary}',
  exportFailed: 'Export failed: {reason}', exportNoWarnings: 'no warnings', exportWarnings: '{count} warning(s)',
  exportTarget: 'Export target', runExport: 'Run export',
  paperA4: 'A4 (210 × 297 mm)', paperA3: 'A3 (297 × 420 mm)', paperA5: 'A5 (148 × 210 mm)',
  paperLetter: 'Letter (215.9 × 279.4 mm)', paperCustom: 'Custom size',
  unsupportedEnvironment: 'This environment cannot deliver files. The export bytes exist but were not written.',
} as const;

type PublishWorkspaceKey = keyof typeof ENGLISH;
type PublishWorkspaceCopy = Record<PublishWorkspaceKey, string>;

/**
 * Die Schluessel als Wert.
 *
 * Ein Test prueft damit, dass **jede** Sprache denselben Satz Schluessel traegt und keinen leeren. Diese Liste
 * ist die einzige Quelle dafuer; sie von Hand zu wiederholen waere eine zweite Wahrheit.
 */
export const PUBLISH_WORKSPACE_LOCALE_KEYS: readonly PublishWorkspaceKey[] = Object.keys(ENGLISH) as PublishWorkspaceKey[];

export const PUBLISH_WORKSPACE_COPY: Readonly<Record<WorkspaceLocale, PublishWorkspaceCopy>> = {
  'en-US': ENGLISH,
  'de-DE': {
    workspace: 'Astraea-Publish-Arbeitsflächen', newDocument: 'Neues Layoutdokument', newDocumentTitle: 'Neues Layoutdokument',
    newDocumentDescription: 'Erzeugt ein wirklich leeres Dokument: kein Beispieltext, keine Beispielrahmen, ein leerer Master.',
    paper: 'Papierformat', orientation: 'Ausrichtung', portrait: 'Hochformat', landscape: 'Querformat',
    pageCount: 'Seiten', margin: 'Rand (mm)', bleed: 'Anschnitt (mm)', documentTitle: 'Dokumenttitel',
    create: 'Dokument anlegen', cancel: 'Abbrechen',
    created: 'Neues Dokument angelegt: {summary}', creationFailed: 'Das Dokument konnte nicht angelegt werden: {reason}',
    pagesPanel: 'Seiten', showPages: 'Seitenleiste einblenden', hidePages: 'Seitenleiste ausblenden',
    addPage: 'Seite nach der aktuellen einfügen', duplicatePage: 'Seite duplizieren', removePage: 'Seite löschen',
    movePageUp: 'Seite nach oben', movePageDown: 'Seite nach unten', currentPage: 'Aktuelle Seite',
    pageThumbnail: 'Miniatur der Seite {number}', emptyPage: 'leer', frameCount: '{count} Objekt(e)',
    exportMenu: 'Publikation exportieren', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
    exportHtml: 'HTML (umbrechend)', exportHtmlFixed: 'HTML (festes Layout)', exportEpub: 'EPUB 3 (umbrechend)',
    exportEpubFixed: 'EPUB 3 (festes Layout)', exportPackage: 'Publikationspaket (.zip)',
    exportRunning: 'Export läuft: {target}…', exportDone: 'Export geschrieben: {summary}',
    exportFailed: 'Export fehlgeschlagen: {reason}', exportNoWarnings: 'keine Warnungen', exportWarnings: '{count} Warnung(en)',
    exportTarget: 'Exportziel', runExport: 'Export starten',
    paperA4: 'A4 (210 × 297 mm)', paperA3: 'A3 (297 × 420 mm)', paperA5: 'A5 (148 × 210 mm)',
    paperLetter: 'Letter (215,9 × 279,4 mm)', paperCustom: 'Eigenes Format',
    unsupportedEnvironment: 'Diese Umgebung kann keine Dateien ausliefern. Die Exportbytes existieren, wurden aber nicht geschrieben.',
  },
  'es-ES': {
    workspace: 'Paneles de trabajo de Astraea Publish', newDocument: 'Nuevo documento de maquetación', newDocumentTitle: 'Nuevo documento de maquetación',
    newDocumentDescription: 'Crea un documento realmente vacío: sin texto de ejemplo, sin marcos de ejemplo, un maestro vacío.',
    paper: 'Tamaño de papel', orientation: 'Orientación', portrait: 'Vertical', landscape: 'Horizontal',
    pageCount: 'Páginas', margin: 'Margen (mm)', bleed: 'Sangrado (mm)', documentTitle: 'Título del documento',
    create: 'Crear documento', cancel: 'Cancelar',
    created: 'Documento nuevo creado: {summary}', creationFailed: 'No se pudo crear el documento: {reason}',
    pagesPanel: 'Páginas', showPages: 'Mostrar panel de páginas', hidePages: 'Ocultar panel de páginas',
    addPage: 'Añadir página después de la actual', duplicatePage: 'Duplicar página', removePage: 'Eliminar página',
    movePageUp: 'Subir página', movePageDown: 'Bajar página', currentPage: 'Página actual',
    pageThumbnail: 'Miniatura de la página {number}', emptyPage: 'vacía', frameCount: '{count} objeto(s)',
    exportMenu: 'Exportar publicación', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
    exportHtml: 'HTML (refluido)', exportHtmlFixed: 'HTML (maquetación fija)', exportEpub: 'EPUB 3 (refluido)',
    exportEpubFixed: 'EPUB 3 (maquetación fija)', exportPackage: 'Paquete de publicación (.zip)',
    exportRunning: 'Exportación en curso: {target}…', exportDone: 'Exportación escrita: {summary}',
    exportFailed: 'La exportación falló: {reason}', exportNoWarnings: 'sin advertencias', exportWarnings: '{count} advertencia(s)',
    exportTarget: 'Destino de exportación', runExport: 'Iniciar exportación',
    paperA4: 'A4 (210 × 297 mm)', paperA3: 'A3 (297 × 420 mm)', paperA5: 'A5 (148 × 210 mm)',
    paperLetter: 'Letter (215,9 × 279,4 mm)', paperCustom: 'Tamaño personalizado',
    unsupportedEnvironment: 'Este entorno no puede entregar archivos. Los bytes de exportación existen, pero no se escribieron.',
  },
  'it-IT': {
    workspace: 'Pannelli di lavoro di Astraea Publish', newDocument: 'Nuovo documento di impaginazione', newDocumentTitle: 'Nuovo documento di impaginazione',
    newDocumentDescription: 'Crea un documento davvero vuoto: nessun testo di esempio, nessuna cornice di esempio, un master vuoto.',
    paper: 'Formato carta', orientation: 'Orientamento', portrait: 'Verticale', landscape: 'Orizzontale',
    pageCount: 'Pagine', margin: 'Margine (mm)', bleed: 'Abbondanza (mm)', documentTitle: 'Titolo del documento',
    create: 'Crea documento', cancel: 'Annulla',
    created: 'Nuovo documento creato: {summary}', creationFailed: 'Impossibile creare il documento: {reason}',
    pagesPanel: 'Pagine', showPages: 'Mostra pannello pagine', hidePages: 'Nascondi pannello pagine',
    addPage: 'Aggiungi pagina dopo quella corrente', duplicatePage: 'Duplica pagina', removePage: 'Elimina pagina',
    movePageUp: 'Sposta pagina su', movePageDown: 'Sposta pagina giù', currentPage: 'Pagina corrente',
    pageThumbnail: 'Miniatura della pagina {number}', emptyPage: 'vuota', frameCount: '{count} oggetto/i',
    exportMenu: 'Esporta pubblicazione', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
    exportHtml: 'HTML (riflusso)', exportHtmlFixed: 'HTML (layout fisso)', exportEpub: 'EPUB 3 (riflusso)',
    exportEpubFixed: 'EPUB 3 (layout fisso)', exportPackage: 'Pacchetto di pubblicazione (.zip)',
    exportRunning: 'Esportazione in corso: {target}…', exportDone: 'Esportazione scritta: {summary}',
    exportFailed: 'Esportazione non riuscita: {reason}', exportNoWarnings: 'nessun avviso', exportWarnings: '{count} avviso/i',
    exportTarget: 'Destinazione di esportazione', runExport: 'Avvia esportazione',
    paperA4: 'A4 (210 × 297 mm)', paperA3: 'A3 (297 × 420 mm)', paperA5: 'A5 (148 × 210 mm)',
    paperLetter: 'Letter (215,9 × 279,4 mm)', paperCustom: 'Formato personalizzato',
    unsupportedEnvironment: 'Questo ambiente non può consegnare file. I byte di esportazione esistono ma non sono stati scritti.',
  },
  'ja-JP': {
    workspace: 'Astraea Publish ワークスペースパネル', newDocument: '新しいレイアウトドキュメント', newDocumentTitle: '新しいレイアウトドキュメント',
    newDocumentDescription: '本当に空のドキュメントを作成します。サンプルテキストもサンプルフレームもなく、マスターは空です。',
    paper: '用紙サイズ', orientation: '方向', portrait: '縦', landscape: '横',
    pageCount: 'ページ数', margin: '余白 (mm)', bleed: '裁ち落とし (mm)', documentTitle: 'ドキュメント名',
    create: 'ドキュメントを作成', cancel: 'キャンセル',
    created: '新しいドキュメントを作成しました: {summary}', creationFailed: 'ドキュメントを作成できませんでした: {reason}',
    pagesPanel: 'ページ', showPages: 'ページパネルを表示', hidePages: 'ページパネルを非表示',
    addPage: '現在のページの後に追加', duplicatePage: 'ページを複製', removePage: 'ページを削除',
    movePageUp: 'ページを上へ', movePageDown: 'ページを下へ', currentPage: '現在のページ',
    pageThumbnail: 'ページ {number} のサムネイル', emptyPage: '空', frameCount: '{count} 個のオブジェクト',
    exportMenu: '出版物を書き出す', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
    exportHtml: 'HTML (リフロー)', exportHtmlFixed: 'HTML (固定レイアウト)', exportEpub: 'EPUB 3 (リフロー)',
    exportEpubFixed: 'EPUB 3 (固定レイアウト)', exportPackage: '出版物パッケージ (.zip)',
    exportRunning: '書き出し中: {target}…', exportDone: '書き出し完了: {summary}',
    exportFailed: '書き出しに失敗しました: {reason}', exportNoWarnings: '警告なし', exportWarnings: '{count} 件の警告',
    exportTarget: '書き出し先', runExport: '書き出しを実行',
    paperA4: 'A4 (210 × 297 mm)', paperA3: 'A3 (297 × 420 mm)', paperA5: 'A5 (148 × 210 mm)',
    paperLetter: 'Letter (215.9 × 279.4 mm)', paperCustom: 'カスタムサイズ',
    unsupportedEnvironment: 'この環境ではファイルを配布できません。書き出しバイトは生成されましたが、書き込まれていません。',
  },
  'ru-RU': {
    workspace: 'Панели рабочей области Astraea Publish', newDocument: 'Новый документ вёрстки', newDocumentTitle: 'Новый документ вёрстки',
    newDocumentDescription: 'Создаёт действительно пустой документ: без образцов текста, без образцов рамок, с пустым мастером.',
    paper: 'Формат бумаги', orientation: 'Ориентация', portrait: 'Книжная', landscape: 'Альбомная',
    pageCount: 'Страницы', margin: 'Поле (мм)', bleed: 'Вылеты (мм)', documentTitle: 'Название документа',
    create: 'Создать документ', cancel: 'Отмена',
    created: 'Новый документ создан: {summary}', creationFailed: 'Не удалось создать документ: {reason}',
    pagesPanel: 'Страницы', showPages: 'Показать панель страниц', hidePages: 'Скрыть панель страниц',
    addPage: 'Добавить страницу после текущей', duplicatePage: 'Дублировать страницу', removePage: 'Удалить страницу',
    movePageUp: 'Переместить страницу вверх', movePageDown: 'Переместить страницу вниз', currentPage: 'Текущая страница',
    pageThumbnail: 'Миниатюра страницы {number}', emptyPage: 'пусто', frameCount: 'объектов: {count}',
    exportMenu: 'Экспорт публикации', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
    exportHtml: 'HTML (перетекание)', exportHtmlFixed: 'HTML (фиксированная вёрстка)', exportEpub: 'EPUB 3 (перетекание)',
    exportEpubFixed: 'EPUB 3 (фиксированная вёрстка)', exportPackage: 'Пакет публикации (.zip)',
    exportRunning: 'Экспорт выполняется: {target}…', exportDone: 'Экспорт записан: {summary}',
    exportFailed: 'Экспорт не удался: {reason}', exportNoWarnings: 'без предупреждений', exportWarnings: 'предупреждений: {count}',
    exportTarget: 'Цель экспорта', runExport: 'Запустить экспорт',
    paperA4: 'A4 (210 × 297 мм)', paperA3: 'A3 (297 × 420 мм)', paperA5: 'A5 (148 × 210 мм)',
    paperLetter: 'Letter (215,9 × 279,4 мм)', paperCustom: 'Свой размер',
    unsupportedEnvironment: 'Эта среда не может выдать файлы. Байты экспорта созданы, но не записаны.',
  },
  'zh-CN': {
    workspace: 'Astraea Publish 工作区面板', newDocument: '新建版式文档', newDocumentTitle: '新建版式文档',
    newDocumentDescription: '创建一个真正空的文档：没有示例文本，没有示例框架，母版为空。',
    paper: '纸张尺寸', orientation: '方向', portrait: '纵向', landscape: '横向',
    pageCount: '页数', margin: '页边距 (mm)', bleed: '出血 (mm)', documentTitle: '文档标题',
    create: '创建文档', cancel: '取消',
    created: '已创建新文档：{summary}', creationFailed: '无法创建文档：{reason}',
    pagesPanel: '页面', showPages: '显示页面面板', hidePages: '隐藏页面面板',
    addPage: '在当前页之后添加页面', duplicatePage: '复制页面', removePage: '删除页面',
    movePageUp: '上移页面', movePageDown: '下移页面', currentPage: '当前页面',
    pageThumbnail: '第 {number} 页缩略图', emptyPage: '空白', frameCount: '{count} 个对象',
    exportMenu: '导出出版物', exportPdfX4: 'PDF/X-4:2010', exportPdfX1a: 'PDF/X-1a:2001',
    exportHtml: 'HTML（重排）', exportHtmlFixed: 'HTML（固定版式）', exportEpub: 'EPUB 3（重排）',
    exportEpubFixed: 'EPUB 3（固定版式）', exportPackage: '出版物包（.zip）',
    exportRunning: '正在导出：{target}…', exportDone: '导出已写入：{summary}',
    exportFailed: '导出失败：{reason}', exportNoWarnings: '无警告', exportWarnings: '{count} 条警告',
    exportTarget: '导出目标', runExport: '开始导出',
    paperA4: 'A4（210 × 297 mm）', paperA3: 'A3（297 × 420 mm）', paperA5: 'A5（148 × 210 mm）',
    paperLetter: 'Letter（215.9 × 279.4 mm）', paperCustom: '自定义尺寸',
    unsupportedEnvironment: '此环境无法交付文件。导出字节已生成，但未写入。',
  },
};

export function publishWorkspaceText(message: PublishWorkspaceKey, locale: WorkspaceLocale): string {
  return PUBLISH_WORKSPACE_COPY[locale][message];
}

/** Ersetzt `{name}`-Platzhalter und laesst unbekannte stehen — ein fehlender Wert faellt sofort auf. */
export function publishWorkspaceFormat(message: PublishWorkspaceKey, locale: WorkspaceLocale, values: Readonly<Record<string, string | number>>): string {
  let text = publishWorkspaceText(message, locale);
  for (const [key, value] of Object.entries(values)) text = text.split(`{${key}}`).join(String(value));
  return text;
}

const PAPER_KEYS: Record<PublishPaperStandard, PublishWorkspaceKey> = { A4: 'paperA4', A3: 'paperA3', A5: 'paperA5', Letter: 'paperLetter', Custom: 'paperCustom' };
export function publishPaperText(paper: PublishPaperStandard, locale: WorkspaceLocale): string {
  return publishWorkspaceText(PAPER_KEYS[paper], locale);
}

const EXPORT_KEYS: Record<PublishExportTarget, PublishWorkspaceKey> = {
  pdfx1a: 'exportPdfX1a', pdfx4: 'exportPdfX4', html: 'exportHtml', epub: 'exportEpub', package: 'exportPackage',
};
export function publishExportTargetText(target: PublishExportTarget, locale: WorkspaceLocale): string {
  return publishWorkspaceText(EXPORT_KEYS[target], locale);
}
