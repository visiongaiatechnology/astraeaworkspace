// STATUS: PLATIN — localized PDF Studio toolbar controls, actions, and accessible names.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

export type PdfSecondaryActionId =
  | 'contentEditor' | 'formFiller' | 'assembler' | 'ocr' | 'workspaceLinks' | 'compare' | 'convert'
  | 'redactAll' | 'redactionExport' | 'signatureStamp' | 'digitalSignature' | 'passwordProtection'
  | 'removeMetadata' | 'redactionAudit' | 'optimize' | 'diagnostics';

type PdfToolbarCopy = {
  document: string;
  pageNavigation: string;
  previousPage: string;
  nextPage: string;
  pagePosition: (current: number, total: number) => string;
  editHistory: string;
  undoTitle: string;
  undoAria: string;
  redoTitle: string;
  redoAria: string;
  annotationTools: string;
  select: string;
  highlight: string;
  highlightSelection: string;
  highlightColor: (name: string) => string;
  highlightColors: Readonly<Record<'#f59e0b' | '#10b981' | '#3b82f6' | '#ec4899', string>>;
  underline: string;
  underlineSelection: string;
  strike: string;
  strikeSelection: string;
  comment: string;
  addComment: string;
  redact: string;
  redactSelected: (count: number) => string;
  redactTitle: string;
  moreTools: string;
  more: string;
  pdfTools: string;
  moreDescription: string;
  groupEdit: string;
  groupProtect: string;
  groupReview: string;
  annotations: string;
  exportPdf: string;
  exportPdfAria: string;
  zoomPresets: string;
  zoomOut: string;
  zoomIn: string;
  currentZoom: (level: number) => string;
  setZoom: (level: number) => string;
  actions: Readonly<Record<PdfSecondaryActionId, { label: string; description: string }>>;
};

export const PDF_TOOLBAR_COPY: Readonly<Record<WorkspaceLocale, PdfToolbarCopy>> = {
  'en-US': {
    document: 'PDF document', pageNavigation: 'PDF page navigation', previousPage: 'Previous page', nextPage: 'Next page', pagePosition: (current, total) => `Page ${current} of ${total}`,
    editHistory: 'PDF edit history', undoTitle: 'Undo (Ctrl+Z)', undoAria: 'Undo last PDF Studio edit', redoTitle: 'Redo (Ctrl+Shift+Z)', redoAria: 'Redo last PDF Studio edit', annotationTools: 'PDF annotation tools',
    select: 'Select', highlight: 'Highlight', highlightSelection: 'Highlight selection', highlightColor: (name) => `Set PDF highlight color to ${name}`,
    highlightColors: { '#f59e0b': 'Amber', '#10b981': 'Emerald', '#3b82f6': 'Blue', '#ec4899': 'Rose' }, underline: 'Underline', underlineSelection: 'Underline selection', strike: 'Strike', strikeSelection: 'Strike through selection',
    comment: 'Comment', addComment: 'Add comment or sticky note', redact: 'Redact', redactSelected: (count) => `Redact selected content${count > 0 ? `, ${count} staged` : ''}`,
    redactTitle: 'Remove selected content from the structured model and future exports', moreTools: 'More PDF tools', more: 'More', pdfTools: 'PDF tools', moreDescription: 'Open the tools you need; the main document bar stays focused.',
    groupEdit: 'Edit and organize', groupProtect: 'Protect and sign', groupReview: 'Review and output', annotations: 'Annotations and comments panel', exportPdf: 'Export PDF', exportPdfAria: 'Export edited structured PDF',
    zoomPresets: 'PDF zoom presets', zoomOut: 'Zoom out', zoomIn: 'Zoom in', currentZoom: (level) => `Current PDF zoom ${level}%`, setZoom: (level) => `Set PDF zoom to ${level}%`,
    actions: {
      contentEditor: { label: 'Edit content', description: 'Edit structured text, images, vector objects, and links.' },
      formFiller: { label: 'Fill form', description: 'Complete interactive PDF form fields.' },
      assembler: { label: 'Assemble pages', description: 'Reorder, extract, insert, and watermark pages.' },
      ocr: { label: 'OCR', description: 'Run local OCR and create searchable text.' },
      workspaceLinks: { label: 'Workspace links', description: 'Manage links to other local Workspace documents.' },
      compare: { label: 'Compare', description: 'Compare this structured PDF with another document.' },
      convert: { label: 'Convert', description: 'Convert structured PDF content to Office, HTML, or text.' },
      redactAll: { label: 'Find and redact text', description: 'Search the document and irreversibly redact matching content.' },
      redactionExport: { label: 'Verified redaction export', description: 'Export with hidden-content sanitization and redaction verification.' },
      signatureStamp: { label: 'Signature stamp', description: 'Add a visual signature stamp; this is not a cryptographic signature.' },
      digitalSignature: { label: 'Sign PDF', description: 'Create a cryptographic X.509/CMS PDF signature.' },
      passwordProtection: { label: 'Password protection', description: 'Protect an exported PDF with AES-256 passwords.' },
      removeMetadata: { label: 'Remove metadata', description: 'Inspect and scrub PDF metadata.' },
      redactionAudit: { label: 'Redaction audit', description: 'Review the structured redaction audit report.' },
      optimize: { label: 'Optimize', description: 'Review and optimize structured PDF output.' },
      diagnostics: { label: 'Diagnostics', description: 'Run PDF diagnostics and preflight checks.' },
    },
  },
  'de-DE': {
    document: 'PDF-Dokument', pageNavigation: 'PDF-Seitennavigation', previousPage: 'Vorherige Seite', nextPage: 'Nächste Seite', pagePosition: (current, total) => `Seite ${current} von ${total}`,
    editHistory: 'PDF-Bearbeitungsverlauf', undoTitle: 'Rückgängig (Strg+Z)', undoAria: 'Letzte PDF-Studio-Bearbeitung rückgängig machen', redoTitle: 'Wiederholen (Strg+Umschalt+Z)', redoAria: 'Letzte PDF-Studio-Bearbeitung wiederholen', annotationTools: 'PDF-Kommentierungswerkzeuge',
    select: 'Auswählen', highlight: 'Markieren', highlightSelection: 'Auswahl hervorheben', highlightColor: (name) => `PDF-Markierungsfarbe festlegen: ${name}`,
    highlightColors: { '#f59e0b': 'Bernstein', '#10b981': 'Smaragd', '#3b82f6': 'Blau', '#ec4899': 'Rosa' }, underline: 'Unterstreichen', underlineSelection: 'Auswahl unterstreichen', strike: 'Durchstreichen', strikeSelection: 'Auswahl durchstreichen',
    comment: 'Kommentar', addComment: 'Kommentar oder Haftnotiz hinzufügen', redact: 'Schwärzen', redactSelected: (count) => `Auswahl schwärzen${count > 0 ? `, ${count} vorgemerkt` : ''}`,
    redactTitle: 'Ausgewählte Inhalte aus dem strukturierten Modell und künftigen Exporten entfernen', moreTools: 'Weitere PDF-Werkzeuge', more: 'Mehr', pdfTools: 'PDF-Werkzeuge', moreDescription: 'Öffne benötigte Werkzeuge; die Dokumentleiste bleibt übersichtlich.',
    groupEdit: 'Bearbeiten und organisieren', groupProtect: 'Schützen und signieren', groupReview: 'Prüfen und ausgeben', annotations: 'Bereich für Anmerkungen und Kommentare', exportPdf: 'PDF exportieren', exportPdfAria: 'Bearbeitetes strukturiertes PDF exportieren',
    zoomPresets: 'PDF-Zoomstufen', zoomOut: 'Verkleinern', zoomIn: 'Vergrößern', currentZoom: (level) => `Aktueller PDF-Zoom ${level} %`, setZoom: (level) => `PDF-Zoom auf ${level} % setzen`,
    actions: {
      contentEditor: { label: 'Inhalt bearbeiten', description: 'Strukturierten Text, Bilder, Vektorobjekte und Links bearbeiten.' },
      formFiller: { label: 'Formular ausfüllen', description: 'Interaktive PDF-Formularfelder ausfüllen.' },
      assembler: { label: 'Seiten zusammenstellen', description: 'Seiten neu anordnen, entnehmen, einfügen und mit Wasserzeichen versehen.' },
      ocr: { label: 'OCR', description: 'Lokale OCR ausführen und durchsuchbaren Text erstellen.' },
      workspaceLinks: { label: 'Workspace-Verknüpfungen', description: 'Verknüpfungen zu anderen lokalen Workspace-Dokumenten verwalten.' },
      compare: { label: 'Vergleichen', description: 'Dieses strukturierte PDF mit einem anderen Dokument vergleichen.' },
      convert: { label: 'Konvertieren', description: 'Strukturierte PDF-Inhalte in Office, HTML oder Text umwandeln.' },
      redactAll: { label: 'Text suchen und schwärzen', description: 'Dokument durchsuchen und passende Inhalte dauerhaft schwärzen.' },
      redactionExport: { label: 'Geprüfter Schwärzungsexport', description: 'Mit Bereinigung verborgener Inhalte und Schwärzungsprüfung exportieren.' },
      signatureStamp: { label: 'Unterschriftsstempel', description: 'Sichtbaren Unterschriftsstempel hinzufügen; keine kryptografische Signatur.' },
      digitalSignature: { label: 'PDF signieren', description: 'Kryptografische X.509/CMS-PDF-Signatur erstellen.' },
      passwordProtection: { label: 'Passwortschutz', description: 'Exportiertes PDF mit AES-256-Passwörtern schützen.' },
      removeMetadata: { label: 'Metadaten entfernen', description: 'PDF-Metadaten prüfen und bereinigen.' },
      redactionAudit: { label: 'Schwärzungsprüfung', description: 'Strukturierten Prüfbericht zur Schwärzung anzeigen.' },
      optimize: { label: 'Optimieren', description: 'Strukturierte PDF-Ausgabe prüfen und optimieren.' },
      diagnostics: { label: 'Diagnose', description: 'PDF-Diagnose und Vorabprüfungen ausführen.' },
    },
  },
  'es-ES': {
    document: 'Documento PDF', pageNavigation: 'Navegación de páginas PDF', previousPage: 'Página anterior', nextPage: 'Página siguiente', pagePosition: (current, total) => `Página ${current} de ${total}`,
    editHistory: 'Historial de edición PDF', undoTitle: 'Deshacer (Ctrl+Z)', undoAria: 'Deshacer la última edición de PDF Studio', redoTitle: 'Rehacer (Ctrl+Mayús+Z)', redoAria: 'Rehacer la última edición de PDF Studio', annotationTools: 'Herramientas de anotación PDF',
    select: 'Seleccionar', highlight: 'Resaltar', highlightSelection: 'Resaltar selección', highlightColor: (name) => `Establecer color de resaltado PDF: ${name}`,
    highlightColors: { '#f59e0b': 'Ámbar', '#10b981': 'Esmeralda', '#3b82f6': 'Azul', '#ec4899': 'Rosa' }, underline: 'Subrayar', underlineSelection: 'Subrayar selección', strike: 'Tachar', strikeSelection: 'Tachar selección',
    comment: 'Comentario', addComment: 'Añadir comentario o nota', redact: 'Ocultar', redactSelected: (count) => `Ocultar contenido seleccionado${count > 0 ? `, ${count} preparado(s)` : ''}`,
    redactTitle: 'Eliminar el contenido seleccionado del modelo estructurado y de futuras exportaciones', moreTools: 'Más herramientas PDF', more: 'Más', pdfTools: 'Herramientas PDF', moreDescription: 'Abre las herramientas necesarias; la barra principal se mantiene despejada.',
    groupEdit: 'Editar y organizar', groupProtect: 'Proteger y firmar', groupReview: 'Revisar y exportar', annotations: 'Panel de anotaciones y comentarios', exportPdf: 'Exportar PDF', exportPdfAria: 'Exportar PDF estructurado editado',
    zoomPresets: 'Niveles de zoom PDF', zoomOut: 'Reducir zoom', zoomIn: 'Ampliar zoom', currentZoom: (level) => `Zoom PDF actual: ${level} %`, setZoom: (level) => `Establecer zoom PDF en ${level} %`,
    actions: {
      contentEditor: { label: 'Editar contenido', description: 'Editar texto estructurado, imágenes, objetos vectoriales y enlaces.' },
      formFiller: { label: 'Rellenar formulario', description: 'Completar campos interactivos del formulario PDF.' },
      assembler: { label: 'Organizar páginas', description: 'Reordenar, extraer, insertar y aplicar marcas de agua a páginas.' },
      ocr: { label: 'OCR', description: 'Ejecutar OCR local y crear texto que se pueda buscar.' },
      workspaceLinks: { label: 'Enlaces de Workspace', description: 'Administrar enlaces a otros documentos locales de Workspace.' },
      compare: { label: 'Comparar', description: 'Comparar este PDF estructurado con otro documento.' },
      convert: { label: 'Convertir', description: 'Convertir contenido PDF estructurado a Office, HTML o texto.' },
      redactAll: { label: 'Buscar y ocultar texto', description: 'Buscar en el documento y ocultar irreversiblemente el contenido coincidente.' },
      redactionExport: { label: 'Exportación de ocultación verificada', description: 'Exportar con limpieza de contenido oculto y verificación de ocultaciones.' },
      signatureStamp: { label: 'Sello de firma', description: 'Añadir un sello visual de firma; no es una firma criptográfica.' },
      digitalSignature: { label: 'Firmar PDF', description: 'Crear una firma PDF criptográfica X.509/CMS.' },
      passwordProtection: { label: 'Protección con contraseña', description: 'Proteger el PDF exportado con contraseñas AES-256.' },
      removeMetadata: { label: 'Eliminar metadatos', description: 'Inspeccionar y limpiar los metadatos del PDF.' },
      redactionAudit: { label: 'Auditoría de ocultaciones', description: 'Revisar el informe estructurado de auditoría de ocultaciones.' },
      optimize: { label: 'Optimizar', description: 'Revisar y optimizar la salida PDF estructurada.' },
      diagnostics: { label: 'Diagnóstico', description: 'Ejecutar diagnósticos PDF y comprobaciones previas.' },
    },
  },
  'it-IT': {
    document: 'Documento PDF', pageNavigation: 'Navigazione pagine PDF', previousPage: 'Pagina precedente', nextPage: 'Pagina successiva', pagePosition: (current, total) => `Pagina ${current} di ${total}`,
    editHistory: 'Cronologia modifiche PDF', undoTitle: 'Annulla (Ctrl+Z)', undoAria: 'Annulla l’ultima modifica PDF Studio', redoTitle: 'Ripeti (Ctrl+Maiusc+Z)', redoAria: 'Ripeti l’ultima modifica PDF Studio', annotationTools: 'Strumenti di annotazione PDF',
    select: 'Seleziona', highlight: 'Evidenzia', highlightSelection: 'Evidenzia selezione', highlightColor: (name) => `Imposta colore evidenziatore PDF: ${name}`,
    highlightColors: { '#f59e0b': 'Ambra', '#10b981': 'Smeraldo', '#3b82f6': 'Blu', '#ec4899': 'Rosa' }, underline: 'Sottolinea', underlineSelection: 'Sottolinea selezione', strike: 'Barrato', strikeSelection: 'Barratura selezione',
    comment: 'Commento', addComment: 'Aggiungi commento o nota', redact: 'Oscura', redactSelected: (count) => `Oscura contenuto selezionato${count > 0 ? `, ${count} in attesa` : ''}`,
    redactTitle: 'Rimuovi il contenuto selezionato dal modello strutturato e dalle esportazioni future', moreTools: 'Altri strumenti PDF', more: 'Altro', pdfTools: 'Strumenti PDF', moreDescription: 'Apri gli strumenti necessari; la barra del documento resta essenziale.',
    groupEdit: 'Modifica e organizza', groupProtect: 'Proteggi e firma', groupReview: 'Rivedi ed esporta', annotations: 'Pannello annotazioni e commenti', exportPdf: 'Esporta PDF', exportPdfAria: 'Esporta PDF strutturato modificato',
    zoomPresets: 'Livelli zoom PDF', zoomOut: 'Riduci zoom', zoomIn: 'Aumenta zoom', currentZoom: (level) => `Zoom PDF attuale ${level} %`, setZoom: (level) => `Imposta zoom PDF al ${level} %`,
    actions: {
      contentEditor: { label: 'Modifica contenuto', description: 'Modifica testo strutturato, immagini, oggetti vettoriali e collegamenti.' },
      formFiller: { label: 'Compila modulo', description: 'Compila i campi interattivi del modulo PDF.' },
      assembler: { label: 'Organizza pagine', description: 'Riordina, estrai, inserisci e aggiungi filigrane alle pagine.' },
      ocr: { label: 'OCR', description: 'Esegui OCR locale e crea testo ricercabile.' },
      workspaceLinks: { label: 'Collegamenti Workspace', description: 'Gestisci i collegamenti ad altri documenti Workspace locali.' },
      compare: { label: 'Confronta', description: 'Confronta questo PDF strutturato con un altro documento.' },
      convert: { label: 'Converti', description: 'Converti il contenuto PDF strutturato in Office, HTML o testo.' },
      redactAll: { label: 'Trova e oscura testo', description: 'Cerca nel documento e oscura in modo irreversibile il contenuto corrispondente.' },
      redactionExport: { label: 'Esportazione oscuramento verificata', description: 'Esporta con pulizia dei contenuti nascosti e verifica dell’oscuramento.' },
      signatureStamp: { label: 'Timbro firma', description: 'Aggiungi un timbro visivo; non è una firma crittografica.' },
      digitalSignature: { label: 'Firma PDF', description: 'Crea una firma PDF crittografica X.509/CMS.' },
      passwordProtection: { label: 'Protezione con password', description: 'Proteggi il PDF esportato con password AES-256.' },
      removeMetadata: { label: 'Rimuovi metadati', description: 'Esamina e rimuovi i metadati PDF.' },
      redactionAudit: { label: 'Verifica oscuramento', description: 'Esamina il rapporto strutturato di verifica dell’oscuramento.' },
      optimize: { label: 'Ottimizza', description: 'Esamina e ottimizza l’output PDF strutturato.' },
      diagnostics: { label: 'Diagnostica', description: 'Esegui diagnostica PDF e controlli preliminari.' },
    },
  },
  'ja-JP': {
    document: 'PDF 文書', pageNavigation: 'PDF ページ移動', previousPage: '前のページ', nextPage: '次のページ', pagePosition: (current, total) => `${total} ページ中 ${current} ページ`,
    editHistory: 'PDF 編集履歴', undoTitle: '元に戻す (Ctrl+Z)', undoAria: 'PDF Studio の最後の編集を元に戻す', redoTitle: 'やり直す (Ctrl+Shift+Z)', redoAria: 'PDF Studio の最後の編集をやり直す', annotationTools: 'PDF 注釈ツール',
    select: '選択', highlight: 'ハイライト', highlightSelection: '選択範囲をハイライト', highlightColor: (name) => `PDF のハイライト色を設定: ${name}`,
    highlightColors: { '#f59e0b': 'アンバー', '#10b981': 'エメラルド', '#3b82f6': 'ブルー', '#ec4899': 'ローズ' }, underline: '下線', underlineSelection: '選択範囲に下線', strike: '取り消し線', strikeSelection: '選択範囲に取り消し線',
    comment: 'コメント', addComment: 'コメントまたは付箋を追加', redact: '墨消し', redactSelected: (count) => `選択内容を墨消し${count > 0 ? `（${count} 件を準備済み）` : ''}`,
    redactTitle: '選択内容を構造化モデルと今後のエクスポートから削除', moreTools: 'その他の PDF ツール', more: 'その他', pdfTools: 'PDF ツール', moreDescription: '必要なツールを開きます。文書のメインバーは簡潔に保たれます。',
    groupEdit: '編集と整理', groupProtect: '保護と署名', groupReview: '確認と出力', annotations: '注釈とコメントのパネル', exportPdf: 'PDF をエクスポート', exportPdfAria: '編集した構造化 PDF をエクスポート',
    zoomPresets: 'PDF ズーム設定', zoomOut: '縮小', zoomIn: '拡大', currentZoom: (level) => `現在の PDF ズーム ${level}%`, setZoom: (level) => `PDF ズームを ${level}% に設定`,
    actions: {
      contentEditor: { label: '内容を編集', description: '構造化テキスト、画像、ベクターオブジェクト、リンクを編集します。' },
      formFiller: { label: 'フォームに入力', description: 'PDF の入力可能なフォーム欄に記入します。' },
      assembler: { label: 'ページを編集', description: 'ページの並べ替え、抽出、挿入、透かしの追加を行います。' },
      ocr: { label: 'OCR', description: 'ローカル OCR を実行して検索可能なテキストを作成します。' },
      workspaceLinks: { label: 'Workspace リンク', description: 'ほかのローカル Workspace 文書へのリンクを管理します。' },
      compare: { label: '比較', description: 'この構造化 PDF を別の文書と比較します。' },
      convert: { label: '変換', description: '構造化 PDF の内容を Office、HTML、テキストに変換します。' },
      redactAll: { label: 'テキストを検索して墨消し', description: '文書を検索し、一致する内容を元に戻せない形で墨消しします。' },
      redactionExport: { label: '検証済み墨消しエクスポート', description: '非表示コンテンツを消去し、墨消しを検証してエクスポートします。' },
      signatureStamp: { label: '署名スタンプ', description: '視覚的な署名スタンプを追加します。暗号署名ではありません。' },
      digitalSignature: { label: 'PDF に署名', description: '暗号化された X.509/CMS PDF 署名を作成します。' },
      passwordProtection: { label: 'パスワード保護', description: 'AES-256 パスワードでエクスポート PDF を保護します。' },
      removeMetadata: { label: 'メタデータを削除', description: 'PDF メタデータを確認して消去します。' },
      redactionAudit: { label: '墨消し監査', description: '構造化された墨消し監査レポートを確認します。' },
      optimize: { label: '最適化', description: '構造化 PDF の出力を確認して最適化します。' },
      diagnostics: { label: '診断', description: 'PDF 診断と事前チェックを実行します。' },
    },
  },
  'ru-RU': {
    document: 'Документ PDF', pageNavigation: 'Навигация по страницам PDF', previousPage: 'Предыдущая страница', nextPage: 'Следующая страница', pagePosition: (current, total) => `Страница ${current} из ${total}`,
    editHistory: 'История изменений PDF', undoTitle: 'Отменить (Ctrl+Z)', undoAria: 'Отменить последнее изменение в PDF Studio', redoTitle: 'Повторить (Ctrl+Shift+Z)', redoAria: 'Повторить последнее изменение в PDF Studio', annotationTools: 'Инструменты аннотаций PDF',
    select: 'Выбрать', highlight: 'Выделить', highlightSelection: 'Выделить фрагмент', highlightColor: (name) => `Цвет выделения PDF: ${name}`,
    highlightColors: { '#f59e0b': 'Янтарный', '#10b981': 'Изумрудный', '#3b82f6': 'Синий', '#ec4899': 'Розовый' }, underline: 'Подчеркнуть', underlineSelection: 'Подчеркнуть фрагмент', strike: 'Зачеркнуть', strikeSelection: 'Зачеркнуть фрагмент',
    comment: 'Комментарий', addComment: 'Добавить комментарий или заметку', redact: 'Затемнить', redactSelected: (count) => `Затемнить выделенное${count > 0 ? `, подготовлено: ${count}` : ''}`,
    redactTitle: 'Удалить выделенное содержимое из структурированной модели и будущих экспортов', moreTools: 'Другие инструменты PDF', more: 'Ещё', pdfTools: 'Инструменты PDF', moreDescription: 'Откройте нужные инструменты; главная панель документа останется компактной.',
    groupEdit: 'Редактирование и организация', groupProtect: 'Защита и подпись', groupReview: 'Проверка и вывод', annotations: 'Панель аннотаций и комментариев', exportPdf: 'Экспорт PDF', exportPdfAria: 'Экспортировать изменённый структурированный PDF',
    zoomPresets: 'Масштаб PDF', zoomOut: 'Уменьшить', zoomIn: 'Увеличить', currentZoom: (level) => `Текущий масштаб PDF: ${level} %`, setZoom: (level) => `Установить масштаб PDF ${level} %`,
    actions: {
      contentEditor: { label: 'Изменить содержимое', description: 'Изменить структурированный текст, изображения, векторные объекты и ссылки.' },
      formFiller: { label: 'Заполнить форму', description: 'Заполнить интерактивные поля PDF-формы.' },
      assembler: { label: 'Собрать страницы', description: 'Менять порядок, извлекать и вставлять страницы, добавлять водяные знаки.' },
      ocr: { label: 'OCR', description: 'Запустить локальное распознавание и создать текст для поиска.' },
      workspaceLinks: { label: 'Ссылки Workspace', description: 'Управлять ссылками на другие локальные документы Workspace.' },
      compare: { label: 'Сравнить', description: 'Сравнить этот структурированный PDF с другим документом.' },
      convert: { label: 'Преобразовать', description: 'Преобразовать содержимое PDF в Office, HTML или текст.' },
      redactAll: { label: 'Найти и затемнить текст', description: 'Найти совпадения в документе и необратимо затемнить их.' },
      redactionExport: { label: 'Проверенный экспорт затемнения', description: 'Экспортировать после очистки скрытых данных и проверки затемнения.' },
      signatureStamp: { label: 'Штамп подписи', description: 'Добавить визуальный штамп подписи; это не криптографическая подпись.' },
      digitalSignature: { label: 'Подписать PDF', description: 'Создать криптографическую подпись PDF X.509/CMS.' },
      passwordProtection: { label: 'Защита паролем', description: 'Защитить экспортированный PDF паролем AES-256.' },
      removeMetadata: { label: 'Удалить метаданные', description: 'Проверить и очистить метаданные PDF.' },
      redactionAudit: { label: 'Аудит затемнения', description: 'Проверить структурированный отчёт об удалении содержимого.' },
      optimize: { label: 'Оптимизировать', description: 'Проверить и оптимизировать структурированный PDF.' },
      diagnostics: { label: 'Диагностика', description: 'Запустить диагностику PDF и предварительные проверки.' },
    },
  },
  'zh-CN': {
    document: 'PDF 文档', pageNavigation: 'PDF 页面导航', previousPage: '上一页', nextPage: '下一页', pagePosition: (current, total) => `第 ${current} 页，共 ${total} 页`,
    editHistory: 'PDF 编辑历史', undoTitle: '撤销 (Ctrl+Z)', undoAria: '撤销 PDF Studio 的上一次编辑', redoTitle: '重做 (Ctrl+Shift+Z)', redoAria: '重做 PDF Studio 的上一次编辑', annotationTools: 'PDF 注释工具',
    select: '选择', highlight: '高亮', highlightSelection: '高亮所选内容', highlightColor: (name) => `设置 PDF 高亮颜色：${name}`,
    highlightColors: { '#f59e0b': '琥珀色', '#10b981': '翠绿色', '#3b82f6': '蓝色', '#ec4899': '玫瑰色' }, underline: '下划线', underlineSelection: '为所选内容添加下划线', strike: '删除线', strikeSelection: '为所选内容添加删除线',
    comment: '评论', addComment: '添加评论或便笺', redact: '涂黑', redactSelected: (count) => `涂黑所选内容${count > 0 ? `，已暂存 ${count} 项` : ''}`,
    redactTitle: '从结构化模型和后续导出中移除所选内容', moreTools: '更多 PDF 工具', more: '更多', pdfTools: 'PDF 工具', moreDescription: '打开所需工具，同时保持主文档栏简洁。',
    groupEdit: '编辑和整理', groupProtect: '保护和签名', groupReview: '检查和输出', annotations: '注释和评论面板', exportPdf: '导出 PDF', exportPdfAria: '导出已编辑的结构化 PDF',
    zoomPresets: 'PDF 缩放预设', zoomOut: '缩小', zoomIn: '放大', currentZoom: (level) => `当前 PDF 缩放比例 ${level}%`, setZoom: (level) => `将 PDF 缩放比例设为 ${level}%`,
    actions: {
      contentEditor: { label: '编辑内容', description: '编辑结构化文本、图像、矢量对象和链接。' },
      formFiller: { label: '填写表单', description: '填写 PDF 交互式表单字段。' },
      assembler: { label: '整理页面', description: '重新排序、提取、插入页面并添加水印。' },
      ocr: { label: 'OCR', description: '运行本地 OCR 并创建可搜索文本。' },
      workspaceLinks: { label: 'Workspace 链接', description: '管理指向其他本地 Workspace 文档的链接。' },
      compare: { label: '比较', description: '将此结构化 PDF 与其他文档进行比较。' },
      convert: { label: '转换', description: '将结构化 PDF 内容转换为 Office、HTML 或文本。' },
      redactAll: { label: '查找并涂黑文本', description: '搜索文档并不可逆地涂黑匹配内容。' },
      redactionExport: { label: '已验证的涂黑导出', description: '清理隐藏内容并验证涂黑后导出。' },
      signatureStamp: { label: '签名图章', description: '添加可视签名图章；这不是加密签名。' },
      digitalSignature: { label: '签署 PDF', description: '创建加密 X.509/CMS PDF 签名。' },
      passwordProtection: { label: '密码保护', description: '使用 AES-256 密码保护导出的 PDF。' },
      removeMetadata: { label: '移除元数据', description: '检查并清除 PDF 元数据。' },
      redactionAudit: { label: '涂黑审计', description: '查看结构化涂黑审计报告。' },
      optimize: { label: '优化', description: '检查并优化结构化 PDF 输出。' },
      diagnostics: { label: '诊断', description: '运行 PDF 诊断和预检。' },
    },
  },
};

export function pdfToolbarCopy(locale: WorkspaceLocale): PdfToolbarCopy {
  return PDF_TOOLBAR_COPY[locale];
}
