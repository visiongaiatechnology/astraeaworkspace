// STATUS: PLATIN — typed Fabric dialog copy and exhaustive state labels for all supported locales.
import type { DocumentKind } from '../../shared/contracts/documentKind';
import type { FabricLinkStatus, FabricTransferChoice } from '../../shared/workspace-interaction/fabric';
import type { WorkspaceObject } from '../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

type FabricMode = 'Live' | 'Frozen';
type FabricObjectType = WorkspaceObject['type'];

export interface FabricGraphCopy {
  readonly badge: string;
  readonly description: string;
  readonly closeDialog: string;
  readonly introLead: string;
  readonly introTail: string;
  readonly insertTitle: string;
  readonly targetLabel: string;
  readonly noActiveDocument: string;
  readonly writerTargetHelp: string;
  readonly otherTargetHelp: string;
  readonly writerDropTarget: string;
  readonly otherDropTarget: string;
  readonly chooseSourceDocument: string;
  readonly chooseSourceObject: string;
  readonly dragObject: string;
  readonly selected: string;
  readonly selectPrompt: string;
  readonly dropError: string;
  readonly transfer: Readonly<Record<FabricTransferChoice, string>>;
  readonly activeLinks: (count: number) => string;
  readonly noLinks: string;
  readonly brokenSource: string;
  readonly unresolvedObject: string;
  readonly objectLabel: string;
  readonly referenceLabel: string;
  readonly mode: Readonly<Record<FabricMode, string>>;
  readonly status: Readonly<Record<FabricLinkStatus, string>>;
  readonly objectType: Readonly<Record<FabricObjectType, string>>;
  readonly action: Readonly<Record<'openSource' | 'refresh' | 'viewChanges' | 'freeze' | 'breakLink' | 'relink', string>>;
  readonly resolvedSourceVersion: string;
  readonly currentVersion: string;
  readonly statusLabel: string;
  readonly semanticTypeChanged: string;
  readonly noNetworkRetrieval: string;
  readonly closeFabric: string;
}

const DOCUMENT_KIND_LABEL: Readonly<Record<DocumentKind, string>> = {
  Writer: 'Astraea Writer', Grid: 'Astraea Grid', Present: 'Astraea Present', Notes: 'Astraea Notes',
  PdfStudio: 'Astraea PDF Studio', Draw: 'Astraea Draw', Whiteboard: 'Astraea Whiteboard', Forms: 'Astraea Forms',
  Database: 'Astraea Database', Publish: 'Astraea Publish', Insight: 'Astraea Insight', Tasks: 'Astraea Tasks',
  Planner: 'Astraea Planner', Projects: 'Astraea Projects', Vault: 'Astraea Vault', Spaces: 'Astraea Spaces',
  Connect: 'Astraea Connect', Automate: 'Astraea Automate', AdminPolicy: 'Astraea Admin & Policy', GaiaCom: 'Astraea GaiaCom',
};

export function fabricDocumentKindLabel(kind: DocumentKind): string {
  return DOCUMENT_KIND_LABEL[kind];
}

export const FABRIC_GRAPH_COPY: Readonly<Record<WorkspaceLocale, FabricGraphCopy>> = {
  'de-DE': {
    badge: 'LIVE-OBJEKTGRAPH', description: 'Kanonische WOM-v2-Verknüpfungen mit expliziten Versionen, Status, Zyklusschutz und semantischen Snapshots.', closeDialog: 'Dialog „Astraea Workspace Fabric“ schließen',
    introLead: 'Live-Objekte verwenden kanonische Referenzen wie', introTail: '. Das Ziel speichert semantische Objektdaten statt eines Rasterbilds und erhält nie mehr Zugriffsrechte, als die Quellrichtlinie erlaubt.',
    insertTitle: 'Aus Workspace einfügen', targetLabel: 'Ziel:', noActiveDocument: 'Kein aktives Dokument', writerTargetHelp: 'Ziehe eine Grid-Tabelle in Writer oder wähle manuell eine Quelle.', otherTargetHelp: 'Das Ziehen von Grid-Tabellen ist nur für Writer-Ziele verfügbar. Wähle hier eine Quelle manuell.', writerDropTarget: 'Workspace-Ablageziel für Grid-Tabellen', otherDropTarget: 'Ablageziel für Grid-Tabellen inaktiv; Quelle manuell auswählen',
    chooseSourceDocument: 'Quelldokument auswählen…', chooseSourceObject: 'Quellobjekt auswählen…', dragObject: 'Dieses Objekt in den Zielbereich ziehen', selected: 'Ausgewählt', selectPrompt: 'Lege ein Objekt ab oder wähle es aus. Danach kannst du es live verknüpfen oder als eigene Kopie übernehmen.', dropError: 'Diese Quelle oder dieses Ziel ist nicht mehr verfügbar. Wähle ein kompatibles Objekt erneut aus.',
    transfer: { LiveLink: 'Live-Verknüpfung', PasteCopy: 'Kopie einfügen' }, activeLinks: (count) => `Aktive dokumentübergreifende Verknüpfungen (${count})`, noLinks: 'Es sind keine dokumentübergreifenden Verweise aktiv.', brokenSource: 'Defekte Quelle', unresolvedObject: 'Nicht aufgelöst', objectLabel: 'Objekt:', referenceLabel: 'Verweis:',
    mode: { Live: 'LIVE', Frozen: 'EINGEFROREN' }, status: { current: 'Aktuell', changed: 'Geändert', broken: 'Defekt', unavailable: 'Nicht verfügbar', 'permission-lost': 'Zugriff verloren', frozen: 'Eingefroren' },
    objectType: { TextBlock: 'Textblock', Table: 'Tabelle', Shape: 'Form', Chart: 'Diagramm', WorkspaceReference: 'Workspace-Verweis', MediaAsset: 'Medienobjekt', CommentReview: 'Kommentar und Prüfung', WorkItemRef: 'Arbeitselement-Verweis', DataRecord: 'Datensatz', PolicyMetadata: 'Richtlinienmetadaten', ExtensionObject: 'Erweiterungsobjekt' },
    action: { openSource: 'Quelle öffnen', refresh: 'Aktualisieren', viewChanges: 'Änderungen anzeigen', freeze: 'Einfrieren', breakLink: 'Verknüpfung lösen', relink: 'Mit Auswahl neu verknüpfen' }, resolvedSourceVersion: 'Aufgelöste Quellversion', currentVersion: 'Aktuell', statusLabel: 'Status', semanticTypeChanged: 'Semantischer Typ geändert', noNetworkRetrieval: 'Es erfolgt kein Netzwerkabruf, außer eine Quelltransportfunktion wurde ausdrücklich konfiguriert.', closeFabric: 'Fabric schließen',
  },
  'en-US': {
    badge: 'LIVE OBJECT GRAPH', description: 'Canonical WOM-v2 links with explicit versions, status, cycle protection, and semantic snapshots.', closeDialog: 'Close Astraea Workspace Fabric dialog',
    introLead: 'Live objects use canonical references such as', introTail: '. The target keeps semantic object data instead of a raster image and never receives more access than the source policy allows.',
    insertTitle: 'Insert from Workspace', targetLabel: 'Target:', noActiveDocument: 'No active document', writerTargetHelp: 'Drag a Grid table into Writer or choose a source manually.', otherTargetHelp: 'Grid table dragging is available for Writer targets. Choose a source manually here.', writerDropTarget: 'Workspace drop target for Grid tables', otherDropTarget: 'Grid table drop target inactive; select a source manually',
    chooseSourceDocument: 'Choose source document…', chooseSourceObject: 'Choose source object…', dragObject: 'Drag this object into the target area', selected: 'Selected', selectPrompt: 'Drop or select an object. Then choose whether it stays live or becomes an owned copy.', dropError: 'This source or target is no longer available. Choose a compatible object again.',
    transfer: { LiveLink: 'Live link', PasteCopy: 'Paste copy' }, activeLinks: (count) => `Active inter-document links (${count})`, noLinks: 'No cross-document references are active.', brokenSource: 'Broken source', unresolvedObject: 'Unresolved', objectLabel: 'Object:', referenceLabel: 'Reference:',
    mode: { Live: 'LIVE', Frozen: 'FROZEN' }, status: { current: 'Current', changed: 'Changed', broken: 'Broken', unavailable: 'Unavailable', 'permission-lost': 'Access lost', frozen: 'Frozen' },
    objectType: { TextBlock: 'Text block', Table: 'Table', Shape: 'Shape', Chart: 'Chart', WorkspaceReference: 'Workspace reference', MediaAsset: 'Media asset', CommentReview: 'Comment and review', WorkItemRef: 'Work item reference', DataRecord: 'Data record', PolicyMetadata: 'Policy metadata', ExtensionObject: 'Extension object' },
    action: { openSource: 'Open source', refresh: 'Refresh', viewChanges: 'View changes', freeze: 'Freeze', breakLink: 'Break link', relink: 'Relink to selected' }, resolvedSourceVersion: 'Resolved source version', currentVersion: 'Current', statusLabel: 'Status', semanticTypeChanged: 'Semantic type changed', noNetworkRetrieval: 'No network retrieval occurs unless a source transport capability is explicitly configured.', closeFabric: 'Close Fabric',
  },
  'ru-RU': {
    badge: 'ГРАФ ЖИВЫХ ОБЪЕКТОВ', description: 'Канонические связи WOM-v2 с явными версиями и статусом, защитой от циклов и семантическими снимками.', closeDialog: 'Закрыть диалог Astraea Workspace Fabric',
    introLead: 'Живые объекты используют канонические ссылки, например', introTail: '. Цель хранит семантические данные объекта, а не растровое изображение, и не получает больше прав, чем разрешено политикой источника.',
    insertTitle: 'Вставить из Workspace', targetLabel: 'Цель:', noActiveDocument: 'Нет активного документа', writerTargetHelp: 'Перетащите таблицу Grid в Writer или выберите источник вручную.', otherTargetHelp: 'Перетаскивание таблиц Grid доступно для целей Writer. Здесь выберите источник вручную.', writerDropTarget: 'Область Workspace для таблиц Grid', otherDropTarget: 'Область для таблиц Grid неактивна; выберите источник вручную',
    chooseSourceDocument: 'Выберите исходный документ…', chooseSourceObject: 'Выберите исходный объект…', dragObject: 'Перетащите объект в область цели', selected: 'Выбрано', selectPrompt: 'Перетащите или выберите объект, затем решите, оставить ли его живой связью или создать собственную копию.', dropError: 'Источник или цель больше недоступны. Выберите совместимый объект ещё раз.',
    transfer: { LiveLink: 'Живая связь', PasteCopy: 'Вставить копию' }, activeLinks: (count) => `Активные связи между документами (${count})`, noLinks: 'Активных междокументных ссылок нет.', brokenSource: 'Источник повреждён', unresolvedObject: 'Не разрешён', objectLabel: 'Объект:', referenceLabel: 'Ссылка:',
    mode: { Live: 'ЖИВОЙ', Frozen: 'ЗАФИКСИРОВАН' }, status: { current: 'Актуален', changed: 'Изменён', broken: 'Повреждён', unavailable: 'Недоступен', 'permission-lost': 'Доступ отозван', frozen: 'Зафиксирован' },
    objectType: { TextBlock: 'Текстовый блок', Table: 'Таблица', Shape: 'Фигура', Chart: 'Диаграмма', WorkspaceReference: 'Ссылка Workspace', MediaAsset: 'Медиаобъект', CommentReview: 'Комментарий и проверка', WorkItemRef: 'Ссылка на задачу', DataRecord: 'Запись данных', PolicyMetadata: 'Метаданные политики', ExtensionObject: 'Объект расширения' },
    action: { openSource: 'Открыть источник', refresh: 'Обновить', viewChanges: 'Показать изменения', freeze: 'Зафиксировать', breakLink: 'Разорвать связь', relink: 'Связать с выбранным' }, resolvedSourceVersion: 'Разрешённая версия источника', currentVersion: 'Текущая', statusLabel: 'Статус', semanticTypeChanged: 'Семантический тип изменён', noNetworkRetrieval: 'Сетевой запрос не выполняется, если транспорт источника явно не настроен.', closeFabric: 'Закрыть Fabric',
  },
  'it-IT': {
    badge: 'GRAFO OGGETTI LIVE', description: 'Collegamenti canonici WOM-v2 con versioni e stato espliciti, protezione dai cicli e snapshot semantici.', closeDialog: 'Chiudi la finestra Astraea Workspace Fabric',
    introLead: 'Gli oggetti live usano riferimenti canonici come', introTail: '. La destinazione conserva i dati semantici dell’oggetto, non un’immagine raster, e non riceve mai più accesso di quanto consenta la policy sorgente.',
    insertTitle: 'Inserisci da Workspace', targetLabel: 'Destinazione:', noActiveDocument: 'Nessun documento attivo', writerTargetHelp: 'Trascina una tabella Grid in Writer oppure scegli manualmente una sorgente.', otherTargetHelp: 'Il trascinamento delle tabelle Grid è disponibile per le destinazioni Writer. Scegli qui una sorgente manualmente.', writerDropTarget: 'Area di rilascio Workspace per tabelle Grid', otherDropTarget: 'Area di rilascio per tabelle Grid inattiva; seleziona una sorgente manualmente',
    chooseSourceDocument: 'Scegli il documento sorgente…', chooseSourceObject: 'Scegli l’oggetto sorgente…', dragObject: 'Trascina questo oggetto nell’area di destinazione', selected: 'Selezionato', selectPrompt: 'Rilascia o seleziona un oggetto, poi scegli se mantenerlo live o crearne una copia di proprietà.', dropError: 'Questa sorgente o destinazione non è più disponibile. Scegli di nuovo un oggetto compatibile.',
    transfer: { LiveLink: 'Collegamento live', PasteCopy: 'Incolla copia' }, activeLinks: (count) => `Collegamenti attivi tra documenti (${count})`, noLinks: 'Non ci sono riferimenti attivi tra documenti.', brokenSource: 'Sorgente non valida', unresolvedObject: 'Non risolto', objectLabel: 'Oggetto:', referenceLabel: 'Riferimento:',
    mode: { Live: 'LIVE', Frozen: 'CONGELATO' }, status: { current: 'Corrente', changed: 'Modificato', broken: 'Non valido', unavailable: 'Non disponibile', 'permission-lost': 'Accesso revocato', frozen: 'Congelato' },
    objectType: { TextBlock: 'Blocco di testo', Table: 'Tabella', Shape: 'Forma', Chart: 'Grafico', WorkspaceReference: 'Riferimento Workspace', MediaAsset: 'Risorsa multimediale', CommentReview: 'Commento e revisione', WorkItemRef: 'Riferimento attività', DataRecord: 'Record dati', PolicyMetadata: 'Metadati policy', ExtensionObject: 'Oggetto estensione' },
    action: { openSource: 'Apri sorgente', refresh: 'Aggiorna', viewChanges: 'Visualizza modifiche', freeze: 'Congela', breakLink: 'Interrompi collegamento', relink: 'Ricollega alla selezione' }, resolvedSourceVersion: 'Versione sorgente risolta', currentVersion: 'Attuale', statusLabel: 'Stato', semanticTypeChanged: 'Tipo semantico modificato', noNetworkRetrieval: 'Non viene eseguito alcun recupero di rete, a meno che non sia configurata esplicitamente una capacità di trasporto sorgente.', closeFabric: 'Chiudi Fabric',
  },
  'es-ES': {
    badge: 'GRAFO DE OBJETOS EN VIVO', description: 'Vínculos canónicos WOM-v2 con versiones y estados explícitos, protección contra ciclos e instantáneas semánticas.', closeDialog: 'Cerrar el diálogo de Astraea Workspace Fabric',
    introLead: 'Los objetos en vivo usan referencias canónicas como', introTail: '. El destino conserva los datos semánticos del objeto, no una imagen rasterizada, y nunca recibe más acceso del que permite la política de origen.',
    insertTitle: 'Insertar desde Workspace', targetLabel: 'Destino:', noActiveDocument: 'No hay ningún documento activo', writerTargetHelp: 'Arrastra una tabla de Grid a Writer o elige un origen manualmente.', otherTargetHelp: 'Arrastrar tablas de Grid está disponible para destinos Writer. Elige aquí un origen manualmente.', writerDropTarget: 'Zona de destino de Workspace para tablas de Grid', otherDropTarget: 'Zona de destino de tablas Grid inactiva; selecciona un origen manualmente',
    chooseSourceDocument: 'Elegir documento de origen…', chooseSourceObject: 'Elegir objeto de origen…', dragObject: 'Arrastra este objeto a la zona de destino', selected: 'Seleccionado', selectPrompt: 'Suelta o selecciona un objeto y decide si se mantiene vinculado o se convierte en una copia propia.', dropError: 'El origen o el destino ya no está disponible. Vuelve a elegir un objeto compatible.',
    transfer: { LiveLink: 'Vínculo en vivo', PasteCopy: 'Pegar copia' }, activeLinks: (count) => `Vínculos activos entre documentos (${count})`, noLinks: 'No hay referencias activas entre documentos.', brokenSource: 'Origen dañado', unresolvedObject: 'Sin resolver', objectLabel: 'Objeto:', referenceLabel: 'Referencia:',
    mode: { Live: 'EN VIVO', Frozen: 'FIJO' }, status: { current: 'Actual', changed: 'Modificado', broken: 'Dañado', unavailable: 'No disponible', 'permission-lost': 'Acceso revocado', frozen: 'Fijo' },
    objectType: { TextBlock: 'Bloque de texto', Table: 'Tabla', Shape: 'Forma', Chart: 'Gráfico', WorkspaceReference: 'Referencia de Workspace', MediaAsset: 'Recurso multimedia', CommentReview: 'Comentario y revisión', WorkItemRef: 'Referencia de tarea', DataRecord: 'Registro de datos', PolicyMetadata: 'Metadatos de política', ExtensionObject: 'Objeto de extensión' },
    action: { openSource: 'Abrir origen', refresh: 'Actualizar', viewChanges: 'Ver cambios', freeze: 'Fijar', breakLink: 'Romper vínculo', relink: 'Vincular a la selección' }, resolvedSourceVersion: 'Versión de origen resuelta', currentVersion: 'Actual', statusLabel: 'Estado', semanticTypeChanged: 'El tipo semántico ha cambiado', noNetworkRetrieval: 'No se recuperan datos de la red salvo que se configure explícitamente una capacidad de transporte del origen.', closeFabric: 'Cerrar Fabric',
  },
  'ja-JP': {
    badge: 'ライブオブジェクトグラフ', description: '明示的なバージョンと状態、循環保護、セマンティックスナップショットを備えた正規のWOM-v2リンクです。', closeDialog: 'Astraea Workspace Fabricダイアログを閉じる',
    introLead: 'ライブオブジェクトは次のような正規参照を使用します', introTail: '。ターゲットにはラスター画像ではなくオブジェクトの意味データが保持され、ソースポリシーで許可された範囲を超えるアクセス権は付与されません。',
    insertTitle: 'Workspaceから挿入', targetLabel: 'ターゲット:', noActiveDocument: 'アクティブなドキュメントはありません', writerTargetHelp: 'Gridの表をWriterにドラッグするか、ソースを手動で選択してください。', otherTargetHelp: 'Gridの表のドラッグはWriterをターゲットにする場合に利用できます。ここではソースを手動で選択してください。', writerDropTarget: 'Gridの表をドロップするWorkspace領域', otherDropTarget: 'Gridの表のドロップ先は無効です。ソースを手動で選択してください',
    chooseSourceDocument: 'ソースドキュメントを選択…', chooseSourceObject: 'ソースオブジェクトを選択…', dragObject: 'このオブジェクトをターゲット領域へドラッグ', selected: '選択済み', selectPrompt: 'オブジェクトをドロップまたは選択し、ライブリンクのままにするか自分のコピーにするかを選択してください。', dropError: 'ソースまたはターゲットを利用できません。互換性のあるオブジェクトを選び直してください。',
    transfer: { LiveLink: 'ライブリンク', PasteCopy: 'コピーを貼り付け' }, activeLinks: (count) => `ドキュメント間のアクティブなリンク（${count}）`, noLinks: 'アクティブなドキュメント間参照はありません。', brokenSource: 'ソースが破損', unresolvedObject: '未解決', objectLabel: 'オブジェクト:', referenceLabel: '参照:',
    mode: { Live: 'ライブ', Frozen: '固定' }, status: { current: '最新', changed: '変更あり', broken: '破損', unavailable: '利用不可', 'permission-lost': 'アクセス権なし', frozen: '固定済み' },
    objectType: { TextBlock: 'テキストブロック', Table: '表', Shape: '図形', Chart: 'グラフ', WorkspaceReference: 'Workspace参照', MediaAsset: 'メディアアセット', CommentReview: 'コメントとレビュー', WorkItemRef: '作業項目参照', DataRecord: 'データレコード', PolicyMetadata: 'ポリシーメタデータ', ExtensionObject: '拡張オブジェクト' },
    action: { openSource: 'ソースを開く', refresh: '更新', viewChanges: '変更を表示', freeze: '固定', breakLink: 'リンクを解除', relink: '選択項目に再リンク' }, resolvedSourceVersion: '解決済みソースバージョン', currentVersion: '現在', statusLabel: '状態', semanticTypeChanged: 'セマンティック型が変更されました', noNetworkRetrieval: 'ソースの転送機能が明示的に設定されていない限り、ネットワークから取得しません。', closeFabric: 'Fabricを閉じる',
  },
  'zh-CN': {
    badge: '实时对象图', description: '规范的 WOM-v2 链接，包含明确的版本与状态、循环保护和语义快照。', closeDialog: '关闭 Astraea Workspace Fabric 对话框',
    introLead: '实时对象使用规范引用，例如', introTail: '。目标保留对象语义数据而非栅格图像，且获得的访问权限不会超过源策略允许的范围。',
    insertTitle: '从 Workspace 插入', targetLabel: '目标：', noActiveDocument: '没有活动文档', writerTargetHelp: '将 Grid 表格拖到 Writer，或手动选择来源。', otherTargetHelp: '只有 Writer 目标支持拖放 Grid 表格。请在此手动选择来源。', writerDropTarget: 'Grid 表格的 Workspace 放置区域', otherDropTarget: 'Grid 表格放置区域未启用；请手动选择来源',
    chooseSourceDocument: '选择源文档…', chooseSourceObject: '选择源对象…', dragObject: '将此对象拖到目标区域', selected: '已选择', selectPrompt: '放置或选择对象，然后选择保留实时链接还是创建自己的副本。', dropError: '来源或目标已不可用。请重新选择兼容对象。',
    transfer: { LiveLink: '实时链接', PasteCopy: '粘贴副本' }, activeLinks: (count) => `活动的跨文档链接（${count}）`, noLinks: '没有活动的跨文档引用。', brokenSource: '源已损坏', unresolvedObject: '未解析', objectLabel: '对象：', referenceLabel: '引用：',
    mode: { Live: '实时', Frozen: '已冻结' }, status: { current: '最新', changed: '已更改', broken: '已损坏', unavailable: '不可用', 'permission-lost': '访问权限已丢失', frozen: '已冻结' },
    objectType: { TextBlock: '文本块', Table: '表格', Shape: '形状', Chart: '图表', WorkspaceReference: 'Workspace 引用', MediaAsset: '媒体资源', CommentReview: '评论与审查', WorkItemRef: '工作项引用', DataRecord: '数据记录', PolicyMetadata: '策略元数据', ExtensionObject: '扩展对象' },
    action: { openSource: '打开来源', refresh: '刷新', viewChanges: '查看更改', freeze: '冻结', breakLink: '断开链接', relink: '重新链接到所选项' }, resolvedSourceVersion: '已解析的源版本', currentVersion: '当前', statusLabel: '状态', semanticTypeChanged: '语义类型已更改', noNetworkRetrieval: '除非明确配置源传输能力，否则不会从网络获取数据。', closeFabric: '关闭 Fabric',
  },
};

export function fabricGraphCopy(locale: WorkspaceLocale): FabricGraphCopy {
  return FABRIC_GRAPH_COPY[locale];
}
