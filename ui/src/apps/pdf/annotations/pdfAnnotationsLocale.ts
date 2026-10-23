// STATUS: PLATIN — seven-locale copy for PDF Studio review and annotation authoring.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import type { PdfAnnotationReviewStatus, PdfAnnotationType } from '../../../shared/contracts/workspace';

type PdfAnnotationCopy = {
  drawer: Readonly<{
    accessibleName: string;
    heading: (count: number) => string;
    close: string;
    search: string;
    typeFilter: string;
    statusFilter: string;
    pageFilter: string;
    sortFilter: string;
    allTypes: string;
    allStatuses: string;
    allPages: string;
    sort: Readonly<Record<'newest' | 'oldest' | 'page' | 'author' | 'type', string>>;
    hideEditor: string;
    newMark: string;
    summary: string;
    import: string;
    importFailed: string;
    empty: string;
    deleteAnnotation: string;
    reviewStatus: string;
    target: string;
    replacement: string;
    measurement: string;
    metadataOnly: string;
    localReviewer: string;
    unknownTime: string;
    pageAnnotation: (page: number, type: string) => string;
    attachmentBytes: (bytes: number) => string;
    replyPlaceholder: string;
    reply: string;
  }>;
  composer: Readonly<{
    accessibleName: string;
    title: string;
    color: string;
    type: string;
    page: string;
    author: string;
    stampNote: string;
    commentText: string;
    targetText: string;
    replacementText: string;
    shape: string;
    shapes: Readonly<Record<'rectangle' | 'ellipse' | 'line' | 'arrow', string>>;
    stampLabel: string;
    attachment: string;
    attachmentRejected: string;
    measurementValue: string;
    unit: string;
    scale: string;
    drawFreehand: string;
    clearPoints: string;
    capturedPoints: (count: number) => string;
    create: string;
    createFailed: string;
    types: Readonly<Record<Exclude<PdfAnnotationType, 'highlight' | 'underline' | 'strike'>, string>>;
  }>;
  annotationTypes: Readonly<Record<PdfAnnotationType, string>>;
  statuses: Readonly<Record<PdfAnnotationReviewStatus, string>>;
};

export const PDF_ANNOTATION_COPY: Readonly<Record<WorkspaceLocale, PdfAnnotationCopy>> = {
  'en-US': {
    drawer: {
      accessibleName: 'Annotations and review', heading: (count) => `Review (${count})`, close: 'Close review drawer', search: 'Search annotations, authors, replies…',
      typeFilter: 'Filter annotation type', statusFilter: 'Filter annotation status', pageFilter: 'Filter annotation page', sortFilter: 'Sort annotations', allTypes: 'All types', allStatuses: 'All statuses', allPages: 'All pages',
      sort: { newest: 'Newest', oldest: 'Oldest', page: 'Page', author: 'Author', type: 'Type' }, hideEditor: 'Hide editor', newMark: 'New mark', summary: 'Summary', import: 'Import', importFailed: 'The review summary could not be imported.', empty: 'No review annotations match the current filters.',
      deleteAnnotation: 'Delete annotation', reviewStatus: 'Review status', target: 'Target:', replacement: 'Replacement:', measurement: 'Measurement:', metadataOnly: 'Summary metadata only; the binary payload was not imported.', localReviewer: 'Local Reviewer', unknownTime: 'Unknown time', pageAnnotation: (page, type) => `Page ${page} · ${type}`, attachmentBytes: (bytes) => `${bytes} bytes`, replyPlaceholder: 'Reply…', reply: 'Reply',
    },
    composer: {
      accessibleName: 'Create review annotation', title: 'New review annotation', color: 'Annotation color', type: 'Type', page: 'Page', author: 'Author', stampNote: 'Stamp note', commentText: 'Comment / text', targetText: 'Target text', replacementText: 'Replacement text', shape: 'Shape',
      shapes: { rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow' }, stampLabel: 'Custom stamp label', attachment: 'Attach file (max 8 MiB, SHA-256 recorded)', attachmentRejected: 'The attachment was rejected.', measurementValue: 'Value', unit: 'Unit', scale: 'Scale', drawFreehand: 'Draw freehand', clearPoints: 'Clear', capturedPoints: (count) => `${count} points captured (bounded)`, create: 'Add review annotation', createFailed: 'The annotation could not be created.',
      types: { comment: 'Sticky note', 'text-insert': 'Text insertion markup', 'text-replace': 'Text replacement markup', ink: 'Freehand ink', shape: 'Shape / arrow / line', 'text-box': 'Text box', callout: 'Callout', stamp: 'Custom stamp', 'file-attachment': 'File attachment', measurement: 'Measurement' },
    },
    annotationTypes: { highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough', comment: 'Comment', 'text-insert': 'Text insertion', 'text-replace': 'Text replacement', ink: 'Freehand ink', shape: 'Shape', 'text-box': 'Text box', callout: 'Callout', stamp: 'Stamp', 'file-attachment': 'File attachment', measurement: 'Measurement' },
    statuses: { open: 'Open', accepted: 'Accepted', rejected: 'Rejected', completed: 'Completed', cancelled: 'Cancelled' },
  },
  'de-DE': {
    drawer: {
      accessibleName: 'Anmerkungen und Prüfung', heading: (count) => `Prüfung (${count})`, close: 'Prüfbereich schließen', search: 'Anmerkungen, Personen und Antworten suchen…',
      typeFilter: 'Anmerkungstyp filtern', statusFilter: 'Anmerkungsstatus filtern', pageFilter: 'Anmerkungsseite filtern', sortFilter: 'Anmerkungen sortieren', allTypes: 'Alle Typen', allStatuses: 'Alle Status', allPages: 'Alle Seiten',
      sort: { newest: 'Neueste', oldest: 'Älteste', page: 'Seite', author: 'Person', type: 'Typ' }, hideEditor: 'Editor ausblenden', newMark: 'Neue Markierung', summary: 'Übersicht', import: 'Importieren', importFailed: 'Die Prüfungsübersicht konnte nicht importiert werden.', empty: 'Keine Anmerkungen entsprechen den aktuellen Filtern.',
      deleteAnnotation: 'Anmerkung löschen', reviewStatus: 'Prüfstatus', target: 'Zieltext:', replacement: 'Ersatztext:', measurement: 'Messwert:', metadataOnly: 'Nur Übersichtsmetadaten; die Binärdaten wurden nicht importiert.', localReviewer: 'Lokale Prüfung', unknownTime: 'Unbekannte Zeit', pageAnnotation: (page, type) => `Seite ${page} · ${type}`, attachmentBytes: (bytes) => `${bytes} Byte`, replyPlaceholder: 'Antwort…', reply: 'Antworten',
    },
    composer: {
      accessibleName: 'Prüfungsanmerkung erstellen', title: 'Neue Prüfungsanmerkung', color: 'Anmerkungsfarbe', type: 'Typ', page: 'Seite', author: 'Person', stampNote: 'Stempelnotiz', commentText: 'Kommentar / Text', targetText: 'Zieltext', replacementText: 'Ersatztext', shape: 'Form',
      shapes: { rectangle: 'Rechteck', ellipse: 'Ellipse', line: 'Linie', arrow: 'Pfeil' }, stampLabel: 'Benutzerdefinierter Stempeltext', attachment: 'Datei anhängen (max. 8 MiB, SHA-256 wird erfasst)', attachmentRejected: 'Der Anhang wurde abgelehnt.', measurementValue: 'Wert', unit: 'Einheit', scale: 'Maßstab', drawFreehand: 'Freihändig zeichnen', clearPoints: 'Löschen', capturedPoints: (count) => `${count} Punkte erfasst (begrenzt)`, create: 'Prüfungsanmerkung hinzufügen', createFailed: 'Die Anmerkung konnte nicht erstellt werden.',
      types: { comment: 'Haftnotiz', 'text-insert': 'Texteinfügung', 'text-replace': 'Textersetzung', ink: 'Freihandzeichnung', shape: 'Form / Pfeil / Linie', 'text-box': 'Textfeld', callout: 'Sprechblase', stamp: 'Benutzerdefinierter Stempel', 'file-attachment': 'Dateianhang', measurement: 'Messung' },
    },
    annotationTypes: { highlight: 'Hervorhebung', underline: 'Unterstreichung', strike: 'Durchstreichung', comment: 'Kommentar', 'text-insert': 'Texteinfügung', 'text-replace': 'Textersetzung', ink: 'Freihandzeichnung', shape: 'Form', 'text-box': 'Textfeld', callout: 'Sprechblase', stamp: 'Stempel', 'file-attachment': 'Dateianhang', measurement: 'Messung' },
    statuses: { open: 'Offen', accepted: 'Angenommen', rejected: 'Abgelehnt', completed: 'Abgeschlossen', cancelled: 'Abgebrochen' },
  },
  'ru-RU': {
    drawer: {
      accessibleName: 'Аннотации и проверка', heading: (count) => `Проверка (${count})`, close: 'Закрыть панель проверки', search: 'Поиск аннотаций, авторов и ответов…',
      typeFilter: 'Фильтр по типу аннотации', statusFilter: 'Фильтр по статусу аннотации', pageFilter: 'Фильтр по странице аннотации', sortFilter: 'Сортировка аннотаций', allTypes: 'Все типы', allStatuses: 'Все статусы', allPages: 'Все страницы',
      sort: { newest: 'Сначала новые', oldest: 'Сначала старые', page: 'Страница', author: 'Автор', type: 'Тип' }, hideEditor: 'Скрыть редактор', newMark: 'Новая пометка', summary: 'Сводка', import: 'Импортировать', importFailed: 'Не удалось импортировать сводку проверки.', empty: 'Нет аннотаций, соответствующих текущим фильтрам.',
      deleteAnnotation: 'Удалить аннотацию', reviewStatus: 'Статус проверки', target: 'Исходный текст:', replacement: 'Замена:', measurement: 'Измерение:', metadataOnly: 'Только метаданные сводки; двоичные данные не импортированы.', localReviewer: 'Локальный проверяющий', unknownTime: 'Время неизвестно', pageAnnotation: (page, type) => `Страница ${page} · ${type}`, attachmentBytes: (bytes) => `${bytes} байт`, replyPlaceholder: 'Ответить…', reply: 'Ответить',
    },
    composer: {
      accessibleName: 'Создать аннотацию проверки', title: 'Новая аннотация проверки', color: 'Цвет аннотации', type: 'Тип', page: 'Страница', author: 'Автор', stampNote: 'Заметка штампа', commentText: 'Комментарий / текст', targetText: 'Исходный текст', replacementText: 'Текст замены', shape: 'Фигура',
      shapes: { rectangle: 'Прямоугольник', ellipse: 'Эллипс', line: 'Линия', arrow: 'Стрелка' }, stampLabel: 'Текст пользовательского штампа', attachment: 'Прикрепить файл (до 8 МиБ, записывается SHA-256)', attachmentRejected: 'Вложение отклонено.', measurementValue: 'Значение', unit: 'Единица', scale: 'Масштаб', drawFreehand: 'Рисовать от руки', clearPoints: 'Очистить', capturedPoints: (count) => `Захвачено точек: ${count} (ограничено)`, create: 'Добавить аннотацию проверки', createFailed: 'Не удалось создать аннотацию.',
      types: { comment: 'Заметка', 'text-insert': 'Вставка текста', 'text-replace': 'Замена текста', ink: 'Рисунок от руки', shape: 'Фигура / стрелка / линия', 'text-box': 'Текстовое поле', callout: 'Выноска', stamp: 'Пользовательский штамп', 'file-attachment': 'Файловое вложение', measurement: 'Измерение' },
    },
    annotationTypes: { highlight: 'Выделение', underline: 'Подчёркивание', strike: 'Зачёркивание', comment: 'Комментарий', 'text-insert': 'Вставка текста', 'text-replace': 'Замена текста', ink: 'Рисунок от руки', shape: 'Фигура', 'text-box': 'Текстовое поле', callout: 'Выноска', stamp: 'Штамп', 'file-attachment': 'Файловое вложение', measurement: 'Измерение' },
    statuses: { open: 'Открыто', accepted: 'Принято', rejected: 'Отклонено', completed: 'Завершено', cancelled: 'Отменено' },
  },
  'it-IT': {
    drawer: {
      accessibleName: 'Annotazioni e revisione', heading: (count) => `Revisione (${count})`, close: 'Chiudi pannello di revisione', search: 'Cerca annotazioni, autori e risposte…',
      typeFilter: 'Filtra per tipo di annotazione', statusFilter: 'Filtra per stato dell’annotazione', pageFilter: 'Filtra per pagina dell’annotazione', sortFilter: 'Ordina annotazioni', allTypes: 'Tutti i tipi', allStatuses: 'Tutti gli stati', allPages: 'Tutte le pagine',
      sort: { newest: 'Più recenti', oldest: 'Meno recenti', page: 'Pagina', author: 'Autore', type: 'Tipo' }, hideEditor: 'Nascondi editor', newMark: 'Nuova annotazione', summary: 'Riepilogo', import: 'Importa', importFailed: 'Impossibile importare il riepilogo della revisione.', empty: 'Nessuna annotazione corrisponde ai filtri correnti.',
      deleteAnnotation: 'Elimina annotazione', reviewStatus: 'Stato revisione', target: 'Testo di origine:', replacement: 'Sostituzione:', measurement: 'Misura:', metadataOnly: 'Solo metadati del riepilogo; il contenuto binario non è stato importato.', localReviewer: 'Revisore locale', unknownTime: 'Ora sconosciuta', pageAnnotation: (page, type) => `Pagina ${page} · ${type}`, attachmentBytes: (bytes) => `${bytes} byte`, replyPlaceholder: 'Rispondi…', reply: 'Rispondi',
    },
    composer: {
      accessibleName: 'Crea annotazione di revisione', title: 'Nuova annotazione di revisione', color: 'Colore annotazione', type: 'Tipo', page: 'Pagina', author: 'Autore', stampNote: 'Nota timbro', commentText: 'Commento / testo', targetText: 'Testo di origine', replacementText: 'Testo sostitutivo', shape: 'Forma',
      shapes: { rectangle: 'Rettangolo', ellipse: 'Ellisse', line: 'Linea', arrow: 'Freccia' }, stampLabel: 'Etichetta timbro personalizzata', attachment: 'Allega file (max 8 MiB, SHA-256 registrato)', attachmentRejected: 'Allegato rifiutato.', measurementValue: 'Valore', unit: 'Unità', scale: 'Scala', drawFreehand: 'Disegno a mano libera', clearPoints: 'Cancella', capturedPoints: (count) => `${count} punti acquisiti (limite applicato)`, create: 'Aggiungi annotazione di revisione', createFailed: 'Impossibile creare l’annotazione.',
      types: { comment: 'Nota adesiva', 'text-insert': 'Inserimento testo', 'text-replace': 'Sostituzione testo', ink: 'Disegno a mano libera', shape: 'Forma / freccia / linea', 'text-box': 'Casella di testo', callout: 'Richiamo', stamp: 'Timbro personalizzato', 'file-attachment': 'Allegato', measurement: 'Misura' },
    },
    annotationTypes: { highlight: 'Evidenziazione', underline: 'Sottolineatura', strike: 'Barrato', comment: 'Commento', 'text-insert': 'Inserimento testo', 'text-replace': 'Sostituzione testo', ink: 'Disegno a mano libera', shape: 'Forma', 'text-box': 'Casella di testo', callout: 'Richiamo', stamp: 'Timbro', 'file-attachment': 'Allegato', measurement: 'Misura' },
    statuses: { open: 'Aperto', accepted: 'Accettato', rejected: 'Rifiutato', completed: 'Completato', cancelled: 'Annullato' },
  },
  'es-ES': {
    drawer: {
      accessibleName: 'Anotaciones y revisión', heading: (count) => `Revisión (${count})`, close: 'Cerrar panel de revisión', search: 'Buscar anotaciones, autores y respuestas…',
      typeFilter: 'Filtrar por tipo de anotación', statusFilter: 'Filtrar por estado de anotación', pageFilter: 'Filtrar por página de anotación', sortFilter: 'Ordenar anotaciones', allTypes: 'Todos los tipos', allStatuses: 'Todos los estados', allPages: 'Todas las páginas',
      sort: { newest: 'Más recientes', oldest: 'Más antiguas', page: 'Página', author: 'Autor', type: 'Tipo' }, hideEditor: 'Ocultar editor', newMark: 'Nueva marca', summary: 'Resumen', import: 'Importar', importFailed: 'No se pudo importar el resumen de revisión.', empty: 'Ninguna anotación coincide con los filtros actuales.',
      deleteAnnotation: 'Eliminar anotación', reviewStatus: 'Estado de revisión', target: 'Texto de destino:', replacement: 'Reemplazo:', measurement: 'Medición:', metadataOnly: 'Solo metadatos del resumen; no se importó el contenido binario.', localReviewer: 'Revisor local', unknownTime: 'Hora desconocida', pageAnnotation: (page, type) => `Página ${page} · ${type}`, attachmentBytes: (bytes) => `${bytes} bytes`, replyPlaceholder: 'Responder…', reply: 'Responder',
    },
    composer: {
      accessibleName: 'Crear anotación de revisión', title: 'Nueva anotación de revisión', color: 'Color de anotación', type: 'Tipo', page: 'Página', author: 'Autor', stampNote: 'Nota del sello', commentText: 'Comentario / texto', targetText: 'Texto de destino', replacementText: 'Texto de reemplazo', shape: 'Forma',
      shapes: { rectangle: 'Rectángulo', ellipse: 'Elipse', line: 'Línea', arrow: 'Flecha' }, stampLabel: 'Etiqueta de sello personalizada', attachment: 'Adjuntar archivo (máx. 8 MiB, SHA-256 registrado)', attachmentRejected: 'Se rechazó el archivo adjunto.', measurementValue: 'Valor', unit: 'Unidad', scale: 'Escala', drawFreehand: 'Dibujar a mano alzada', clearPoints: 'Borrar', capturedPoints: (count) => `${count} puntos capturados (con límite)`, create: 'Añadir anotación de revisión', createFailed: 'No se pudo crear la anotación.',
      types: { comment: 'Nota adhesiva', 'text-insert': 'Inserción de texto', 'text-replace': 'Reemplazo de texto', ink: 'Tinta a mano alzada', shape: 'Forma / flecha / línea', 'text-box': 'Cuadro de texto', callout: 'Llamada', stamp: 'Sello personalizado', 'file-attachment': 'Archivo adjunto', measurement: 'Medición' },
    },
    annotationTypes: { highlight: 'Resaltado', underline: 'Subrayado', strike: 'Tachado', comment: 'Comentario', 'text-insert': 'Inserción de texto', 'text-replace': 'Reemplazo de texto', ink: 'Tinta a mano alzada', shape: 'Forma', 'text-box': 'Cuadro de texto', callout: 'Llamada', stamp: 'Sello', 'file-attachment': 'Archivo adjunto', measurement: 'Medición' },
    statuses: { open: 'Abierto', accepted: 'Aceptado', rejected: 'Rechazado', completed: 'Completado', cancelled: 'Cancelado' },
  },
  'ja-JP': {
    drawer: {
      accessibleName: '注釈とレビュー', heading: (count) => `レビュー (${count})`, close: 'レビューパネルを閉じる', search: '注釈、作成者、返信を検索…',
      typeFilter: '注釈の種類で絞り込む', statusFilter: '注釈の状態で絞り込む', pageFilter: '注釈のページで絞り込む', sortFilter: '注釈を並べ替え', allTypes: 'すべての種類', allStatuses: 'すべての状態', allPages: 'すべてのページ',
      sort: { newest: '新しい順', oldest: '古い順', page: 'ページ', author: '作成者', type: '種類' }, hideEditor: 'エディターを非表示', newMark: '新しいマーク', summary: '概要', import: 'インポート', importFailed: 'レビュー概要をインポートできませんでした。', empty: '現在の条件に一致する注釈はありません。',
      deleteAnnotation: '注釈を削除', reviewStatus: 'レビュー状態', target: '対象テキスト:', replacement: '置換後:', measurement: '測定値:', metadataOnly: '概要メタデータのみです。バイナリデータはインポートされませんでした。', localReviewer: 'ローカルレビュー担当者', unknownTime: '時刻不明', pageAnnotation: (page, type) => `ページ ${page} · ${type}`, attachmentBytes: (bytes) => `${bytes} バイト`, replyPlaceholder: '返信…', reply: '返信',
    },
    composer: {
      accessibleName: 'レビュー注釈を作成', title: '新しいレビュー注釈', color: '注釈の色', type: '種類', page: 'ページ', author: '作成者', stampNote: 'スタンプのメモ', commentText: 'コメント / テキスト', targetText: '対象テキスト', replacementText: '置換テキスト', shape: '図形',
      shapes: { rectangle: '長方形', ellipse: '楕円', line: '線', arrow: '矢印' }, stampLabel: 'カスタムスタンプのラベル', attachment: 'ファイルを添付 (最大 8 MiB、SHA-256 を記録)', attachmentRejected: '添付ファイルは拒否されました。', measurementValue: '値', unit: '単位', scale: '縮尺', drawFreehand: 'フリーハンドで描画', clearPoints: '消去', capturedPoints: (count) => `${count} 点を取得 (上限あり)`, create: 'レビュー注釈を追加', createFailed: '注釈を作成できませんでした。',
      types: { comment: '付箋', 'text-insert': 'テキスト挿入マークアップ', 'text-replace': 'テキスト置換マークアップ', ink: 'フリーハンド描画', shape: '図形 / 矢印 / 線', 'text-box': 'テキストボックス', callout: '吹き出し', stamp: 'カスタムスタンプ', 'file-attachment': 'ファイル添付', measurement: '測定' },
    },
    annotationTypes: { highlight: 'ハイライト', underline: '下線', strike: '取り消し線', comment: 'コメント', 'text-insert': 'テキスト挿入', 'text-replace': 'テキスト置換', ink: 'フリーハンド描画', shape: '図形', 'text-box': 'テキストボックス', callout: '吹き出し', stamp: 'スタンプ', 'file-attachment': 'ファイル添付', measurement: '測定' },
    statuses: { open: '未対応', accepted: '承認済み', rejected: '却下', completed: '完了', cancelled: 'キャンセル済み' },
  },
  'zh-CN': {
    drawer: {
      accessibleName: '批注和审阅', heading: (count) => `审阅（${count}）`, close: '关闭审阅面板', search: '搜索批注、作者和回复…',
      typeFilter: '按批注类型筛选', statusFilter: '按批注状态筛选', pageFilter: '按批注页码筛选', sortFilter: '排序批注', allTypes: '所有类型', allStatuses: '所有状态', allPages: '所有页',
      sort: { newest: '最新', oldest: '最早', page: '页码', author: '作者', type: '类型' }, hideEditor: '隐藏编辑器', newMark: '新建标记', summary: '摘要', import: '导入', importFailed: '无法导入审阅摘要。', empty: '没有符合当前筛选条件的审阅批注。',
      deleteAnnotation: '删除批注', reviewStatus: '审阅状态', target: '目标文本：', replacement: '替换文本：', measurement: '测量值：', metadataOnly: '仅导入了摘要元数据；未导入二进制内容。', localReviewer: '本地审阅者', unknownTime: '时间未知', pageAnnotation: (page, type) => `第 ${page} 页 · ${type}`, attachmentBytes: (bytes) => `${bytes} 字节`, replyPlaceholder: '回复…', reply: '回复',
    },
    composer: {
      accessibleName: '创建审阅批注', title: '新建审阅批注', color: '批注颜色', type: '类型', page: '页码', author: '作者', stampNote: '印章备注', commentText: '评论 / 文本', targetText: '目标文本', replacementText: '替换文本', shape: '形状',
      shapes: { rectangle: '矩形', ellipse: '椭圆', line: '直线', arrow: '箭头' }, stampLabel: '自定义印章标签', attachment: '附加文件（最多 8 MiB，记录 SHA-256）', attachmentRejected: '附件已被拒绝。', measurementValue: '数值', unit: '单位', scale: '比例', drawFreehand: '手绘', clearPoints: '清除', capturedPoints: (count) => `已采集 ${count} 个点（有上限）`, create: '添加审阅批注', createFailed: '无法创建批注。',
      types: { comment: '便笺', 'text-insert': '文本插入标记', 'text-replace': '文本替换标记', ink: '手绘墨迹', shape: '形状 / 箭头 / 直线', 'text-box': '文本框', callout: '标注', stamp: '自定义印章', 'file-attachment': '文件附件', measurement: '测量' },
    },
    annotationTypes: { highlight: '高亮', underline: '下划线', strike: '删除线', comment: '评论', 'text-insert': '文本插入', 'text-replace': '文本替换', ink: '手绘墨迹', shape: '形状', 'text-box': '文本框', callout: '标注', stamp: '印章', 'file-attachment': '文件附件', measurement: '测量' },
    statuses: { open: '待处理', accepted: '已接受', rejected: '已拒绝', completed: '已完成', cancelled: '已取消' },
  },
};

/** Deliberately discard parser and filesystem details at the UI boundary. */
export function pdfReviewImportFailureCopy(locale: WorkspaceLocale, _cause: unknown): string {
  return PDF_ANNOTATION_COPY[locale].drawer.importFailed;
}
