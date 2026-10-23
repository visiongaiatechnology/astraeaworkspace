import type { WorkspaceLocale } from '../localization/workspaceLocaleTypes';

/** The honest channels for optional, voluntary support. Addresses are displayed, never auto-opened. */
export interface SupportMethod {
  readonly id: 'paypal' | 'bitcoin' | 'ethereum';
  readonly name: string;
  readonly network: string;
  readonly value: string;
}

export const SUPPORT_METHODS: readonly SupportMethod[] = [
  { id: 'paypal', name: 'PayPal', network: 'paypal.me', value: 'paypal.me/dergoldenelotus' },
  { id: 'bitcoin', name: 'Bitcoin', network: 'BTC', value: 'bc1q3ue5gq822tddmkdrek79adlkm36fatat3lz0dm' },
  { id: 'ethereum', name: 'Ethereum / USDT', network: 'ERC-20', value: '0xD37DEfb09e07bD775EaaE9ccDaFE3a5b2348Fe85' },
];

export interface SupportCopy {
  readonly title: string;
  readonly body: string;
  readonly note: string;
  readonly copy: string;
  readonly copied: string;
  readonly openSource: string;
}

export const SUPPORT_COPY: Record<WorkspaceLocale, SupportCopy> = {
  'de-DE': {
    title: 'Astraea Workspace unterstützen',
    body: 'Astraea Workspace wird von einem einzelnen Entwickler mit KI-Unterstützung gebaut. Ressourcen sind derzeit knapp — jede freiwillige Unterstützung hilft, die Alpha weiterzuentwickeln.',
    note: 'Freiwillige Spende, keine Gegenleistung, kein Kauf und keine Supportzusage. Beträge und Netzwerkgebühren liegen bei dir.',
    copy: 'Adresse kopieren',
    copied: 'Kopiert',
    openSource: 'Quellcode: AGPL-3.0-only · VisionGaiaTechnology',
  },
  'en-US': {
    title: 'Support Astraea Workspace',
    body: 'Astraea Workspace is built by a single developer with AI assistance. Resources are currently scarce — every voluntary contribution helps move the alpha forward.',
    note: 'Voluntary donation, no consideration, no purchase and no support commitment. Amounts and network fees are yours.',
    copy: 'Copy address',
    copied: 'Copied',
    openSource: 'Source: AGPL-3.0-only · VisionGaiaTechnology',
  },
  'es-ES': {
    title: 'Apoya Astraea Workspace',
    body: 'Astraea Workspace lo desarrolla un único desarrollador con ayuda de IA. Los recursos son escasos; cada contribución voluntaria ayuda a avanzar la alfa.',
    note: 'Donación voluntaria, sin contraprestación, sin compra y sin compromiso de soporte. Importes y comisiones de red corren por tu cuenta.',
    copy: 'Copiar dirección',
    copied: 'Copiado',
    openSource: 'Código: AGPL-3.0-only · VisionGaiaTechnology',
  },
  'it-IT': {
    title: 'Sostieni Astraea Workspace',
    body: 'Astraea Workspace è sviluppato da un singolo sviluppatore con supporto IA. Le risorse sono scarse; ogni contributo volontario aiuta a far avanzare l’alfa.',
    note: 'Donazione volontaria, senza controprestazione, senza acquisto e senza impegno di supporto. Importi e commissioni di rete sono a tuo carico.',
    copy: 'Copia indirizzo',
    copied: 'Copiato',
    openSource: 'Codice: AGPL-3.0-only · VisionGaiaTechnology',
  },
  'ja-JP': {
    title: 'Astraea Workspace を支援する',
    body: 'Astraea Workspace は一人の開発者が AI の支援を受けて開発しています。現在リソースが限られており、任意の支援がアルファ版の前進を助けます。',
    note: '任意の寄付です。対価・購入・サポート保証はありません。金額とネットワーク手数料はご自身の負担です。',
    copy: 'アドレスをコピー',
    copied: 'コピーしました',
    openSource: 'ソース: AGPL-3.0-only · VisionGaiaTechnology',
  },
  'ru-RU': {
    title: 'Поддержать Astraea Workspace',
    body: 'Astraea Workspace разрабатывает один разработчик с помощью ИИ. Ресурсы сейчас ограничены — любая добровольная поддержка помогает развивать альфу.',
    note: 'Добровольное пожертвование, без встречного предоставления, покупки и обязательств поддержки. Суммы и сетевые комиссии — за ваш счёт.',
    copy: 'Копировать адрес',
    copied: 'Скопировано',
    openSource: 'Исходный код: AGPL-3.0-only · VisionGaiaTechnology',
  },
  'zh-CN': {
    title: '支持 Astraea Workspace',
    body: 'Astraea Workspace 由一位开发者在 AI 辅助下构建。目前资源有限——任何自愿支持都能帮助推进 Alpha 版本。',
    note: '自愿捐赠，不构成对价、购买或支持承诺。金额与网络费用由你承担。',
    copy: '复制地址',
    copied: '已复制',
    openSource: '源代码：AGPL-3.0-only · VisionGaiaTechnology',
  },
};

export interface AlphaNoticeCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly worksTitle: string;
  readonly works: readonly [string, string, string];
  readonly limitsTitle: string;
  readonly limits: readonly [string, string, string, string];
  readonly errorsTitle: string;
  readonly errorsBody: string;
  readonly supportTitle: string;
  readonly supportBody: string;
}

export const ALPHA_NOTICE_COPY: Record<WorkspaceLocale, AlphaNoticeCopy> = {
  'de-DE': {
    eyebrow: 'Alpha 0.1 · ehrlicher Stand',
    title: 'Diese Version ist eine Alpha.',
    body: 'Sie ist die erste öffentliche Ausbaustufe und zum Testen gedacht. Bitte arbeite nur mit Daten, für die du ein eigenes Backup hast.',
    worksTitle: 'Das funktioniert bereits',
    works: [
      'Lokal verschlüsselte Dokumente in Writer, Grid, Present, Notes und Tasks — inklusive Speichern und Wiederöffnen.',
      'Exporte, Workspace-Backup/Restore und Sicherung des Workspace-Ordners über echte Dateien.',
      'Vault-Sperre für Geheimnisse; Admin & Policy bleibt bewusst gesperrt, bis Richtlinien wirklich durchgesetzt werden.',
    ],
    limitsTitle: 'Das fehlt oder ist begrenzt',
    limits: [
      'Kein Cloud-Sync, keine Echtzeit-Kollaboration und kein KI-Assistent.',
      'PDF-Bearbeitung, Connect, Automate und weitere Module sind nur Vorschau oder bewusst limitiert.',
      'Kein automatisches Update; der Installer ist noch nicht signiert.',
      'Einige Themes, Animationen und Importformate sind unvollständig.',
    ],
    errorsTitle: 'Fehler sind möglich',
    errorsBody: 'Alpha 0.1 kann Fehler enthalten und ist nicht für kritische Daten ohne eigenes Backup geeignet. Bitte regelmäßig ein Workspace-Backup erstellen und Probleme melden. Es gibt keine Support- oder Verfügbarkeitszusage.',
    supportTitle: 'Unabhängig entwickelt',
    supportBody: 'Hinter Astraea Workspace steht ein einzelner Entwickler mit KI-Unterstützung. Wenn du die Alpha freiwillig unterstützen möchtest, findest du die Möglichkeiten hier und später in den Einstellungen.',
  },
  'en-US': {
    eyebrow: 'Alpha 0.1 · honest status',
    title: 'This version is an alpha.',
    body: 'It is the first public build and intended for testing. Only work with data you have your own backup of.',
    worksTitle: 'What already works',
    works: [
      'Locally encrypted documents in Writer, Grid, Present, Notes and Tasks — including save and reopen.',
      'Exports, workspace backup/restore and safeguarding the workspace folder through real files.',
      'Vault lock for secrets; Admin & Policy stays deliberately disabled until policies are genuinely enforced.',
    ],
    limitsTitle: 'What is missing or limited',
    limits: [
      'No cloud sync, no real-time collaboration and no AI assistant.',
      'PDF editing, Connect, Automate and further modules are preview-only or deliberately limited.',
      'No automatic update; the installer is not signed yet.',
      'Some themes, animations and import formats are incomplete.',
    ],
    errorsTitle: 'Errors are possible',
    errorsBody: 'Alpha 0.1 may contain errors and is not suitable for critical data without your own backup. Please create a workspace backup regularly and report problems. There is no support or availability commitment.',
    supportTitle: 'Independently built',
    supportBody: 'Astraea Workspace is built by a single developer with AI assistance. If you want to support the alpha voluntarily, the options are here and later in Settings.',
  },
  'es-ES': {
    eyebrow: 'Alpha 0.1 · estado honesto',
    title: 'Esta versión es una alfa.',
    body: 'Es la primera compilación pública y está pensada para probar. Trabaja solo con datos de los que tengas tu propia copia de seguridad.',
    worksTitle: 'Lo que ya funciona',
    works: [
      'Documentos cifrados localmente en Writer, Grid, Present, Notes y Tasks, incluido guardar y reabrir.',
      'Exportaciones, copia/restauración del espacio de trabajo y protección de la carpeta mediante archivos reales.',
      'Bloqueo de Vault para secretos; Admin & Policy sigue desactivado hasta que las políticas se apliquen de verdad.',
    ],
    limitsTitle: 'Lo que falta o está limitado',
    limits: [
      'Sin sincronización en la nube, sin colaboración en tiempo real y sin asistente de IA.',
      'Edición de PDF, Connect, Automate y otros módulos son solo vista previa o están limitados.',
      'Sin actualización automática; el instalador aún no está firmado.',
      'Algunos temas, animaciones y formatos de importación están incompletos.',
    ],
    errorsTitle: 'Pueden producirse errores',
    errorsBody: 'Alpha 0.1 puede contener errores y no es apta para datos críticos sin tu propia copia de seguridad. Crea copias del espacio de trabajo con regularidad y comunica los problemas. No hay compromiso de soporte ni de disponibilidad.',
    supportTitle: 'Desarrollo independiente',
    supportBody: 'Astraea Workspace lo desarrolla un único desarrollador con ayuda de IA. Si quieres apoyar la alfa voluntariamente, las opciones están aquí y más tarde en Ajustes.',
  },
  'it-IT': {
    eyebrow: 'Alpha 0.1 · stato reale',
    title: 'Questa versione è un’alfa.',
    body: 'È la prima build pubblica ed è pensata per i test. Lavora solo con dati di cui hai un tuo backup.',
    worksTitle: 'Cosa funziona già',
    works: [
      'Documenti cifrati localmente in Writer, Grid, Present, Notes e Tasks, incluso salvataggio e riapertura.',
      'Esportazioni, backup/ripristino del workspace e messa in sicurezza della cartella tramite file reali.',
      'Blocco Vault per i segreti; Admin & Policy resta disattivato finché le policy non saranno realmente applicate.',
    ],
    limitsTitle: 'Cosa manca o è limitato',
    limits: [
      'Nessuna sincronizzazione cloud, collaborazione in tempo reale o assistente IA.',
      'Modifica PDF, Connect, Automate e altri moduli sono solo anteprima o volutamente limitati.',
      'Nessun aggiornamento automatico; l’installer non è ancora firmato.',
      'Alcuni temi, animazioni e formati di importazione sono incompleti.',
    ],
    errorsTitle: 'Sono possibili errori',
    errorsBody: 'Alpha 0.1 può contenere errori e non è adatta a dati critici senza un tuo backup. Crea regolarmente un backup del workspace e segnala i problemi. Non vi è alcun impegno di supporto o disponibilità.',
    supportTitle: 'Sviluppo indipendente',
    supportBody: 'Astraea Workspace è sviluppato da un singolo sviluppatore con supporto IA. Se vuoi sostenere l’alfa volontariamente, le opzioni sono qui e più tardi nelle Impostazioni.',
  },
  'ja-JP': {
    eyebrow: 'Alpha 0.1 · 正直な状態',
    title: 'このバージョンはアルファです。',
    body: '最初の公開ビルドであり、テスト用です。必ず自分でバックアップを取ったデータのみで作業してください。',
    worksTitle: 'すでに動作するもの',
    works: [
      'Writer・Grid・Present・Notes・Tasks のローカル暗号化ドキュメント（保存と再オープンを含む）。',
      'エクスポート、ワークスペースのバックアップ/復元、実ファイルによるワークスペースフォルダーの保護。',
      '秘密情報の Vault ロック。Admin & Policy はポリシーが実際に強制されるまで意図的に無効です。',
    ],
    limitsTitle: '不足している、または制限されているもの',
    limits: [
      'クラウド同期、リアルタイム共同編集、AI アシスタントはありません。',
      'PDF 編集、Connect、Automate などのモジュールはプレビューのみ、または意図的に制限されています。',
      '自動更新はありません。インストーラーはまだ署名されていません。',
      '一部のテーマ、アニメーション、インポート形式は未完成です。',
    ],
    errorsTitle: 'エラーが発生する可能性があります',
    errorsBody: 'Alpha 0.1 にはエラーが含まれる可能性があり、独自のバックアップなしで重要なデータに使用するべきではありません。定期的にワークスペースのバックアップを作成し、問題を報告してください。サポートや可用性の保証はありません。',
    supportTitle: '個人開発',
    supportBody: 'Astraea Workspace は一人の開発者が AI 支援を受けて開発しています。アルファを任意で支援したい場合、ここおよび後で設定に方法があります。',
  },
  'ru-RU': {
    eyebrow: 'Alpha 0.1 · честный статус',
    title: 'Эта версия — альфа.',
    body: 'Это первая публичная сборка, предназначенная для тестирования. Работайте только с данными, для которых у вас есть собственная резервная копия.',
    worksTitle: 'Что уже работает',
    works: [
      'Локально зашифрованные документы в Writer, Grid, Present, Notes и Tasks, включая сохранение и повторное открытие.',
      'Экспорт, резервное копирование/восстановление workspace и защита папки через реальные файлы.',
      'Блокировка Vault для секретов; Admin & Policy намеренно отключён до реального применения политик.',
    ],
    limitsTitle: 'Чего нет или что ограничено',
    limits: [
      'Нет облачной синхронизации, совместной работы в реальном времени и ИИ-ассистента.',
      'Редактирование PDF, Connect, Automate и другие модули — только предпросмотр или намеренно ограничены.',
      'Нет автообновления; установщик пока не подписан.',
      'Некоторые темы, анимации и форматы импорта не завершены.',
    ],
    errorsTitle: 'Возможны ошибки',
    errorsBody: 'Alpha 0.1 может содержать ошибки и не подходит для критических данных без собственной резервной копии. Регулярно создавайте резервную копию workspace и сообщайте о проблемах. Гарантий поддержки или доступности нет.',
    supportTitle: 'Независимая разработка',
    supportBody: 'Astraea Workspace разрабатывает один разработчик с помощью ИИ. Если вы хотите добровольно поддержать альфу, возможности есть здесь и позже в настройках.',
  },
  'zh-CN': {
    eyebrow: 'Alpha 0.1 · 诚实状态',
    title: '这个版本是 Alpha。',
    body: '这是首个公开构建，用于测试。请只使用你有自己备份的数据。',
    worksTitle: '已经可用的功能',
    works: [
      'Writer、Grid、Present、Notes 和 Tasks 的本地加密文档，包括保存和重新打开。',
      '导出、工作区备份/恢复，以及通过真实文件保护工作区文件夹。',
      '用于秘密的 Vault 锁定；在策略真正执行之前，Admin & Policy 保持禁用。',
    ],
    limitsTitle: '缺失或受限的功能',
    limits: [
      '没有云同步、实时协作和 AI 助手。',
      'PDF 编辑、Connect、Automate 和其他模块仅为预览或有意受限。',
      '没有自动更新；安装程序尚未签名。',
      '部分主题、动画和导入格式尚不完整。',
    ],
    errorsTitle: '可能出现错误',
    errorsBody: 'Alpha 0.1 可能包含错误，不适合在没有自己备份的情况下处理关键数据。请定期创建工作区备份并报告问题。不提供支持或可用性承诺。',
    supportTitle: '独立开发',
    supportBody: 'Astraea Workspace 由一位开发者在 AI 辅助下构建。如果你想自愿支持 Alpha，可在此处以及稍后的设置中找到方式。',
  },
};
