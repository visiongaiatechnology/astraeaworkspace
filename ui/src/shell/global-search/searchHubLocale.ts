// STATUS: PLATIN — typed seven-locale copy for global Search and its policy controls.
import type { SearchContentGroup } from '../../platform/search/searchTypes';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export interface SearchHubCopy {
  readonly title: string;
  readonly metadataProtected: string;
  readonly saveSearch: string;
  readonly saveSearchTitle: string;
  readonly scale: string;
  readonly groupsLabel: string;
  readonly groups: Readonly<Record<SearchContentGroup, string>>;
  readonly searching: string;
  readonly invalidQuery: string;
  readonly unavailable: string;
  readonly resultCount: string;
  readonly resultsLabel: string;
  readonly lexicalMatch: string;
  readonly copyLink: string;
  readonly openDocument: string;
  readonly administration: {
    readonly title: string;
    readonly historyToolbar: string;
    readonly undo: string;
    readonly redo: string;
    readonly historyEnabled: string;
    readonly localOcr: string;
    readonly semanticRanking: string;
    readonly externalConnectorIndexing: string;
    readonly allowlistRequired: string;
    readonly coreStarting: string;
    readonly coreReady: string;
    readonly coreUnavailable: string;
    readonly locked: string;
    readonly policySaved: string;
    readonly policySaveFailed: string;
    readonly policyRestored: string;
    readonly policyRestoreFailed: string;
    readonly historyCleared: string;
    readonly historyClearFailed: string;
    readonly quota: string;
    readonly clearHistory: string;
  };
}

export const SEARCH_HUB_COPY: Readonly<Record<WorkspaceLocale, SearchHubCopy>> = {
  'de-DE': {
    title: 'Astraea Search Hub', metadataProtected: 'Metadaten geschützt', saveSearch: 'Speichern', saveSearchTitle: 'Suche lokal speichern', scale: 'Suchansicht skalieren',
    groupsLabel: 'Suchergebnisgruppen', groups: { all: 'Alle', documents: 'Dokumente', people: 'Personen', work: 'Arbeit', messages: 'Nachrichten', data: 'Daten', spaces: 'Spaces' },
    searching: 'Verschlüsselter lokaler Index wird durchsucht…', invalidQuery: 'Die Suchanfrage ist ungültig. Prüfe Filter und Anführungszeichen.',
    unavailable: 'Der native Search Core ist nicht erreichbar; die lokale Suche ergab keine Treffer.',
    resultCount: 'Treffer: {visible} · Gespeicherte Suchen: {saved} · Lokale Verlaufseinträge: {history}', resultsLabel: 'Suchergebnisse',
    lexicalMatch: 'Texttreffer', copyLink: 'Link kopieren', openDocument: 'Öffnen',
    administration: {
      title: 'Search-Administration & Datenschutz', historyToolbar: 'Suchrichtlinien-Verlauf', undo: 'Richtlinie rückgängig', redo: 'Richtlinie wiederholen',
      historyEnabled: 'Lokalen Suchverlauf speichern', localOcr: 'Lokale OCR-Indexierung', semanticRanking: 'Lokales semantisches Ranking',
      externalConnectorIndexing: 'Externe Connector-Indexierung', allowlistRequired: 'Allowlist erforderlich',
      coreStarting: 'Verschlüsselter Suchindex wird verbunden', coreReady: 'Verschlüsselter Search Core bereit · Dokumente: {documents} · Generation: {generation}',
      coreUnavailable: 'Native Search Core ist nicht verfügbar', locked: ' · Metadaten gesperrt',
      policySaved: 'Suchrichtlinie verschlüsselt gespeichert', policySaveFailed: 'Native Suchrichtlinie ist derzeit nicht verfügbar',
      policyRestored: 'Suchrichtlinie wiederhergestellt', policyRestoreFailed: 'Wiederhergestellte Richtlinie konnte nicht gespeichert werden',
      historyCleared: 'Lokaler Suchverlauf gelöscht', historyClearFailed: 'Suchverlauf konnte nicht gelöscht werden',
      quota: 'Indexkontingent: {quota} MiB', clearHistory: 'Suchverlauf löschen',
    },
  },
  'en-US': {
    title: 'Astraea Search Hub', metadataProtected: 'Metadata protected', saveSearch: 'Save', saveSearchTitle: 'Save search locally', scale: 'Search view scale',
    groupsLabel: 'Search result groups', groups: { all: 'All', documents: 'Documents', people: 'People', work: 'Work', messages: 'Messages', data: 'Data', spaces: 'Spaces' },
    searching: 'Searching the encrypted local index…', invalidQuery: 'The search query is invalid. Check its filters and quotation marks.',
    unavailable: 'Native Search Core is unavailable; local search returned no results.',
    resultCount: 'Results: {visible} · Saved searches: {saved} · Local history entries: {history}', resultsLabel: 'Search results',
    lexicalMatch: 'Text match', copyLink: 'Copy link', openDocument: 'Open',
    administration: {
      title: 'Search Administration & Privacy', historyToolbar: 'Search policy history', undo: 'Undo policy', redo: 'Redo policy',
      historyEnabled: 'Save local search history', localOcr: 'Local OCR indexing', semanticRanking: 'Local semantic ranking',
      externalConnectorIndexing: 'External connector indexing', allowlistRequired: 'Allowlist required',
      coreStarting: 'Connecting to encrypted search index', coreReady: 'Encrypted Search Core ready · Documents: {documents} · Generation: {generation}',
      coreUnavailable: 'Native Search Core is unavailable', locked: ' · Metadata locked',
      policySaved: 'Search policy saved encrypted', policySaveFailed: 'Native search policy is currently unavailable',
      policyRestored: 'Search policy restored', policyRestoreFailed: 'Restored policy could not be saved',
      historyCleared: 'Local search history cleared', historyClearFailed: 'Search history could not be cleared',
      quota: 'Index quota: {quota} MiB', clearHistory: 'Clear search history',
    },
  },
  'es-ES': {
    title: 'Astraea Search Hub', metadataProtected: 'Metadatos protegidos', saveSearch: 'Guardar', saveSearchTitle: 'Guardar búsqueda localmente', scale: 'Escala de la vista de búsqueda',
    groupsLabel: 'Grupos de resultados', groups: { all: 'Todos', documents: 'Documentos', people: 'Personas', work: 'Trabajo', messages: 'Mensajes', data: 'Datos', spaces: 'Spaces' },
    searching: 'Buscando en el índice local cifrado…', invalidQuery: 'La búsqueda no es válida. Comprueba los filtros y las comillas.',
    unavailable: 'Search Core nativo no está disponible; la búsqueda local no obtuvo resultados.',
    resultCount: 'Resultados: {visible} · Búsquedas guardadas: {saved} · Entradas del historial local: {history}', resultsLabel: 'Resultados de búsqueda',
    lexicalMatch: 'Coincidencia de texto', copyLink: 'Copiar enlace', openDocument: 'Abrir',
    administration: {
      title: 'Administración y privacidad de Search', historyToolbar: 'Historial de políticas de búsqueda', undo: 'Deshacer política', redo: 'Rehacer política',
      historyEnabled: 'Guardar el historial de búsqueda local', localOcr: 'Indexación OCR local', semanticRanking: 'Clasificación semántica local',
      externalConnectorIndexing: 'Indexación de conectores externos', allowlistRequired: 'Se requiere una lista permitida',
      coreStarting: 'Conectando con el índice de búsqueda cifrado', coreReady: 'Search Core cifrado listo · Documentos: {documents} · Generación: {generation}',
      coreUnavailable: 'Search Core nativo no está disponible', locked: ' · Metadatos bloqueados',
      policySaved: 'Política de búsqueda guardada cifrada', policySaveFailed: 'La política de búsqueda nativa no está disponible',
      policyRestored: 'Política de búsqueda restaurada', policyRestoreFailed: 'No se pudo guardar la política restaurada',
      historyCleared: 'Historial de búsqueda local eliminado', historyClearFailed: 'No se pudo eliminar el historial de búsqueda',
      quota: 'Cuota del índice: {quota} MiB', clearHistory: 'Eliminar historial de búsqueda',
    },
  },
  'it-IT': {
    title: 'Astraea Search Hub', metadataProtected: 'Metadati protetti', saveSearch: 'Salva', saveSearchTitle: 'Salva ricerca in locale', scale: 'Scala vista di ricerca',
    groupsLabel: 'Gruppi dei risultati', groups: { all: 'Tutti', documents: 'Documenti', people: 'Persone', work: 'Lavoro', messages: 'Messaggi', data: 'Dati', spaces: 'Spaces' },
    searching: 'Ricerca nell’indice locale crittografato…', invalidQuery: 'La ricerca non è valida. Controlla filtri e virgolette.',
    unavailable: 'Search Core nativo non è disponibile; la ricerca locale non ha trovato risultati.',
    resultCount: 'Risultati: {visible} · Ricerche salvate: {saved} · Voci della cronologia locale: {history}', resultsLabel: 'Risultati di ricerca',
    lexicalMatch: 'Corrispondenza testuale', copyLink: 'Copia link', openDocument: 'Apri',
    administration: {
      title: 'Amministrazione e privacy Search', historyToolbar: 'Cronologia criteri di ricerca', undo: 'Annulla criterio', redo: 'Ripeti criterio',
      historyEnabled: 'Salva la cronologia di ricerca locale', localOcr: 'Indicizzazione OCR locale', semanticRanking: 'Classificazione semantica locale',
      externalConnectorIndexing: 'Indicizzazione connettori esterni', allowlistRequired: 'È richiesto un elenco consentiti',
      coreStarting: 'Connessione all’indice di ricerca crittografato', coreReady: 'Search Core crittografato pronto · Documenti: {documents} · Generazione: {generation}',
      coreUnavailable: 'Search Core nativo non è disponibile', locked: ' · Metadati bloccati',
      policySaved: 'Criterio di ricerca salvato in forma crittografata', policySaveFailed: 'Il criterio di ricerca nativo non è disponibile',
      policyRestored: 'Criterio di ricerca ripristinato', policyRestoreFailed: 'Impossibile salvare il criterio ripristinato',
      historyCleared: 'Cronologia di ricerca locale eliminata', historyClearFailed: 'Impossibile eliminare la cronologia di ricerca',
      quota: 'Quota indice: {quota} MiB', clearHistory: 'Elimina cronologia di ricerca',
    },
  },
  'ja-JP': {
    title: 'Astraea Search Hub', metadataProtected: 'メタデータを保護しています', saveSearch: '保存', saveSearchTitle: '検索をローカルに保存', scale: '検索画面の倍率',
    groupsLabel: '検索結果グループ', groups: { all: 'すべて', documents: 'ドキュメント', people: 'ユーザー', work: '作業', messages: 'メッセージ', data: 'データ', spaces: 'Spaces' },
    searching: '暗号化されたローカルインデックスを検索しています…', invalidQuery: '検索条件が無効です。フィルターと引用符を確認してください。',
    unavailable: 'ネイティブ Search Core を利用できません。ローカル検索で結果が見つかりませんでした。',
    resultCount: '結果 {visible} 件 · 保存済み検索 {saved} 件 · ローカル履歴 {history} 件', resultsLabel: '検索結果',
    lexicalMatch: 'テキスト一致', copyLink: 'リンクをコピー', openDocument: '開く',
    administration: {
      title: '検索の管理とプライバシー', historyToolbar: '検索ポリシーの履歴', undo: 'ポリシーを元に戻す', redo: 'ポリシーをやり直す',
      historyEnabled: 'ローカル検索履歴を保存', localOcr: 'ローカル OCR インデックス作成', semanticRanking: 'ローカル意味ランキング',
      externalConnectorIndexing: '外部コネクターのインデックス作成', allowlistRequired: '許可リストが必要です',
      coreStarting: '暗号化された検索インデックスに接続しています', coreReady: '暗号化 Search Core の準備完了 · ドキュメント {documents} 件 · 世代 {generation}',
      coreUnavailable: 'ネイティブ Search Core を利用できません', locked: ' · メタデータはロックされています',
      policySaved: '検索ポリシーを暗号化して保存しました', policySaveFailed: 'ネイティブ検索ポリシーを利用できません',
      policyRestored: '検索ポリシーを復元しました', policyRestoreFailed: '復元したポリシーを保存できませんでした',
      historyCleared: 'ローカル検索履歴を消去しました', historyClearFailed: '検索履歴を消去できませんでした',
      quota: 'インデックス容量: {quota} MiB', clearHistory: '検索履歴を消去',
    },
  },
  'ru-RU': {
    title: 'Astraea Search Hub', metadataProtected: 'Метаданные защищены', saveSearch: 'Сохранить', saveSearchTitle: 'Сохранить поиск локально', scale: 'Масштаб интерфейса поиска',
    groupsLabel: 'Группы результатов поиска', groups: { all: 'Все', documents: 'Документы', people: 'Люди', work: 'Работа', messages: 'Сообщения', data: 'Данные', spaces: 'Spaces' },
    searching: 'Поиск в зашифрованном локальном индексе…', invalidQuery: 'Недопустимый поисковый запрос. Проверьте фильтры и кавычки.',
    unavailable: 'Собственное ядро Search Core недоступно; локальный поиск не дал результатов.',
    resultCount: 'Результаты: {visible} · Сохранённые запросы: {saved} · Записи локальной истории: {history}', resultsLabel: 'Результаты поиска',
    lexicalMatch: 'Текстовое совпадение', copyLink: 'Копировать ссылку', openDocument: 'Открыть',
    administration: {
      title: 'Управление поиском и конфиденциальность', historyToolbar: 'История политик поиска', undo: 'Отменить политику', redo: 'Повторить политику',
      historyEnabled: 'Сохранять локальную историю поиска', localOcr: 'Локальная индексация OCR', semanticRanking: 'Локальное семантическое ранжирование',
      externalConnectorIndexing: 'Индексация внешних подключений', allowlistRequired: 'Требуется список разрешённых подключений',
      coreStarting: 'Подключение к зашифрованному поисковому индексу', coreReady: 'Зашифрованное ядро Search Core готово · Документы: {documents} · Поколение: {generation}',
      coreUnavailable: 'Собственное ядро Search Core недоступно', locked: ' · Метаданные заблокированы',
      policySaved: 'Политика поиска сохранена в зашифрованном виде', policySaveFailed: 'Собственная политика поиска сейчас недоступна',
      policyRestored: 'Политика поиска восстановлена', policyRestoreFailed: 'Не удалось сохранить восстановленную политику',
      historyCleared: 'Локальная история поиска очищена', historyClearFailed: 'Не удалось очистить историю поиска',
      quota: 'Квота индекса: {quota} МиБ', clearHistory: 'Очистить историю поиска',
    },
  },
  'zh-CN': {
    title: 'Astraea Search Hub', metadataProtected: '元数据已保护', saveSearch: '保存', saveSearchTitle: '在本地保存搜索', scale: '搜索界面缩放',
    groupsLabel: '搜索结果分组', groups: { all: '全部', documents: '文档', people: '人员', work: '工作', messages: '消息', data: '数据', spaces: 'Spaces' },
    searching: '正在搜索加密的本地索引…', invalidQuery: '搜索条件无效。请检查筛选条件和引号。',
    unavailable: '本机 Search Core 不可用；本地搜索没有找到结果。',
    resultCount: '结果：{visible} · 已保存搜索：{saved} · 本地历史记录：{history}', resultsLabel: '搜索结果',
    lexicalMatch: '文本匹配', copyLink: '复制链接', openDocument: '打开',
    administration: {
      title: '搜索管理与隐私', historyToolbar: '搜索策略历史记录', undo: '撤销策略', redo: '重做策略',
      historyEnabled: '保存本地搜索历史', localOcr: '本地 OCR 索引', semanticRanking: '本地语义排序',
      externalConnectorIndexing: '外部连接器索引', allowlistRequired: '需要允许列表',
      coreStarting: '正在连接加密搜索索引', coreReady: '加密 Search Core 已就绪 · 文档：{documents} · 代次：{generation}',
      coreUnavailable: '本机 Search Core 不可用', locked: ' · 元数据已锁定',
      policySaved: '搜索策略已加密保存', policySaveFailed: '本机搜索策略当前不可用',
      policyRestored: '搜索策略已恢复', policyRestoreFailed: '无法保存已恢复的策略',
      historyCleared: '本地搜索历史已清除', historyClearFailed: '无法清除搜索历史',
      quota: '索引配额：{quota} MiB', clearHistory: '清除搜索历史',
    },
  },
} satisfies Record<WorkspaceLocale, SearchHubCopy>;

export function formatSearchCopy(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-z]+)\}/giu, (placeholder, key: string) => String(values[key] ?? placeholder));
}
