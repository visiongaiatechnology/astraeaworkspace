// STATUS: PLATIN — typed seven-locale copy for the Workspace command palette.
import type { ShellCommandDescriptor } from '../home/workspaceShellHomeCore';
import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

export type CommandPaletteCategory = 'create' | 'file' | 'navigate' | 'security' | 'fabric' | 'insert' | 'privacy' | 'recent';

export interface CommandPaletteCopy {
  readonly paletteLabel: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly commandsLabel: string;
  readonly noResults: string;
  readonly createTitle: string;
  readonly createDescription: string;
  readonly openPdfTitle: string;
  readonly openPdfDescription: string;
  readonly documentDescription: string;
  readonly saveTitle: string;
  readonly saveDescription: string;
  readonly saveDisabled: string;
  readonly closeAllTitle: string;
  readonly closeAllDescription: string;
  readonly closeDisabled: string;
  readonly reopenTitle: string;
  readonly reopenDescription: string;
  readonly searchTitle: string;
  readonly searchDescription: string;
  readonly explorerTitle: string;
  readonly explorerDescription: string;
  readonly vaultTitle: string;
  readonly vaultDescription: string;
  readonly vaultDisabled: string;
  readonly netGateTitle: string;
  readonly netGateDescription: string;
  readonly fabricTitle: string;
  readonly fabricDescription: string;
  readonly insertChartTitle: string;
  readonly insertChartDescription: string;
  readonly insertChartDisabled: string;
  readonly privacyTitle: string;
  readonly privacyDescription: string;
  readonly categories: Readonly<Record<CommandPaletteCategory, string>>;
}

export const COMMAND_PALETTE_COPY: Readonly<Record<WorkspaceLocale, CommandPaletteCopy>> = {
  'de-DE': {
    paletteLabel: 'Befehlspalette', searchLabel: 'Befehle und Dokumente durchsuchen',
    searchPlaceholder: 'Befehl, Dokument, Einstellung oder Modul…', commandsLabel: 'Verfügbare Befehle', noResults: 'Keine passenden Befehle gefunden.',
    createTitle: 'Neues {app}-Dokument', createDescription: '{app}-Dokument erstellen.', openPdfTitle: 'PDF-Studio-Dokument öffnen', openPdfDescription: 'Ein unterstütztes PDF im PDF Studio öffnen.',
    documentDescription: '{app}-Dokument öffnen.', saveTitle: 'Verschlüsselten Container speichern', saveDescription: 'Das aktive Dokument im verschlüsselten Workspace-Container speichern.', saveDisabled: 'Kein speicherbares Dokument geöffnet.',
    closeAllTitle: 'Alle Dokumente schließen', closeAllDescription: 'Alle unveränderten Dokumente schließen; geänderte Dokumente müssen zuvor gespeichert werden.', closeDisabled: 'Keine Dokumente geöffnet.',
    reopenTitle: 'Geschlossenen Tab erneut öffnen', reopenDescription: 'Das zuletzt geschlossene lokale Dokument erneut öffnen.',
    searchTitle: 'Globale Suche', searchDescription: 'Den zentralen Workspace-Suchbereich öffnen.', explorerTitle: 'Workspace-Explorer öffnen', explorerDescription: 'Dokumente in der Workspace-Bibliothek durchsuchen und organisieren.',
    vaultTitle: 'KeyVault öffnen', vaultDescription: 'Dokumentschutz und KeyVault-Steuerung öffnen.', vaultDisabled: 'KeyVault-Anbieter ist nicht verfügbar.',
    netGateTitle: 'NetGate öffnen', netGateDescription: 'Netzwerkrichtlinien und Berechtigungsstatus anzeigen.', fabricTitle: 'Workspace Fabric öffnen', fabricDescription: 'Kanonische Live-Verknüpfungen anzeigen.',
    insertChartTitle: 'Diagramm einfügen', insertChartDescription: 'Ein Diagramm einfügen, sofern das aktive Dokument dies unterstützt.', insertChartDisabled: 'Im aktiven Kontext ist das Einfügen von Diagrammen nicht verfügbar.',
    privacyTitle: 'Datenschutzmodus umschalten', privacyDescription: 'Die lokale Datenschutzansicht umschalten.',
    categories: { create: 'Erstellen', file: 'Datei', navigate: 'Navigation', security: 'Sicherheit', fabric: 'Fabric', insert: 'Einfügen', privacy: 'Datenschutz', recent: 'Zuletzt verwendet' },
  },
  'en-US': {
    paletteLabel: 'Command palette', searchLabel: 'Search commands and documents',
    searchPlaceholder: 'Command, document, setting, or module…', commandsLabel: 'Available commands', noResults: 'No matching commands found.',
    createTitle: 'New {app} document', createDescription: 'Create a {app} document.', openPdfTitle: 'Open PDF Studio document', openPdfDescription: 'Open a supported PDF in PDF Studio.',
    documentDescription: 'Open {app} document.', saveTitle: 'Save encrypted container', saveDescription: 'Persist the active document through the encrypted Workspace container.', saveDisabled: 'No active saveable document.',
    closeAllTitle: 'Close all documents', closeAllDescription: 'Close every clean document; save changed documents first.', closeDisabled: 'No open document.',
    reopenTitle: 'Reopen closed tab', reopenDescription: 'Reopen the most recently closed local document.',
    searchTitle: 'Global search', searchDescription: 'Open the canonical Workspace Search hub.', explorerTitle: 'Open Workspace Explorer', explorerDescription: 'Browse and organize documents in the Workspace Library.',
    vaultTitle: 'Open KeyVault', vaultDescription: 'Open document protection and KeyVault controls.', vaultDisabled: 'KeyVault provider is unavailable.',
    netGateTitle: 'Open NetGate', netGateDescription: 'Inspect network policy and capability state.', fabricTitle: 'Open Workspace Fabric', fabricDescription: 'Inspect canonical live-object links.',
    insertChartTitle: 'Insert chart', insertChartDescription: 'Insert a chart when the active document supports it.', insertChartDisabled: 'Chart insertion is unavailable in the active context.',
    privacyTitle: 'Toggle privacy mode', privacyDescription: 'Toggle the local privacy projection.',
    categories: { create: 'Create', file: 'File', navigate: 'Navigate', security: 'Security', fabric: 'Fabric', insert: 'Insert', privacy: 'Privacy', recent: 'Recent' },
  },
  'es-ES': {
    paletteLabel: 'Paleta de comandos', searchLabel: 'Buscar comandos y documentos',
    searchPlaceholder: 'Comando, documento, ajuste o módulo…', commandsLabel: 'Comandos disponibles', noResults: 'No se encontraron comandos coincidentes.',
    createTitle: 'Nuevo documento de {app}', createDescription: 'Crear un documento de {app}.', openPdfTitle: 'Abrir documento de PDF Studio', openPdfDescription: 'Abrir un PDF compatible en PDF Studio.',
    documentDescription: 'Abrir documento de {app}.', saveTitle: 'Guardar contenedor cifrado', saveDescription: 'Guardar el documento activo en el contenedor cifrado de Workspace.', saveDisabled: 'No hay un documento activo que se pueda guardar.',
    closeAllTitle: 'Cerrar todos los documentos', closeAllDescription: 'Cerrar los documentos sin cambios; guardar primero los documentos modificados.', closeDisabled: 'No hay documentos abiertos.',
    reopenTitle: 'Reabrir pestaña cerrada', reopenDescription: 'Reabrir el documento local cerrado más recientemente.',
    searchTitle: 'Búsqueda global', searchDescription: 'Abrir el centro de búsqueda de Workspace.', explorerTitle: 'Abrir el explorador de Workspace', explorerDescription: 'Explorar y organizar documentos en la biblioteca de Workspace.',
    vaultTitle: 'Abrir KeyVault', vaultDescription: 'Abrir los controles de protección de documentos y KeyVault.', vaultDisabled: 'El proveedor de KeyVault no está disponible.',
    netGateTitle: 'Abrir NetGate', netGateDescription: 'Consultar la política de red y el estado de capacidades.', fabricTitle: 'Abrir Workspace Fabric', fabricDescription: 'Consultar enlaces canónicos a objetos activos.',
    insertChartTitle: 'Insertar gráfico', insertChartDescription: 'Insertar un gráfico si el documento activo lo admite.', insertChartDisabled: 'El contexto activo no permite insertar gráficos.',
    privacyTitle: 'Alternar el modo de privacidad', privacyDescription: 'Alternar la vista local de privacidad.',
    categories: { create: 'Crear', file: 'Archivo', navigate: 'Navegación', security: 'Seguridad', fabric: 'Fabric', insert: 'Insertar', privacy: 'Privacidad', recent: 'Recientes' },
  },
  'it-IT': {
    paletteLabel: 'Tavolozza dei comandi', searchLabel: 'Cerca comandi e documenti',
    searchPlaceholder: 'Comando, documento, impostazione o modulo…', commandsLabel: 'Comandi disponibili', noResults: 'Nessun comando corrispondente trovato.',
    createTitle: 'Nuovo documento {app}', createDescription: 'Crea un documento {app}.', openPdfTitle: 'Apri documento PDF Studio', openPdfDescription: 'Apri un PDF supportato in PDF Studio.',
    documentDescription: 'Apri documento {app}.', saveTitle: 'Salva contenitore crittografato', saveDescription: 'Salva il documento attivo nel contenitore Workspace crittografato.', saveDisabled: 'Nessun documento attivo salvabile.',
    closeAllTitle: 'Chiudi tutti i documenti', closeAllDescription: 'Chiudi i documenti senza modifiche; salva prima quelli modificati.', closeDisabled: 'Nessun documento aperto.',
    reopenTitle: 'Riapri scheda chiusa', reopenDescription: 'Riapri l’ultimo documento locale chiuso.',
    searchTitle: 'Ricerca globale', searchDescription: 'Apri il centro di ricerca Workspace.', explorerTitle: 'Apri Workspace Explorer', explorerDescription: 'Esplora e organizza i documenti nella libreria Workspace.',
    vaultTitle: 'Apri KeyVault', vaultDescription: 'Apri i controlli per la protezione dei documenti e KeyVault.', vaultDisabled: 'Il provider KeyVault non è disponibile.',
    netGateTitle: 'Apri NetGate', netGateDescription: 'Esamina i criteri di rete e lo stato delle funzionalità.', fabricTitle: 'Apri Workspace Fabric', fabricDescription: 'Esamina i collegamenti canonici agli oggetti attivi.',
    insertChartTitle: 'Inserisci grafico', insertChartDescription: 'Inserisci un grafico se il documento attivo lo supporta.', insertChartDisabled: 'Il contesto attivo non supporta l’inserimento di grafici.',
    privacyTitle: 'Attiva o disattiva la modalità privacy', privacyDescription: 'Attiva o disattiva la proiezione locale della privacy.',
    categories: { create: 'Crea', file: 'File', navigate: 'Navigazione', security: 'Sicurezza', fabric: 'Fabric', insert: 'Inserisci', privacy: 'Privacy', recent: 'Recenti' },
  },
  'ja-JP': {
    paletteLabel: 'コマンドパレット', searchLabel: 'コマンドとドキュメントを検索',
    searchPlaceholder: 'コマンド、ドキュメント、設定、モジュールを検索…', commandsLabel: '利用可能なコマンド', noResults: '一致するコマンドが見つかりません。',
    createTitle: '{app}ドキュメントを新規作成', createDescription: '{app}ドキュメントを作成します。', openPdfTitle: 'PDF Studioドキュメントを開く', openPdfDescription: '対応するPDFをPDF Studioで開きます。',
    documentDescription: '{app}ドキュメントを開きます。', saveTitle: '暗号化コンテナーを保存', saveDescription: 'アクティブなドキュメントを暗号化されたWorkspaceコンテナーに保存します。', saveDisabled: '保存できるアクティブなドキュメントがありません。',
    closeAllTitle: 'すべてのドキュメントを閉じる', closeAllDescription: '変更のないドキュメントを閉じます。変更済みのドキュメントは先に保存してください。', closeDisabled: '開いているドキュメントがありません。',
    reopenTitle: '閉じたタブを再度開く', reopenDescription: '最後に閉じたローカルドキュメントを再度開きます。',
    searchTitle: 'グローバル検索', searchDescription: 'Workspace検索ハブを開きます。', explorerTitle: 'Workspace Explorerを開く', explorerDescription: 'Workspaceライブラリ内のドキュメントを表示、整理します。',
    vaultTitle: 'KeyVaultを開く', vaultDescription: 'ドキュメント保護とKeyVaultの設定を開きます。', vaultDisabled: 'KeyVaultプロバイダーを利用できません。',
    netGateTitle: 'NetGateを開く', netGateDescription: 'ネットワークポリシーと機能の状態を確認します。', fabricTitle: 'Workspace Fabricを開く', fabricDescription: '正規のライブオブジェクトリンクを確認します。',
    insertChartTitle: 'グラフを挿入', insertChartDescription: 'アクティブなドキュメントが対応している場合にグラフを挿入します。', insertChartDisabled: '現在のコンテキストではグラフを挿入できません。',
    privacyTitle: 'プライバシーモードを切り替え', privacyDescription: 'ローカルのプライバシー表示を切り替えます。',
    categories: { create: '作成', file: 'ファイル', navigate: '移動', security: 'セキュリティ', fabric: 'Fabric', insert: '挿入', privacy: 'プライバシー', recent: '最近使用' },
  },
  'ru-RU': {
    paletteLabel: 'Палитра команд', searchLabel: 'Поиск команд и документов',
    searchPlaceholder: 'Команда, документ, настройка или модуль…', commandsLabel: 'Доступные команды', noResults: 'Подходящие команды не найдены.',
    createTitle: 'Создать документ {app}', createDescription: 'Создать документ {app}.', openPdfTitle: 'Открыть документ PDF Studio', openPdfDescription: 'Открыть поддерживаемый PDF в PDF Studio.',
    documentDescription: 'Открыть документ {app}.', saveTitle: 'Сохранить зашифрованный контейнер', saveDescription: 'Сохранить активный документ в зашифрованном контейнере Workspace.', saveDisabled: 'Нет активного документа для сохранения.',
    closeAllTitle: 'Закрыть все документы', closeAllDescription: 'Закрыть документы без изменений; изменённые документы сначала сохраните.', closeDisabled: 'Нет открытых документов.',
    reopenTitle: 'Повторно открыть закрытую вкладку', reopenDescription: 'Повторно открыть последний закрытый локальный документ.',
    searchTitle: 'Глобальный поиск', searchDescription: 'Открыть центр поиска Workspace.', explorerTitle: 'Открыть обозреватель Workspace', explorerDescription: 'Просматривать документы в библиотеке Workspace и управлять ими.',
    vaultTitle: 'Открыть KeyVault', vaultDescription: 'Открыть настройки защиты документов и KeyVault.', vaultDisabled: 'Поставщик KeyVault недоступен.',
    netGateTitle: 'Открыть NetGate', netGateDescription: 'Просмотреть сетевую политику и состояние возможностей.', fabricTitle: 'Открыть Workspace Fabric', fabricDescription: 'Просмотреть канонические связи с живыми объектами.',
    insertChartTitle: 'Вставить диаграмму', insertChartDescription: 'Вставить диаграмму, если активный документ это поддерживает.', insertChartDisabled: 'Вставка диаграмм недоступна в текущем контексте.',
    privacyTitle: 'Переключить режим конфиденциальности', privacyDescription: 'Переключить локальное представление конфиденциальности.',
    categories: { create: 'Создание', file: 'Файл', navigate: 'Переход', security: 'Безопасность', fabric: 'Fabric', insert: 'Вставка', privacy: 'Конфиденциальность', recent: 'Недавние' },
  },
  'zh-CN': {
    paletteLabel: '命令面板', searchLabel: '搜索命令和文档',
    searchPlaceholder: '搜索命令、文档、设置或模块…', commandsLabel: '可用命令', noResults: '未找到匹配的命令。',
    createTitle: '新建 {app} 文档', createDescription: '创建 {app} 文档。', openPdfTitle: '打开 PDF Studio 文档', openPdfDescription: '在 PDF Studio 中打开受支持的 PDF。',
    documentDescription: '打开 {app} 文档。', saveTitle: '保存加密容器', saveDescription: '将当前文档保存到加密的 Workspace 容器。', saveDisabled: '没有可保存的当前文档。',
    closeAllTitle: '关闭所有文档', closeAllDescription: '关闭未修改的文档；请先保存已修改的文档。', closeDisabled: '没有打开的文档。',
    reopenTitle: '重新打开已关闭的标签页', reopenDescription: '重新打开最近关闭的本地文档。',
    searchTitle: '全局搜索', searchDescription: '打开 Workspace 搜索中心。', explorerTitle: '打开 Workspace Explorer', explorerDescription: '浏览和整理 Workspace 库中的文档。',
    vaultTitle: '打开 KeyVault', vaultDescription: '打开文档保护和 KeyVault 控件。', vaultDisabled: 'KeyVault 提供程序不可用。',
    netGateTitle: '打开 NetGate', netGateDescription: '查看网络策略和功能状态。', fabricTitle: '打开 Workspace Fabric', fabricDescription: '查看规范的实时对象链接。',
    insertChartTitle: '插入图表', insertChartDescription: '在当前文档支持时插入图表。', insertChartDisabled: '当前上下文不支持插入图表。',
    privacyTitle: '切换隐私模式', privacyDescription: '切换本地隐私视图。',
    categories: { create: '创建', file: '文件', navigate: '导航', security: '安全', fabric: 'Fabric', insert: '插入', privacy: '隐私', recent: '最近' },
  },
} satisfies Record<WorkspaceLocale, CommandPaletteCopy>;

const CREATE_COMMANDS: Readonly<Record<string, string>> = {
  'new-writer': 'Writer', 'new-grid': 'Grid', 'new-present': 'Present', 'new-notes': 'Notes', 'new-draw': 'Draw',
  'new-whiteboard': 'Whiteboard', 'new-publish': 'Publish', 'new-insight': 'Insight', 'new-tasks': 'Tasks',
  'new-vault': 'Vault', 'new-connect': 'Connect', 'new-automate': 'Automate', 'new-admin-policy': 'Admin Policy',
};

function replaceApp(copy: string, app: string): string {
  return copy.replaceAll('{app}', app);
}

export function localizeCommandPaletteDescriptor(item: ShellCommandDescriptor, locale: WorkspaceLocale): ShellCommandDescriptor {
  const copy = COMMAND_PALETTE_COPY[locale];
  const category = (value: CommandPaletteCategory): string => copy.categories[value];
  const localized = { ...item };
  const app = CREATE_COMMANDS[item.id];
  if (app) return { ...localized, title: replaceApp(copy.createTitle, app), description: replaceApp(copy.createDescription, app), category: category('create') };
  if (item.id === 'new-pdf') return { ...localized, title: copy.openPdfTitle, description: copy.openPdfDescription, category: category('create') };
  if (item.id.startsWith('open-doc:')) return { ...localized, description: replaceApp(copy.documentDescription, item.description.replace(/^Open (.+) document$/u, '$1')), category: category('recent') };

  const entries: Readonly<Record<string, { title: string; description: string; category: CommandPaletteCategory; disabledReason?: string }>> = {
    'save-vwc': { title: copy.saveTitle, description: copy.saveDescription, category: 'file', disabledReason: copy.saveDisabled },
    'close-all': { title: copy.closeAllTitle, description: copy.closeAllDescription, category: 'file', disabledReason: copy.closeDisabled },
    'reopen-closed': { title: copy.reopenTitle, description: copy.reopenDescription, category: 'file' },
    'open-search': { title: copy.searchTitle, description: copy.searchDescription, category: 'navigate' },
    'open-explorer': { title: copy.explorerTitle, description: copy.explorerDescription, category: 'navigate' },
    'open-vault': { title: copy.vaultTitle, description: copy.vaultDescription, category: 'security', disabledReason: copy.vaultDisabled },
    'open-netgate': { title: copy.netGateTitle, description: copy.netGateDescription, category: 'security' },
    'open-fabric': { title: copy.fabricTitle, description: copy.fabricDescription, category: 'fabric' },
    'insert-chart': { title: copy.insertChartTitle, description: copy.insertChartDescription, category: 'insert', disabledReason: copy.insertChartDisabled },
    'toggle-privacy': { title: copy.privacyTitle, description: copy.privacyDescription, category: 'privacy' },
  };
  const entry = entries[item.id];
  if (!entry) return localized;
  return { ...localized, title: entry.title, description: entry.description, category: category(entry.category), disabledReason: entry.disabledReason };
}
