// STATUS: GOLD — localized, code-keyed Whiteboard interoperability disclosures and diagnostics.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

export const WHITEBOARD_INTEROP_FORMATS = [
  '.vboard', 'SVG', 'PNG', 'PDF', 'Diagram SVG import', 'PDF import', 'Frames → Present',
] as const;
export type WhiteboardInteropFormat = typeof WHITEBOARD_INTEROP_FORMATS[number];
type Fidelity = 'full' | 'visual' | 'semantic-subset';
type InteropLocaleText = { format: string; fidelity: string; preserved: string; limitations: string };
type FormatRows = Record<WhiteboardInteropFormat, InteropLocaleText>;

const ROWS: Readonly<Record<WorkspaceLocale, FormatRows>> = {
  'en-US': {
    '.vboard': { format: '.vboard', fidelity: 'Full fidelity', preserved: 'Canonical objects, IDs, links, live/frozen modes, view state and policies.', limitations: 'Native Astraea encrypted container; foreign applications do not edit this format.' },
    'SVG': { format: 'SVG', fidelity: 'Semantic subset', preserved: 'Visible geometry, vector ink, routed connectors, labels, images and semantic cards.', limitations: 'Interactive live objects, media playback, votes/comments and editing behavior are represented visually, not as executable foreign semantics.' },
    'PNG': { format: 'PNG', fidelity: 'Visual', preserved: 'Bounded raster view produced from the canonical SVG projection.', limitations: 'Flattened image; object IDs, editability, links and interaction semantics are not represented.' },
    'PDF': { format: 'PDF', fidelity: 'Visual', preserved: 'Frame-paged visual projection with the same canonical SVG geometry.', limitations: 'Flattened pages; object editing, live bindings, collaboration and facilitation state are not represented.' },
    'Diagram SVG import': { format: 'Diagram SVG import', fidelity: 'Semantic subset', preserved: 'Supported rect/circle/ellipse/polygon/text/line primitives become native Whiteboard objects.', limitations: 'Unsupported or active SVG content is rejected rather than silently discarded.' },
    'PDF import': { format: 'PDF import', fidelity: 'Visual', preserved: 'Local pages are rasterized into bounded native image objects.', limitations: 'PDF structure, scripts, forms and active content are flattened and are not editable as PDF objects in Whiteboard.' },
    'Frames → Present': { format: 'Frames → Present', fidelity: 'Semantic subset', preserved: 'Selected frame order and titles, plus up to nine visible contained-object summary cards per slide. Speaker notes disclose source title, frame ID and exact contained count unless the bounded scan budget is reached.', limitations: 'At most 256 slides and two million frame/object checks are processed. Connectors, hidden objects, invalid geometry, additional cards, and Whiteboard position/editing/collaboration semantics are omitted.' },
  },
  'de-DE': {
    '.vboard': { format: '.vboard', fidelity: 'Vollständig', preserved: 'Kanonische Objekte, IDs, Verknüpfungen, Live-/Fixiert-Modus, Ansicht und Richtlinien.', limitations: 'Nativer verschlüsselter Astraea-Container; andere Anwendungen können dieses Format nicht bearbeiten.' },
    'SVG': { format: 'SVG', fidelity: 'Semantische Teilmenge', preserved: 'Sichtbare Geometrie, Vektorzeichnungen, geroutete Verbinder, Beschriftungen, Bilder und semantische Karten.', limitations: 'Interaktive Live-Objekte, Medienwiedergabe, Abstimmungen, Kommentare und Bearbeitungsverhalten werden visuell dargestellt, nicht als ausführbare Fremdsemantik.' },
    'PNG': { format: 'PNG', fidelity: 'Visuell', preserved: 'Begrenzte Rasteransicht aus der kanonischen SVG-Projektion.', limitations: 'Abgeflachtes Bild; Objekt-IDs, Bearbeitbarkeit, Verknüpfungen und Interaktionen werden nicht dargestellt.' },
    'PDF': { format: 'PDF', fidelity: 'Visuell', preserved: 'Visuelle Projektion mit Frame-Seiten und derselben kanonischen SVG-Geometrie.', limitations: 'Abgeflachte Seiten; Objektbearbeitung, Live-Bindungen, Zusammenarbeit und Moderationsstatus werden nicht dargestellt.' },
    'Diagram SVG import': { format: 'SVG-Diagrammimport', fidelity: 'Semantische Teilmenge', preserved: 'Unterstützte rect/circle/ellipse/polygon/text/line-Elemente werden zu nativen Whiteboard-Objekten.', limitations: 'Nicht unterstützte oder aktive SVG-Inhalte werden abgelehnt und nicht stillschweigend verworfen.' },
    'PDF import': { format: 'PDF-Import', fidelity: 'Visuell', preserved: 'Lokale Seiten werden in begrenzte native Bildobjekte gerastert.', limitations: 'PDF-Struktur, Skripte, Formulare und aktive Inhalte werden abgeflacht und sind nicht als PDF-Objekte in Whiteboard bearbeitbar.' },
    'Frames → Present': { format: 'Frames → Present', fidelity: 'Semantische Teilmenge', preserved: 'Ausgewählte Frame-Reihenfolge und Titel sowie bis zu neun sichtbare Objektübersichtskarten je Folie. Notizen nennen Quelltitel, Frame-ID und genaue Objektzahl, sofern das Scanlimit nicht erreicht wird.', limitations: 'Verarbeitet werden höchstens 256 Folien und zwei Millionen Frame-/Objektprüfungen. Verbinder, ausgeblendete oder geometrisch ungültige Objekte, weitere Karten und Whiteboard-Positions-, Bearbeitungs- und Zusammenarbeitssemantik entfallen.' },
  },
  'es-ES': {
    '.vboard': { format: '.vboard', fidelity: 'Completa', preserved: 'Objetos canónicos, ID, vínculos, modos en vivo/fijo, vista y políticas.', limitations: 'Contenedor cifrado nativo de Astraea; otras aplicaciones no pueden editar este formato.' },
    'SVG': { format: 'SVG', fidelity: 'Subconjunto semántico', preserved: 'Geometría visible, trazos vectoriales, conectores enrutados, etiquetas, imágenes y tarjetas semánticas.', limitations: 'Los objetos interactivos, la reproducción multimedia, los votos, comentarios y el comportamiento de edición se representan visualmente, no como semántica ejecutable externa.' },
    'PNG': { format: 'PNG', fidelity: 'Visual', preserved: 'Vista rasterizada acotada, generada desde la proyección SVG canónica.', limitations: 'Imagen aplanada; no representa ID de objetos, edición, vínculos ni interacciones.' },
    'PDF': { format: 'PDF', fidelity: 'Visual', preserved: 'Proyección visual paginada por marcos con la misma geometría SVG canónica.', limitations: 'Páginas aplanadas; no representa edición de objetos, vínculos en vivo, colaboración ni facilitación.' },
    'Diagram SVG import': { format: 'Importación de diagramas SVG', fidelity: 'Subconjunto semántico', preserved: 'Los elementos rect/circle/ellipse/polygon/text/line compatibles se convierten en objetos nativos de Whiteboard.', limitations: 'El contenido SVG no compatible o activo se rechaza en lugar de descartarse en silencio.' },
    'PDF import': { format: 'Importación de PDF', fidelity: 'Visual', preserved: 'Las páginas locales se rasterizan como objetos de imagen nativos con límites.', limitations: 'La estructura PDF, los scripts, formularios y el contenido activo se aplanan y no se pueden editar como objetos PDF en Whiteboard.' },
    'Frames → Present': { format: 'Marcos → Present', fidelity: 'Subconjunto semántico', preserved: 'Orden y títulos de los marcos seleccionados, más hasta nueve tarjetas visibles de resumen por diapositiva. Las notas indican el título de origen, el ID del marco y el recuento exacto, salvo que se alcance el límite de análisis.', limitations: 'Se procesan como máximo 256 diapositivas y dos millones de comprobaciones de marcos/objetos. Se omiten conectores, objetos ocultos o con geometría no válida, tarjetas adicionales y semántica de posición, edición y colaboración.' },
  },
  'it-IT': {
    '.vboard': { format: '.vboard', fidelity: 'Completa', preserved: 'Oggetti canonici, ID, collegamenti, modalità live/congelata, visualizzazione e criteri.', limitations: 'Contenitore cifrato nativo Astraea; le altre applicazioni non possono modificare questo formato.' },
    'SVG': { format: 'SVG', fidelity: 'Sottoinsieme semantico', preserved: 'Geometria visibile, tratti vettoriali, connettori instradati, etichette, immagini e schede semantiche.', limitations: 'Oggetti interattivi, riproduzione multimediale, voti, commenti e comportamento di modifica sono rappresentati visivamente, non come semantica esterna eseguibile.' },
    'PNG': { format: 'PNG', fidelity: 'Visiva', preserved: 'Vista raster limitata generata dalla proiezione SVG canonica.', limitations: 'Immagine appiattita; ID degli oggetti, modificabilità, collegamenti e interazioni non sono rappresentati.' },
    'PDF': { format: 'PDF', fidelity: 'Visiva', preserved: 'Proiezione visiva con pagine per riquadro e la stessa geometria SVG canonica.', limitations: 'Pagine appiattite; modifica degli oggetti, collegamenti live, collaborazione e facilitazione non sono rappresentati.' },
    'Diagram SVG import': { format: 'Importazione diagrammi SVG', fidelity: 'Sottoinsieme semantico', preserved: 'Le primitive rect/circle/ellipse/polygon/text/line supportate diventano oggetti Whiteboard nativi.', limitations: 'I contenuti SVG non supportati o attivi vengono rifiutati, non eliminati silenziosamente.' },
    'PDF import': { format: 'Importazione PDF', fidelity: 'Visiva', preserved: 'Le pagine locali vengono rasterizzate in oggetti immagine nativi con limiti.', limitations: 'Struttura PDF, script, moduli e contenuti attivi vengono appiattiti e non sono modificabili come oggetti PDF in Whiteboard.' },
    'Frames → Present': { format: 'Riquadri → Present', fidelity: 'Sottoinsieme semantico', preserved: 'Ordine e titoli dei riquadri selezionati, più fino a nove schede riepilogative visibili per diapositiva. Le note riportano titolo origine, ID del riquadro e conteggio esatto, salvo il raggiungimento del limite di scansione.', limitations: 'Elabora al massimo 256 diapositive e due milioni di controlli su riquadri/oggetti. Esclude connettori, oggetti nascosti o con geometria non valida, schede aggiuntive e semantica di posizione, modifica e collaborazione.' },
  },
  'ja-JP': {
    '.vboard': { format: '.vboard', fidelity: '完全', preserved: '正規オブジェクト、ID、リンク、ライブ/固定モード、表示状態、ポリシー。', limitations: 'Astraea ネイティブの暗号化コンテナーです。他のアプリではこの形式を編集できません。' },
    'SVG': { format: 'SVG', fidelity: '意味情報の一部', preserved: '表示中の図形、ベクター線、経路付きコネクター、ラベル、画像、意味カード。', limitations: 'ライブオブジェクト、メディア再生、投票、コメント、編集動作は視覚表現に変換され、外部で実行可能な意味情報にはなりません。' },
    'PNG': { format: 'PNG', fidelity: '視覚', preserved: '正規 SVG 投影から生成した範囲限定のラスター表示。', limitations: '画像に統合されます。オブジェクト ID、編集性、リンク、操作情報は保持されません。' },
    'PDF': { format: 'PDF', fidelity: '視覚', preserved: '同じ正規 SVG 図形を使ったフレーム単位のページ投影。', limitations: 'ページ画像に統合されます。オブジェクト編集、ライブ連携、共同作業、進行管理は保持されません。' },
    'Diagram SVG import': { format: '図表 SVG の読み込み', fidelity: '意味情報の一部', preserved: '対応する rect/circle/ellipse/polygon/text/line 要素を Whiteboard のネイティブオブジェクトに変換します。', limitations: '未対応またはアクティブな SVG コンテンツは、黙って破棄せず拒否します。' },
    'PDF import': { format: 'PDF の読み込み', fidelity: '視覚', preserved: 'ローカルページを範囲制限付きのネイティブ画像オブジェクトにラスタライズします。', limitations: 'PDF 構造、スクリプト、フォーム、アクティブコンテンツは画像化され、Whiteboard の PDF オブジェクトとして編集できません。' },
    'Frames → Present': { format: 'フレーム → Present', fidelity: '意味情報の一部', preserved: '選択フレームの順序とタイトル、およびスライドごとに最大 9 枚の表示中オブジェクト要約カードを保持します。走査上限に達しない場合、ノートに元のタイトル、フレーム ID、正確な件数を記録します。', limitations: '最大 256 枚のスライドと 200 万件のフレーム/オブジェクト検査を処理します。コネクター、非表示または不正な図形、追加カード、位置・編集・共同作業の意味情報は省略します。' },
  },
  'ru-RU': {
    '.vboard': { format: '.vboard', fidelity: 'Полная', preserved: 'Канонические объекты, идентификаторы, ссылки, режимы реального времени/фиксации, вид и политики.', limitations: 'Это собственный зашифрованный контейнер Astraea; другие приложения не редактируют этот формат.' },
    'SVG': { format: 'SVG', fidelity: 'Семантическое подмножество', preserved: 'Видимая геометрия, векторные штрихи, маршрутизированные соединители, подписи, изображения и смысловые карточки.', limitations: 'Интерактивные объекты, воспроизведение медиа, голосования, комментарии и поведение редактирования представлены визуально, а не как исполняемая внешняя семантика.' },
    'PNG': { format: 'PNG', fidelity: 'Визуальная', preserved: 'Ограниченное растровое представление из канонической проекции SVG.', limitations: 'Сведено к изображению; идентификаторы объектов, редактирование, ссылки и взаимодействия не сохраняются.' },
    'PDF': { format: 'PDF', fidelity: 'Визуальная', preserved: 'Визуальная проекция по страницам кадров с той же канонической геометрией SVG.', limitations: 'Страницы сведены; редактирование объектов, живые связи, совместная работа и фасилитация не сохраняются.' },
    'Diagram SVG import': { format: 'Импорт диаграммы SVG', fidelity: 'Семантическое подмножество', preserved: 'Поддерживаемые примитивы rect/circle/ellipse/polygon/text/line становятся нативными объектами Whiteboard.', limitations: 'Неподдерживаемое или активное содержимое SVG отклоняется, а не удаляется незаметно.' },
    'PDF import': { format: 'Импорт PDF', fidelity: 'Визуальная', preserved: 'Локальные страницы преобразуются в растровые нативные объекты изображений с ограничениями.', limitations: 'Структура PDF, сценарии, формы и активное содержимое уплощаются и не редактируются в Whiteboard как PDF-объекты.' },
    'Frames → Present': { format: 'Кадры → Present', fidelity: 'Семантическое подмножество', preserved: 'Порядок и заголовки выбранных кадров, а также до девяти видимых карточек объектов на слайд. Примечания содержат исходный заголовок, ID кадра и точное число объектов, если не достигнут лимит сканирования.', limitations: 'Обрабатывается не более 256 слайдов и двух миллионов проверок кадров/объектов. Исключаются соединители, скрытые объекты, объекты с неверной геометрией, дополнительные карточки и семантика расположения, редактирования и совместной работы.' },
  },
  'zh-CN': {
    '.vboard': { format: '.vboard', fidelity: '完整', preserved: '规范对象、ID、链接、实时/冻结模式、视图状态和策略。', limitations: '这是 Astraea 原生加密容器；其他应用无法编辑此格式。' },
    'SVG': { format: 'SVG', fidelity: '部分语义', preserved: '可见几何图形、矢量笔迹、路由连接线、标签、图像和语义卡片。', limitations: '实时交互对象、媒体播放、投票、评论和编辑行为会以视觉方式呈现，不会作为可执行的外部语义保留。' },
    'PNG': { format: 'PNG', fidelity: '视觉', preserved: '由规范 SVG 投影生成的有限范围栅格视图。', limitations: '内容合并为图像；不保留对象 ID、可编辑性、链接和交互语义。' },
    'PDF': { format: 'PDF', fidelity: '视觉', preserved: '使用相同规范 SVG 几何形状按画框分页的视觉投影。', limitations: '页面内容已扁平化；不保留对象编辑、实时绑定、协作和引导状态。' },
    'Diagram SVG import': { format: '导入图表 SVG', fidelity: '部分语义', preserved: '受支持的 rect/circle/ellipse/polygon/text/line 元素会转换为 Whiteboard 原生对象。', limitations: '不支持或包含活动内容的 SVG 会被拒绝，不会静默丢弃。' },
    'PDF import': { format: '导入 PDF', fidelity: '视觉', preserved: '本地页面会栅格化为有大小限制的原生图像对象。', limitations: 'PDF 结构、脚本、表单和活动内容会被扁平化，无法在 Whiteboard 中作为 PDF 对象编辑。' },
    'Frames → Present': { format: '画框 → Present', fidelity: '部分语义', preserved: '保留所选画框顺序和标题，每张幻灯片最多保留 9 张可见对象摘要卡片。未达到扫描上限时，演讲者备注会记录源标题、画框 ID 和准确对象数。', limitations: '最多处理 256 张幻灯片和 200 万次画框/对象检查。连接线、隐藏或几何无效对象、额外卡片，以及 Whiteboard 位置、编辑和协作语义会被省略。' },
  },
};

export const WHITEBOARD_INTEROP_RESULT_CODES = ['VBOARD_CONTAINER_ROUNDTRIP', 'SVG_VECTOR_XSS_DEFENSE', 'SPATIAL_INDEX_CULLING', 'ORTHOGONAL_ROUTING', 'FRAME_SLICING_DECOMPOSITION', 'OOM_CEILING_ENFORCEMENT'] as const;
type ResultId = typeof WHITEBOARD_INTEROP_RESULT_CODES[number];
type ResultCopy = { name: string; passed: string; failed: string };
export const WHITEBOARD_INTEROP_RESULT_COPY: Readonly<Record<WorkspaceLocale, Readonly<Record<ResultId | 'unknown', ResultCopy>>>> = {
  'en-US': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: 'Encrypted .vboard container roundtrip', passed: 'Encrypted container and canonical fixture passed roundtrip checks.', failed: 'Encrypted container roundtrip did not meet the required checks.' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'SVG vector safety', passed: 'SVG fixture passed active-content and escaped-text checks.', failed: 'SVG fixture did not meet the active-content safety checks.' },
    SPATIAL_INDEX_CULLING: { name: 'Spatial viewport query', passed: 'The bounded viewport query matched its fixture.', failed: 'The viewport query did not match the expected fixture.' },
    ORTHOGONAL_ROUTING: { name: 'Orthogonal connector routing', passed: 'The route fixture passed waypoint and layout checks.', failed: 'The route fixture did not meet the waypoint or layout checks.' },
    FRAME_SLICING_DECOMPOSITION: { name: 'Frame decomposition', passed: 'The frame fixture was partitioned into slide content.', failed: 'The frame fixture was not partitioned as expected.' },
    OOM_CEILING_ENFORCEMENT: { name: 'Resource ceiling', passed: 'The fixture passed the bounded resource-ceiling check.', failed: 'The resource ceiling did not release the expected fixture data.' },
    unknown: { name: 'Additional diagnostic', passed: 'The diagnostic completed.', failed: 'Diagnostic details are unavailable.' },
  },
  'de-DE': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: 'Roundtrip des verschlüsselten .vboard-Containers', passed: 'Verschlüsselter Container und kanonische Testdaten haben die Roundtrip-Prüfung bestanden.', failed: 'Der verschlüsselte Container hat die erforderlichen Roundtrip-Prüfungen nicht bestanden.' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'SVG-Vektorsicherheit', passed: 'Die SVG-Testdaten haben die Prüfung auf aktive Inhalte und maskierten Text bestanden.', failed: 'Die SVG-Testdaten haben die Sicherheitsprüfung für aktive Inhalte nicht bestanden.' },
    SPATIAL_INDEX_CULLING: { name: 'Räumliche Ansichtsbereichabfrage', passed: 'Die begrenzte Ansichtsbereichabfrage stimmt mit den Testdaten überein.', failed: 'Die Ansichtsbereichabfrage stimmt nicht mit den erwarteten Testdaten überein.' },
    ORTHOGONAL_ROUTING: { name: 'Orthogonales Routing von Verbindern', passed: 'Die Testdaten bestehen die Wegpunkt- und Layoutprüfung.', failed: 'Die Testdaten erfüllen die Wegpunkt- oder Layoutprüfung nicht.' },
    FRAME_SLICING_DECOMPOSITION: { name: 'Frame-Aufteilung', passed: 'Die Frame-Testdaten wurden in Folieninhalte aufgeteilt.', failed: 'Die Frame-Testdaten wurden nicht wie erwartet aufgeteilt.' },
    OOM_CEILING_ENFORCEMENT: { name: 'Ressourcenlimit', passed: 'Die Testdaten bestehen die Prüfung des begrenzten Ressourcenverbrauchs.', failed: 'Beim Ressourcenlimit wurden die erwarteten Testdaten nicht freigegeben.' },
    unknown: { name: 'Zusätzliche Diagnose', passed: 'Die Diagnose wurde abgeschlossen.', failed: 'Diagnosedetails sind nicht verfügbar.' },
  },
  'es-ES': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: 'Ciclo del contenedor .vboard cifrado', passed: 'El contenedor cifrado y los datos canónicos superaron las comprobaciones del ciclo.', failed: 'El contenedor cifrado no superó las comprobaciones requeridas.' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'Seguridad vectorial SVG', passed: 'Los datos SVG superaron las comprobaciones de contenido activo y texto escapado.', failed: 'Los datos SVG no superaron las comprobaciones de seguridad de contenido activo.' },
    SPATIAL_INDEX_CULLING: { name: 'Consulta espacial de vista', passed: 'La consulta acotada de la vista coincide con los datos de prueba.', failed: 'La consulta de la vista no coincide con los datos esperados.' },
    ORTHOGONAL_ROUTING: { name: 'Enrutamiento ortogonal de conectores', passed: 'Los datos de ruta superaron las comprobaciones de puntos y diseño.', failed: 'Los datos de ruta no cumplieron las comprobaciones de puntos o diseño.' },
    FRAME_SLICING_DECOMPOSITION: { name: 'Descomposición de marcos', passed: 'Los datos del marco se dividieron en contenido de diapositivas.', failed: 'Los datos del marco no se dividieron como se esperaba.' },
    OOM_CEILING_ENFORCEMENT: { name: 'Límite de recursos', passed: 'Los datos superaron la comprobación del límite de recursos.', failed: 'El límite de recursos no liberó los datos de prueba esperados.' },
    unknown: { name: 'Diagnóstico adicional', passed: 'El diagnóstico terminó.', failed: 'Los detalles del diagnóstico no están disponibles.' },
  },
  'it-IT': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: 'Roundtrip del contenitore .vboard cifrato', passed: 'Il contenitore cifrato e i dati canonici hanno superato i controlli roundtrip.', failed: 'Il contenitore cifrato non ha superato i controlli roundtrip richiesti.' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'Sicurezza vettoriale SVG', passed: 'I dati SVG hanno superato i controlli su contenuti attivi e testo con escape.', failed: 'I dati SVG non hanno superato i controlli di sicurezza sui contenuti attivi.' },
    SPATIAL_INDEX_CULLING: { name: 'Query spaziale della vista', passed: 'La query limitata della vista corrisponde ai dati di prova.', failed: 'La query della vista non corrisponde ai dati previsti.' },
    ORTHOGONAL_ROUTING: { name: 'Instradamento ortogonale dei connettori', passed: 'I dati del percorso hanno superato i controlli su waypoint e layout.', failed: 'I dati del percorso non soddisfano i controlli su waypoint o layout.' },
    FRAME_SLICING_DECOMPOSITION: { name: 'Decomposizione dei riquadri', passed: 'I dati del riquadro sono stati suddivisi in contenuti per le diapositive.', failed: 'I dati del riquadro non sono stati suddivisi come previsto.' },
    OOM_CEILING_ENFORCEMENT: { name: 'Limite delle risorse', passed: 'I dati hanno superato il controllo del limite di risorse.', failed: 'Il limite delle risorse non ha liberato i dati di prova previsti.' },
    unknown: { name: 'Diagnostica aggiuntiva', passed: 'La diagnostica è terminata.', failed: 'I dettagli diagnostici non sono disponibili.' },
  },
  'ja-JP': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: '暗号化 .vboard コンテナーの往復検証', passed: '暗号化コンテナーと正規テストデータの往復検証に成功しました。', failed: '暗号化コンテナーの往復検証が必要な条件を満たしませんでした。' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'SVG ベクターの安全性', passed: 'SVG テストデータはアクティブコンテンツとエスケープ文字の検査に合格しました。', failed: 'SVG テストデータはアクティブコンテンツの安全性検査に合格しませんでした。' },
    SPATIAL_INDEX_CULLING: { name: '空間ビューポート検索', passed: '範囲限定のビューポート検索はテストデータと一致しました。', failed: 'ビューポート検索が想定されたテストデータと一致しませんでした。' },
    ORTHOGONAL_ROUTING: { name: '直交コネクターのルーティング', passed: '経路テストはウェイポイントとレイアウトの検査に合格しました。', failed: '経路テストがウェイポイントまたはレイアウトの条件を満たしませんでした。' },
    FRAME_SLICING_DECOMPOSITION: { name: 'フレームの分割', passed: 'フレームのテストデータをスライド内容に分割しました。', failed: 'フレームのテストデータを想定どおりに分割できませんでした。' },
    OOM_CEILING_ENFORCEMENT: { name: 'リソース上限', passed: 'テストデータは範囲限定のリソース上限検査に合格しました。', failed: 'リソース上限検査で想定されたテストデータを解放できませんでした。' },
    unknown: { name: '追加診断', passed: '診断が完了しました。', failed: '診断の詳細を利用できません。' },
  },
  'ru-RU': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: 'Проверка цикла зашифрованного контейнера .vboard', passed: 'Зашифрованный контейнер и канонические тестовые данные прошли проверку цикла.', failed: 'Зашифрованный контейнер не прошел необходимые проверки цикла.' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'Безопасность векторного SVG', passed: 'SVG-тест прошел проверки активного содержимого и экранированного текста.', failed: 'SVG-тест не прошел проверки безопасности активного содержимого.' },
    SPATIAL_INDEX_CULLING: { name: 'Пространственный запрос области просмотра', passed: 'Ограниченный запрос области просмотра совпал с тестовыми данными.', failed: 'Запрос области просмотра не совпал с ожидаемыми данными.' },
    ORTHOGONAL_ROUTING: { name: 'Ортогональная маршрутизация соединителей', passed: 'Тест маршрута прошел проверки контрольных точек и компоновки.', failed: 'Тест маршрута не выполнил требования к контрольным точкам или компоновке.' },
    FRAME_SLICING_DECOMPOSITION: { name: 'Разделение кадров', passed: 'Тестовый кадр разделен на содержимое слайдов.', failed: 'Тестовый кадр разделен не так, как ожидалось.' },
    OOM_CEILING_ENFORCEMENT: { name: 'Ограничение ресурсов', passed: 'Тестовые данные прошли проверку ограниченного расхода ресурсов.', failed: 'Ограничение ресурсов не освободило ожидаемые тестовые данные.' },
    unknown: { name: 'Дополнительная диагностика', passed: 'Диагностика завершена.', failed: 'Сведения диагностики недоступны.' },
  },
  'zh-CN': {
    VBOARD_CONTAINER_ROUNDTRIP: { name: '加密 .vboard 容器往返验证', passed: '加密容器和规范测试数据通过了往返检查。', failed: '加密容器未通过所需的往返检查。' },
    SVG_VECTOR_XSS_DEFENSE: { name: 'SVG 矢量安全', passed: 'SVG 测试数据通过了活动内容和转义文本检查。', failed: 'SVG 测试数据未通过活动内容安全检查。' },
    SPATIAL_INDEX_CULLING: { name: '空间视口查询', passed: '有限范围视口查询与测试数据匹配。', failed: '视口查询与预期测试数据不匹配。' },
    ORTHOGONAL_ROUTING: { name: '正交连接线路由', passed: '路由测试通过了路径点和布局检查。', failed: '路由测试未满足路径点或布局检查要求。' },
    FRAME_SLICING_DECOMPOSITION: { name: '画框分解', passed: '画框测试数据已划分为幻灯片内容。', failed: '画框测试数据未按预期划分。' },
    OOM_CEILING_ENFORCEMENT: { name: '资源上限', passed: '测试数据通过了有限资源上限检查。', failed: '资源上限检查未释放预期的测试数据。' },
    unknown: { name: '其他诊断', passed: '诊断已完成。', failed: '诊断详情不可用。' },
  },
};

const FIDELITY_LABELS: Readonly<Record<WorkspaceLocale, Record<Fidelity | 'unknown', string>>> = {
  'en-US': { full: 'Full fidelity', visual: 'Visual', 'semantic-subset': 'Semantic subset', unknown: 'Other' },
  'de-DE': { full: 'Vollständig', visual: 'Visuell', 'semantic-subset': 'Semantische Teilmenge', unknown: 'Andere' },
  'es-ES': { full: 'Completa', visual: 'Visual', 'semantic-subset': 'Subconjunto semántico', unknown: 'Otro' },
  'it-IT': { full: 'Completa', visual: 'Visiva', 'semantic-subset': 'Sottoinsieme semantico', unknown: 'Altro' },
  'ja-JP': { full: '完全', visual: '視覚', 'semantic-subset': '意味情報の一部', unknown: 'その他' },
  'ru-RU': { full: 'Полная', visual: 'Визуальная', 'semantic-subset': 'Семантическое подмножество', unknown: 'Другое' },
  'zh-CN': { full: '完整', visual: '视觉', 'semantic-subset': '部分语义', unknown: '其他' },
};

const UNKNOWN_FIDELITY: Readonly<Record<WorkspaceLocale, LocalizedInteropFidelity>> = {
  'en-US': { format: 'Other interchange format', fidelity: 'Other', preserved: 'No format-specific behavior is mapped.', limitations: 'Interoperability details are unavailable.' },
  'de-DE': { format: 'Anderes Austauschformat', fidelity: 'Andere', preserved: 'Es ist kein formatspezifisches Verhalten zugeordnet.', limitations: 'Details zur Interoperabilität sind nicht verfügbar.' },
  'es-ES': { format: 'Otro formato de intercambio', fidelity: 'Otro', preserved: 'No hay un comportamiento específico del formato asignado.', limitations: 'Los detalles de interoperabilidad no están disponibles.' },
  'it-IT': { format: 'Altro formato di scambio', fidelity: 'Altro', preserved: 'Nessun comportamento specifico del formato è mappato.', limitations: 'I dettagli di interoperabilità non sono disponibili.' },
  'ja-JP': { format: 'その他の交換形式', fidelity: 'その他', preserved: '形式固有の動作は割り当てられていません。', limitations: '相互運用性の詳細を利用できません。' },
  'ru-RU': { format: 'Другой формат обмена', fidelity: 'Другое', preserved: 'Поведение для этого формата не задано.', limitations: 'Сведения о совместимости недоступны.' },
  'zh-CN': { format: '其他交换格式', fidelity: '其他', preserved: '未映射此格式的专属行为。', limitations: '互操作详情不可用。' },
};

export interface LocalizedInteropFidelity { format: string; fidelity: string; preserved: string; limitations: string; }
export function whiteboardInteropFidelityText(format: string, fidelity: string, locale: WorkspaceLocale): LocalizedInteropFidelity {
  const row = (WHITEBOARD_INTEROP_FORMATS as readonly string[]).includes(format)
    ? ROWS[locale][format as WhiteboardInteropFormat]
    : undefined;
  if (!row) {
    return UNKNOWN_FIDELITY[locale];
  }
  const kind = (fidelity === 'full' || fidelity === 'visual' || fidelity === 'semantic-subset') ? fidelity : 'unknown';
  return { ...row, fidelity: FIDELITY_LABELS[locale][kind] };
}

export function whiteboardInteropResultText(id: string, passed: boolean, locale: WorkspaceLocale): { name: string; message: string } {
  const rows = WHITEBOARD_INTEROP_RESULT_COPY[locale];
  const row = Object.prototype.hasOwnProperty.call(rows, id) ? rows[id as ResultId] : rows.unknown;
  return { name: row.name, message: passed ? row.passed : row.failed };
}
